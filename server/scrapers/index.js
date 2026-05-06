const axios = require('axios')
const cheerio = require('cheerio')
const { extractProductWithAI } = require('../ai/analyzer')

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDimensions(text = '') {
  if (!text) return {}
  // Patterns: "220 x 90 x 80 cm", "87"W x 35"D x 31.5"H", "W220xD90xH80"
  const cmMatch = text.match(
    /(?:W[:\s]*)?(\d+(?:\.\d+)?)\s*[x×\*]\s*(?:D[:\s]*)?(\d+(?:\.\d+)?)\s*[x×\*]\s*(?:H[:\s]*)?(\d+(?:\.\d+)?)\s*(?:cm)?/i
  )
  if (cmMatch) {
    return {
      widthCm: parseFloat(cmMatch[1]),
      depthCm: parseFloat(cmMatch[2]),
      heightCm: parseFloat(cmMatch[3]),
    }
  }

  // Inches pattern: 87"W x 35"D x 31.5"H
  const inchMatch = text.match(
    /(\d+(?:\.\d+)?)["\s]*W[:\s]*x[:\s]*(\d+(?:\.\d+)?)["\s]*D[:\s]*x[:\s]*(\d+(?:\.\d+)?)["\s]*H/i
  )
  if (inchMatch) {
    return {
      widthCm: Math.round(parseFloat(inchMatch[1]) * 2.54),
      depthCm: Math.round(parseFloat(inchMatch[2]) * 2.54),
      heightCm: Math.round(parseFloat(inchMatch[3]) * 2.54),
    }
  }

  return {}
}

function parsePrice(text = '') {
  const m = text.match(/\$\s*(\d{1,6}(?:[.,]\d{2})?)/)
  if (m) return parseFloat(m[1].replace(',', ''))
  return null
}

function normaliseColor(text = '') {
  if (!text) return null
  const lower = text.toLowerCase()
  const MAP = {
    white: '#F5F5F0', cream: '#F5ECD7', ivory: '#FAF0DC', beige: '#E8D9C0',
    black: '#1C1C1C', charcoal: '#2C2C2C', grey: '#888888', gray: '#888888',
    brown: '#6B4226', walnut: '#5C3D2E', oak: '#C49860', teak: '#8B6347',
    natural: '#D4A86A',
    blue: '#4A6FA5', navy: '#1E3A5F', teal: '#3A7D7B',
    green: '#4A6741', sage: '#7D9B76', olive: '#6B7C3B',
    terracotta: '#C4622D', orange: '#D4622D', rust: '#B55A35',
    red: '#A83232', pink: '#D4847A', blush: '#E8A99A',
    yellow: '#D4A853', mustard: '#C49235', gold: '#B5943A', brass: '#B5943A',
    purple: '#7B5EA7', lavender: '#9B89C4',
  }
  for (const [key, hex] of Object.entries(MAP)) {
    if (lower.includes(key)) return hex
  }
  // Already a hex?
  if (/^#[0-9a-f]{3,6}$/i.test(text.trim())) return text.trim()
  return null
}

function extractJsonLd($) {
  let result = {}
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html())
      const items = Array.isArray(data) ? data : [data]
      items.forEach((item) => {
        const type = item['@type'] || ''
        if (typeof type === 'string' && type.toLowerCase().includes('product')) {
          result.name  = result.name  || item.name
          result.imageUrl = result.imageUrl || (Array.isArray(item.image) ? item.image[0] : item.image)
          result.color = result.color || item.color
          const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers
          if (offer) result.priceUSD = result.priceUSD || parseFloat(offer.price)
        }
      })
    } catch {}
  })
  return result
}

function extractOpenGraph($) {
  return {
    name:     $('meta[property="og:title"]').attr('content')       || $('title').text().trim(),
    imageUrl: $('meta[property="og:image"]').attr('content'),
    description: $('meta[property="og:description"]').attr('content')
              || $('meta[name="description"]').attr('content'),
  }
}

