# Music Theory Naming Conventions — Implementation Guide

> **Purpose**: Complete specification for implementing correct scale-degree, chord, and Roman-numeral naming in a music theory study app. Derived from the battle-tested implementation in EarMasterPro.

---

## 1. Core Data Model

All pitch manipulation is done in **MIDI numbers** (integer semitones from C-1=0). Pitch class = `midi % 12`.

```
Pitch Class: 0=C, 1=C#/Db, 2=D, 3=D#/Eb, 4=E, 5=F,
             6=F#/Gb, 7=G, 8=G#/Ab, 9=A, 10=A#/Bb, 11=B
```

Every analysis function takes two inputs:
- **`tonic`**: string like `"C"`, `"F#"`, `"Bb"` — the key root
- **`mode`**: `"Major"` or `"Minor"` (natural minor / Aeolian)

---

## 2. Scale Degrees

### 2.1 Algorithm

```
chromaticDistance = (pitchClass - tonicPitchClass + 12) % 12
```

Then map `chromaticDistance` (0–11) to a label using this **fixed table**:

| Semitones from tonic | Degree Label | Diatonic in Major? | Diatonic in Minor? |
|---------------------:|:-------------|:------------------:|:------------------:|
| 0                    | `1`          | ✅ | ✅ |
| 1                    | `b2`         | ❌ | ❌ |
| 2                    | `2`          | ✅ | ✅ |
| 3                    | `b3`         | ❌ | ✅ |
| 4                    | `3`          | ✅ | ❌ |
| 5                    | `4`          | ✅ | ✅ |
| 6                    | `#4`         | ❌ | ❌ |
| 7                    | `5`          | ✅ | ✅ |
| 8                    | `b6`         | ❌ | ✅ |
| 9                    | `6`          | ✅ | ❌ |
| 10                   | `b7`         | ❌ | ✅ |
| 11                   | `7`          | ✅ | ❌ |

**Diatonic pitch-class sets**:
- Major: `{0, 2, 4, 5, 7, 9, 11}` — the major scale
- Minor: `{0, 2, 3, 5, 7, 8, 10}` — the natural minor scale

### 2.2 Key Rules

1. The degree label is always relative to the **tonic**, never to the scale's notes. A C# in D Major is `b7` (semitone 10 from D), not "7 of the scale."
2. Octave is irrelevant — only pitch class matters. C3, C4, C5 all produce degree `1` in C Major.
3. The `#4` label is used for the tritone (semitone 6), **not** `b5`. This is a convention choice; stick with one consistently.
4. `b2`, `b3`, `b6`, `b7` use flat notation by convention, regardless of key. The degree names are **absolute relative to the tonic** and do not change spelling based on key signature.

### 2.3 Implementation (JavaScript)

```javascript
const degreeMap = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
}

const diatonicMajor = new Set([0, 2, 4, 5, 7, 9, 11])
const diatonicMinor = new Set([0, 2, 3, 5, 7, 8, 10])

function getScaleDegree(midiNote, tonicPitchClass, mode) {
  const pc = midiNote % 12
  const chromaticDistance = (pc - tonicPitchClass + 12) % 12
  return {
    scale_degree: degreeMap[chromaticDistance],
    chromatic_distance: chromaticDistance,
    is_diatonic: mode === 'Major'
      ? diatonicMajor.has(chromaticDistance)
      : diatonicMinor.has(chromaticDistance)
  }
}
```

### 2.4 Expected Outputs (Test Cases)

| Key | Mode | Notes | Expected Degrees |
|-----|------|-------|-----------------|
| C   | Major | C D E F G A B C | `1 2 3 4 5 6 7 1` |
| C   | Major | C C# D D# E F F# G G# A A# B | `1 b2 2 b3 3 4 #4 5 b6 6 b7 7` |
| A   | Minor | A B C D E F G A | `1 2 b3 4 5 b6 b7 1` |
| G   | Major | G A B C D E F# G | `1 2 3 4 5 6 7 1` |
| E   | Minor | E F# G A B C D E | `1 2 b3 4 5 b6 b7 1` |
| C#  | Minor | C# D# E F# G# A B C# | `1 2 b3 4 5 b6 b7 1` |

---

## 3. Enharmonic Note Naming (Key-Aware Spelling)

### 3.1 Problem

MIDI pitch class 1 can be spelled as `C#` or `Db`. The correct spelling depends on the key signature. In Db Major, it should be `Db`. In D Major, it should be `C#`.

### 3.2 Key Signature Tables

