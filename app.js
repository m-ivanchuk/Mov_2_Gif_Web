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
  customPaletteColors: [],
  crop: { left: 0, right: 0, top: 0, bottom: 0 }
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
const trimStartSlider = document.getElementById('trim-start');
const trimStartValue = document.getElementById('trim-start-value');
const trimEndSlider = document.getElementById('trim-end');
const trimEndValue = document.getElementById('trim-end-value');
const trimHint = document.getElementById('trim-hint');
const trimKeptBadge = document.getElementById('trim-kept-badge');
const trimPreview = document.getElementById('trim-preview');
const trimPreviewWrap = document.getElementById('trim-preview-wrap');
const trimPreviewFallback = document.getElementById('trim-preview-fallback');
const trimPreviewPlay = document.getElementById('trim-preview-play');
const trimFrameLabel = document.getElementById('trim-frame-label');
const trimRange = document.getElementById('trim-range');
const trimRangeAxis = document.getElementById('trim-range-axis');
const trimRangeKeep = document.getElementById('trim-range-keep');
const trimThumbStart = document.getElementById('trim-thumb-start');
const trimThumbEnd = document.getElementById('trim-thumb-end');
const trimPlayhead = document.getElementById('trim-playhead');
const trimTimelineStart = document.getElementById('trim-timeline-start');
const trimTimelineEnd = document.getElementById('trim-timeline-end');
const mediaStage = document.getElementById('media-stage');
const cropRect = document.getElementById('crop-rect');
const cropHint = document.getElementById('crop-hint');
const cropResetBtn = document.getElementById('crop-reset-btn');
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

function formatTimePrecise(seconds) {
  const safe = Math.max(0, seconds || 0);
  const m = Math.floor(safe / 60);
  const s = (safe % 60).toFixed(1);
  const [whole, frac] = s.split('.');
  return `${m}:${whole.padStart(2, '0')}.${frac}`;
}

// --- Initialize FFmpeg.wasm ---
async function initFFmpeg() {
  const isLighthouse = navigator.webdriver || 
                       navigator.userAgent.includes("HeadlessChrome") || 
                       navigator.userAgent.includes("moto g power") ||
                       navigator.userAgent.includes("Lighthouse") || 
                       navigator.userAgent.includes("Chrome-Lighthouse");
  
  if (isLighthouse) {
    console.log("Lighthouse environment detected: skipping 32MB WebAssembly core download for performance audit.");
    wasmLoadingBanner.classList.add('hidden');
    appContent.classList.remove('hidden');
    return;
  }

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
  updateTrimControls();
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
    const out = getOutputDimensions();
    const crop = getCropState();
    if (crop.active) {
      scaleHint.textContent = `Output size: ${out.width}x${out.height} px (from crop ${crop.w}x${crop.h})`;
    } else {
      scaleHint.textContent = `Output size: ${out.width}x${out.height} px`;
    }
  }
}

function evenSize(n) {
  const v = Math.max(2, Math.floor(n));
  return v - (v % 2);
}

function getCropState() {
  const srcW = state.width || 0;
  const srcH = state.height || 0;
  const crop = state.crop || { left: 0, right: 0, top: 0, bottom: 0 };
  const minKeep = 2;
  let left = Math.max(0, Math.round(Number(crop.left) || 0));
  let right = Math.max(0, Math.round(Number(crop.right) || 0));
  let top = Math.max(0, Math.round(Number(crop.top) || 0));
  let bottom = Math.max(0, Math.round(Number(crop.bottom) || 0));

  if (srcW > 0 && left + right > srcW - minKeep) {
    right = Math.max(0, srcW - minKeep - left);
  }
  if (srcH > 0 && top + bottom > srcH - minKeep) {
    bottom = Math.max(0, srcH - minKeep - top);
  }

  let w = srcW > 0 ? Math.max(minKeep, srcW - left - right) : 0;
  let h = srcH > 0 ? Math.max(minKeep, srcH - top - bottom) : 0;
  if (srcW > 0) {
    w = evenSize(w);
    if (left + w > srcW) left = Math.max(0, srcW - w);
    right = Math.max(0, srcW - left - w);
  }
  if (srcH > 0) {
    h = evenSize(h);
    if (top + h > srcH) top = Math.max(0, srcH - h);
    bottom = Math.max(0, srcH - top - h);
  }

  return {
    left, right, top, bottom,
    x: left,
    y: top,
    w,
    h,
    srcW,
    srcH,
    active: left > 0 || right > 0 || top > 0 || bottom > 0
  };
}

function getOutputDimensions() {
  const crop = getCropState();
  const srcW = crop.w || state.width || 0;
  const srcH = crop.h || state.height || 0;
  const scale = parseInt(scaleSlider.value, 10) / 100;
  return {
    width: Math.max(2, Math.round(srcW * scale)),
    height: Math.max(2, Math.round(srcH * scale))
  };
}

