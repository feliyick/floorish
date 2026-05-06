const express = require('express')
const router = express.Router()
const { generateMesh } = require('../ai/meshyClient')

router.post('/', async (req, res) => {
  const { name, category, widthCm, depthCm, heightCm, color, material } = req.body

  if (!name) return res.status(400).json({ error: 'Product name is required.' })
  if (!process.env.MESHY_API_KEY) {
    console.error('[Meshy] API key not configured')
    return res.status(503).json({ error: 'Mesh generation not configured (missing MESHY_API_KEY).' })
  }

  console.log(`[Meshy] Starting mesh generation for "${name}" (${category}) ${widthCm}×${heightCm}×${depthCm}cm`)
  try {
    const { glbUrl } = await generateMesh({ name, category, widthCm, depthCm, heightCm, color, material })
    console.log(`[Meshy] ✓ Successfully generated mesh for "${name}"`)
    res.json({ meshUrl: glbUrl })
  } catch (err) {
    console.error(`[Meshy] ✗ Mesh generation failed for "${name}":`, err.message)
    res.status(500).json({ error: 'Failed to generate mesh: ' + err.message })
  }
})

module.exports = router
