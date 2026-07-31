import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseCSVLine(linha) {
  const colunas = []
  let atual = ''
  let dentroDeAspas = false

  for (let i = 0; i < linha.length; i++) {
    const char = linha[i]
    if (char === '"') {
      dentroDeAspas = !dentroDeAspas
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

function descobrirEdicaoBase(siglaLiga) {
  const sigla = siglaLiga.toLowerCase()
  const variantesLTC = ['ltc', 'pltc', 'asltc', 'srltc', 'bhltc', 'bltc', 'bsltc', 'ssltc', 'tltc', 'sltc', 'sfltc', 'rrltc', 'vltc']
  return variantesLTC.includes(sigla) ? 'LTC' : 'LTR'
}

async function mesclarBackupComCSV() {
  try {
    const caminhoBackup = path.join(__dirname, 'data copy.json')
    const caminhoNovo = path.join(__dirname, 'data.json')

    // 1. Carrega o Backup (Sua fonte da verdade, com as suas quantidades e os "Faltam")
    let backupCartas = []
    try {
      const jsonRaw = await fs.readFile(caminhoBackup, 'utf-8')
      backupCartas = JSON.parse(jsonRaw)
    } catch (e) {
      console.error("❌ Erro: Não encontrei o arquivo 'data copy.json'. Certifique-se de que ele está na pasta do projeto.")
      return
    }

    // 2. Acha ESPECIFICAMENTE o arquivo CSV exportado da LigaMagic
    const arquivos = await fs.readdir(__dirname)
    const nomeArquivoCSV = arquivos.find(arq => arq.toLowerCase().startsWith('export_') && arq.toLowerCase().endsWith('.csv'))

    let csvData = []
    if (nomeArquivoCSV) {
      console.log(`Lendo o CSV correto da LigaMagic: ${nomeArquivoCSV}...`)
      const caminhoCSV = path.join(__dirname, nomeArquivoCSV)
      const conteudo = await fs.readFile(caminhoCSV, 'utf-8')
      const linhas = conteudo.split(/\r?\n/)

      for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i].trim()
        if (!linha) continue
        const colunas = parseCSVLine(linha)

        // Proteção: Só lê se for a tabela completa da LigaMagic
        if (colunas[2] === 'Edicao (Sigla)' || colunas.length < 12) continue

        const siglaLiga = colunas[2].toUpperCase() // POLTR, BHLTC, etc
        const numeroRaw = colunas[11] ? colunas[11].replace(/['"]/g, '').trim() : '0'
        const edicaoBase = descobrirEdicaoBase(siglaLiga) // LTR ou LTC para as imagens

        csvData.push({
          siglaLiga,
          edicaoBase,
          numeroRaw
        })
      }
      console.log(`🔍 Foram mapeadas ${csvData.length} cartas com siglas especiais no CSV. Cruzando dados...`)
    } else {
      console.log('⚠️ Nenhum CSV com o nome "export_*.csv" foi encontrado! Nenhuma sigla será atualizada.')
    }

    // 3. Processa e mescla os dados preservando as suas quantidades
    let acertos = 0
    const cartasFinais = backupCartas.map(carta => {
      // Identifica a base LTR/LTC original da carta no backup
      const baseAtual = carta.edicaoBase || carta.edicao
      const numeroAtual = carta.numero.toString().replace(/\D/g, '') // Tira letras se houver para cruzar

      // Tenta achar se no CSV da Liga existe uma versão especial (POLTR, etc) para este número exato
      const matchCSV = csvData.find(c => c.edicaoBase === baseAtual && parseInt(c.numeroRaw, 10) === parseInt(numeroAtual, 10))

      let siglaCorreta = baseAtual
      if (matchCSV) {
        siglaCorreta = matchCSV.siglaLiga
        acertos++
      }

      return {
        ...carta,
        edicao: siglaCorreta, // Atualiza para POLTR se achou, senão mantém LTR/LTC normal
        edicaoBase: baseAtual, // Trava a base LTR/LTC para o JavaScript achar a imagem na sua pasta
        quantidade: carta.quantidade // INTOCÁVEL - Mantém sua lista antiga exata
      }
    })

    console.log(`🎯 ${acertos} cartas do seu backup tiveram as siglas atualizadas com sucesso!`)

    // 4. Ordenação rigorosa para o Fichário Físico (Todas as LTR primeiro, Todas as LTC depois, ordenadas numericamente)
    cartasFinais.sort((a, b) => {
      const baseA = a.edicaoBase
      const baseB = b.edicaoBase

      if (baseA !== baseB) {
        if (baseA === 'LTR') return -1
        if (baseB === 'LTR') return 1
        return baseA.localeCompare(baseB)
      }

      const numA = parseInt(a.numero.toString().replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.numero.toString().replace(/\D/g, ''), 10) || 0

      return numA - numB
    })

    await fs.writeFile(caminhoNovo, JSON.stringify(cartasFinais, null, 2))
    console.log(`✅ Fichário finalizado! 'data.json' criado com quantidades e divisórias perfeitas.`)

  } catch (error) {
    console.error('❌ Erro na execução:', error.message)
  }
}

mesclarBackupComCSV()