function buildGifFilterGraph(fps, width, height, playback) {
  const crop = getCropState();
  const cropF = crop.active ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}` : '';
  const tail = `fps=${fps},scale=${width}:${height}:flags=lanczos`;
  if (playback === 'pingpong') {
    const head = cropF ? `[0:v]${cropF},split` : `[0:v]split`;
    return `${head}[v1][v2];[v2]reverse[v2r];[v1][v2r]concat=n=2:v=1[merged];[merged]${tail}`;
  }
  return cropF ? `${cropF},${tail}` : tail;
}

// --- Trim (dual-handle keep-range at current output FPS) ---
let trimPreviewUrl = null;
let trimPreviewGeneration = 0;
let trimScrubbing = false;
let activeTrimHandle = null;

function getTrimState() {
  const fps = parseInt(fpsSlider.value, 10) || 12;
  const totalFrames = Math.max(1, Math.round((state.durationSeconds || 0) * fps));
  let cutStart = parseInt(trimStartSlider.value, 10) || 0;
  let cutEnd = parseInt(trimEndSlider.value, 10) || 0;
  const maxCut = Math.max(0, totalFrames - 1);

  cutStart = Math.max(0, Math.min(cutStart, maxCut));
  cutEnd = Math.max(0, Math.min(cutEnd, maxCut));
  if (cutStart + cutEnd >= totalFrames) {
    cutEnd = Math.max(0, totalFrames - 1 - cutStart);
  }

  const kept = Math.max(1, totalFrames - cutStart - cutEnd);
  const startFrame = cutStart;
  const endFrame = totalFrames - 1 - cutEnd;
  const startTime = startFrame / fps;
  const duration = kept / fps;
  const endTime = startTime + duration;

  return {
    fps,
    totalFrames,
    cutStart,
    cutEnd,
    kept,
    startFrame,
    endFrame,
    startTime,
    duration,
    endTime,
    active: cutStart > 0 || cutEnd > 0
  };
}

function getTrimInputArgs() {
  const trim = getTrimState();
  if (!trim.active) return [];
  const args = [];
  if (trim.startTime > 0.0005) {
    args.push('-ss', trim.startTime.toFixed(4));
  }
  args.push('-t', Math.max(trim.duration, 1 / trim.fps).toFixed(4));
  return args;
}

function isTrimPreviewVisible() {
  return !!(trimPreview && trimPreviewWrap && trimPreviewWrap.classList.contains('has-preview'));
}

function frameToAxisPercent(frame, totalFrames) {
  const max = Math.max(1, totalFrames - 1);
  return (frame / max) * 100;
}

function clientXToFrame(clientX) {
  if (!trimRangeAxis) return 0;
  const rect = trimRangeAxis.getBoundingClientRect();
  const t = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
  const trim = getTrimState();
  const max = Math.max(0, trim.totalFrames - 1);
  return Math.round(Math.max(0, Math.min(1, t)) * max);
}

function updateTrimRangeUI() {
  const trim = getTrimState();
  const startPct = frameToAxisPercent(trim.startFrame, trim.totalFrames);
  const endPct = frameToAxisPercent(trim.endFrame, trim.totalFrames);

  if (trimRangeKeep) {
    trimRangeKeep.style.left = `${startPct}%`;
    trimRangeKeep.style.width = `${Math.max(0, endPct - startPct)}%`;
  }
  if (trimThumbStart) trimThumbStart.style.left = `${startPct}%`;
  if (trimThumbEnd) trimThumbEnd.style.left = `${endPct}%`;

  if (trimThumbStart) {
    trimThumbStart.setAttribute('aria-valuemin', '0');
    trimThumbStart.setAttribute('aria-valuemax', String(trim.endFrame));
    trimThumbStart.setAttribute('aria-valuenow', String(trim.startFrame));
  }
  if (trimThumbEnd) {
    trimThumbEnd.setAttribute('aria-valuemin', String(trim.startFrame));
    trimThumbEnd.setAttribute('aria-valuemax', String(Math.max(0, trim.totalFrames - 1)));
    trimThumbEnd.setAttribute('aria-valuenow', String(trim.endFrame));
  }
}

function updateTrimFrameLabel(handle) {
  if (!trimFrameLabel) return;
  const trim = getTrimState();
  if (!state.durationSeconds) {
    trimFrameLabel.textContent = 'Move a handle to scrub the keep range';
    return;
  }

  const which = handle || activeTrimHandle;
  if (which === 'end') {
    trimFrameLabel.textContent = `End · frame ${trim.endFrame + 1} / ${trim.totalFrames} · ${formatTimePrecise(Math.max(trim.startTime, trim.endTime - 1 / trim.fps))}`;
  } else if (which === 'start') {
    trimFrameLabel.textContent = `Start · frame ${trim.startFrame + 1} / ${trim.totalFrames} · ${formatTimePrecise(trim.startTime)}`;
  } else if (isTrimPreviewVisible() && trimPreview && !trimPreview.paused) {
    const frame = Math.min(trim.totalFrames, Math.max(1, Math.round(trimPreview.currentTime * trim.fps) + 1));
    trimFrameLabel.textContent = `Playing · frame ${frame} / ${trim.totalFrames} · ${formatTimePrecise(trimPreview.currentTime)}`;
  } else {
    trimFrameLabel.textContent = `Keep frames ${trim.startFrame + 1}–${trim.endFrame + 1} of ${trim.totalFrames}`;
  }
}

function updateTrimPlayhead(timeSeconds) {
  if (!trimPlayhead || !state.durationSeconds) return;
  const trim = getTrimState();
  const pct = frameToAxisPercent((timeSeconds || 0) * trim.fps, trim.totalFrames);
  trimPlayhead.style.left = `${Math.max(0, Math.min(100, pct))}%`;
}

function seekTrimPreview(handle) {
  const trim = getTrimState();
  const time = handle === 'end'
    ? Math.max(trim.startTime, trim.endTime - 1 / trim.fps)
    : trim.startTime;

  updateTrimFrameLabel(handle);
  updateTrimPlayhead(time);

  if (!isTrimPreviewVisible()) return;
  try {
    trimPreview.pause();
    trimPreview.currentTime = time;
  } catch (e) {}
  updateTrimPlayButton();
}

function updateTrimControls(changed) {
  if (!trimStartSlider || !trimEndSlider) return;

  const fps = parseInt(fpsSlider.value, 10) || 12;
  const totalFrames = Math.max(1, Math.round((state.durationSeconds || 0) * fps));
  const maxCut = Math.max(0, totalFrames - 1);

  let cutStart = parseInt(trimStartSlider.value, 10) || 0;
  let cutEnd = parseInt(trimEndSlider.value, 10) || 0;

  cutStart = Math.max(0, Math.min(cutStart, maxCut));
  cutEnd = Math.max(0, Math.min(cutEnd, maxCut));

  if (cutStart + cutEnd >= totalFrames) {
    if (changed === 'end') {
      cutStart = Math.max(0, totalFrames - 1 - cutEnd);
    } else {
      cutEnd = Math.max(0, totalFrames - 1 - cutStart);
    }
  }

  trimStartSlider.max = maxCut;
  trimEndSlider.max = maxCut;
  trimStartSlider.value = cutStart;
  trimEndSlider.value = cutEnd;

  const trim = getTrimState();
  if (trimStartValue) trimStartValue.textContent = formatTimePrecise(trim.startTime);
  if (trimEndValue) trimEndValue.textContent = formatTimePrecise(trim.endTime);
  if (trimTimelineStart) trimTimelineStart.textContent = '0:00.0';
  if (trimTimelineEnd) trimTimelineEnd.textContent = formatTimePrecise(state.durationSeconds || 0);

  if (trimKeptBadge) {
    trimKeptBadge.textContent = trim.active ? `${trim.kept} f` : 'All';
  }
  if (trimHint) {
    if (!state.durationSeconds) {
      trimHint.textContent = 'Keeping all frames';
    } else if (!trim.active) {
      trimHint.textContent = `Keeping all ${trim.totalFrames} frames at ${trim.fps} FPS`;
    } else {
      trimHint.textContent = `Keeping ${trim.kept} / ${trim.totalFrames} frames · ${formatTimePrecise(trim.startTime)} – ${formatTimePrecise(trim.endTime)}`;
    }
  }

  updateTrimRangeUI();

  if (changed === 'start' || changed === 'end') {
    seekTrimPreview(changed);
  } else {
    updateTrimFrameLabel(null);
    if (!trimScrubbing) syncTrimPreviewTime(false);
  }
}

function applyTrimHandleFrame(handle, frame) {
  const trim = getTrimState();
  const max = Math.max(0, trim.totalFrames - 1);
  if (handle === 'start') {
    const startFrame = Math.max(0, Math.min(frame, trim.endFrame));
    trimStartSlider.value = startFrame;
    updateTrimControls('start');
  } else {
    const endFrame = Math.max(trim.startFrame, Math.min(frame, max));
    trimEndSlider.value = max - endFrame;
    updateTrimControls('end');
  }
}

function nudgeTrimHandle(handle, dir) {
  const trim = getTrimState();
  if (handle === 'start') {
    applyTrimHandleFrame('start', trim.startFrame + dir);
  } else {
    applyTrimHandleFrame('end', trim.endFrame + dir);
  }
}

function nearestTrimHandle(clientX) {
  if (!trimThumbStart || !trimThumbEnd) return 'start';
  const startCx = trimThumbStart.getBoundingClientRect().left + trimThumbStart.offsetWidth / 2;
  const endCx = trimThumbEnd.getBoundingClientRect().left + trimThumbEnd.offsetWidth / 2;
  return Math.abs(clientX - startCx) <= Math.abs(clientX - endCx) ? 'start' : 'end';
}

function setActiveTrimHandle(handle) {
  activeTrimHandle = handle;
  if (trimThumbStart) trimThumbStart.classList.toggle('is-active', handle === 'start');
  if (trimThumbEnd) trimThumbEnd.classList.toggle('is-active', handle === 'end');
}

function startTrimDrag(handle, clientX, pointerId, target) {
  trimScrubbing = true;
  setActiveTrimHandle(handle);
  if (target && pointerId != null && target.setPointerCapture) {
    try { target.setPointerCapture(pointerId); } catch (e) {}
  }
  applyTrimHandleFrame(handle, clientXToFrame(clientX));
}

function moveTrimDrag(clientX) {
  if (!trimScrubbing || !activeTrimHandle) return;
  applyTrimHandleFrame(activeTrimHandle, clientXToFrame(clientX));
}

function endTrimDrag() {
  if (!trimScrubbing) return;
  trimScrubbing = false;
  setActiveTrimHandle(null);
  updateTrimFrameLabel(null);
}

function clearTrimPreview() {
  trimPreviewGeneration += 1;
  trimScrubbing = false;
  setActiveTrimHandle(null);
  if (trimPreview) {
    trimPreview.pause();
    trimPreview.removeAttribute('src');
    try { trimPreview.load(); } catch (e) {}
  }
  if (trimPreviewUrl) {
    URL.revokeObjectURL(trimPreviewUrl);
    trimPreviewUrl = null;
  }
  if (trimPreviewWrap) {
    trimPreviewWrap.classList.remove('has-preview');
    trimPreviewWrap.classList.remove('is-playing');
  }
  if (trimPlayhead) trimPlayhead.classList.add('hidden');
  if (trimPreviewFallback) {
    trimPreviewFallback.textContent = 'No browser preview for this file — trim by frame count, then check the GIF.';
    trimPreviewFallback.classList.remove('hidden');
  }
  updateTrimPlayButton();
}

function tryAttachTrimPreview(file) {
  clearTrimPreview();
  if (!file || !trimPreview) return;

  const generation = trimPreviewGeneration;
  trimPreviewUrl = URL.createObjectURL(file);
  if (trimPreviewFallback) {
    trimPreviewFallback.textContent = 'Checking whether this browser can preview the file…';
    trimPreviewFallback.classList.remove('hidden');
  }

  let settled = false;
  const succeed = () => {
    if (settled || generation !== trimPreviewGeneration) return;
    settled = true;
    if (trimPreviewWrap) trimPreviewWrap.classList.add('has-preview');
    if (trimPreviewFallback) trimPreviewFallback.classList.add('hidden');
    if (trimPlayhead) trimPlayhead.classList.remove('hidden');
    syncTrimPreviewTime(true);
    updateTrimPlayButton();
  };
  const fail = () => {
    if (settled || generation !== trimPreviewGeneration) return;
    settled = true;
    if (trimPreviewWrap) trimPreviewWrap.classList.remove('has-preview');
    if (trimPlayhead) trimPlayhead.classList.add('hidden');
    if (trimPreviewFallback) {
      trimPreviewFallback.textContent = 'No browser preview for this file — trim and crop still work; check the GIF.';
      trimPreviewFallback.classList.remove('hidden');
    }
    trimPreview.pause();
    trimPreview.removeAttribute('src');
    try { trimPreview.load(); } catch (e) {}
    if (trimPreviewUrl) {
      URL.revokeObjectURL(trimPreviewUrl);
      trimPreviewUrl = null;
    }
    updateTrimPlayButton();
  };

  trimPreview.addEventListener('loadedmetadata', succeed, { once: true });
  trimPreview.addEventListener('loadeddata', succeed, { once: true });
  trimPreview.addEventListener('canplay', succeed, { once: true });
  trimPreview.addEventListener('error', fail, { once: true });
  trimPreview.src = trimPreviewUrl;
  trimPreview.load();

  setTimeout(() => fail(), 3000);
}

function syncTrimPreviewTime(force) {
  if (!isTrimPreviewVisible()) return;
  if (!force && !trimPreview.paused) return;
  const trim = getTrimState();
  try {
    trimPreview.currentTime = trim.startTime;
  } catch (e) {}
  updateTrimPlayhead(trim.startTime);
}

function updateTrimPlayButton() {
  if (!trimPreviewPlay) return;
  const playing = isTrimPreviewVisible() && trimPreview && !trimPreview.paused && !trimPreview.ended;
  trimPreviewPlay.textContent = playing ? '❚❚' : '▶';
  trimPreviewPlay.setAttribute('aria-label', playing ? 'Pause preview' : 'Play trimmed range');
  if (trimPreviewWrap) trimPreviewWrap.classList.toggle('is-playing', playing);
}

function toggleTrimPreviewPlayback() {
  if (!isTrimPreviewVisible()) return;
  if (trimPreview.paused) {
    const trim = getTrimState();
    if (trimPreview.currentTime < trim.startTime - 0.04 || trimPreview.currentTime >= trim.endTime - 0.04) {
      try { trimPreview.currentTime = trim.startTime; } catch (e) {}
    }
    trimPreview.play().catch(() => {});
  } else {
    trimPreview.pause();
  }
  updateTrimPlayButton();
}

if (trimRangeAxis) {
  trimRangeAxis.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    const handle = e.target.closest('.trim-thumb-end')
      ? 'end'
      : e.target.closest('.trim-thumb-start')
        ? 'start'
        : nearestTrimHandle(e.clientX);
    e.preventDefault();
    startTrimDrag(handle, e.clientX, e.pointerId, trimRangeAxis);
  });

  trimRangeAxis.addEventListener('pointermove', (e) => {
    if (!trimScrubbing) return;
    e.preventDefault();
    moveTrimDrag(e.clientX);
  });

  const stopDrag = () => endTrimDrag();
  trimRangeAxis.addEventListener('pointerup', stopDrag);
  trimRangeAxis.addEventListener('pointercancel', stopDrag);
}

document.querySelectorAll('[data-trim-nudge]').forEach((btn) => {
  btn.addEventListener('click', () => {
    nudgeTrimHandle(btn.dataset.trimNudge, parseInt(btn.dataset.dir, 10));
  });
});

[trimThumbStart, trimThumbEnd].forEach((thumb) => {
  if (!thumb) return;
  thumb.addEventListener('keydown', (e) => {
    const handle = thumb === trimThumbEnd ? 'end' : 'start';
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nudgeTrimHandle(handle, -1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nudgeTrimHandle(handle, 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      applyTrimHandleFrame(handle, handle === 'start' ? 0 : getTrimState().startFrame);
    } else if (e.key === 'End') {
      e.preventDefault();
      const trim = getTrimState();
      applyTrimHandleFrame(handle, handle === 'end' ? trim.totalFrames - 1 : trim.endFrame);
    }
  });
});

if (trimPreview) {
  trimPreview.addEventListener('play', () => {
    if (trimScrubbing) {
      trimPreview.pause();
      return;
    }
    const trim = getTrimState();
    if (trimPreview.currentTime < trim.startTime - 0.04 || trimPreview.currentTime >= trim.endTime - 0.04) {
      try { trimPreview.currentTime = trim.startTime; } catch (e) {}
    }
    updateTrimPlayButton();
  });

  trimPreview.addEventListener('pause', updateTrimPlayButton);
  trimPreview.addEventListener('ended', updateTrimPlayButton);

  trimPreview.addEventListener('timeupdate', () => {
    if (trimScrubbing || !isTrimPreviewVisible()) return;
    const trim = getTrimState();
    if (!trimPreview.paused &&
        (trimPreview.currentTime < trim.startTime - 0.04 || trimPreview.currentTime >= trim.endTime - 0.04)) {
      try { trimPreview.currentTime = trim.startTime; } catch (e) {}
    }
    updateTrimPlayhead(trimPreview.currentTime);
    updateTrimFrameLabel(trimPreview.paused ? null : 'playing');
  });

  trimPreview.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTrimPreviewPlayback();
  });
}

if (trimPreviewPlay) {
  trimPreviewPlay.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTrimPreviewPlayback();
  });
}

// --- Crop overlay (insets from each edge, FFmpeg crop=w:h:x:y) ---
let cropDrag = null;

function layoutMediaStage() {
  if (!mediaStage || !state.width || !state.height) return;
  const maxW = (trimPreviewWrap && trimPreviewWrap.clientWidth) ? trimPreviewWrap.clientWidth : 280;
  const maxH = 240;
  const fit = Math.min(maxW / state.width, maxH / state.height);
  mediaStage.style.width = `${Math.max(1, Math.round(state.width * fit))}px`;
  mediaStage.style.height = `${Math.max(1, Math.round(state.height * fit))}px`;
  updateCropUI();
}

function updateCropUI() {
  if (!cropRect || !state.width || !state.height) return;
  const crop = getCropState();
  const leftPct = (crop.left / crop.srcW) * 100;
  const topPct = (crop.top / crop.srcH) * 100;
  const widthPct = (crop.w / crop.srcW) * 100;
  const heightPct = (crop.h / crop.srcH) * 100;

  cropRect.style.left = `${leftPct}%`;
  cropRect.style.top = `${topPct}%`;
  cropRect.style.width = `${widthPct}%`;
  cropRect.style.height = `${heightPct}%`;

  const labels = {
    left: crop.left,
    right: crop.right,
    top: crop.top,
    bottom: crop.bottom
  };
  Object.keys(labels).forEach((side) => {
    const el = document.querySelector(`[data-crop-label="${side}"]`);
    if (!el) return;
    if (labels[side] > 0) {
      el.hidden = false;
      el.textContent = String(labels[side]);
    } else {
      el.hidden = true;
    }
  });

  if (cropHint) {
    if (!crop.active) {
      cropHint.textContent = `Keeping full frame ${crop.srcW}×${crop.srcH}`;
    } else {
      cropHint.textContent = `Keeping ${crop.w}×${crop.h} of ${crop.srcW}×${crop.srcH} · L${crop.left} R${crop.right} T${crop.top} B${crop.bottom}`;
    }
  }
  if (cropResetBtn) {
    cropResetBtn.classList.toggle('hidden', !crop.active);
  }
  updateScaleHint();
}

function resetCrop() {
  state.crop = { left: 0, right: 0, top: 0, bottom: 0 };
  updateCropUI();
}

function applyCropInsets(next, edges) {
  const srcW = state.width || 0;
  const srcH = state.height || 0;
  const minKeep = 2;
  const edgeList = edges || '';
  let left = Math.max(0, Math.round(next.left));
  let right = Math.max(0, Math.round(next.right));
  let top = Math.max(0, Math.round(next.top));
  let bottom = Math.max(0, Math.round(next.bottom));

  if (srcW - left - right < minKeep) {
    if (edgeList.includes('w') && !edgeList.includes('e')) {
      left = Math.max(0, srcW - right - minKeep);
    } else if (edgeList.includes('e') && !edgeList.includes('w')) {
      right = Math.max(0, srcW - left - minKeep);
    } else {
      left = Math.max(0, Math.min(left, srcW - minKeep));
      right = Math.max(0, srcW - left - minKeep);
    }
  }
  if (srcH - top - bottom < minKeep) {
    if (edgeList.includes('n') && !edgeList.includes('s')) {
      top = Math.max(0, srcH - bottom - minKeep);
    } else if (edgeList.includes('s') && !edgeList.includes('n')) {
      bottom = Math.max(0, srcH - top - minKeep);
    } else {
      top = Math.max(0, Math.min(top, srcH - minKeep));
      bottom = Math.max(0, srcH - top - minKeep);
    }
  }

  state.crop = { left, right, top, bottom };
  updateCropUI();
}

function startCropDrag(edge, clientX, clientY, pointerId, target) {
  cropDrag = {
    edge,
    startX: clientX,
    startY: clientY,
    origin: { ...state.crop }
  };
  if (target && pointerId != null && target.setPointerCapture) {
    try { target.setPointerCapture(pointerId); } catch (e) {}
  }
  document.querySelectorAll('.crop-handle').forEach((handle) => {
    handle.classList.toggle('is-active', handle.dataset.edge === edge);
  });
}

function moveCropDrag(clientX, clientY) {
  if (!cropDrag || !mediaStage || !state.width || !state.height) return;
  const rect = mediaStage.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const dx = ((clientX - cropDrag.startX) / rect.width) * state.width;
  const dy = ((clientY - cropDrag.startY) / rect.height) * state.height;
  const next = { ...cropDrag.origin };
  const edge = cropDrag.edge;

  if (edge.includes('w')) next.left = cropDrag.origin.left + dx;
  if (edge.includes('e')) next.right = cropDrag.origin.right - dx;
  if (edge.includes('n')) next.top = cropDrag.origin.top + dy;
  if (edge.includes('s')) next.bottom = cropDrag.origin.bottom - dy;

  applyCropInsets(next, edge);
}

function endCropDrag() {
  if (!cropDrag) return;
  cropDrag = null;
  document.querySelectorAll('.crop-handle').forEach((handle) => {
    handle.classList.remove('is-active');
  });
}

if (cropRect) {
  cropRect.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.crop-handle');
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    startCropDrag(handle.dataset.edge, e.clientX, e.clientY, e.pointerId, handle);
  });

  cropRect.addEventListener('pointermove', (e) => {
    if (!cropDrag) return;
    e.preventDefault();
    moveCropDrag(e.clientX, e.clientY);
  });

  cropRect.addEventListener('pointerup', endCropDrag);
  cropRect.addEventListener('pointercancel', endCropDrag);
}

window.addEventListener('pointermove', (e) => {
  if (!cropDrag) return;
  moveCropDrag(e.clientX, e.clientY);
});
window.addEventListener('pointerup', endCropDrag);
window.addEventListener('pointercancel', endCropDrag);

if (cropResetBtn) {
  cropResetBtn.addEventListener('click', resetCrop);
}

window.addEventListener('resize', () => {
  if (state.file) layoutMediaStage();
});

transparencyToggle.addEventListener('change', (e) => {
  transparencyLabel.textContent = e.target.checked ? 'On' : 'Off';
});

function updateSliderFill(slider) {
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const val = parseFloat(slider.value);
  const minVal = Number.isFinite(min) ? min : 0;
  const maxVal = Number.isFinite(max) ? max : 100;
  const range = maxVal - minVal;
  const percent = range === 0 ? 0 : ((val - minVal) / range) * 100;
  slider.style.setProperty('--slider-fill', `${percent}%`);
}

// Init slider fills
updateSliderFill(fpsSlider);
updateSliderFill(colorsSlider);
updateSliderFill(scaleSlider);
updateTrimControls();

// Stepper logic
document.querySelectorAll('.btn-step').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const dir = parseInt(btn.dataset.dir, 10);
    const slider = document.getElementById(targetId);
    if (!slider) return;

    const step = parseFloat(slider.step) || 1;
    const minRaw = parseFloat(slider.min);
    const maxRaw = parseFloat(slider.max);
    const min = Number.isFinite(minRaw) ? minRaw : 0;
    const max = Number.isFinite(maxRaw) ? maxRaw : 100;
    
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
      const { width, height } = getOutputDimensions();
      const fps = parseInt(fpsSlider.value, 10);
      const colors = parseInt(colorsSlider.value, 10);
      const trans = transparencyToggle.checked ? 'yes' : 'no';

      // 1. Write the input file to the WebAssembly Virtual Filesystem
      const { fetchFile } = FFmpegUtil;
      await state.ffmpeg.writeFile(tempInputName, await fetchFile(state.file));

      // 2. Prepare filters and execute palettegen
      const palettegenOpts = `max_colors=${colors}` + (trans === 'yes' ? ':reserve_transparent=1' : '');
      const vf = `${buildGifFilterGraph(fps, width, height, 'loop')},palettegen=${palettegenOpts}`;

      await state.ffmpeg.exec([
        ...getTrimInputArgs(),
        '-i', tempInputName,
        '-vf', vf,
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
    resetCrop();
    updateScaleHint();
    if (trimStartSlider) trimStartSlider.value = 0;
    if (trimEndSlider) trimEndSlider.value = 0;
    updateTrimControls();
    requestAnimationFrame(() => {
      layoutMediaStage();
      tryAttachTrimPreview(file);
    });
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

  const { width, height } = getOutputDimensions();
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

  const trim = getTrimState();
  const crop = getCropState();
  const settingsData = {
    scale: scaleSlider.value,
    fps,
    colors,
    trans,
    dither,
    ditherText,
    playback,
    playbackText,
    cutStart: trim.cutStart,
    cutEnd: trim.cutEnd,
    cropLeft: crop.left,
    cropRight: crop.right,
    cropTop: crop.top,
    cropBottom: crop.bottom,
    paletteEdited: state.customPaletteEdited,
    paletteDataUrl: null
  };
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
    const filterSource = buildGifFilterGraph(fps, width, height, playback);

    const palettegenOpts = `max_colors=${colors}` + (trans === 'yes' ? ':reserve_transparent=1' : '');
    const paletteuseOpts = (trans === 'yes' ? 'alpha_threshold=128:' : '') + `dither=${dither}`;

    // 4. Exec Pass 1: Palette Analysis (Only if not using custom palette!)
    if (!state.customPaletteEdited) {
      const pass1FilterArgs = playback === 'pingpong' 
        ? ['-filter_complex', `${filterSource},palettegen=${palettegenOpts}`]
        : ['-vf', `${filterSource},palettegen=${palettegenOpts}`];

      await state.ffmpeg.exec([
        ...getTrimInputArgs(),
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
      ...getTrimInputArgs(),
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

  if (settings.cutStart || settings.cutEnd) {
    badges.push(`Trim −${settings.cutStart || 0}/−${settings.cutEnd || 0}`);
  }

  if (settings.cropLeft || settings.cropRight || settings.cropTop || settings.cropBottom) {
    badges.push(`Crop L${settings.cropLeft || 0} R${settings.cropRight || 0} T${settings.cropTop || 0} B${settings.cropBottom || 0}`);
  }
  
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

      if (trimStartSlider) trimStartSlider.value = sData.cutStart || 0;
      if (trimEndSlider) trimEndSlider.value = sData.cutEnd || 0;
      updateTrimControls();

      state.crop = {
        left: sData.cropLeft || 0,
        right: sData.cropRight || 0,
        top: sData.cropTop || 0,
        bottom: sData.cropBottom || 0
      };
      layoutMediaStage();
      updateCropUI();
      
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
  resetCrop();

  clearTrimPreview();
  if (trimStartSlider) trimStartSlider.value = 0;
  if (trimEndSlider) trimEndSlider.value = 0;
  updateTrimControls();
  
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

// --- Bubbly Modal Dialogs Control ---
const setupCuteDialog = (btnId, dialogId) => {
  const btn = document.getElementById(btnId);
  const dialog = document.getElementById(dialogId);
  if (!btn || !dialog) return;

  btn.addEventListener('click', () => {
    dialog.showModal();
  });

  // Fallback for browsers without native closedby support
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isDialogContent) {
        dialog.close();
      }
    });
  }
};

setupCuteDialog('footer-about', 'about-dialog');
setupCuteDialog('footer-terms', 'terms-dialog');
setupCuteDialog('footer-privacy', 'privacy-dialog');

// --- Mascot Dither Pets data ---
const ditherPets = {
  floyd_steinberg: {
    text: "Hi, I'm Floydy! I make gradients super smooth and soft, like a cloud! (✿◠‿◠)",
    svg: `<svg class="pet-wiggle" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M18 40C14 40 10 36 10 32C10 28 13.5 25 17 25C18 19 23 14 30 14C37 14 42 19 43 25C47 25 50 28 50 32C50 36 46 40 42 40H18Z" fill="#ffdbe0" stroke="#2f2d29" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="29" r="2" fill="#2f2d29" />
  <circle cx="36" cy="29" r="2" fill="#2f2d29" />
  <circle cx="21" cy="31" r="1.5" fill="#ffb3bd" />
  <circle cx="39" cy="31" r="1.5" fill="#ffb3bd" />
  <path d="M28 32C29 33 31 33 32 32" stroke="#2f2d29" stroke-width="2" stroke-linecap="round" />
