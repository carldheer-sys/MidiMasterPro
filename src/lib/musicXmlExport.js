import { noteToMidi } from './musicUtils'
import { SEMITONE_TO_SHARP, SEMITONE_TO_FLAT, FLAT_KEYS } from '../constants'

const DIVISIONS_PER_QUARTER = 16

const SHARP_TO_FLAT = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
const FLAT_TO_SHARP = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' }

const KEY_TO_FIFTHS = {
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
  'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7
}

const MAJOR_DEGREE_MAP = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' }
const MINOR_DEGREE_MAP = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' }

const EPSILON = 1e-6

const NOTE_VALUE_TABLE = [
  { type: 'whole', beats: 4, dots: 0 },
  { type: 'half', beats: 3, dots: 1 },
  { type: 'half', beats: 2, dots: 0 },
  { type: 'quarter', beats: 1.5, dots: 1 },
  { type: 'quarter', beats: 1, dots: 0 },
  { type: 'eighth', beats: 0.75, dots: 1 },
  { type: 'eighth', beats: 0.5, dots: 0 },
  { type: '16th', beats: 0.375, dots: 1 },
  { type: '16th', beats: 0.25, dots: 0 },
  { type: '32nd', beats: 0.125, dots: 0 },
]

function getPitchClass(noteName) {
  const midi = noteToMidi(noteName)
  if (midi === null || midi === undefined) return 0
  return midi % 12
}

