import { useRef, useMemo, useEffect, useState, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { createFurnitureGroup } from '../../utils/furnitureFactory'
import useStore from '../../store/useStore'

const FLOOR_OFFSET_Y = 0.001
const SNAP_DEG = 25
const TICK_COUNT = Math.ceil(360 / SNAP_DEG)

// Spins above the bounding box while the AI model is still generating.
function GeneratingRing({ width, depth, height }) {
  const ringRef = useRef()
  const matRef  = useRef()
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ringRef.current)  ringRef.current.rotation.y = t * 1.8
    if (matRef.current)   matRef.current.opacity = 0.55 + 0.4 * Math.sin(t * 2.5)
  })
  const r = Math.max(width, depth) / 2 * 0.65
  return (
    <group ref={ringRef} position={[0, height + 0.06, 0]}>
      <mesh>
        <torusGeometry args={[r, 0.018, 8, 36]} />
        <meshBasicMaterial ref={matRef} color="#D4A853" transparent opacity={0.75} />
      </mesh>
    </group>
  )
}

// Loads a GLB asset from meshUrl and scales it to fit the item's bounding box.
// Must be a separate component so useGLTF is always called unconditionally.
function MeshAsset({ item }) {
  console.log(`[GLB] Loading mesh for "${item.name}" from:`, item.meshUrl?.slice(0, 80) + '...')
  const gltf = useGLTF(item.meshUrl)
  const { scene } = gltf

  const cloned = useMemo(() => {
    const c = scene.clone(true)
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    console.log(`[GLB] Mesh loaded, bounding box size:`, { x: size.x.toFixed(3), y: size.y.toFixed(3), z: size.z.toFixed(3) })
    if (size.x > 0 && size.y > 0 && size.z > 0) {
      c.scale.set(item.widthM / size.x, item.heightM / size.y, item.depthM / size.z)
      console.log(`[GLB] Scaled to item dimensions: ${item.widthM.toFixed(2)}×${item.heightM.toFixed(2)}×${item.depthM.toFixed(2)}m`)
    }
    // Recompute bounding box after scaling and ground the model so bottom sits at y=0
    const scaledBox = new THREE.Box3().setFromObject(c)
    const yOffset = -scaledBox.min.y
    if (Math.abs(yOffset) > 0.001) {
      c.position.y += yOffset
      console.log(`[GLB] Grounding offset: shifted y by ${yOffset.toFixed(4)}m (was ${scaledBox.min.y.toFixed(4)} below floor)`)
    }
    c.traverse((child) => {
      if (child.isMesh) {
        child.castShadow    = true
        child.receiveShadow = true
      }
    })
    return c
  }, [scene, item.widthM, item.heightM, item.depthM])

  return <primitive object={cloned} />
}

function RotationRing({ width, depth, onRotationDragStart, itemId }) {
  const [hovered, setHovered] = useState(false)
  const r = Math.max(width, depth) / 2 + 0.06

  // Tick marks at SNAP_DEG increments — radial line segments
  const tickLines = useMemo(() => {
    const lines = []
    for (let i = 0; i < TICK_COUNT; i++) {
      const angle = (i * SNAP_DEG * Math.PI) / 180
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const innerR = r - 0.035
      const outerR = r + 0.035
      const points = [
        new THREE.Vector3(cos * innerR, FLOOR_OFFSET_Y + 0.001, sin * innerR),
        new THREE.Vector3(cos * outerR, FLOOR_OFFSET_Y + 0.001, sin * outerR),
      ]
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      lines.push(
        <lineSegments key={i} geometry={geometry}>
          <lineBasicMaterial color="#C4622D" transparent opacity={0.6} />
        </lineSegments>
      )
    }
    return lines
  }, [r])

  return (
    <group>
      {/* Main visible ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_OFFSET_Y, 0]}>
        <torusGeometry args={[r, hovered ? 0.038 : 0.025, 8, 48]} />
        <meshToonMaterial
          color={hovered ? '#E8845A' : '#C4622D'}
          emissive={hovered ? '#E8845A' : '#C4622D'}
          emissiveIntensity={hovered ? 0.9 : 0.6}
        />
      </mesh>

      {/* Invisible wider hit area for easier grabbing */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_OFFSET_Y, 0]}
        onPointerEnter={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={(e) => {
          e.stopPropagation()
          onRotationDragStart?.(itemId, e)
        }}
      >
        <torusGeometry args={[r, 0.09, 8, 48]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Snap tick marks — visible on hover */}
      {hovered && tickLines}
    </group>
  )
}

