import { useRef, useEffect, useCallback, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, OrthographicCamera, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import Lighting from './Lighting'
import Room from './Room'
import FurnitureItem from './FurnitureModel'
import useStore from '../../store/useStore'

// WASD fly — only active when nothing is selected.
// Moves camera + orbit target together so OrbitControls stays consistent.
function FlyControls({ orbitRef, speed = 0.07 }) {
  const { camera } = useThree()
  const keys = useRef({})

  useEffect(() => {
    const skip = (e) => ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)
    const onDown = (e) => { if (!skip(e)) keys.current[e.code] = true }
    const onUp   = (e) => { keys.current[e.code] = false }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  }, [])

  useFrame(() => {
    // Stop flying while a furniture item is selected (WASD = gizmo mode shortcuts)
    if (useStore.getState().selectedId) return
    const k = keys.current
    if (!k.KeyW && !k.KeyS && !k.KeyA && !k.KeyD) return

    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const delta = new THREE.Vector3()
    if (k.KeyW) delta.addScaledVector(forward,  speed)
    if (k.KeyS) delta.addScaledVector(forward, -speed)
    if (k.KeyA) delta.addScaledVector(right,   -speed)
    if (k.KeyD) delta.addScaledVector(right,    speed)

    camera.position.add(delta)
    if (orbitRef.current) orbitRef.current.target.add(delta)
  })

  return null
}