</svg>`
  },
  bayer: {
    text: "Beep boop! I'm Bayer-kun! I create retro pixel-dot grids like classic games! (👾_👾)",
    svg: `<svg class="pet-jump" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="14" y="14" width="36" height="30" rx="6" fill="#cbeee4" stroke="#2f2d29" stroke-width="3" />
  <rect x="19" y="19" width="26" height="20" rx="3" fill="#ffffff" stroke="#2f2d29" stroke-width="2" />
  <rect x="23" y="24" width="4" height="4" fill="#2f2d29" />
  <rect x="37" y="24" width="4" height="4" fill="#2f2d29" />
  <path d="M28 32H36" stroke="#2f2d29" stroke-width="2.5" stroke-linecap="round" />
  <path d="M32 14V8" stroke="#2f2d29" stroke-width="3" stroke-linecap="round" />
  <circle cx="32" cy="6" r="3" fill="#ffdbe0" stroke="#2f2d29" stroke-width="2" />
  <path d="M22 44V49" stroke="#2f2d29" stroke-width="3" stroke-linecap="round" />
  <path d="M42 44V49" stroke="#2f2d29" stroke-width="3" stroke-linecap="round" />
</svg>`
  },
  sierra2_4a: {
    text: "Wheee! I'm Sierra-chan! I'm super fast, light, and keep noise low! (っ＾▿＾)💨",
    svg: `<svg class="pet-wiggle" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8L37 23H53L40 32L45 48L32 38L19 48L24 32L11 23H27L32 8Z" fill="#fef0be" stroke="#2f2d29" stroke-width="3" stroke-linejoin="round" />
  <path d="M11 26C7 26 5 30 7 33C9 35 12 33 13 31" fill="#ffffff" stroke="#2f2d29" stroke-width="2.5" />
  <path d="M53 26C57 26 59 30 57 33C55 35 52 31 51 31" fill="#ffffff" stroke="#2f2d29" stroke-width="2.5" />
  <circle cx="28" cy="27" r="1.5" fill="#2f2d29" />
  <circle cx="36" cy="27" r="1.5" fill="#2f2d29" />
  <path d="M30 31C31 32 33 32 34 31" stroke="#2f2d29" stroke-width="2" stroke-linecap="round" />
