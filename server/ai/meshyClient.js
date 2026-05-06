const axios = require('axios')

const BASE_URL       = 'https://api.meshy.ai'
const IMAGE_TO_3D    = `${BASE_URL}/openapi/v1/image-to-3d`
const TEXT_TO_3D     = `${BASE_URL}/openapi/v2/text-to-3d`
const POLL_INTERVAL_MS = 5000
const TIMEOUT_MS       = 180000  // 3 minutes

function authHeaders() {
  return { Authorization: `Bearer ${process.env.MESHY_API_KEY}` }
}

/**
 * Build a text prompt from product metadata (used for text-to-3D fallback).
 */
function buildTextPrompt({ name, category, widthCm, depthCm, heightCm, color, material }) {
  const parts = [name]
  if (category) parts.push(category.replace(/_/g, ' ') + ' furniture')
  if (color && !color.startsWith('#')) parts.push(color)
  if (material) parts.push(material)
  if (widthCm && depthCm && heightCm) {
    parts.push(`${widthCm}cm wide × ${heightCm}cm tall × ${depthCm}cm deep`)
  }
  return parts.filter(Boolean).join(', ')
}

/**
 * Create a Meshy 3D generation task.
 * Uses image-to-3D when imageUrl is available (higher fidelity),
 * falls back to text-to-3D otherwise.
 * @returns {Promise<{ taskId: string, mode: 'image' | 'text' }>}
 */
async function createMeshTask({ name, category, widthCm, depthCm, heightCm, color, material, imageUrl }) {
  if (imageUrl) {
    // Image-to-3D mode — higher fidelity, matches actual product
    console.log(`[Meshy] Using image-to-3D mode with image: ${imageUrl.slice(0, 80)}...`)
    const res = await axios.post(IMAGE_TO_3D, {
      image_url:        imageUrl,
      ai_model:         'meshy-5',
      enable_pbr:       true,
      should_remesh:    true,
      topology:         'quad',
      target_polycount: 30000,
    }, {
      headers: authHeaders(),
      timeout: 15000,
    })
    return { taskId: res.data.result, mode: 'image' }
  }

  // Fallback: text-to-3D (no image available)
  console.log(`[Meshy] No imageUrl — falling back to text-to-3D mode`)
  const prompt = buildTextPrompt({ name, category, widthCm, depthCm, heightCm, color, material })
  const res = await axios.post(TEXT_TO_3D, {
    mode:            'preview',
    prompt,
    art_style:       'realistic',
    negative_prompt: 'low quality, blurry, floating, disconnected parts',
  }, {
    headers: authHeaders(),
    timeout: 15000,
  })
  return { taskId: res.data.result, mode: 'text' }
}

/**
 * Poll a Meshy task until it succeeds, fails, or times out.
 * @param {string} taskId
 * @param {'image' | 'text'} mode — determines the polling endpoint
 * @returns {Promise<{ glbUrl: string }>}
 */
async function pollMeshTask(taskId, mode = 'image') {
  const pollUrl = mode === 'image'
    ? `${IMAGE_TO_3D}/${taskId}`
    : `${TEXT_TO_3D}/${taskId}`

  const deadline = Date.now() + TIMEOUT_MS
  let pollCount = 0
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    pollCount++
    try {
      const res = await axios.get(pollUrl, {
        headers: authHeaders(),
        timeout: 10000,
      })
      const { status, model_urls, task_error } = res.data
      console.log(`[Meshy] Poll #${pollCount} status: ${status}`)
      if (status === 'SUCCEEDED') {
        if (!model_urls?.glb) throw new Error('Meshy task succeeded but no GLB URL returned')
        console.log(`[Meshy] ✓ Task ${taskId.slice(0, 8)}... succeeded after ${pollCount} polls (${mode}-to-3D)`)
        return { glbUrl: model_urls.glb }
      }
      if (status === 'FAILED') {
        throw new Error(`Meshy task failed: ${task_error?.message || 'unknown error'}`)
      }
      // PENDING / IN_PROGRESS — keep polling
    } catch (err) {
      if (err.message.startsWith('Meshy task failed')) throw err
      console.error(`[Meshy] Poll #${pollCount} error:`, err.message)
      throw err
    }
  }
  throw new Error(`Meshy task timed out after 3 minutes (${pollCount} polls)`)
}

/**
 * Generate a 3D mesh for a product via Meshy AI.
 * Prefers image-to-3D when imageUrl is provided; falls back to text-to-3D.
 * @param {object} product
 * @returns {Promise<{ glbUrl: string }>}
 */
async function generateMesh(product) {
  const { taskId, mode } = await createMeshTask(product)
  return pollMeshTask(taskId, mode)
}

module.exports = { generateMesh }
