import { useState } from 'react'
import axios from 'axios'
import useStore from '../store/useStore'
import { guessCategory } from '../utils/furnitureFactory'

const CATEGORY_OPTIONS = [
  'sofa','armchair','accent_chair','dining_chair','bar_stool','ottoman','bench',
  'coffee_table','side_table','dining_table','desk','console_table','pedestal_table',
  'dresser','bookshelf','wardrobe','tv_stand','bed',
  'lamp_floor','lamp_arc','lamp_tripod','lamp_table','lamp_pendant','chandelier',
  'mirror_floor','mirror_wall','mirror_round',
  'plant_tall','plant_medium','plant_small','plant_hanging',
  'vase','vase_tall','rug','artwork','sculpture','candle','books_stack','generic',
]

const STEPS = { URL: 'url', FILL: 'fill', DONE: 'done' }

function FieldInput({ label, name, value, onChange, placeholder, type = 'text', required }) {
  return (
    <div>
      <label className="block text-xs font-sans font-semibold text-walnut/80 mb-1">
        {label}{required && <span className="text-terra ml-0.5">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-cream-dark bg-cream text-sm font-sans text-charcoal placeholder-walnut/30 focus:outline-none focus:border-terra transition-colors"
      />
    </div>
  )
}

function CategorySelect({ value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-sans font-semibold text-walnut/80 mb-1">
        Category<span className="text-terra ml-0.5">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-cream-dark bg-cream text-sm font-sans text-charcoal focus:outline-none focus:border-terra transition-colors"
      >
        {CATEGORY_OPTIONS.map((c) => (
          <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
        ))}
      </select>
    </div>
  )
}

const TO_CM = { cm: 1, mm: 0.1, m: 100, in: 2.54, ft: 30.48 }

export default function ProductImporter({ onClose }) {
  const addProduct            = useStore((s) => s.addProduct)
  const updateProduct         = useStore((s) => s.updateProduct)
  const resolveGeneratedModel = useStore((s) => s.resolveGeneratedModel)
  const resolveMeshUrl        = useStore((s) => s.resolveMeshUrl)

  const [step, setStep] = useState(STEPS.URL)
  const [url, setUrl]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [missingFields, setMissingFields] = useState([])
  const [unit, setUnit] = useState('cm')

  const [form, setForm] = useState({
    name: '', category: 'generic', url: '',
    widthCm: '', depthCm: '', heightCm: '',
    color: '#C4622D', material: '', priceUSD: '',
    imageUrl: '',
  })

  const handleField = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const handleUnitChange = (newUnit) => {
    const fromCm = TO_CM[unit]
    const toCm = TO_CM[newUnit]
    const convert = (val) => {
      const num = parseFloat(val)
      if (!val || isNaN(num)) return val
      return String(parseFloat(((num * fromCm) / toCm).toFixed(4)))
    }
    setForm((f) => ({
      ...f,
      widthCm: convert(f.widthCm),
      depthCm: convert(f.depthCm),
      heightCm: convert(f.heightCm),
    }))
    setUnit(newUnit)
  }

  // Step 1: scrape URL
  const handleScrape = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await axios.post('/api/scrape', { url: url.trim() })
      const data = res.data
      setForm({
        name:      data.name      || '',
        category:  data.category  || guessCategory(data.name || ''),
        url:       url.trim(),
        widthCm:   data.widthCm   != null ? String(data.widthCm)  : '',
        depthCm:   data.depthCm   != null ? String(data.depthCm)  : '',
        heightCm:  data.heightCm  != null ? String(data.heightCm) : '',
        color:     data.color     || '#C4622D',
        material:  data.material  || '',
        priceUSD:  data.priceUSD  != null ? String(data.priceUSD) : '',
        imageUrl:  data.imageUrl  || '',
      })
      setMissingFields(data.missingFields || [])
      setStep(STEPS.FILL)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reach the page. Fill in details manually below.')
      setForm((f) => ({ ...f, url: url.trim() }))
      setMissingFields(['name','category','widthCm','depthCm','heightCm'])
      setStep(STEPS.FILL)
    } finally {
      setLoading(false)
    }
  }

  // Step 2: confirm + add to library, then trigger AI model generation
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name) return

    const toCm = (val) => (parseFloat(val) || 0) * TO_CM[unit]
    const productId = crypto.randomUUID()
    const productData = {
      id:       productId,
      name:     form.name,
      category: form.category,
      url:      form.url,
      widthCm:  toCm(form.widthCm)  || 80,
      depthCm:  toCm(form.depthCm)  || 60,
      heightCm: toCm(form.heightCm) || 75,
      color:    form.color,
      material: form.material,
      priceUSD: parseFloat(form.priceUSD) || null,
      imageUrl: form.imageUrl,
      modelComponents: null,       // placeholder until AI is done
      modelGenerating: true,
    }

    addProduct(productData)
    onClose()

    // ── Step 1: Ask Gemini to route + optionally generate primitive components ──
    // Fire-and-forget — does not block the user.
    ;(async () => {
      try {
        const res = await axios.post('/api/generate-model', {
          name:     productData.name,
          category: productData.category,
          widthCm:  productData.widthCm,
          depthCm:  productData.depthCm,
          heightCm: productData.heightCm,
          color:    productData.color,
          material: productData.material,
          imageUrl: productData.imageUrl,
        })

        const { strategy, confidenceReason, fallbackChain, components } = res.data

        // Store routing metadata on the product (may already be placed in scene)
        updateProduct(productId, { geometryType: strategy, generationMeta: { confidenceReason, fallbackChain } })

        if (strategy !== 'mesh') {
          // Primitive or procedural — components are ready
          resolveGeneratedModel(productId, components)
        } else {
          // ── Step 2: Route to Meshy AI for organic/complex assets ──
          console.log(`[Meshy] Initiating mesh generation for "${productData.name}" (strategy: mesh)`)
          try {
            const meshRes = await axios.post('/api/generate-mesh', {
              name:     productData.name,
              category: productData.category,
              widthCm:  productData.widthCm,
              depthCm:  productData.depthCm,
              heightCm: productData.heightCm,
              color:    productData.color,
              material: productData.material,
              imageUrl: productData.imageUrl,
            })
            console.log(`[Meshy] ✓ Mesh URL received for "${productData.name}"`)
            resolveMeshUrl(productId, meshRes.data.meshUrl)
          } catch (meshErr) {
            const errorMsg = meshErr.response?.data?.error || meshErr.message
            console.error(`[Meshy] ✗ Mesh generation failed for "${productData.name}": ${errorMsg}`)
            console.warn(`[Meshy] Falling back to procedural generation (forceProcedural: true)`)
            // Fallback: re-ask Gemini but force procedural components
            try {
              const fallbackRes = await axios.post('/api/generate-model', {
                name:          productData.name,
                category:      productData.category,
                widthCm:       productData.widthCm,
                depthCm:       productData.depthCm,
                heightCm:      productData.heightCm,
                color:         productData.color,
                material:      productData.material,
                imageUrl:      productData.imageUrl,
                forceProcedural: true,
              })
              console.log(`[Meshy] ✓ Fallback procedural generation succeeded for "${productData.name}"`)
              resolveGeneratedModel(productId, fallbackRes.data.components)
            } catch (fallbackErr) {
              console.error(`[Meshy] ✗ Fallback procedural generation also failed:`, fallbackErr.message)
              resolveGeneratedModel(productId, null)
            }
          }
        }
      } catch (err) {
        console.error('Model generation failed:', err.message)
        resolveGeneratedModel(productId, null)
      }
    })()
  }

  const isMissing = (field) => missingFields.includes(field)

  return (
    <div className="flex flex-col gap-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-sans">
        <span className={`flex items-center gap-1.5 ${step === STEPS.URL ? 'text-terra font-semibold' : 'text-walnut/50'}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === STEPS.URL ? 'bg-terra text-cream' : 'bg-cream-dark text-walnut/50'}`}>1</span>
          URL
        </span>
        <span className="text-cream-dark">──</span>
        <span className={`flex items-center gap-1.5 ${step === STEPS.FILL ? 'text-terra font-semibold' : 'text-walnut/50'}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === STEPS.FILL ? 'bg-terra text-cream' : 'bg-cream-dark text-walnut/50'}`}>2</span>
          Details
        </span>
      </div>

      {step === STEPS.URL && (
        <form onSubmit={handleScrape} className="flex flex-col gap-3">
          <p className="text-xs font-sans text-walnut/70 leading-relaxed">
            Paste a product URL from IKEA, Wayfair, Amazon, West Elm, CB2, Article, Facebook Marketplace, or any site — we'll extract the details automatically.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.ikea.com/..."
              required
              className="flex-1 px-3 py-2.5 rounded-lg border border-cream-dark bg-cream text-sm font-sans text-charcoal placeholder-walnut/30 focus:outline-none focus:border-terra transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 bg-terra text-cream rounded-lg text-sm font-sans font-medium hover:bg-terra-dark transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Scraping…
                </span>
              ) : 'Import'}
            </button>
          </div>
          {error && (
            <p className="text-xs text-terra bg-terra/8 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="button"
            onClick={() => setStep(STEPS.FILL)}
            className="text-xs font-sans text-walnut/60 hover:text-walnut underline text-left"
          >
            Skip — fill in manually instead
          </button>
        </form>
      )}

      {step === STEPS.FILL && (
        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          {missingFields.length > 0 && (
            <div className="bg-mustard/15 rounded-lg px-3 py-2 text-xs font-sans text-walnut/80">
              <span className="font-semibold">Heads up:</span> Some fields couldn't be scraped — highlighted below. Fill them in to get the most accurate model.
            </div>
          )}

          {/* Product image preview */}
          {form.imageUrl && (
            <div className="w-full aspect-video rounded-lg overflow-hidden bg-warm border border-cream-dark">
              <img src={form.imageUrl} alt={form.name} className="w-full h-full object-contain" />
            </div>
          )}

          <FieldInput label="Product name" name="name" value={form.name} onChange={handleField} placeholder="e.g. SÖDERHAMN Sofa" required />
          <CategorySelect value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />

          {/* Dimensions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-sans font-semibold text-walnut/80">
                Dimensions ({unit}) — Width × Depth × Height
              </label>
              <select
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value)}
                className="text-xs font-sans text-charcoal bg-cream border border-cream-dark rounded-md px-2 py-0.5 focus:outline-none focus:border-terra"
              >
                <option value="cm">cm</option>
                <option value="mm">mm</option>
                <option value="m">m</option>
                <option value="in">in</option>
                <option value="ft">ft</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number" name="widthCm" value={form.widthCm} onChange={handleField}
                placeholder="W" min="0" step="any"
                className={`px-3 py-2 rounded-lg border text-sm font-sans text-charcoal focus:outline-none focus:border-terra transition-colors bg-cream ${isMissing('widthCm') ? 'border-mustard' : 'border-cream-dark'}`}
              />
              <input
                type="number" name="depthCm" value={form.depthCm} onChange={handleField}
                placeholder="D" min="0" step="any"
                className={`px-3 py-2 rounded-lg border text-sm font-sans text-charcoal focus:outline-none focus:border-terra transition-colors bg-cream ${isMissing('depthCm') ? 'border-mustard' : 'border-cream-dark'}`}
              />
              <input
                type="number" name="heightCm" value={form.heightCm} onChange={handleField}
                placeholder="H" min="0" step="any"
                className={`px-3 py-2 rounded-lg border text-sm font-sans text-charcoal focus:outline-none focus:border-terra transition-colors bg-cream ${isMissing('heightCm') ? 'border-mustard' : 'border-cream-dark'}`}
              />
            </div>
          </div>

          {/* Color */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-sans font-semibold text-walnut/80 mb-1">Primary colour</label>
              <input type="text" name="color" value={form.color} onChange={handleField}
                placeholder="#C4622D or 'terracotta'"
                className="w-full px-3 py-2 rounded-lg border border-cream-dark bg-cream text-sm font-sans text-charcoal focus:outline-none focus:border-terra transition-colors" />
            </div>
            <div className="mt-5">
              <input type="color" value={form.color.startsWith('#') ? form.color : '#C4622D'}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="w-10 h-9 rounded-lg border border-cream-dark cursor-pointer p-0.5 bg-cream" />
            </div>
          </div>

          <FieldInput label="Material" name="material" value={form.material} onChange={handleField} placeholder="e.g. linen, walnut, oak, metal" />
          <FieldInput label="Price (USD)" name="priceUSD" value={form.priceUSD} onChange={handleField} placeholder="e.g. 499" type="number" />
          <FieldInput label="Product URL (for reference)" name="url" value={form.url} onChange={handleField} placeholder="https://..." />
          <FieldInput label="Image URL" name="imageUrl" value={form.imageUrl} onChange={handleField} placeholder="https://..." />

          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => setStep(STEPS.URL)}
              className="flex-1 px-4 py-2.5 bg-warm border border-cream-dark text-charcoal rounded-lg text-sm font-sans hover:bg-cream-dark transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={!form.name}
              className="flex-1 px-4 py-2.5 bg-terra text-cream rounded-lg text-sm font-sans font-semibold hover:bg-terra-dark transition-colors disabled:opacity-40"
            >
              Add to Room
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
