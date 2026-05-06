const express = require('express')
const router = express.Router()
const { generateFurnitureModel } = require('../ai/analyzer')

router.post('/', async (req, res) => {
  const { name, category, widthCm, depthCm, heightCm, color, material, imageUrl } = req.body

  if (!name) return res.status(400).json({ error: 'Product name is required.' })
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI not configured (missing GEMINI_API_KEY).' })

  try {
    const components = await generateFurnitureModel({ name, category, widthCm, depthCm, heightCm, color, material, imageUrl })
    res.json({ components })
  } catch (err) {
    console.error('Model generation error:', err)
    res.status(500).json({ error: 'Failed to generate model: ' + err.message })
  }
})

module.exports = router
