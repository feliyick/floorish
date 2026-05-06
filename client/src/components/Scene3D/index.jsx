import { useRef, useEffect, useCallback, useMemo, Suspense } from 'react'
import { nearestWallAngle } from '../../utils/placementUtils'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import * as THREE from 'three'
import Lighting from './Lighting'
import Room from './Room'
import FurnitureItem from './FurnitureModel'
import useStore from '../../store/useStore'

// ── Drag-to-move ─────────────────────────────────────────────────────────────
// Raycasts against the Y=0 floor plane via native pointer events.
// No visible gizmo — just direct drag like The Sims.
function useDragToMove({ orbitRef, objectMap, onCommit }) {
  const { camera, gl } = useThree()
  const isDragging  = useRef(false)
  const hasMoved    = useRef(false)
  const dragOffset  = useRef({ x: 0, z: 0 })
  // Drag plane — defaults to Y=0 (floor) but raised to the object's Y for
  // surface-placed items (lamps on tables, etc.) so XZ tracking stays correct.
  const dragPlane   = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const raycaster   = useRef(new THREE.Raycaster())
  const hitPoint    = useRef(new THREE.Vector3())
  const onCommitRef = useRef(onCommit)
  useEffect(() => { onCommitRef.current = onCommit }, [onCommit])

  const getFloorPoint = useCallback((clientX, clientY) => {
    const el   = gl.domElement
    const rect = el.getBoundingClientRect()
    const nx   =  ((clientX - rect.left) / rect.width)  * 2 - 1
    const ny   = -((clientY - rect.top)  / rect.height)  * 2 + 1
    raycaster.current.setFromCamera({ x: nx, y: ny }, camera)
    return raycaster.current.ray.intersectPlane(dragPlane.current, hitPoint.current)
      ? hitPoint.current.clone()
      : null
  }, [camera, gl])

  // Called from FurnitureItem's onPointerDown; point is the R3F e.point (3D hit)
  const startDrag = useCallback((id, point) => {
    const obj = objectMap.current[id]
    if (obj) {
      dragOffset.current.x = point.x - obj.position.x
      dragOffset.current.z = point.z - obj.position.z
      // Set drag plane height to the object's Y so elevated items track correctly
      dragPlane.current.constant = -(obj.position.y || 0)
    }
    isDragging.current = true
    hasMoved.current   = false
    if (orbitRef.current) orbitRef.current.enabled = false
  }, [objectMap, orbitRef])

  useEffect(() => {
    const el = gl.domElement

    const onMove = (e) => {
      if (!isDragging.current) return
      const { selectedId } = useStore.getState()
      if (!selectedId) return
      const obj = objectMap.current[selectedId]
      if (!obj) return
      const pt = getFloorPoint(e.clientX, e.clientY)
      if (!pt) return
      obj.position.x = pt.x - dragOffset.current.x
      obj.position.z = pt.z - dragOffset.current.z
      // Y is preserved — surface-placed items stay at their elevation
      hasMoved.current = true
    }

    const onUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      if (orbitRef.current) orbitRef.current.enabled = true
      if (hasMoved.current) onCommitRef.current()
      hasMoved.current = false
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup',   onUp)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup',   onUp)
    }
  }, [gl, getFloorPoint, objectMap, orbitRef])

  return startDrag
}

