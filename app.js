/**
 * Kawaii Web Converter — Pure Client-Side Wasm Logic
 */

// --- State ---
const state = {
  ffmpeg: null,
  ffmpegLoaded: false,
  file: null,
  filename: null,
  sizeBytes: 0,
  durationSeconds: 0,
  width: 0,
  height: 0,
  customPaletteEdited: false,
  customPaletteColors: []
};

let activeSwatchIndex = null;

// --- DOM Elements ---
const wasmLoadingBanner = document.getElementById('wasm-loading-banner');
const appContent = document.getElementById('app-content');
const uploadSection = document.getElementById('upload-section');
const workspaceSection = document.getElementById('workspace-section');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

// Workspace UI
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const fileDurationEl = document.getElementById('file-duration');
const fileDimsEl = document.getElementById('file-dimensions');
const closeSessionBtn = document.getElementById('close-session-btn');

// Settings UI
const convertBtn = document.getElementById('convert-btn');
const fpsSlider = document.getElementById('fps');
const fpsValue = document.getElementById('fps-value');
const colorsSlider = document.getElementById('colors');
const colorsValue = document.getElementById('colors-value');
const scaleSlider = document.getElementById('scale');
const scaleValue = document.getElementById('scale-value');
const scaleHint = document.getElementById('scale-hint');
const transparencyToggle = document.getElementById('transparency');
const transparencyLabel = document.getElementById('transparency-label');

// Palette Editor UI
const generatePaletteBtn = document.getElementById('generate-palette-btn');
const paletteGridContainer = document.getElementById('palette-grid-container');
const paletteGrid = document.getElementById('palette-grid');
const paletteCanvas = document.getElementById('palette-canvas');

// Custom Floating Color Picker UI
const pickerPanel = document.getElementById('palette-floating-picker');
const pickerCanvas = document.getElementById('picker-sv-canvas');
const pickerHueSlider = document.getElementById('picker-hue-slider');
const pickerPreview = document.getElementById('picker-preview');
const pickerHexInput = document.getElementById('picker-hex-input');
const pickerApplyBtn = document.getElementById('picker-apply-btn');
const pickerCloseBtn = document.getElementById('picker-close-btn');

// Results UI
const resultsFeed = document.getElementById('results-feed');
const emptyState = document.getElementById('empty-state');
const cardTemplate = document.getElementById('result-card-template');

// --- Format Helpers ---
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTime(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// --- Initialize FFmpeg.wasm ---
async function initFFmpeg() {
  const { FFmpeg } = FFmpegWASM;
  const { toBlobURL } = FFmpegUtil;

  try {
    state.ffmpeg = new FFmpeg();
    
    // Log conversion traces to console for debugging
    state.ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg:', message);
    });

    const baseURL = 'ffmpeg';
    
    // Asynchronously fetch Core Wasm builds via local proxy Blobs to satisfy browser security
    await state.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
    });

    state.ffmpegLoaded = true;
    console.log('FFmpeg WebAssembly core loaded successfully!');

    // Transition views
    wasmLoadingBanner.classList.add('hidden');
    appContent.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to load FFmpeg.wasm:', err);
    alert('Oops! Failed to load WebAssembly Converter:\n' + err.message + '\n\nMake sure your browser supports SharedArrayBuffer and coi-serviceworker script was loaded correctly.');
  }
}

window.addEventListener('DOMContentLoaded', initFFmpeg);

// --- Input Syncing ---
fpsSlider.addEventListener('input', (e) => {
  fpsValue.textContent = e.target.value;
  updateSliderFill(e.target);
});

colorsSlider.addEventListener('input', (e) => {
  colorsValue.textContent = e.target.value;
  updateSliderFill(e.target);
});

scaleSlider.addEventListener('input', (e) => {
  scaleValue.textContent = e.target.value + '%';
  updateSliderFill(e.target);
  updateScaleHint();
});

function updateScaleHint() {
  if (state.width && state.height) {
    const scale = parseInt(scaleSlider.value, 10) / 100;
    const w = Math.round(state.width * scale);
    const h = Math.round(state.height * scale);
    scaleHint.textContent = `Output size: ${w}x${h} px`;
  }
}