```javascript
const KEY_SIGNATURES = {
  // Major keys
  'C':  { sharps: [], flats: [] },
  'G':  { sharps: ['F'], flats: [] },
  'D':  { sharps: ['F', 'C'], flats: [] },
  'A':  { sharps: ['F', 'C', 'G'], flats: [] },
  'E':  { sharps: ['F', 'C', 'G', 'D'], flats: [] },
  'B':  { sharps: ['F', 'C', 'G', 'D', 'A'], flats: [] },
  'F#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E'], flats: [] },
  'C#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E', 'B'], flats: [] },
  'F':  { sharps: [], flats: ['B'] },
  'Bb': { sharps: [], flats: ['B', 'E'] },
  'Eb': { sharps: [], flats: ['B', 'E', 'A'] },
  'Ab': { sharps: [], flats: ['B', 'E', 'A', 'D'] },
  'Db': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G'] },
  'Gb': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C'] },
  'Cb': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C', 'F'] },
}

const ENHARMONIC_MAP = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
}
```

### 3.3 Minor Key Handling

For minor keys, look up the **relative major's** key signature:

```javascript
const minorToRelativeMajor = {
  'A': 'C', 'E': 'G', 'B': 'D', 'F#': 'A', 'C#': 'E', 'G#': 'B', 'D#': 'F#', 'A#': 'C#',
  'D': 'F', 'G': 'Bb', 'C': 'Eb', 'F': 'Ab', 'Bb': 'Db', 'Eb': 'Gb', 'Ab': 'Cb'
}
```

### 3.4 Algorithm

1. Get the base note name from pitch class using sharps: `['C', 'C#', 'D', ...]`
2. Look up the key signature (via relative major if minor mode).
3. If the note has a `#` and the key uses **flats**, convert to flat spelling via `ENHARMONIC_MAP`.
4. If the note has a `b` and the key uses **sharps**, convert to sharp spelling via `ENHARMONIC_MAP`.
5. Natural notes (C, D, E, F, G, A, B) are never converted.

### 3.5 Notation Preference (Sharp vs Flat by Key)

**Sharp keys**: C, G, D, A, E, B, F#, C# Major + their relative minors (A, E, B, F#, C#, G#, D#, A# Minor)

**Flat keys**: F, Bb, Eb, Ab, Db, Gb, Cb Major + their relative minors (D, G, C, F, Bb, Eb, Ab Minor)

```python
flat_major_keys = {'F', 'B-', 'E-', 'A-', 'D-', 'G-', 'C-'}
flat_minor_keys  = {'D', 'G', 'C', 'F', 'B-', 'E-', 'A-'}  # relative minors of flat majors
# Everything else → sharp
```

---

## 4. Chord Identification

### 4.1 Chord Label Format

Chord labels use **jazz/pop notation** (not classical):

| Chord Type | Label Suffix | Example |
|-----------|:-------------|---------|
| Major triad | *(none)* | `C`, `F`, `G` |
| Minor triad | `m` | `Am`, `Dm` |
| Diminished triad | `o` | `Bo` |
| Augmented triad | `+` | `C+` |
| Dominant 7th | `7` | `G7`, `F7` |
| Major 7th | `maj7` | `Cmaj7` |
| Minor 7th | `m7` | `Am7` |
| Diminished 7th | `o7` | `Bo7` |
| Half-diminished 7th | `m7b5` | `Bm7b5` |
| Minor-major 7th | `m(maj7)` | `Am(maj7)` |
| Suspended 4th | `sus4` | `Csus4` |
| Suspended 2nd | `sus2` | `Csus2` |
| Dominant 9th | `9` | `G9` |
| Major 9th | `maj9` | `Cmaj9` |
| Minor 9th | `m9` | `Am9` |
| Dominant 11th | `11` | `G11` |
| Major 11th | `maj11` | `Cmaj11` |
| Minor 11th | `m11` | `Am11` |
| Dominant 13th | `13` | `G13` |
| Major 13th | `maj13` | `Cmaj13` |
| Minor 13th | `m13` | `Am13` |
| Added 9th | `add9` | `Cadd9` |
| Minor add 9th | `madd9` | `Amadd9` |
| Augmented 7th | `+7` | `C+7` |
| Augmented major 7th | `+maj7` | `C+maj7` |

### 4.2 Chord Label Rendering (CSS Superscript)

Chord labels are rendered in the UI using the `ChordLabel` React component, which splits the label into a **base** (inline) and a **suffix** (CSS superscript via `vertical-align: super`, `fontSize: 0.65em`).

**Parsing rules:**
1. Root = note letter (A–G) + optional accidental (`#`/`b`).
2. Everything after the root is the suffix.
3. If the suffix starts with `m` but **not** `maj`, the `m` is a minor indicator and stays **inline** with the root. Only the remaining suffix becomes the superscript.
4. If the suffix starts with `maj`, the `m` is part of `maj7` and stays in the **superscript**.