function SceneContents({ orbitRef }) {
  const furniture    = useStore((s) => s.furniture)
  const selectedId   = useStore((s) => s.selectedId)
  const clearSelected   = useStore((s) => s.clearSelected)
  const removeFurniture = useStore((s) => s.removeFurniture)
  const rotateFurniture = useStore((s) => s.rotateFurniture)
  const updateFurniture = useStore((s) => s.updateFurniture)
  const transformMode   = useStore((s) => s.transformMode)

  const objectMap  = useRef({})   // id → Three.js group
  const transformRef = useRef()

  const onMount = useCallback((id, group) => {
    objectMap.current[id] = group
  }, [])

  const selectedObject = selectedId ? objectMap.current[selectedId] : null
  const selectedItem   = furniture.find((f) => f.id === selectedId)

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      // W/E/R only switch gizmo mode when a furniture item is selected;
      // when nothing is selected these keys are used for WASD camera fly.
      if (selectedId) {
        const { setTransformMode } = useStore.getState()
        if (e.key === 'w' || e.key === 'W') setTransformMode('translate')
        if (e.key === 'e' || e.key === 'E') setTransformMode('rotate')
        if (e.key === 'r' || e.key === 'R') setTransformMode('scale')
        if (e.key === 'q' || e.key === 'Q') rotateFurniture(selectedId)
        if (e.key === 'Delete' || e.key === 'Backspace') removeFurniture(selectedId)
        if (e.key === 'Escape') clearSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  // ── Configure visible gizmo axes per mode ──────────────────────────────────
  // translate → XZ only (no vertical lift)
  // rotate    → Y only (spin on floor)
  // scale     → all axes
  useEffect(() => {
    if (!transformRef.current) return
    const tc = transformRef.current
    if (transformMode === 'translate') {
      tc.showX = true; tc.showY = false; tc.showZ = true
    } else if (transformMode === 'rotate') {
      tc.showX = false; tc.showY = true; tc.showZ = false
    } else {
      tc.showX = true; tc.showY = true; tc.showZ = true
    }
  }, [transformMode, selectedObject]) // re-run when TC mounts (selectedObject → TC remounts)

  // ── Disable orbit while dragging ────────────────────────────────────────────
  const onTransformMouseDown = useCallback(() => {
    if (orbitRef.current) orbitRef.current.enabled = false
  }, [orbitRef])

  // ── Sync final transform to store on drag END (not during drag) ─────────────
  // This is the critical fix: syncing during onChange caused React to re-render
  // FurnitureItem with the old position, fighting TransformControls each frame.
  const onTransformMouseUp = useCallback(() => {
    if (orbitRef.current) orbitRef.current.enabled = true
    if (!selectedId || !selectedObject) return

    const pos = selectedObject.position
    const rot = selectedObject.rotation

    if (transformMode === 'scale' && selectedItem) {
      const sx = selectedObject.scale.x
      const sy = selectedObject.scale.y
      const sz = selectedObject.scale.z
      updateFurniture(selectedId, {
        position: [pos.x, 0, pos.z],
        rotation: rot.y,
        widthM:  Math.max(0.1, selectedItem.widthM  * sx),
        depthM:  Math.max(0.1, selectedItem.depthM  * sz),
        heightM: Math.max(0.1, selectedItem.heightM * sy),
      })
      // Reset scale to 1 — new dims are baked into the geometry via store
      selectedObject.scale.set(1, 1, 1)
    } else {
      updateFurniture(selectedId, {
        position: [pos.x, 0, pos.z],
        rotation: rot.y,
      })
      // Keep furniture on the floor
      selectedObject.position.y = 0
    }
  }, [orbitRef, selectedId, selectedObject, transformMode, selectedItem, updateFurniture])

  return (
    <>
      <FlyControls orbitRef={orbitRef} />
      <Lighting />
      <Room />
      {furniture.map((item) => (
        <FurnitureItem key={item.id} item={item} onMount={onMount} />
      ))}

      {selectedObject && (
        <TransformControls
          ref={transformRef}
          object={selectedObject}
          mode={transformMode}
          size={0.75}
          onMouseDown={onTransformMouseDown}
          onMouseUp={onTransformMouseUp}
          // No onChange — syncing live caused the React re-render fight
        />
      )}

      {/* Deselect on floor click — onClick (not onPointerDown) so TC drags
          (which involve pointer movement) never accidentally deselect */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        onClick={(e) => { e.stopPropagation(); clearSelected() }}
      >
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  )
}

export default function Scene3D() {
  const cameraMode      = useStore((s) => s.cameraMode)
  const floorDims       = useStore((s) => s.floorDims)
  const transformMode   = useStore((s) => s.transformMode)
  const setTransformMode = useStore((s) => s.setTransformMode)
  const selectedId      = useStore((s) => s.selectedId)
  const orbitRef = useRef()

  const roomDiag = Math.sqrt((floorDims.w * 0.2) ** 2 + (floorDims.h * 0.2) ** 2)

  const MODES = [
    { key: 'translate', label: 'Move',   hotkey: 'W' },
    { key: 'rotate',    label: 'Rotate', hotkey: 'E' },
    { key: 'scale',     label: 'Scale',  hotkey: 'R' },
  ]

  return (
    <div className="three-canvas w-full h-full relative">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, toneMapping: 3 }}>
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

      {/* Transform mode toolbar */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 pointer-events-auto">
        <div className="flex gap-1 bg-cream/90 backdrop-blur-sm rounded-xl p-1 shadow-warm border border-cream-dark">
          {MODES.map(({ key, label, hotkey }) => (
            <button key={key} onClick={() => setTransformMode(key)}
              title={`${label} (${hotkey})`}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all ${
                transformMode === key ? 'bg-terra text-cream shadow-warm-sm' : 'text-walnut hover:bg-cream-dark'
              }`}
            >
              {label}<kbd className="ml-1.5 text-[10px] font-mono opacity-60">{hotkey}</kbd>
            </button>
          ))}
        </div>
        {selectedId && (
          <p className="text-[10px] font-sans text-walnut/50 text-center">
            Q snap 90° · Del remove · Esc deselect
          </p>
        )}
      </div>

      {!selectedId && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
          <span className="text-xs text-walnut/60 bg-cream/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-warm-sm font-sans">
            Click furniture to select · W Move · E Rotate · R Scale · Q snap 90°
          </span>
        </div>
      )}
    </div>
  )
}
