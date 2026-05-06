import useStore from '../store/useStore'

export default function Header() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const furniture = useStore((s) => s.furniture)

  const handleSave = () => {
    const state = {
      walls: useStore.getState().walls,
      furniture: useStore.getState().furniture,
      floorDims: useStore.getState().floorDims,
    }
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'floorish-layout.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoad = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result)
          if (data.walls) useStore.getState().setWalls(data.walls)
          if (data.floorDims) useStore.getState().setFloorDims(data.floorDims)
          if (data.furniture) {
            // Replace furniture
            useStore.setState({ furniture: data.furniture })
          }
        } catch {
          alert('Invalid Floorish layout file.')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <header className="grain-overlay relative h-12 bg-charcoal flex items-center px-5 gap-4 shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-terra rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-cream" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
        <span className="font-display text-cream text-base tracking-wide">Floorish</span>
      </div>

      {/* View toggle: 2D / 3D */}
      <div className="flex bg-charcoal/60 border border-white/10 rounded-lg p-0.5 ml-2">
        {['2d', '3d'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-md text-xs font-sans font-semibold transition-all ${
              mode === m
                ? 'bg-terra text-cream shadow-sm'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {/* 3D Camera mode */}
      {mode === '3d' && (
        <div className="flex bg-charcoal/60 border border-white/10 rounded-lg p-0.5">
          <button
            onClick={() => setCameraMode('orbit')}
            className={`px-3 py-1 rounded-md text-xs font-sans transition-all ${
              cameraMode === 'orbit'
                ? 'bg-white/15 text-white font-semibold'
                : 'text-white/40 hover:text-white/70'
            }`}
            title="Perspective view — orbit + zoom"
          >
            Perspective
          </button>
          <button
            onClick={() => setCameraMode('topdown')}
            className={`px-3 py-1 rounded-md text-xs font-sans transition-all ${
              cameraMode === 'topdown'
                ? 'bg-white/15 text-white font-semibold'
                : 'text-white/40 hover:text-white/70'
            }`}
            title="Top-down plan view"
          >
            Plan view
          </button>
        </div>
      )}

      <div className="flex-1" />

      {/* Item count */}
      {furniture.length > 0 && (
        <span className="text-xs font-sans text-white/40">
          {furniture.length} item{furniture.length !== 1 ? 's' : ''}
        </span>
      )}

      {/* Load / Save */}
      <button
        onClick={handleLoad}
        className="px-3 py-1.5 rounded-lg text-xs font-sans text-white/60 hover:text-white hover:bg-white/10 transition-colors"
      >
        Load
      </button>
      <button
        onClick={handleSave}
        className="px-3 py-1.5 bg-terra/80 hover:bg-terra text-cream rounded-lg text-xs font-sans font-semibold transition-colors"
      >
        Save layout
      </button>
    </header>
  )
}