| Chord Label | Base (inline) | Suffix (superscript) | Explanation |
|------------|--------------|---------------------|-------------|
| `C` | `C` | *(none)* | Major triad |
| `Am` | `Am` | *(none)* | Minor triad — `m` stays inline |
| `Bo` | `B` | `o` | Diminished triad |
| `C+` | `C` | `+` | Augmented triad |
| `G7` | `G` | `7` | Dominant 7th |
| `Cmaj7` | `C` | `maj7` | Major 7th — `m` is part of `maj` |
| `Am7` | `Am` | `7` | Minor 7th — `m` stays inline |
| `Bo7` | `B` | `o7` | Diminished 7th |
| `Bm7b5` | `Bm` | `7b5` | Half-diminished — `m` stays inline |
| `Am(maj7)` | `Am` | `(maj7)` | Minor-major 7th — `m` stays inline |
| `C+maj7` | `C` | `+maj7` | Augmented major 7th |

### 4.3 Inversions

When the bass note (lowest sounding pitch) differs from the chord root, append `/BassNote`:
- `G/B` = G major in first inversion (B in bass)
- `C/G` = C major in second inversion (G in bass)
- `Am/E` = A minor in first inversion

**Roman numeral inversions** use slash notation with the **bass note's scale degree** (relative to the home key):
- `I/3` = I chord in 1st inversion (3rd scale degree in bass)
- `iii/5` = iii chord in 1st inversion (5th scale degree in bass)
- `IV/1` = IV chord in 2nd inversion (1st scale degree in bass)
- `V7/7` = V7 in 1st inversion (7th scale degree in bass)
- `V7/2` = V7 in 2nd inversion (2nd scale degree in bass)
- `V7/4` = V7 in 3rd inversion (4th scale degree in bass)

Root position chords have no slash suffix. The bass scale degree is computed from the chord's interval at the inversion index, added to the chord root, then expressed as a scale degree relative to the tonic using the `DEGREE_MAP`.

### 4.4 Chord Normalization (Root Finding)

When multiple pitches are sounding, you must find the **root** before labeling. Algorithm:

1. Collect all unique pitch classes from the sounding notes.
2. For each pitch class as a candidate root, compute the intervals from it to all other pitch classes.
3. Score each candidate:
   - `[0, 4, 7]` (major triad) → 100
   - `[0, 3, 7]` (minor triad) → 100
   - `[0, 3, 6]` (diminished) → 100
   - `[0, 4, 8]` (augmented) → 90
   - Any set starting with `[0, 4, 7]` → 95 (major with extensions)
   - Any set starting with `[0, 3, 7]` → 95 (minor with extensions)
   - `[0, 3, 6, 9]` or `[0, 3, 6, 10]` → 95 (diminished/half-dim 7ths)
   - Has a perfect 5th (7) → 50
   - Otherwise → 0
4. Pick the highest-scoring root. On ties, prefer the lower pitch class number.

### 4.5 Chord Spelling Normalization

Once the root is found, spell all chord tones relative to that root using proper interval names (not just nearest semitone). This ensures a C major chord is spelled C-E-G (not C-Fb-G), and a diminished chord gets proper enharmonic spelling (B-D-F, not B-Eb-F for Bo).

The mapping from semitone offset to scale degree (relative to root):

| Semitones | Degree | Letter step from root |
|----------:|--------|----------------------|
| 0 | 1 (root) | 0 |
| 1 | b2 | 1 with flat |
| 2 | 2 | 1 |
| 3 | b3 | 2 with flat |
| 4 | 3 | 2 |
| 5 | 4 | 3 |
| 6 | #4 / b5 | 3 with # or 4 with b |
| 7 | 5 | 4 |
| 8 | #5 / b6 | 4 with # or 5 with b |
| 9 | 6 | 5 |
| 10 | b7 | 6 with flat |
| 11 | 7 | 6 |

For diminished chords, semitone 6 should be spelled as `b5` (degree 4 with flat), not `#4`.

### 4.6 Sharp/Flat Conversion for Chord Labels

After identifying a chord, convert its root spelling to match the key's notation preference:

```python
sharp_to_flat = {'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb', 'E#': 'F', 'B#': 'C'}
flat_to_sharp = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Fb': 'E', 'Cb': 'B'}
```

If the key is a flat key and the chord root is a sharp note, convert it. And vice versa. Also convert the bass note in inversions.

---

## 5. Roman Numerals

### 5.1 Degree Determination

Calculate the semitone distance from the tonic to the chord root:

```python
degree_names = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII']
base_degree = degree_names[semitones_from_tonic % 12]
```

### 5.2 Case and Accidentals

The Roman numeral encodes chord **quality** through case:

| Chord Quality | Numeral Case | Example |
|-------------|:-------------|---------|
| Major | **UPPER** | `I`, `IV`, `V` |
| Minor | **lower** | `ii`, `iii`, `vi` |
| Diminished | **lower + `o`** | `viio`, `iio` |
| Augmented | **UPPER + +** | `I+`, `III+` |

