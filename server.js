import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const DATA_DIR = path.join(__dirname, 'data')
const COLECOES_FILE = path.join(DATA_DIR, 'colecoes.json')
const TRATAMENTOS_VALIDOS = ['normal', 'foil', 'etched']
// Só permite slugs simples (letras minúsculas, números, hífen) — evita path traversal
// tipo slug = "../../etc/passwd" sendo usado para montar um caminho de arquivo.
const SLUG_REGEX = /^[a-z0-9-]+$/

app.use(express.json())

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Corpo da requisição não é um JSON válido' })
  }
  next(err)
})

app.use(express.static(path.join(__dirname, 'public')))

// --- Fila de escrita por coleção, para evitar corromper um data/<slug>.json com escritas concorrentes ---
const filasDeEscrita = new Map()
function comFilaDeEscrita(slug, tarefa) {
  const filaAtual = filasDeEscrita.get(slug) || Promise.resolve()
  const resultado = filaAtual.then(tarefa, tarefa)
  filasDeEscrita.set(slug, resultado.then(() => { }, () => { }))
  return resultado
}

async function lerColecoes() {
  let conteudo
  try {
    conteudo = await fs.readFile(COLECOES_FILE, 'utf8')
  } catch (erro) {
    if (erro.code === 'ENOENT') {
      throw new Error(`Registro de coleções não encontrado em ${COLECOES_FILE}`)
    }
    throw new Error(`Falha ao ler o registro de coleções: ${erro.message}`)
  }

  let colecoes
  try {
    colecoes = JSON.parse(conteudo)
  } catch (erro) {
    throw new Error(`Registro de coleções corrompido (JSON inválido): ${erro.message}`)
  }

  if (!Array.isArray(colecoes)) {
    throw new Error('Registro de coleções corrompido: era esperado um array')
  }

  return colecoes
}

// Valida o formato do slug e confere se ele existe de fato no registro
async function resolverColecao(slugBruto) {
  if (typeof slugBruto !== 'string' || !SLUG_REGEX.test(slugBruto)) {
    throw Object.assign(new Error('Slug de coleção inválido'), { status: 400 })
  }

  const colecoes = await lerColecoes()
  const colecao = colecoes.find(c => c.slug === slugBruto)

  if (!colecao) {
    throw Object.assign(new Error('Coleção não encontrada'), { status: 404 })
  }

  return colecao
}

function arquivoDaColecao(slug) {
  return path.join(DATA_DIR, `${slug}.json`)
}

async function lerCartas(slug) {
  const arquivo = arquivoDaColecao(slug)
  let conteudo
  try {
    conteudo = await fs.readFile(arquivo, 'utf8')
  } catch (erro) {
    if (erro.code === 'ENOENT') {
      throw new Error(`Arquivo de dados da coleção não encontrado em ${arquivo}`)
    }
    throw new Error(`Falha ao ler os dados da coleção: ${erro.message}`)
  }

  let cartas
  try {
    cartas = JSON.parse(conteudo)
  } catch (erro) {
    throw new Error(`Dados da coleção corrompidos (JSON inválido): ${erro.message}`)
  }

  if (!Array.isArray(cartas)) {
    throw new Error('Dados da coleção corrompidos: era esperado um array de cartas')
  }

  return cartas
}

async function salvarCartas(slug, cartas) {
  await fs.writeFile(arquivoDaColecao(slug), JSON.stringify(cartas, null, 2))
}

// Listar coleções disponíveis, com contadores de progresso
app.get('/api/colecoes', async (req, res) => {
  try {
    const colecoes = await lerColecoes()

    const resultado = await Promise.all(colecoes.map(async (colecao) => {
      try {
        const cartas = await lerCartas(colecao.slug)
        const total = cartas.length
        const coletadas = cartas.filter(c => c.quantidade > 0).length
        return { ...colecao, total, coletadas }
      } catch (erro) {
        console.error(`Erro ao ler dados da coleção "${colecao.slug}":`, erro.message)
        return { ...colecao, total: 0, coletadas: 0, erro: 'Não foi possível carregar os dados desta coleção' }
      }
    }))

    res.json(resultado)
  } catch (erro) {
    console.error('Erro ao listar coleções:', erro.message)
    res.status(500).json({ error: 'Erro ao listar coleções' })
  }
})

// Buscar todas as cartas de uma coleção
app.get('/api/colecoes/:slug/cartas', async (req, res) => {
  try {
    const colecao = await resolverColecao(req.params.slug)
    const cartas = await lerCartas(colecao.slug)
    res.json(cartas)
  } catch (erro) {
    const status = erro.status || 500
    if (status === 500) console.error('Erro ao ler os dados:', erro.message)
    res.status(status).json({ error: erro.message || 'Erro ao ler os dados' })
  }
})

// Atualizar a quantidade ou o tratamento de uma carta dentro de uma coleção
app.patch('/api/colecoes/:slug/cartas/:id', async (req, res) => {
  const { id } = req.params
  const { delta, tratamento } = req.body || {}

  if (!id) {
    return res.status(400).json({ error: 'Id da carta é obrigatório' })
  }
  if (delta !== undefined && !Number.isInteger(delta)) {
    return res.status(400).json({ error: '"delta" precisa ser um número inteiro' })
  }
  if (tratamento !== undefined && !TRATAMENTOS_VALIDOS.includes(tratamento)) {
    return res.status(400).json({ error: `"tratamento" precisa ser um dos: ${TRATAMENTOS_VALIDOS.join(', ')}` })
  }
  if (delta === undefined && tratamento === undefined) {
    return res.status(400).json({ error: 'Envie "delta" e/ou "tratamento" para atualizar a carta' })
  }

  try {
    const colecao = await resolverColecao(req.params.slug)

    const cartaAtualizada = await comFilaDeEscrita(colecao.slug, async () => {
      const cartas = await lerCartas(colecao.slug)
      const index = cartas.findIndex(c => c.id === id)

      if (index === -1) {
        throw Object.assign(new Error('Carta não encontrada'), { status: 404 })
      }

      if (delta !== undefined) {
        cartas[index].quantidade = Math.max(0, (cartas[index].quantidade || 0) + delta)
      }
      if (tratamento !== undefined) {
        cartas[index].tratamento = tratamento
      }

      await salvarCartas(colecao.slug, cartas)
      return cartas[index]
    })

    res.json(cartaAtualizada)
  } catch (erro) {
    const status = erro.status || 500
    if (status === 500) console.error('Erro ao atualizar a carta:', erro.message)
    res.status(status).json({ error: erro.message || 'Erro ao atualizar a carta' })
  }
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' })
})

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})