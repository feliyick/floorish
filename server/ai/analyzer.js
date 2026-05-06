const { GoogleGenerativeAI } = require('@google/generative-ai')
const axios = require('axios')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Models tried in order when the preferred one returns 503.
const MODEL_SEQUENCE = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite']
const RETRY_DELAYS   = [2000, 5000, 10000]

/**
 * Call fn(modelName) with exponential-backoff retries across MODEL_SEQUENCE.
 * Only 503 errors trigger a retry; all other errors are re-thrown immediately.
 */
async function callWithRetry(fn) {
  let lastErr
  for (const modelName of MODEL_SEQUENCE) {
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        return await fn(modelName)
      } catch (err) {
        lastErr = err
        const is503 = err.status === 503 || err.message?.includes('503')
        if (!is503) throw err
        if (attempt < RETRY_DELAYS.length) {
          console.warn(`${modelName} 503 on attempt ${attempt + 1}, retrying in ${RETRY_DELAYS[attempt]}ms…`)
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]))
        }
      }
    }
    console.warn(`${modelName} exhausted retries, trying next model…`)
  }
  throw lastErr
}

/**
 * Use Gemini to extract product data from page text/title when structured
 * scraping didn't yield enough information.
 *
 * @param {{ title: string, description: string, bodyText: string, url: string }} page
 * @returns {Promise<Object>} partial product data
 */
async function extractProductWithAI(page) {
  const { title, description, bodyText, url } = page

  const truncatedBody = bodyText?.slice(0, 3000) || ''

  const prompt = `You are extracting product information from a furniture/decor website page.

Page URL: ${url}
Page title: ${title || '(none)'}
Meta description: ${description || '(none)'}
Page text (truncated):
${truncatedBody}

Extract the following and respond ONLY with a JSON object (no explanation, no markdown):
{
  "name": "full product name",
  "category": one of: sofa, sectional, armchair, accent_chair, dining_chair, bar_stool, ottoman, bench, coffee_table, side_table, end_table, accent_table, pedestal_table, nightstand, dining_table, desk, console_table, dresser, bookshelf, wardrobe, tv_stand, bed, lamp_floor, lamp_arc, lamp_tripod, lamp_table, lamp_pendant, chandelier, mirror_floor, mirror_wall, mirror_round, plant_tall, plant_medium, plant_small, plant_hanging, vase, vase_tall, rug, artwork, sculpture, candle, books_stack, generic,
  "widthCm": number or null,
  "depthCm": number or null,
  "heightCm": number or null,
  "color": hex colour string like "#C4622D" or descriptive word, or null,
  "material": short string like "oak", "linen", "metal", or null,
  "priceUSD": number or null
}

Rules:
- Dimensions are often in product descriptions as "W x D x H" or in a specs table. Convert inches to cm (1 inch = 2.54 cm) if needed.
- For colour, use the dominant upholstery/finish colour. Map to a hex if possible.
- If a field is truly unknown, use null.
- Do NOT include any text outside the JSON.`

  return callWithRetry(async (modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    })
    const result = await model.generateContent(prompt)
    const text   = result.response.text().trim()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error(`Non-JSON response from ${modelName}: ${text.slice(0, 200)}`)
      parsed = JSON.parse(match[0])
    }
    return parsed
  })
}

/**
 * Analyse a floor plan image with Gemini Vision and return wall segments
 * in normalised grid coordinates.
 *
 * @param {Buffer} imageBuffer - raw image bytes
 * @param {string} mimeType    - e.g. 'image/png', 'image/jpeg'
 * @param {{ w: number, h: number }} floorDims - current grid dimensions (cells)
 * @returns {Promise<{ walls: Array<{x1,y1,x2,y2}>, suggestedFloorDims: {w,h} }>}
 */
async function analyzeFloorPlanImage(imageBuffer, mimeType, floorDims = { w: 28, h: 22 }) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are a floor plan interpreter. Analyse this floor plan image and extract the room layout as wall segments.

Return ONLY a JSON object (no explanation, no markdown fences):
{
  "floorWidthM": <estimated room width in metres, number>,
  "floorDepthM": <estimated room depth in metres, number>,
  "walls": [
    { "x1Pct": 0.0, "y1Pct": 0.0, "x2Pct": 1.0, "y2Pct": 0.0 },
    ...
  ]
}

