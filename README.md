# AmarcordDJ

## A free and open-source DJ mixing app for macOS, Windows and Linux.

### A modern, professional two‑deck DJ mixing app with a clean studio aesthetic, powerful FX per deck, and performance‑grade controls.

<p align="center">
  <img src="public/logo.jpeg" alt="AmarcordDJ Logo" width="240" />
</p>

[![Download for macOS](https://img.shields.io/badge/Download-macOS-1f2937?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/JoseAlvarezDev/AmarcordDJ/releases)
[![Download for Windows](https://img.shields.io/badge/Download-Windows-1f2937?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/JoseAlvarezDev/AmarcordDJ/releases)
[![Download for Linux](https://img.shields.io/badge/Download-Linux-1f2937?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/JoseAlvarezDev/AmarcordDJ/releases)

[![Support this project](https://img.shields.io/badge/Support-Ko--fi-16a34a?style=for-the-badge&logo=kofi&logoColor=white)](https://ko-fi.com/josealvarezdev)

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
