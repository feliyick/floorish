import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
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

function SelectionRing({ width, depth }) {
  const r = Math.max(width, depth) / 2 + 0.06
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_OFFSET_Y, 0]}>
      <torusGeometry args={[r, 0.025, 8, 40]} />
      <meshToonMaterial color="#C4622D" emissive="#C4622D" emissiveIntensity={0.6} />
    </mesh>
  )
}

export default function FurnitureItem({ item, onMount }) {
  const groupRef = useRef()
  const selectedId = useStore((s) => s.selectedId)
  const setSelected = useStore((s) => s.setSelected)
  const isSelected = selectedId === item.id

  // Rebuild geometry when AI components arrive (componentCount goes from 0 → N)
  const componentCount = item.modelComponents?.length ?? 0
  const furnitureGroup = useMemo(
    () => createFurnitureGroup(item),
    [item.category, item.widthM, item.depthM, item.heightM, item.color, componentCount]
  )

  // Attach factory geometry to group
  useEffect(() => {
    if (!groupRef.current) return
    while (groupRef.current.children.length) {
      groupRef.current.remove(groupRef.current.children[0])
    }
    groupRef.current.add(furnitureGroup)
  }, [furnitureGroup])

  // Expose this group's Three.js object to SceneContents so TC can attach
  useEffect(() => {
    if (groupRef.current && onMount) onMount(item.id, groupRef.current)
  }, [item.id, onMount])

  // Sync position/rotation from store — ONLY when not selected.
  // While selected, TransformControls owns the transform; syncing would fight it.
  useEffect(() => {
    if (!groupRef.current || isSelected) return
    groupRef.current.position.set(item.position[0], 0, item.position[2])
    groupRef.current.rotation.set(0, item.rotation, 0)
    groupRef.current.scale.set(1, 1, 1)
  }, [item.position[0], item.position[2], item.rotation, item.widthM, item.depthM, item.heightM, isSelected])

  const isGenerating = !!item.sourceProductId

  return (
    // No position/rotation JSX props — set imperatively above so they don't
    // fight TransformControls on every React render.
    <group
      ref={groupRef}
      onPointerDown={(e) => { e.stopPropagation(); setSelected(item.id) }}
    >
      {/* Invisible bounding-box hit target — gives R3F a reliable full-volume
          surface to raycast against instead of relying on the gaps between
          the imperatively added geometry components */}
      <mesh position={[0, item.heightM / 2, 0]}>
        <boxGeometry args={[item.widthM, item.heightM, item.depthM]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {isSelected   && <SelectionRing width={item.widthM} depth={item.depthM} />}
      {isGenerating && <GeneratingRing width={item.widthM} depth={item.depthM} height={item.heightM} />}
    </group>
  )
}
