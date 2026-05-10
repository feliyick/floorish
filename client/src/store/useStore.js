import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { findSurfacePlacement } from '../utils/placementUtils'
import { getCompatibilityTags, detectBedSize } from '../utils/assetRouter'

const DEFAULT_WALLS = [
  { id: 'w1', x1: 2,  y1: 2,  x2: 22, y2: 2  },
  { id: 'w2', x1: 22, y1: 2,  x2: 22, y2: 16 },
  { id: 'w3', x1: 22, y1: 16, x2: 2,  y2: 16 },
  { id: 'w4', x1: 2,  y1: 16, x2: 2,  y2: 2  },
]

const useStore = create(
  persist(
    (set, get) => ({
      // ── Floor plan ─────────────────────────────────────────────────────────
      walls: DEFAULT_WALLS,
      scale: 30,
      floorDims: { w: 28, h: 22 },

      draftWalls:   [],
      isDraftMode:  false,

      setWalls:     (walls)     => set({ walls }),
      addWall:      (wall)      => set((s) => ({ walls: [...s.walls, { id: uuid(), ...wall }] })),
      removeWall:   (id)        => set((s) => ({ walls: s.walls.filter((w) => w.id !== id) })),
      updateWall:   (id, patch) => set((s) => ({ walls: s.walls.map((w) => w.id === id ? { ...w, ...patch } : w) })),
      clearWalls:   ()          => set({ walls: [] }),
      setScale:     (scale)     => set({ scale }),
      setFloorDims: (floorDims) => set({ floorDims }),

      setDraftWalls:      (walls)  => set({ draftWalls: walls, isDraftMode: true }),
      confirmDraft:       ()       => set((s) => ({
        walls: [...s.walls, ...s.draftWalls],
        draftWalls: [],
        isDraftMode: false,
      })),
      confirmSingleDraft: (id) => set((s) => {
        const wall = s.draftWalls.find((w) => w.id === id)
        if (!wall) return s
        return {
          walls: [...s.walls, wall],
          draftWalls: s.draftWalls.filter((w) => w.id !== id),
          isDraftMode: s.draftWalls.length > 1,
        }
      }),
      discardDraft:       ()       => set({ draftWalls: [], isDraftMode: false }),

      // ── 3D Furniture ────────────────────────────────────────────────────────
      furniture: [],
      deletedFurniture: [],
      selectedId: null,

      addFurniture: (item) =>
        set((s) => ({
          furniture: [...s.furniture, { id: uuid(), rotation: 0, position: [0, 0, 0], ...item }],
        })),

      updateFurniture: (id, patch) =>
        set((s) => ({
          furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      removeFurniture: (id) =>
        set((s) => {
          const item = s.furniture.find((f) => f.id === id)
          return {
            furniture: s.furniture.filter((f) => f.id !== id),
            selectedId: s.selectedId === id ? null : s.selectedId,
            deletedFurniture: item
              ? [...s.deletedFurniture, { ...item, deletedAt: Date.now() }]
              : s.deletedFurniture,
          }
        }),

      restoreFurniture: (id) =>
        set((s) => {
          const item = s.deletedFurniture.find((f) => f.id === id)
          if (!item) return s
          const { deletedAt, ...restored } = item
          return {
            deletedFurniture: s.deletedFurniture.filter((f) => f.id !== id),
            furniture: [...s.furniture, restored],
          }
        }),

      permanentlyDelete: (id) =>
        set((s) => ({
          deletedFurniture: s.deletedFurniture.filter((f) => f.id !== id),
        })),

      clearDeletedFurniture: () => set({ deletedFurniture: [] }),

      setSelected:   (id) => set({ selectedId: id }),
      clearSelected: ()   => set({ selectedId: null }),

      rotateFurniture: (id, delta = Math.PI / 2) =>
        set((s) => ({
          furniture: s.furniture.map((f) =>
            f.id === id ? { ...f, rotation: f.rotation + delta } : f
          ),
        })),

      // ── Product library ─────────────────────────────────────────────────────
      products: [],

      addProduct: (product) =>
        set((s) => ({
          products: [...s.products, { ...product, id: product.id || uuid() }],
        })),

      updateProduct: (id, patch) =>
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removeProduct: (id) =>
        set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

      placeProduct: (productId) => {
        const { products, furniture, addFurniture, removeProduct } = get()
        const product = products.find((p) => p.id === productId)
        if (!product) return

        const category = product.category || 'generic'
        const newItem = {
          name:            product.name,
          category,
          position:        [0, 0, 0],
          rotation:        0,
          widthM:          product.widthCm  ? product.widthCm  / 100 : 1,
          depthM:          product.depthCm  ? product.depthCm  / 100 : 0.8,
          heightM:         product.heightCm ? product.heightCm / 100 : 0.8,
          color:           product.color    || '#C4622D',
          material:        product.material || 'unknown',
          imageUrl:        product.imageUrl  || null,
          sourceUrl:       product.url       || null,
          priceUSD:        product.priceUSD  || null,
          modelComponents: product.modelComponents || null,
          sourceProductId: product.modelGenerating ? productId : null,
          // Asset creation metadata — carry over from product if generation already finished
          geometryType:      product.geometryType || 'primitive',
          meshUrl:           product.meshUrl || null,
          compatibilityTags: getCompatibilityTags(category),
          semanticSize:      category === 'bed'
            ? detectBedSize(product.name, product.widthCm)
            : null,
          generationMeta:    product.generationMeta || null,
        }

        // Smart placement: put lamps/vases/etc. on the nearest suitable surface
        const surface = findSurfacePlacement(newItem, furniture)
        if (surface) newItem.position = surface.position

        addFurniture(newItem)
        removeProduct(productId)
      },

      // Called by ProductImporter when the AI model generation settles (success or
      // failure). Updates the product if still in the library, and also patches any
      // furniture item that was placed before generation finished.
      resolveGeneratedModel: (productId, components) => {
        set((s) => ({
          products: s.products.map((p) =>
            p.id === productId
              ? { ...p, modelComponents: components ?? null, modelGenerating: false }
              : p
          ),
          furniture: s.furniture.map((f) =>
            f.sourceProductId === productId
              ? { ...f, modelComponents: components ?? null, sourceProductId: null }
              : f
          ),
        }))
      },

      // Called when Meshy AI finishes generating a GLB mesh for a product.
      // Sets meshUrl on both the product (if still in library) and any placed furniture.
      resolveMeshUrl: (productId, meshUrl) => {
        set((s) => ({
          products: s.products.map((p) =>
            p.id === productId
              ? { ...p, meshUrl, modelGenerating: false }
              : p
          ),
          furniture: s.furniture.map((f) =>
            f.sourceProductId === productId
              ? { ...f, meshUrl, sourceProductId: null }
              : f
          ),
        }))
      },

      // ── UI state ────────────────────────────────────────────────────────────
      mode:          '3d',
      activeTool:    'wall',
      cameraMode:    'orbit',
      sidebarTab:    'products',
      transformMode: 'translate',
      displayUnit:   'cm',

      setMode:          (mode)          => set({ mode }),
      setActiveTool:    (activeTool)    => set({ activeTool }),
      setCameraMode:    (cameraMode)    => set({ cameraMode }),
      setSidebarTab:    (sidebarTab)    => set({ sidebarTab }),
      setTransformMode: (transformMode) => set({ transformMode }),
      setDisplayUnit:   (displayUnit)   => set({ displayUnit }),
    }),
    {
      name: 'floorish-state',
      // Persist data but not transient UI state
      partialize: (s) => ({
        walls:            s.walls,
        floorDims:        s.floorDims,
        furniture:        s.furniture,
        deletedFurniture: s.deletedFurniture,
        products:         s.products,
        displayUnit:      s.displayUnit,
      }),
    }
  )
)

export default useStore
