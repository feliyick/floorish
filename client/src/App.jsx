import { Suspense, useState, useRef, useCallback } from 'react'
import Header from './components/Header'
import ProductPanel from './components/ProductPanel'
import FloorPlanEditor from './components/FloorPlanEditor'
import Scene3D from './components/Scene3D'
import useStore from './store/useStore'

function LoadingScreen() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-cream">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-terra/30 border-t-terra rounded-full animate-spin" />
        <p className="font-sans text-sm text-walnut/60">Loading Floorish…</p>
      </div>
    </div>
  )
}

const MIN_WIDTH = 180
const MAX_WIDTH = 520

export default function App() {
  const mode = useStore((s) => s.mode)
  const [sidebarWidth, setSidebarWidth] = useState(288)
  const dragging = useRef(false)

  const onHandleMouseDown = useCallback((e) => {
    dragging.current = true
    e.preventDefault()

    const onMouseMove = (ev) => {
      if (!dragging.current) return
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX)))
    }

    const onMouseUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* Top bar */}
      <Header />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — resizable */}
        <aside
          style={{ width: sidebarWidth }}
          className="shrink-0 border-r border-cream-dark overflow-hidden flex flex-col shadow-warm"
        >
          <ProductPanel />
        </aside>

        {/* Resize handle */}
        <div
          onMouseDown={onHandleMouseDown}
          className="w-1 shrink-0 cursor-col-resize bg-cream-dark hover:bg-terra/40 transition-colors relative group"
          title="Drag to resize"
        >
          {/* Grip dots */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {[0,1,2].map((i) => (
              <div key={i} className="w-0.5 h-0.5 rounded-full bg-walnut/40" />
            ))}
          </div>
        </div>

        {/* Main canvas area */}
        <main className="flex-1 relative overflow-hidden">
          <Suspense fallback={<LoadingScreen />}>
            {mode === '3d' ? (
              <Scene3D />
            ) : (
              <FloorPlanEditor />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  )
}
