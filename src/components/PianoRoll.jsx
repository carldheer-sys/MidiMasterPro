import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { noteToMidi, midiToNote } from '../lib/musicUtils'
import { beatsPerDivisionFromTimeDivision } from '../lib/midiUtils'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' }

const CELL_HEIGHT = 20
const INITIAL_BEAT_WIDTH = 40
const BAR_LABEL_HEIGHT = 20
const ANNOTATION_HEIGHT = 20
const KEYBOARD_WIDTH = 48

function generateNoteRange(lowestMidi, highestMidi) {
  const range = []
  for (let midi = highestMidi; midi >= lowestMidi; midi--) {
    const octave = Math.floor(midi / 12) - 1
    const semitone = midi % 12
    const name = NOTE_NAMES[semitone]
    range.push(`${name}${octave}`)
  }
  return range
}

function localNoteToMidi(noteName) {
  if (!noteName || typeof noteName !== 'string') return -1
  const match = noteName.match(/^([A-G])(#|b)?(-?\d+)$/)
  if (!match) return -1
  let [, letter, accidental, octaveStr] = match
  letter = letter.toUpperCase()
  if (accidental === 'b') {
    const sharp = FLAT_TO_SHARP[`${letter}b`]
    if (sharp) { letter = sharp[0]; accidental = '#' }
    else { accidental = '' }
  }
  const normalized = `${letter}${accidental || ''}`
  const pc = NOTE_NAMES.indexOf(normalized)
  if (pc < 0) return -1
  return (parseInt(octaveStr) + 1) * 12 + pc
}

function isBlackKey(noteName) {
  return noteName.includes('#') || noteName.includes('b')
}

export default function PianoRoll({
  trackId,
  notes = [],
  bars = 4,
  beatsPerBar = 4,
  timeDivision = '1/4',
  lowestMidi = 48,
  highestMidi = 84,
  isPlaying = false,
  isRecording = false,
  cursorPosition = 0,
  playheadProgressRef = { current: 0 },
  snapToGrid = true,
  zoom = 1,
  onZoomChange,
  naming = 'sharp',
  annotationType = 'none',
  annotations = [],
  activeMidiNotes = {},
  activeMidiKeysRef = { current: {} },
  onNoteAdd,
  onNoteUpdate,
  onNotesUpdate,
  onNoteDelete,
  onNotesSelect,
  onNotePlay,
  onDragStart,
  scrollSyncRef,
  regionStart = 0,
  regionEnd = 1,
  onRegionChange,
  isPasteMode = false,
  pasteClipboard = null,
  onPastePlace,
}) {
  const containerRef = useRef(null)
  const gridRef = useRef(null)
  const playheadRef = useRef(null)
  const rafRef = useRef(null)
  const isScrollSyncingRef = useRef(false)

  const [dragState, setDragState] = useState(null)
  const [selectionBox, setSelectionBox] = useState(null)
  const [pastePreviewPos, setPastePreviewPos] = useState(null)
  const hasDraggedRef = useRef(false)
  const marqueeRef = useRef(null)
  const keyGlowRefs = useRef(new Map())
  const regionDragRef = useRef(null)
  const zoomScrollRef = useRef(null)

  const beatWidth = INITIAL_BEAT_WIDTH * zoom
  const barWidth = beatsPerBar * beatWidth
  const beatsPerDivision = beatsPerDivisionFromTimeDivision(timeDivision)
  const divisions = Math.max(1, Math.round(beatsPerBar / beatsPerDivision))
  const divisionWidth = barWidth / divisions
  const gridWidth = bars * barWidth

  const noteRange = useMemo(() => generateNoteRange(lowestMidi, highestMidi), [lowestMidi, highestMidi])

  const noteIndexMap = useMemo(() => {
    const map = new Map()
    noteRange.forEach((note, idx) => {
      map.set(localNoteToMidi(note), idx)
    })
    return map
  }, [noteRange])

  // Playhead animation + key glow loop
  useEffect(() => {
    const tick = () => {
      if ((isPlaying || isRecording) && playheadRef.current) {
        const progress = playheadProgressRef.current || 0
        playheadRef.current.style.transform = `translateX(${progress * gridWidth}px)`
      }
      const activeKeys = activeMidiKeysRef.current
      const activeMidis = new Set()
      for (const k of Object.keys(activeKeys)) {
        const m = noteToMidi(k)
        if (m !== null) activeMidis.add(m)
      }
      keyGlowRefs.current.forEach((el, notePitch) => {
        const midi = localNoteToMidi(notePitch)
        el.style.opacity = activeMidis.has(midi) ? '1' : '0'
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      keyGlowRefs.current.forEach((el) => { el.style.opacity = '0' })
    }
  }, [isPlaying, isRecording, gridWidth, activeMidiKeysRef, playheadProgressRef])

  // Wheel handler: shift+scroll = pan, ctrl/cmd+scroll = zoom
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleWheel = (e) => {
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        el.scrollLeft += e.deltaY || e.deltaX
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        const newZoom = Math.max(0.5, Math.min(3, zoomRef.current * delta))
        if (onZoomChange && newZoom !== zoomRef.current) {
          const rect = el.getBoundingClientRect()
          const mouseX = e.clientX - rect.left
          const beatAtMouse = (el.scrollLeft + mouseX - KEYBOARD_WIDTH) / (INITIAL_BEAT_WIDTH * zoomRef.current)
          zoomScrollRef.current = { beatAtMouse, mouseX }
          onZoomChange(newZoom)
        }
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [onZoomChange])

  // Preserve scroll position after zoom re-renders
  useEffect(() => {
    if (zoomScrollRef.current === null) return
    const el = containerRef.current
    if (!el) return
    const { beatAtMouse, mouseX } = zoomScrollRef.current
    el.scrollLeft = (KEYBOARD_WIDTH + beatAtMouse * (INITIAL_BEAT_WIDTH * zoom)) - mouseX
    zoomScrollRef.current = null
  }, [zoom])

  // Register container for scroll sync and handle scroll events
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    if (scrollSyncRef) {
      scrollSyncRef.current = scrollSyncRef.current.filter(e => e !== el)
      scrollSyncRef.current.push(el)
    }

    const handleScroll = () => {
      if (!scrollSyncRef || isScrollSyncingRef.current) return
      isScrollSyncingRef.current = true
      for (const other of scrollSyncRef.current) {
        if (other !== el) other.scrollLeft = el.scrollLeft
      }
      requestAnimationFrame(() => { isScrollSyncingRef.current = false })
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
      if (scrollSyncRef) {
        scrollSyncRef.current = scrollSyncRef.current.filter(e => e !== el)
      }
    }
  }, [scrollSyncRef])

  // Region handle drag
  const handleRegionMouseDown = useCallback((e, handle) => {
    e.preventDefault()
    e.stopPropagation()
    const gridRect = gridRef.current?.getBoundingClientRect()
    const gridLeft = gridRect ? gridRect.left : 0
    const snapFraction = divisionWidth / gridWidth
    const minGap = snapFraction

    const onMove = (ev) => {
      const rawPx = ev.clientX - gridLeft
      const rawFraction = rawPx / gridWidth
      const snapped = Math.round(rawFraction / snapFraction) * snapFraction

      if (handle === 'start') {
        const next = Math.max(0, Math.min(regionEnd - minGap, snapped))
        onRegionChange?.(next, regionEnd)
      } else {
        const next = Math.min(1, Math.max(regionStart + minGap, snapped))
        onRegionChange?.(regionStart, next)
      }
    }

    const onUp = () => {
      regionDragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [regionStart, regionEnd, gridWidth, divisionWidth, onRegionChange])

  // Row click — add note (or place paste in paste mode)
  const handleRowMouseDown = useCallback((e, noteName) => {
    if (dragState) return
    if (e.target.closest('.note-block')) return

    if (isPasteMode && pasteClipboard && onPastePlace) {
      e.preventDefault()
      e.stopPropagation()
      const gridRect = gridRef.current?.getBoundingClientRect()
      if (!gridRect) return
      const x = e.clientX - gridRect.left
      const y = e.clientY - gridRect.top - BAR_LABEL_HEIGHT - ANNOTATION_HEIGHT
      if (x < 0 || y < 0) return

      const anchorBeat = x / beatWidth
      const anchorRowIndex = Math.floor(y / CELL_HEIGHT)

      const notesToPlace = pasteClipboard.notes.map(cn => {
        let newStart = anchorBeat + cn.relStart
        if (snapToGrid) {
          newStart = Math.round(newStart / beatsPerDivision) * beatsPerDivision
        }
        newStart = Math.max(0, newStart)
        const newRowIndex = Math.max(0, Math.min(noteRange.length - 1, anchorRowIndex + cn.relRowRank))
        return {
          note: noteRange[newRowIndex],
          start: newStart,
          duration: cn.duration
        }
      }).filter(n => n.note)

      if (notesToPlace.length > 0) {
        onPastePlace(notesToPlace)
      }
      return
    }

    if (e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      const gridRect = gridRef.current?.getBoundingClientRect()
      if (!gridRect) return
      const x = e.clientX - gridRect.left
      const y = e.clientY - gridRect.top - BAR_LABEL_HEIGHT - ANNOTATION_HEIGHT
      marqueeRef.current = { startX: x, startY: y, gridRect }
      setSelectionBox({ x, y, w: 0, h: 0 })
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const rawBeat = x / beatWidth
    const startBeat = Math.floor(rawBeat / beatsPerDivision) * beatsPerDivision

    if (startBeat >= 0 && startBeat < bars * beatsPerBar) {
      if (onNoteAdd) onNoteAdd(noteName, startBeat, beatsPerDivision)
      if (onNotePlay) onNotePlay(noteName)
    }
  }, [dragState, beatWidth, beatsPerDivision, bars, beatsPerBar, onNoteAdd, onNotePlay, isPasteMode, pasteClipboard, onPastePlace, snapToGrid, noteRange])

  // Note block interactions
  const handleNoteMouseDown = useCallback((e, noteData, type) => {
    e.stopPropagation()
    if (e.button !== 0) return

    if (type === 'delete') {
      if (onNoteDelete) onNoteDelete(noteData.id)
      return
    }

    const isModifier = e.shiftKey || e.ctrlKey || e.metaKey
    const isAlreadySelected = noteData.selected

    if (isModifier) {
      if (onNotesSelect) onNotesSelect([noteData.id], false)
    } else if (isAlreadySelected) {
      // Dragging an already-selected note: keep selection for multi-drag
    } else {
      if (onNotesSelect) onNotesSelect([noteData.id], true)
    }

    const noteIndex = noteIndexMap.get(localNoteToMidi(noteData.note)) ?? 0

    // Collect all selected notes for multi-note drag (all drag types)
    const selectedNotes = (isAlreadySelected && !isModifier)
      ? notes.filter(n => n.selected).map(n => ({
          id: n.id,
          originalStart: n.start,
          originalDuration: n.duration,
          originalNoteIndex: noteIndexMap.get(localNoteToMidi(n.note)) ?? 0,
        }))
      : [{ id: noteData.id, originalStart: noteData.start, originalDuration: noteData.duration, originalNoteIndex: noteIndex }]

    hasDraggedRef.current = false
    setDragState({
      id: noteData.id,
      type,
      startX: e.clientX,
      startY: e.clientY,
      originalStart: noteData.start,
      originalDuration: noteData.duration,
      originalNoteIndex: noteIndex,
      selectedNotes,
    })
  }, [noteIndexMap, onNotesSelect, onNoteDelete, notes])

  // Drag move handler
  useEffect(() => {
    if (!dragState) return

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragState.startX
      if (!hasDraggedRef.current && Math.abs(deltaX) > 3) {
        hasDraggedRef.current = true
        if (onDragStart) onDragStart()
      }
      if (!hasDraggedRef.current) return

      const deltaBeats = deltaX / beatWidth
      const deltaY = e.clientY - dragState.startY

      let newStart = dragState.originalStart
      let newDuration = dragState.originalDuration
      let newNoteName = undefined

      if (dragState.type === 'end') {
        let rawDuration = dragState.originalDuration + deltaBeats
        if (snapToGrid) rawDuration = Math.round(rawDuration / beatsPerDivision) * beatsPerDivision
        newDuration = Math.max(snapToGrid ? beatsPerDivision : 0.1, rawDuration)
      } else if (dragState.type === 'start') {
        let rawStart = dragState.originalStart + deltaBeats
        if (snapToGrid) rawStart = Math.round(rawStart / beatsPerDivision) * beatsPerDivision
        const endPosition = dragState.originalStart + dragState.originalDuration
        newStart = Math.max(0, Math.min(rawStart, endPosition - (snapToGrid ? beatsPerDivision : 0.1)))
        newDuration = endPosition - newStart
      } else if (dragState.type === 'move') {
        let rawStart = dragState.originalStart + deltaBeats
        if (snapToGrid) rawStart = Math.round(rawStart / beatsPerDivision) * beatsPerDivision
        newStart = Math.max(0, rawStart)
        if (dragState.originalNoteIndex !== undefined) {
          const deltaRows = Math.round(deltaY / CELL_HEIGHT)
          const newIndex = Math.max(0, Math.min(noteRange.length - 1, dragState.originalNoteIndex + deltaRows))
          newNoteName = noteRange[newIndex]
        }
      }

      if (dragState.selectedNotes && dragState.selectedNotes.length > 1 && onNotesUpdate) {
        const updates = {}
        const minDur = snapToGrid ? beatsPerDivision : 0.1
        if (dragState.type === 'move') {
          const deltaRows = Math.round(deltaY / CELL_HEIGHT)
          dragState.selectedNotes.forEach(sn => {
            let snStart = sn.originalStart + deltaBeats
            if (snapToGrid) snStart = Math.round(snStart / beatsPerDivision) * beatsPerDivision
            snStart = Math.max(0, snStart)
            const update = { start: snStart }
            if (sn.originalNoteIndex !== undefined) {
              const snNewIndex = Math.max(0, Math.min(noteRange.length - 1, sn.originalNoteIndex + deltaRows))
              update.note = noteRange[snNewIndex]
            }
            updates[sn.id] = update
          })
        } else if (dragState.type === 'start') {
          dragState.selectedNotes.forEach(sn => {
            let rawStart = sn.originalStart + deltaBeats
            if (snapToGrid) rawStart = Math.round(rawStart / beatsPerDivision) * beatsPerDivision
            const endPosition = sn.originalStart + sn.originalDuration
            const snStart = Math.max(0, Math.min(rawStart, endPosition - minDur))
            updates[sn.id] = { start: snStart, duration: endPosition - snStart }
          })
        } else if (dragState.type === 'end') {
          dragState.selectedNotes.forEach(sn => {
            let rawDuration = sn.originalDuration + deltaBeats
            if (snapToGrid) rawDuration = Math.round(rawDuration / beatsPerDivision) * beatsPerDivision
            updates[sn.id] = { duration: Math.max(minDur, rawDuration) }
          })
        }
        onNotesUpdate(updates)
      } else if (onNoteUpdate) {
        onNoteUpdate(dragState.id, { start: newStart, duration: newDuration, ...(newNoteName && { note: newNoteName }) })
      }
    }

    const handleMouseUp = () => {
      setDragState(null)
      setTimeout(() => { hasDraggedRef.current = false }, 0)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState, beatWidth, zoom, snapToGrid, onNoteUpdate, onNotesUpdate, onDragStart, beatsPerDivision, noteRange])

  // Marquee selection
  useEffect(() => {
    if (!selectionBox) return

    const handleMouseMove = (e) => {
      if (!marqueeRef.current) return
      const gr = marqueeRef.current.gridRect
      const x = Math.max(0, Math.min(gr.width, e.clientX - gr.left))
      const y = Math.max(0, Math.min(gr.height, e.clientY - gr.top - BAR_LABEL_HEIGHT - ANNOTATION_HEIGHT))
      const sx = marqueeRef.current.startX
      const sy = marqueeRef.current.startY
      setSelectionBox({
        x: Math.min(sx, x), y: Math.min(sy, y),
        w: Math.abs(x - sx), h: Math.abs(y - sy),
      })
    }

    const handleMouseUp = () => {
      if (selectionBox && marqueeRef.current) {
        const box = selectionBox
        const minBeat = box.x / beatWidth
        const maxBeat = (box.x + box.w) / beatWidth
        const minRow = Math.floor(box.y / CELL_HEIGHT)
        const maxRow = Math.floor((box.y + box.h) / CELL_HEIGHT)

        const selectedIds = []
        notes.forEach(noteData => {
          const noteIndex = noteIndexMap.get(localNoteToMidi(noteData.note))
          if (noteIndex === undefined) return
          const noteEndBeat = noteData.start + noteData.duration
          const intersectsTime = noteData.start <= maxBeat && noteEndBeat >= minBeat
          const intersectsPitch = noteIndex >= minRow && noteIndex <= maxRow
          if (intersectsTime && intersectsPitch) selectedIds.push(noteData.id)
        })

        if (onNotesSelect) onNotesSelect(selectedIds, true)
      }
      marqueeRef.current = null
      setSelectionBox(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [selectionBox, beatWidth, notes, noteIndexMap, onNotesSelect])

  // Keyboard delete
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = notes.filter(n => n.selected)
        if (selected.length > 0 && onNoteDelete) {
          e.preventDefault()
          selected.forEach(n => onNoteDelete(n.id))
        }
      } else if (e.key === 'Escape') {
        if (onNotesSelect) onNotesSelect([], true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [notes, onNoteDelete, onNotesSelect])

  // Build annotation display data
  const annotationDisplay = useMemo(() => {
    if (annotationType === 'none' || !annotations || annotations.length === 0) return []
    return annotations.map(ann => {
      let label = ''
      let isRed = false

      if (annotationType === 'note_names') {
        label = ann.note || ''
      } else if (annotationType === 'scale_degrees') {
        label = ann.degree_info?.scale_degree || ''
        isRed = ann.degree_info?.is_diatonic === false
      } else if (annotationType === 'chord_names') {
        label = ann.chord_info?.chord_label || ''
        isRed = ann.chord_info?.color === 'red'
      } else if (annotationType === 'roman_numerals') {
        label = ann.chord_info?.roman_numeral || ''
        isRed = ann.chord_info?.color === 'red'
      }

      return { start: ann.start, label, isRed, duration: ann.duration || 0.25 }
    }).filter(a => a.label)
  }, [annotations, annotationType])

  // Compute paste preview notes from current mouse position
  const pastePreviewNotes = useMemo(() => {
    if (!isPasteMode || !pasteClipboard || !pastePreviewPos) return []
    const anchorBeat = pastePreviewPos.x / beatWidth
    const anchorRowIndex = Math.floor(pastePreviewPos.y / CELL_HEIGHT)

    return pasteClipboard.notes.map((cn, i) => {
      let newStart = anchorBeat + cn.relStart
      if (snapToGrid) {
        newStart = Math.round(newStart / beatsPerDivision) * beatsPerDivision
      }
      newStart = Math.max(0, newStart)
      const newRowIndex = Math.max(0, Math.min(noteRange.length - 1, anchorRowIndex + cn.relRowRank))
      const noteName = noteRange[newRowIndex]
      if (!noteName) return null
      return {
        id: `paste-preview-${i}`,
        note: noteName,
        start: newStart,
        duration: cn.duration
      }
    }).filter(Boolean)
  }, [isPasteMode, pasteClipboard, pastePreviewPos, beatWidth, snapToGrid, beatsPerDivision, noteRange])

  // Clear paste preview when exiting paste mode
  useEffect(() => {
    if (!isPasteMode) {
      setPastePreviewPos(null)
    }
  }, [isPasteMode])

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-auto bg-background relative custom-scrollbar"
      style={{ willChange: 'transform' }}
      onMouseDown={(e) => {
        if (e.target.closest('.note-block')) return
        if (isPasteMode) return
        if (!e.shiftKey && onNotesSelect) onNotesSelect([], true)
      }}
      onMouseMove={(e) => {
        if (!isPasteMode || !pasteClipboard) return
        const gridRect = gridRef.current?.getBoundingClientRect()
        if (!gridRect) return
        const x = e.clientX - gridRect.left
        const y = e.clientY - gridRect.top - BAR_LABEL_HEIGHT - ANNOTATION_HEIGHT
        setPastePreviewPos({ x: Math.max(0, x), y: Math.max(0, y) })
      }}
    >
      <div className="relative" style={{ minWidth: `${gridWidth + KEYBOARD_WIDTH + 20}px` }}>
        {/* Piano keyboard column (sticky) */}
        <div className="sticky left-0 z-20 bg-card border-r-2 border-border" style={{ width: `${KEYBOARD_WIDTH}px`, float: 'left' }}>
          <div style={{ height: `${BAR_LABEL_HEIGHT + ANNOTATION_HEIGHT}px` }} className="bg-background border-b border-border/50" />
          {noteRange.map((note) => (
            <div
              key={note}
              className={`relative flex items-center justify-end pr-1 text-xs border-b border-border/30 ${
                isBlackKey(note) ? 'bg-background/80 text-muted-foreground' : 'bg-secondary/50 text-foreground'
              } ${note.startsWith('C') && !note.includes('#') ? 'border-l-2 border-l-blue-500/30' : ''}`}
              style={{ height: `${CELL_HEIGHT}px` }}
              onMouseDown={() => {
                if (onNotePlay) {
                  onNotePlay(note)
                }
              }}
            >
              <div
                ref={(el) => {
                  if (el) keyGlowRefs.current.set(note, el)
                  else keyGlowRefs.current.delete(note)
                }}
                className="pointer-events-none absolute inset-[3px] rounded-sm ring-2 ring-indigo-400/80"
                style={{ opacity: 0, boxShadow: '0 0 10px rgba(129,140,248,0.7),0 0 20px rgba(129,140,248,0.4)' }}
              />
              <span className="relative z-40 font-mono text-[10px] font-medium text-right w-full pr-1 leading-none">{note}</span>
            </div>
          ))}
        </div>

        {/* Grid area */}
        <div
          ref={gridRef}
          className="relative"
          style={{
            marginLeft: `${KEYBOARD_WIDTH}px`,
            width: `${gridWidth}px`,
            height: `${noteRange.length * CELL_HEIGHT + BAR_LABEL_HEIGHT + ANNOTATION_HEIGHT}px`,
            paddingTop: `${BAR_LABEL_HEIGHT + ANNOTATION_HEIGHT}px`,
          }}
        >
          {/* Division lines (CSS gradient) */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-5"
            style={{
              left: 0, right: 0,
              backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent ${divisionWidth - 1}px, hsl(var(--border) / 0.2) ${divisionWidth - 1}px, hsl(var(--border) / 0.2) ${divisionWidth}px)`,
            }}
          />

          {/* Bar lines (CSS gradient) */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-10"
            style={{
              left: 0, right: 0,
              backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent ${barWidth - 2}px, hsl(var(--border)) ${barWidth - 2}px, hsl(var(--border)) ${barWidth}px)`,
            }}
          />

          {/* Region overlays */}
          {(() => {
            const rsPx = regionStart * gridWidth
            const rePx = regionEnd * gridWidth
            return (
              <>
                {/* Dark overlay left of region */}
                {regionStart > 0 && (
                  <div className="absolute top-0 bottom-0 pointer-events-none z-10" style={{ left: 0, width: `${rsPx}px`, background: 'rgba(0,0,0,0.38)' }} />
                )}
                {/* Dark overlay right of region */}
                {regionEnd < 1 && (
                  <div className="absolute top-0 bottom-0 pointer-events-none z-10" style={{ left: `${rePx}px`, right: 0, background: 'rgba(0,0,0,0.38)' }} />
                )}
                {/* Cyan tint on bar-label area within region */}
                <div className="absolute pointer-events-none z-20" style={{
                  top: 0, left: `${rsPx}px`, width: `${rePx - rsPx}px`, height: `${BAR_LABEL_HEIGHT}px`,
                  background: 'rgba(56,189,248,0.08)', borderBottom: '1px solid rgba(56,189,248,0.35)',
                }} />
                {/* Vertical guide lines through note grid */}
                <div className="absolute pointer-events-none z-20" style={{
                  top: `${BAR_LABEL_HEIGHT}px`, bottom: 0, left: `${rsPx - 1}px`, width: '2px', background: 'rgba(56,189,248,0.4)',
                }} />
                <div className="absolute pointer-events-none z-20" style={{
                  top: `${BAR_LABEL_HEIGHT}px`, bottom: 0, left: `${rePx - 1}px`, width: '2px', background: 'rgba(56,189,248,0.4)',
                }} />
              </>
            )
          })()}

          {/* Note rows */}
          {noteRange.map((note, idx) => (
            <div
              key={`row-${note}`}
              className={`absolute w-full border-b border-border/20 ${
                isBlackKey(note) ? 'bg-background/60' : 'bg-secondary/30'
              }`}
              style={{
                height: `${CELL_HEIGHT}px`,
                top: `${idx * CELL_HEIGHT + BAR_LABEL_HEIGHT + ANNOTATION_HEIGHT}px`,
              }}
              onMouseDown={(e) => handleRowMouseDown(e, note)}
            />
          ))}

          {/* Note blocks */}
          {notes.map((noteData) => {
            const noteIndex = noteIndexMap.get(localNoteToMidi(noteData.note))
            if (noteIndex === undefined) return null
            const isSelected = noteData.selected
            const isDragging = dragState?.id === noteData.id

            return (
              <div
                key={noteData.id}
                className={`note-block absolute rounded-sm transition-colors z-10 ${
                  isSelected
                    ? 'bg-blue-500/90 border-2 border-blue-300/80 shadow-[0_0_6px_rgba(147,197,253,0.5)] z-20'
                    : 'bg-primary/80 border border-primary hover:bg-primary'
                } ${isDragging ? 'opacity-70' : ''}`}
                style={{
                  left: `${noteData.start * beatWidth}px`,
                  top: `${noteIndex * CELL_HEIGHT + 2 + BAR_LABEL_HEIGHT + ANNOTATION_HEIGHT}px`,
                  width: `${noteData.duration * beatWidth}px`,
                  height: `${CELL_HEIGHT - 4}px`,
                  cursor: 'pointer',
                }}
                onMouseDown={(e) => handleNoteMouseDown(e, noteData, 'move')}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  if (onNoteDelete) onNoteDelete(noteData.id)
                }}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20"
                  onMouseDown={(e) => handleNoteMouseDown(e, noteData, 'start')}
                />
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20"
                  onMouseDown={(e) => handleNoteMouseDown(e, noteData, 'end')}
                />
              </div>
            )
          })}

          {/* Active MIDI notes */}
          {Object.values(activeMidiNotes).map((noteData) => {
            const noteIndex = noteIndexMap.get(localNoteToMidi(noteData.note))
            if (noteIndex === undefined) return null
            return (
              <div
                key={`active-${noteData.id}`}
                className="note-block absolute bg-red-500 border border-red-400 rounded-sm z-20 pointer-events-none"
                style={{
                  left: `${noteData.start * beatWidth}px`,
                  top: `${noteIndex * CELL_HEIGHT + 2 + BAR_LABEL_HEIGHT + ANNOTATION_HEIGHT}px`,
                  width: `${beatWidth * 0.5}px`,
                  height: `${CELL_HEIGHT - 4}px`,
                }}
              />
            )
          })}

          {/* Marquee selection box */}
          {selectionBox && (
            <div
              className="absolute border border-indigo-400 bg-indigo-400/20 pointer-events-none z-40 rounded-sm"
              style={{
                left: `${selectionBox.x}px`,
                top: `${selectionBox.y + BAR_LABEL_HEIGHT + ANNOTATION_HEIGHT}px`,
                width: `${selectionBox.w}px`,
                height: `${selectionBox.h}px`,
              }}
            />
          )}

          {/* Paste preview notes */}
          {isPasteMode && pastePreviewNotes.map((pn) => {
            const noteIndex = noteIndexMap.get(localNoteToMidi(pn.note))
            if (noteIndex === undefined) return null
            return (
              <div
                key={pn.id}
                className="note-block absolute bg-amber-400/40 border border-amber-300/60 rounded-sm z-30 pointer-events-none"
                style={{
                  left: `${pn.start * beatWidth}px`,
                  top: `${noteIndex * CELL_HEIGHT + 2 + BAR_LABEL_HEIGHT + ANNOTATION_HEIGHT}px`,
                  width: `${pn.duration * beatWidth}px`,
                  height: `${CELL_HEIGHT - 4}px`,
                }}
              />
            )
          })}

          {/* Playhead */}
          {(isPlaying || isRecording) && (
            <div
              ref={playheadRef}
              className="absolute top-0 bottom-0 w-1 bg-red-500 z-30 pointer-events-none"
              style={{
                left: 0,
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.8)',
                opacity: 0.9,
                willChange: 'transform',
              }}
            />
          )}

          {/* Annotations — positioned above the highest note at each beat */}
          {annotationType !== 'none' && annotationDisplay.length > 0 && (
            <>
              {(() => {
                // Group annotations by beat (tolerance 0.01)
                const beatGroups = new Map()
                for (const ann of annotationDisplay) {
                  let placed = false
                  for (const [key, group] of beatGroups) {
                    if (Math.abs(ann.start - key) < 0.01) {
                      group.push(ann)
                      placed = true
                      break
                    }
                  }
                  if (!placed) beatGroups.set(ann.start, [ann])
                }

                const results = []
                for (const [start, groupAnns] of beatGroups) {
                  // Find notes starting at this beat
                  const notesAtBeat = notes.filter(n => Math.abs(n.start - start) < 0.01)
                  if (notesAtBeat.length === 0) continue

                  // Find the highest note (smallest noteIndex = highest pitch)
                  let highestNote = null
                  let highestIndex = Infinity
                  notesAtBeat.forEach(n => {
                    const ni = noteIndexMap.get(localNoteToMidi(n.note))
                    if (ni !== undefined && ni < highestIndex) {
                      highestIndex = ni
                      highestNote = n
                    }
                  })
                  if (!highestNote) continue

                  let annToRender = null
                  if (annotationType === 'note_names' || annotationType === 'scale_degrees') {
                    // For per-note annotations, find the annotation matching the highest note's pitch
                    const matchByPitch = annotations.find(oa =>
                      Math.abs(oa.start - start) < 0.01 && oa.pitch === highestNote.note
                    )
                    if (matchByPitch) {
                      const expectedLabel = annotationType === 'note_names'
                        ? matchByPitch.note
                        : matchByPitch.degree_info?.scale_degree
                      annToRender = groupAnns.find(a => a.label === expectedLabel)
                    }
                    if (!annToRender) annToRender = groupAnns[0]
                  } else {
                    // For chord_names / roman_numerals, one annotation per beat
                    annToRender = groupAnns[0]
                  }
                  if (!annToRender || !annToRender.label) continue

                  const noteLeft = highestNote.start * beatWidth
                  const noteWidth = highestNote.duration * beatWidth
                  const centerX = noteLeft + noteWidth / 2
                  const top = highestIndex * CELL_HEIGHT + BAR_LABEL_HEIGHT

                  results.push(
                    <div
                      key={`ann-${start}-${annToRender.label}`}
                      className={`absolute text-[11px] font-semibold whitespace-nowrap pointer-events-none z-30 flex items-center justify-center ${
                        annToRender.isRed ? 'text-red-400' : 'text-primary'
                      }`}
                      style={{
                        left: `${centerX}px`,
                        top: `${top}px`,
                        height: `${ANNOTATION_HEIGHT}px`,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      {annToRender.label}
                    </div>
                  )
                }
                return results
              })()}
            </>
          )}

          {/* Bar numbers + region handles */}
          <div className="absolute left-0 right-0 z-40 select-none" style={{ top: 0, height: `${BAR_LABEL_HEIGHT}px` }}>
            {Array.from({ length: bars }).map((_, barIndex) => (
              <div
                key={`bar-${barIndex}`}
                className="text-xs font-semibold text-muted-foreground flex items-center justify-start pl-1"
                style={{
                  position: 'absolute',
                  left: `${barIndex * barWidth}px`,
                  width: `${barWidth}px`,
                  height: '100%',
                  pointerEvents: 'none',
                }}
              >
                {barIndex + 1}
              </div>
            ))}

            {/* Region start handle */}
            {(() => {
              const rsPx = regionStart * gridWidth
              return (
                <div
                  className="absolute top-0 z-50 cursor-ew-resize group"
                  style={{ left: `${rsPx}px`, width: 0, height: `${BAR_LABEL_HEIGHT}px` }}
                  onMouseDown={(e) => handleRegionMouseDown(e, 'start')}
                >
                  <div className="absolute top-0 bottom-0 pointer-events-none group-hover:opacity-100 transition-opacity"
                    style={{ left: '-1px', width: '2px', background: 'rgba(56,189,248,0.85)', boxShadow: '0 0 4px rgba(56,189,248,0.5)' }}
                  />
                  <div className="absolute pointer-events-none group-hover:bg-sky-300 transition-colors"
                    style={{ top: 0, left: '-5px', width: '10px', height: '10px', background: 'rgba(56,189,248,0.85)', borderRadius: '2px 2px 0 0', boxShadow: '0 0 4px rgba(56,189,248,0.4)' }}
                  />
                  <div className="absolute top-0 bottom-0" style={{ left: '-7px', width: '14px' }} />
                </div>
              )
            })()}

            {/* Region end handle */}
            {(() => {
              const rePx = regionEnd * gridWidth
              return (
                <div
                  className="absolute top-0 z-50 cursor-ew-resize group"
                  style={{ left: `${rePx}px`, width: 0, height: `${BAR_LABEL_HEIGHT}px` }}
                  onMouseDown={(e) => handleRegionMouseDown(e, 'end')}
                >
                  <div className="absolute top-0 bottom-0 pointer-events-none group-hover:opacity-100 transition-opacity"
                    style={{ left: '-1px', width: '2px', background: 'rgba(56,189,248,0.85)', boxShadow: '0 0 4px rgba(56,189,248,0.5)' }}
                  />
                  <div className="absolute pointer-events-none group-hover:bg-sky-300 transition-colors"
                    style={{ top: 0, left: '-5px', width: '10px', height: '10px', background: 'rgba(56,189,248,0.85)', borderRadius: '2px 2px 0 0', boxShadow: '0 0 4px rgba(56,189,248,0.4)' }}
                  />
                  <div className="absolute top-0 bottom-0" style={{ left: '-7px', width: '14px' }} />
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
