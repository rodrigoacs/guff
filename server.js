import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const DATA_FILE = path.join(__dirname, 'data.json')

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// Buscar todas as cartas
app.get('/api/cartas', async (req, res) => {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8')
    res.json(JSON.parse(data))
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler os dados' })
  }
})

// Atualizar a quantidade ou o tratamento de uma carta
app.patch('/api/cartas/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { delta, tratamento } = req.body

    const data = await fs.readFile(DATA_FILE, 'utf8')
    let cartas = JSON.parse(data)

    const index = cartas.findIndex(c => c.id === id)
    if (index !== -1) {
      // Atualiza a quantidade se o delta for enviado
      if (delta !== undefined) {
        cartas[index].quantidade += delta
        if (cartas[index].quantidade < 0) cartas[index].quantidade = 0
      }

      // Atualiza o tratamento (normal, foil, etched)
      if (tratamento !== undefined) {
        cartas[index].tratamento = tratamento
      }

      await fs.writeFile(DATA_FILE, JSON.stringify(cartas, null, 2))
      res.json(cartas[index])
    } else {
      res.status(404).json({ error: 'Carta não encontrada' })
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar a carta' })
  }
})

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})