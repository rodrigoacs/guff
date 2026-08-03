import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG_PADRAO = {
  slug: 'ltr-ltc',
  nome: 'O Senhor dos Anéis (LTR/LTC)',
  edicoesBase: ['LTR', 'LTC'],
  cor: '#E5C07B',
  siglasPorEdicao: {
    LTC: ['ltc', 'pltc', 'asltc', 'srltc', 'bhltc', 'bltc', 'bsltc', 'ssltc', 'tltc', 'sltc', 'sfltc', 'rrltc', 'vltc']
  },
  arquivoBackup: 'data copy.json'
}

const SLUG_REGEX = /^[a-z0-9-]+$/

function lerArgumentos() {
  const args = process.argv.slice(2)
  const opcoes = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug') opcoes.slug = args[++i]
    else if (args[i] === '--nome') opcoes.nome = args[++i]
    else if (args[i] === '--backup') opcoes.arquivoBackup = args[++i]
    else if (args[i] === '--config') opcoes.arquivoConfig = args[++i]
    else if (args[i] === '--cor') opcoes.cor = args[++i]
  }

  return opcoes
}

function validarConfig(config) {
  if (!config.slug || !SLUG_REGEX.test(config.slug)) {
    throw new Error('Config inválida: "slug" precisa conter só letras minúsculas, números e hífen.')
  }
  if (!config.nome) {
    throw new Error('Config inválida: "nome" é obrigatório.')
  }
  if (!Array.isArray(config.edicoesBase) || config.edicoesBase.length === 0) {
    throw new Error('Config inválida: "edicoesBase" precisa ser uma lista com pelo menos uma edição.')
  }
  if (typeof config.siglasPorEdicao !== 'object' || config.siglasPorEdicao === null) {
    throw new Error('Config inválida: "siglasPorEdicao" precisa ser um objeto.')
  }
  if (!config.arquivoBackup) {
    throw new Error('Config inválida: "arquivoBackup" é obrigatório.')
  }
}

async function carregarConfig(opcoes) {
  let config = { ...CONFIG_PADRAO }

  if (opcoes.arquivoConfig) {
    const caminhoConfig = path.isAbsolute(opcoes.arquivoConfig)
      ? opcoes.arquivoConfig
      : path.join(__dirname, opcoes.arquivoConfig)

    try {
      const raw = await fs.readFile(caminhoConfig, 'utf-8')
      config = { ...config, ...JSON.parse(raw) }
    } catch (e) {
      throw new Error(`Não foi possível carregar o arquivo de config '${opcoes.arquivoConfig}': ${e.message}`)
    }
  }

  if (opcoes.slug) config.slug = opcoes.slug
  if (opcoes.nome) config.nome = opcoes.nome
  if (opcoes.arquivoBackup) config.arquivoBackup = opcoes.arquivoBackup
  if (opcoes.cor) config.cor = opcoes.cor

  validarConfig(config)
  return config
}

// Parser de CSV simples, com suporte a aspas escapadas ("") dentro de campo entre aspas
function parseCSVLine(linha) {
  const colunas = []
  let atual = ''
  let dentroDeAspas = false

  for (let i = 0; i < linha.length; i++) {
    const char = linha[i]

    if (char === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else {
        dentroDeAspas = !dentroDeAspas
      }
    } else if (char === ',' && !dentroDeAspas) {
      colunas.push(atual.trim())
      atual = ''
    } else {
      atual += char
    }
  }
  colunas.push(atual.trim())
  return colunas
}

function descobrirEdicaoBase(siglaLiga, config) {
  const sigla = siglaLiga.toLowerCase()

  for (const edicao of config.edicoesBase) {
    const variantes = config.siglasPorEdicao[edicao] || []
    if (variantes.includes(sigla)) return edicao
  }

  return config.edicoesBase[0]
}