transparencyToggle.addEventListener('change', (e) => {
  transparencyLabel.textContent = e.target.checked ? 'On' : 'Off';
});

function updateSliderFill(slider) {
  const min = slider.min || 0;
  const max = slider.max || 100;
  const val = slider.value;
  const percent = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--slider-fill', `${percent}%`);
}

// Init slider fills
updateSliderFill(fpsSlider);
updateSliderFill(colorsSlider);
updateSliderFill(scaleSlider);

// Stepper logic
document.querySelectorAll('.btn-step').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const dir = parseInt(btn.dataset.dir, 10);
    const slider = document.getElementById(targetId);
    if (!slider) return;

    const step = parseFloat(slider.step) || 1;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    
    let val = parseFloat(slider.value);
    val += dir * step;
    
    if (val < min) val = min;
    if (val > max) val = max;
    
    slider.value = val;
    slider.dispatchEvent(new Event('input'));
  });
});

// --- Palette Editor Logic ---

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s, v };
}

// --- Custom Floating Color Picker State & Drawing ---
let pickerHue = 0; // 0 to 360
let pickerSat = 1; // 0 to 1
let pickerVal = 1; // 0 to 1
let isDraggingPicker = false;

function updatePickerColor() {
  if (!pickerCanvas) return { r: 255, g: 0, b: 0, hex: '#ff0000' };
  const ctx = pickerCanvas.getContext('2d');
  const w = pickerCanvas.width;
  const h = pickerCanvas.height;

  // Redraw gradient field
  ctx.fillStyle = `hsl(${pickerHue}, 100%, 50%)`;
  ctx.fillRect(0, 0, w, h);

  const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
  whiteGrad.addColorStop(0, '#ffffff');
  whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = whiteGrad;
  ctx.fillRect(0, 0, w, h);

  const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
  blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  blackGrad.addColorStop(1, '#000000');
  ctx.fillStyle = blackGrad;
  ctx.fillRect(0, 0, w, h);

  // Read active coordinate color (before rendering crosshair)
  const x = Math.max(0, Math.min(w - 1, Math.round(pickerSat * w)));
  const y = Math.max(0, Math.min(h - 1, Math.round((1 - pickerVal) * h)));
  const imgData = ctx.getImageData(x, y, 1, 1);
  const r = imgData.data[0];
  const g = imgData.data[1];
  const b = imgData.data[2];
  const hex = rgbToHex(r, g, b);

  // Render selector crosshair
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Update controls
  if (pickerPreview) pickerPreview.style.backgroundColor = hex;
  if (pickerHexInput && document.activeElement !== pickerHexInput) {
    pickerHexInput.value = hex;
  }

  return { r, g, b, hex };
}

function handlePickerCanvasDrag(e) {
  if (!pickerCanvas) return;
  const rect = pickerCanvas.getBoundingClientRect();
  const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
  const clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;

  const x = clientX - rect.left;
  const y = clientY - rect.top;

  pickerSat = Math.max(0, Math.min(1, x / rect.width));
  pickerVal = Math.max(0, Math.min(1, 1 - (y / rect.height)));

  updatePickerColor();
}

// Hook up event listeners for Hue & SV Canvas
if (pickerCanvas) {
  pickerCanvas.addEventListener('mousedown', (e) => {
    isDraggingPicker = true;
    handlePickerCanvasDrag(e);
  });
  
  window.addEventListener('mousemove', (e) => {
    if (isDraggingPicker) handlePickerCanvasDrag(e);
  });

  window.addEventListener('mouseup', () => {
    isDraggingPicker = false;
  });

  // Touch support
  pickerCanvas.addEventListener('touchstart', (e) => {
    isDraggingPicker = true;
    if (e.touches.length) handlePickerCanvasDrag(e.touches[0]);
  });

  window.addEventListener('touchmove', (e) => {
    if (isDraggingPicker && e.touches.length) {
      handlePickerCanvasDrag(e.touches[0]);
    }
  });

  window.addEventListener('touchend', () => {
    isDraggingPicker = false;
  });
}

