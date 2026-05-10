import { useState, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import useStore from '../store/useStore'

const ANALYZE_STAGES = [
  { label: 'Uploading image...', pct: 5 },
  { label: 'AI is examining the floor plan...', pct: 20 },
  { label: 'Detecting walls and boundaries...', pct: 45 },
  { label: 'Estimating room dimensions...', pct: 65 },
  { label: 'Generating wall segments...', pct: 80 },
  { label: 'Almost there...', pct: 92 },
]
const STAGE_DELAYS = [0, 1500, 4000, 7000, 10000, 15000]

export default function FloorPlanSidebar() {
  const walls          = useStore((s) => s.walls)
  const floorDims      = useStore((s) => s.floorDims)
  const activeTool     = useStore((s) => s.activeTool)
  const setActiveTool  = useStore((s) => s.setActiveTool)
  const clearWalls     = useStore((s) => s.clearWalls)
  const setWalls       = useStore((s) => s.setWalls)
  const setFloorDims   = useStore((s) => s.setFloorDims)
  const removeWall     = useStore((s) => s.removeWall)
  const displayUnit    = useStore((s) => s.displayUnit)
  const setDisplayUnit = useStore((s) => s.setDisplayUnit)
  const draftWalls      = useStore((s) => s.draftWalls)
  const isDraftMode     = useStore((s) => s.isDraftMode)
  const setDraftWalls   = useStore((s) => s.setDraftWalls)
  const confirmDraft    = useStore((s) => s.confirmDraft)
  const confirmSingleDraft = useStore((s) => s.confirmSingleDraft)
  const discardDraft    = useStore((s) => s.discardDraft)

  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeStage, setAnalyzeStage] = useState(0)
  const stageTimers = useRef([])
  const [toast, setToast] = useState(null)

  // Advance through timed analysis stages
  useEffect(() => {
    if (analyzing) {
      setAnalyzeStage(0)
      stageTimers.current = STAGE_DELAYS.map((delay, i) =>
        setTimeout(() => setAnalyzeStage(i), delay)
      )
    } else {
      stageTimers.current.forEach(clearTimeout)
      stageTimers.current = []
    }
    return () => stageTimers.current.forEach(clearTimeout)
  }, [analyzing])

  const CELL_M = 0.2
  const FACTORS = { m: 1, cm: 100, mm: 1000, in: 39.3701, ft: 3.28084 }
  const formatLen = (metres) => {
    const val = metres * (FACTORS[displayUnit] || 100)
    return `${val.toFixed(displayUnit === 'm' ? 2 : 0)} ${displayUnit}`
  }

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 5000)
  }

  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': [] },
    onDrop: async (files) => {
      const file = files[0]
      if (!file) return

      // Dispatch background image to the editor via a custom event
      const objectUrl = URL.createObjectURL(file)
      window.dispatchEvent(new CustomEvent('floorplan-bg-image', { detail: objectUrl }))

      setAnalyzing(true)
      try {
        const formData = new FormData()
        formData.append('image', file)
        const res = await axios.post('/api/analyze-floor-plan', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        const { walls: newWalls, suggestedFloorDims } = res.data
        if (newWalls && newWalls.length > 0) {
          // Put AI walls into draft layer for user review
          setDraftWalls(newWalls.map((w, i) => ({ id: `ai-${i}`, ...w })))
          if (suggestedFloorDims) setFloorDims(suggestedFloorDims)
          showToast('success', `${newWalls.length} walls detected — review and confirm below`)
        } else {
          showToast('error', 'No walls detected. Draw them manually.')
        }
      } catch (err) {
        console.error('Floor plan analysis failed:', err)
        showToast('error', err.response?.data?.error || 'AI analysis failed.')
      } finally {
        setAnalyzing(false)
      }
    },
  })

  return (
    <div className="flex flex-col h-full">
      {/* Tool palette */}
      <div className="px-3 py-3 border-b border-cream-dark shrink-0">
        <p className="text-[10px] font-sans font-semibold text-walnut/50 uppercase tracking-wider mb-2">
          Tools
        </p>
        <div className="flex gap-1.5">
          {[
            { id: 'wall',   label: 'Draw', icon: '▬' },
            { id: 'erase',  label: 'Erase', icon: '✕' },
            { id: 'select', label: 'Select', icon: '↖' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              className={`flex-1 py-1.5 rounded-md text-xs font-sans font-medium transition-all ${
                activeTool === t.id
                  ? 'bg-terra text-cream shadow-warm-sm'
                  : 'bg-cream text-charcoal hover:bg-cream-dark'
              }`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload + AI analyze */}
      <div className="px-3 py-3 border-b border-cream-dark shrink-0">
        <div {...getRootProps()} className="cursor-pointer">
          <input {...getInputProps()} />
          <div className={`flex flex-col items-center gap-2 py-4 border-2 border-dashed rounded-xl transition-colors ${
            analyzing ? 'border-terra/40 bg-terra/5' : 'border-cream-dark hover:border-terra/30 hover:bg-terra/5'
          }`}>
            {analyzing ? (
              <div className="flex flex-col items-center gap-2 w-full px-3">
                <div className="w-5 h-5 border-2 border-terra/30 border-t-terra rounded-full animate-spin" />
                <p className="text-xs font-sans text-walnut font-medium">
                  {ANALYZE_STAGES[analyzeStage]?.label || 'Processing...'}
                </p>
                {/* Progress bar */}
                <div className="w-full h-1 bg-cream-dark rounded-full overflow-hidden">
                  <div
                    className="h-full bg-terra rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${ANALYZE_STAGES[analyzeStage]?.pct || 5}%` }}
                  />
                </div>
                <p className="text-[10px] font-sans text-walnut/40">
                  Step {analyzeStage + 1} of {ANALYZE_STAGES.length}
                </p>
              </div>
            ) : (
              <>
                <svg className="w-5 h-5 text-walnut/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs font-sans text-walnut/60">Upload floor plan image</p>
                <p className="text-[10px] font-sans text-walnut/40">AI will generate approximate layout</p>
              </>
            )}
          </div>
        </div>

        {toast && (
          <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-sans font-medium ${
            toast.type === 'success'
              ? 'bg-sage/15 text-sage'
              : 'bg-terra/10 text-terra'
          }`}>
            {toast.msg}
          </div>
        )}
      </div>

      {/* Draft walls confirmation panel */}
      {isDraftMode && draftWalls.length > 0 && (
        <div className="px-3 py-3 border-b border-cream-dark shrink-0 bg-sage/5">
          <p className="text-xs font-sans font-semibold text-sage mb-2">
            AI Draft — {draftWalls.length} wall{draftWalls.length !== 1 ? 's' : ''} detected
          </p>
          <p className="text-[10px] font-sans text-walnut/60 mb-3 leading-relaxed">
            Review the dashed green walls on the canvas. Accept all, accept individually, or discard and draw manually.
          </p>

          <div className="flex flex-col gap-1 mb-3 max-h-32 overflow-y-auto">
            {draftWalls.map((w) => {
              const dx = w.x2 - w.x1
              const dy = w.y2 - w.y1
              const lenM = Math.sqrt(dx * dx + dy * dy) * CELL_M
              return (
                <div key={w.id} className="flex items-center gap-2 px-2 py-1 rounded bg-cream/80 text-xs font-sans">
                  <div className="w-3 h-0.5 bg-sage rounded-full shrink-0" />
                  <span className="text-walnut/60 flex-1">{formatLen(lenM)}</span>
                  <button
                    onClick={() => confirmSingleDraft(w.id)}
                    className="text-[10px] text-sage font-semibold hover:text-sage/80 transition-colors"
                  >
                    Accept
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={confirmDraft}
              className="flex-1 py-1.5 bg-sage text-cream rounded-lg text-xs font-sans font-semibold hover:bg-sage/90 transition-colors"
            >
              Accept All
            </button>
            <button
              onClick={discardDraft}
              className="flex-1 py-1.5 bg-cream border border-cream-dark text-walnut rounded-lg text-xs font-sans hover:bg-cream-dark transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Units + Grid */}
      <div className="px-3 py-3 border-b border-cream-dark shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-sans font-semibold text-walnut/50 uppercase tracking-wider">
            Units
          </p>
          <select
            value={displayUnit}
            onChange={(e) => setDisplayUnit(e.target.value)}
            className="text-xs font-sans text-charcoal bg-cream border border-cream-dark rounded-md px-2 py-0.5 focus:outline-none focus:border-terra"
          >
            <option value="cm">cm</option>
            <option value="mm">mm</option>
            <option value="m">m</option>
            <option value="in">in</option>
            <option value="ft">ft</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs font-sans text-walnut/60">
          <span>Grid: {floorDims.w} × {floorDims.h} cells</span>
          <span className="text-walnut/30">·</span>
          <span>Room: {formatLen(floorDims.w * CELL_M)} × {formatLen(floorDims.h * CELL_M)}</span>
        </div>
      </div>

      {/* Wall list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-sans font-semibold text-walnut/50 uppercase tracking-wider">
              Walls ({walls.length})
            </p>
            {walls.length > 0 && (
              <button
                onClick={clearWalls}
                className="text-[10px] font-sans text-walnut/40 hover:text-terra transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {walls.length === 0 ? (
            <p className="text-xs font-sans text-walnut/40 text-center py-4">
              No walls yet. Draw on the canvas or upload a floor plan.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {walls.map((w) => {
                const dx = w.x2 - w.x1
                const dy = w.y2 - w.y1
                const lenM = Math.sqrt(dx * dx + dy * dy) * CELL_M
                return (
                  <div
                    key={w.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-cream border border-cream-dark text-xs font-sans"
                  >
                    <div className="w-4 h-0.5 bg-charcoal rounded-full shrink-0" />
                    <span className="text-walnut/60 flex-1">{formatLen(lenM)}</span>
                    <button
                      onClick={() => removeWall(w.id)}
                      className="text-walnut/30 hover:text-red-500 transition-colors text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