Accidentals (`b`, `#`) from the degree name are preserved as prefixes:
- `bII` = Neapolitan chord (root on b2)
- `bIII` = submediant in minor (root on b3)
- `bVI` = submediant in minor (root on b6)
- `bVII` = subtonic in minor (root on b7)
- `#IV` = augmented fourth degree

### 5.3 Extensions (7ths, 9ths, etc.)

Seventh chord extensions are written **inline** after the Roman numeral letters and rendered as **CSS superscripts** in the UI (via `vertical-align: super`). Triad quality suffixes (`o`, `+`) remain inline.

| Chord Label | Roman Numeral | Explanation |
|------------|---------------|-------------|
| `C` in C Major | `I` | Major triad, no suffix |
| `G7` in C Major | `V7` | Dominant 7th — `7` suffix (rendered as superscript) |
| `Dm7` in C Major | `ii7` | Minor 7th — `7` suffix, omit `m` (lowercase Roman already shows minor) |
| `Cmaj7` in C Major | `Imaj7` | Major 7th — `maj7` suffix |
| `Bm7b5` in C Major | `viim7b5` | Half-diminished — `m7b5`, keep `m` for clarity |
| `Bo7` in C Major | `viio7` | Diminished 7th — `o7` suffix |
| `Am(maj7)` in C Major | `vimaj7` | Minor-major 7th — `maj7` (lowercase Roman shows minor) |

**Rules for extension mapping**:
- All seventh chord extensions are inline suffixes: `7`, `maj7`, `m7b5`, `o7`
- **Dominant 7th**: `7` (e.g., `V7`, `bVII7`)
- **Major 7th**: `maj7` (e.g., `Imaj7`, `IVmaj7`)
- **Minor 7th**: `7` — the `m` is omitted because the lowercase Roman numeral already indicates minor quality (e.g., `ii7`, `vi7`)
- **Half-diminished 7th**: `m7b5` — the `m` is kept because the chord is more complex and the `m7b5` label is standard in jazz notation (e.g., `viim7b5`, `iim7b5`)
- **Diminished 7th**: `o7` (e.g., `viio7`)
- **Minor-major 7th**: `maj7` — lowercase Roman shows minor, `maj7` shows the major 7th extension (e.g., `imaj7`)
- **Augmented-major 7th**: `+maj7` — the `+` stays inline for the augmented triad, `maj7` for the extension (e.g., `bIII+maj7`)
- Triad quality suffixes (`o` for diminished, `+` for augmented) stay inline: `viio`, `bIII+`
- `sus`, `add9`, `madd9` chords → no extension appended
- The `getRomanParts()` function parses a Roman numeral string into `{ base, superscript, secondary }` for CSS superscript rendering (e.g., `Imaj7` → base `I`, superscript `maj7`)

### 5.4 Determining Quality from Chord Label

```python
is_minor = ('m' in label and 'maj' not in label) or 'm(maj7)' in label or 'madd9' in label
is_dim = 'o' in label  # 'o' for diminished triad, 'o7' for diminished 7th
is_aug = '+' in label  # '+' for augmented triad, '+maj7' for augmented major 7th
```

Apply in order: diminished → minor → augmented → major (default).

### 5.5 Expected Roman Numerals

**C Major diatonic triads**:

| Chord | Pitches | Roman Numeral | Diatonic |
|-------|---------|:-------------|:--------|
| C | C-E-G | `I` | ✅ |
| Dm | D-F-A | `ii` | ✅ |
| Em | E-G-B | `iii` | ✅ |
| F | F-A-C | `IV` | ✅ |
| G | G-B-D | `V` | ✅ |
| Am | A-C-E | `vi` | ✅ |
| Bo | B-D-F | `viio` | ✅ |

**C Major diatonic 7ths**:

| Chord | Pitches | Roman Numeral |
|-------|---------|:-------------|
| Cmaj7 | C-E-G-B | `Imaj7` |
| Dm7 | D-F-A-C | `ii7` |
| Em7 | E-G-B-D | `iii7` |
| Fmaj7 | F-A-C-E | `IVmaj7` |
| G7 | G-B-D-F | `V7` |
| Am7 | A-C-E-G | `vi7` |
| Bm7b5 | B-D-F-A | `viim7b5` |

**A Minor diatonic triads**:

| Chord | Pitches | Roman Numeral | Diatonic |
|-------|---------|:-------------|:--------|
| Am | A-C-E | `i` | ✅ |
| Bo | B-D-F | `iio` | ✅ |
| C | C-E-G | `bIII` | ✅ |
| Dm | D-F-A | `iv` | ✅ |
| Em | E-G-B | `v` | ✅ |
| F | F-A-C | `bVI` | ✅ |
| G | G-B-D | `bVII` | ✅ |

### 5.6 Same Chord, Different Key Context

The **same chord** gets different Roman numerals depending on the key:

| Chord | In C Major | In A Minor | In A Major |
|-------|:----------|:-----------|:----------|
| Am (A-C-E) | `vi` (diatonic) | `i` (diatonic) | `i` (non-diatonic) |

