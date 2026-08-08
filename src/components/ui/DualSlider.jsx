import { useRef, useState, useEffect, useCallback } from 'react'

export function DualSlider({
  min,
  max,
  value,
  onChange,
  disabled,
  minDistance = 12
}) {
  const [low, high] = value
  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(null)

  const getValFromMouseEvent = useCallback((e) => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return Math.round(percent * (max - min) + min)
  }, [min, max])

  const handlePointerDown = (thumb, e) => {
    if (disabled) return
    e.stopPropagation()
    e.preventDefault()
    setDragging(thumb)
  }

  useEffect(() => {
    if (!dragging) return

    const handlePointerMove = (e) => {
      const newVal = getValFromMouseEvent(e)
      if (dragging === 'low') {
        const snapped = Math.max(min, Math.min(newVal, high - minDistance))
        if (snapped !== low) {
          onChange([snapped, high])
        }
      } else if (dragging === 'high') {
        const snapped = Math.max(low + minDistance, Math.min(newVal, max))
        if (snapped !== high) {
          onChange([low, snapped])
        }
      }
    }

    const handlePointerUp = () => {
      setDragging(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragging, getValFromMouseEvent, low, high, min, max, minDistance, onChange])

  const lowPercent = ((low - min) / (max - min)) * 100
  const highPercent = ((high - min) / (max - min)) * 100

  return (
    <div
      className={`relative h-5 flex items-center w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div
        ref={trackRef}
        className="absolute w-full h-1.5 rounded-full bg-secondary border border-border/50"
      >
        <div
          className="absolute h-full bg-indigo-500/60 rounded-full pointer-events-none"
          style={{ left: `${lowPercent}%`, right: `${100 - highPercent}%` }}
        />
      </div>

      <div
        className="absolute w-3 h-3 rounded-full bg-indigo-500 border-2 border-indigo-400 shadow-sm cursor-grab active:cursor-grabbing transform -translate-x-1/2"
        style={{ left: `${lowPercent}%` }}
        onPointerDown={(e) => handlePointerDown('low', e)}
      />

      <div
        className="absolute w-3 h-3 rounded-full bg-indigo-500 border-2 border-indigo-400 shadow-sm cursor-grab active:cursor-grabbing transform -translate-x-1/2"
        style={{ left: `${highPercent}%` }}
        onPointerDown={(e) => handlePointerDown('high', e)}
      />
    </div>
  )
}
