import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG_PADRAO = {
  colecao: 'ltr-ltc', // usado pra achar data/<colecao>.json e public/cartas/<colecao>/
  delayMs: 150,
  maxTentativas: 3
}

const SLUG_REGEX = /^[a-z0-9-]+$/
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function lerArgumentos() {
  const args = process.argv.slice(2)
  const opcoes = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--colecao') opcoes.colecao = args[++i]
    else if (args[i] === '--dados') opcoes.arquivoDados = args[++i]
    else if (args[i] === '--pasta') opcoes.pastaImagens = args[++i]
    else if (args[i] === '--delay') opcoes.delayMs = Number(args[++i])
    else if (args[i] === '--tentativas') opcoes.maxTentativas = Number(args[++i])
  }

  return opcoes
}

async function baixarComRetry(url, maxTentativas) {
  let ultimaFalha = 'falha desconhecida'

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const resposta = await fetch(url, {
        headers: { 'User-Agent': 'Guff/1.0 (gerenciador de colecao pessoal)', 'Accept': '*/*' }
      })

      if (resposta.status === 429) {
        console.warn(`⏳ Rate limit do Scryfall, aguardando antes de tentar de novo (tentativa ${tentativa}/${maxTentativas})...`)
        await esperar(2000 * tentativa)
        continue
      }

      if (!resposta.ok) {
        return { ok: false, motivo: `HTTP ${resposta.status}` }
      }

      const contentType = resposta.headers.get('content-type') || ''
      if (!contentType.startsWith('image/')) {
        return { ok: false, motivo: `resposta não é uma imagem (${contentType || 'sem content-type'})` }
      }

      const arrayBuffer = await resposta.arrayBuffer()
      return { ok: true, buffer: Buffer.from(arrayBuffer) }
    } catch (erro) {
      ultimaFalha = erro.message
      await esperar(500 * tentativa)
    }
  }

  return { ok: false, motivo: ultimaFalha }
}

async function baixarImagens() {
  const config = { ...CONFIG_PADRAO, ...lerArgumentos() }

  if (!config.colecao || !SLUG_REGEX.test(config.colecao)) {
    console.error('❌ "--colecao" precisa ser um slug válido (letras minúsculas, números, hífen).')
    return
  }
  if (!Number.isFinite(config.delayMs) || config.delayMs < 0) {
    console.error('❌ "--delay" precisa ser um número >= 0')
    return
  }
  if (!Number.isInteger(config.maxTentativas) || config.maxTentativas < 1) {
    console.error('❌ "--tentativas" precisa ser um número inteiro >= 1')
    return
  }

  const arquivoDadosPadrao = path.join('data', `${config.colecao}.json`)
  const pastaImagensPadrao = path.join('public', 'cartas', config.colecao)

  const caminhoDados = path.isAbsolute(config.arquivoDados || '')
    ? config.arquivoDados
    : path.join(__dirname, config.arquivoDados || arquivoDadosPadrao)

  const pastaImagens = path.isAbsolute(config.pastaImagens || '')
    ? config.pastaImagens
    : path.join(__dirname, config.pastaImagens || pastaImagensPadrao)

  try {
    await fs.mkdir(pastaImagens, { recursive: true })
  } catch (erro) {
    console.error('❌ Erro ao criar pasta de imagens:', erro.message)
    return
  }

  let cartas
  try {
    const dados = await fs.readFile(caminhoDados, 'utf8')
    cartas = JSON.parse(dados)
  } catch (erro) {
    console.error(`❌ Erro ao ler '${caminhoDados}': ${erro.message}`)
    return
  }

  if (!Array.isArray(cartas)) {
    console.error(`❌ Erro: '${caminhoDados}' não contém uma lista de cartas válida.`)
    return
  }

  console.log(`Iniciando o download de até ${cartas.length} imagens para "${config.colecao}"...`)

  let baixadas = 0
  let existentes = 0
  let falhas = 0

  for (let i = 0; i < cartas.length; i++) {
    const carta = cartas[i]
    const prefixo = `[${i + 1}/${cartas.length}]`

    const edicaoParaUrl = carta && (carta.edicaoBase || carta.edicao)
    if (!edicaoParaUrl || !carta.numero) {
      console.warn(`${prefixo} ⚠️  Carta ignorada (sem edição ou número): ${carta && (carta.nome || carta.id) || '??'}`)
      falhas++
      continue
    }

    const edicaoUrl = edicaoParaUrl.toLowerCase()
    const nomeArquivo = `${edicaoUrl}-${carta.numero}.jpg`
    const caminhoDestino = path.join(pastaImagens, nomeArquivo)

    try {
      await fs.access(caminhoDestino)
      existentes++
      continue
    } catch {
      // arquivo não existe, segue para o download
    }

    const urlScryfall = `https://api.scryfall.com/cards/${edicaoUrl}/${carta.numero}?format=image&version=large`
    console.log(`${prefixo} Baixando: ${nomeArquivo}...`)

    const resultado = await baixarComRetry(urlScryfall, config.maxTentativas)

    if (resultado.ok) {
      await fs.writeFile(caminhoDestino, resultado.buffer)
      baixadas++
    } else {
      console.error(`${prefixo} ❌ Falha ao baixar ${nomeArquivo}: ${resultado.motivo}`)
      falhas++
    }

    await esperar(config.delayMs)
  }

  console.log(`✅ Concluído! ${baixadas} baixadas, ${existentes} já existiam, ${falhas} falharam.`)
}

baixarImagens()