The `is_diatonic` flag changes based on whether **all chord tones** belong to the key's pitch-class set.

---

## 6. Diatonic Determination

### 6.1 For Single Notes

A note is diatonic if its pitch class is in the key's scale:

```javascript
const diatonicPitches = mode === 'Major'
  ? new Set([0, 2, 4, 5, 7, 9, 11])   // major scale intervals from tonic
  : new Set([0, 2, 3, 5, 7, 8, 10])   // natural minor scale intervals from tonic

const isDiatonic = diatonicPitches.has((pitchClass - tonicPitchClass + 12) % 12)
```

### 6.2 For Chords

A chord is diatonic if **all** of its pitch classes belong to the key's pitch-class set:

```python
key_pitch_classes = {p.pitchClass for p in key.pitches}  # e.g. C Major = {0, 2, 4, 5, 7, 9, 11}
is_diatonic = all(p.pitchClass in key_pitch_classes for p in chord.pitches)
```

### 6.3 Key Pitch-Class Sets (Reference)

| Key | Mode | Pitch Classes |
|-----|------|:-------------|
| C Major / A Minor | Major/Minor | {0,2,4,5,7,9,11} / {9,11,0,2,4,5,7} |
| G Major / E Minor | Major/Minor | {7,9,11,0,2,4,6} / {4,6,7,9,11,0,2} |
| D Major / B Minor | Major/Minor | {2,4,6,7,9,11,1} / {11,1,2,4,6,7,9} |
| A Major / F# Minor | Major/Minor | {9,11,1,2,4,6,8} | {6,8,9,11,1,2,4} |
| E Major / C# Minor | Major/Minor | {4,6,8,9,11,1,3} | {1,3,4,6,8,9,11} |
| B Major / G# Minor | Major/Minor | {11,1,3,4,6,8,10} | {8,10,11,1,3,4,6} |
| F# Major / D# Minor | Major/Minor | {6,8,10,11,1,3,5} | {3,5,6,8,10,11,1} |
| F Major / D Minor | Major/Minor | {5,7,9,10,0,2,4} | {2,4,5,7,9,10,0} |
| Bb Major / G Minor | Major/Minor | {10,0,2,3,5,7,9} | {7,9,10,0,2,3,5} |
| Eb Major / C Minor | Major/Minor | {3,5,7,8,10,0,2} | {0,2,3,5,7,8,10} |
| Ab Major / F Minor | Major/Minor | {8,10,0,1,3,5,7} | {5,7,8,10,0,1,3} |
| Db Major / Bb Minor | Major/Minor | {1,3,5,6,8,10,0} | {10,0,1,3,5,6,8} |

---

## 7. Chord Analysis from MIDI Notes

### 7.1 Grouping Notes into Chords

1. Sort all notes by start time.
2. Find all unique start times.
3. At each start time, collect all **sounding** notes: notes where `note.start <= t < note.start + note.duration`.
4. Extract unique pitch classes (deduplicate enharmonic equivalents).
5. Require **≥3 unique pitch classes** to form a chord. Fewer = no chord event.

### 7.2 Processing Pipeline

```
Raw MIDI notes
  → Group by sounding at each timestamp
  → Deduplicate pitch classes
  → Normalize chord spelling (find root, spell intervals correctly)
  → Format chord label (root + suffix)
  → Detect inversion (compare bass to root)
  → Convert spelling to key notation preference (sharp/flat)
  → Determine diatonic status
  → Calculate Roman numeral
```

---

## 8. Summary of Conventions

1. **Scale degrees**: Always relative to tonic using fixed `b2, 2, b3, 3, #4, b6, b7` notation. Octave-independent.
2. **Diatonic**: Major scale = `{0,2,4,5,7,9,11}`, minor scale = `{0,2,3,5,7,8,10}` (intervals from tonic).
3. **Note spelling**: Sharps in sharp keys, flats in flat keys. Use relative major's key signature for minor keys.
4. **Chord labels**: Jazz notation (`C`, `Am`, `G7`, `Cmaj7`, `Dm7`, `Bo`, `Bm7b5`, `Csus4`). Inversions as `/BassNote`. Rendered via `ChordLabel` component with CSS superscript suffixes — minor `m` stays inline, `maj7`/`7`/`o`/`+`/`7b5` etc. as superscripts.
5. **Roman numerals**: Upper case = major, lower case = minor, lower+`o` = diminished, upper+`+` = augmented. Preserve accidentals from degree. Seventh chord extensions are inline suffixes rendered as CSS superscripts via `RomanNumeral` component: `7` (dominant), `maj7` (major 7th), `7` (minor 7th, omit `m`), `m7b5` (half-diminished, keep `m`), `o7` (diminished 7th). Triad suffixes (`o`, `+`) stay inline. Inversions use `/ScaleDegree` slash notation (e.g., `iii/5`, `V7/2`) or figured bass notation (e.g., `6`, `6/4`, `6/5`, `4/3`, `4/2`), selectable via a Format dropdown.
6. **Chord diatonic**: All chord tones must be in the key's pitch-class set.
7. **Root finding**: Score by interval match to known chord templates. Prefer triadic roots, then perfect-fifth-containing candidates.
8. **Same chord in different keys**: Different Roman numeral and potentially different diatonic status.