Rules:
- walls[] contains line segments representing walls and major partitions.
- Coordinates are percentages (0.0 to 1.0) of the room's bounding box, measured from the top-left corner. x1Pct/x2Pct go left→right, y1Pct/y2Pct go top→bottom.
- Trace ALL exterior walls and any interior walls/partitions visible.
- Include doorways as gaps (omit that segment), not as solid walls.
- If the image contains dimension labels, use them to estimate floorWidthM and floorDepthM. If not visible, make a reasonable estimate.
- Only output valid JSON. No extra text.`

  const result = await model.generateContent([
    { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
    prompt,
  ])

  const text = result.response.text().trim()
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  const parsed = JSON.parse(cleaned)

  // Convert percentage-based wall coords → grid cell coordinates
  const widthM  = parsed.floorWidthM  || 8
  const depthM  = parsed.floorDepthM  || 6
  const CELL_M  = 0.2  // 1 grid cell = 20 cm

  // Choose grid size to fit the room with some padding
  const gridW = Math.max(10, Math.round(widthM / CELL_M) + 4)
  const gridH = Math.max(10, Math.round(depthM / CELL_M) + 4)
  const offsetX = 2  // padding cells from edges
  const offsetY = 2

  const walls = (parsed.walls || []).map((w) => ({
    x1: Math.round(w.x1Pct * (gridW - offsetX * 2) + offsetX),
    y1: Math.round(w.y1Pct * (gridH - offsetY * 2) + offsetY),
    x2: Math.round(w.x2Pct * (gridW - offsetX * 2) + offsetX),
    y2: Math.round(w.y2Pct * (gridH - offsetY * 2) + offsetY),
  })).filter((w) => !(w.x1 === w.x2 && w.y1 === w.y2)) // drop zero-length segments

  return {
    walls,
    suggestedFloorDims: { w: gridW, h: gridH },
  }
}

/**
 * Generate a Three.js component list for a furniture item by analysing its
 * product image with Gemini Vision.
 *
 * @param {{ name, category, widthCm, depthCm, heightCm, color, material, imageUrl }} product
 * @returns {Promise<Array>} components array for furnitureFactory renderer
 */
async function generateFurnitureModel({ name, category, widthCm, depthCm, heightCm, color, material, imageUrl }) {
  const wM = ((widthCm  || 80)  / 100).toFixed(3)
  const dM = ((depthCm  || 60)  / 100).toFixed(3)
  const hM = ((heightCm || 75)  / 100).toFixed(3)

  const prompt = `You are a 3D furniture modeller for a Three.js interior-design app.
Create a detailed geometric model of this product using simple 3D primitives.

Product: "${name}"
Category: ${category || 'furniture'}
Bounding box: ${wM}m wide (X) × ${hM}m tall (Y) × ${dM}m deep (Z)
Primary colour: ${color || 'see image'}
Material: ${material || 'see image'}

COORDINATE SYSTEM
- Origin = centre of bounding-box base, at floor level (Y = 0)
- X left→right  range [${(-wM/2).toFixed(3)}, ${(wM/2).toFixed(3)}]
- Y bottom→top  range [0, ${hM}]
- Z back→front  range [${(-dM/2).toFixed(3)}, ${(dM/2).toFixed(3)}]

AVAILABLE SHAPES & THEIR EXTRA FIELDS
  "box"      → "w" "h" "d"              (width, height, depth in metres)
  "cylinder" → "rt" "rb" "len"          (top radius, bottom radius, length/height)
  "sphere"   → "r"                      (radius)
  "torus"    → "tr" "tube"              (torus radius, tube radius)

ALL shapes also have: "color" (#hex), "x" "y" "z" (position), "rx" "ry" "rz" (rotation radians)

Respond with ONLY valid JSON — no markdown fences, no explanation:
{
  "components": [
    { "shape": "box",      "color": "#hex", "x": 0, "y": 0, "z": 0, "rx": 0, "ry": 0, "rz": 0, "w": 0.0, "h": 0.0, "d": 0.0 },
    { "shape": "cylinder", "color": "#hex", "x": 0, "y": 0, "z": 0, "rx": 0, "ry": 0, "rz": 0, "rt": 0.0, "rb": 0.0, "len": 0.0 },
    { "shape": "sphere",   "color": "#hex", "x": 0, "y": 0, "z": 0, "r": 0.0 },
    { "shape": "torus",    "color": "#hex", "x": 0, "y": 0, "z": 0, "rx": 0, "tr": 0.0, "tube": 0.0 }
  ]
}

REQUIREMENTS — read these carefully before generating:
1. Use 10–25 components. More components = more accurate and beautiful result.
2. Study the product image for exact shape, silhouette, and proportions. Do NOT produce a generic box.
3. Every component must stay within the ${wM}×${hM}×${dM}m bounding box.
4. Y positions: component base at Y=0 means it sits on the floor. A seat at leg-height Y=0.18 means the seat top is at Y=0.18+seatThickness.
5. Use the image colours — assign different #hex colours to different parts (upholstery vs frame vs legs vs cushions etc.)
6. Legs/feet: tapered cylinders (rt < rb), positioned at the four corners.
7. Upholstered parts: model seat, back, and arms as separate components with slightly different shades.
8. Distinctive visual details from the image must be included (curved back, metal base, sled legs, open shelves, etc.)
9. Be accurate to THIS specific product, not a generic version of the category.`

  const parts = []

  // Attach product image for visual analysis
  if (imageUrl) {
    try {
      const imgResp = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      const mimeType = imgResp.headers['content-type']?.split(';')[0] || 'image/jpeg'
      parts.push({ inlineData: { data: Buffer.from(imgResp.data).toString('base64'), mimeType } })
    } catch (e) {
      console.warn('Could not fetch product image for model generation:', e.message)
    }
  }

  parts.push(prompt)

  return callWithRetry(async (modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    })
    const result = await model.generateContent(parts)
    const text   = result.response.text().trim()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error(`Non-JSON response from ${modelName}: ${text.slice(0, 200)}`)
      parsed = JSON.parse(match[0])
    }
    return parsed.components || []
  })
}

module.exports = { extractProductWithAI, analyzeFloorPlanImage, generateFurnitureModel }
