import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * CONFIGURAÇÃO DA COLEÇÃO
 * Gera a lista inicial de uma coleção nova direto do Scryfall (quantidade 0 pra todas).
 * Ideal pra sets que você ainda não começou a colecionar fisicamente.
 *
 * Pra outra coleção, troque esses valores ou use os argumentos de linha de comando.
 */
const CONFIG_PADRAO = {
  slug: 'hobbit',
  nome: 'O Hobbit (HOB/HOC)',
  query: '(set:hob or set:hoc) include:extras unique:prints',
  edicoesBase: ['HOB', 'HOC']
}

const SLUG_REGEX = /^[a-z0-9-]+$/
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function lerArgumentos() {
  const args = process.argv.slice(2)
  const opcoes = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug') opcoes.slug = args[++i]
    else if (args[i] === '--nome') opcoes.nome = args[++i]
    else if (args[i] === '--query') opcoes.query = args[++i]
    else if (args[i] === '--edicoes') opcoes.edicoesBase = args[++i].split(',').map(s => s.trim().toUpperCase())
  }

  return opcoes
}

function validarConfig(config) {
  if (!config.slug || !SLUG_REGEX.test(config.slug)) {
    throw new Error('"slug" precisa conter só letras minúsculas, números e hífen.')
  }
  if (!config.nome) throw new Error('"nome" é obrigatório.')
  if (!config.query) throw new Error('"query" é obrigatória.')
  if (!Array.isArray(config.edicoesBase) || config.edicoesBase.length === 0) {
    throw new Error('"edicoesBase" precisa ser uma lista com pelo menos uma edição.')
  }
}

// Busca todas as páginas de resultado no Scryfall, respeitando o rate limit recomendado
async function buscarTodasAsCartas(query) {
  const cartas = []
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=set&unique=prints`
  let pagina = 1

  while (url) {
    console.log(`Buscando página ${pagina} no Scryfall...`)
    const resposta = await fetch(url, {
      headers: { 'User-Agent': 'Guff/1.0 (gerenciador de colecao pessoal)', 'Accept': 'application/json' }
    })

    if (resposta.status === 404) {
      const corpo = await resposta.json().catch(() => ({}))
      throw new Error(corpo.details || 'Nenhuma carta encontrada para essa busca.')
    }
    if (!resposta.ok) {
      throw new Error(`Scryfall respondeu HTTP ${resposta.status}`)
    }

    const dados = await resposta.json()
    if (!Array.isArray(dados.data)) {
      throw new Error('Resposta inesperada do Scryfall (campo "data" ausente).')
    }

    cartas.push(...dados.data)
    url = dados.has_more ? dados.next_page : null
    pagina++

    if (url) await esperar(100) // Scryfall pede ~50-100ms entre requisições
  }

  return cartas
}

function converterParaFormatoGuff(cartasScryfall) {
  return cartasScryfall
    .filter(carta => carta && carta.set && carta.collector_number)
    .map(carta => {
      const edicaoBase = carta.set.toUpperCase()
      return {
        id: `${edicaoBase}-${carta.collector_number}-${carta.id}`,
        nome: carta.name,
        edicao: edicaoBase,
        numero: carta.collector_number,
        quantidade: 0,
        foil: false,
        edicaoBase,
        tratamento: 'normal'
      }
    })
}

async function backupArquivoExistente(caminho) {
  try {
    await fs.access(caminho)
  } catch {
    return
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const caminhoBackup = caminho.replace(/\.json$/, `.backup-${timestamp}.json`)
  await fs.copyFile(caminho, caminhoBackup)
  console.log(`🗂️  Backup do arquivo anterior salvo em: ${path.basename(caminhoBackup)}`)
}

async function upsertColecao(config, caminhoColecoes) {
  let registro = []
  try {
    const raw = await fs.readFile(caminhoColecoes, 'utf-8')
    const parseado = JSON.parse(raw)
    if (Array.isArray(parseado)) registro = parseado
  } catch {
    // ainda não existe, começa do zero
  }

  const entrada = { slug: config.slug, nome: config.nome, edicoesBase: config.edicoesBase }
  const index = registro.findIndex(c => c.slug === config.slug)
  if (index === -1) registro.push(entrada)
  else registro[index] = { ...registro[index], ...entrada }

  await fs.mkdir(path.dirname(caminhoColecoes), { recursive: true })
  await fs.writeFile(caminhoColecoes, JSON.stringify(registro, null, 2))
  console.log(`📚 Coleção "${config.slug}" registrada em ${path.basename(caminhoColecoes)}`)
}

async function gerarColecaoInicial() {
  let config
  try {
    config = { ...CONFIG_PADRAO, ...lerArgumentos() }
    validarConfig(config)
  } catch (e) {
    console.error(`❌ ${e.message}`)
    return
  }

  try {
    console.log(`Consultando Scryfall: ${config.query}`)
    const cartasScryfall = await buscarTodasAsCartas(config.query)

    if (cartasScryfall.length === 0) {
      console.error('❌ A busca não retornou nenhuma carta. Confira a query.')
      return
    }

    console.log(`🔍 ${cartasScryfall.length} impressões encontradas.`)

    const cartas = converterParaFormatoGuff(cartasScryfall)

    cartas.sort((a, b) => {
      if (a.edicaoBase !== b.edicaoBase) {
        const idxA = config.edicoesBase.indexOf(a.edicaoBase)
        const idxB = config.edicoesBase.indexOf(b.edicaoBase)
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        return a.edicaoBase.localeCompare(b.edicaoBase)
      }
      const numA = parseInt(a.numero.toString().replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.numero.toString().replace(/\D/g, ''), 10) || 0
      return numA - numB
    })

    const caminhoSaida = path.join(__dirname, 'data', `${config.slug}.json`)
    const caminhoColecoes = path.join(__dirname, 'data', 'colecoes.json')

    await fs.mkdir(path.dirname(caminhoSaida), { recursive: true })
    await backupArquivoExistente(caminhoSaida)
    await fs.writeFile(caminhoSaida, JSON.stringify(cartas, null, 2))
    console.log(`✅ 'data/${config.slug}.json' criado com ${cartas.length} cartas (quantidade inicial: 0).`)

    await upsertColecao(config, caminhoColecoes)

  } catch (error) {
    console.error('❌ Erro na execução:', error.message)
  }
}

gerarColecaoInicial()