---

## 9. Secondary Chords — Equivalent Spelling

Secondary chords (secondary dominants and secondary leading-tone chords) are chromatic chords that resolve to a diatonic target chord. Each can be named in two ways:

1. **Functional notation**: `V7/X` or `viio7/X`, where X is the target chord's Roman numeral.
2. **Equivalent root notation**: The chord is re-named based on its actual root's scale degree, using the chord's own quality.

### 9.1 Secondary Dominants (V7/X)

A secondary dominant is a dominant 7th chord (intervals `[0, 4, 7, 10]`) whose root is a perfect 5th above the target chord's root: `root = (target + 7) mod 12`.

**Equivalent spelling rules:**
- The root of a secondary dominant is always a diatonic scale degree (a perfect 5th above a diatonic note is also diatonic in major/minor keys).
- Use **uppercase** Roman numeral (major triad quality) + `7` (dominant 7th suffix).
- Apply the degree's accidental prefix (e.g., `bVII7`, `bIII7`).

**Examples (C major):**
| Functional | Root semitone | Degree | Equivalent |
|---|---|---|---|
| V7/V | 2 | 2 | II7 |
| V7/ii | 9 | 6 | VI7 |
| V7/iii | 11 | 7 | VII7 |
| V7/vi | 4 | 3 | III7 |
| V7/IV | 0 | 1 | I7 |

**Examples (C minor):**
| Functional | Root semitone | Degree | Equivalent |
|---|---|---|---|
| V7/bIII | 10 | b7 | bVII7 |
| V7/bVI | 3 | b3 | bIII7 |
| V7/iv | 0 | 1 | I7 |

### 9.2 Secondary Leading-Tone Chords (viio7/X)

A secondary leading-tone chord is a fully diminished 7th chord (intervals `[0, 3, 6, 9]`) whose root is one semitone below the target chord's root: `root = (target - 1 + 12) mod 12`.

**Equivalent spelling rules:**
- Use **lowercase** Roman numeral (diminished quality) + `o7` (diminished 7th suffix).
- If the root falls on a **diatonic degree**, use that degree's standard label (including flats in minor, e.g., `iio7`, `vo7`).
- If the root falls on a **chromatic degree** (one semitone above a diatonic degree), use **sharp of the nearest lower diatonic degree** — never flat of the upper degree.
  - Example: In C major, `viio7/ii` has root at semitone 1. This is `#1` (sharp of degree 1), **not** `b2` (flat of degree 2). Equivalent: `#io7`.
  - In C major, `viio7/iii` has root at semitone 3. This is `#2` (sharp of degree 2), **not** `b3`. Equivalent: `#iio7`.
- **Special case in minor**: If the root is one semitone above `b3` (semitone 4), the equivalent uses **natural III** (removing the flat), since `#b3 = 3` (natural). Example: In C minor, `viio7/iv` has root at semitone 4 → equivalent `iiio7`.

**Examples (C major):**
| Functional | Root semitone | Degree | Equivalent |
|---|---|---|---|
| viio7/V | 6 | #4 | #ivo7 |
| viio7/ii | 1 | #1 | #io7 |
| viio7/iii | 3 | #2 | #iio7 |
| viio7/vi | 8 | #5 | #vo7 |

**Examples (C minor):**
| Functional | Root semitone | Degree | Equivalent |
|---|---|---|---|
| viio7/bIII | 2 | 2 (diatonic) | iio7 |
| viio7/bVI | 7 | 5 (diatonic) | vo7 |
| viio7/iv | 4 | 3 (natural III) | iiio7 |

### 9.3 Availability Filtering

A secondary chord is only shown as an option if its **target chord is diatonic** to the chosen key. Each secondary chord is pre-assigned an `applicableTonality` (`'major'` or `'minor'`) based on the key in which its target chord is diatonic with the expected quality:

- **Major-key chords** (e.g., `V7/ii`, `viio7/iii`): only shown in major keys, where the target chords have their standard major-key qualities (ii = minor, iii = minor, etc.).
- **Minor-key chords** (e.g., `V7/bIII`, `viio7/iv`): only shown in minor keys, where the target chords have their standard minor-key qualities (bIII = major, iv = minor, etc.).

This prevents, for example, `V7/ii` from appearing in a minor key (where the supertonic is `iio`, a diminished chord — a different harmonic function than the minor `ii` in major keys).

---

## 10. Natural Minor vs. Harmonic Minor

