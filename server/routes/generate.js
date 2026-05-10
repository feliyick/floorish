const express = require('express')
const router = express.Router()
const { generateFurnitureModel } = require('../ai/analyzer')

router.post('/', async (req, res) => {
  const { name, category, widthCm, depthCm, heightCm, color, material, imageUrl, forceProcedural, forceStrategy } = req.body

  if (!name) return res.status(400).json({ error: 'Product name is required.' })
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI not configured (missing GEMINI_API_KEY).' })

  console.log(`[Generate] Starting model generation for "${name}" (${category})`)
  console.log(`[Generate]   Dimensions: ${widthCm}cm × ${heightCm}cm × ${depthCm}cm`)
  console.log(`[Generate]   Color: ${color || 'default'}, Material: ${material || 'default'}`)
  console.log(`[Generate]   Image: ${imageUrl ? 'yes' : 'no'}, ForceProcedural: ${forceProcedural ? 'yes' : 'no'}`)

  try {
    const result = await generateFurnitureModel({ name, category, widthCm, depthCm, heightCm, color, material, imageUrl, forceProcedural: !!forceProcedural, forceStrategy: forceStrategy || null })
    console.log(`[Generate] ✓ Routing decision: strategy="${result.strategy}", confidence="${result.confidenceReason}"`)
    console.log(`[Generate]   Fallback chain: ${result.fallbackChain.join(' → ')}`)
    console.log(`[Generate]   Components: ${result.components ? result.components.length + ' shapes' : 'none (mesh route)'}`)
    res.json({
      strategy:         result.strategy,
      confidenceReason: result.confidenceReason,
      fallbackChain:    result.fallbackChain,
      components:       result.components,
    })
  } catch (err) {
    console.error(`[Generate] ✗ Model generation failed for "${name}":`, err.message)
    res.status(500).json({ error: 'Failed to generate model: ' + err.message })
  }
})

module.exports = router
