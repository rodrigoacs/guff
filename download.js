import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Função para pausar a execução e evitar bloqueio de IP no Scryfall
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function baixarImagens() {
  const arquivoDados = path.join(__dirname, 'data copy.json')
  const pastaImagens = path.join(__dirname, 'public', 'cartas')

  // Cria a pasta public/cartas se ela não existir
  try {
    await fs.mkdir(pastaImagens, { recursive: true })
  } catch (erro) {
    console.error('Erro ao criar pasta de imagens:', erro)
    return
  }

  try {
    const dados = await fs.readFile(arquivoDados, 'utf8')
    const cartas = JSON.parse(dados)

    console.log(`Iniciando o download de ${cartas.length} imagens... Isso pode levar alguns minutos.`)

    for (let i = 0; i < cartas.length; i++) {
      const carta = cartas[i]
      const edicaoUrl = carta.edicao.toLowerCase()
      const nomeArquivo = `${edicaoUrl}-${carta.numero}.jpg`
      const caminhoDestino = path.join(pastaImagens, nomeArquivo)

      // Verifica se a imagem já foi baixada antes para não baixar duplicado
      try {
        await fs.access(caminhoDestino)
        console.log(`[${i + 1}/${cartas.length}] Já existe: ${nomeArquivo}`)
        continue
      } catch (e) {
        // Se der erro no access, o arquivo não existe, então seguimos para o download
      }

      const urlScryfall = `https://api.scryfall.com/cards/${edicaoUrl}/${carta.numero}?format=image&version=large`

      try {
        console.log(`[${i + 1}/${cartas.length}] Baixando: ${nomeArquivo}...`)

        // Usamos o fetch nativo do Node.js
        const resposta = await fetch(urlScryfall)

        if (!resposta.ok) {
          console.error(`❌ Erro 404: Imagem não encontrada no Scryfall para ${nomeArquivo}`)
          continue
        }

        // Converte a resposta em um buffer e salva no disco
        const arrayBuffer = await resposta.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        await fs.writeFile(caminhoDestino, buffer)

        // Espera 150ms para respeitar o rate limit do Scryfall e não tomar ban
        await esperar(150)

      } catch (erroDownload) {
        console.error(`❌ Falha na conexão ao baixar ${nomeArquivo}:`, erroDownload.message)
      }
    }

    console.log('✅ Todos os downloads foram concluídos!')

  } catch (erro) {
    console.error('Erro ao ler o data.json:', erro)
  }
}

baixarImagens()