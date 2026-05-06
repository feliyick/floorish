import { useRef, useEffect, useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import useStore from '../store/useStore'

const CELL_SIZE_PX = 30   // pixels per grid cell (each cell = 20cm)
const CELL_M = 0.2        // metres per cell
const WALL_COLOR = '#1C1C1C'
const GRID_COLOR = '#E8DFD0'
const GRID_ACCENT = '#D4C5B0'
const SNAP_RADIUS = 0.6   // cells

function snapToGrid(val) {
  return Math.round(val)
}

export default function FloorPlanEditor() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [bgImage, setBgImage] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeToast, setAnalyzeToast] = useState(null) // { type: 'success'|'error', msg: string }
  const [hoveredWall, setHoveredWall] = useState(null)
  const [previewWall, setPreviewWall] = useState(null)
  const [mouseCell, setMouseCell] = useState(null)
  const drawStart = useRef(null)
  const animRef = useRef(null)

  const walls = useStore((s) => s.walls)
  const floorDims = useStore((s) => s.floorDims)
  const activeTool = useStore((s) => s.activeTool)
  const addWall = useStore((s) => s.addWall)
  const removeWall = useStore((s) => s.removeWall)
  const clearWalls = useStore((s) => s.clearWalls)
  const setWalls = useStore((s) => s.setWalls)
  const setFloorDims = useStore((s) => s.setFloorDims)
  const setActiveTool = useStore((s) => s.setActiveTool)
  const scale = useStore((s) => s.scale)

  const canvasW = floorDims.w * CELL_SIZE_PX
  const canvasH = floorDims.h * CELL_SIZE_PX

  // ── Render ────────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvasW, canvasH)

    // Background image
    if (bgImage) {
      ctx.globalAlpha = 0.28
      ctx.drawImage(bgImage, 0, 0, canvasW, canvasH)
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = '#FAF6EF'
      ctx.fillRect(0, 0, canvasW, canvasH)
    }

    // Grid
    ctx.strokeStyle = GRID_COLOR
    ctx.lineWidth = 1
    for (let x = 0; x <= floorDims.w; x++) {
      ctx.beginPath()
      ctx.moveTo(x * CELL_SIZE_PX, 0)
      ctx.lineTo(x * CELL_SIZE_PX, canvasH)
      ctx.stroke()
    }
    for (let y = 0; y <= floorDims.h; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * CELL_SIZE_PX)
      ctx.lineTo(canvasW, y * CELL_SIZE_PX)
      ctx.stroke()
    }

    // Accent every 5 cells
    ctx.strokeStyle = GRID_ACCENT
    ctx.lineWidth = 1.5
    for (let x = 0; x <= floorDims.w; x += 5) {
      ctx.beginPath()
      ctx.moveTo(x * CELL_SIZE_PX, 0)
      ctx.lineTo(x * CELL_SIZE_PX, canvasH)
      ctx.stroke()
    }
    for (let y = 0; y <= floorDims.h; y += 5) {
      ctx.beginPath()
      ctx.moveTo(0, y * CELL_SIZE_PX)
      ctx.lineTo(canvasW, y * CELL_SIZE_PX)
      ctx.stroke()
    }

    // Drawn walls
    walls.forEach((wall) => {
      const isHovered = hoveredWall === wall.id
      ctx.strokeStyle = isHovered && activeTool === 'erase'
        ? '#C4622D'
        : WALL_COLOR
      ctx.lineWidth = isHovered ? 7 : 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(wall.x1 * CELL_SIZE_PX, wall.y1 * CELL_SIZE_PX)
      ctx.lineTo(wall.x2 * CELL_SIZE_PX, wall.y2 * CELL_SIZE_PX)
      ctx.stroke()

      // Dimension label
      if (isHovered || activeTool === 'select') {
        const dx = wall.x2 - wall.x1
        const dy = wall.y2 - wall.y1
        const len = Math.sqrt(dx * dx + dy * dy) * CELL_M
        const midX = (wall.x1 + wall.x2) / 2 * CELL_SIZE_PX
        const midY = (wall.y1 + wall.y2) / 2 * CELL_SIZE_PX
        ctx.save()
        ctx.fillStyle = '#FAF6EF'
        ctx.strokeStyle = '#1C1C1C'
        ctx.lineWidth = 0.5
        const label = `${(len * 100).toFixed(0)} cm`
        ctx.font = '600 11px "DM Sans", sans-serif'
        const tw = ctx.measureText(label).width
        ctx.fillRect(midX - tw / 2 - 5, midY - 10, tw + 10, 18)
        ctx.fillStyle = '#1C1C1C'
        ctx.fillText(label, midX - tw / 2, midY + 4)
        ctx.restore()
      }
    })

    // Preview wall while drawing
    if (previewWall) {
      ctx.strokeStyle = '#C4622D'
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.setLineDash([8, 5])
      ctx.beginPath()
      ctx.moveTo(previewWall.x1 * CELL_SIZE_PX, previewWall.y1 * CELL_SIZE_PX)
      ctx.lineTo(previewWall.x2 * CELL_SIZE_PX, previewWall.y2 * CELL_SIZE_PX)
      ctx.stroke()
      ctx.setLineDash([])

      // Live dimension
      const dx = previewWall.x2 - previewWall.x1
      const dy = previewWall.y2 - previewWall.y1
      const len = Math.sqrt(dx * dx + dy * dy) * CELL_M
      const midX = (previewWall.x1 + previewWall.x2) / 2 * CELL_SIZE_PX
      const midY = (previewWall.y1 + previewWall.y2) / 2 * CELL_SIZE_PX
      ctx.save()
      ctx.fillStyle = '#C4622D'
      ctx.font = '700 12px "DM Sans", sans-serif'
      const label = `${(len * 100).toFixed(0)} cm`
      const tw = ctx.measureText(label).width
      ctx.fillStyle = '#FAF6EF'
      ctx.fillRect(midX - tw / 2 - 5, midY - 10, tw + 10, 18)
      ctx.fillStyle = '#C4622D'
      ctx.fillText(label, midX - tw / 2, midY + 4)
      ctx.restore()
    }

    // Cursor snap point
    if (mouseCell && activeTool === 'wall') {
      ctx.beginPath()
      ctx.arc(mouseCell.x * CELL_SIZE_PX, mouseCell.y * CELL_SIZE_PX, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#C4622D'
      ctx.fill()
    }

    // Scale bar (bottom left)
    const barCells = 5
    const barPx = barCells * CELL_SIZE_PX
    const bx = 16
    const by = canvasH - 18
    ctx.fillStyle = '#1C1C1C'
    ctx.fillRect(bx, by - 4, barPx, 3)
    ctx.fillRect(bx, by - 9, 2, 10)
    ctx.fillRect(bx + barPx, by - 9, 2, 10)
    ctx.font = '10px "DM Sans", sans-serif'
    ctx.fillText(`${(barCells * CELL_M * 100).toFixed(0)} cm`, bx + barPx / 2 - 14, by + 8)

  }, [walls, bgImage, hoveredWall, previewWall, mouseCell, activeTool, canvasW, canvasH, floorDims])

  // Trigger render on each change
  useEffect(() => {
    render()
  }, [render])

  // ── Mouse event helpers ───────────────────────────────────────────────────
  function getCellFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    return {
      x: snapToGrid(px / CELL_SIZE_PX),
      y: snapToGrid(py / CELL_SIZE_PX),
    }
  }

  function findWallNear(cell) {
    const r = 0.6
    return walls.find((w) => {
      // Point-to-segment distance
      const dx = w.x2 - w.x1
      const dy = w.y2 - w.y1
      const lenSq = dx * dx + dy * dy
      if (lenSq === 0) return false
      const t = Math.max(0, Math.min(1, ((cell.x - w.x1) * dx + (cell.y - w.y1) * dy) / lenSq))
      const px = w.x1 + t * dx
      const py = w.y1 + t * dy
      const dist = Math.sqrt((cell.x - px) ** 2 + (cell.y - py) ** 2)
      return dist < r
    })
  }

  const onMouseDown = (e) => {
    const cell = getCellFromEvent(e)
    if (activeTool === 'wall') {
      drawStart.current = cell
    } else if (activeTool === 'erase') {
      const w = findWallNear(cell)
      if (w) removeWall(w.id)
    }
  }

  const onMouseMove = (e) => {
    const cell = getCellFromEvent(e)
    setMouseCell(cell)

    if (activeTool === 'wall' && drawStart.current) {
      setPreviewWall({ x1: drawStart.current.x, y1: drawStart.current.y, x2: cell.x, y2: cell.y })
    }

    if (activeTool === 'erase') {
      const w = findWallNear(cell)
      setHoveredWall(w ? w.id : null)
    } else {
      setHoveredWall(null)
    }
  }

  const onMouseUp = (e) => {
    if (activeTool === 'wall' && drawStart.current) {
      const cell = getCellFromEvent(e)
      const dx = cell.x - drawStart.current.x
      const dy = cell.y - drawStart.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 0.8) {
        addWall({ x1: drawStart.current.x, y1: drawStart.current.y, x2: cell.x, y2: cell.y })
      }
      drawStart.current = null
      setPreviewWall(null)
    }
  }

  const onMouseLeave = () => {
    setPreviewWall(null)
    setMouseCell(null)
    drawStart.current = null
  }

  // ── Background image upload + AI analysis ────────────────────────────────
  const showToast = (type, msg) => {
    setAnalyzeToast({ type, msg })
    setTimeout(() => setAnalyzeToast(null), 5000)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [] },
    noClick: true,
    onDrop: async (files) => {
      const file = files[0]
      if (!file) return

      // Show image as reference background immediately
      const objectUrl = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => setBgImage(img)
      img.src = objectUrl

      // Send to AI for floor plan analysis
      setAnalyzing(true)
      try {
        const formData = new FormData()
        formData.append('image', file)
        const res = await axios.post('/api/analyze-floor-plan', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        const { walls: newWalls, suggestedFloorDims } = res.data
        if (newWalls && newWalls.length > 0) {
          setWalls(newWalls.map((w, i) => ({ id: `ai-${i}`, ...w })))
          if (suggestedFloorDims) setFloorDims(suggestedFloorDims)
          showToast('success', `Room layout generated — ${newWalls.length} wall segments detected`)
        } else {
          showToast('error', 'AI couldn\'t detect walls in this image. Draw them manually.')
        }
      } catch (err) {
        console.error('Floor plan analysis failed:', err)
        showToast('error', err.response?.data?.error || 'AI analysis failed. You can still trace walls manually.')
      } finally {
        setAnalyzing(false)
      }
    },
  })

  const cursorClass = {
    wall: 'canvas-wall',
    erase: 'canvas-erase',
    select: 'canvas-select',
  }[activeTool] || 'canvas-select'

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-warm border-b border-cream-dark shrink-0">
        <span className="text-xs font-sans font-semibold text-walnut/70 mr-1 uppercase tracking-wide">Tool</span>
        {[
          { id: 'wall',   label: 'Draw Wall', icon: '▬' },
          { id: 'erase',  label: 'Erase',     icon: '✕' },
          { id: 'select', label: 'Select',    icon: '↖' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTool(t.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-all ${
              activeTool === t.id
                ? 'bg-terra text-cream shadow-warm-sm'
                : 'bg-cream text-charcoal hover:bg-cream-dark'
            }`}
          >
            <span className="mr-1">{t.icon}</span>{t.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Upload reference image */}
        <label
          {...getRootProps()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cream rounded-md text-xs font-sans text-walnut cursor-pointer hover:bg-cream-dark transition-colors"
        >
          <input {...getInputProps()} />
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Upload reference
        </label>

        {bgImage && (
          <button
            onClick={() => setBgImage(null)}
            className="px-2 py-1.5 text-xs font-sans text-terra hover:text-terra-dark"
          >
            Clear ref
          </button>
        )}

        <button
          onClick={clearWalls}
          className="px-3 py-1.5 bg-cream rounded-md text-xs font-sans text-walnut hover:bg-cream-dark transition-colors"
        >
          Clear all
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative overflow-auto bg-cream/60 flex items-center justify-center p-4" {...getRootProps()}>
        {/* Drop target overlay */}
        {isDragActive && (
          <div className="absolute inset-0 bg-terra/10 border-2 border-dashed border-terra z-10 flex items-center justify-center pointer-events-none">
            <p className="font-display text-terra text-lg">Drop floor plan image — AI will generate the layout</p>
          </div>
        )}

        {/* AI analysis loading overlay */}
        {analyzing && (
          <div className="absolute inset-0 bg-cream/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-terra/30 border-t-terra rounded-full animate-spin" />
            <p className="font-sans text-sm text-walnut font-medium">Analysing floor plan…</p>
            <p className="font-sans text-xs text-walnut/60">AI is detecting walls and room layout</p>
          </div>
        )}

        {/* Toast notification */}
        {analyzeToast && (
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-xl shadow-warm font-sans text-sm font-medium flex items-center gap-2 ${
            analyzeToast.type === 'success'
              ? 'bg-sage/20 text-sage border border-sage/30'
              : 'bg-terra/10 text-terra border border-terra/20'
          }`}>
            <span>{analyzeToast.type === 'success' ? '✓' : '!'}</span>
            {analyzeToast.msg}
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          className={`${cursorClass} rounded shadow-warm border border-cream-dark`}
          style={{ imageRendering: 'pixelated' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        />
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 bg-warm border-t border-cream-dark shrink-0 flex gap-4 text-xs font-sans text-walnut/60">
        <span>{walls.length} wall{walls.length !== 1 ? 's' : ''}</span>
        <span>Grid: {floorDims.w} × {floorDims.h} cells (1 cell = 20 cm)</span>
        <span className="ml-auto">Drop a floor plan image — AI will auto-generate the layout</span>
      </div>
    </div>
  )
}