// Site-specific extractors
function extractIkea($) {
  const name = $('.pip-header-section__title, .product-header__title, h1').first().text().trim()
  const price = parsePrice($('[class*="pip-price"], [class*="product-price"]').first().text())
  const descText = $('.pip-header-section__description, [class*="product-description"]').text()
  const dims = parseDimensions(
    $('[class*="product-details"], [class*="pip-product-details"]').text()
  )

  // Try multiple IKEA image selectors — static HTML often includes these before JS hydration
  const imageUrl =
    $('[data-testid="media-grid__main-image"] img').first().attr('src') ||
    $('img[class*="pip-media-grid__image"]').first().attr('src') ||
    $('img[src*="/us/en/images/products/"]').first().attr('src') ||
    $('img[src*="/gb/en/images/products/"]').first().attr('src') ||
    $('img[src*="ikea.com"][src*="/images/"]').first().attr('src') ||
    $('img[src*="ikea.com"]').not('[src*="logo"]').not('[src*="icon"]').first().attr('src') ||
    null

  return { name, priceUSD: price, imageUrl, ...dims }
}

function extractAmazon($) {
  const name = $('#productTitle').text().trim()
  const price = parsePrice($('#priceblock_ourprice, .a-price .a-offscreen, #price_inside_buybox').first().text())
  const bullets = $('#feature-bullets ul li, #productDescription').text()
  const dims = parseDimensions(
    $('#productDetails_techSpec_section_1, #productDetails_detailBullets_sections1, #detailBullets_feature_div').text()
    + ' ' + bullets
  )
  const imageUrl = $('#landingImage, #imgTagWrapperId img').first().attr('src')
    || $('#imgBlkFront').attr('src')
  return { name, priceUSD: price, imageUrl, ...dims }
}

function extractWayfair($) {
  const name = $('[data-hb-id="pip-product-header"] h1, .ProductDetailInfoBlock-title, h1[class*="BaseWaypoint"]').first().text().trim()
  const price = parsePrice($('[class*="PriceBlock"], [class*="BasePriceBlock"]').first().text())
  const dims = parseDimensions($('[class*="ProductSpecs"], [class*="SpecsTable"]').text())
  return { name, priceUSD: price, ...dims }
}

function extractArticle($) {
  const name = $('h1[class*="product"], .product-title, h1').first().text().trim()
  const price = parsePrice($('[class*="price"]').first().text())
  const dims = parseDimensions($('[class*="dimension"], [class*="spec"]').text())
  return { name, priceUSD: price, ...dims }
}

function extractWestElm($) {
  const name = $('h1[itemprop="name"], h1[class*="product-name"], h1').first().text().trim()
  const price = parsePrice($('[itemprop="price"], [class*="price"]').first().text())
  const dims = parseDimensions($('[class*="dimensions"], [class*="specifications"]').text())
  return { name, priceUSD: price, ...dims }
}

function extractCB2($) {
  return extractWestElm($) // similar structure
}

function extractShopify($) {
  // Many Article, CB2-like stores use Shopify product JSON
  const scriptContent = $('script[type="application/json"]').filter((_, el) => {
    const text = cheerio.load(el).html() || ''
    return text.includes('"product"') || text.includes('"title"')
  }).first().html()
  try {
    const json = JSON.parse(scriptContent || '{}')
    const product = json.product || json
    return {
      name: product.title,
      priceUSD: product.variants?.[0]?.price ? parseFloat(product.variants[0].price) : null,
    }
  } catch { return {} }
}

// ── Main scraper ──────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    maxRedirects: 5,
  })
  return response.data
}

async function fetchWithPuppeteer(url) {
  let puppeteer
  try {
    puppeteer = require('puppeteer')
  } catch {
    return null
  }
  let browser
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36')
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 })
    return await page.content()
  } catch (e) {
    console.error('Puppeteer error:', e.message)
    return null
  } finally {
    if (browser) await browser.close()
  }
}

function parseHTML(html) {
  const $ = cheerio.load(html)
  const hostname = ''
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
  return { $, bodyText }
}

function determineSite(url) {
  const u = url.toLowerCase()
  if (u.includes('ikea.com')) return 'ikea'
  if (u.includes('amazon.com') || u.includes('amazon.co.uk')) return 'amazon'
  if (u.includes('wayfair.com')) return 'wayfair'
  if (u.includes('article.com')) return 'article'
  if (u.includes('westelm.com') || u.includes('west-elm.com')) return 'westelm'
  if (u.includes('cb2.com')) return 'cb2'
  return 'generic'
}

