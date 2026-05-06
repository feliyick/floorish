const CELL_SIZE = 0.2  // must match Room.jsx

/**
 * Convert wall grid coords to world coords (centred at origin).
 * walls from the store use raw grid cells; Room.jsx applies the same offsets.
 */
function wallToWorld(wall, floorDims) {
  const offsetX = -(floorDims.w * CELL_SIZE) / 2
  const offsetZ = -(floorDims.h * CELL_SIZE) / 2
  return {
    x1: wall.x1 * CELL_SIZE + offsetX,
    z1: wall.y1 * CELL_SIZE + offsetZ,
    x2: wall.x2 * CELL_SIZE + offsetX,
    z2: wall.y2 * CELL_SIZE + offsetZ,
  }
}

/**
 * Closest point on a line segment (x1,z1)→(x2,z2) to point (px, pz).
 * Returns { x, z, t } where t ∈ [0,1] is the parameter along the segment.
 */
function closestPointOnSegment(x1, z1, x2, z2, px, pz) {
  const dx = x2 - x1
  const dz = z2 - z1
  const lenSq = dx * dx + dz * dz
  if (lenSq < 1e-8) return { x: x1, z: z1, t: 0 }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq))
  return { x: x1 + t * dx, z: z1 + t * dz, t }
}

// ── Surface-aware placement ──────────────────────────────────────────────────
// Items that should auto-place on a surface when one is available.
const SURFACE_ITEMS = new Set([
  'lamp_table', 'lamp_desk', 'vase', 'vase_tall', 'candle',
  'books_stack', 'plant_small', 'sculpture',
])

// Furniture categories that provide a usable top surface.
const SURFACE_PROVIDERS = new Set([
  'side_table', 'end_table', 'nightstand', 'accent_table', 'pedestal_table',
  'coffee_table', 'dining_table', 'desk', 'console_table',
  'dresser', 'tv_stand',
])

// Preferred surface type per item category (tried in order).
const PREFERRED_SURFACES = {
  lamp_table:  ['nightstand', 'side_table', 'end_table', 'accent_table', 'console_table', 'dresser'],
  lamp_desk:   ['desk', 'console_table', 'side_table'],
  vase:        ['coffee_table', 'dining_table', 'console_table', 'side_table'],
  vase_tall:   ['console_table', 'pedestal_table', 'side_table'],
  candle:      ['coffee_table', 'dining_table', 'side_table', 'console_table'],
  plant_small: ['side_table', 'coffee_table', 'desk', 'dresser'],
}

/**
 * For items that belong on surfaces (lamps, vases, etc.), find the best
 * surface in existing furniture and return its placement position.
 *
 * @param {{ category: string }} newItem
 * @param {Array} existingFurniture - furniture array from the store
 * @returns {{ position: [number, number, number] } | null}
 */
export function findSurfacePlacement(newItem, existingFurniture) {
  if (!SURFACE_ITEMS.has(newItem.category)) return null

  const surfaces = existingFurniture.filter((f) => SURFACE_PROVIDERS.has(f.category))
  if (surfaces.length === 0) return null

  // Try preferred surface types first
  const prefs = PREFERRED_SURFACES[newItem.category] || []
  let surface = null
  for (const cat of prefs) {
    surface = surfaces.find((f) => f.category === cat)
    if (surface) break
  }
  if (!surface) surface = surfaces[0]

  return {
    position: [surface.position[0], surface.heightM, surface.position[2]],
  }
}

// ── Wall proximity orientation ───────────────────────────────────────────────

/**
 * Given a furniture position and the room's walls, returns the Y-rotation
 * (radians) that makes the furniture face the nearest wall's inward normal,
 * or null if no wall is within `threshold` metres.
 *
 * The "inward normal" points from the wall toward the room centre (origin).
 *
 * @param {number} x - furniture world X
 * @param {number} z - furniture world Z
 * @param {Array}  walls - walls from useStore (grid coords)
 * @param {{ w: number, h: number }} floorDims - from useStore
 * @param {number} threshold - max distance to snap (metres)
 * @returns {number|null}
 */
export function nearestWallAngle(x, z, walls, floorDims, threshold = 0.5) {
  let bestDist = threshold
  let bestAngle = null

  for (const wall of walls) {
    const w = wallToWorld(wall, floorDims)
    const cp = closestPointOnSegment(w.x1, w.z1, w.x2, w.z2, x, z)
    const dist = Math.sqrt((x - cp.x) ** 2 + (z - cp.z) ** 2)
    if (dist >= bestDist) continue

    bestDist = dist

    // Wall direction vector
    const wdx = w.x2 - w.x1
    const wdz = w.z2 - w.z1

    // Two candidate normals (perpendicular to wall)
    const n1 = { x: -wdz, z: wdx }
    const n2 = { x: wdz, z: -wdx }

    // Pick the normal that points toward room origin (0,0) from the wall's midpoint
    const midX = (w.x1 + w.x2) / 2
    const midZ = (w.z1 + w.z2) / 2
    const toOriginX = -midX
    const toOriginZ = -midZ
    const dot1 = n1.x * toOriginX + n1.z * toOriginZ
    const inward = dot1 >= 0 ? n1 : n2

    // atan2 gives the angle from +X axis; furniture "forward" is +Z in Three.js
    // so we rotate the inward normal angle by -π/2 to align furniture facing
    bestAngle = Math.atan2(inward.x, inward.z)
  }

  return bestAngle
}