function parseNoteToXmlPitch(noteName, useFlats) {
  const match = String(noteName).match(/^([A-G])(#|b)?(-?\d+)$/)
  if (!match) return null
  let [, step, accidental, octaveStr] = match
  const octave = parseInt(octaveStr, 10)
  let alter = 0
  if (accidental === '#') alter = 1
  else if (accidental === 'b') alter = -1
  if (useFlats && accidental === '#') {
    const flatName = SHARP_TO_FLAT[`${step}#`]
    if (flatName) { step = flatName[0]; alter = -1 }
  } else if (!useFlats && accidental === 'b') {
    const sharpName = FLAT_TO_SHARP[`${step}b`]
    if (sharpName) { step = sharpName[0]; alter = 1 }
  }
  return { step, alter, octave }
}

function quantize(value, grid = 0.25) {
  return Math.round(value / grid) * grid
}

function beatsToDuration(beats) {
  return Math.round(beats * DIVISIONS_PER_QUARTER)
}

function r6(v) { return Math.round(v * 1000000) / 1000000 }

function splitDurationIntoSegments(totalBeats) {
  if (totalBeats < EPSILON) return []
  const segments = []
  let remaining = r6(totalBeats)
  while (remaining > EPSILON) {
    let found = false
    for (const nv of NOTE_VALUE_TABLE) {
      if (remaining >= nv.beats - EPSILON) {
        segments.push({ type: nv.type, dots: nv.dots, beats: nv.beats })
        remaining = r6(remaining - nv.beats)
        found = true
        break
      }
    }
    if (!found) {
      const smallest = NOTE_VALUE_TABLE[NOTE_VALUE_TABLE.length - 1]
      segments.push({ type: smallest.type, dots: 0, beats: smallest.beats })
      remaining = r6(remaining - smallest.beats)
    }
  }
  return segments
}

function xmlEscape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function buildMeasureAttributes(divisions, keyFifths, timeBeats, beatType, clefSign, clefLine) {
  return `      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>${keyFifths}</fifths></key>
        <time><beats>${timeBeats}</beats><beat-type>${beatType}</beat-type></time>
        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>
      </attributes>`
}

function buildTempoDirectionXml(tempo) {
  if (!tempo || tempo <= 0) return ''
  return `      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${tempo}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${tempo}"/>
      </direction>`
}

function buildNoteXml(pitch, durationBeats, type, voice, isChord, dots, tieType, lyric) {
  const { step, alter, octave } = pitch
  const duration = beatsToDuration(durationBeats)
  const alterXml = alter !== 0 ? `<alter>${alter}</alter>` : ''
  const chordTag = isChord ? '<chord/>' : ''
  const dotXml = dots > 0 ? '<dot/>'.repeat(dots) : ''
  let tieXml = ''
  let notationXml = ''
  if (tieType === 'start') {
    tieXml = '<tie type="start"/>'
    notationXml = '<notations><tied type="start"/></notations>'
  } else if (tieType === 'stop') {
    tieXml = '<tie type="stop"/>'
    notationXml = '<notations><tied type="stop"/></notations>'
  } else if (tieType === 'continue') {
    tieXml = '<tie type="stop"/><tie type="start"/>'
    notationXml = '<notations><tied type="stop"/><tied type="start"/></notations>'
  }
  const lyricXml = lyric ? `<lyric number="1"><syllabic>single</syllabic><text>${xmlEscape(lyric)}</text></lyric>` : ''
  return `      <note>
        ${chordTag}
        <pitch>
          <step>${step}</step>
          ${alterXml}
          <octave>${octave}</octave>
        </pitch>
        <duration>${duration}</duration>
        ${tieXml}
        <voice>${voice}</voice>
        <type>${type}</type>
        ${dotXml}
        ${notationXml}
        ${lyricXml}
      </note>`
}

function buildRestXml(durationBeats, type, voice, dots) {
  const duration = beatsToDuration(durationBeats)
  const dotXml = dots > 0 ? '<dot/>'.repeat(dots) : ''
  return `      <note>
        <rest/>
        <duration>${duration}</duration>
        <voice>${voice}</voice>
        <type>${type}</type>
        ${dotXml}
      </note>`
}

function buildHarmonyXml(chordLabel) {
  if (!chordLabel) return ''
  const kindMap = {
    '': 'major', 'm': 'minor', 'maj7': 'major-seventh', 'm7': 'minor-seventh',
    '7': 'dominant', 'dim': 'diminished', 'dim7': 'diminished-seventh',
    'm7b5': 'half-diminished', 'aug': 'augmented', 'sus4': 'suspended-fourth',
    'sus2': 'suspended-second', '6': 'major-sixth', 'm6': 'minor-sixth',
  }
  const slashIdx = chordLabel.indexOf('/')
  const chordPart = slashIdx >= 0 ? chordLabel.substring(0, slashIdx) : chordLabel
  const bassPart = slashIdx >= 0 ? chordLabel.substring(slashIdx + 1) : null
  const match = chordPart.match(/^([A-G][#b]?)(.*)$/)
  if (!match) return ''
  let [, root, suffix] = match
  let rootStep = root[0]
  let rootAlter = 0
  if (root[1] === '#') rootAlter = 1
  else if (root[1] === 'b') rootAlter = -1
  const kind = kindMap[suffix] || 'major'
  const kindXml = suffix === '' ? '<kind text="">major</kind>' : `<kind text="${xmlEscape(suffix)}">${kind}</kind>`
  let bassXml = ''
  if (bassPart) {
    const bassMatch = bassPart.match(/^([A-G][#b]?)$/)
    if (bassMatch) {
      const bassNote = bassMatch[1]
      const bassStep = bassNote[0]
      let bassAlter = 0
      if (bassNote[1] === '#') bassAlter = 1
      else if (bassNote[1] === 'b') bassAlter = -1
      bassXml = `<bass><bass-step>${bassStep}</bass-step>${bassAlter !== 0 ? `<bass-alter>${bassAlter}</bass-alter>` : ''}</bass>`
    }
  }
  return `      <harmony>
        <root>
          <root-step>${rootStep}</root-step>
          ${rootAlter !== 0 ? `<root-alter>${rootAlter}</root-alter>` : ''}
        </root>
        ${kindXml}${bassXml}
      </harmony>`
}

function buildTextExpressionXml(text, yOffset) {
  if (!text) return ''
  return `      <direction placement="${yOffset < 0 ? 'below' : 'above'}">
        <direction-type>
          <words default-y="${yOffset}" font-size="10">${xmlEscape(text)}</words>
        </direction-type>
      </direction>`
}

function getAnnotationAtBeat(annotations, beat) {
  return annotations.find(a => Math.abs(a.start - beat) < 0.01) || null
}

function buildStaffForPart(notes, options) {
  const {
    clefSign, clefLine, voice, keyFifths, beatsPerMeasure, beatType, timeBeats,
    useFlats, annotations, annotationTypes, totalBeats, tempo
  } = options

  const totalMeasures = Math.max(1, Math.ceil(totalBeats / beatsPerMeasure - EPSILON))
  const quantizedNotes = notes
    .map(n => ({ ...n, start: quantize(n.start), duration: Math.max(0.25, quantize(n.duration)) }))
    .filter(n => n.start >= 0 && n.duration > 0)
    .sort((a, b) => a.start - b.start)

  const noteGroups = {}
  for (const n of quantizedNotes) {
    const key = String(n.start)
    if (!noteGroups[key]) noteGroups[key] = []
    noteGroups[key].push(n)
  }
  const sortedGroups = Object.entries(noteGroups)
    .map(([startStr, ns]) => ({ start: parseFloat(startStr), notes: ns }))
    .sort((a, b) => a.start - b.start)

  const dedupedAnnotations = []
  const seenStarts = new Set()
  if (annotations) {
    for (const ann of annotations) {
      const qStart = quantize(ann.start)
      const key = String(qStart)
      if (!seenStarts.has(key)) {
        seenStarts.add(key)
        dedupedAnnotations.push({ ...ann, start: qStart })
      }
    }
  }

  let pendingContinuations = []
  let xml = ''
  let measureNum = 1

  for (let m = 0; m < totalMeasures; m++) {
    const measureStart = m * beatsPerMeasure
    const measureEnd = Math.min((m + 1) * beatsPerMeasure, totalBeats)
    const actualMeasureBeats = measureEnd - measureStart
    let measureContent = ''

    if (m === 0) {
      measureContent += buildMeasureAttributes(DIVISIONS_PER_QUARTER, keyFifths, timeBeats, beatType, clefSign, clefLine) + '\n'
      const tempoXml = buildTempoDirectionXml(tempo)
      if (tempoXml) measureContent += tempoXml + '\n'
    }

    let posInMeasure = 0
    const groupsInMeasure = sortedGroups.filter(g => g.start >= measureStart - EPSILON && g.start < measureEnd - EPSILON)
    const contsInMeasure = pendingContinuations.filter(c => c.start >= measureStart - EPSILON && c.start < measureEnd - EPSILON)

    while (posInMeasure < actualMeasureBeats - EPSILON) {
      const absBeat = measureStart + posInMeasure
      const groupStartingHere = groupsInMeasure.find(g => Math.abs(g.start - absBeat) < 0.01)
      const contStartingHere = contsInMeasure.find(c => Math.abs(c.start - absBeat) < 0.01)

      if (groupStartingHere && annotations) {
        const ann = getAnnotationAtBeat(dedupedAnnotations, absBeat)
        if (ann) {
          if (annotationTypes.includes('chord_names') && ann.chord_label) {
            measureContent += buildHarmonyXml(ann.chord_label) + '\n'
          }
          if (annotationTypes.includes('roman_numerals') && ann.roman_numeral) {
            measureContent += buildTextExpressionXml(ann.roman_numeral, -40) + '\n'
          }
        }
      }

      if (groupStartingHere) {
        const notesAtBeat = groupStartingHere.notes
        const isChord = notesAtBeat.length > 1
        const sortedNotes = [...notesAtBeat].sort((a, b) => noteToMidi(a.note) - noteToMidi(b.note))
        const firstNote = sortedNotes[0]
        const noteEnd = firstNote.start + firstNote.duration
        const crossesBoundary = noteEnd > measureEnd + EPSILON

        let scaleDegreeLyric = null
        if (annotationTypes.includes('scale_degrees') && annotations) {
          const ann = getAnnotationAtBeat(dedupedAnnotations, absBeat)
          if (ann && ann.scale_degree) scaleDegreeLyric = ann.scale_degree
        }

        if (crossesBoundary) {
          const durationInCurrent = measureEnd - absBeat
          const segments = splitDurationIntoSegments(durationInCurrent)
          for (let segIdx = 0; segIdx < segments.length; segIdx++) {
            const seg = segments[segIdx]
            let segTieType = 'start'
            if (segments.length > 1 && segIdx > 0) segTieType = 'continue'
            for (let i = 0; i < sortedNotes.length; i++) {
              const pitch = parseNoteToXmlPitch(sortedNotes[i].note, useFlats)
              if (pitch) {
                const lyric = (segIdx === 0 && i === 0) ? scaleDegreeLyric : null
                measureContent += buildNoteXml(pitch, seg.beats, seg.type, voice, isChord && i > 0, seg.dots, segTieType, lyric) + '\n'
              }
            }
          }
          posInMeasure = actualMeasureBeats
          let remainingStart = measureEnd
          let remainingDuration = noteEnd - measureEnd
          while (remainingDuration > EPSILON) {
            const nextMeasureIdx = Math.floor(remainingStart / beatsPerMeasure)
            const nextMeasureEnd = Math.min((nextMeasureIdx + 1) * beatsPerMeasure, totalBeats)
            const contDuration = Math.min(remainingDuration, nextMeasureEnd - remainingStart)
            const isFinal = r6(remainingDuration - contDuration) < EPSILON
            pendingContinuations.push({ start: remainingStart, duration: contDuration, notes: notesAtBeat, isFinalSegment: isFinal })
            remainingStart = r6(remainingStart + contDuration)
            remainingDuration = r6(remainingDuration - contDuration)
          }
        } else {
          const durationInMeasure = noteEnd - absBeat
          const segments = splitDurationIntoSegments(durationInMeasure)
          for (let segIdx = 0; segIdx < segments.length; segIdx++) {
            const seg = segments[segIdx]
            let segTieType = null
            if (segments.length > 1) {
              if (segIdx === 0) segTieType = 'start'
              else if (segIdx === segments.length - 1) segTieType = 'stop'
              else segTieType = 'continue'
            }
            for (let i = 0; i < sortedNotes.length; i++) {
              const pitch = parseNoteToXmlPitch(sortedNotes[i].note, useFlats)
              if (pitch) {
                const lyric = (segIdx === 0 && i === 0) ? scaleDegreeLyric : null
                measureContent += buildNoteXml(pitch, seg.beats, seg.type, voice, isChord && i > 0, seg.dots, segTieType, lyric) + '\n'
              }
            }
          }
          posInMeasure = noteEnd - measureStart
        }
      } else if (contStartingHere) {
        const cont = contStartingHere
        const sortedNotes = [...cont.notes].sort((a, b) => noteToMidi(a.note) - noteToMidi(b.note))
        const isChord = sortedNotes.length > 1
        const segments = splitDurationIntoSegments(cont.duration)
        for (let segIdx = 0; segIdx < segments.length; segIdx++) {
          const seg = segments[segIdx]
          let segTieType = 'continue'
          if (cont.isFinalSegment && segIdx === segments.length - 1) segTieType = 'stop'
          else if (cont.isFinalSegment && segments.length === 1) segTieType = 'stop'
          for (let i = 0; i < sortedNotes.length; i++) {
            const pitch = parseNoteToXmlPitch(sortedNotes[i].note, useFlats)
            if (pitch) {
              measureContent += buildNoteXml(pitch, seg.beats, seg.type, voice, isChord && i > 0, seg.dots, segTieType) + '\n'
            }
          }
        }
        posInMeasure = (cont.start + cont.duration) - measureStart
      } else {
        const nextGroupStart = sortedGroups.find(g => g.start > absBeat + EPSILON)?.start
        const nextContStart = pendingContinuations.find(c => c.start > absBeat + EPSILON)?.start
        const candidates = [nextGroupStart, nextContStart].filter(v => v !== undefined)
        const nextStart = candidates.length > 0 ? Math.min(...candidates) : measureEnd
        const restEnd = Math.min(nextStart, measureEnd)
        const restDuration = restEnd - absBeat
        if (restDuration > EPSILON) {
          const segments = splitDurationIntoSegments(restDuration)
          for (const seg of segments) {
            measureContent += buildRestXml(seg.beats, seg.type, voice, seg.dots) + '\n'
          }
        }
        posInMeasure = restEnd - measureStart
      }
    }

    xml += `    <measure number="${measureNum}">\n`
    xml += measureContent
    xml += `    </measure>\n`
    measureNum++
  }

  return xml
}

export function exportToMusicXml(options) {
  const {
    trebleNotes = [],
    bassNotes = [],
    trebleAnnotations = [],
    bassAnnotations = [],
    annotationType = 'none',
    key,
    mode,
    tempo,
    timeSignature,
    bars,
    title = 'My Composition',
    composer = 'MidiMasterPro'
  } = options

  const majorFifths = KEY_TO_FIFTHS[key] || 0
  const keyFifths = mode && mode.toLowerCase() === 'minor' ? majorFifths - 3 : majorFifths
  const useFlats = keyFifths < 0 || FLAT_KEYS.has(key)
  const timeBeats = timeSignature.numerator
  const beatsPerMeasure = timeSignature.numerator * (4 / timeSignature.denominator)
  const actualBeatType = timeSignature.denominator

  const allNotes = [...trebleNotes, ...bassNotes]
  const maxNoteEnd = allNotes.length > 0 ? Math.max(...allNotes.map(n => n.start + n.duration)) : beatsPerMeasure
  const totalBeats = Math.max(bars * beatsPerMeasure, Math.ceil(maxNoteEnd / beatsPerMeasure - EPSILON) * beatsPerMeasure)

  const annTypes = []
  if (annotationType === 'scale_degrees') annTypes.push('scale_degrees')
  if (annotationType === 'chord_names') annTypes.push('chord_names')
  if (annotationType === 'roman_numerals') annTypes.push('roman_numerals')

  const trebleAnnData = trebleAnnotations.map(a => ({
    start: a.start,
    scale_degree: a.degree_info?.scale_degree || null,
    chord_label: a.chord_info?.chord_label || null,
    roman_numeral: a.chord_info?.roman_numeral || null,
  })).filter(a => a.scale_degree || a.chord_label || a.roman_numeral)

  const bassAnnData = bassAnnotations.map(a => ({
    start: a.start,
    scale_degree: a.degree_info?.scale_degree || null,
    chord_label: a.chord_info?.chord_label || null,
    roman_numeral: a.chord_info?.roman_numeral || null,
  })).filter(a => a.scale_degree || a.chord_label || a.roman_numeral)

  const parts = []
  const partList = []

  partList.push({ id: 'P1', name: 'Treble' })
  parts.push({
    id: 'P1',
    xml: buildStaffForPart(trebleNotes, {
      clefSign: 'G', clefLine: 2, voice: 1, keyFifths, beatsPerMeasure,
      beatType: actualBeatType, useFlats, annotations: trebleAnnData,
      annotationTypes: annTypes, totalBeats, tempo, timeBeats
    })
  })

  partList.push({ id: 'P2', name: 'Bass' })
  parts.push({
    id: 'P2',
    xml: buildStaffForPart(bassNotes, {
      clefSign: 'F', clefLine: 4, voice: 1, keyFifths, beatsPerMeasure,
      beatType: actualBeatType, useFlats, annotations: bassAnnData,
      annotationTypes: annTypes, totalBeats, tempo, timeBeats
    })
  })

  const partListXml = partList.map(p =>
    `    <score-part id="${p.id}">\n      <part-name>${xmlEscape(p.name)}</part-name>\n    </score-part>`
  ).join('\n')

  const partsXml = parts.map(p => `  <part id="${p.id}">\n${p.xml}  </part>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${xmlEscape(title)}</work-title></work>
  <identification>
    <creator type="composer">${xmlEscape(composer)}</creator>
  </identification>
  <part-list>
${partListXml}
  </part-list>
${partsXml}
</score-partwise>`
}