The app distinguishes between two minor scales:

### 10.1 Natural Minor (Aeolian)

The natural minor scale uses the same notes as its relative major. This is the default minor scale for all practice modes.

- **Scale degrees**: `1, 2, b3, 4, 5, b6, b7` (semitones: `0, 2, 3, 5, 7, 8, 10`)
- **Diatonic pitch-class set**: `{0, 2, 3, 5, 7, 8, 10}`
- **Key signature**: Same as relative major (e.g., A minor = C major → no sharps/flats)

**Diatonic triads (natural minor):**
| Degree | Roman | Quality | Intervals |
|---|---|---|---|
| 1 | `i` | minor | `[0, 3, 7]` |
| 2 | `iio` | diminished | `[0, 3, 6]` |
| b3 | `bIII` | major | `[0, 4, 7]` |
| 4 | `iv` | minor | `[0, 3, 7]` |
| 5 | `v` | minor | `[0, 3, 7]` |
| b6 | `bVI` | major | `[0, 4, 7]` |
| b7 | `bVII` | major | `[0, 4, 7]` |

**Diatonic sevenths (natural minor):**
| Degree | Roman | Quality | Intervals |
|---|---|---|---|
| 1 | `i7` | minor7 | `[0, 3, 7, 10]` |
| 2 | `iim7b5` | half-diminished | `[0, 3, 6, 10]` |
| b3 | `bIIImaj7` | major7 | `[0, 4, 7, 11]` |
| 4 | `iv7` | minor7 | `[0, 3, 7, 10]` |
| 5 | `v7` | minor7 | `[0, 3, 7, 10]` |
| b6 | `bVImaj7` | major7 | `[0, 4, 7, 11]` |
| b7 | `bVII7` | dominant7 | `[0, 4, 7, 10]` |

### 10.2 Harmonic Minor

The harmonic minor scale raises the 7th degree by one semitone, creating a leading tone. This produces the major V chord and the diminished viio chord.

- **Scale degrees**: `1, 2, b3, 4, 5, b6, 7` (semitones: `0, 2, 3, 5, 7, 8, 11`)
- **Diatonic pitch-class set**: `{0, 2, 3, 5, 7, 8, 11}`
- **Key signature**: Same as natural minor (the raised 7th is an accidental, not part of the key signature)

**Diatonic triads (harmonic minor):**
| Degree | Roman | Quality | Intervals |
|---|---|---|---|
| 1 | `i` | minor | `[0, 3, 7]` |
| 2 | `iio` | diminished | `[0, 3, 6]` |
| b3 | `bIII+` | augmented | `[0, 4, 8]` |
| 4 | `iv` | minor | `[0, 3, 7]` |
| 5 | `V` | major | `[0, 4, 7]` |
| b6 | `bVI` | major | `[0, 4, 7]` |
| 7 | `viio` | diminished | `[0, 3, 6]` |

**Diatonic sevenths (harmonic minor):**
| Degree | Roman | Quality | Intervals |
|---|---|---|---|
| 1 | `imaj7` | minor-major7 | `[0, 3, 7, 11]` |
| 2 | `iim7b5` | half-diminished | `[0, 3, 6, 10]` |
| b3 | `bIII+maj7` | augmented-major7 | `[0, 4, 8, 11]` |
| 4 | `iv7` | minor7 | `[0, 3, 7, 10]` |
| 5 | `V7` | dominant7 | `[0, 4, 7, 10]` |
| b6 | `bVImaj7` | major7 | `[0, 4, 7, 11]` |
| 7 | `viio7` | diminished7 | `[0, 3, 6, 9]` |

### 10.3 Integration in Practice Modes

In chord practice and chord progressions modes, the **V (triad) and V7 (seventh)** from the harmonic minor scale can be optionally included in the minor key's chord collection. This is controlled by a toggle button labeled "incl. V(7) from harm. minor" that appears under the tonality dropdown when minor is selected. It is enabled by default.

When enabled:
- The major V triad is added to the natural minor's diatonic triads (alongside the minor `v`).
- The dominant V7 seventh chord is added to the natural minor's diatonic sevenths (alongside the minor `v7`).
- Both chords are marked with `isHarmonicMinor: true` so they can be colored blue in the UI (same as borrowed chords from modal interchange).

### 10.4 Theory Overview Display

In the Theory Overview page's "Major/Minor" view mode:
- The former "Minor" row is renamed to **"Natural Minor"**.
- A new **"Harmonic Minor"** row is added below it, showing the full harmonic minor scale degrees and diatonic chords (triads and sevenths).

### 10.5 Progressions Catalog

In the Progressions Catalog, minor key sections include V/V7 from the harmonic minor scale as selectable chord options. A note "includes V/V7 of harmonic minor scale" is displayed near the minor progression tabs. Chords identified as V or V7 in minor progressions are colored blue in the catalog display.

---

