const express = require('express')
const multer = require('multer')
const router = express.Router()
const { analyzeFloorPlanImage } = require('../ai/analyzer')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
})

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' })
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI analysis not configured (missing GEMINI_API_KEY).' })
  }

  try {
    const result = await analyzeFloorPlanImage(
      req.file.buffer,
      req.file.mimetype,
    )
    res.json(result)
  } catch (err) {
    console.error('Floor plan analysis error:', err.message)
    res.status(500).json({ error: 'Failed to analyse the floor plan image. Try a clearer image.' })
  }
})

module.exports = router