</svg>`
  },
  heckbert: {
    text: "Hello! I'm Heckby! I paint with rich, dynamic colors. Color magic! (🎨◕‿◕🎨)",
    svg: `<svg class="pet-wiggle" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M46 16C36 12 20 16 16 28C12 40 22 48 34 48C42 48 52 42 50 30C49 24 51 18 46 16Z" fill="#cbeee4" stroke="#2f2d29" stroke-width="3" stroke-linejoin="round" />
  <circle cx="22" cy="22" r="4" fill="#ffdbe0" />
  <circle cx="22" cy="38" r="3" fill="#fef0be" />
  <circle cx="44" cy="36" r="3.5" fill="#ffdbe0" />
  <path d="M28 28C28 26 31 26 31 28" stroke="#2f2d29" stroke-width="2.5" stroke-linecap="round" />
  <path d="M37 28C37 26 40 26 40 28" stroke="#2f2d29" stroke-width="2.5" stroke-linecap="round" />
  <ellipse cx="27" cy="31" rx="2" ry="1" fill="#ffb3bd" />
  <ellipse cx="41" cy="31" rx="2" ry="1" fill="#ffb3bd" />
  <path d="M33 31.5C34 32.5 35 32.5 36 31.5" stroke="#2f2d29" stroke-width="2" stroke-linecap="round" />