## 11. Inversions in Chord Practice

### 11.1 Toggle

The Chord Practice page includes an **"Inversions"** toggle button. When enabled:
- Each generated chord is randomly assigned an inversion (0 = root position, 1 = 1st inversion, 2 = 2nd inversion, 3 = 3rd inversion for 7th chords).
- The Roman numeral display includes slash notation with the bass note's scale degree (e.g., `iii/5`, `V7/2`) or figured bass notation (e.g., `6`, `6/4`, `6/5`, `4/3`, `4/2`).
- The chord checking logic enforces that the **lowest played MIDI note** matches the expected bass pitch class for the assigned inversion.

When disabled, all chords are in root position (inversion = 0) and no slash notation is shown.

### 11.2 Inversion Assignment

Inversions are assigned with **equal probability** using cryptographically secure uniform random selection:

```javascript
function assignInversion(chord) {
  const numPositions = chord.intervals.length // 3 for triads, 4 for sevenths
  return secureRandomInt(numPositions)        // uniform 0 to numPositions-1
}
```

`secureRandomInt` uses rejection sampling to avoid modular bias, ensuring each inversion is equally likely.

### 11.3 Bass Note Calculation

The bass pitch class for a given inversion is the chord root plus the interval at the inversion index:

```javascript
function getBassPC(tonicPC, chord, inversion) {
  const rootPC = (tonicPC + chord.semitones) % 12
  return (rootPC + chord.intervals[inversion]) % 12
}
```

The bass scale degree (for display) is computed from the bass pitch class relative to the tonic using `DEGREE_MAP`:

```javascript
function getBassScaleDegree(tonicPC, chord, inversion) {
  const bassPC = getBassPC(tonicPC, chord, inversion)
  const chromaticDistance = (bassPC - tonicPC + 12) % 12
  return DEGREE_MAP[chromaticDistance]
}
```

### 11.4 Display Examples

| Chord | Inversion | Bass Note | Display |
|-------|-----------|-----------|---------|
| `I` (C-E-G) | 0 (root) | C (degree 1) | `I` |
| `I` (C-E-G) | 1 (1st) | E (degree 3) | `I/3` |
| `I` (C-E-G) | 2 (2nd) | G (degree 5) | `I/5` |
| `V7` (G-B-D-F) | 0 (root) | G (degree 5) | `V7` |
| `V7` (G-B-D-F) | 1 (1st) | B (degree 7) | `V7/7` |
| `V7` (G-B-D-F) | 2 (2nd) | D (degree 2) | `V7/2` |
| `V7` (G-B-D-F) | 3 (3rd) | F (degree 4) | `V7/4` |
| `ii7` (D-F-A-C) | 1 (1st) | F (degree 4) | `ii7/4` |
| `viim7b5` (B-D-F-A) | 2 (2nd) | F (degree 4) | `viim7b5/4` |

### 11.5 Secondary Chord Inversions

Secondary chords can also be inverted. The slash notation for inversions is appended after the functional notation:

| Chord | Inversion | Display |
|-------|-----------|---------|
| `V7/vi` | 0 (root) | `V7/vi` |
| `V7/vi` | 1 (1st) | `V7/vi/3` |
| `viio7/V` | 2 (2nd) | `viio7/V/2` |

The equivalent Roman also receives the inversion slash:

| Functional Display | Equivalent Display |
|---|---|
| `V7/vi/3` | `III7/3` |
| `viio7/V/2` | `#ivo7/2` |

### 11.6 Figured Bass Notation

As an alternative to slash notation, the Chord Practice page includes a **"Format"** dropdown (visible only when inversions are enabled, positioned below the Inversions button). It offers two options:
- **Slash Notation** (default): Bass scale degree after a slash (e.g., `iii/5`, `V7/2`).
- **Figured Bass**: Traditional figured bass symbols rendered as CSS superscripts.

Changing the format does **not** restart the game — it only affects the display of the current chord.

**Triads:**
| Inversion | Figured Bass | Example (I in C major) |
|-----------|-------------|------------------------|
| Root (0)  | *(none)*    | `I`                    |
| 1st (1)   | `6`         | `I` with `6`           |
| 2nd (2)   | `6/4`       | `I` with `6/4`         |

**Seventh chords:**
| Inversion | Figured Bass | Example (V7 in C major) |
|-----------|-------------|--------------------------|
| Root (0)  | `7`         | `V7` (with `7` as superscript) |
| 1st (1)   | `6/5`       | `V7` with `6/5`         |
| 2nd (2)   | `4/3`       | `V7` with `4/3`         |
| 3rd (3)   | `4/2`       | `V7` with `4/2`         |

The figured bass symbols are rendered as CSS superscripts alongside the chord extension. The `getFiguredBass(chord, inversion)` function returns the appropriate symbol based on whether the chord is a triad (3 intervals) or a seventh chord (4 intervals).
