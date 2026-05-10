import { useRef, useEffect, useCallback, useState } from 'react'
import useStore from '../store/useStore'

const CELL_SIZE_PX = 30   // pixels per grid cell (each cell = 20cm)
const CELL_M = 0.2        // metres per cell
const WALL_COLOR = '#1C1C1C'
const GRID_COLOR = '#E8DFD0'
const GRID_ACCENT = '#D4C5B0'

const UNIT_FACTORS = { m: 1, cm: 100, mm: 1000, in: 39.3701, ft: 3.28084 }

function snapToGrid(val) {
  return Math.round(val)
}

export default function FloorPlanEditor() {
  const canvasRef = useRef(null)
  const [bgImage, setBgImage] = useState(null)
  const [hoveredWall, setHoveredWall] = useState(null)
  const [previewWall, setPreviewWall] = useState(null)
  const [mouseCell, setMouseCell] = useState(null)
  const [selectedWallId, setSelectedWallId] = useState(null)
  const [wallDragState, setWallDragState] = useState(null)
  const drawStart = useRef(null)

  const walls       = useStore((s) => s.walls)
  const floorDims   = useStore((s) => s.floorDims)
  const activeTool  = useStore((s) => s.activeTool)
  const addWall     = useStore((s) => s.addWall)
  const removeWall  = useStore((s) => s.removeWall)
  const updateWall  = useStore((s) => s.updateWall)
  const displayUnit = useStore((s) => s.displayUnit)
  const draftWalls  = useStore((s) => s.draftWalls)

  const canvasW = floorDims.w * CELL_SIZE_PX
  const canvasH = floorDims.h * CELL_SIZE_PX

  // Format a length in metres to the user's chosen unit
  const formatLen = useCallback((metres) => {
    const factor = UNIT_FACTORS[displayUnit] || 100
    const val = metres * factor
    return `${val.toFixed(displayUnit === 'm' ? 2 : 0)} ${displayUnit}`
  }, [displayUnit])

  // Listen for background image from sidebar upload
  useEffect(() => {
    const handler = (e) => {
      const url = e.detail
      const img = new Image()
      img.onload = () => setBgImage(img)
      img.src = url
    }
    window.addEventListener('floorplan-bg-image', handler)
    return () => window.removeEventListener('floorplan-bg-image', handler)
  }, [])

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
      const isSelected = selectedWallId === wall.id
      ctx.strokeStyle = isSelected ? '#3B82F6'
        : isHovered && activeTool === 'erase' ? '#C4622D'
        : WALL_COLOR
      ctx.lineWidth = isSelected ? 7 : isHovered ? 7 : 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(wall.x1 * CELL_SIZE_PX, wall.y1 * CELL_SIZE_PX)
      ctx.lineTo(wall.x2 * CELL_SIZE_PX, wall.y2 * CELL_SIZE_PX)
      ctx.stroke()

      // Endpoint handles for selected wall
      if (isSelected && activeTool === 'select') {
        ctx.fillStyle = '#3B82F6'
        ;[{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }].forEach((pt) => {
          ctx.beginPath()
          ctx.arc(pt.x * CELL_SIZE_PX, pt.y * CELL_SIZE_PX, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 2
          ctx.stroke()
        })
      }

      // Dimension label
      if (isHovered || isSelected || activeTool === 'select') {
        const dx = wall.x2 - wall.x1
        const dy = wall.y2 - wall.y1
        const lenM = Math.sqrt(dx * dx + dy * dy) * CELL_M
        const midX = (wall.x1 + wall.x2) / 2 * CELL_SIZE_PX
        const midY = (wall.y1 + wall.y2) / 2 * CELL_SIZE_PX
        ctx.save()
        ctx.fillStyle = '#FAF6EF'
        ctx.lineWidth = 0.5
        const label = formatLen(lenM)
        ctx.font = '600 11px "DM Sans", sans-serif'
        const tw = ctx.measureText(label).width
        ctx.fillRect(midX - tw / 2 - 5, midY - 10, tw + 10, 18)
        ctx.fillStyle = isSelected ? '#3B82F6' : '#1C1C1C'
        ctx.fillText(label, midX - tw / 2, midY + 4)
        ctx.restore()
      }
    })

    // Draft walls (AI-generated, pending user confirmation)
    if (draftWalls.length > 0) {
      ctx.strokeStyle = '#7D9B76'
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.setLineDash([8, 5])
      draftWalls.forEach((wall) => {
        ctx.beginPath()
        ctx.moveTo(wall.x1 * CELL_SIZE_PX, wall.y1 * CELL_SIZE_PX)
        ctx.lineTo(wall.x2 * CELL_SIZE_PX, wall.y2 * CELL_SIZE_PX)
        ctx.stroke()
      })
      ctx.setLineDash([])
    }

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
      const lenM = Math.sqrt(dx * dx + dy * dy) * CELL_M
      const midX = (previewWall.x1 + previewWall.x2) / 2 * CELL_SIZE_PX
      const midY = (previewWall.y1 + previewWall.y2) / 2 * CELL_SIZE_PX
      ctx.save()
      ctx.font = '700 12px "DM Sans", sans-serif'
      const label = formatLen(lenM)
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
    ctx.fillText(formatLen(barCells * CELL_M), bx + barPx / 2 - 14, by + 8)

  }, [walls, draftWalls, bgImage, hoveredWall, selectedWallId, previewWall, mouseCell, activeTool, canvasW, canvasH, floorDims, formatLen])

  // Trigger render on each change
  useEffect(() => { render() }, [render])

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
    } else if (activeTool === 'select') {
      const w = findWallNear(cell)
      if (w) {
        setSelectedWallId(w.id)
        // Check if near endpoint
        const distToP1 = Math.sqrt((cell.x - w.x1) ** 2 + (cell.y - w.y1) ** 2)
        const distToP2 = Math.sqrt((cell.x - w.x2) ** 2 + (cell.y - w.y2) ** 2)
        if (distToP1 < 1.2) {
          setWallDragState({ type: 'endpoint', wallId: w.id, endpoint: 1 })
        } else if (distToP2 < 1.2) {
          setWallDragState({ type: 'endpoint', wallId: w.id, endpoint: 2 })
        } else {
          // Drag whole segment
          setWallDragState({
            type: 'segment',
            wallId: w.id,
            startCell: cell,
            origX1: w.x1, origY1: w.y1,
            origX2: w.x2, origY2: w.y2,
          })
        }
      } else {
        setSelectedWallId(null)
        setWallDragState(null)
      }
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
    } else if (activeTool === 'select' && wallDragState) {
      if (wallDragState.type === 'endpoint') {
        const patch = wallDragState.endpoint === 1
          ? { x1: cell.x, y1: cell.y }
          : { x2: cell.x, y2: cell.y }
        updateWall(wallDragState.wallId, patch)
      } else if (wallDragState.type === 'segment') {
        const dx = cell.x - wallDragState.startCell.x
        const dy = cell.y - wallDragState.startCell.y
        updateWall(wallDragState.wallId, {
          x1: wallDragState.origX1 + dx,
          y1: wallDragState.origY1 + dy,
          x2: wallDragState.origX2 + dx,
          y2: wallDragState.origY2 + dy,
        })
      }
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
    if (activeTool === 'select') {
      setWallDragState(null)
    }
  }

  const onMouseLeave = () => {
    setPreviewWall(null)
    setMouseCell(null)
    drawStart.current = null
    setWallDragState(null)
  }

  const cursorClass = {
    wall: 'canvas-wall',
    erase: 'canvas-erase',
    select: 'canvas-select',
  }[activeTool] || 'canvas-select'

  return (
    <div className="w-full h-full relative overflow-auto bg-cream/60 flex items-center justify-center p-4">
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

      {/* Status bar overlay */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
        <span className="text-xs text-walnut/60 bg-cream/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-warm-sm font-sans">
          {walls.length} wall{walls.length !== 1 ? 's' : ''} · {formatLen(floorDims.w * CELL_M)} × {formatLen(floorDims.h * CELL_M)}
        </span>
      </div>
    </div>
  )
}
