require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const scrapeRouter   = require('./routes/scrape')
const analyzeRouter  = require('./routes/analyze')
const generateRouter = require('./routes/generate')

const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json({ limit: '2mb' }))

// Routes
app.use('/api/scrape', scrapeRouter)
app.use('/api/analyze-floor-plan', analyzeRouter)
app.use('/api/generate-model', generateRouter)

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`\n  Floorish server running at http://localhost:${PORT}\n`)
})
