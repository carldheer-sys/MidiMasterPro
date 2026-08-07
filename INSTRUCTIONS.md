# MidiMasterPro — Instructions

## Overview

MidiMasterPro is a lightweight MIDI workspace for recording, editing, and exporting short MIDI sequences. It features two polyphonic piano roll tracks (Treble and Bass clefs), real-time MIDI input, annotations, and export to MIDI, WAV, and MusicXML formats.

Built with React + Vite + Tailwind CSS, packaged as a standalone desktop app using Tauri v2.

---

## Prerequisites

### macOS
- **Node.js** 18+ — [Download](https://nodejs.org/)
- **Rust** — Install via [rustup.rs](https://rustup.rs/)
- **Xcode Command Line Tools** — Run `xcode-select --install` in Terminal

### Windows
- **Node.js** 18+ — [Download](https://nodejs.org/)
- **Rust** — Install via [rustup.rs](https://rustup.rs/)
- **Microsoft Visual Studio Build Tools** — Install with the "Desktop development with C++" workload
  - Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
- **WebView2** — Pre-installed on Windows 11; on Windows 10 download from Microsoft

---

## Development (Quick Start)

```bash
# Install dependencies
npm install

# Run the web dev server (browser only, no standalone app)
npm run dev
# Open http://localhost:5173

# Run as a native desktop app (Tauri dev mode)
npm run tauri:dev
```

---

## Building a Standalone Application

### macOS

```bash
npm run tauri:build
```

This produces:
- **App bundle:** `src-tauri/target/release/bundle/macos/MidiMasterPro.app`
- **DMG installer:** `src-tauri/target/release/bundle/dmg/MidiMasterPro_1.0.0_<arch>.dmg`

**To run without a terminal:**
1. Navigate to `src-tauri/target/release/bundle/macos/`
2. Double-click `MidiMasterPro.app`
3. Or copy it to your `/Applications` folder for permanent access

**To distribute via DMG:**
1. Open the `.dmg` file
2. Drag MidiMasterPro into the Applications folder shortcut
3. Launch from Launchpad or Applications

> **Note:** On first launch, macOS may show a security warning. Right-click the app → "Open" → "Open" to bypass Gatekeeper.

### Windows

```bash
npm run tauri:build
```

This produces:
- **MSI installer:** `src-tauri/target/release/bundle/msi/MidiMasterPro_1.0.0_x64-setup.exe`
- **NSIS installer:** `src-tauri/target/release/bundle/nsis/MidiMasterPro_1.0.0_x64-setup.exe`

**To install on a Windows tablet:**
1. Copy the `.exe` installer to the Windows device
2. Double-click to run the installer
3. Launch MidiMasterPro from the Start menu or desktop shortcut

> **Note:** SmartScreen may warn about an unrecognized app. Click "More info" → "Run anyway".

---

## Installing on Another Device

### Option A: Build natively on the target device (recommended)

Tauri does not support cross-compiling between macOS and Windows. For best results, build on the target OS:

1. Install prerequisites (Node.js, Rust, and platform-specific build tools — see above)
2. Copy the project folder to the target device (or `git clone`)
3. Run:
   ```bash
   npm install
   npm run tauri:build
   ```
4. Use the generated installer (see sections above)

### Option B: Transfer the pre-built installer

If both devices run the **same OS** (e.g., two Macs):

1. Build on your development machine: `npm run tauri:build`
2. Copy the `.dmg` (macOS) or `.exe` (Windows) installer to the other device
3. Run the installer on the other device

### Option C: Quick network testing (no install required)

Run the web version and access it from any device on the same network:

```bash
npm run preview
```

Then open `http://<your-computer-ip>:4173` in a browser on the other device.

- Find your IP: `ifconfig | grep inet` (macOS) or `ipconfig` (Windows)
- The terminal must stay running on the host machine
- This is useful for quick testing but is not a standalone app

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| **Space** | Play / Stop / Toggle recording |
| **Ctrl/Cmd + Z** | Undo |
| **Ctrl/Cmd + Shift + Z** or **Ctrl/Cmd + Y** | Redo |
| **Ctrl/Cmd + C** | Copy selected notes |
| **Ctrl/Cmd + X** | Cut selected notes (copies and deletes originals) |
| **Ctrl/Cmd + V** | Paste — enters paste mode, click to place notes |
| **Escape** | Cancel paste mode |
| **Delete / Backspace** | Delete selected notes |

### Copy / Cut / Paste Details

- **Copy (Ctrl/Cmd+C):** Copies selected notes from the active track into the clipboard.
- **Cut (Ctrl/Cmd+X):** Same as copy, but removes the original notes from the source track.
- **Paste (Ctrl/Cmd+V):** Activates paste mode on the active track. Move the mouse over the piano roll to see a live amber-colored preview of where notes will land. Click to place them. Press Escape to cancel.
- **Cross-track paste:** You can copy/cut from the Treble track and paste into the Bass track (or vice versa). Notes are translated using a relative row-rank system, preserving pitch relationships.

---

## Mouse / Trackpad Controls

| Action | Effect |
|---|---|
| **Click on empty grid** | Add a note |
| **Click on a note** | Select note (deselects others) |
| **Shift + Click on a note** | Add to selection (multi-select) |
| **Drag a selected note** | Move all selected notes |
| **Shift + Click + Drag on empty grid** | Marquee (box) selection |
| **Scroll wheel** | Scroll vertically (up/down) |
| **Shift + Scroll wheel** | Pan horizontally (left/right) |
| **Ctrl/Cmd + Scroll wheel** | Zoom in/out |

---

## Features

- **Two piano roll tracks:** Treble (C3–C6) and Bass (C1–C4), each collapsible
- **Synchronized scrolling and playhead** across both tracks
- **Real-time MIDI input** via Web MIDI API (connect a MIDI keyboard)
- **Metronome** with countdown
- **Annotations** (pure JavaScript, no backend):
  - Note names
  - Scale degrees
  - Chord names
  - Roman numerals
  - Annotations update in real-time when the key or mode changes
- **Export formats:**
  - MIDI (`.mid`) — via `@tonejs/midi`
  - WAV audio (`.wav`) — via Tone.js offline rendering
  - MusicXML (`.xml`) — includes treble and bass clefs
- **MIDI import** — Import `.mid` files, notes auto-distributed to tracks by pitch range
- **Undo/Redo** with full history
- **Grid snapping** with configurable time division
- **Zoom** control

---

## Project Structure

```
MidiMasterPro/
├── src/
│   ├── App.jsx              # Main app: state, tracks, audio engine, shortcuts
│   ├── constants.js         # Musical constants (keys, modes, track config)
│   ├── components/
│   │   ├── PianoRoll.jsx    # DOM-based piano roll editor
│   │   ├── TransportBar.jsx # Play/record/metronome/import/export controls
│   │   └── ui/
│   │       ├── Button.jsx
│   │       ├── Input.jsx
│   │       ├── Label.jsx
│   │       ├── Select.jsx
│   │       └── MetronomeIcon.jsx
│   └── lib/
│       ├── annotations.js   # Pure JS annotation engine
│       ├── audioEngine.js   # Tone.js audio scheduling
│       ├── exportUtils.js   # MIDI/WAV/MusicXML export
│       └── musicUtils.js    # Note/midi conversion utilities
├── src-tauri/
│   ├── tauri.conf.json      # Tauri configuration
│   ├── Cargo.toml           # Rust dependencies
│   └── src/main.rs          # Tauri entry point
├── package.json
└── vite.config.js
```

---

## Troubleshooting

### "MIDI input not working"
- Ensure your MIDI device is connected before launching the app
- Check browser/system permissions for MIDI access
- On macOS, the app may need to be granted accessibility permissions

### "No sound during playback"
- Check system volume
- The app uses Tone.js with a built-in sampler — no external soundfont needed
- Try clicking Play again; the audio context may need a user gesture to start

### "Build fails on Windows"
- Ensure Visual Studio Build Tools with C++ workload is installed
- Run `rustc --version` to confirm Rust is in PATH
- Delete `src-tauri/target/` and rebuild if cache is corrupted

### "Build fails on macOS"
- Run `xcode-select --install` to install command line tools
- Ensure Rust is up to date: `rustup update`

### "App is blurry on Windows tablet"
- The app supports high-DPI displays; check Windows display scaling settings
- Tauri apps respect the system DPI settings automatically
