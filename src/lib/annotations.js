import { noteToMidi, midiToPitchClass, getKeyPreferredNaming, midiToNote, noteNameToSemitone } from './musicUtils'
import { SEMITONE_TO_SHARP, SEMITONE_TO_FLAT } from '../constants'

// ─── Scale degree maps ───────────────────────────────────────────────────────

const DEGREE_MAP = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
}

const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11]
const MINOR_SCALE_SEMITONES = [0, 2, 3, 5, 7, 8, 10]

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

// Expected triad quality at each diatonic scale degree
const MAJOR_DIATONIC_QUALITIES = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished']
const MINOR_DIATONIC_QUALITIES = ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major']

// ─── Chord detection ──────────────────────────────────────────────────────────

// Chord templates: intervals from root in semitones → suffix
const CHORD_TEMPLATES = [
  { intervals: [0, 4, 7, 11], suffix: 'maj7', quality: 'major' },
  { intervals: [0, 4, 7, 10], suffix: '7', quality: 'major' },
  { intervals: [0, 3, 7, 10], suffix: 'm7', quality: 'minor' },
  { intervals: [0, 3, 6, 10], suffix: 'm7b5', quality: 'half-diminished' },
  { intervals: [0, 3, 6, 9], suffix: 'dim7', quality: 'diminished' },
  { intervals: [0, 4, 7, 9], suffix: '6', quality: 'major' },
  { intervals: [0, 3, 7, 9], suffix: 'm6', quality: 'minor' },
  { intervals: [0, 4, 8], suffix: 'aug', quality: 'augmented' },
  { intervals: [0, 3, 6], suffix: 'dim', quality: 'diminished' },
  { intervals: [0, 5, 7], suffix: 'sus4', quality: 'suspended' },
  { intervals: [0, 2, 7], suffix: 'sus2', quality: 'suspended' },
  { intervals: [0, 4, 7], suffix: '', quality: 'major' },
  { intervals: [0, 3, 7], suffix: 'm', quality: 'minor' },
]

/**
 * Detect a chord from a set of pitch classes.
 * Returns { root, suffix, quality, chord_label } or null.
 */
function detectChord(pitchClasses) {
  if (!pitchClasses || pitchClasses.length === 0) return null
  const pcs = [...new Set(pitchClasses)].sort((a, b) => a - b)
  if (pcs.length < 2) return null

  let bestMatch = null
  let bestScore = -1

  for (const rootPc of pcs) {
    const intervals = pcs.map(pc => (pc - rootPc + 12) % 12).sort((a, b) => a - b)

    for (const template of CHORD_TEMPLATES) {
      if (intervals.length < template.intervals.length) continue
      const templateSet = new Set(template.intervals)
      let matchCount = 0
      for (const iv of intervals) {
        if (templateSet.has(iv)) matchCount++
      }
      const score = matchCount * 10 - (intervals.length - template.intervals.length)
      if (score > bestScore) {
        bestScore = score
        bestMatch = { rootPc, suffix: template.suffix, quality: template.quality }
      }
    }
  }

  if (!bestMatch) return null

  const naming = 'sharp'
  const rootName = SEMITONE_TO_SHARP[bestMatch.rootPc]
  const chordLabel = `${rootName}${bestMatch.suffix}`

  return {
    root: bestMatch.rootPc,
    suffix: bestMatch.suffix,
    quality: bestMatch.quality,
    chord_label: chordLabel,
  }
}

/**
 * Convert a detected chord to a roman numeral based on the key.
 */
