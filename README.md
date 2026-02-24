<p align="center">
  <img width="128" height="128" alt="icon128" src="https://github.com/user-attachments/assets/429d1788-2514-42d5-b45c-e0eaf0479c4e" />
</p>

<h1 align="center">TuneCat</h1>

<p align="center">A Chrome extension that detects the <strong>musical key</strong> and <strong>BPM</strong> of any audio playing in your browser — in real time.</p>

Built for producers, musicians, and beatmakers who browse YouTube for instrumentals and need to know the key and tempo instantly, without downloading anything or leaving the browser.

![Chrome](https://img.shields.io/badge/Chrome-Extension-brightgreen?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Real-time key detection** — Identifies the musical key and displays both the detected key and its relative major/minor (e.g. *C# minor / E major*)
- **Real-time BPM detection** — Locks onto the tempo with a confidence indicator
- **Audio download** — Download the current tab's audio as MP3 or WAV with one click
- **Persistent analysis** — Keeps running after the popup closes; results are waiting when you reopen it
- **Zero setup** — No accounts, no API keys, no configuration. Install and go.

## How It Works

TuneCat captures audio directly from your browser tab using the Chrome `tabCapture` API. The audio stream is routed through an offscreen document where two analysis engines run simultaneously:

| Component | Library | Method |
|---|---|---|
| **Key Detection** | [Meyda](https://meyda.js.org/) | Chroma feature extraction with the Krumhansl-Schmuckler key-finding algorithm. Accumulates chroma energy over time and runs Pearson correlation against 24 major/minor key profiles every 2 seconds. |
| **BPM Detection** | [realtime-bpm-analyzer](https://github.com/AMusic/realtime-bpm-analyzer) | AudioWorklet-based onset detection with real-time tempo estimation. |

Audio continues playing normally in the tab — analysis runs passively without interrupting playback.

```
Tab Audio → chrome.tabCapture → Offscreen Document (Web Audio API)
                                    ├── Meyda (chroma) → Key + Relative Key
                                    └── AudioWorklet → BPM
                                            ↓
                                      Popup UI (results)
```

## Installation

### From source

```bash
# Clone the repository
git clone https://github.com/kevingrewal/tunecat.git
cd tunecat

# Install dependencies
npm install

# Build the extension
npm run build
```

### Load into Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

## Usage

1. Navigate to any page with audio (YouTube, SoundCloud, Spotify Web, etc.)
2. Click the TuneCat extension icon
3. Press **Start Listening**
4. The key and BPM appear in real time as the audio plays
5. Use the **MP3 / WAV** toggle and **Download** button to save the audio locally
6. Press **Stop Listening** when done

## Tech Stack

- **TypeScript** — Type-safe codebase across all extension contexts
- **Webpack 5** — Bundles three independent entry points (service worker, offscreen document, popup)
- **Chrome Extension Manifest V3** — Modern extension architecture using `tabCapture`, `offscreen`, and `downloads` APIs
- **Meyda** — Audio feature extraction (chroma vectors)
- **realtime-bpm-analyzer** — AudioWorklet-based BPM detection
- **Cobalt** — Audio download via community API instances with automatic fallback

## Architecture

```
src/
├── manifest.json                # Extension manifest (permissions, entry points)
├── service-worker.ts            # Background orchestrator (tab capture, downloads)
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.ts             # Audio capture + analysis pipeline
├── popup/
│   ├── popup.html
│   ├── popup.ts                 # UI logic (start/stop, download, display results)
│   └── popup.css                # Dark studio theme
├── analysis/
│   ├── key-detector.ts          # Krumhansl-Schmuckler key-finding algorithm
│   └── bpm-detector.ts          # realtime-bpm-analyzer wrapper
├── messaging/
│   └── messages.ts              # Typed message definitions shared across contexts
└── icons/
    └── *.png                    # Extension icons (16, 48, 128)
```

**Why an offscreen document?** Manifest V3 service workers have no access to the Web Audio API or DOM. The offscreen document provides a full browser context where `AudioContext`, `AnalyserNode`, and `AudioWorkletNode` can run, while communicating results back via Chrome's message passing.

## Development

```bash
# Watch mode (rebuilds on file changes)
npm run dev

# Production build
npm run build
```

After building, reload the extension at `chrome://extensions` to pick up changes.

## Contributing

Contributions are welcome. Some areas that could use work:

- **Key detection accuracy** — Alternative key profiles (Temperley, Albrecht-Shanahan) could improve results for certain genres
- **BPM confidence tuning** — The lock-on threshold may need adjustment for different tempos
- **Self-hosted download backend** — The download feature relies on community Cobalt instances which can be unreliable; a self-hosted option or alternative backend would improve reliability

## License

MIT
