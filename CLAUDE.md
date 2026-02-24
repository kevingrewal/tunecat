# TuneCat - Chrome Extension for Real-Time Key & BPM Detection

## What This Is

A Chrome extension (Manifest V3) that captures audio from any browser tab in real-time and detects the musical **Key** and **BPM**. Built for a music artist workflow: find beats on YouTube, click the extension, instantly see Key + BPM without downloading anything.

## Architecture

```
[Tab Audio (YouTube)]
        |
[Service Worker] ── chrome.tabCapture.getMediaStreamId()
        |
[Offscreen Document] ── getUserMedia({chromeMediaSource:'tab'})
        |
    AudioContext
     /    |    \
    v     v     v
(playback) (Key)    (BPM)
         Meyda    realtime-bpm-analyzer
        |
[Popup UI] ── Key (e.g. C# minor / E major) + BPM (e.g. 140)
```

**Why offscreen document:** MV3 service workers can't access Web Audio API or DOM. The offscreen document has full DOM access and runs the audio analysis pipeline. It communicates with the popup via `chrome.runtime.sendMessage`.

## Tech Stack

- **TypeScript** with **Webpack 5** (3 entry points: service-worker, offscreen, popup)
- **Meyda** v5 — chroma feature extraction for key detection
- **realtime-bpm-analyzer** v5 — AudioWorklet-based BPM detection
- **Chrome APIs:** `tabCapture`, `offscreen`, `downloads`, `runtime.sendMessage`
- **Download API:** Cobalt community instances — free YouTube-to-audio conversion (with fallback)

## File Structure

```
src/
├── manifest.json              # MV3, permissions: tabCapture + offscreen + downloads
├── service-worker.ts          # Orchestrator: offscreen doc, stream ID, Cobalt downloads
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.ts           # Audio capture + wires up both analyzers
├── popup/
│   ├── popup.html
│   ├── popup.ts               # Start/Stop, Download button, format toggle, displays results
│   └── popup.css              # Dark studio theme (#0d0d1a bg, #ff4d6a accents)
├── analysis/
│   ├── key-detector.ts        # Meyda chroma → Krumhansl-Schmuckler algorithm
│   └── bpm-detector.ts        # realtime-bpm-analyzer wrapper (manual worklet registration)
├── messaging/
│   └── messages.ts            # Shared message type definitions
└── icons/
    ├── cat-source.png         # Source cat silhouette image
    ├── generate_icons.py      # Script to regenerate icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Key Design Decisions

### AudioWorklet CSP Workaround
The `realtime-bpm-analyzer` library normally creates a Blob URL for its AudioWorklet processor. Chrome extensions block Blob URLs via CSP. **Fix:** We extract the processor as a static file (`realtime-bpm-processor.js`), declare it in `web_accessible_resources` in the manifest, and load it via `chrome.runtime.getURL()` instead of using the library's `createRealtimeBpmAnalyzer()`. See `bpm-detector.ts`.

### Webpack eval() CSP Fix
Webpack's default development devtool uses `eval()`, which Chrome extensions block. **Fix:** `devtool: 'cheap-source-map'` in webpack.config.js.

### realtime-bpm-analyzer Module Resolution
The package has a broken `main` field (points to `dist/index.js` but files are at `dist/dist/index.js`). **Fix:** Webpack alias in webpack.config.js maps the import to the correct ESM path.

### Key Detection Algorithm
Uses Krumhansl-Schmuckler with Meyda chroma extraction:
- Accumulates chroma energy over many frames
- Every 2 seconds, runs Pearson correlation against 12 major + 12 minor key profiles
- Decay factor 0.85 (heavier accumulation since beats are typically consistent)
- Returns both detected key AND relative major/minor (e.g., "A minor / C major")

### Persistence
Analysis keeps running in the offscreen document after popup closes. Popup re-syncs via `GET_STATE` message on reopen.

## Message Flow

```
POPUP → START_CAPTURE {tabId} → SERVICE WORKER
SERVICE WORKER → START_ANALYSIS {streamId} → OFFSCREEN
OFFSCREEN → ANALYSIS_RESULT {key, scale, relativeKey, bpm, confidence} → POPUP
POPUP → STOP_CAPTURE → SERVICE WORKER → STOP_ANALYSIS → OFFSCREEN