if (pickerHueSlider) {
  pickerHueSlider.addEventListener('input', (e) => {
    pickerHue = parseInt(e.target.value, 10);
    updatePickerColor();
  });
}

if (pickerHexInput) {
  pickerHexInput.addEventListener('input', (e) => {
    const hex = e.target.value;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      const rgb = hexToRgb(hex);
      if (rgb) {
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        pickerHue = hsv.h;
        pickerSat = hsv.s;
        pickerVal = hsv.v;

        if (pickerHueSlider) pickerHueSlider.value = pickerHue;
        updatePickerColor();
      }
    }
  });
}

if (pickerCloseBtn) {
  pickerCloseBtn.addEventListener('click', () => {
    if (pickerPanel) pickerPanel.classList.add('hidden');
  });
}

if (pickerApplyBtn) {
  pickerApplyBtn.addEventListener('click', () => {
    if (activeSwatchIndex === null) return;
    const { r, g, b, hex } = updatePickerColor();

    const color = state.customPaletteColors[activeSwatchIndex];
    color.hex = hex;
    color.r = r;
    color.g = g;
    color.b = b;
    color.a = 255;

    const ctx = paletteCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, paletteCanvas.width, paletteCanvas.height);
    const data = imgData.data;
    data[activeSwatchIndex * 4] = r;
    data[activeSwatchIndex * 4 + 1] = g;
    data[activeSwatchIndex * 4 + 2] = b;
    data[activeSwatchIndex * 4 + 3] = 255;
    ctx.putImageData(imgData, 0, 0);

    const swatches = paletteGrid.querySelectorAll('.palette-swatch');
    if (swatches[activeSwatchIndex]) {
      swatches[activeSwatchIndex].style.backgroundColor = hex;
      swatches[activeSwatchIndex].style.background = hex;
      swatches[activeSwatchIndex].title = `Color ${activeSwatchIndex + 1}: ${hex}`;
    }

    state.customPaletteEdited = true;
    if (pickerPanel) pickerPanel.classList.add('hidden');
  });
}

function loadPaletteFromImage(img, markAsEdited = false) {
  paletteCanvas.width = img.width;
  paletteCanvas.height = img.height;
  const ctx = paletteCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imgData.data;

  paletteGrid.innerHTML = '';
  state.customPaletteColors = [];

  const numColors = img.width * img.height;
  for (let i = 0; i < numColors; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];

    const hex = rgbToHex(r, g, b);
    state.customPaletteColors.push({ r, g, b, a, hex, index: i });

    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch';
    swatch.style.backgroundColor = hex;
    swatch.title = `Color ${i + 1}: ${hex}`;
    
    if (a === 0) {
      swatch.style.background = 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)';
      swatch.title = `Color ${i + 1}: Transparent`;
    }

    swatch.addEventListener('click', () => {
      activeSwatchIndex = i;
      const startHex = a === 0 ? '#ffffff' : hex;
      const rgb = hexToRgb(startHex);
      if (rgb) {
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        pickerHue = hsv.h;
        pickerSat = hsv.s;
        pickerVal = hsv.v;

        if (pickerHueSlider) pickerHueSlider.value = pickerHue;
        updatePickerColor();
        if (pickerPanel) pickerPanel.classList.remove('hidden');
      }
    });

    paletteGrid.appendChild(swatch);
  }

  paletteGridContainer.classList.remove('hidden');
  state.customPaletteEdited = markAsEdited;
}

