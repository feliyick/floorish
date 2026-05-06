import { useRef } from 'react'

export default function Lighting() {
  return (
    <>
      {/* Warm sky + earthy ground ambient */}
      <hemisphereLight args={['#FFE8C0', '#8B7355', 0.55]} />

      {/* Key light — golden hour from upper right */}
      <directionalLight
        color="#FFD580"
        intensity={0.95}
        position={[6, 9, 6]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={40}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.001}
      />

      {/* Warm fill — soft pink/amber from opposite side */}
      <directionalLight
        color="#FFB5A7"
        intensity={0.28}
        position={[-5, 3, -5]}
      />

      {/* Subtle cool back rim to give depth */}
      <directionalLight
        color="#B8D4E8"
        intensity={0.12}
        position={[0, 2, -8]}
      />

      {/* Low ambient to prevent fully black shadows */}
      <ambientLight intensity={0.18} color="#FFF0DC" />
    </>
  )
}