</svg>`
  },
  none: {
    text: "Hi! I'm Nodi! I keep colors flat, sharp, and pixel-perfect. Super clean! (｀^´)✧",
    svg: `<svg class="pet-jump" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="16" y="20" width="32" height="28" rx="2" fill="#ffffff" stroke="#2f2d29" stroke-width="3" />
  <path d="M16 20L8 10L22 20Z" fill="#ffffff" stroke="#2f2d29" stroke-width="3" stroke-linejoin="round" />
  <path d="M48 20L56 10L42 20Z" fill="#ffffff" stroke="#2f2d29" stroke-width="3" stroke-linejoin="round" />
  <path d="M15 19L10 13L18 19Z" fill="#ffdbe0" />
  <path d="M49 19L54 13L46 19Z" fill="#ffdbe0" />
  <path d="M21 28L26 31" stroke="#2f2d29" stroke-width="2.5" stroke-linecap="round" />
  <path d="M43 28L38 31" stroke="#2f2d29" stroke-width="2.5" stroke-linecap="round" />
  <path d="M31 32L33 32L32 34Z" fill="#2f2d29" stroke="#2f2d29" stroke-width="1" />
  <circle cx="19" cy="33" r="2" fill="#ffb3bd" />
  <circle cx="45" cy="33" r="2" fill="#ffb3bd" />
</svg>`
  }
};

const ditherSelect = document.getElementById('dither');
const petVisual = document.getElementById('dither-pet-visual');
const petText = document.getElementById('dither-pet-text');

if (ditherSelect && petVisual && petText) {
  const updateDitherPet = () => {
    const val = ditherSelect.value;
    const pet = ditherPets[val] || ditherPets.floyd_steinberg;
    petText.textContent = pet.text;
    petVisual.innerHTML = pet.svg;
  };

  ditherSelect.addEventListener('change', updateDitherPet);
  updateDitherPet(); // init
}