// Generate & Load Colors (Pure Client-Side via Wasm FFmpeg)
if (generatePaletteBtn) {
  generatePaletteBtn.addEventListener('click', async () => {
    if (!state.ffmpegLoaded || !state.file) {
      alert('Please upload a video first!');
      return;
    }

    generatePaletteBtn.disabled = true;
    const originalText = generatePaletteBtn.textContent;
    generatePaletteBtn.textContent = 'Generating...';

    const tempInputName = 'temp_input_palette.' + state.filename.split('.').pop();
    const paletteName = 'temp_palette.png';

    try {
      const scale = parseInt(scaleSlider.value, 10) / 100;
      const width = Math.round(state.width * scale);
      const height = Math.round(state.height * scale);
      const fps = parseInt(fpsSlider.value, 10);
      const colors = parseInt(colorsSlider.value, 10);
      const trans = transparencyToggle.checked ? 'yes' : 'no';

      // 1. Write the input file to the WebAssembly Virtual Filesystem
      const { fetchFile } = FFmpegUtil;
      await state.ffmpeg.writeFile(tempInputName, await fetchFile(state.file));

      // 2. Prepare filters and execute palettegen
      const scaleFilter = `scale=${width}:${height}:flags=lanczos`;
      const palettegenOpts = `max_colors=${colors}` + (trans === 'yes' ? ':reserve_transparent=1' : '');

      await state.ffmpeg.exec([
        '-i', tempInputName,
        '-vf', `fps=${fps},${scaleFilter},palettegen=${palettegenOpts}`,
        '-y', paletteName
      ]);

      // 3. Read generated palette file from virtual FS
      const paletteData = await state.ffmpeg.readFile(paletteName);
      const paletteBlob = new Blob([paletteData.buffer], { type: 'image/png' });

      // Load blob into canvas
      const img = new Image();
      img.onload = function () {
        loadPaletteFromImage(img, false);
      };
      img.src = URL.createObjectURL(paletteBlob);

    } catch (err) {
      console.error('Failed client-side palettegen:', err);
      alert('Failed to extract colors: ' + err.message);
    } finally {
      // Clean up temp files
      try {
        await state.ffmpeg.deleteFile(tempInputName);
      } catch (e) {}
      try {
        await state.ffmpeg.deleteFile(paletteName);
      } catch (e) {}

      generatePaletteBtn.disabled = false;
      generatePaletteBtn.textContent = originalText;
    }
  });
}

// --- File Handling & Native Probing ---
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length) handleFile(files[0]);
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

async function handleFile(file) {
  if (!file) return;
  
  dropZone.classList.add('uploading');
  
  state.file = file;
  state.filename = file.name;
  state.sizeBytes = file.size;

  try {
    // Gather geometry size from the new source file directly using FFmpeg, 
    // avoiding browser DOM / video tag memory caching issues.
    const { fetchFile } = FFmpegUtil;
    const probeName = 'probe_' + Date.now() + '.' + state.filename.split('.').pop();
    await state.ffmpeg.writeFile(probeName, await fetchFile(file));

    let probedW = 0;
    let probedH = 0;
    let probedDuration = 0;

    const probeLogHandler = ({ message }) => {
      const dimMatch = message.match(/Video:.*?\s(\d{2,5})x(\d{2,5})\b/);
      if (dimMatch && !probedW) {
        probedW = parseInt(dimMatch[1], 10);
        probedH = parseInt(dimMatch[2], 10);
      }
      const durMatch = message.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
      if (durMatch && !probedDuration) {
        const h = parseInt(durMatch[1], 10);
        const m = parseInt(durMatch[2], 10);
        const s = parseFloat(durMatch[3]);
        probedDuration = h * 3600 + m * 60 + s;
      }
    };

    state.ffmpeg.on('log', probeLogHandler);
    await state.ffmpeg.exec(['-i', probeName]);
    state.ffmpeg.off('log', probeLogHandler);

    try {
      await state.ffmpeg.deleteFile(probeName);
    } catch (e) {}

    state.durationSeconds = probedDuration || 5;
    state.width = probedW || 640;
    state.height = probedH || 360;

    // Update UI elements
    fileNameEl.textContent = state.filename;
    fileSizeEl.textContent = formatBytes(state.sizeBytes);
    fileDurationEl.textContent = formatTime(state.durationSeconds);
    fileDimsEl.textContent = `${state.width}x${state.height}`;
    
    // Transition views
    uploadSection.classList.add('hidden');
    workspaceSection.classList.remove('hidden');
    
    dropZone.classList.remove('uploading');
    updateScaleHint();
    fileInput.value = '';
    
  } catch (err) {
    alert('Failed to read video details: ' + err.message);
    dropZone.classList.remove('uploading');
    fileInput.value = '';
  }
}

