import * as MidiNS from '@tonejs/midi'

const Midi = MidiNS.Midi || MidiNS.default?.Midi || MidiNS.default

export const DEFAULT_TIME_SIGNATURE = { numerator: 4, denominator: 4 }

export function normalizeTimeSignature(timeSignature) {
  const rawNumerator = Number(timeSignature?.numerator)
  const numerator = Math.max(1, Math.round(Number.isFinite(rawNumerator) ? rawNumerator : DEFAULT_TIME_SIGNATURE.numerator))
  const denominator = Number(timeSignature?.denominator) === 8 ? 8 : 4
  return { numerator, denominator }
}

export function timeSignatureToString(timeSignature) {
  const normalized = normalizeTimeSignature(timeSignature)
  return `${normalized.numerator}/${normalized.denominator}`
}

export function parseTimeSignature(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d+)\/(4|8)$/)
    if (match) {
      return normalizeTimeSignature({ numerator: parseInt(match[1], 10), denominator: parseInt(match[2], 10) })
    }
  }
  if (Array.isArray(value)) {
    return normalizeTimeSignature({ numerator: value[0], denominator: value[1] })
  }
  return normalizeTimeSignature(value)
}

export function beatsPerBarFromTimeSignature(timeSignature) {
  const normalized = normalizeTimeSignature(timeSignature)
  return normalized.numerator * (4 / normalized.denominator)
}

export function isCompoundTimeSignature(timeSignature) {
  const normalized = normalizeTimeSignature(timeSignature)
  return [6, 9, 12].includes(normalized.numerator)
}

export function getInternalBpm(projectBpm, timeSignature) {
  const normalized = normalizeTimeSignature(timeSignature)
  const { denominator } = normalized
  if (isCompoundTimeSignature(timeSignature)) {
    return projectBpm * 1.5 * (8 / denominator)
  }
  return projectBpm * (4 / denominator)
}

export function getProjectBpm(internalBpm, timeSignature) {
  const normalized = normalizeTimeSignature(timeSignature)
  const { denominator } = normalized
  if (isCompoundTimeSignature(timeSignature)) {
    return Math.round(internalBpm / (1.5 * (8 / denominator)))
  }
  return Math.round(internalBpm / (4 / denominator))
}

export function getMainBeatsPerBar(timeSignature) {
  const normalized = normalizeTimeSignature(timeSignature)
  if (isCompoundTimeSignature(timeSignature)) {
    return normalized.numerator / 3
  }
  return normalized.numerator
}

export function beatsPerDivisionFromTimeDivision(timeDivision, timeSignature = DEFAULT_TIME_SIGNATURE) {
  const match = String(timeDivision || '1/4').match(/^1\/(1|2|4|8|16|32)$/)
  const divisionDenominator = match ? Number(match[1]) : 4
  const normalizedTS = normalizeTimeSignature(timeSignature)
  const { numerator, denominator } = normalizedTS
  if (divisionDenominator === 1) {
    return numerator * (4 / denominator)
  }
  return 4 / divisionDenominator
}

export const calculateTimeDivision = (minDurationBeats) => {
  if (minDurationBeats <= 0.125) return '1/32'
  if (minDurationBeats <= 0.25) return '1/16'
  if (minDurationBeats <= 0.5) return '1/8'
  if (minDurationBeats <= 1) return '1/4'
  if (minDurationBeats <= 2) return '1/2'
  return '1/1'
}

export const exportToMidi = (tracks, tempo, timeDivision, timeSignature = DEFAULT_TIME_SIGNATURE) => {
  const midi = new Midi()
  const normalizedTimeSignature = normalizeTimeSignature(timeSignature)
  const internalTempo = getInternalBpm(tempo, normalizedTimeSignature)

  if (midi.header) {
    midi.header.setTempo(internalTempo)
    midi.header.timeSignatures.push({
      timeSignature: [normalizedTimeSignature.numerator, normalizedTimeSignature.denominator],
      ticks: 0
    })
  }

  const ticksPerBeat = midi.header?.ppq || 480

  tracks.forEach((track, index) => {
    const midiTrack = midi.addTrack()
    midiTrack.name = `TimeDivision:${timeDivision};TimeSignature:${timeSignatureToString(normalizedTimeSignature)};Timing:TicksV2;Track:${index}`
    midiTrack.instrument.number = 0

    const notes = track.notes || []
    notes.forEach(noteData => {
      const ticks = Math.round(noteData.start * ticksPerBeat)
      const durationTicks = Math.max(1, Math.round(noteData.duration * ticksPerBeat))
      midiTrack.addNote({
        name: noteData.note,
        ticks,
        durationTicks,
        velocity: noteData.velocity ?? 0.8
      })
    })
  })

  const midiData = midi.toArray()
  return new Blob([midiData], { type: 'audio/midi' })
}

