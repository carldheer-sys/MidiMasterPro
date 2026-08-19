import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as Tone from 'tone'
import { Undo2, Redo2, Trash2, ChevronDown, ChevronRight, ChevronUp, Download, Upload, MoveVertical } from 'lucide-react'
import PianoRoll from './components/PianoRoll'
import TransportBar from './components/TransportBar'
import ExportXmlDialog from './components/ExportXmlDialog'
import { Button } from './components/ui/button'
import { Select } from './components/ui/select'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { DualSlider } from './components/ui/DualSlider'
import { KEYS, MODES, TIME_SIGNATURE_PRESETS, TIME_DIVISIONS } from './constants'
import audioEngine from './lib/audioEngine'
import { analyzeAnnotations } from './lib/annotations'
import { exportToMidi, importFromMidi, beatsPerBarFromTimeSignature, beatsPerDivisionFromTimeDivision, normalizeTimeSignature } from './lib/midiUtils'
import { renderTracksToWav } from './lib/audioExport'
import { exportToMusicXml } from './lib/musicXmlExport'
import { saveBlob } from './lib/fileSave'
import { noteToMidi, midiToNote, canonicalizeNoteName, getKeyPreferredNaming, generateId } from './lib/musicUtils'
import { useMIDIInput } from './hooks/useMIDIInput'

const TREBLE_RANGE = { lowestMidi: 36, highestMidi: 72 } // C2 to C5
const BASS_RANGE = { lowestMidi: 24, highestMidi: 60 }  // C1 to C4

function makeInitialTrack(id, name, config) {
  return {
    id,
    name,
    notes: [],
    lowestMidi: config.lowestMidi,
    highestMidi: config.highestMidi,
  }
}

