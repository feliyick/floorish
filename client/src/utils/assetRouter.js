// ── Compatibility tags ─────────────────────────────────────────────────────────
// Defines which items provide a usable surface and which belong on one.
// Used to initialise furniture.compatibilityTags at placeProduct time.

const COMPATIBILITY = {
  side_table:     ['surface-provider', 'lamp-target'],
  end_table:      ['surface-provider', 'lamp-target'],
  nightstand:     ['surface-provider', 'lamp-target'],
  accent_table:   ['surface-provider'],
  pedestal_table: ['surface-provider'],
  coffee_table:   ['surface-provider'],
  dining_table:   ['surface-provider'],
  desk:           ['surface-provider', 'lamp-target'],
  console_table:  ['surface-provider'],
  dresser:        ['surface-provider'],
  tv_stand:       ['surface-provider'],
  bed:            ['bed-frame'],
  lamp_table:     ['surface-item'],
  lamp_desk:      ['surface-item'],
  vase:           ['surface-item'],
  vase_tall:      ['surface-item'],
  candle:         ['surface-item'],
  plant_small:    ['surface-item'],
  books_stack:    ['surface-item'],
  sculpture:      ['surface-item'],
}

export function getCompatibilityTags(category) {
  return COMPATIBILITY[category] || []
}

// ── Bed size detection ─────────────────────────────────────────────────────────
// Infers semantic bed size from product name or width in cm.

export function detectBedSize(name = '', widthCm = 0) {
  const n = name.toLowerCase()
  if (n.includes('super king') || n.includes('king xl') || widthCm >= 200) return 'king-xl'
  if (n.includes('king') || widthCm >= 180)  return 'king'
  if (n.includes('queen') || (widthCm >= 150 && widthCm < 180)) return 'queen'
  if (n.includes('full') || n.includes('double') || (widthCm >= 130 && widthCm < 150)) return 'full'
  if (n.includes('twin') || n.includes('single') || widthCm < 130) return 'twin'
  return null
}