// --- Wasm GIF Conversion Pipeline ---
convertBtn.addEventListener('click', startConversion);

async function startConversion() {
  if (!state.ffmpegLoaded || !state.file) return;

  const scale = parseInt(scaleSlider.value, 10) / 100;
  const width = Math.round(state.width * scale);
  const height = Math.round(state.height * scale);
  const fps = parseInt(fpsSlider.value, 10);
  const colors = parseInt(colorsSlider.value, 10);
  const trans = transparencyToggle.checked ? 'yes' : 'no';
  const ditherSelect = document.getElementById('dither');
  const dither = ditherSelect.value;
  const ditherText = ditherSelect.options[ditherSelect.selectedIndex].text;

  const playbackSelect = document.getElementById('playback');
  const playback = playbackSelect.value;
  const playbackText = playbackSelect.options[playbackSelect.selectedIndex].text;

  // Generate unique conversion ID
  const conversionId = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

  const settingsData = { scale: scaleSlider.value, fps, colors, trans, dither, ditherText, playback, playbackText, paletteEdited: state.customPaletteEdited, paletteDataUrl: null };
  if (state.customPaletteEdited) {
    settingsData.paletteDataUrl = paletteCanvas.toDataURL('image/png');
  }

  // Instantiation of polaroid card
  const card = createResultCard(conversionId, { width, height, ...settingsData });
  card.el.settingsData = settingsData;
  emptyState.classList.add('hidden');
  resultsFeed.insertBefore(card.el, resultsFeed.firstChild);

  // Auto-scroll to results feed
  document.querySelector('.workspace-results').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Cancellation binder
  let isCancelled = false;
  card.deleteBtn.addEventListener('click', async () => {
    isCancelled = true;
    card.el.remove();
    checkEmptyState();
  });

  try {
    // 1. Write the input file to the WebAssembly Virtual Filesystem
    card.progressStage.textContent = 'Storing file in memory...';
    card.progressFill.style.width = `6%`;
    card.progressPercent.textContent = `6%`;

    const { fetchFile } = FFmpegUtil;
    const inputName = 'input_' + conversionId + '.' + state.filename.split('.').pop();
    await state.ffmpeg.writeFile(inputName, await fetchFile(state.file));

    if (isCancelled) {
      await state.ffmpeg.deleteFile(inputName);
      return;
    }

    const paletteName = `palette_${conversionId}.png`;
    const gifName = `output_${conversionId}.gif`;

    // Write custom palette image to FS if edited
    if (state.customPaletteEdited) {
      card.progressStage.textContent = 'Injecting custom colors...';
      const paletteBlob = await new Promise(resolve => paletteCanvas.toBlob(resolve, 'image/png'));
      const buffer = await paletteBlob.arrayBuffer();
      await state.ffmpeg.writeFile(paletteName, new Uint8Array(buffer));
    }

    if (isCancelled) {
      await state.ffmpeg.deleteFile(inputName);
      try {
        await state.ffmpeg.deleteFile(paletteName);
      } catch (e) {}
      return;
    }

    // 2. Attach progress event listener
    state.ffmpeg.on('progress', ({ progress }) => {
      if (isCancelled) return;
      // Map progress range from 10% to 96%
      const p = Math.round(10 + progress * 86);
      card.progressFill.style.width = `${p}%`;
      card.progressPercent.textContent = `${p}%`;

      if (state.customPaletteEdited) {
        card.progressStage.textContent = 'Rendering cute GIF with custom colors...';
      } else {
        if (progress < 0.35) {
          card.progressStage.textContent = 'Analyzing color palette...';
        } else {
          card.progressStage.textContent = 'Rendering cute GIF...';
        }
      }
    });

    // 3. Prepare filters
    let filterSource = `fps=${fps},scale=${width}:${height}:flags=lanczos`;
    if (playback === 'pingpong') {
      filterSource = `[0:v]split[v1][v2];[v2]reverse[v2r];[v1][v2r]concat=n=2:v=1[merged];[merged]fps=${fps},scale=${width}:${height}:flags=lanczos`;
    }

    const palettegenOpts = `max_colors=${colors}` + (trans === 'yes' ? ':reserve_transparent=1' : '');
    const paletteuseOpts = (trans === 'yes' ? 'alpha_threshold=128:' : '') + `dither=${dither}`;

    // 4. Exec Pass 1: Palette Analysis (Only if not using custom palette!)
    if (!state.customPaletteEdited) {
      const pass1FilterArgs = playback === 'pingpong' 
        ? ['-filter_complex', `${filterSource},palettegen=${palettegenOpts}`]
        : ['-vf', `${filterSource},palettegen=${palettegenOpts}`];

      await state.ffmpeg.exec([
        '-i', inputName,
        ...pass1FilterArgs,
        '-y', paletteName
      ]);

      // Capture the generated palette for the "Copy Settings" feature
      try {
        const palData = await state.ffmpeg.readFile(paletteName);
        const palBlob = new Blob([palData.buffer], { type: 'image/png' });
        const reader = new FileReader();
        reader.onload = () => {
          card.el.settingsData.paletteDataUrl = reader.result;
        };
        reader.readAsDataURL(palBlob);
      } catch (e) {
        console.error('Could not capture auto-generated palette for copy settings:', e);
      }
    }

    if (isCancelled) {
      await state.ffmpeg.deleteFile(inputName);
      await state.ffmpeg.deleteFile(paletteName);
      return;
    }

    // 5. Exec Pass 2: Pixel Dithering & GIF compilation
    const loopArg = (playback === 'once') ? '-1' : '0';

    await state.ffmpeg.exec([
      '-i', inputName,
      '-i', paletteName,
      '-filter_complex', `${filterSource}[x];[x][1:v]paletteuse=${paletteuseOpts}`,
      '-loop', loopArg,
      '-y', gifName
    ]);

    if (isCancelled) {
      await state.ffmpeg.deleteFile(inputName);
      await state.ffmpeg.deleteFile(paletteName);
      await state.ffmpeg.deleteFile(gifName);
      return;
    }

    // 6. Read completed GIF from Wasm RAM
    const data = await state.ffmpeg.readFile(gifName);
    const gifBlob = new Blob([data.buffer], { type: 'image/gif' });
    const gifUrl = URL.createObjectURL(gifBlob);

    // 7. Update layout card
    card.progressContainer.classList.add('hidden');
    card.resultContent.classList.remove('hidden');

    card.img.src = gifUrl;
    card.sizeEl.textContent = formatBytes(gifBlob.size);
    
    // Determine actual output resolution asynchronously and bind proper filename
    const imgObj = new Image();
    imgObj.onload = () => {
      const realW = imgObj.naturalWidth || width || 640;
      const realH = imgObj.naturalHeight || height || 360;
      
      card.dimsEl.textContent = `${realW}x${realH}`;
      
      // Update or create the resolution badge
      const badgesContainer = card.el.querySelector('.result-badges');
      let resBadge = Array.from(badgesContainer.querySelectorAll('.badge')).find(b => /^\d+x\d+$/.test(b.textContent));
      if (resBadge) {
        resBadge.textContent = `${realW}x${realH}`;
      } else {
        const span = document.createElement('span');
        span.className = 'badge';
        span.textContent = `${realW}x${realH}`;
        badgesContainer.appendChild(span);
      }
      
      card.downloadBtn.download = `${state.filename.split('.')[0]}_${realW}x${realH}_${colors}_${dither}.gif`;
      
      card.el.dataset.size = gifBlob.size;
      sortResultsFeed();
    };
    imgObj.src = gifUrl;
    
    // Bind downloads
    card.downloadBtn.href = gifUrl;

    // 8. CRITICAL: Clean up memory files in Wasm FS immediately to prevent heap OOM crashes
    await state.ffmpeg.deleteFile(inputName);
    await state.ffmpeg.deleteFile(paletteName);
    await state.ffmpeg.deleteFile(gifName);

  } catch (err) {
    console.error('Wasm transcode failed:', err);
    card.progressContainer.classList.add('hidden');
    card.errorContent.classList.remove('hidden');
    card.errorContent.querySelector('.error-text').textContent = 'Conversion failed: ' + err.message;
    
    card.el.dataset.size = 999999999999;
    sortResultsFeed();
  }
}