export default function FurnitureItem({ item, onMount, onDragStart, onRotationDragStart }) {
  const groupRef             = useRef()
  const primitiveContainerRef = useRef()
  const selectedId  = useStore((s) => s.selectedId)
  const setSelected = useStore((s) => s.setSelected)
  const isSelected  = selectedId === item.id

  // Debug logging
  useEffect(() => {
    if (item.meshUrl) {
      console.log(`[FurnitureItem] "${item.name}" now has meshUrl set, should render GLB instead of placeholder`)
    }
    if (item.sourceProductId) {
      console.log(`[FurnitureItem] "${item.name}" still generating (sourceProductId: ${item.sourceProductId.slice(0, 8)}...)`)
    }
  }, [item.meshUrl, item.sourceProductId, item.name])

  // Rebuild primitive geometry when AI components arrive (componentCount goes from 0 → N).
  // Not used when item.meshUrl is set (GLB path), but useMemo must run unconditionally.
  const componentCount = item.modelComponents?.length ?? 0
  const furnitureGroup = useMemo(
    () => createFurnitureGroup(item),
    [item.category, item.widthM, item.depthM, item.heightM, item.color, componentCount]
  )

  // Attach primitive geometry into the dedicated inner container.
  // Skipped when meshUrl is present — GLB is rendered via JSX instead.
  useEffect(() => {
    if (!primitiveContainerRef.current || item.meshUrl) return
    const container = primitiveContainerRef.current
    while (container.children.length) container.remove(container.children[0])
    container.add(furnitureGroup)
  }, [furnitureGroup, item.meshUrl])

  // Expose parent group to SceneContents for drag tracking
  useEffect(() => {
    if (groupRef.current && onMount) onMount(item.id, groupRef.current)
  }, [item.id, onMount])

  // Sync position from store — ONLY when not actively dragging.
  // While selected (dragging), the drag system owns the position; syncing would fight it.
  // Y can be non-zero for items placed on surfaces (e.g. lamp on a table).
  useEffect(() => {
    if (!groupRef.current || isSelected) return
    groupRef.current.position.set(item.position[0], item.position[1] || 0, item.position[2])
    groupRef.current.scale.set(1, 1, 1)
  }, [item.position[0], item.position[1], item.position[2], item.widthM, item.depthM, item.heightM, isSelected])

  // Sync rotation from store always — allows the overlay Rotate button to take
  // effect immediately even while the item is selected.
  useEffect(() => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = item.rotation
  }, [item.rotation])

  const isGenerating = !!item.sourceProductId

  return (
    // Position/rotation set imperatively above — no JSX props — to avoid
    // React re-render overwriting values set by the drag system.
    <group
      ref={groupRef}
      onPointerDown={(e) => {
        e.stopPropagation()
        setSelected(item.id)
        // Pass the 3D hit point so drag can compute the pick offset correctly
        onDragStart?.(item.id, e.point)
      }}
    >
      {/* Full-volume invisible hit target — gives R3F a reliable surface to
          raycast against rather than relying on geometry gaps */}
      <mesh position={[0, item.heightM / 2, 0]}>
        <boxGeometry args={[item.widthM, item.heightM, item.depthM]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Primitive/procedural geometry container — populated imperatively */}
      <group ref={primitiveContainerRef} />

      {/* GLB mesh — rendered when Meshy AI has produced a model */}
      {item.meshUrl && (
        <Suspense fallback={null}>
          <MeshAsset item={item} />
        </Suspense>
      )}

      {isSelected   && <RotationRing width={item.widthM} depth={item.depthM} itemId={item.id} onRotationDragStart={onRotationDragStart} />}
      {isGenerating && <GeneratingRing width={item.widthM} depth={item.depthM} height={item.heightM} />}
    </group>
  )
}
