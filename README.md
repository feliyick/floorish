# Floorish

AI-powered interior design tool that turns furniture product URLs into an interactive 3D room scene.

Paste an IKEA (or other retailer) link, and Floorish scrapes product data, generates a 3D representation using AI, and places it in your room layout — all in the browser.

## Current Features

- **URL-based product ingestion** — paste a product link (e.g. IKEA), the server scrapes name, dimensions, price, color, material, and image
- **AI floor plan analysis** — upload a floor plan image and Gemini extracts room dimensions and wall layout
- **Multi-strategy 3D asset generation** — Gemini Vision analyzes each product image and routes to the best strategy:
  - *Primitive* — flat/geometric items (rugs, flat artwork)
  - *Procedural* — boxy canonical geometry built from boxes, cylinders, spheres, tori
  - *Mesh* — Meshy AI image-to-3D GLB generation for complex/organic shapes (passes actual product images for high fidelity)
- **Image-to-3D prioritization** — Meshy uses product images when available (higher fidelity), falls back to text-only generation when needed
- **GLB grounding normalization** — Automatically corrects model pivot/origin so all furniture sits flush on the floor
- **PBR material generation** — Meshy models include metallic, roughness, and normal maps for realistic materials
- **Three.js scene rendering** — React Three Fiber scene with orbit controls, shadows, ambient + directional lighting
- **Interactive room editing** — 2D floor plan editor for drawing walls, doors, and windows
- **Drag and drop furniture placement** — click to select, drag to reposition, rotate via overlay controls
- **Placeholder loading system** — amber wireframe bounding box + spinning ring while assets generate
- **Automatic fallback chain** — if Meshy fails, re-requests Gemini with `forceProcedural` to guarantee a visual result
- **GLB caching** — server-side in-memory cache of generated models to avoid CORS issues and reduce bandwidth

## Architecture Overview

```
Product URL
  |
  v
Server: /api/scrape
  |- Cheerio HTML parsing + Gemini AI extraction
  v
Client: ProductImporter form (user reviews/edits)
  |
  v
Server: /api/generate-model
  |- Gemini Vision analyzes product image
  |- Returns routing decision: { strategy, confidenceReason, fallbackChain }
  |- If primitive/procedural: also returns component geometry
  v
Client branches on strategy:
  |- primitive/procedural --> resolveGeneratedModel() --> Three.js primitives
  |- mesh --> Server: /api/generate-mesh
                 |- Meshy AI image-to-3D (passes actual product image)
                 |- Falls back to text-to-3D if no image available
                 |- Async polling ~30-90s
                 |- GLB cached in-memory, served via local proxy URL
                 v
              resolveMeshUrl() --> useGLTF loads GLB, grounding normalization applied
```

## Asset Routing Logic

Routing is **LLM-determined per product**, not category-based. Gemini inspects the actual product image and decides:

| Strategy | When used | Example |
|----------|-----------|---------|
| `primitive` | Flat/geometric, no real 3D volume | Rugs, flat wall art |
| `procedural` | Boxy canonical geometry — rectangular panels, standard legs, no curves | Simple IKEA bookshelf, basic dining table |
| `mesh` (default) | Curves, organic form, distinctive silhouette, decorative detail, or uncertainty | Designer chairs, lamps, sofas, sculptural shelving |

Even canonically structured categories (e.g. "bookshelf") can route to mesh if the specific product has artistic/curved form. The LLM makes that call by looking at the image.

Each routing decision includes:
- `strategy` — which pipeline to use
- `confidenceReason` — one-sentence explanation of why
- `fallbackChain` — ordered list of fallback strategies if the primary fails

## Project Structure

```
floorish/
  client/                          # React + Vite frontend
    src/
      components/
        Header.jsx                 # Top navigation bar
        ProductPanel.jsx           # Sidebar product list
        ProductImporter.jsx        # URL import wizard + generation dispatch
        FloorPlanEditor.jsx        # 2D wall/door/window editor
        Scene3D/
          index.jsx                # R3F Canvas, orbit controls, drag system
          FurnitureModel.jsx       # Renders items as primitives or GLB
          Room.jsx                 # 3D room walls/floor from floor plan
          Lighting.jsx             # Scene lighting setup
      store/
        useStore.js                # Zustand store (products, furniture, room state)
      utils/
        furnitureFactory.js        # Builds Three.js geometry from component arrays
        assetRouter.js             # Compatibility tags + bed size helpers
        placementUtils.js          # Wall grid coord conversions
  server/                          # Express backend
    ai/
      analyzer.js                  # Gemini prompts (scrape extraction, floor plan, model generation)
      meshyClient.js               # Meshy AI task creation + polling
    routes/
      scrape.js                    # /api/scrape — product page scraping
      analyze.js                   # /api/analyze-floor-plan — floor plan image analysis
      generate.js                  # /api/generate-model — AI routing + component generation
      generate-mesh.js             # /api/generate-mesh — Meshy image-to-3D + GLB proxy caching
    scrapers/
      index.js                     # Cheerio + AI product extraction
    index.js                       # Express app setup
```

## Setup

```bash
# Install dependencies
npm install

# Configure API keys
cp server/.env.example server/.env
# Add your GEMINI_API_KEY and MESHY_API_KEY

# Start dev servers (client + server concurrently)
npm run dev
```

Requires:
- **GEMINI_API_KEY** — Google Gemini API key (required for all AI features)
- **MESHY_API_KEY** — Meshy AI API key (required for mesh generation; procedural fallback works without it)

## Known Limitations & Next Steps

**Current limitations**:
- GLB materials are not recolored to match product color — always render at Meshy's default
- Surface placement uses manual compatibility tags, not learned from product hierarchy
- Material abstraction differs between procedural (toonMat) and mesh (GLB PBR) — no unified material system
- No persistent asset cache across server restarts (in-memory only)

**High-priority improvements**:
- **Material recoloring** — Apply `color` from product to GLB materials after loading
- **Surface placement** — Auto-place lamps/vases on tables using `compatibilityTags` and height-based detection
- **Unified material system** — Abstract material handling so procedural and GLB items behave consistently
- **Persistent caching** — Store generated GLBs to disk and reuse across server restarts
- **Component hierarchy** — Meshy models include semantic component info (legs, seat, back); surface placement could use this

**Future exploration**:
- **Semantic object graph** — component-level hierarchy (cushions, frames, lampshades) with typed relationships
- **Multiple mesh variants** — style switching between different 3D interpretations of the same product
- **Dimension normalization** — better extraction and standardization of real-world product specs across retailers
- **UV-safe recoloring** — modify material colors on imported GLB meshes while preserving UV mapping