function createResultCard(id, settings) {
  const template = cardTemplate.content.cloneNode(true);
  const el = template.querySelector('.result-card');
  el.dataset.id = id;
  el.dataset.size = -1;
  el.dataset.timestamp = Date.now();
  el.dataset.fps = settings.fps || 0;
  el.dataset.colors = settings.colors || 0;
  el.dataset.dither = settings.ditherText || '';
  
  const badgesContainer = el.querySelector('.result-badges');
  
  const badges = [
    `${settings.fps} FPS`,
    `${settings.colors} Colors`,
    settings.ditherText,
    settings.trans === 'yes' ? 'Alpha' : 'No Alpha',
    settings.playbackText || 'Loop'
  ];
  
  if (settings.width && settings.height) {
    badges.push(`${settings.width}x${settings.height}`);
  }
  
  badges.forEach(text => {
    const span = document.createElement('span');
    span.className = 'badge';
    span.textContent = text;
    badgesContainer.appendChild(span);
  });

  const copyBtn = el.querySelector('.btn-copy-settings');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const sData = el.settingsData;
      if (!sData) return;
      
      fpsSlider.value = sData.fps;
      fpsSlider.dispatchEvent(new Event('input'));
      colorsSlider.value = sData.colors;
      colorsSlider.dispatchEvent(new Event('input'));
      scaleSlider.value = sData.scale;
      scaleSlider.dispatchEvent(new Event('input'));
      
      transparencyToggle.checked = (sData.trans === 'yes');
      transparencyToggle.dispatchEvent(new Event('change'));
      
      document.getElementById('dither').value = sData.dither;
      if (sData.playback) {
        document.getElementById('playback').value = sData.playback;
      }
      
      if (sData.paletteDataUrl) {
        const img = new Image();
        img.onload = () => {
          loadPaletteFromImage(img, true);
        };
        img.src = sData.paletteDataUrl;
      } else {
        state.customPaletteEdited = false;
        if (paletteGridContainer) paletteGridContainer.classList.add('hidden');
      }

      // Auto-scroll to settings panel (skipping palette editor)
      const settingsSection = document.querySelector('.workspace-sidebar');
      if (settingsSection) {
        settingsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  
  return {
    el,
    deleteBtn: el.querySelector('.btn-delete'),
    progressContainer: el.querySelector('.progress-container'),
    progressFill: el.querySelector('.progress-fill'),
    progressStage: el.querySelector('.progress-stage'),
    progressPercent: el.querySelector('.progress-percent'),
    resultContent: el.querySelector('.result-content'),
    img: el.querySelector('.result-gif'),
    sizeEl: el.querySelector('.result-size'),
    dimsEl: el.querySelector('.result-dims'),
    downloadBtn: el.querySelector('.btn-download'),
    copyBtn,
    errorContent: el.querySelector('.error-content')
  };
}

function checkEmptyState() {
  const hasCards = resultsFeed.querySelectorAll('.result-card').length > 0;
  if (!hasCards) {
    emptyState.classList.remove('hidden');
  }
}

// --- Close Session ---
closeSessionBtn.addEventListener('click', () => {
  // Reset states for the new video
  state.file = null;
  state.filename = null;
  state.sizeBytes = 0;
  state.durationSeconds = 0;
  state.width = 0;
  state.height = 0;
  
  // Explicitly reset the palette for the new video
  state.customPaletteEdited = false;
  state.customPaletteColors = [];

  // Reset Palette UI
  if (paletteGrid) paletteGrid.innerHTML = '';
  if (paletteGridContainer) paletteGridContainer.classList.add('hidden');
  if (pickerPanel) pickerPanel.classList.add('hidden');

  // Switch views back to upload
  workspaceSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  
  // Note: We intentionally do NOT purge result cards here,
  // allowing the user to compare GIFs from different source videos side-by-side.
  // The control sliders (FPS, Colors, etc) also retain their current values naturally.
});

// --- Full-Size GIF Modal Logic ---
const gifModal = document.getElementById('gif-modal');
const gifModalImg = document.getElementById('gif-modal-img');
const gifModalCaption = document.getElementById('gif-modal-caption');
const gifModalClose = document.querySelector('.gif-modal-close');

if (gifModal && gifModalImg && gifModalClose) {
  // Delegated click event: listen on the results feed for polaroid preview clicks
  resultsFeed.addEventListener('click', (e) => {
    const preview = e.target.closest('.result-preview');
    if (preview) {
      const img = preview.querySelector('.result-gif');
      const cardEl = preview.closest('.result-card');
      
      if (img && img.src) {
        // Gather settings badges for a cute caption text
        let captionText = 'GIF Preview';
        if (cardEl) {
          const badges = Array.from(cardEl.querySelectorAll('.badge')).map(b => b.textContent);
          if (badges.length) {
            captionText = badges.join(' • ');
          }
        }
        
        // Display the modal
        gifModalImg.src = img.src;
        gifModalCaption.textContent = captionText;
        gifModal.classList.remove('hidden');
        gifModal.setAttribute('aria-hidden', 'false');
      }
    }
  });

  // Close modal function
  const closeModal = () => {
    gifModal.classList.add('hidden');
    gifModal.setAttribute('aria-hidden', 'true');
    gifModalImg.src = '';
  };

  // Close on click close button
  gifModalClose.addEventListener('click', closeModal);

  // Close by clicking backdrop
  gifModal.addEventListener('click', (e) => {
    if (e.target === gifModal) {
      closeModal();
    }
  });

  // Close on Escape keypress
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !gifModal.classList.contains('hidden')) {
      closeModal();
    }
  });
}

