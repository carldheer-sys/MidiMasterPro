import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Download, ChevronDown, Music, AlertCircle } from 'lucide-react'

function TogglePill({ checked, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
        checked
          ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
          : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80'
      }`}
    >
      {children}
    </button>
  )
}

function ClefSection({ title, subtitle, enabled, onToggle, children }) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${enabled ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-border bg-secondary/30'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-indigo-500' : 'bg-secondary border border-border'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${enabled ? 'left-4' : 'left-0.5'}`} />
        </button>
      </div>
      {enabled && (
        <div className="flex items-center gap-2 pl-1">
          {children}
        </div>
      )}
    </div>
  )
}

export default function ExportXmlDialog({ onExport, disabled }) {
  const [open, setOpen] = useState(false)
  const [trebleEnabled, setTrebleEnabled] = useState(true)
  const [bassEnabled, setBassEnabled] = useState(true)
  const [trebleScaleDegrees, setTrebleScaleDegrees] = useState(true)
  const [trebleChordNames, setTrebleChordNames] = useState(false)
  const [trebleRomanNumerals, setTrebleRomanNumerals] = useState(false)
  const [bassScaleDegrees, setBassScaleDegrees] = useState(false)
  const [bassChordNames, setBassChordNames] = useState(true)
  const [bassRomanNumerals, setBassRomanNumerals] = useState(true)
  const [error, setError] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
        setError('')
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const handleGenerate = () => {
    setError('')

    if (!trebleEnabled && !bassEnabled) {
      setError('At least one clef must be enabled.')
      return
    }

    onExport({
      includeTreble: trebleEnabled,
      includeBass: bassEnabled,
      enableTrebleScaleDegrees: trebleScaleDegrees,
      enableTrebleChordNames: trebleChordNames,
      enableTrebleRomanNumerals: trebleRomanNumerals,
      enableBassScaleDegrees: bassScaleDegrees,
      enableBassChordNames: bassChordNames,
      enableBassRomanNumerals: bassRomanNumerals,
    })
    setOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(!open); setError('') }}
        disabled={disabled}
        title="Export to MusicXML"
      >
        <Download className="h-3.5 w-3.5 mr-1" /> XML
        <ChevronDown className="h-3 w-3 ml-0.5" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[380px] bg-card border border-border rounded-lg shadow-2xl z-[100] overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/50">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Music className="h-4 w-4 text-indigo-400" />
              Export to MusicXML
            </h3>
          </div>

          <div className="p-4 space-y-3">
            <ClefSection title="Treble Clef" subtitle="(G clef)" enabled={trebleEnabled} onToggle={() => setTrebleEnabled(!trebleEnabled)}>
              <TogglePill checked={trebleScaleDegrees} onClick={() => setTrebleScaleDegrees(!trebleScaleDegrees)}>Scale degrees</TogglePill>
              <TogglePill checked={trebleChordNames} onClick={() => setTrebleChordNames(!trebleChordNames)}>Chord names</TogglePill>
              <TogglePill checked={trebleRomanNumerals} onClick={() => setTrebleRomanNumerals(!trebleRomanNumerals)}>Roman numerals</TogglePill>
            </ClefSection>

            <ClefSection title="Bass Clef" subtitle="(F clef)" enabled={bassEnabled} onToggle={() => setBassEnabled(!bassEnabled)}>
              <TogglePill checked={bassScaleDegrees} onClick={() => setBassScaleDegrees(!bassScaleDegrees)}>Scale degrees</TogglePill>
              <TogglePill checked={bassChordNames} onClick={() => setBassChordNames(!bassChordNames)}>Chord names</TogglePill>
              <TogglePill checked={bassRomanNumerals} onClick={() => setBassRomanNumerals(!bassRomanNumerals)}>Roman numerals</TogglePill>
            </ClefSection>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-md px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="pt-2 border-t border-border">
              <Button
                onClick={handleGenerate}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                size="sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Export XML
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
