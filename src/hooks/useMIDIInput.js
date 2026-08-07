import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook for receiving MIDI input from external keyboards via Web MIDI API.
 *
 * @param {Function} onNoteOn - Called with (midiNote, velocity) when a note is pressed
 * @param {Function} onNoteOff - Called with (midiNote) when a note is released
 * @returns {boolean} Whether MIDI access is available
 */
export function useMIDIInput(onNoteOn, onNoteOff) {
  const onNoteOnRef = useRef(onNoteOn)
  const onNoteOffRef = useRef(onNoteOff)
  const midiAccessRef = useRef(null)

  useEffect(() => {
    onNoteOnRef.current = onNoteOn
    onNoteOffRef.current = onNoteOff
  }, [onNoteOn, onNoteOff])

  const handleMessage = useCallback((message) => {
    const command = message.data[0]
    const midiNote = message.data[1]
    const velocity = message.data.length > 2 ? message.data[2] : 0

    const isNoteOn = (command & 0xF0) === 0x90 && velocity > 0
    const isNoteOff = (command & 0xF0) === 0x80 || ((command & 0xF0) === 0x90 && velocity === 0)

    if (isNoteOn && onNoteOnRef.current) {
      onNoteOnRef.current(midiNote, velocity)
    } else if (isNoteOff && onNoteOffRef.current) {
      onNoteOffRef.current(midiNote)
    }
  }, [])

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return

    let cancelled = false

    const onMIDISuccess = (access) => {
      if (cancelled) return
      midiAccessRef.current = access

      const attachToInputs = () => {
        for (const input of access.inputs.values()) {
          input.onmidimessage = handleMessage
        }
      }
      attachToInputs()

      access.onstatechange = (e) => {
        if (e.port.type === 'input' && e.port.state === 'connected') {
          e.port.onmidimessage = handleMessage
        }
      }
    }

    const onMIDIFailure = () => {
      console.warn('Could not access MIDI devices.')
    }

    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure)

    return () => {
      cancelled = true
      if (midiAccessRef.current) {
        for (const input of midiAccessRef.current.inputs.values()) {
          input.onmidimessage = null
        }
      }
    }
  }, [handleMessage])
}