// --- Sort Results Feed ---
function sortResultsFeed() {
  const cards = Array.from(resultsFeed.querySelectorAll('.result-card'));
  const sortSelect = document.getElementById('sort-select');
  const sortMode = sortSelect ? sortSelect.value : 'newest';
  
  cards.sort((a, b) => {
    const sizeA = parseInt(a.dataset.size || -1, 10);
    const sizeB = parseInt(b.dataset.size || -1, 10);
    const timeA = parseInt(a.dataset.timestamp || 0, 10);
    const timeB = parseInt(b.dataset.timestamp || 0, 10);
    
    // Keep converting cards (size -1) at the top of the list
    if (sizeA === -1 && sizeB === -1) return timeB - timeA;
    if (sizeA === -1) return -1;
    if (sizeB === -1) return 1;
    
    if (sortMode === 'size') {
      if (sizeA !== sizeB) return sizeA - sizeB; // Ascending order
    } else if (sortMode === 'fps') {
      const fpsA = parseInt(a.dataset.fps || 0, 10);
      const fpsB = parseInt(b.dataset.fps || 0, 10);
      if (fpsA !== fpsB) return fpsA - fpsB; // Ascending order
    } else if (sortMode === 'colors') {
      const colorsA = parseInt(a.dataset.colors || 0, 10);
      const colorsB = parseInt(b.dataset.colors || 0, 10);
      if (colorsA !== colorsB) return colorsA - colorsB; // Ascending order
    } else if (sortMode === 'dither') {
      const ditherA = a.dataset.dither || '';
      const ditherB = b.dataset.dither || '';
      const cmp = ditherA.localeCompare(ditherB);
      if (cmp !== 0) return cmp; // Alphabetical
    }
    
    return timeB - timeA; // Newest first fallback
  });
  
  // Re-append to order elements dynamically in DOM
  cards.forEach(card => resultsFeed.appendChild(card));
}

const sortSelectEl = document.getElementById('sort-select');
if (sortSelectEl) {
  sortSelectEl.addEventListener('change', sortResultsFeed);
}
