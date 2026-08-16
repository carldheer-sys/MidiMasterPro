import * as Tone from 'tone'
import SampleLibrary from './Tonejs-Instruments'
import { getInternalBpm, beatsPerBarFromTimeSignature, normalizeTimeSignature } from './midiUtils'

const PIANO_CONFIG = { attack: 0.02, release: 1, volume: -6 }

class AudioEngine {
  constructor() {
    this.sampler = null
    this.metronome = null
    this.isInitialized = false
    this.cursorPosition = 0
    this.onCursorUpdate = null
    this.onPlayheadUpdate = null
    this.onPlaybackComplete = null
    this.scheduledEvents = []
    this.metronomeEventId = null
    this.stopEventId = null
    this.animationFrameId = null
    this.totalTicks = 0
    this._lastCursorUpdateTime = 0
  }

  async initialize(bufferSize = 256) {
    if (this.isInitialized) return
    try {
      Tone.context.lookAhead = bufferSize > 256 ? 0.1 : 0.05
      await this.loadInstrument('piano', PIANO_CONFIG)
      this.metronome = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 10,
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 },
        volume: -10
      }).toDestination()
      Tone.Transport.bpm.value = 120
      Tone.Transport.timeSignature = 4
      Tone.Transport.loop = false
      this.isInitialized = true
    } catch (error) {
      console.error('Failed to initialize audio engine:', error)
      throw error
    }
  }

  async startAudioContext() {
    if (!this.isInitialized) await this.initialize()
    try {
      if (Tone.context.state !== 'running') {
        await Tone.start()
      }
      return true
    } catch (error) {
      console.error('Failed to start audio context:', error)
      return false
    }
  }

  setTempo(bpm, timeSignature = null) {
    if (Tone.Transport) {
      const internalBpm = timeSignature ? getInternalBpm(bpm, timeSignature) : bpm
      Tone.Transport.bpm.value = internalBpm
    }
  }

  setTimeSignature(timeSignature) {
    if (Tone.Transport) {
      const normalized = normalizeTimeSignature(timeSignature)
      const beatsPerBar = beatsPerBarFromTimeSignature(normalized)
      Tone.Transport.timeSignature = beatsPerBar
    }
  }

  setBufferSize(size) {
    if (Tone.context) Tone.context.lookAhead = size > 256 ? 0.1 : 0.05
  }

  setLoopLength(bars) {
    if (Tone.Transport) {
      this.totalTicks = bars * Tone.Transport.timeSignature * Tone.Transport.PPQ
    }
  }

  setLoopEnabled(enabled, bars = 4) {
    if (!Tone.Transport) return
    Tone.Transport.loop = !!enabled
    Tone.Transport.loopStart = 0
    if (enabled) {
      Tone.Transport.loopEnd = `${bars}m`
    } else {
      Tone.Transport.loopEnd = 0
    }
  }

  setLoopEnabledBeats(enabled, startBeat, endBeat) {
    if (!Tone.Transport) return
    Tone.Transport.loop = !!enabled
    if (enabled) {
      const startTicks = Math.round(startBeat * Tone.Transport.PPQ)
      const endTicks = Math.round(endBeat * Tone.Transport.PPQ)
      Tone.Transport.loopStart = `${startTicks}i`
      Tone.Transport.loopEnd = `${endTicks}i`
    } else {
      Tone.Transport.loopStart = 0
      Tone.Transport.loopEnd = 0
    }
  }

  async loadInstrument(instrument, config = {}) {
    if (this.sampler) {
      this.applyInstrumentConfig(config)
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const sampler = SampleLibrary.load({
        instruments: instrument,
        baseUrl: 'https://nbrosowsky.github.io/tonejs-instruments/samples/',
        onload: () => {
          sampler.toDestination()
          this.sampler = sampler
          this.applyInstrumentConfig(config)
          resolve()
        }
      })
    })
  }

  applyInstrumentConfig(config = {}) {
    if (!this.sampler) return
    if (config.volume !== undefined) this.sampler.volume.value = config.volume
    if (config.attack !== undefined) this.sampler.attack = config.attack
    if (config.release !== undefined) this.sampler.release = config.release
  }

  async start(atBeat = 0) {
    if (!this.isInitialized) await this.initialize()
    await this.startAudioContext()
    Tone.Transport.position = 0
    if (atBeat > 0) {
      const startTicks = Math.round(atBeat * Tone.Transport.PPQ)
      Tone.Transport.ticks = startTicks
    }
    Tone.Transport.start()
    this.startPositionTracking()
  }

  stop() {
    this.stopPositionTracking()
    Tone.Transport.stop()
    Tone.Transport.position = 0
    this.cursorPosition = 0
    if (this.onCursorUpdate) this.onCursorUpdate(0)
  }

  pause() {
    this.stopPositionTracking()
    Tone.Transport.pause()
  }

  startPositionTracking = () => {
    this.stopPositionTracking()
    const updateLoop = () => {
      if (Tone.Transport.state === 'started' && this.totalTicks > 0) {
        let progress = Tone.Transport.ticks / this.totalTicks
        if (progress > 1) progress = 1
        this.cursorPosition = progress
        if (this.onPlayheadUpdate) this.onPlayheadUpdate(progress)
        const now = performance.now()
        if (this.onCursorUpdate && now - this._lastCursorUpdateTime >= 66) {
          this._lastCursorUpdateTime = now
          this.onCursorUpdate(progress)
        }
      }
      this.animationFrameId = requestAnimationFrame(updateLoop)
    }
    this.animationFrameId = requestAnimationFrame(updateLoop)
  }

  stopPositionTracking() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  async playCountdown(bars) {
    if (!this.isInitialized) return
    return new Promise(resolve => {
      let beats = Math.ceil(bars * Tone.Transport.timeSignature)
      let currentBeat = 0
      const loop = new Tone.Loop((time) => {
        if (currentBeat >= beats) {
          loop.stop()
          loop.dispose()
          Tone.Transport.stop()
          Tone.Transport.position = 0
          resolve()
          return
        }
        const isDownbeat = currentBeat % Tone.Transport.timeSignature === 0
        this.metronome.triggerAttackRelease(isDownbeat ? 'C5' : 'G4', '16n', time, isDownbeat ? 1 : 0.5)
        currentBeat++
      }, "4n")
      loop.start(0)
      Tone.Transport.start()
    })
  }

  async playNote(noteName, duration = '8n') {
    if (!this.isInitialized) return
    try {
      await this.startAudioContext()
      if (this.sampler) {
        this.sampler.triggerAttackRelease(noteName, duration, Tone.now() + 0.02, 0.8)
      }
    } catch (error) {
      console.warn('Failed to play note:', error)
    }
  }

  startNote(noteName, velocity = 0.8) {
    if (!this.isInitialized) return
    try {
      if (this.sampler) {
        this.sampler.triggerAttack(noteName, Tone.now() + 0.02, Math.min(Math.max(velocity, 0), 1))
      }
    } catch (error) {
      console.warn('Failed to start note:', error)
    }
  }

  stopNote(noteName) {
    if (!this.isInitialized) return
    try {
      if (this.sampler) {
        this.sampler.triggerRelease(noteName, Tone.now() + 0.02)
      }
    } catch (error) {
      console.warn('Failed to stop note:', error)
    }
  }

  scheduleNotes(notes, timeDivision, bars = 4) {
    const beatsPerBar = Tone.Transport.timeSignature
    const ppq = Tone.Transport.PPQ
    this.totalTicks = bars * beatsPerBar * ppq
    if (!notes || notes.length === 0) return
    if (!this.sampler) return

    notes.forEach(noteData => {
      const startTick = Math.round(noteData.start * ppq)
      const durationTicks = Math.round(noteData.duration * ppq)
      const velocity = noteData.velocity !== undefined ? noteData.velocity : 0.8
      const eventId = Tone.Transport.schedule((time) => {
        this.sampler.triggerAttackRelease(noteData.note, durationTicks + "i", time, velocity)
      }, startTick + "i")
      this.scheduledEvents.push(eventId)
    })
  }

  clearScheduledNotes() {
    if (this.stopEventId !== null) {
      Tone.Transport.clear(this.stopEventId)
      this.stopEventId = null
    }
    this.scheduledEvents.forEach(eventId => Tone.Transport.clear(eventId))
    this.scheduledEvents = []
  }

  scheduleStopEvent(bars = 4) {
    if (!Tone.Transport) return
    const stopTime = `${bars}m`
    if (this.stopEventId !== null) {
      Tone.Transport.clear(this.stopEventId)
    }
    this.stopEventId = Tone.Transport.schedule((time) => {
      this.stop()
      if (this.onPlaybackComplete) this.onPlaybackComplete()
    }, stopTime)
  }

  scheduleStopAtBeats(beats) {
    if (!Tone.Transport) return
    const stopTicks = Math.round(beats * Tone.Transport.PPQ)
    if (this.stopEventId !== null) {
      Tone.Transport.clear(this.stopEventId)
    }
    this.stopEventId = Tone.Transport.schedule((time) => {
      this.stop()
      if (this.onPlaybackComplete) this.onPlaybackComplete()
    }, `${stopTicks}i`)
  }

  async startMetronome() {
    await this.startAudioContext()
    this.stopMetronome()
    if (!this.metronome) return
    const beatsPerBar = Tone.Transport.timeSignature
    this.metronomeEventId = Tone.Transport.scheduleRepeat((time) => {
      const currentBeat = Math.floor(Tone.Transport.ticks / Tone.Transport.PPQ)
      const isDownbeat = currentBeat % beatsPerBar === 0
      this.metronome.triggerAttackRelease(isDownbeat ? 'C5' : 'G4', '16n', time, isDownbeat ? 1 : 0.5)
    }, '4n')
  }

  stopMetronome() {
    if (this.metronomeEventId !== null) {
      Tone.Transport.clear(this.metronomeEventId)
      this.metronomeEventId = null
    }
  }

  dispose() {
    this.clearScheduledNotes()
    this.stopMetronome()
    this.stopPositionTracking()
    if (this.sampler) this.sampler.dispose()
    this.sampler = null
    if (this.metronome) this.metronome.dispose()
    Tone.Transport.stop()
    this.isInitialized = false
  }
}

export const audioEngine = new AudioEngine()
export default audioEngine
