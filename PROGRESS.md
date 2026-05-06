# Floorish — Project Progress

**Last updated:** May 4, 2026  
**Phase:** Early alpha — core 3D placement + AI model generation working  

---

## ✅ Completed Features

### Core 3D Floor Planner
- **Interactive 3D viewport** — Perspective + orthographic camera modes
- **Furniture placement** — Drag products into scene, positioned on XZ floor plane
- **Gizmos** — W/E/R keyboard shortcuts for Move/Rotate/Scale transforms
- **Selection** — Click furniture to select, visual ring indicator
- **Camera controls** — Orbit (click-drag to rotate/pan) + WASD fly movement
- **Wall editor** — 2D floor plan with wall drawing + Gemini AI wall-to-3D analysis

### Product Import & AI Generation
- **URL scraping** — Extracts name, dimensions, price, colour, image from e-commerce sites
- **Gemini Vision AI model generation** — Converts product images + metadata → 3D component list (boxes, cylinders, spheres, tori)
- **Async generation** — Non-blocking; user can continue working while models generate
- **Retry logic** — Exponential backoff + model fallbacks (2.5-flash → 2.5-flash-lite → 2.0-flash-lite) for API overload
- **Test fixtures** — 7 curated products in [client/src/test/fixtures.json](client/src/test/fixtures.json) for regression testing

### UI/UX
- **Sidebar with 4 sections:**
  - In-room furniture list (click to select items in scene)
  - Selected item inspector (dimensions, colour, actions: rotate/remove)
  - Product library (collapsible cards showing name/status/place button)
  - Floor plan editor (2D wall layout)
- **Product card design** — Compact by default (1 line: name + status + place button), expands on click for full image/dimensions
- **Loading states** — Spinning badge on furniture generating models, status badges ("Ready", "No model")
- **Resizable sidebar** — Drag edge to resize (180–520px range)

### Polish & UX Improvements
- **Ghost walls** — 38% opacity for easy peering through to see placed furniture
- **Placeholder visibility** — Semi-transparent tan box (55% opacity, `MeshBasicMaterial`) with solid wireframe outline visible while AI generates
- **Generating indicator** — Spinning golden ring above each furniture item while model is in flight
- **Click accuracy** — Invisible bounding-box hit targets on all furniture for reliable selection
- **Deselect on floor** — Click floor to deselect (onClick, not onPointerDown, so gizmo drags don't accidentally clear selection)
- **Responsive scrolling** — Products list scrolls smoothly without squashing cards

### Bug Fixes
| Bug | Fix | Status |
|-----|-----|--------|
| Race condition: placing product before AI finishes | Added `sourceProductId` tracking + `resolveGeneratedModel()` action patches both product library and placed furniture | ✅ Fixed |
| Placeholder invisible on tiny items (33cm) | Switched from `MeshToonMaterial` (18% opacity, needs lighting) to `MeshBasicMaterial` (55%, always visible) | ✅ Fixed |
| No visual feedback during model generation | Added spinning ring indicator above bounding box while `sourceProductId` is set | ✅ Fixed |
| Duplicate test fixture loading | `fixturesLoaded` state flag prevents button from firing twice | ✅ Fixed |
| Products panel wouldn't scroll | Restructured flex layout: scrollable area is `flex-1 min-h-0` direct child of column | ✅ Fixed |
| Transform gizmo couldn't grab red (rotate) handle near floor | Changed floor deselect from `onPointerDown` → `onClick` so drags don't interrupt | ✅ Fixed |

---

## 🚧 Known Issues & Polish TODOs

### Model Generation
- **[ ] Gemini JSON parsing fragility** — Even with `responseMimeType: 'application/json'`, rare cases of prose wrapping still occur
- **[ ] Component bounds validation** — Generated models sometimes slightly exceed bounding box; needs post-processing clamp

### Placeholders
- **[ ] Placeholder material settings** — Currently using basic tan colour; could use product's own color
- **[ ] Rotating furniture before model ready** — Placeholder box doesn't rotate visually (imperative geometry doesn't track rotation)

