import { useMemo } from 'react'
import * as THREE from 'three'
import { getToonGradientMap, toonMat } from '../../utils/furnitureFactory'
import useStore from '../../store/useStore'

const CELL_SIZE = 0.2 // 1 grid cell = 20cm
const WALL_HEIGHT = 2.7
const WALL_THICKNESS = 0.12

// Floor — warm oak planks via subtle stripe texture
function FloorMesh({ floorDims }) {
  const { w, h } = floorDims
  const floorW = w * CELL_SIZE
  const floorH = h * CELL_SIZE

  const texture = useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#D4A86A'
    ctx.fillRect(0, 0, size, size)

    // Plank lines
    const plankW = 32
    for (let x = 0; x < size; x += plankW) {
      ctx.fillStyle = '#C49860'
      ctx.fillRect(x, 0, 2, size)
    }
    for (let y = 0; y < size; y += 64) {
      ctx.fillStyle = '#C49860'
      ctx.fillRect(0, y, size, 1)
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(floorW / 1.6, floorH / 1.6)
    return tex
  }, [floorW, floorH])

  const mat = useMemo(() => new THREE.MeshToonMaterial({
    map: texture,
    gradientMap: getToonGradientMap(),
  }), [texture])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[floorW, floorH]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}

// Individual wall segment
function WallSegment({ wall, cellSize }) {
  const { x1, y1, x2, y2 } = wall

  const wx1 = (x1 - 0) * cellSize
  const wz1 = (y1 - 0) * cellSize
  const wx2 = (x2 - 0) * cellSize
  const wz2 = (y2 - 0) * cellSize

  const length = Math.sqrt((wx2 - wx1) ** 2 + (wz2 - wz1) ** 2)
  if (length < 0.01) return null

  const midX = (wx1 + wx2) / 2
  const midZ = (wz1 + wz2) / 2
  const angle = Math.atan2(wz2 - wz1, wx2 - wx1)

  // Centre the room: offset so walls' centre aligns with origin
  const wallMat = useMemo(() => new THREE.MeshToonMaterial({
    color: new THREE.Color('#F5ECD7'),
    gradientMap: getToonGradientMap(),
    transparent: true,
    opacity: 0.38,
  }), [])

  return (
    <mesh
      position={[midX, WALL_HEIGHT / 2, midZ]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[length, WALL_HEIGHT, WALL_THICKNESS]} />
      <primitive object={wallMat} attach="material" />
    </mesh>
  )
}

export default function Room() {
  const walls = useStore((s) => s.walls)
  const floorDims = useStore((s) => s.floorDims)

  // Centring offset so the floor plan sits around origin
  const offsetX = -(floorDims.w * CELL_SIZE) / 2
  const offsetZ = -(floorDims.h * CELL_SIZE) / 2

  const centredWalls = useMemo(() =>
    walls.map((w) => ({
      ...w,
      x1: w.x1 * CELL_SIZE + offsetX,
      y1: w.y1 * CELL_SIZE + offsetZ,
      x2: w.x2 * CELL_SIZE + offsetX,
      y2: w.y2 * CELL_SIZE + offsetZ,
    })),
  [walls, offsetX, offsetZ])

  return (
    <group>
      {/* Floor */}
      <FloorMesh floorDims={floorDims} />

      {/* Ceiling — faint, mostly for ambient bounce */}
      <mesh position={[0, WALL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floorDims.w * CELL_SIZE, floorDims.h * CELL_SIZE]} />
        <meshToonMaterial color="#FAF6EF" gradientMap={getToonGradientMap()} />
      </mesh>

      {/* Walls */}
      {centredWalls.map((wall) => (
        <WallSegment key={wall.id} wall={wall} cellSize={1} />
      ))}
    </group>
  )
}