POPUP → START_DOWNLOAD {tabUrl, format} → SERVICE WORKER (calls Cobalt API)
SERVICE WORKER → DOWNLOAD_STATUS {status, error?} → POPUP
SERVICE WORKER → chrome.downloads.download(url) → file saved to disk
```

### Download Feature (Cobalt API)
The service worker calls `POST /` on Cobalt community instances with the tab URL and desired audio format (mp3/wav). Cobalt returns a tunnel/redirect URL which is passed to `chrome.downloads.download()`. The popup shows format toggle pills (MP3 default, WAV) and a Download button.

**Important:** The official `api.cobalt.tools` instance requires Turnstile bot protection + API key authentication — it rejects unauthenticated requests with HTTP 400. We use **community instances** instead, with automatic fallback logic that tries each instance in order until one succeeds:

```
cobaltapi.squair.xyz → api.qwkuns.me → api.dl.woof.monster → api.cobalt.liubquanti.click → api.kektube.com → cobaltapi.cjs.nz
```

Each instance is declared in `host_permissions` in `manifest.json`. Community instances are volatile — they can go offline or add auth at any time. If all instances stop working, the most reliable fix is to **self-host a Cobalt instance** (free via Docker or Railway) and add its URL to the `COBALT_INSTANCES` array in `service-worker.ts`.

Request format: `POST /` with `{url, downloadMode: "audio", audioFormat: "mp3"|"wav"}`. Response: `{status: "tunnel", url: "...", filename: "..."}`. Tunnel URLs expire in ~2 minutes.

## Build & Test

```bash
npm run dev          # webpack --watch (development)
npm run build        # webpack production build
```

Load `dist/` as unpacked extension at `chrome://extensions` (developer mode on).

## User Preferences

- Manual start (click "Start Listening" button)
- Show both key + relative major/minor
- Dark studio theme matching DAW aesthetics
- Analysis persists when popup closes
- Primary use: YouTube beat browsing
- Icon: black cat silhouette on red (#ff4d6a) rounded-rect background

## Known Issues / Areas to Watch

- **BPM detection** needs real-world testing — AudioWorklet in offscreen documents is the riskiest integration point
- **Key accuracy** may need tuning — alternative profiles (Temperley, Albrecht-Shanahan) can be swapped into key-detector.ts if Krumhansl-Kessler is inaccurate
- **Tab audio routing:** `source.connect(audioContext.destination)` in offscreen.ts keeps audio playing; without it the tab goes silent
- The `generate_icons.py` script requires Pillow (`pip3 install Pillow`)
- **Cobalt community instances** are volatile — may go offline or add auth. If all fail, self-host Cobalt and add URL to `COBALT_INSTANCES` array in `service-worker.ts`
- **Download hasn't been fully tested yet** — the Cobalt 400 error was fixed by switching to community instances, but real-world download test still needed

## FL Studio Integration Research (Not Yet Implemented)

The user's ultimate workflow: detect key from YouTube → auto-set Pitcher plugin key in FL Studio. Research findings:

- **FL Studio has no HTTP/WebSocket/OSC/IPC API.** The only external communication channel is **MIDI**.
- **FL Studio's MIDI Controller Scripting API** (Python) has a `plugins` module that can read/write any plugin parameter via `plugins.setParamValue(value, paramIndex, mixerTrackIndex, slotIndex)`. This can control Pitcher's key setting.
- **Architecture required for auto-key-set:**
  ```
  TuneCat Extension → Native Messaging Host (local Python/Node script)
       → Virtual MIDI port (IAC Driver on macOS)
       → FL Studio MIDI Controller Script
       → plugins.setParamValue() → Pitcher key parameter
  ```
- **Flapi** (github.com/MaddyGuthridge/Flapi) is an unmaintained but architecturally sound bridge that encodes FL Studio Python API calls as SysEx MIDI messages. Could be forked/revived.
- **Key components needed:** Chrome native messaging host, virtual MIDI port (IAC Driver built into macOS), custom FL Studio MIDI Controller Script
- This is a multi-component pipeline — not trivial but technically feasible

## Future Enhancements (Not Yet Implemented)

- **FL Studio Pitcher integration** — auto-set key via MIDI bridge (see research above)
- Copy key/BPM to clipboard button
- Persist detection history in `chrome.storage.local`
- Camelot wheel notation
- Badge text on extension icon showing current BPM
- Visual chroma histogram