function chordToRomanNumeral(chord, key, mode) {
  if (!chord) return ''
  const tonicPc = noteNameToSemitone(key) >= 0 ? noteNameToSemitone(key) : 0
  const rootPc = chord.root
  const chromaticDistance = (rootPc - tonicPc + 12) % 12

  const scaleSemitones = mode === 'Minor' ? MINOR_SCALE_SEMITONES : MAJOR_SCALE_SEMITONES
  const diatonicQualities = mode === 'Minor' ? MINOR_DIATONIC_QUALITIES : MAJOR_DIATONIC_QUALITIES

  const scaleIdx = scaleSemitones.indexOf(chromaticDistance)

  let romanNumeral = ''

  if (scaleIdx !== -1) {
    const baseNumeral = ROMAN_NUMERALS[scaleIdx]
    const expectedQuality = diatonicQualities[scaleIdx]
    const isMajor = chord.quality === 'major' || chord.quality === 'augmented'
    const isMinor = chord.quality === 'minor' || chord.quality === 'diminished' || chord.quality === 'half-diminished'

    let numeral = baseNumeral
    if (isMinor && (expectedQuality === 'major' || expectedQuality === 'major')) {
      numeral = baseNumeral.toLowerCase()
    } else if (isMajor && (expectedQuality === 'minor' || expectedQuality === 'diminished')) {
      numeral = baseNumeral.toUpperCase()
    } else if (chord.quality === 'diminished') {
      numeral = baseNumeral.toLowerCase()
    } else if (chord.quality === 'augmented') {
      numeral = baseNumeral.toUpperCase()
    } else if (chord.quality === 'minor') {
      numeral = baseNumeral.toLowerCase()
    } else {
      numeral = baseNumeral.toUpperCase()
    }

    let modifiers = ''
    if (chord.quality === 'diminished' && chord.suffix === 'dim') modifiers += '\u00B0'
    if (chord.quality === 'half-diminished') modifiers += '\u00F8'
    if (chord.quality === 'augmented') modifiers += '+'
    if (chord.suffix === '7') modifiers += '7'
    if (chord.suffix === 'maj7') modifiers += 'maj7'
    if (chord.suffix === 'm7') modifiers += '7'
    if (chord.suffix === 'dim7') modifiers += '7'
    if (chord.suffix === 'm7b5') modifiers += '7'
    if (chord.suffix === '6') modifiers += '6'
    if (chord.suffix === 'm6') modifiers += '6'

    romanNumeral = numeral + modifiers
  } else {
    // Non-diatonic root — use chromatic prefix
    const nearestIdx = findNearestScaleDegree(chromaticDistance, scaleSemitones)
    const nearestSemitione = scaleSemitones[nearestIdx]
    const diff = chromaticDistance - nearestSemitione
    let prefix = ''
    if (diff === 1 || diff === -11) prefix = '#'
    else if (diff === -1 || diff === 11) prefix = 'b'
    else if (diff > 0) prefix = '#'
    else prefix = 'b'

    const baseNumeral = ROMAN_NUMERALS[nearestIdx]
    const isMajor = chord.quality === 'major' || chord.quality === 'augmented'
    const numeral = isMajor ? baseNumeral.toUpperCase() : baseNumeral.toLowerCase()

    let modifiers = ''
    if (chord.quality === 'diminished' && chord.suffix === 'dim') modifiers += '\u00B0'
    if (chord.quality === 'half-diminished') modifiers += '\u00F8'
    if (chord.quality === 'augmented') modifiers += '+'
    if (chord.suffix === '7') modifiers += '7'
    if (chord.suffix === 'maj7') modifiers += 'maj7'
    if (chord.suffix === 'm7') modifiers += '7'
    if (chord.suffix === 'dim7') modifiers += '7'
    if (chord.suffix === 'm7b5') modifiers += '7'

    romanNumeral = prefix + numeral + modifiers
  }

  return romanNumeral
}

function findNearestScaleDegree(chromaticDistance, scaleSemitones) {
  let bestIdx = 0
  let bestDiff = Infinity
  for (let i = 0; i < scaleSemitones.length; i++) {
    const diff = Math.abs(scaleSemitones[i] - chromaticDistance)
    if (diff < bestDiff) {
      bestDiff = diff
      bestIdx = i
    }
  }
  return bestIdx
}

// ─── Note name analysis ───────────────────────────────────────────────────────

const ENHARMONIC_MAP = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
}

const KEY_SIGNATURES = {
  'C': { sharps: [], flats: [] },
  'G': { sharps: ['F'], flats: [] },
  'D': { sharps: ['F', 'C'], flats: [] },
  'A': { sharps: ['F', 'C', 'G'], flats: [] },
  'E': { sharps: ['F', 'C', 'G', 'D'], flats: [] },
  'B': { sharps: ['F', 'C', 'G', 'D', 'A'], flats: [] },
  'F#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E'], flats: [] },
  'C#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E', 'B'], flats: [] },
  'F': { sharps: [], flats: ['B'] },
  'Bb': { sharps: [], flats: ['B', 'E'] },
  'Eb': { sharps: [], flats: ['B', 'E', 'A'] },
  'Ab': { sharps: [], flats: ['B', 'E', 'A', 'D'] },
  'Db': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G'] },
  'Gb': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C'] },
  'Cb': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C', 'F'] },
}

const MINOR_TO_RELATIVE_MAJOR = {
  'A': 'C', 'E': 'G', 'B': 'D', 'F#': 'A', 'C#': 'E', 'G#': 'B', 'D#': 'F#', 'A#': 'C#',
  'D': 'F', 'G': 'Bb', 'C': 'Eb', 'F': 'Ab', 'Bb': 'Db', 'Eb': 'Gb', 'Ab': 'Cb'
}

function getEnharmonicNoteName(midiNum, key, mode) {
  const octave = Math.floor(midiNum / 12) - 1
  const semitone = midiNum % 12
  let noteName = SEMITONE_TO_SHARP[semitone]

  let keySignature = KEY_SIGNATURES[key]
  if (mode === 'Minor') {
    const relativeMajor = MINOR_TO_RELATIVE_MAJOR[key] || 'C'
    keySignature = KEY_SIGNATURES[relativeMajor] || { sharps: [], flats: [] }
  }
  if (!keySignature) keySignature = { sharps: [], flats: [] }

  if (noteName.includes('#') && keySignature.flats.length > 0) {
    const flatEquivalent = ENHARMONIC_MAP[noteName]
    if (flatEquivalent) noteName = flatEquivalent
  } else if (noteName.includes('b') && keySignature.sharps.length > 0) {
    const sharpEquivalent = ENHARMONIC_MAP[noteName]
    if (sharpEquivalent) noteName = sharpEquivalent
  }

  return noteName
}