async function scrapeProduct(url) {
  let html = null
  let usedPuppeteer = false

  // Try fast fetch first
  try {
    html = await fetchPage(url)
  } catch (err) {
    console.log('Fast fetch failed, trying Puppeteer:', err.message)
    html = await fetchWithPuppeteer(url)
    usedPuppeteer = true
  }

  if (!html) {
    throw new Error('Could not fetch the page. The site may block automated requests.')
  }

  const { $, bodyText } = parseHTML(html)
  const site = determineSite(url)

  // Extract structured data
  const jsonLd = extractJsonLd($)
  const og     = extractOpenGraph($)

  // Site-specific extraction
  let siteData = {}
  switch (site) {
    case 'ikea':    siteData = extractIkea($); break
    case 'amazon':  siteData = extractAmazon($); break
    case 'wayfair': siteData = extractWayfair($); break
    case 'article': siteData = extractArticle($); break
    case 'westelm': siteData = extractWestElm($); break
    case 'cb2':     siteData = extractCB2($); break
    default:        siteData = extractShopify($); break
  }

  // Try to extract dimensions from any text if still missing
  let genericDims = {}
  if (!siteData.widthCm && !jsonLd.widthCm) {
    genericDims = parseDimensions(bodyText)
  }

  // Try to extract colour from body text
  let genericColor = null
  if (!siteData.color && !jsonLd.color) {
    const colorMatch = bodyText.match(
      /(?:color|colour|finish|upholstery)[:\s]+([A-Za-z\s]+?)(?:[,.\n]|$)/i
    )
    if (colorMatch) genericColor = normaliseColor(colorMatch[1].trim())
  }

  // Try to extract material
  let genericMaterial = null
  const matMatch = bodyText.match(
    /(?:material|fabric|frame)[:\s]+([A-Za-z\s]+?)(?:[,.\n]|$)/i
  )
  if (matMatch) genericMaterial = matMatch[1].trim().slice(0, 30)

  // Merge — priority: jsonLd > site-specific > og > generic
  const merged = {
    name:      siteData.name     || jsonLd.name     || og.name    || '',
    imageUrl:  siteData.imageUrl || jsonLd.imageUrl || og.imageUrl || null,
    priceUSD:  siteData.priceUSD || jsonLd.priceUSD || null,
    widthCm:   siteData.widthCm  || jsonLd.widthCm  || genericDims.widthCm  || null,
    depthCm:   siteData.depthCm  || jsonLd.depthCm  || genericDims.depthCm  || null,
    heightCm:  siteData.heightCm || jsonLd.heightCm || genericDims.heightCm || null,
    color:     normaliseColor(siteData.color || jsonLd.color || '') || genericColor || null,
    material:  siteData.material || genericMaterial || null,
    category:  null, // filled by AI below
  }

  // Determine which fields are still missing
  const missingFields = ['widthCm','depthCm','heightCm','name','category']
    .filter((f) => merged[f] == null || merged[f] === '')

  const needsAI = missingFields.length > 0 && process.env.GEMINI_API_KEY

  if (needsAI) {
    try {
      const aiData = await extractProductWithAI({
        url,
        title:       merged.name || og.name || '',
        description: og.description || '',
        bodyText:    bodyText.slice(0, 3500),
      })

      // Fill in gaps with AI data
      Object.keys(aiData).forEach((key) => {
        if ((merged[key] == null || merged[key] === '') && aiData[key] != null) {
          merged[key] = aiData[key]
        }
      })
    } catch (e) {
      console.error('AI extraction failed:', e.message)
    }
  }

  // Recompute missing after AI fill
  const finalMissing = ['widthCm','depthCm','heightCm'].filter((f) => merged[f] == null)

  // Generic image fallback: if imageUrl is still missing or somehow equals the page URL, scan <img> tags
  if (!merged.imageUrl || merged.imageUrl === url) {
    merged.imageUrl =
      $('img[src*="product"]').not('[src*="logo"],[src*="icon"],[src*="banner"],[src*="sprite"]').first().attr('src') ||
      $('img[src*="image"]').not('[src*="logo"],[src*="icon"],[src*="banner"],[src*="sprite"]').first().attr('src') ||
      $('img[src]').filter((_, el) => {
        const src = $(el).attr('src') || ''
        return src.startsWith('http') && !src.includes('logo') && !src.includes('icon')
      }).first().attr('src') ||
      null
  }

  return { ...merged, url, missingFields: finalMissing }
}

module.exports = { scrapeProduct }
