const axios = require('axios')

const BASE_URL = 'https://api.meshy.ai/openapi/v2'
const POLL_INTERVAL_MS = 5000
const TIMEOUT_MS = 180000  // 3 minutes

function authHeaders() {
  return { Authorization: `Bearer ${process.env.MESHY_API_KEY}` }
}

/**
 * Create a Meshy text-to-3D task.
 * @param {{ name, category, widthCm, depthCm, heightCm, color, material }} product
 * @returns {Promise<string>} task_id
 */
async function createMeshTask({ name, category, widthCm, depthCm, heightCm, color, material }) {
  const parts = [name]
  if (category) parts.push(category.replace(/_/g, ' ') + ' furniture')
  if (color)    parts.push(color.startsWith('#') ? '' : color)
  if (material) parts.push(material)
  if (widthCm && depthCm && heightCm) {
    parts.push(`${widthCm}cm wide × ${heightCm}cm tall × ${depthCm}cm deep`)
  }
  const prompt = parts.filter(Boolean).join(', ')

  const res = await axios.post(
    `${BASE_URL}/text-to-3d`,
    {
      mode:             'preview',
      prompt,
      art_style:        'realistic',
      negative_prompt:  'low quality, blurry, floating, disconnected parts',
    },
    {
      headers: authHeaders(),
      timeout: 15000,
    }
  )
  return res.data.result  // task_id string
}

/**
 * Poll a Meshy task until it succeeds, fails, or times out.
 * @param {string} taskId
 * @returns {Promise<{ glbUrl: string }>}
 */
async function pollMeshTask(taskId) {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const res = await axios.get(`${BASE_URL}/text-to-3d/${taskId}`, {
      headers: authHeaders(),
      timeout: 10000,
    })
    const { status, model_urls, task_error } = res.data
    if (status === 'SUCCEEDED') {
      if (!model_urls?.glb) throw new Error('Meshy task succeeded but no GLB URL returned')
      return { glbUrl: model_urls.glb }
    }
    if (status === 'FAILED') {
      throw new Error(`Meshy task failed: ${task_error?.message || 'unknown error'}`)
    }
    // PENDING / IN_PROGRESS — keep polling
  }
  throw new Error('Meshy task timed out after 3 minutes')
}

/**
 * Generate a 3D mesh for a product via Meshy AI.
 * @param {object} product
 * @returns {Promise<{ glbUrl: string }>}
 */
async function generateMesh(product) {
  const taskId = await createMeshTask(product)
  return pollMeshTask(taskId)
}

module.exports = { generateMesh }