// ─── Main analysis function ───────────────────────────────────────────────────

/**
 * Generate annotation events for a track's notes.
 * Each event has: { start, pitch, note, duration, degree_info?, chord_info? }
 *
 * @param {Array} notes - Array of note objects { id, note, start, duration, velocity }
 * @param {string} key - Key root (e.g. 'C', 'F#', 'Bb')
 * @param {string} mode - 'Major' or 'Minor'
 * @param {string} annotationType - 'note_names', 'scale_degrees', 'chord_names', 'roman_numerals'
 * @returns {Array} annotation events
 */
export function analyzeAnnotations(notes, key, mode, annotationType) {
  if (!notes || notes.length === 0 || annotationType === 'none') return []

  const tonicPc = noteNameToSemitone(key) >= 0 ? noteNameToSemitone(key) : 0
  const scaleSemitones = mode === 'Minor' ? MINOR_SCALE_SEMITONES : MAJOR_SCALE_SEMITONES
  const degreeMap = DEGREE_MAP

  if (annotationType === 'note_names' || annotationType === 'scale_degrees') {
    return notes.map(note => {
      const midi = noteToMidi(note.note)
      if (midi === null) return null
      const pc = midiToPitchClass(midi)
      const chromaticDistance = (pc - tonicPc + 12) % 12
      const isDiatonic = scaleSemitones.includes(chromaticDistance)

      const noteName = getEnharmonicNoteName(midi, key, mode)
      const scaleDegree = degreeMap[chromaticDistance] || '?'

      return {
        start: note.start,
        pitch: note.note,
        note: noteName,
        duration: note.duration,
        degree_info: {
          scale_degree: scaleDegree,
          chromatic_distance: chromaticDistance,
          is_diatonic: isDiatonic,
        },
      }
    }).filter(Boolean)
  }

  if (annotationType === 'chord_names' || annotationType === 'roman_numerals') {
    // Group notes by start time (within tolerance)
    const tolerance = 0.01
    const groups = new Map()

    const sortedNotes = [...notes].sort((a, b) => a.start - b.start)
    for (const note of sortedNotes) {
      let placed = false
      for (const [groupStart, groupNotes] of groups) {
        if (Math.abs(note.start - groupStart) < tolerance) {
          groupNotes.push(note)
          placed = true
          break
        }
      }
      if (!placed) {
        groups.set(note.start, [note])
      }
    }

    const events = []
    for (const [start, groupNotes] of groups) {
      const pitchClasses = groupNotes.map(n => {
        const midi = noteToMidi(n.note)
        return midi !== null ? midiToPitchClass(midi) : null
      }).filter(pc => pc !== null)

      if (pitchClasses.length < 2) {
        // Single note — still provide degree info
        const note = groupNotes[0]
        const midi = noteToMidi(note.note)
        if (midi !== null) {
          const pc = midiToPitchClass(midi)
          const chromaticDistance = (pc - tonicPc + 12) % 12
          const isDiatonic = scaleSemitones.includes(chromaticDistance)
          events.push({
            start,
            pitch: note.note,
            note: getEnharmonicNoteName(midi, key, mode),
            duration: note.duration,
            degree_info: {
              scale_degree: degreeMap[chromaticDistance] || '?',
              chromatic_distance: chromaticDistance,
              is_diatonic: isDiatonic,
            },
            chord_info: null,
          })
        }
        continue
      }

      const chord = detectChord(pitchClasses)
      const romanNumeral = chord ? chordToRomanNumeral(chord, key, mode) : ''

      // Determine color: red if non-diatonic
      let isDiatonic = true
      if (chord) {
        const rootDist = (chord.root - tonicPc + 12) % 12
        isDiatonic = scaleSemitones.includes(rootDist)
      }

      events.push({
        start,
        pitch: groupNotes[0].note,
        note: getEnharmonicNoteName(noteToMidi(groupNotes[0].note), key, mode),
        duration: Math.max(...groupNotes.map(n => n.duration)),
        degree_info: null,
        chord_info: chord ? {
          chord_label: chord.chord_label,
          roman_numeral: romanNumeral,
          root: chord.root,
          quality: chord.quality,
          color: isDiatonic ? null : 'red',
        } : null,
      })
    }

    return events.sort((a, b) => a.start - b.start)
  }

  return []
}

/**
 * Get the note name label for a MIDI note, respecting key signature.
 */
export function getNoteNameLabel(midiNum, key, mode) {
  return getEnharmonicNoteName(midiNum, key, mode)
}