// ── Scene contents (lives inside <Canvas>) ────────────────────────────────────
function SceneContents({ orbitRef }) {
  const furniture       = useStore((s) => s.furniture)
  const selectedId      = useStore((s) => s.selectedId)
  const clearSelected   = useStore((s) => s.clearSelected)
  const removeFurniture = useStore((s) => s.removeFurniture)
  const rotateFurniture = useStore((s) => s.rotateFurniture)

  const objectMap = useRef({})

  const onMount = useCallback((id, group) => {
    objectMap.current[id] = group
  }, [])

  // ── Commit drag: grid snap + room bounds clamp + wall alignment ───────────
  // Reads fresh state via getState() — safe to call from native event handlers.
  const commitDrag = useCallback(() => {
    const { selectedId, furniture, floorDims, walls, updateFurniture } = useStore.getState()
    if (!selectedId) return
    const obj  = objectMap.current[selectedId]
    if (!obj) return
    const item = furniture.find((f) => f.id === selectedId)
    if (!item) return

    const snapGrid = (v) => Math.round(v / 0.1) * 0.1
    const CELL_SIZE = 0.2
    const halfW = (floorDims.w * CELL_SIZE) / 2
    const halfD = (floorDims.h * CELL_SIZE) / 2
    const itemW = item.widthM ?? 0.5
    const itemD = item.depthM ?? 0.5

    const snappedX = Math.max(-halfW + itemW / 2, Math.min(halfW - itemW / 2, snapGrid(obj.position.x)))
    const snappedZ = Math.max(-halfD + itemD / 2, Math.min(halfD - itemD / 2, snapGrid(obj.position.z)))
    const currentY = obj.position.y || 0  // preserve surface elevation

    const wallAngle     = nearestWallAngle(snappedX, snappedZ, walls, floorDims, 0.5)
    const finalRotation = wallAngle !== null ? wallAngle : obj.rotation.y

    updateFurniture(selectedId, {
      position: [snappedX, currentY, snappedZ],
      rotation: finalRotation,
    })
    obj.position.set(snappedX, currentY, snappedZ)
    obj.rotation.set(0, finalRotation, 0)
  }, [objectMap])

  const startDrag = useDragToMove({ orbitRef, objectMap, onCommit: commitDrag })

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (!selectedId) return
      if (e.key === 'q' || e.key === 'Q') rotateFurniture(selectedId)
      if (e.key === 'Delete' || e.key === 'Backspace') removeFurniture(selectedId)
      if (e.key === 'Escape') clearSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, rotateFurniture, removeFurniture, clearSelected])

  return (
    <>
      <Lighting />
      <Room />
      {furniture.map((item) => (
        <FurnitureItem key={item.id} item={item} onMount={onMount} onDragStart={startDrag} />
      ))}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Scene3D() {
  const cameraMode      = useStore((s) => s.cameraMode)
  const floorDims       = useStore((s) => s.floorDims)
  const selectedId      = useStore((s) => s.selectedId)
  const clearSelected   = useStore((s) => s.clearSelected)
  const removeFurniture = useStore((s) => s.removeFurniture)
  const rotateFurniture = useStore((s) => s.rotateFurniture)
  const selectedItem    = useStore((s) => s.furniture.find((f) => f.id === s.selectedId))
  const orbitRef = useRef()

  const roomDiag = Math.sqrt((floorDims.w * 0.2) ** 2 + (floorDims.h * 0.2) ** 2)

  return (
    <div className="three-canvas w-full h-full relative">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, toneMapping: 3 }}
        onPointerMissed={() => clearSelected()}
      >
        {cameraMode === 'orbit' ? (
          <>
            <PerspectiveCamera makeDefault fov={50}
              position={[roomDiag * 0.8, roomDiag * 0.7, roomDiag * 0.8]}
              near={0.1} far={200}
            />
            <OrbitControls ref={orbitRef} target={[0, 0.6, 0]}
              maxPolarAngle={Math.PI / 2 - 0.02}
              minDistance={2} maxDistance={30}
              enablePan panSpeed={0.8} rotateSpeed={0.6} zoomSpeed={0.9}
              dampingFactor={0.08} enableDamping
            />
          </>
        ) : (
          <>
            <OrthographicCamera makeDefault zoom={55} position={[0, 20, 0]} near={0.1} far={200} />
            <OrbitControls ref={orbitRef} target={[0, 0, 0]}
              enableRotate={false} enablePan panSpeed={0.6} zoomSpeed={0.6}
              enableDamping dampingFactor={0.1}
            />
          </>
        )}
        <Suspense fallback={null}>
          <SceneContents orbitRef={orbitRef} />
        </Suspense>
      </Canvas>

      {/* ── Selection action bar ── */}
      {selectedId && selectedItem && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-cream/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow-warm border border-cream-dark pointer-events-auto">
          <span className="text-xs font-sans font-semibold text-walnut truncate max-w-[160px]">
            {selectedItem.name}
          </span>
          <div className="w-px h-4 bg-cream-dark mx-0.5" />
          <button
            onClick={() => rotateFurniture(selectedId)}
            title="Rotate 90° (Q)"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-sans text-walnut hover:bg-cream-dark transition-all"
          >
            <span className="text-sm leading-none">↺</span> Rotate
          </button>
          <button
            onClick={() => { removeFurniture(selectedId) }}
            title="Remove (Delete)"
            className="px-2.5 py-1 rounded-lg text-xs font-sans text-walnut/70 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            Remove
          </button>
          <div className="w-px h-4 bg-cream-dark mx-0.5" />
          <button
            onClick={() => clearSelected()}
            title="Deselect (Esc)"
            className="px-1.5 py-1 rounded-lg text-[11px] text-walnut/40 hover:text-walnut/70 hover:bg-cream-dark transition-all"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Bottom hint ── */}
      {!selectedId && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
          <span className="text-xs text-walnut/60 bg-cream/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-warm-sm font-sans">
            Click to select · Drag to move · Scroll to zoom
          </span>
        </div>
      )}
    </div>
  )
}
