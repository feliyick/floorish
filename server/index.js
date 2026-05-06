require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const scrapeRouter       = require('./routes/scrape')
const analyzeRouter      = require('./routes/analyze')
const generateRouter     = require('./routes/generate')
const generateMeshRouter = require('./routes/generate-mesh')

const app  = express()
const PORT = process.env.PORT || 3001

// ── Startup validation ────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════════════')
console.log('  Floorish Server Startup')
console.log('═══════════════════════════════════════════════════════════════════════════\n')
console.log('ℹ  API Configuration:')
console.log(`   ${process.env.GEMINI_API_KEY  ? '✓' : '✗'} GEMINI_API_KEY   ${process.env.GEMINI_API_KEY  ? '(configured)' : '(MISSING — AI features will fail)'}`)
console.log(`   ${process.env.MESHY_API_KEY   ? '✓' : '✗'} MESHY_API_KEY    ${process.env.MESHY_API_KEY   ? '(configured)' : '(MISSING — mesh generation will fail)'}`)

if (!process.env.GEMINI_API_KEY) {
  console.error('\n⚠  CRITICAL: Gemini API key not found.')
  console.error('   Set GEMINI_API_KEY in server/.env and restart this server.\n')
}
if (!process.env.MESHY_API_KEY) {
  console.warn('\n⚠  WARNING: Meshy API key not found.')
  console.warn('   Mesh generation will fall back to procedural. Set MESHY_API_KEY in server/.env if needed.\n')
}

console.log('═══════════════════════════════════════════════════════════════════════════\n')

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json({ limit: '2mb' }))

// Routes
app.use('/api/scrape', scrapeRouter)
app.use('/api/analyze-floor-plan', analyzeRouter)
app.use('/api/generate-model', generateRouter)
app.use('/api/generate-mesh', generateMeshRouter)

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`\n  Floorish server running at http://localhost:${PORT}\n`)
})
