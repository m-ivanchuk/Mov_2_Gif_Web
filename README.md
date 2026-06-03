# Kawaii Web Converter ✿ Offline Video to GIF

A beautiful, premium, and 100% client-side web application to convert videos (`.mov`, `.mp4`, `.webm`, `.avi`, `.mkv`) into high-quality GIFs. Running entirely in your browser using **FFmpeg WebAssembly (FFmpeg.wasm)**, your files are processed locally and never uploaded to any server.

✨ **[Live Demo](https://m-ivanchuk.github.io/Mov_2_Gif_Web/)** (or your deployed GitHub Pages URL)

---

## ✿ Key Features

*   **🔒 100% Local & Private:** All conversions happen inside your browser. No server uploads, no data collection.
*   **🎨 Custom Palette Editor:** Extract colors from your video, modify individual colors via a built-in color picker, and render GIFs using custom color schemes.
*   **🖼️ Polaroid-Style Comparison Feed:** Render multiple versions with different settings (FPS, Scale, Dither, Colors) and compare file sizes and visual quality side-by-side.
*   **⚡ WebAssembly-Powered:** Powered by a local compilation of FFmpeg via WebAssembly for maximum processing speed.
*   **🌸 Cute Kawaii Aesthetics:** Handcrafted responsive UI featuring micro-animations, custom sliders, and a wiggling paws loader.

---

## ✿ Tech Stack

*   **Core:** HTML5, CSS3 (Vanilla CSS with Custom HSL Palette), Javascript (ES6+)
*   **WebAssembly Core:** `@ffmpeg/ffmpeg` (v0.12+) & `@ffmpeg/util`
*   **Headers/Security Bypass:** `coi-serviceworker` (allows `SharedArrayBuffer` on static hosts like GitHub Pages)

---

## ✿ How to Run Locally

Because FFmpeg.wasm relies on `SharedArrayBuffer`, browsers require specific security headers (**Cross-Origin Opener Policy** and **Cross-Origin Embedder Policy**) to run it.

We use `coi-serviceworker` to automatically bypass these restrictions on static hosting, but for local development, you need to serve the files via a web server.

### Option 1: Live Server (VS Code)
If you use VS Code, install the **Live Server** extension, right-click `index.html`, and select **Open with Live Server**.

### Option 2: Node.js (npx)
If you have Node.js installed, run:
```bash
npx serve
```
Then open `http://localhost:3000` or `http://localhost:5000` in your browser.

### Option 3: Python
If you have Python installed:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

---

## ✿ Project Structure

```text
Mov_2_Gif_Web/
├── index.html        # UI Layout, structures and Templates
├── style.css         # Kawaii theme styling & animations
├── app.js            # Main application script & WASM pipeline
├── ffmpeg/           # Local FFmpeg.wasm binaries and utilities
│   ├── ffmpeg.min.js
│   ├── ffmpeg-util.js
│   ├── ffmpeg-core.js
│   └── ffmpeg-core.wasm
├── .gitignore        # Version control excludes
└── README.md         # This documentation file
```

---

## ✿ License

Distributed under the MIT License. See [LICENSE](LICENSE) or the repository details for more information.

*(^_−)☆ Made with love for cute designs and privacy.*
