const express = require('express')
const router = express.Router()
const { scrapeProduct } = require('../scrapers')

router.post('/', async (req, res) => {
  const { url } = req.body

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid URL is required.' })
  }

  // Basic URL validation
  try {
    new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL format.' })
  }

  try {
    const product = await scrapeProduct(url)
    res.json(product)
  } catch (err) {
    console.error('Scrape error:', err.message)
    res.status(502).json({
      error: err.message || 'Failed to scrape the product page.',
      missingFields: ['name', 'category', 'widthCm', 'depthCm', 'heightCm'],
    })
  }
})

module.exports = router
