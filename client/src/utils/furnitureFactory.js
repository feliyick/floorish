import * as THREE from 'three'

// ── Toon shading gradient (4-step warm palette) ───────────────────────────────
let _gradientMap = null
export function getToonGradientMap() {
  if (_gradientMap) return _gradientMap
  const data = new Uint8Array([40, 100, 170, 240])
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  _gradientMap = tex
  return tex
}

export function toonMat(hex) {
  return new THREE.MeshToonMaterial({
    color: new THREE.Color(hex || '#C4622D'),
    gradientMap: getToonGradientMap(),
  })
}

// ── AI component renderer ─────────────────────────────────────────────────────
// Turns the JSON component list returned by Gemini into a Three.js Group.
// Supported shapes: box, cylinder, sphere, torus
function renderModelComponents(components) {
  const g = new THREE.Group()
  for (const c of components) {
    let geo
    try {
      switch (c.shape) {
        case 'box':
          geo = new THREE.BoxGeometry(
            Math.max(0.005, c.w  || 0.1),
            Math.max(0.005, c.h  || 0.1),
            Math.max(0.005, c.d  || 0.1),
          )
          break
        case 'cylinder':
          geo = new THREE.CylinderGeometry(
            Math.max(0.002, c.rt  ?? 0.05),
            Math.max(0.002, c.rb  ?? 0.05),
            Math.max(0.005, c.len ?? c.h ?? 0.1),
            c.segs || 14,
          )
          break
        case 'sphere':
          geo = new THREE.SphereGeometry(Math.max(0.005, c.r || 0.05), c.segs || 12, c.segs || 12)
          break
        case 'torus':
          geo = new THREE.TorusGeometry(
            Math.max(0.01,  c.tr   || 0.1),
            Math.max(0.002, c.tube || 0.02),
            c.segs || 10,
            (c.segs || 10) * 3,
          )
          break
        default:
          geo = new THREE.BoxGeometry(c.w || 0.1, c.h || 0.1, c.d || 0.1)
      }
    } catch {
      continue
    }

    const m = new THREE.Mesh(geo, toonMat(c.color || '#C4622D'))
    m.castShadow = true
    m.receiveShadow = true
    m.position.set(c.x || 0, c.y || 0, c.z || 0)
    m.rotation.set(c.rx || 0, c.ry || 0, c.rz || 0)
    g.add(m)
  }
  return g
}

// ── Placeholder shown while AI model is being generated ──────────────────────
function makePlaceholder(w = 1, d = 0.8, h = 0.8) {
  const g = new THREE.Group()
  const geo = new THREE.BoxGeometry(w * 0.92, h * 0.92, d * 0.92)

  // MeshBasicMaterial: unlit, always visible regardless of scene lighting.
  // Opacity high enough to read the bounding box clearly.
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: new THREE.Color('#D4A853'),
    transparent: true,
    opacity: 0.55,
  }))
  fill.position.y = h / 2
  g.add(fill)

  // Solid wireframe outline
  const edges = new THREE.EdgesGeometry(geo)
  const wire = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: '#8B5E3C' })
  )
  wire.position.y = h / 2
  g.add(wire)

  return g
}

// ── Public API ────────────────────────────────────────────────────────────────
export function createFurnitureGroup(item) {
  if (item.modelComponents && item.modelComponents.length > 0) {
    return renderModelComponents(item.modelComponents)
  }
  return makePlaceholder(item.widthM, item.depthM, item.heightM)
}

// ── Category guesser (used in ProductImporter) ────────────────────────────────
const CATEGORY_KEYWORDS = {
  sofa:         ['sofa','couch','sectional','loveseat'],
  armchair:     ['armchair','lounge chair','accent chair','club chair','barrel chair','egg chair'],
  dining_chair: ['dining chair','side chair'],
  bar_stool:    ['stool','barstool'],
  ottoman:      ['ottoman','footstool','pouf'],
  bench:        ['bench'],
  coffee_table: ['coffee table'],
  dining_table: ['dining table','kitchen table'],
  desk:         ['desk','work table','writing table'],
  side_table:   ['side table','end table','nightstand','accent table','bedside'],
  dresser:      ['dresser','chest of drawers','drawers'],
  bookshelf:    ['bookshelf','bookcase','shelving','shelf unit'],
  wardrobe:     ['wardrobe','armoire','closet'],
  tv_stand:     ['tv stand','media console','entertainment unit'],
  bed:          ['bed','bedframe'],
  lamp_floor:   ['floor lamp'],
  lamp_arc:     ['arc lamp'],
  lamp_table:   ['table lamp','desk lamp'],
  lamp_pendant: ['pendant','hanging lamp'],
  chandelier:   ['chandelier'],
  mirror_floor: ['floor mirror','leaning mirror'],
  mirror_wall:  ['wall mirror','mirror'],
  plant_tall:   ['fiddle','monstera','palm','tree','tall plant'],
  plant_medium: ['plant','potted'],
  rug:          ['rug','carpet'],
  artwork:      ['art','print','painting','poster'],
  vase:         ['vase'],
}

export function guessCategory(name = '') {
  const lower = name.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat
  }
  return 'generic'
}