function validarCartasDoBackup(backupCartas) {
  if (!Array.isArray(backupCartas)) {
    throw new Error('O arquivo de backup não contém uma lista de cartas válida (esperado um array JSON).')
  }

  const cartasValidas = []
  for (const carta of backupCartas) {
    if (!carta || typeof carta !== 'object' || carta.numero === undefined || carta.numero === null || carta.numero === '') {
      console.warn(`⚠️  Carta ignorada por estar incompleta (faltando "numero"): ${JSON.stringify(carta)}`)
      continue
    }
    cartasValidas.push(carta)
  }

  return cartasValidas
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

// Cria ou atualiza a entrada dessa coleção em data/colecoes.json
async function upsertColecao(config, caminhoColecoes) {
  let registro = []
  try {
    const raw = await fs.readFile(caminhoColecoes, 'utf-8')
    const parseado = JSON.parse(raw)
    if (Array.isArray(parseado)) registro = parseado
  } catch {
    // arquivo ainda não existe ou está vazio — começa do zero
  }

  const entrada = { slug: config.slug, nome: config.nome, edicoesBase: config.edicoesBase, cor: config.cor }
  const index = registro.findIndex(c => c.slug === config.slug)

  if (index === -1) registro.push(entrada)
  else registro[index] = { ...registro[index], ...entrada }

  await fs.mkdir(path.dirname(caminhoColecoes), { recursive: true })
  await fs.writeFile(caminhoColecoes, JSON.stringify(registro, null, 2))
  console.log(`📚 Coleção "${config.slug}" registrada em ${path.basename(caminhoColecoes)}`)
}

async function mesclarBackupComCSV() {
  let config
  try {
    config = await carregarConfig(lerArgumentos())
  } catch (e) {
    console.error(`❌ ${e.message}`)
    return
  }

  try {
    const caminhoBackup = path.isAbsolute(config.arquivoBackup) ? config.arquivoBackup : path.join(__dirname, config.arquivoBackup)
    const caminhoNovo = path.join(__dirname, 'data', `${config.slug}.json`)
    const caminhoColecoes = path.join(__dirname, 'data', 'colecoes.json')

    let backupCartas
    try {
      const jsonRaw = await fs.readFile(caminhoBackup, 'utf-8')
      backupCartas = validarCartasDoBackup(JSON.parse(jsonRaw))
    } catch (e) {
      console.error(`❌ Erro ao carregar '${config.arquivoBackup}': ${e.message}`)
      return
    }

    if (backupCartas.length === 0) {
      console.error('❌ Nenhuma carta válida encontrada no arquivo de backup. Nada a fazer.')
      return
    }

    const arquivos = await fs.readdir(__dirname)
    const nomeArquivoCSV = arquivos.find(arq => arq.toLowerCase().startsWith('export_') && arq.toLowerCase().endsWith('.csv'))

    let csvData = []
    if (nomeArquivoCSV) {
      console.log(`Lendo o CSV da LigaMagic: ${nomeArquivoCSV}...`)
      const caminhoCSV = path.join(__dirname, nomeArquivoCSV)
      const conteudo = await fs.readFile(caminhoCSV, 'utf-8')
      const linhas = conteudo.split(/\r?\n/)

      for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i].trim()
        if (!linha) continue
        const colunas = parseCSVLine(linha)

        if (colunas[2] === 'Edicao (Sigla)' || colunas.length < 12) continue

        const siglaLiga = colunas[2].toUpperCase()
        const numeroRaw = colunas[11] ? colunas[11].replace(/['"]/g, '').trim() : '0'
        const edicaoBase = descobrirEdicaoBase(siglaLiga, config)

        csvData.push({ siglaLiga, edicaoBase, numeroRaw })
      }
      console.log(`🔍 Foram mapeadas ${csvData.length} cartas com siglas especiais no CSV. Cruzando dados...`)
    } else {
      console.log('⚠️ Nenhum CSV com o nome "export_*.csv" foi encontrado! Nenhuma sigla será atualizada.')
    }

    let acertos = 0
    let semNumeroValido = 0
    const cartasFinais = backupCartas.map(carta => {
      const baseAtual = carta.edicaoBase || carta.edicao
      const numeroAtual = carta.numero.toString().replace(/\D/g, '')

      if (numeroAtual === '') {
        semNumeroValido++
        return { ...carta, edicao: baseAtual, edicaoBase: baseAtual }
      }

      const matchCSV = csvData.find(c => c.edicaoBase === baseAtual && parseInt(c.numeroRaw, 10) === parseInt(numeroAtual, 10))

      let siglaCorreta = baseAtual
      if (matchCSV) {
        siglaCorreta = matchCSV.siglaLiga
        acertos++
      }

      return { ...carta, edicao: siglaCorreta, edicaoBase: baseAtual, quantidade: carta.quantidade }
    })

    console.log(`🎯 ${acertos} cartas do backup tiveram as siglas atualizadas com sucesso!`)
    if (semNumeroValido > 0) {
      console.warn(`⚠️  ${semNumeroValido} cartas tinham número não numérico e não puderam ser cruzadas com o CSV.`)
    }

    cartasFinais.sort((a, b) => {
      const baseA = a.edicaoBase
      const baseB = b.edicaoBase

      if (baseA !== baseB) {
        const idxA = config.edicoesBase.indexOf(baseA)
        const idxB = config.edicoesBase.indexOf(baseB)
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        return baseA.localeCompare(baseB)
      }

      const numA = parseInt(a.numero.toString().replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.numero.toString().replace(/\D/g, ''), 10) || 0
      return numA - numB
    })

    await fs.mkdir(path.dirname(caminhoNovo), { recursive: true })
    await backupArquivoExistente(caminhoNovo)
    await fs.writeFile(caminhoNovo, JSON.stringify(cartasFinais, null, 2))
    console.log(`✅ Fichário finalizado! 'data/${config.slug}.json' criado com ${cartasFinais.length} cartas.`)

    await upsertColecao(config, caminhoColecoes)

  } catch (error) {
    console.error('❌ Erro na execução:', error.message)
  }
}

mesclarBackupComCSV()