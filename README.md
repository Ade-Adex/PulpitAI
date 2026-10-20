# PulpitAI 🎙️

[![Release](https://img.shields.io/github/v/release/Ade-Adex/PulpitAI?style=for-the-badge&label=Download)](https://github.com/Ade-Adex/PulpitAI/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-.exe-blue?style=for-the-badge&logo=windows)](https://github.com/Ade-Adex/PulpitAI/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-.dmg-black?style=for-the-badge&logo=apple)](https://github.com/Ade-Adex/PulpitAI/releases/latest)

> **⬇️ Download the app:** go to the [**Latest Release**](https://github.com/Ade-Adex/PulpitAI/releases/latest)
> and grab the installer for your OS:
> - **Windows** → `PulpitAI-0.1.0-setup-x64.exe` (run it, no admin needed)
> - **macOS** → `PulpitAI-0.1.0-arm64.dmg` (drag to Applications)
> - **Linux** → `PulpitAI-0.1.0-x64.AppImage` or `.deb`

Real-time **Yoruba → English** sermon translator for livestreams. A pastor preaches in
Yoruba; English captions appear instantly in OBS, vMix, or any livestream software —
no human interpreter needed.

Built with exactly your stack: **HTML, CSS, React, Node/Express, Electron**.

## How it works

```
🎤 Mic / 🖥 System audio (loopback — no extra drivers on Windows)
        │  renderer (React): Web Audio + Voice Activity Detection
        ▼
   Utterance clips (speech → silence → cut)
        │  IPC
        ▼
   Electron main process
        ├─ Whisper API (language: "yo")  →  Yoruba text
        └─ gpt-4o-mini                   →  English text
                │
        ┌───────┴────────┐
        ▼                ▼
  App transcript    Overlay server (Express + WebSocket)
                    http://127.0.0.1:8787/overlay
                          │
              ┌───────────┴────────────┐
              ▼                        ▼
     OBS "Browser Source"     Frameless overlay window
     (transparent captions)   (for vMix desktop capture)
```

## Quick start

```bash
npm install
npm run dev        # starts Vite + Electron together
```

1. Open **⚙ Settings** and pick a provider:
   - **Google Gemini:** paste a key from
     [aistudio.google.com](https://aistudio.google.com) (**Get API key**). One call does
     Yoruba transcription *and* English translation. Quota/plan/billing limits belong to
     the key's project.
   - **GroQ — free tier:** paste a key from
     [console.groq.com](https://console.groq.com) (**API Keys**). Whisper transcribes
     Yoruba, Llama translates to English.
   - **OpenAI** (paid): paste an `sk-...` key — Whisper + gpt-4o-mini.
   - **Demo:** no key at all — simulated captions to test mic/VAD/overlay.
2. Pick your audio source (mic / system audio / both).
3. Press **Start Listening** and preach — captions appear in the app and the overlay.

### Building installers (one command on each OS)

The release workflow builds Windows `.exe` (NSIS installer + portable ZIP),
macOS `.dmg`/`.zip`, and Linux `.AppImage`/`.deb` and publishes them as a
GitHub Release automatically.

```bash
# local (Windows builds win32 only)
npm run build

# cross-platform release build via GitHub Actions
git tag v1.0.0
git push origin v1.0.0
```

A new GitHub Release is created with a downloadable installer for your OS.

### Download the app (for users — no code needed)

1. Open **https://github.com/Ade-Adex/PulpitAI/releases/latest**
2. Under **Assets**, download your installer and run it:
   - Windows: `PulpitAI-<version>-setup-x64.exe`
   - macOS: `PulpitAI-<version>-arm64.dmg`
   - Linux: `PulpitAI-<version>-x64.AppImage` or `.deb`

> The Release only appears after a version tag is pushed (see below).
> Until the first tag is pushed, the link above shows "no releases".

## Using with OBS Studio

1. Start PulpitAI and press **Start Listening**.
2. In OBS: **Sources → + → Browser**.
3. URL: `http://127.0.0.1:8787/overlay`, Width `1920`, Height `1080`.
4. Uncheck *"Shutdown source when not visible"* (keeps the caption server warm).
5. Captions are composited on a **transparent background** — nothing else to configure.

## Using with vMix

vMix has no first-class browser source, so use one of these:

- **Overlay window**: click *Open window* in the app — a transparent, click-through,
  always-on-top window shows the captions. Capture it in vMix via **Desktop Capture**
  (Windows 10 1903+ capture method preserves transparency).
- **Chroma key**: append `?bg=green` to the overlay URL (`http://127.0.0.1:8787/overlay?bg=green`),
  open it in any browser or the overlay window, then chroma-key the green in vMix.

The same overlay also works with Streamlabs, Prism Live Studio, and anything else
that can consume a browser page.

## Project structure

```
electron/
  main.js                     app bootstrap, wires services together
  preload.cjs                 the ONLY bridge: window.pulpit.*
  ipc/handlers.js             ipcMain.handle() registrations
  windows/
    mainWindow.js             the control app window
    overlayWindow.js          frameless transparent caption window
  services/
    settingsStore.js          JSON settings in OS app-data folder
    mediaPermissions.js       mic permission + system-audio loopback
    pipeline.js               chunk → transcribe → translate → segment
    overlayServer.js          Express + WebSocket caption server
    stt/openaiWhisper.js      Whisper client (language: "yo")
    stt/mockStt.js            demo mode: scripted captions, no key needed
    translation/openaiTranslator.js   Yoruba → English prompt
    overlay/public/           the OBS overlay page (plain HTML/CSS/JS)
src/renderer/                 React app
  App.jsx                     composes components, owns shared state
  components/                 one component per file
  hooks/
    useAudioCapture.js        mic/system capture + VAD
    useTranscriber.js         clips → pipeline → segments
    useSettings.js            settings load/save
  lib/
    api.js                    wrapper over window.pulpit
    audio.js                  base64, devices, RMS level
    vad.js                    utterance detector (pure logic)
```

## Settings worth knowing

| Setting | Default | Notes |
| --- | --- | --- |
| Silence sensitivity | 0.018 | Lower = picks up quieter speech |
| End phrase after | 700 ms | Silence that cuts a caption line |
| Visible lines | 3 | Caption lines shown in overlay |
| Clear after | 12 s | Overlay fades when preaching pauses |
| Overlay port | 8787 | Change if it clashes with another app |

## Costs & latency

- Whisper: **$0.006/min** of audio. gpt-4o-mini translation: fractions of a cent per line.
- End-to-end latency is typically **1–3 seconds** (utterance cut + two API calls).

## Ideas for v2

- Streaming Whisper (real-time partial captions, < 1s latency)
- Local models (whisper.cpp / faster-whisper + NLLB) for offline use
- Glossary of biblical names so "Jésù" always renders as "Jesus"
- Multi-language output (Yoruba → English, French, Portuguese for diaspora streams)
