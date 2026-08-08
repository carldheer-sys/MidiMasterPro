import { Play, Square, Circle, Repeat, Download, Upload } from 'lucide-react'
import { Button } from './ui/button'
import { Select } from './ui/select'
import { Label } from './ui/label'
import { MetronomeIcon } from './ui/MetronomeIcon'
import { ANNOTATION_TYPES } from '../constants'

export default function TransportBar({
  isPlaying,
  isRecording,
  isLooping,
  metronomeEnabled,
  annotationType,
  snapToGrid,
  onPlay,
  onStop,
  onRecord,
  onToggleLoop,
  onToggleMetronome,
  onAnnotationChange,
  onSnapToGridChange,
  onExportMidi,
  onExportWav,
  xmlExportSlot,
  onImportMidi,
  isExporting,
}) {
  return (
    <div className="relative z-50 flex flex-wrap items-center gap-3 p-3 border-b border-border bg-card/80 backdrop-blur-sm">
      {/* Transport controls */}
      <div className="flex items-center gap-1.5">
        <Button
          variant={isPlaying ? 'default' : 'secondary'}
          size="icon"
          onClick={onPlay}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={onStop}
          title="Stop"
        >
          <Square className="h-4 w-4" />
        </Button>
        <Button
          variant={isRecording ? 'destructive' : 'secondary'}
          size="icon"
          onClick={onRecord}
          title="Record"
        >
          <Circle className={`h-4 w-4 ${isRecording ? 'fill-current' : ''}`} />
        </Button>
        <Button
          variant={isLooping ? 'default' : 'secondary'}
          size="icon"
          onClick={onToggleLoop}
          title="Loop"
        >
          <Repeat className="h-4 w-4" />
        </Button>
        <Button
          variant={metronomeEnabled ? 'default' : 'secondary'}
          size="icon"
          onClick={onToggleMetronome}
          title="Metronome"
        >
          <MetronomeIcon size={20} />
        </Button>
      </div>

      <div className="h-8 w-px bg-border" />

      {/* Import / Export */}
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onImportMidi} disabled={isExporting}>
          <Upload className="h-3.5 w-3.5 mr-1" /> MIDI
        </Button>
        <Button variant="outline" size="sm" onClick={onExportMidi} disabled={isExporting}>
          <Download className="h-3.5 w-3.5 mr-1" /> MIDI
        </Button>
        <Button variant="outline" size="sm" onClick={onExportWav} disabled={isExporting}>
          <Download className="h-3.5 w-3.5 mr-1" /> WAV
        </Button>
        {xmlExportSlot}
      </div>

      <div className="h-8 w-px bg-border" />

      {/* Annotation type */}
      <div className="flex items-center gap-2">
        <Label>Analysis</Label>
        <Select value={annotationType} onChange={(e) => onAnnotationChange(e.target.value)} className="w-36 h-8">
          {ANNOTATION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </Select>
      </div>

      {/* Snap to grid */}
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={snapToGrid}
          onChange={(e) => onSnapToGridChange(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <Label>Snap</Label>
      </label>
    </div>
  )
}