### UI/UX
- **[ ] No undo/redo** — Placing furniture is permanent until manually removed
- **[ ] No clear indicator of in-progress API calls** — Network-level throttling not visible
- **[ ] Product card visual hierarchy** — Collapsed view could benefit from affordance (e.g., highlight on hover that it's clickable)
- **[ ] Sidebar tab persistence** — Doesn't remember which tab user was on when switching modes

### Performance
- **[ ] No LOD for complex models** — High-component models (15–25 shapes) slow on scroll
- **[ ] No occlusion culling** — Hidden furniture behind walls still renders

---

## 📋 Next Features (Prioritized)

### Phase 2: Import & Library
1. **Real product images in fixtures**
   - Add URLs + image links to [client/src/test/fixtures.json](client/src/test/fixtures.json)
   - Helps with visual regression testing + demo

2. **Furniture search/filter**
   - Filter products by category, price, colour, materials
   - Search by name

3. **Furniture library persistence**
   - Save imported products to localStorage (already persisted via Zustand, but add export/import JSON)
   - Share layouts as `.floorish` files

### Phase 3: Layout & Planning
1. **Measurement tool** — Ruler overlay; measure distances between items
2. **Annotation layers** — Text labels, dimension lines, area highlights
3. **Export floor plan** — PNG/PDF render with dimensions + product list
4. **Layout templates** — Pre-made room configurations (studio, living room, bedroom)

### Phase 4: Rendering & Quality
1. **Textile/material preview**
   - Real fabric textures on upholstery (not just flat colours)
   - Wood grain on tables/chairs
   - Metal finish variations

2. **Lighting scenarios**
   - Time of day presets (dawn, noon, dusk)
   - Light source placement tool
   - Shadow / ambient occlusion for depth

3. **Better camera presets**
   - "Hero shot" (45° isometric view for screenshots)
   - "Walking view" (eye-level first person)
   - Bookmarked camera positions

### Phase 5: Collaboration & Mobile
1. **Multiplayer sync** — Real-time cursor + placement sync over WebSocket
2. **Mobile responsive** — Touch interactions for tablet/phone
3. **AR preview** — View layouts in user's real space (WebXR)
4. **Social sharing** — Shareable room links + embedded previews

---

## 🔧 Technical Debt

| Item | Priority | Notes |
|------|----------|-------|
| Consolidate toon material creation | Low | `getToonGradientMap()` + `toonMat()` work well, but could extract further |
| Type safety (TypeScript) | Medium | Consider TS migration for prod-ready state management |
| Storybook for UI components | Low | ProductCard, StatusBadge, etc. would benefit from isolated testing |
| E2E test suite | Medium | Selenium/Playwright tests for import → place → transform workflows |
| API rate limiting | Medium | Currently no client-side throttling for model generation requests |

---

## 📊 Test Suite

**Regression fixtures:** [client/src/test/fixtures.json](client/src/test/fixtures.json)

7 products covering:
- Simple items (armchair, side table)
- Complex geometry (4×4 shelf with 16 compartments)
- Aspect ratio extremes (tall lamp 35×35×163cm)
- Wide footprints (3-seat sofa, L-sectional)

**Running tests locally:**
1. Click "⚗ Load test fixtures" button in dev build
2. Verify each product card status badge shows "Ready" when generation completes
3. Click "Place" to add to scene and verify bounding box + model geometry

---

## 🛠 Development

**Stack:**
- **Frontend:** React 18, Vite, Tailwind CSS
- **3D:** Three.js, React Three Fiber (@react-three/fiber), @react-three/drei
- **API:** Express.js, Axios
- **AI:** Google Gemini 2.5-flash + fallback to 2.5-flash-lite
- **State:** Zustand (persisted to localStorage)

**Key files:**
- Store: [client/src/store/useStore.js](client/src/store/useStore.js)
- 3D factory: [client/src/utils/furnitureFactory.js](client/src/utils/furnitureFactory.js)
- AI analyzer: [server/ai/analyzer.js](server/ai/analyzer.js)
- Product UI: [client/src/components/ProductPanel.jsx](client/src/components/ProductPanel.jsx)
- Scene: [client/src/components/Scene3D/index.jsx](client/src/components/Scene3D/index.jsx)

---

## 🎯 Success Metrics (Alpha Release)

- [ ] 10+ test products with high-quality AI-generated models
- [ ] Sub-500ms model generation (acceptable latency for user)
- [ ] Furniture placement + transform feels responsive
- [ ] Wall editing accessible to non-technical users
- [ ] Export layout as image/PDF
- [ ] Mobile-responsive sidebar + controls

---

**Status:** Core feature set complete. Ready for broader testing + user feedback on model quality.