export const importFromMidi = async (arrayBuffer, currentTempo) => {
  try {
    const midi = new Midi(arrayBuffer)

    let timeDivision = '1/4'
    let timeSignature = parseTimeSignature(midi.header?.timeSignatures?.[0]?.timeSignature || DEFAULT_TIME_SIGNATURE)
    let hasMMPMetadata = false
    let usesTickTiming = false

    const midiTempoFromHeader = midi.header?.tempos?.length > 0 ? midi.header.tempos[0].bpm : null
    const midiTempo = midiTempoFromHeader ?? getInternalBpm(currentTempo, timeSignature)
    const projectTempo = getProjectBpm(midiTempo, timeSignature)

    const tracksWithNotes = midi.tracks.filter(t => t.notes.length > 0)

    if (tracksWithNotes.length > 0 && tracksWithNotes[0].name) {
      const parts = tracksWithNotes[0].name.split(';')
      parts.forEach(part => {
        if (part.startsWith('TimeDivision:')) {
          hasMMPMetadata = true
          timeDivision = part.replace('TimeDivision:', '')
        } else if (part.startsWith('TimeSignature:')) {
          hasMMPMetadata = true
          timeSignature = parseTimeSignature(part.replace('TimeSignature:', ''))
        } else if (part.startsWith('Timing:')) {
          usesTickTiming = part.replace('Timing:', '') === 'TicksV2'
        }
      })
    }

    const legacyTimingScale = hasMMPMetadata && !usesTickTiming && projectTempo > 0 ? getInternalBpm(projectTempo, timeSignature) / projectTempo : 1
    const ticksPerBeat = midi.header?.ppq || 480
    const beatsPerBar = beatsPerBarFromTimeSignature(timeSignature)

    let maxBeat = 0
    let minDurationBeat = Infinity

    const importedTracks = []

    const tracksToProcess = tracksWithNotes.length > 0 ? tracksWithNotes : [midi.tracks[0]]

    tracksToProcess.forEach((midiTrack, trackIndex) => {
      if (!midiTrack || midiTrack.notes.length === 0) return

      const trackNotes = midiTrack.notes.map(note => {
        const rawStartBeat = Number.isFinite(note.ticks) ? note.ticks / ticksPerBeat : note.time * (midiTempo / 60)
        const rawDurationBeat = Number.isFinite(note.durationTicks) ? note.durationTicks / ticksPerBeat : note.duration * (midiTempo / 60)
        const startBeat = rawStartBeat / legacyTimingScale
        const durationBeat = rawDurationBeat / legacyTimingScale

        const endBeat = startBeat + durationBeat
        if (endBeat > maxBeat) maxBeat = endBeat
        if (durationBeat > 0 && durationBeat < minDurationBeat) minDurationBeat = durationBeat

        return {
          id: Math.random().toString(36).substr(2, 9),
          note: note.name,
          start: startBeat,
          duration: durationBeat,
          velocity: note.velocity
        }
      })

      importedTracks.push({ notes: trackNotes, index: trackIndex })
    })

    const requiredBars = Math.ceil(maxBeat / beatsPerBar)
    const bars = Math.max(1, requiredBars)
    const calculatedTimeDivision = minDurationBeat !== Infinity ? calculateTimeDivision(minDurationBeat) : '1/4'

    return {
      tracks: importedTracks,
      bars,
      timeDivision: hasMMPMetadata ? timeDivision : calculatedTimeDivision,
      timeSignature,
      tempo: projectTempo
    }
  } catch (error) {
    console.error("Error parsing MIDI file:", error)
    throw error
  }
}
