const express = require('express')
const axios   = require('axios')
const crypto  = require('crypto')
const router  = express.Router()
const { generateMesh } = require('../ai/meshyClient')

// In-memory cache: hash → { glbUrl, buffer, contentType }
const glbCache = new Map()

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

    // Download the GLB and cache it so we can serve it locally (avoids CORS)
    const hash = crypto.createHash('md5').update(glbUrl).digest('hex').slice(0, 12)
    try {
      const glbRes = await axios.get(glbUrl, { responseType: 'arraybuffer', timeout: 30000 })
      glbCache.set(hash, {
        buffer:      Buffer.from(glbRes.data),
        contentType: glbRes.headers['content-type'] || 'model/gltf-binary',
      })
      console.log(`[Meshy] Cached GLB as /api/generate-mesh/glb/${hash} (${(glbRes.data.byteLength / 1024).toFixed(0)} KB)`)
      res.json({ meshUrl: `/api/generate-mesh/glb/${hash}` })
    } catch (dlErr) {
      console.warn(`[Meshy] Could not download GLB for caching, returning remote URL:`, dlErr.message)
      res.json({ meshUrl: glbUrl })
    }
  } catch (err) {
    console.error(`[Meshy] ✗ Mesh generation failed for "${name}":`, err.message)
    res.status(500).json({ error: 'Failed to generate mesh: ' + err.message })
  }
})

// Serve cached GLB files — browser loads from localhost, no CORS issues
router.get('/glb/:hash', (req, res) => {
  const entry = glbCache.get(req.params.hash)
  if (!entry) return res.status(404).json({ error: 'GLB not found or expired' })
  res.set('Content-Type', entry.contentType)
  res.set('Cache-Control', 'public, max-age=86400')
  res.send(entry.buffer)
})

module.exports = router
