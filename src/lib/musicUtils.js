import { SEMITONE_TO_SHARP, SEMITONE_TO_FLAT, SHARP_KEYS, FLAT_KEYS, KEY_NAMING_MAP } from '../constants'

export const noteNameToSemitone = (pc) => {
  const sharpIdx = SEMITONE_TO_SHARP.indexOf(pc)
  if (sharpIdx !== -1) return sharpIdx
  const flatIdx = SEMITONE_TO_FLAT.indexOf(pc)
  return flatIdx
}

export const getKeyPreferredNaming = (key, mode) => {
  const mapKey = `${key} ${mode}`
  if (KEY_NAMING_MAP[mapKey]) return KEY_NAMING_MAP[mapKey]
  if (FLAT_KEYS.has(key)) return 'flat'
  if (SHARP_KEYS.has(key)) return 'sharp'
  return 'sharp'
}

export const noteToMidi = (note) => {
  const match = String(note || '').match(/^([A-G](?:#|b)?)(-?\d+)$/)
  if (!match) return null
  const [, pitchClass, octaveStr] = match
  const semitone = noteNameToSemitone(pitchClass)
  if (semitone === -1) return null
  return (Number(octaveStr) + 1) * 12 + semitone
}

export const midiToNote = (midi, naming = 'sharp') => {
  const semitoneNames = naming === 'flat' ? SEMITONE_TO_FLAT : SEMITONE_TO_SHARP
  const normalized = Math.max(0, Math.round(midi))
  const octave = Math.floor(normalized / 12) - 1
  const semitone = normalized % 12
  return `${semitoneNames[semitone]}${octave}`
}

export const midiToPitchClass = (midi) => {
  return ((midi % 12) + 12) % 12
}

export const getTrackRangeMidi = (track) => {
  const fallbackLowest = `C${track?.lowestOctave ?? 3}`
  const fallbackHighest = `B${track?.highestOctave ?? 4}`
  const lowestMidi = noteToMidi(track?.lowestNote || fallbackLowest) ?? 48
  const highestMidi = noteToMidi(track?.highestNote || fallbackHighest) ?? 71
  return {
    lowestMidi: Math.min(lowestMidi, highestMidi - 1),
    highestMidi: Math.max(highestMidi, lowestMidi + 1)
  }
}

export const buildNoteRangeByMidi = (lowestMidi, highestMidi, pitchNaming, labelNaming) => {
  const result = []
  for (let midi = highestMidi; midi >= lowestMidi; midi -= 1) {
    result.push({
      pitch: midiToNote(midi, pitchNaming),
      label: midiToNote(midi, labelNaming)
    })
  }
  return result
}

export const canonicalizeNoteName = (note, naming) => {
  const octave = note.match(/-?\d+$/)?.[0]
  const pitch = octave ? note.slice(0, note.length - octave.length) : note
  const semitone = noteNameToSemitone(pitch)
  if (semitone === -1 || !octave) return note
  const names = naming === 'flat' ? SEMITONE_TO_FLAT : SEMITONE_TO_SHARP
  return `${names[semitone]}${octave}`
}

export const remapNotesToNaming = (noteList, naming) =>
  (noteList || []).map(n => ({ ...n, note: canonicalizeNoteName(n.note, naming) }))

export const generateId = () => Math.random().toString(36).substr(2, 9)
