---
name: Image-to-3D and GLB Grounding Fixes
description: Switched Meshy from text-to-3D to image-to-3D API for better fidelity; fixed GLB pivot/origin misalignment causing floor clipping
type: project
---

## Summary

Implemented two critical fixes to the Meshy 3D generation pipeline:

1. **Image-to-3D API adoption** — Switch from text-only prompts to passing actual product images to Meshy's image-to-3D API (`/openapi/v1/image-to-3d`). This produces higher-fidelity geometry that matches the real product.
2. **GLB grounding normalization** — After scaling imported GLBs to match item dimensions, recompute bounding box and shift the model's Y position so its bottom sits at y=0 (floor level). Prevents models from clipping through the floor.

## Implementation

### Fix 1: Image-to-3D Mode (`server/ai/meshyClient.js`)

**Why**: We already scrape product images from URLs. Passing the actual image to Meshy produces geometry that closely matches the product, with better proportions and style details. Text-only generation loses this information.

**What changed**:
- `createMeshTask()` now checks if `imageUrl` is available
- If yes: `POST /openapi/v1/image-to-3d` with `image_url`, `ai_model: 'meshy-6'`, `enable_pbr: true`, quad topology
- If no: fallback to `POST /openapi/v2/text-to-3d` (original behavior)
- Returns `{ taskId, mode: 'image' | 'text' }` to track which endpoint was used
- `pollMeshTask()` uses the correct polling URL based on mode (`/v1/image-to-3d/{id}` vs `/v2/text-to-3d/{id}`)

**Parameters set**:
- `ai_model: 'meshy-6'` — latest model
- `enable_pbr: true` — generates metallic/roughness/normal maps for realistic materials
- `should_remesh: true` — clean up topology
- `topology: 'quad'` — quad polygons for deformation-friendly mesh
- `target_polycount: 30000` — balanced geometry density

### Fix 2: Image-to-3D Data Flow

**server/routes/generate-mesh.js**: Extract `imageUrl` from request body and pass to `generateMesh()`
**client/src/components/ProductImporter.jsx**: Include `imageUrl` in the Meshy POST body

### Fix 3: GLB Grounding (`client/src/components/Scene3D/FurnitureModel.jsx`)

**Why**: The scene uses bottom-aligned geometry convention (y=0 = floor). Procedural primitives follow this (placeholder box centered at y = h/2). But Meshy GLBs typically have center-aligned pivots — the bounding box center is at the origin. After scaling, the bottom half clips below y=0.

**What changed** (MeshAsset component):
1. Compute initial bounding box and scale to item dimensions (existing)
2. **NEW**: Recompute bounding box after scaling
3. **NEW**: Calculate Y offset: `yOffset = -scaledBox.min.y`
4. **NEW**: Shift model: `c.position.y += yOffset`
5. **NEW**: Log the shift for debugging

This ensures the model's lowest point is exactly at y=0, regardless of Meshy's output pivot.

## Files Changed

| File | Lines | Changes |
|------|-------|---------|
| `server/ai/meshyClient.js` | Full rewrite | Image-to-3D logic, mode tracking, dual polling URLs |
| `server/routes/generate-mesh.js` | 11, 21 | Extract and pass `imageUrl` |
| `client/src/components/ProductImporter.jsx` | 192 | Add `imageUrl` to Meshy POST |
| `client/src/components/Scene3D/FurnitureModel.jsx` | 46–51 | Grounding offset calculation + logging |

## Verification

**Image-to-3D mode**:
- Import IKEA SOTENAES armchair (from scraping, has imageUrl)
- Server logs: `[Meshy] Using image-to-3D mode with image: https://...`
- GLB should match product image more closely
- PBR materials visible under proper lighting

**Text-to-3D fallback**:
- Import product with no image (manual entry, blank imageUrl)
- Server logs: `[Meshy] No imageUrl — falling back to text-to-3D mode`
- GLB still generates and renders

**Grounding**:
- Any Meshy mesh placed in scene should sit flush on floor (no clipping)
- Browser console: `[GLB] Grounding offset: shifted y by X` confirms the shift
- Drag the item — stays grounded throughout

## Why This Matters

**Fidelity**: Image-to-3D produces models that look like the actual product, not a generic interpretation.

**Grounding**: Consistent Y positioning across all asset types (procedural/mesh) means furniture placement logic works uniformly — no special cases for GLBs sinking or floating.

**Robustness**: Grounding is applied client-side as a safety net, so even if Meshy's `origin_at: "bottom"` parameter fails or isn't used, models still ground correctly.

## Next Steps (Future)

- Material recoloring: Apply `color` from product to GLB materials
- Material abstraction: Unify how procedural primitives and GLBs handle colors/materials
- Surface placement: Ensure lamps/vases on tables work with grounded GLBs
- Performance: Monitor GLB cache memory usage; implement TTL if needed
