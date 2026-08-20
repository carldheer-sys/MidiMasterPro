import { noteToMidi, midiToPitchClass, getKeyPreferredNaming, midiToNote, noteNameToSemitone } from './musicUtils'
import { SEMITONE_TO_SHARP, SEMITONE_TO_FLAT } from '../constants'

// ─── Scale degree maps ───────────────────────────────────────────────────────

const DEGREE_MAP = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
}

const DEGREE_NAMES = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII']

const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11]
const MINOR_SCALE_SEMITONES = [0, 2, 3, 5, 7, 8, 10]

// ─── Chord detection ──────────────────────────────────────────────────────────

// Chord templates: intervals from root in semitones → suffix
// Ordered: 4-note (7th) chords first, then added-note chords, then triads
const CHORD_TEMPLATES = [
  { intervals: [0, 4, 7, 11], suffix: 'maj7', quality: 'major' },
  { intervals: [0, 4, 7, 10], suffix: '7', quality: 'major' },
  { intervals: [0, 3, 7, 10], suffix: 'm7', quality: 'minor' },
  { intervals: [0, 3, 6, 10], suffix: 'm7b5', quality: 'half-diminished' },
  { intervals: [0, 3, 6, 9], suffix: 'o7', quality: 'diminished' },
  { intervals: [0, 4, 7, 9], suffix: '6', quality: 'major' },
  { intervals: [0, 3, 7, 9], suffix: 'm6', quality: 'minor' },
  { intervals: [0, 2, 4, 7], suffix: 'add9', quality: 'major' },
  { intervals: [0, 2, 3, 7], suffix: 'madd9', quality: 'minor' },
  { intervals: [0, 4, 8], suffix: '+', quality: 'augmented' },
  { intervals: [0, 3, 6], suffix: 'o', quality: 'diminished' },
  { intervals: [0, 5, 7], suffix: 'sus4', quality: 'suspended' },
  { intervals: [0, 2, 7], suffix: 'sus2', quality: 'suspended' },
  { intervals: [0, 4, 7], suffix: '', quality: 'major' },
  { intervals: [0, 3, 7], suffix: 'm', quality: 'minor' },
]

/**
 * Detect a chord from a set of pitch classes.
 * Returns { root, suffix, quality, chord_label } or null.
 */
function detectChord(pitchClasses, key, mode, bassPc) {
  if (!pitchClasses || pitchClasses.length === 0) return null
  const pcs = [...new Set(pitchClasses)].sort((a, b) => a - b)
  if (pcs.length < 2) return null

  let bestMatch = null
  let bestScore = -1

  for (const rootPc of pcs) {
    const intervals = pcs.map(pc => (pc - rootPc + 12) % 12).sort((a, b) => a - b)
    const intervalSet = new Set(intervals)

    for (const template of CHORD_TEMPLATES) {
      if (intervals.length < template.intervals.length) continue
      // Require ALL template intervals to be present in the input
      const allTemplatePresent = template.intervals.every(iv => intervalSet.has(iv))
      if (!allTemplatePresent) continue
      const matchCount = template.intervals.length
      const score = matchCount * 10 - (intervals.length - template.intervals.length)
      if (score > bestScore) {
        bestScore = score
        bestMatch = { rootPc, suffix: template.suffix, quality: template.quality }
      } else if (score === bestScore && bestMatch) {
        // Tiebreaker: prefer root matching bass note, then lower pitch class
        const bestIsBass = bestMatch.rootPc === bassPc
        const candIsBass = rootPc === bassPc
        if (candIsBass && !bestIsBass) {
          bestMatch = { rootPc, suffix: template.suffix, quality: template.quality }
        } else if (!candIsBass && !bestIsBass && rootPc < bestMatch.rootPc) {
          bestMatch = { rootPc, suffix: template.suffix, quality: template.quality }
        }
      }
    }
  }

  if (!bestMatch) return null

  const rootName = getEnharmonicNoteName(bestMatch.rootPc, key, mode)
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
 * Base degree is mode-independent (from DEGREE_NAMES).
 * Case is determined by chord quality, not by expected diatonic quality.
 */
function chordToRomanNumeral(chord, key, mode) {
  if (!chord) return ''
  const tonicPc = noteNameToSemitone(key) >= 0 ? noteNameToSemitone(key) : 0
  const chromaticDistance = (chord.root - tonicPc + 12) % 12

  const baseDegree = DEGREE_NAMES[chromaticDistance]

  // Separate accidental prefix from numeral part
  const accidental = baseDegree[0] === 'b' || baseDegree[0] === '#' ? baseDegree[0] : ''
  const numeralPart = accidental ? baseDegree.slice(1) : baseDegree

  // Determine case from chord quality (conventions §5.2)
  const isMajor = chord.quality === 'major' || chord.quality === 'augmented' || chord.quality === 'suspended'
  const numeral = accidental + (isMajor ? numeralPart.toUpperCase() : numeralPart.toLowerCase())

  // Build extension from suffix (conventions §5.3)
  let extension = ''
  if (chord.suffix === 'o') extension = 'o'
  else if (chord.suffix === 'o7') extension = 'o7'
  else if (chord.suffix === '+') extension = '+'
  else if (chord.suffix === 'm7b5') extension = 'm7b5'
  else if (chord.suffix === '7') extension = '7'
  else if (chord.suffix === 'maj7') extension = 'maj7'
  else if (chord.suffix === 'm7') extension = '7'
  else if (chord.suffix === '6') extension = '6'
  else if (chord.suffix === 'm6') extension = '6'
  else if (chord.suffix === 'add9') extension = 'add9'
  else if (chord.suffix === 'madd9') extension = 'madd9'

  return numeral + extension
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

      const bassPc = Math.min(...groupNotes.map(n => noteToMidi(n.note)).filter(m => m !== null)) % 12
      const chord = detectChord(pitchClasses, key, mode, bassPc)
      const romanNumeral = chord ? chordToRomanNumeral(chord, key, mode) : ''

      // Determine color: red if non-diatonic (all chord tones must be in scale)
      let isDiatonic = true
      if (chord) {
        isDiatonic = pitchClasses.every(pc =>
          scaleSemitones.includes((pc - tonicPc + 12) % 12)
        )
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