export default function App() {
  // ─── Transport state ────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isCountingDown, setIsCountingDown] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const [metronomeEnabled, setMetronomeEnabled] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [audioStarted, setAudioStarted] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // ─── Project settings ──────────────────────────────────────────────────────
  const [tempo, setTempo] = useState(120)
  const [tempoInput, setTempoInput] = useState('120')
  const [selectedKey, setSelectedKey] = useState('C')
  const [mode, setMode] = useState('Major')
  const [bars, setBars] = useState(8)
  const [barsInput, setBarsInput] = useState('8')
  const [timeSignature, setTimeSignature] = useState({ numerator: 4, denominator: 4 })
  const [timeDivision, setTimeDivision] = useState('1/8')
  const [annotationType, setAnnotationType] = useState('none')
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [workspaceZoom, setWorkspaceZoom] = useState(1)
  const [regionStart, setRegionStart] = useState(0)
  const [regionEnd, setRegionEnd] = useState(1)
  const [latencyMode, setLatencyMode] = useState('normal')

  // ─── Tracks ────────────────────────────────────────────────────────────────
  const [tracks, setTracks] = useState([
    makeInitialTrack('treble', 'Treble', TREBLE_RANGE),
    makeInitialTrack('bass', 'Bass', BASS_RANGE),
  ])
  const [activeTrackId, setActiveTrackId] = useState('treble')
  const [activeMidiNotes, setActiveMidiNotes] = useState({})
  const [collapsedTracks, setCollapsedTracks] = useState({ bass: true })
  const [isPasteMode, setIsPasteMode] = useState(false)
  const [pasteTargetTrackId, setPasteTargetTrackId] = useState(null)

  // ─── Undo/Redo ─────────────────────────────────────────────────────────────
  const [history, setHistory] = useState([])
  const [redoStack, setRedoStack] = useState([])

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const tracksRef = useRef(tracks)
  const isRecordingRef = useRef(isRecording)
  const isCountingDownRef = useRef(isCountingDown)
  const activeTrackIdRef = useRef(activeTrackId)
  const activeMidiNotesRef = useRef(activeMidiNotes)
  const cursorPositionRef = useRef(cursorPosition)
  const playheadProgressRef = useRef(0)
  const barsRef = useRef(bars)
  const timeDivisionRef = useRef(timeDivision)
  const timeSignatureRef = useRef(timeSignature)
  const snapToGridRef = useRef(snapToGrid)
  const namingRef = useRef('sharp')
  const scrollSyncRef = useRef([])
  const clipboardNotesRef = useRef(null)
  const activeMidiKeysRef = useRef({})
  const regionStartRef = useRef(regionStart)
  const regionEndRef = useRef(regionEnd)

  useEffect(() => { tracksRef.current = tracks }, [tracks])
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
  useEffect(() => { isCountingDownRef.current = isCountingDown }, [isCountingDown])
  useEffect(() => { activeTrackIdRef.current = activeTrackId }, [activeTrackId])
  useEffect(() => { activeMidiNotesRef.current = activeMidiNotes }, [activeMidiNotes])
  useEffect(() => { cursorPositionRef.current = cursorPosition }, [cursorPosition])
  useEffect(() => { barsRef.current = bars }, [bars])
  useEffect(() => { timeDivisionRef.current = timeDivision }, [timeDivision])
  useEffect(() => { timeSignatureRef.current = timeSignature }, [timeSignature])
  useEffect(() => { snapToGridRef.current = snapToGrid }, [snapToGrid])
  useEffect(() => { regionStartRef.current = regionStart }, [regionStart])
  useEffect(() => { regionEndRef.current = regionEnd }, [regionEnd])
  useEffect(() => { setRegionStart(0); setRegionEnd(1) }, [bars])
  useEffect(() => { setTempoInput(String(tempo)) }, [tempo])
  useEffect(() => { setBarsInput(String(bars)) }, [bars])

  const latencyMap = { low: 0.02, normal: 0.05, high: 0.1 }
  useEffect(() => { audioEngine.setLookAhead(latencyMap[latencyMode]) }, [latencyMode])

  const naming = useMemo(() => getKeyPreferredNaming(selectedKey, mode), [selectedKey, mode])
  useEffect(() => { namingRef.current = naming }, [naming])

  const beatsPerBar = useMemo(() => beatsPerBarFromTimeSignature(timeSignature), [timeSignature])

  // ─── Audio engine init ─────────────────────────────────────────────────────
  useEffect(() => {
    const initAudio = async () => {
      try {
        await audioEngine.initialize(256)
        audioEngine.onCursorUpdate = (pos) => setCursorPosition(pos)
        audioEngine.onPlayheadUpdate = (progress) => { playheadProgressRef.current = progress }
        audioEngine.onPlaybackComplete = () => {
          setIsPlaying(false)
          setIsRecording(false)
          setCursorPosition(regionStartRef.current)
          playheadProgressRef.current = regionStartRef.current
          commitPendingNotes()
        }
      } catch (err) {
        console.error('Audio init failed:', err)
      }
    }
    initAudio()
    return () => { audioEngine.dispose() }
  }, [])

  // ─── Update engine settings ────────────────────────────────────────────────
  useEffect(() => {
    audioEngine.setTempo(tempo, timeSignature)
    audioEngine.setTimeSignature(timeSignature)
    audioEngine.setLoopLength(bars)
    audioEngine.setLoopEnabled(isLooping, bars)
  }, [tempo, timeSignature, bars, isLooping])

  // ─── Annotations ───────────────────────────────────────────────────────────
  const trebleAnnotations = annotationType === 'none' ? [] : analyzeAnnotations(tracks[0].notes, selectedKey, mode, annotationType)

  const bassAnnotations = annotationType === 'none' ? [] : analyzeAnnotations(tracks[1].notes, selectedKey, mode, annotationType)

  // ─── Note operations ───────────────────────────────────────────────────────
  const saveHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-49), { tracks: tracksRef.current.map(t => ({ ...t, notes: [...t.notes] })) }])
    setRedoStack([])
  }, [])

  const updateTrack = useCallback((trackId, updater) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t
      const updated = typeof updater === 'function' ? updater(t) : { ...t, ...updater }
      return updated
    }))
  }, [])

  const handleNoteAdd = useCallback((trackId, noteName, start, duration) => {
    saveHistory()
    const naming = namingRef.current
    const canonical = canonicalizeNoteName(noteName, naming)
    const newNote = {
      id: generateId(),
      note: canonical,
      start,
      duration,
      velocity: 0.8,
    }
    updateTrack(trackId, t => ({
      ...t,
      notes: [...t.notes.filter(n => {
        // Remove overlapping notes on same pitch
        if (n.note !== canonical) return true
        const nEnd = n.start + n.duration
        const newEnd = start + duration
        return !(start < nEnd && newEnd > n.start)
      }), newNote],
    }))
  }, [saveHistory, updateTrack])

  const handleNoteUpdate = useCallback((trackId, noteId, updates) => {
    updateTrack(trackId, t => ({
      ...t,
      notes: t.notes.map(n => n.id === noteId ? { ...n, ...updates } : n),
    }))
  }, [updateTrack])

  const handleNotesUpdate = useCallback((trackId, updatesById) => {
    updateTrack(trackId, t => ({
      ...t,
      notes: t.notes.map(n => {
        const updates = updatesById[n.id]
        return updates ? { ...n, ...updates } : n
      }),
    }))
  }, [updateTrack])

  const handleNoteDelete = useCallback((trackId, noteId) => {
    saveHistory()
    updateTrack(trackId, t => ({
      ...t,
      notes: t.notes.filter(n => n.id !== noteId),
    }))
  }, [saveHistory, updateTrack])

  const handleNotesSelect = useCallback((trackId, noteIds, exclusive) => {
    updateTrack(trackId, t => ({
      ...t,
      notes: t.notes.map(n => {
        if (noteIds.includes(n.id)) {
          return exclusive ? { ...n, selected: true } : { ...n, selected: !n.selected }
        }
        return exclusive ? { ...n, selected: false } : n
      }),
    }))
  }, [updateTrack])

  const handleNotePlay = useCallback(async (noteName) => {
    if (!audioEngine.isInitialized) return
    await audioEngine.startAudioContext()
    const canonical = canonicalizeNoteName(noteName, namingRef.current)
    audioEngine.playNote(canonical, '8n')
  }, [])

  // ─── Transport controls ────────────────────────────────────────────────────
  const ensureAudioStarted = async () => {
    if (!audioStarted) {
      await audioEngine.startAudioContext()
      setAudioStarted(true)
    }
  }

  const scheduleAllNotes = useCallback(() => {
    audioEngine.clearScheduledNotes()
    const totalBeats = barsRef.current * beatsPerBarFromTimeSignature(timeSignatureRef.current)
    const startBeat = regionStartRef.current * totalBeats
    const endBeat = regionEndRef.current * totalBeats
    for (const track of tracksRef.current) {
      if (track.notes.length > 0) {
        const regionNotes = track.notes
          .filter(n => n.start >= startBeat - 1e-6 && n.start < endBeat)
        if (regionNotes.length > 0) {
          audioEngine.scheduleNotes(regionNotes, timeDivisionRef.current, barsRef.current)
        }
      }
    }
  }, [])

  const handlePlay = useCallback(async () => {
    await ensureAudioStarted()
    const newPlaying = !isPlaying
    setIsPlaying(newPlaying)

    if (newPlaying) {
      setIsRecording(false)
      setIsCountingDown(false)
      setActiveMidiNotes({})
      activeMidiNotesRef.current = {}
      audioEngine.stopMetronome()
      scheduleAllNotes()
      if (metronomeEnabled) audioEngine.startMetronome()
      const totalBeats = bars * beatsPerBar
      const startBeat = regionStart * totalBeats
      const endBeat = regionEnd * totalBeats
      setCursorPosition(regionStart)
      playheadProgressRef.current = regionStart
      await audioEngine.start(startBeat)
      if (isLooping) {
        audioEngine.setLoopEnabledBeats(true, startBeat, endBeat)
      } else {
        audioEngine.scheduleStopAtBeats(endBeat)
      }
    } else {
      audioEngine.pause()
    }
  }, [isPlaying, isLooping, bars, beatsPerBar, regionStart, regionEnd, metronomeEnabled, scheduleAllNotes, audioStarted])

  const handleStop = useCallback(() => {
    setIsRecording(false)
    setIsCountingDown(false)
    setIsPlaying(false)
    setActiveMidiNotes({})
    activeMidiNotesRef.current = {}
    audioEngine.stop()
    audioEngine.stopMetronome()
    audioEngine.clearScheduledNotes()
    setCursorPosition(regionStartRef.current)
    playheadProgressRef.current = regionStartRef.current
  }, [])

  const handleRecord = useCallback(async () => {
    await ensureAudioStarted()

    if (isRecording) {
      // Stop recording
      audioEngine.stopMetronome()
      audioEngine.stop()
      audioEngine.clearScheduledNotes()
      setIsRecording(false)
      setIsCountingDown(false)
      setActiveMidiNotes({})
      activeMidiNotesRef.current = {}
      return
    }

    setIsPlaying(false)
    setIsRecording(true)
    audioEngine.stop()
    audioEngine.clearScheduledNotes()

    const totalBeats = bars * beatsPerBar
    const startBeat = regionStart * totalBeats
    const endBeat = regionEnd * totalBeats

    setCursorPosition(regionStart)
    playheadProgressRef.current = regionStart

    setIsCountingDown(true)
    await audioEngine.playCountdown(1)
    setIsCountingDown(false)
    const heldNotes = Object.keys(activeMidiKeysRef.current)
    if (heldNotes.length > 0) {
      const trackId = activeTrackIdRef.current
      setActiveMidiNotes(prev => {
        const updated = { ...prev }
        for (const noteName of heldNotes) {
          const noteId = generateId()
          updated[noteId] = { note: noteName, start: startBeat, id: noteId, trackId }
        }
        activeMidiNotesRef.current = updated
        return updated
      })
    }

    if (metronomeEnabled) {
      await audioEngine.startMetronome()
    }
    scheduleAllNotes()
    await audioEngine.start(startBeat)
    audioEngine.scheduleStopAtBeats(endBeat)
  }, [isRecording, metronomeEnabled, bars, beatsPerBar, regionStart, regionEnd, scheduleAllNotes, audioStarted])

  // ─── MIDI input ────────────────────────────────────────────────────────────
  const commitPendingNotes = useCallback(() => {
    const totalBeats = barsRef.current * beatsPerBarFromTimeSignature(timeSignatureRef.current)
    const startBeat = regionStartRef.current * totalBeats
    const endBeat = regionEndRef.current * totalBeats
    Object.keys(activeMidiNotesRef.current).forEach(id => {
      const noteRecord = activeMidiNotesRef.current[id]
      if (noteRecord) {
        const commitTrackId = noteRecord.trackId || activeTrackIdRef.current
        let finalStart = noteRecord.start
        let duration = endBeat - finalStart

        if (snapToGridRef.current) {
          const bpd = beatsPerDivisionFromTimeDivision(timeDivisionRef.current, timeSignatureRef.current)
          finalStart = Math.round(finalStart / bpd) * bpd
          duration = Math.round(duration / bpd) * bpd
          if (duration < bpd) duration = bpd
        }

        if (finalStart >= endBeat) return
        if (finalStart < startBeat) finalStart = startBeat
        if (finalStart + duration > endBeat) {
          duration = Math.max(0.1, endBeat - finalStart)
        }

        handleNoteAdd(commitTrackId, noteRecord.note, finalStart, duration)
      }
    })
    setActiveMidiNotes({})
    activeMidiNotesRef.current = {}
  }, [handleNoteAdd])

  const handleMidiNoteOn = useCallback((midiNote, velocity) => {
    const trackId = activeTrackIdRef.current

    const rawNoteName = Tone.Frequency(midiNote, 'midi').toNote()
    const canonicalNote = canonicalizeNoteName(rawNoteName, namingRef.current)

    audioEngine.startNote(canonicalNote, velocity / 127)

    activeMidiKeysRef.current = { ...activeMidiKeysRef.current, [canonicalNote]: true }

    if (isRecordingRef.current && !isCountingDownRef.current) {
      const currentBeat = Tone.Transport.ticks / Tone.Transport.PPQ
      const noteId = generateId()
      setActiveMidiNotes(prev => {
        const updated = { ...prev, [noteId]: { note: canonicalNote, start: currentBeat, id: noteId, trackId } }
        activeMidiNotesRef.current = updated
        return updated
      })
    }
  }, [])

  const handleMidiNoteOff = useCallback((midiNote) => {
    const rawNoteName = Tone.Frequency(midiNote, 'midi').toNote()
    const canonicalNote = canonicalizeNoteName(rawNoteName, namingRef.current)

    audioEngine.stopNote(canonicalNote)

    const updatedKeys = { ...activeMidiKeysRef.current }
    delete updatedKeys[canonicalNote]
    activeMidiKeysRef.current = updatedKeys

    if (isRecordingRef.current && !isCountingDownRef.current) {
      const currentBeat = Tone.Transport.ticks / Tone.Transport.PPQ
      const totalBeats = barsRef.current * beatsPerBarFromTimeSignature(timeSignatureRef.current)
      const startBeat = regionStartRef.current * totalBeats
      const endBeat = regionEndRef.current * totalBeats

      // Find the active note for this pitch
      const entries = Object.entries(activeMidiNotesRef.current)
      for (const [id, record] of entries) {
        if (record.note === canonicalNote) {
          let finalStart = record.start
          let duration = currentBeat - finalStart

          if (snapToGridRef.current) {
            const bpd = beatsPerDivisionFromTimeDivision(timeDivisionRef.current, timeSignatureRef.current)
            finalStart = Math.round(finalStart / bpd) * bpd
            duration = Math.round(duration / bpd) * bpd
            if (duration < bpd) duration = bpd
          } else {
            if (duration < 0.1) duration = 0.1
          }

          if (finalStart >= endBeat) {
            setActiveMidiNotes(prev => {
              const updated = { ...prev }
              delete updated[id]
              activeMidiNotesRef.current = updated
              return updated
            })
            continue
          }

          if (finalStart < startBeat) finalStart = startBeat
          if (finalStart + duration > endBeat) {
            duration = Math.max(0.1, endBeat - finalStart)
          }

          handleNoteAdd(record.trackId || activeTrackIdRef.current, canonicalNote, finalStart, duration)

          setActiveMidiNotes(prev => {
            const updated = { ...prev }
            delete updated[id]
            activeMidiNotesRef.current = updated
            return updated
          })
        }
      }
    }
  }, [handleNoteAdd])

  useMIDIInput(handleMidiNoteOn, handleMidiNoteOff)

  // ─── Region ────────────────────────────────────────────────────────────────
  const handleRegionChange = useCallback((start, end) => {
    setRegionStart(start)
    setRegionEnd(end)
  }, [])

  // ─── Snap to grid ──────────────────────────────────────────────────────────
  const handleSnapToGridChange = useCallback((enabled) => {
    setSnapToGrid(enabled)
    if (enabled) {
      saveHistory()
      const bpd = beatsPerDivisionFromTimeDivision(timeDivisionRef.current, timeSignatureRef.current)
      setTracks(prev => prev.map(t => ({
        ...t,
        notes: t.notes.map(n => {
          const snappedStart = Math.round(n.start / bpd) * bpd
          let snappedDuration = Math.round(n.duration / bpd) * bpd
          if (snappedDuration < bpd) snappedDuration = bpd
          return { ...n, start: snappedStart, duration: snappedDuration }
        }),
      })))
    }
  }, [saveHistory])

  // ─── Undo / Redo ───────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setRedoStack(r => [...r, { tracks: tracksRef.current.map(t => ({ ...t, notes: [...t.notes] })) }])
      setTracks(last.tracks)
      return prev.slice(0, -1)
    })
  }, [])

  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const next = prev[prev.length - 1]
      setHistory(h => [...h, { tracks: tracksRef.current.map(t => ({ ...t, notes: [...t.notes] })) }])
      setTracks(next.tracks)
      return prev.slice(0, -1)
    })
  }, [])

  // ─── Clear track ───────────────────────────────────────────────────────────
  const handleClearTrack = useCallback((trackId) => {
    saveHistory()
    updateTrack(trackId, t => ({ ...t, notes: [] }))
  }, [saveHistory, updateTrack])

  const handleFitRange = useCallback((trackId) => {
    const track = tracksRef.current.find(t => t.id === trackId)
    if (!track) return
    const midis = (track.notes || []).map(n => noteToMidi(n.note)).filter(m => m !== null && m !== undefined)
    if (midis.length === 0) return
    const low = Math.max(21, Math.min(...midis) - 3)
    const high = Math.min(108, Math.max(...midis) + 3)
    updateTrack(trackId, t => ({ ...t, lowestMidi: low, highestMidi: high }))
  }, [updateTrack])

  // ─── Export / Import ───────────────────────────────────────────────────────
  const handleExportMidi = useCallback(async () => {
    try {
      const blob = exportToMidi(tracks, tempo, timeDivision, timeSignature)
      await saveBlob(blob, 'my_composition.mid', ['mid'], 'MIDI files')
    } catch (err) {
      console.error('MIDI export failed:', err)
      alert('MIDI export failed: ' + err.message)
    }
  }, [tracks, tempo, timeDivision, timeSignature])

  const handleExportWav = useCallback(async () => {
    setIsExporting(true)
    try {
      const activeTracks = tracks.filter(t => t.notes.length > 0)
      if (activeTracks.length === 0) {
        alert('No notes to export.')
        return
      }
      const blob = await renderTracksToWav(activeTracks, tempo, bars, timeSignature)
      await saveBlob(blob, 'my_composition.wav', ['wav'], 'WAV audio')
    } catch (err) {
      console.error('WAV export failed:', err)
      alert('WAV export failed: ' + err.message)
    } finally {
      setIsExporting(false)
    }
  }, [tracks, tempo, bars, timeSignature])

  const handleExportXml = useCallback(async (opts) => {
    try {
      const {
        includeTreble, includeBass,
        enableTrebleScaleDegrees, enableTrebleChordNames, enableTrebleRomanNumerals,
        enableBassScaleDegrees, enableBassChordNames, enableBassRomanNumerals,
      } = opts

      const mergeAnnotations = (degreeAnns, chordAnns) => {
        const map = new Map()
        for (const a of degreeAnns) {
          map.set(a.start, { start: a.start, degree_info: a.degree_info, chord_info: null, pitch: a.pitch, note: a.note, duration: a.duration })
        }
        for (const a of chordAnns) {
          const existing = map.get(a.start)
          if (existing) {
            existing.chord_info = a.chord_info
          } else {
            map.set(a.start, { start: a.start, degree_info: null, chord_info: a.chord_info, pitch: a.pitch, note: a.note, duration: a.duration })
          }
        }
        return Array.from(map.values()).sort((a, b) => a.start - b.start)
      }

      const buildClefAnnotations = (notes, enableScaleDegrees, enableChordNames, enableRomanNumerals) => {
        const degreeAnns = enableScaleDegrees ? analyzeAnnotations(notes, selectedKey, mode, 'scale_degrees') : []
        const chordAnns = (enableChordNames || enableRomanNumerals) ? analyzeAnnotations(notes, selectedKey, mode, 'chord_names') : []
        return mergeAnnotations(degreeAnns, chordAnns)
      }

      const trebleAnn = includeTreble
        ? buildClefAnnotations(tracks[0].notes, enableTrebleScaleDegrees, enableTrebleChordNames, enableTrebleRomanNumerals)
        : []
      const bassAnn = includeBass
        ? buildClefAnnotations(tracks[1].notes, enableBassScaleDegrees, enableBassChordNames, enableBassRomanNumerals)
        : []

      const xml = exportToMusicXml({
        trebleNotes: includeTreble ? tracks[0].notes : [],
        bassNotes: includeBass ? tracks[1].notes : [],
        trebleAnnotations: trebleAnn,
        bassAnnotations: bassAnn,
        includeTreble,
        includeBass,
        enableTrebleScaleDegrees,
        enableTrebleChordNames,
        enableTrebleRomanNumerals,
        enableBassScaleDegrees,
        enableBassChordNames,
        enableBassRomanNumerals,
        key: selectedKey,
        mode,
        tempo,
        timeSignature: normalizeTimeSignature(timeSignature),
        bars,
        title: 'My Composition',
      })
      const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' })
      await saveBlob(blob, 'my_composition.musicxml', ['musicxml', 'xml'], 'MusicXML')
    } catch (err) {
      console.error('MusicXML export failed:', err)
      alert('MusicXML export failed: ' + err.message)
    }
  }, [tracks, selectedKey, mode, tempo, timeSignature, bars])

  const handleImportMidi = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mid,.midi'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      try {
        const arrayBuffer = await file.arrayBuffer()
        const result = await importFromMidi(arrayBuffer, tempo)

        saveHistory()

        // Import all notes into the active track
        const allNotes = result.tracks.flatMap(t => t.notes || [])
        const newTracks = tracksRef.current.map(t =>
          t.id === activeTrackIdRef.current
            ? { ...t, notes: allNotes }
            : t
        )

        setTracks(newTracks)
        if (result.bars) setBars(result.bars)
        if (result.timeDivision) setTimeDivision(result.timeDivision)
        if (result.timeSignature) setTimeSignature(result.timeSignature)
        if (result.tempo) setTempo(result.tempo)
      } catch (err) {
        console.error('MIDI import failed:', err)
        alert('MIDI import failed: ' + err.message)
      }
    }
    input.click()
  }, [tempo, saveHistory])

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return

      const copySelectedToClipboard = () => {
        const track = tracksRef.current.find(t => t.id === activeTrackIdRef.current) || tracksRef.current[0]
        if (!track) return false
        const selected = (track.notes || []).filter(n => n.selected)
        if (!selected.length) return false

        const sortedSelection = [...selected].sort((a, b) => {
          if (a.start !== b.start) return a.start - b.start
          const aMidi = noteToMidi(a.note)
          const bMidi = noteToMidi(b.note)
          return (aMidi !== null ? aMidi : 0) - (bMidi !== null ? bMidi : 0)
        })
        const topLeft = sortedSelection[0]
        const sourceRowRank = 127 - (noteToMidi(topLeft.note) ?? 0)

        clipboardNotesRef.current = {
          sourceStart: topLeft.start,
          sourceRowRank,
          notes: selected.map(n => ({
            note: n.note,
            start: n.start,
            duration: n.duration,
            sourceRowRank: 127 - (noteToMidi(n.note) ?? 0)
          }))
        }
        return true
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        handleRedo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (!copySelectedToClipboard()) return
        e.preventDefault()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (!copySelectedToClipboard()) return
        e.preventDefault()
        const track = tracksRef.current.find(t => t.id === activeTrackIdRef.current) || tracksRef.current[0]
        if (!track) return
        saveHistory()
        updateTrack(track.id, t => ({
          ...t,
          notes: t.notes.filter(n => !n.selected),
        }))
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        const clipboard = clipboardNotesRef.current
        const track = tracksRef.current.find(t => t.id === activeTrackIdRef.current) || tracksRef.current[0]
        if (!clipboard || !track) return
        e.preventDefault()
        setPasteTargetTrackId(track.id)
        setIsPasteMode(true)
      } else if (e.key === 'Escape' && isPasteMode) {
        e.preventDefault()
        setIsPasteMode(false)
        setPasteTargetTrackId(null)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        const track = tracksRef.current.find(t => t.id === activeTrackIdRef.current) || tracksRef.current[0]
        if (!track) return
        const selectedIds = (track.notes || []).filter(n => n.selected).map(n => n.id)
        if (selectedIds.length === 0) return
        e.preventDefault()
        saveHistory()
        updateTrack(track.id, t => ({
          ...t,
          notes: t.notes.filter(n => !n.selected),
        }))
      } else if (e.key === ' ') {
        e.preventDefault()
        if (isRecording) handleRecord()
        else if (isPlaying) handleStop()
        else handlePlay()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo, handlePlay, handleStop, handleRecord, isPlaying, isRecording, isPasteMode, saveHistory, updateTrack])

  // ─── Paste handler ─────────────────────────────────────────────────────────
  const handlePastePlace = useCallback((notesToPlace) => {
    const track = tracks.find(t => t.id === pasteTargetTrackId)
    if (!track) return
    const maxBeat = bars * beatsPerBar
    saveHistory()
    updateTrack(track.id, t => {
      let nextNotes = (t.notes || []).map(note => ({ ...note, selected: false }))
      const pastedIds = []
      notesToPlace.forEach(n => {
        if (n.start >= maxBeat) return
        const newDuration = Math.max(0.05, Math.min(n.duration, maxBeat - n.start))
        if (newDuration <= 0) return
        const canonical = canonicalizeNoteName(n.note, namingRef.current)
        const newId = generateId()
        nextNotes = nextNotes.filter(existing => {
          if (existing.note !== canonical) return true
          const existingEnd = existing.start + existing.duration
          const newEnd = n.start + newDuration
          return !(n.start < existingEnd && newEnd > existing.start)
        })
        nextNotes.push({ id: newId, note: canonical, start: n.start, duration: newDuration, velocity: 0.8, selected: true })
        pastedIds.push(newId)
      })
      return { ...t, notes: nextNotes }
    })
    setIsPasteMode(false)
    setPasteTargetTrackId(null)
  }, [pasteTargetTrackId, tracks, bars, beatsPerBar, saveHistory, updateTrack])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/50">
        <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent whitespace-nowrap">
          MidiMasterPro
        </h1>

        <div className="h-8 w-px bg-border" />

        {/* Tempo */}
        <div className="flex items-center gap-1.5">
          <Label>Tempo</Label>
          <div className="flex items-center bg-secondary border border-border rounded-md h-7">
            <button
              className="px-1 h-full text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setTempo(t => Math.max(40, t - 1))}
              title="Decrease tempo"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <input
              type="text"
              value={tempoInput}
              onChange={(e) => setTempoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
              }}
              onBlur={() => {
                const v = parseInt(tempoInput, 10)
                if (!isNaN(v)) setTempo(Math.max(40, Math.min(240, v)))
                else setTempoInput(String(tempo))
              }}
              className="w-10 text-center text-sm bg-transparent text-foreground focus:outline-none [appearance:textfield]"
            />
            <button
              className="px-1 h-full text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setTempo(t => Math.min(240, t + 1))}
              title="Increase tempo"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground">BPM</span>
        </div>

        <div className="h-8 w-px bg-border" />

        {/* Key & Mode */}
        <div className="flex items-center gap-1.5">
          <Label>Key</Label>
          <Select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} className="w-20 h-7">
            {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </Select>
          <Select value={mode} onChange={(e) => setMode(e.target.value)} className="w-20 h-7">
            {MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>

        <div className="h-8 w-px bg-border" />

        {/* Time signature */}
        <div className="flex items-center gap-1.5">
          <Label>Time</Label>
          <Select
            value={`${timeSignature.numerator}/${timeSignature.denominator}`}
            onChange={(e) => {
              const preset = TIME_SIGNATURE_PRESETS.find(p => p.label === e.target.value)
              if (preset) setTimeSignature({ numerator: preset.numerator, denominator: preset.denominator })
            }}
            className="w-20 h-7"
          >
            {TIME_SIGNATURE_PRESETS.map(ts => (
              <option key={ts.label} value={ts.label}>{ts.label}</option>
            ))}
          </Select>
        </div>

        {/* Bars */}
        <div className="flex items-center gap-1.5">
          <Label>Bars</Label>
          <div className="flex items-center bg-secondary border border-border rounded-md h-7">
            <button
              className="px-1 h-full text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setBars(b => Math.max(1, b - 1))}
              title="Decrease bars"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <input
              type="text"
              value={barsInput}
              onChange={(e) => setBarsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
              }}
              onBlur={() => {
                const v = parseInt(barsInput, 10)
                if (!isNaN(v)) setBars(Math.max(1, Math.min(32, v)))
                else setBarsInput(String(bars))
              }}
              className="w-8 text-center text-sm bg-transparent text-foreground focus:outline-none [appearance:textfield]"
            />
            <button
              className="px-1 h-full text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setBars(b => Math.min(32, b + 1))}
              title="Increase bars"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Time division */}
        <div className="flex items-center gap-1.5">
          <Label>Grid</Label>
          <Select value={timeDivision} onChange={(e) => setTimeDivision(e.target.value)} className="w-20 h-7">
            {TIME_DIVISIONS.map(td => <option key={td} value={td}>{td}</option>)}
          </Select>
        </div>

        <div className="h-8 w-px bg-border" />

        {/* Latency */}
        <div className="flex items-center gap-1.5">
          <Label>Latency</Label>
          <Select value={latencyMode} onChange={(e) => setLatencyMode(e.target.value)} className="w-24 h-7">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </Select>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={handleUndo} title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Transport bar */}
      <TransportBar
        isPlaying={isPlaying}
        isRecording={isRecording}
        isLooping={isLooping}
        metronomeEnabled={metronomeEnabled}
        annotationType={annotationType}
        snapToGrid={snapToGrid}
        onPlay={handlePlay}
        onStop={handleStop}
        onRecord={handleRecord}
        onToggleLoop={() => setIsLooping(!isLooping)}
        onToggleMetronome={() => setMetronomeEnabled(!metronomeEnabled)}
        onAnnotationChange={setAnnotationType}
        onSnapToGridChange={handleSnapToGridChange}
        onExportMidi={handleExportMidi}
        onExportWav={handleExportWav}
        xmlExportSlot={<ExportXmlDialog onExport={handleExportXml} disabled={isExporting} />}
        onImportMidi={handleImportMidi}
        isExporting={isExporting}
      />

      {/* Track workspace */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {tracks.map((track) => {
          const isActive = track.id === activeTrackId
          const isCollapsed = !!collapsedTracks[track.id]
          const trackAnnotations = track.id === 'treble' ? trebleAnnotations : bassAnnotations

          return (
            <div
              key={track.id}
              className={`flex flex-col border-b border-border transition-colors ${isCollapsed ? '' : 'flex-1 min-h-0'} ${isActive ? 'bg-card/30' : 'bg-background'}`}
              onClick={() => setActiveTrackId(track.id)}
            >
              {/* Track header */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); setCollapsedTracks(prev => ({ ...prev, [track.id]: !prev[track.id] })) }}
                    title={isCollapsed ? 'Expand track' : 'Collapse track'}
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  <button
                    className={`text-sm font-semibold transition-colors ${isActive ? 'text-indigo-400' : 'text-muted-foreground'}`}
                    onClick={(e) => { e.stopPropagation(); setActiveTrackId(track.id) }}
                  >
                    {track.name}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {track.notes.length} notes
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-red-400"
                    onClick={(e) => { e.stopPropagation(); handleClearTrack(track.id) }}
                    title="Clear track"
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Clear
                  </Button>
                  <div className="flex items-center gap-1.5 ml-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{midiToNote(track.lowestMidi, 'sharp')}</span>
                    <div className="w-24">
                      <DualSlider
                        min={21}
                        max={108}
                        value={[track.lowestMidi, track.highestMidi]}
                        onChange={([low, high]) => updateTrack(track.id, t => ({ ...t, lowestMidi: low, highestMidi: high }))}
                        minDistance={12}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{midiToNote(track.highestMidi, 'sharp')}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-indigo-400"
                      onClick={(e) => { e.stopPropagation(); handleFitRange(track.id) }}
                      title="Fit range to notes"
                    >
                      <MoveVertical className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Piano roll */}
              {!isCollapsed && (
              <div className="flex-1 min-h-0 flex flex-col">
                <PianoRoll
                  trackId={track.id}
                  notes={track.notes}
                  bars={bars}
                  beatsPerBar={beatsPerBar}
                  timeDivision={timeDivision}
                  lowestMidi={track.lowestMidi}
                  highestMidi={track.highestMidi}
                  isPlaying={isPlaying}
                  isRecording={isRecording}
                  cursorPosition={cursorPosition}
                  playheadProgressRef={playheadProgressRef}
                  snapToGrid={snapToGrid}
                  zoom={workspaceZoom}
                  onZoomChange={setWorkspaceZoom}
                  naming={naming}
                  annotationType={annotationType}
                  annotations={trackAnnotations}
                  activeMidiNotes={isActive ? activeMidiNotes : {}}
                  activeMidiKeysRef={activeMidiKeysRef}
                  scrollSyncRef={scrollSyncRef}
                  regionStart={regionStart}
                  regionEnd={regionEnd}
                  onRegionChange={handleRegionChange}
                  isPasteMode={isPasteMode && pasteTargetTrackId === track.id}
                  pasteClipboard={isPasteMode && pasteTargetTrackId === track.id && clipboardNotesRef.current ? {
                    notes: clipboardNotesRef.current.notes.map(n => ({
                      relStart: n.start - clipboardNotesRef.current.sourceStart,
                      relRowRank: (n.sourceRowRank ?? 0) - clipboardNotesRef.current.sourceRowRank,
                      duration: n.duration
                    }))
                  } : null}
                  onPastePlace={isPasteMode && pasteTargetTrackId === track.id ? handlePastePlace : undefined}
                  onNoteAdd={(noteName, start, duration) => handleNoteAdd(track.id, noteName, start, duration)}
                  onNoteUpdate={(noteId, updates) => handleNoteUpdate(track.id, noteId, updates)}
                  onNotesUpdate={(updatesById) => handleNotesUpdate(track.id, updatesById)}
                  onNoteDelete={(noteId) => handleNoteDelete(track.id, noteId)}
                  onNotesSelect={(noteIds, exclusive) => handleNotesSelect(track.id, noteIds, exclusive)}
                  onNotePlay={handleNotePlay}
                />
              </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-card/50 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>{selectedKey} {mode}</span>
          <span>{tempo} BPM</span>
          <span>{timeSignature.numerator}/{timeSignature.denominator}</span>
          <span>{bars} bars</span>
        </div>
        <div className="flex items-center gap-4">
          {isRecording && <span className="text-red-400 font-semibold">● Recording</span>}
          {isPlaying && <span className="text-indigo-400">▶ Playing</span>}
          <span>Space: Play/Stop · Ctrl+Z: Undo · Double-click to add note</span>
        </div>
      </div>
    </div>
  )
}
