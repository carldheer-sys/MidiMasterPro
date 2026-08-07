export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const MODES = ['Major', 'Minor']
export const TIME_DIVISIONS = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32']

export const TIME_SIGNATURE_PRESETS = [
  { numerator: 2, denominator: 4, label: '2/4' },
  { numerator: 3, denominator: 4, label: '3/4' },
  { numerator: 4, denominator: 4, label: '4/4' },
  { numerator: 5, denominator: 4, label: '5/4' },
  { numerator: 6, denominator: 4, label: '6/4' },
  { numerator: 3, denominator: 8, label: '3/8' },
  { numerator: 6, denominator: 8, label: '6/8' },
  { numerator: 9, denominator: 8, label: '9/8' },
  { numerator: 12, denominator: 8, label: '12/8' },
]

export const SHARP_KEYS = new Set(['G', 'D', 'A', 'E', 'B', 'F#', 'C#'])
export const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'])

export const SEMITONE_TO_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SEMITONE_TO_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export const KEY_NAMING_MAP = {
  'C Major': 'flat', 'A Minor': 'flat',
  'G Major': 'sharp', 'E Minor': 'sharp',
  'D Major': 'sharp', 'B Minor': 'sharp',
  'A Major': 'sharp', 'F# Minor': 'sharp',
  'E Major': 'sharp', 'C# Minor': 'sharp',
  'B Major': 'sharp', 'G# Minor': 'sharp',
  'F# Major': 'sharp', 'D# Minor': 'sharp',
  'C# Major': 'sharp', 'A# Minor': 'sharp',
  'F Major': 'flat', 'D Minor': 'flat',
  'Bb Major': 'flat', 'G Minor': 'flat',
  'Eb Major': 'flat', 'C Minor': 'flat',
  'Ab Major': 'flat', 'F Minor': 'flat',
  'Db Major': 'flat', 'Bb Minor': 'flat',
  'Gb Major': 'flat', 'Eb Minor': 'flat',
  'Cb Major': 'flat', 'Ab Minor': 'flat'
}

export const ANNOTATION_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'note_names', label: 'Note Names' },
  { value: 'scale_degrees', label: 'Scale Degrees' },
  { value: 'chord_names', label: 'Chord Names' },
  { value: 'roman_numerals', label: 'Roman Numerals' },
]

export const TRACK_NAMES = {
  treble: 'Treble',
  bass: 'Bass',
}

export const TRACK_CONFIG = {
  treble: { lowestOctave: 3, highestOctave: 5, clef: 'treble' },
  bass: { lowestOctave: 1, highestOctave: 4, clef: 'bass' },
}
