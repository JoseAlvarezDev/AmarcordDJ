# AmarcordDJ

## A free and open-source DJ mixing app for macOS, Windows and Linux.

### A modern, professional two‑deck DJ mixing app with a clean studio aesthetic, powerful FX per deck, and performance‑grade controls.

<p align="center">
  <img src="public/logo.jpeg" alt="AmarcordDJ Logo" width="240" />
</p>

<p align="center">
  <a href="https://github.com/JoseAlvarezDev/AmarcordDJ/releases/download/v0.1.0/AmarcordDJ_0.1.0_aarch64.dmg.zip">
    <img src="https://img.shields.io/badge/Download-macOS-0b0b10?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS" />
  </a>
  <a href="https://github.com/JoseAlvarezDev/AmarcordDJ/releases">
    <img src="https://img.shields.io/badge/Download-Windows-0b0b10?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows" />
  </a>
  <a href="https://github.com/JoseAlvarezDev/AmarcordDJ/releases">
    <img src="https://img.shields.io/badge/Download-Linux-0b0b10?style=for-the-badge&logo=linux&logoColor=white" alt="Download for Linux" />
  </a>
</p>

<p align="center">
  <a href="https://ko-fi.com/josealvarezdev">
    <img src="https://img.shields.io/badge/Support-Ko--fi-16a34a?style=for-the-badge&logo=kofi&logoColor=white" alt="Support on Ko-fi" />
  </a>
</p>

---

## Live Site

https://josealvarezdev.github.io/AmarcordDJ/

## Highlights

- Dual‑deck workflow with modern glassmorphism UI
- FX per deck with wet/dry control and presets
- Beat‑synced visual feedback (LEDs/VU meters)
- Clean mixer layout with professional controls
- Responsive design that feels native on desktop

## Tech Stack

- **Tauri** (desktop app runtime)
- **React + TypeScript** (UI and app logic)
- **Vite** (fast dev and build pipeline)
- **Web Audio API + WaveSurfer** (audio analysis/visuals)

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Project Structure

- `src/` — React UI and audio logic
- `public/` — static assets (logo, splashscreen, etc.)
- `src-tauri/` — native Tauri configuration

## License

MIT — see [LICENSE](LICENSE).

## Credits

Created by **Jose Álvarez Dev**.
