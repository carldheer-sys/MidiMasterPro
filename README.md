# MidiMasterPro

A lightweight, standalone MIDI composition workspace for recording, editing, and exporting short musical sequences. Features a dual piano-roll editor (treble & bass clefs), real-time MIDI input, live annotations, and multi-format export — all running locally with no backend required.

![Tech Stack](https://img.shields.io/badge/React-18-blue) ![Vite](https://img.shields.io/badge/Vite-5-purple) ![Tauri](https://img.shields.io/badge/Tauri-v2-orange) ![Tone.js](https://img.shields.io/badge/Tone.js-14-green)

---

## Features

### Piano Roll Editor
- **Dual-track editing** — Treble (C3–C6) and Bass (C1–C4) piano rolls with synchronized scrolling and playhead
- **DOM-based rendering** for smooth scrolling, zooming, and touch interaction
- **Collapsible tracks** — hide/show each track independently
- **Zoom & pan** — Ctrl/Cmd+scroll to zoom, Shift+scroll to pan horizontally, scroll to move vertically

### Note Editing
- **Click to add** notes on the grid
- **Drag to move** — single or multiple selected notes at once
- **Shift+click** for multi-select, **Shift+drag** for marquee box selection
- **Copy / Cut / Paste** (Ctrl/Cmd+C, X, V) — works across tracks with relative pitch translation
- **Undo/Redo** with full history (Ctrl/Cmd+Z, Shift+Z)
- **Grid snapping** with configurable time divisions (1/4, 1/8, 1/16, etc.) — disabled by default

### MIDI Input & Recording
- **Real-time MIDI input** via Web MIDI API — connect any USB MIDI keyboard
- **Record** with optional metronome and countdown
- **Overdub** — new notes merge with existing ones

### Annotations (Pure JavaScript)
All annotations compute in real-time and update instantly when the key or mode changes:
- **Note names** — key-signature aware (e.g., B♭ in F major, A# in A minor)
- **Scale degrees** — diatonic numbering with chromatic alteration indicators
- **Chord names** — triad and seventh chord detection
- **Roman numerals** — key-relative harmonic analysis

### Export & Import
- **MIDI (.mid)** — standard MIDI file export via `@tonejs/midi`
- **WAV audio** — offline rendered audio via Tone.js
- **MusicXML (.xml)** — sheet music export with separate treble and bass clefs
- **MIDI import** — auto-distributes notes to treble/bass tracks by pitch range

### Transport Controls
- Play, stop, record, loop
- Metronome with countdown
- Tempo (40–240 BPM), key, mode, time signature, bar count — all adjustable from the header

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Space` | Play / Stop / Toggle recording |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + C` | Copy selected notes |
| `Ctrl/Cmd + X` | Cut selected notes |
| `Ctrl/Cmd + V` | Paste — click to place, `Escape` to cancel |
| `Delete / Backspace` | Delete selected notes |

---

## Mouse / Trackpad Controls

| Action | Effect |
|---|---|
| Click on empty grid | Add a note |
| Click on a note | Select note |
| Shift + Click | Add to / toggle selection |
| Drag selected note(s) | Move pitch + time |
| Shift + Drag on empty grid | Marquee selection |
| Scroll | Scroll vertically |
| Shift + Scroll | Pan horizontally |
| Ctrl/Cmd + Scroll | Zoom in/out |

---

## Quick Start

### Web (Development)

```bash
npm install
npm run dev
```

Open http://localhost:5173

### Desktop App (Tauri)

```bash
npm install
npm run tauri:dev    # development — launches native window
npm run tauri:build  # production — builds standalone app
```

**Prerequisites:** [Node.js](https://nodejs.org/) 18+, [Rust](https://rustup.rs/), and platform build tools:
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** Visual Studio Build Tools with C++ workload

See [INSTRUCTIONS.md](INSTRUCTIONS.md) for detailed build, installation, and deployment guide.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5 |
| Styling | Tailwind CSS 3 |
| Audio | Tone.js 14 (synthesis, scheduling, offline rendering) |
| MIDI I/O | @tonejs/midi, Web MIDI API |
| Annotations | Pure JavaScript (no backend) |
| Desktop | Tauri v2 (Rust) |

---

## Project Structure

```
src/
├── App.jsx                  # Main app: state, tracks, audio, shortcuts
├── constants.js             # Musical constants (keys, modes, track config)
├── components/
│   ├── PianoRoll.jsx        # DOM-based piano roll editor
│   ├── TransportBar.jsx     # Play/record/metronome/import/export controls
│   └── ui/                  # Button, Input, Select, Label, MetronomeIcon
├── lib/
│   ├── annotations.js       # Note names, scale degrees, chords, Roman numerals
│   ├── audioEngine.js       # Tone.js audio scheduling & playback
│   ├── exportUtils.js       # MIDI / WAV / MusicXML export
│   └── musicUtils.js        # Note ↔ MIDI conversion utilities
src-tauri/
├── tauri.conf.json          # Tauri configuration
└── src/main.rs              # Native entry point
```

---

## License

Private project.
