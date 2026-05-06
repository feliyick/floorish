import { useRef, useMemo, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { createFurnitureGroup } from '../../utils/furnitureFactory'
import useStore from '../../store/useStore'

const FLOOR_OFFSET_Y = 0.001

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
  const { scene } = useGLTF(item.meshUrl)
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    if (size.x > 0 && size.y > 0 && size.z > 0) {
      c.scale.set(item.widthM / size.x, item.heightM / size.y, item.depthM / size.z)
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

function SelectionRing({ width, depth }) {
  const r = Math.max(width, depth) / 2 + 0.06
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_OFFSET_Y, 0]}>
      <torusGeometry args={[r, 0.025, 8, 40]} />
      <meshToonMaterial color="#C4622D" emissive="#C4622D" emissiveIntensity={0.6} />
    </mesh>
  )
}

export default function FurnitureItem({ item, onMount, onDragStart }) {
  const groupRef             = useRef()
  const primitiveContainerRef = useRef()
  const selectedId  = useStore((s) => s.selectedId)
  const setSelected = useStore((s) => s.setSelected)
  const isSelected  = selectedId === item.id

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

      {isSelected   && <SelectionRing width={item.widthM} depth={item.depthM} />}
      {isGenerating && <GeneratingRing width={item.widthM} depth={item.depthM} height={item.heightM} />}
    </group>
  )
}
