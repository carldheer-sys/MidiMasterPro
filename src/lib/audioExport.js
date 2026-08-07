import * as Tone from 'tone'
import SampleLibrary from './Tonejs-Instruments'
import { beatsPerBarFromTimeSignature, getInternalBpm, normalizeTimeSignature } from './midiUtils'

const SAMPLE_BASE_URL = 'https://nbrosowsky.github.io/tonejs-instruments/samples/'

function loadInstrumentSampler(instrumentName, config = {}) {
  return new Promise((resolve) => {
    const sampler = SampleLibrary.load({
      instruments: instrumentName,
      baseUrl: SAMPLE_BASE_URL,
      onload: () => {
        sampler.toDestination()
        if (config.volume !== undefined) sampler.volume.value = config.volume
        if (config.attack !== undefined) sampler.attack = config.attack
        if (config.release !== undefined) sampler.release = config.release
        resolve(sampler)
      }
    })
  })
}

function encodeToWav(toneBuffer) {
  const audioBuffer = toneBuffer.get()
  const sampleRate = audioBuffer.sampleRate
  const numChannels = audioBuffer.numberOfChannels
  const length = audioBuffer.length

  const channels = []
  for (let i = 0; i < numChannels; i++) {
    channels.push(audioBuffer.getChannelData(i))
  }

  const interleaved = new Int16Array(length * numChannels)
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]))
      interleaved[i * numChannels + ch] = Math.round(sample * 32767)
    }
  }

  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = interleaved.length * bytesPerSample
  const wavSize = 44 + dataSize

  const buffer = new ArrayBuffer(wavSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, wavSize - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const offset = 44
  for (let i = 0; i < interleaved.length; i++) {
    view.setInt16(offset + i * 2, interleaved[i], true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

export async function renderTracksToWav(tracks, tempo, bars, timeSignature, onProgress) {
  if (tracks.length === 0) {
    throw new Error('No active tracks with notes to export.')
  }

  const normalizedTS = normalizeTimeSignature(timeSignature)
  const beatsPerBar = beatsPerBarFromTimeSignature(normalizedTS)
  const internalTempo = getInternalBpm(tempo, normalizedTS)
  const secondsPerBeat = 60 / internalTempo
  const totalBeats = bars * beatsPerBar
  const durationSeconds = totalBeats * secondsPerBeat + 3

  if (onProgress) onProgress('Rendering audio…')

  const toneBuffer = await Tone.Offline(async ({ transport }) => {
    transport.bpm.value = internalTempo
    transport.timeSignature = beatsPerBar
    const ppq = transport.PPQ

    for (const track of tracks) {
      const trackNotes = track.notes || []
      if (trackNotes.length === 0) continue

      const config = { attack: 0.02, release: 1, volume: -6 }
      const sampler = await loadInstrumentSampler('piano', config)

      trackNotes.forEach(noteData => {
        const startTick = Math.round(noteData.start * ppq)
        const durationTicks = Math.round(noteData.duration * ppq)
        const velocity = noteData.velocity !== undefined ? noteData.velocity : 0.8

        transport.schedule((time) => {
          sampler.triggerAttackRelease(noteData.note, durationTicks + 'i', time, velocity)
        }, startTick + 'i')
      })
    }

    transport.start(0)
  }, durationSeconds)

  if (onProgress) onProgress('Encoding WAV…')

  return encodeToWav(toneBuffer)
}
