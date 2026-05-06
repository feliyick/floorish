const express = require('express')
const router = express.Router()
const { generateMesh } = require('../ai/meshyClient')

router.post('/', async (req, res) => {
  const { name, category, widthCm, depthCm, heightCm, color, material } = req.body

  if (!name) return res.status(400).json({ error: 'Product name is required.' })
  if (!process.env.MESHY_API_KEY) {
    return res.status(503).json({ error: 'Mesh generation not configured (missing MESHY_API_KEY).' })
  }

  try {
    const { glbUrl } = await generateMesh({ name, category, widthCm, depthCm, heightCm, color, material })
    res.json({ meshUrl: glbUrl })
  } catch (err) {
    console.error('Mesh generation error:', err)
    res.status(500).json({ error: 'Failed to generate mesh: ' + err.message })
  }
})

module.exports = router
