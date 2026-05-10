import { useState } from 'react'
import axios from 'axios'
import useStore from '../store/useStore'
import ProductImporter from './ProductImporter'
import FloorPlanSidebar from './FloorPlanSidebar'
import fixtureData from '../test/fixtures.json'

// ── Status helpers ────────────────────────────────────────────────────────────
function StatusBadge({ product }) {
  if (product.modelGenerating) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-sans text-walnut/60">
        <span className="w-2 h-2 border border-walnut/30 border-t-walnut rounded-full animate-spin" />
        Generating…
      </span>
    )
  }
  if (product.modelComponents?.length > 0) {
    return <span className="text-[10px] font-sans text-sage">✦ Ready</span>
  }
  if (product.modelComponents === null && !product.modelGenerating) {
    return <span className="text-[10px] font-sans text-walnut/40">No model</span>
  }
  return null
}

// ── Collapsible product card ──────────────────────────────────────────────────
function ProductCard({ product }) {
  const placeProduct = useStore((s) => s.placeProduct)
  const removeProduct = useStore((s) => s.removeProduct)
  const [expanded, setExpanded] = useState(false)

  const canPlace = !product.modelGenerating

  return (
    <div className="bg-cream rounded-xl border border-cream-dark overflow-hidden group">
      {/* ── Collapsed row (always visible) ──────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Colour dot */}
        <div
          className="w-3 h-3 rounded-full shrink-0 border border-walnut/20"
          style={{ backgroundColor: product.color?.startsWith('#') ? product.color : '#C4622D' }}
        />

        {/* Name */}
        <span className="text-xs font-sans font-medium text-charcoal truncate flex-1">
          {product.name}
        </span>

        {/* Status */}
        <StatusBadge product={product} />

        {/* Place button (only when ready) */}
        {canPlace && (
          <button
            onClick={(e) => { e.stopPropagation(); placeProduct(product.id) }}
            className="shrink-0 px-2 py-0.5 bg-terra text-cream rounded-md text-[10px] font-sans font-semibold hover:bg-terra-dark transition-colors"
          >
            Place
          </button>
        )}

        {/* Chevron */}
        <svg
          className={`w-3 h-3 text-walnut/40 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* ── Expanded details ────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-cream-dark">
          {/* Image */}
          <div className="w-full aspect-[4/3] bg-warm flex items-center justify-center relative overflow-hidden">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain p-2" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-walnut/30">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span className="text-[10px]">{product.category?.replace(/_/g, ' ')}</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-walnut/60 font-sans">{product.category?.replace(/_/g, ' ')}</span>
              {product.priceUSD && (
                <>
                  <span className="text-walnut/30">·</span>
                  <span className="text-xs text-walnut/60 font-sans">${product.priceUSD}</span>
                </>
              )}
            </div>
            {(product.widthCm || product.depthCm || product.heightCm) && (
              <p className="text-[11px] text-walnut/50 font-sans mt-0.5">
                {[product.widthCm, product.depthCm, product.heightCm].filter(Boolean).join(' × ')} cm
              </p>
            )}
            {product.material && (
              <p className="text-[11px] text-walnut/50 font-sans mt-0.5">{product.material}</p>
            )}
            {product.geometryType && (
              <p className="text-[10px] text-walnut/40 font-sans mt-1">
                Strategy: {product.geometryType}
                {product.generationMeta?.confidenceReason && (
                  <span className="text-walnut/30"> — {product.generationMeta.confidenceReason}</span>
                )}
              </p>
            )}

            <div className="flex gap-1.5 mt-2">
              <button
                onClick={() => placeProduct(product.id)}
                className="flex-1 py-1.5 bg-terra text-cream rounded-lg text-xs font-sans font-semibold hover:bg-terra-dark transition-colors"
              >
                Place in Room
              </button>
              <button
                onClick={() => removeProduct(product.id)}
                className="py-1.5 px-2.5 bg-charcoal/10 text-walnut rounded-lg text-xs font-sans hover:bg-charcoal/20 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Deleted items section ─────────────────────────────────────────────────────
function DeletedSection() {
  const deletedFurniture    = useStore((s) => s.deletedFurniture)
  const restoreFurniture    = useStore((s) => s.restoreFurniture)
  const permanentlyDelete   = useStore((s) => s.permanentlyDelete)
  const clearDeletedFurniture = useStore((s) => s.clearDeletedFurniture)
  const [expanded, setExpanded] = useState(false)

  if (deletedFurniture.length === 0) return null

  return (
    <div className="mx-3 mb-3 shrink-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left py-1.5"
      >
        <svg
          className={`w-3 h-3 text-walnut/40 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-[10px] font-sans font-semibold text-walnut/50 uppercase tracking-wider">
          Recently deleted ({deletedFurniture.length})
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1 mt-1">
          {deletedFurniture.slice().reverse().map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-cream border border-cream-dark"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0 border border-walnut/20 opacity-50"
                style={{ backgroundColor: f.color || '#C4622D' }}
              />
              <span className="text-xs font-sans text-walnut/60 truncate flex-1">
                {f.name}
              </span>
              <button
                onClick={() => restoreFurniture(f.id)}
                className="shrink-0 px-2 py-0.5 bg-sage/15 text-sage rounded-md text-[10px] font-sans font-semibold hover:bg-sage/25 transition-colors"
              >
                Restore
              </button>
              <button
                onClick={() => permanentlyDelete(f.id)}
                className="shrink-0 px-1.5 py-0.5 text-walnut/40 hover:text-red-500 text-[10px] font-sans transition-colors"
                title="Delete permanently"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={clearDeletedFurniture}
            className="text-[10px] font-sans text-walnut/40 hover:text-walnut/60 mt-0.5 text-left px-2.5 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-warm flex items-center justify-center">
        <svg className="w-8 h-8 text-walnut/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </div>
      <div>
        <p className="font-display text-charcoal text-base">No products yet</p>
        <p className="text-xs text-walnut/60 font-sans mt-1 leading-relaxed">
          Import furniture, decor, lamps, plants, mirrors — anything with a URL
        </p>
      </div>
      <button
        onClick={onAdd}
        className="px-5 py-2 bg-terra text-cream rounded-xl text-sm font-sans font-semibold hover:bg-terra-dark transition-colors shadow-warm-sm"
      >
        + Import product
      </button>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function ProductPanel() {
  const sidebarTab = useStore((s) => s.sidebarTab)
  const setSidebarTab = useStore((s) => s.setSidebarTab)
  const addProduct = useStore((s) => s.addProduct)
  const products = useStore((s) => s.products)
  const furniture = useStore((s) => s.furniture)
  const selectedId = useStore((s) => s.selectedId)
  const setSelected = useStore((s) => s.setSelected)
  const selectedItem = furniture.find((f) => f.id === selectedId)
  const removeFurniture = useStore((s) => s.removeFurniture)
  const rotateFurniture = useStore((s) => s.rotateFurniture)

  const [showImporter, setShowImporter] = useState(false)
  const [fixturesLoaded, setFixturesLoaded] = useState(false)

  const loadFixtures = () => {
    if (fixturesLoaded) return
    setFixturesLoaded(true)
    const resolveGeneratedModel = useStore.getState().resolveGeneratedModel
    for (const p of fixtureData.products) {
      const id = crypto.randomUUID()
      addProduct({ ...p, id, modelComponents: null, modelGenerating: true })
      axios.post('/api/generate-model', {
        name: p.name, category: p.category,
        widthCm: p.widthCm, depthCm: p.depthCm, heightCm: p.heightCm,
        color: p.color, material: p.material, imageUrl: p.imageUrl,
      }).then((res) => {
        resolveGeneratedModel(id, res.data.components)
      }).catch(() => {
        resolveGeneratedModel(id, null)
      })
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-warm">
      {/* Tab bar */}
      <div className="flex border-b border-cream-dark shrink-0">
        {[
          { id: 'products', label: 'Products' },
          { id: 'floorplan', label: 'Floor Plan' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSidebarTab(tab.id)}
            className={`flex-1 py-3 text-xs font-sans font-semibold transition-colors ${
              sidebarTab === tab.id
                ? 'text-terra border-b-2 border-terra bg-cream'
                : 'text-walnut/60 hover:text-walnut'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Products tab */}
      {sidebarTab === 'products' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* ── Fixed top section (in-room list + selected inspector) ── */}
          {/* In-room furniture list */}
          {furniture.length > 0 && (
            <div className="mx-3 mt-3 shrink-0">
              <p className="text-[10px] font-sans font-semibold text-walnut/50 uppercase tracking-wider mb-1.5">
                In room ({furniture.length})
              </p>
              <div className="flex flex-col gap-0.5">
                {furniture.map((f) => {
                  const isActive = f.id === selectedId
                  return (
                    <button
                      key={f.id}
                      onClick={() => setSelected(f.id)}
                      className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-terra/10 border border-terra/25'
                          : 'hover:bg-cream-dark border border-transparent'
                      }`}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-walnut/20"
                        style={{ backgroundColor: f.color || '#C4622D' }}
                      />
                      <span className={`text-xs font-sans truncate ${isActive ? 'text-terra font-semibold' : 'text-charcoal'}`}>
                        {f.name}
                      </span>
                      {f.sourceProductId && (
                        <span className="ml-auto shrink-0">
                          <svg className="w-2.5 h-2.5 text-walnut/40 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Selected item inspector */}
          {selectedItem && (
            <div className="mx-3 mt-3 bg-cream rounded-xl border border-terra/30 p-3 shrink-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-sans font-semibold text-terra">Selected</p>
                  <p className="text-sm font-sans font-medium text-charcoal truncate">{selectedItem.name}</p>
                  <p className="text-[11px] text-walnut/60 font-sans">
                    {selectedItem.widthM && `${(selectedItem.widthM * 100).toFixed(0)} × ${(selectedItem.depthM * 100).toFixed(0)} × ${(selectedItem.heightM * 100).toFixed(0)} cm`}
                  </p>
                </div>
                <div
                  className="w-5 h-5 rounded-full border border-walnut/20 shrink-0 mt-0.5"
                  style={{ backgroundColor: selectedItem.color || '#C4622D' }}
                />
              </div>
              <div className="flex gap-1.5 mt-2.5">
                <button
                  onClick={() => rotateFurniture(selectedId)}
                  className="flex-1 py-1.5 bg-warm border border-cream-dark rounded-lg text-[11px] font-sans text-walnut hover:bg-cream-dark transition-colors"
                >
                  ↺ Rotate
                </button>
                <button
                  onClick={() => removeFurniture(selectedId)}
                  className="flex-1 py-1.5 bg-terra/10 border border-terra/20 rounded-lg text-[11px] font-sans text-terra hover:bg-terra/20 transition-colors"
                >
                  Remove
                </button>
              </div>
              {selectedItem.sourceUrl && (
                <a
                  href={selectedItem.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1.5 text-[11px] font-sans text-walnut/50 underline hover:text-walnut truncate"
                >
                  View product →
                </a>
              )}
            </div>
          )}

          {/* ── Scrollable product list ─────────────────────────────── */}
          {showImporter ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-charcoal text-sm">Import Product</h3>
                <button onClick={() => setShowImporter(false)} className="text-walnut/50 hover:text-walnut text-lg leading-none">✕</button>
              </div>
              <ProductImporter onClose={() => setShowImporter(false)} />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {products.length > 0 ? (
                <div className="p-3 flex flex-col gap-2">
                  <button
                    onClick={() => setShowImporter(true)}
                    className="w-full py-2 border-2 border-dashed border-terra/30 rounded-xl text-xs font-sans font-semibold text-terra hover:bg-terra/5 transition-colors shrink-0"
                  >
                    + Import another product
                  </button>
                  {import.meta.env.DEV && !fixturesLoaded && (
                    <button
                      onClick={loadFixtures}
                      className="w-full py-1.5 border border-dashed border-walnut/25 rounded-xl text-[11px] font-sans text-walnut/50 hover:text-walnut hover:border-walnut/40 transition-colors shrink-0"
                    >
                      ⚗ Load test fixtures
                    </button>
                  )}
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              ) : (
                <div className="p-3 flex flex-col gap-3">
                  <EmptyState onAdd={() => setShowImporter(true)} />
                  {import.meta.env.DEV && !fixturesLoaded && (
                    <div className="px-4 pb-4">
                      <button
                        onClick={loadFixtures}
                        className="w-full py-2 border border-dashed border-walnut/25 rounded-xl text-xs font-sans text-walnut/50 hover:text-walnut hover:border-walnut/40 transition-colors"
                      >
                        ⚗ Load test fixtures
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Deleted items ── */}
          <DeletedSection />
        </div>
      )}

      {/* Floor plan tab */}
      {sidebarTab === 'floorplan' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <FloorPlanSidebar />
        </div>
      )}
    </div>
  )
}
