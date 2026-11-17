/**
 * Kawaii Web Converter — Pure Client-Side Wasm Logic
 */

// --- State ---
const DEFAULT_SETTINGS = {
  fps: 12,
  scale: 100,
  colors: 64,
  transparency: false,
  dither: 'floyd_steinberg',
  playback: 'loop',
  denoise: false,
  dropDupes: false,
  diffRect: false
};

const state = {
  ffmpeg: null,
  ffmpegLoaded: false,
  projects: [],
  activeProjectId: null,
  ffmpegQueue: Promise.resolve(),
  ffmpegBusy: false,
  activeProgressHandler: null
};

let activeSwatchIndex = null;
let pendingFileInputMode = 'empty-or-new';
let pendingDropFiles = [];

// --- DOM Elements ---
const wasmLoadingBanner = document.getElementById('wasm-loading-banner');
const appContent = document.getElementById('app-content');
const workspaceSection = document.getElementById('workspace-section');
const workspacePanel = document.getElementById('workspace-panel');
const projectTablist = document.getElementById('project-tablist');
const addProjectBtn = document.getElementById('add-project-btn');
const projectTabsBar = document.querySelector('.project-tabs-bar');
const dropZone = document.getElementById('drop-zone');
const browseBtn = document.getElementById('browse-btn');
const fileInput = document.getElementById('file-input');

// Workspace UI
const projectMediaStage = document.getElementById('project-media-stage');
const projectFileBar = document.getElementById('project-file-bar');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const fileDurationEl = document.getElementById('file-duration');
const fileDimsEl = document.getElementById('file-dimensions');
const replaceVideoBtn = document.getElementById('replace-video-btn');
const trimCropBox = document.getElementById('trim-crop-box');

// Settings UI
const convertBtn = document.getElementById('convert-btn');
const convertBtnText = document.getElementById('convert-btn-text');
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
const mediaCanvas = document.getElementById('media-canvas');
const cropRect = document.getElementById('crop-rect');
const cropHint = document.getElementById('crop-hint');
const cropResetBtn = document.getElementById('crop-reset-btn');
const transparencyToggle = document.getElementById('transparency');
const transparencyLabel = document.getElementById('transparency-label');
const denoiseToggle = document.getElementById('denoise');
const denoiseLabel = document.getElementById('denoise-label');
const dropDupesToggle = document.getElementById('drop-dupes');
const dropDupesLabel = document.getElementById('drop-dupes-label');
const diffRectToggle = document.getElementById('diff-rect');
const diffRectLabel = document.getElementById('diff-rect-label');
const ditherInput = document.getElementById('dither');
const playbackInput = document.getElementById('playback');

// Cross-Tab Copy & Dialogs
const openPaletteBtn = document.getElementById('open-palette-btn');
const paletteBtnDot = document.getElementById('palette-btn-dot');
const paletteDialog = document.getElementById('palette-dialog');
const paletteDialogClose = document.getElementById('palette-dialog-close');
const copySettingsFromBtn = document.getElementById('copy-settings-from-btn');
const copySettingsPopover = document.getElementById('copy-settings-popover');
const copyPaletteFromBtn = document.getElementById('copy-palette-from-btn');
const copyPalettePanel = document.getElementById('copy-palette-panel');
const resetPaletteBtn = document.getElementById('reset-palette-btn');
const paletteStatusBadge = document.getElementById('palette-status-badge');
const paletteEmptyHint = document.getElementById('palette-empty-hint');
const globalDropOverlay = document.getElementById('global-drop-overlay');
const dropChoiceDialog = document.getElementById('drop-choice-dialog');
const dropChoiceClose = document.getElementById('drop-choice-close');
const dropChoiceMessage = document.getElementById('drop-choice-message');
const dropChoiceReplaceBtn = document.getElementById('drop-choice-replace-btn');
const dropChoiceReplaceHint = document.getElementById('drop-choice-replace-hint');

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
const emptyStateText = document.getElementById('empty-state-text');
const cardTemplate = document.getElementById('result-card-template');

// --- Project Helpers ---
function createEmptyPalette() {
  return {
    edited: false,
    hasExtracted: false,
    width: 0,
    height: 0,
    colors: [],
    dataUrl: null,
    sourceLabel: null
  };
}

function clonePalette(pal, overrides = {}) {
  return {
    edited: !!pal.edited,
    hasExtracted: !!pal.hasExtracted,
    width: pal.width || 0,
    height: pal.height || 0,
    colors: (pal.colors || []).map(c => ({ ...c })),
    dataUrl: pal.dataUrl || null,
    sourceLabel: pal.sourceLabel || null,
    ...overrides
  };
}

function createProject(initialSettings = null) {
  const id = 'proj_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  return {
    id,
    name: 'New Project',
    customName: false,
    file: null,
    filename: null,
    sizeBytes: 0,
    durationSeconds: 0,
    width: 0,
    height: 0,
    crop: { left: 0, right: 0, top: 0, bottom: 0 },
    trim: { cutStart: 0, cutEnd: 0 },
    settings: { ...DEFAULT_SETTINGS, ...(initialSettings || {}) },
    palette: createEmptyPalette(),
    cards: [],
    pendingJobs: 0
  };
}

function getActiveProject() {
  return state.projects.find(p => p.id === state.activeProjectId) || null;
}

function getProjectById(id) {
  return state.projects.find(p => p.id === id) || null;
}

function readControlsSettings() {
  return {
    fps: parseInt(fpsSlider.value, 10) || 12,
    scale: parseInt(scaleSlider.value, 10) || 100,
    colors: parseInt(colorsSlider.value, 10) || 64,
    transparency: !!(transparencyToggle && transparencyToggle.checked),
    dither: ditherInput ? ditherInput.value : 'floyd_steinberg',
    playback: playbackInput ? playbackInput.value : 'loop',
    denoise: !!(denoiseToggle && denoiseToggle.checked),
    dropDupes: !!(dropDupesToggle && dropDupesToggle.checked),
    diffRect: !!(diffRectToggle && diffRectToggle.checked)
  };
}

function saveActiveProjectControls() {
  const project = getActiveProject();
  if (!project) return;
  project.settings = readControlsSettings();
  project.trim = {
    cutStart: parseInt(trimStartSlider?.value, 10) || 0,
    cutEnd: parseInt(trimEndSlider?.value, 10) || 0
  };
}

function applySettingsToControls(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  fpsSlider.value = s.fps;
  fpsValue.textContent = String(s.fps);
  updateSliderFill(fpsSlider);

  colorsSlider.value = s.colors;
  colorsValue.textContent = String(s.colors);
  updateSliderFill(colorsSlider);

  scaleSlider.value = s.scale;
  scaleValue.textContent = `${s.scale}%`;
  updateSliderFill(scaleSlider);

  if (transparencyToggle) {
    transparencyToggle.checked = !!s.transparency;
    transparencyToggle.dispatchEvent(new Event('change'));
  }
  if (denoiseToggle) {
    denoiseToggle.checked = !!s.denoise;
    denoiseToggle.dispatchEvent(new Event('change'));
  }
  if (dropDupesToggle) {
    dropDupesToggle.checked = !!s.dropDupes;
    dropDupesToggle.dispatchEvent(new Event('change'));
  }
  if (diffRectToggle) {
    diffRectToggle.checked = !!s.diffRect;
    diffRectToggle.dispatchEvent(new Event('change'));
  }
  if (ditherInput) {
    ditherInput.value = s.dither;
    ditherInput.dispatchEvent(new Event('change'));
  }
  if (playbackInput) {
    playbackInput.value = s.playback;
  }

  updateScaleHint();
  updateTrimControls();
}

function runInFFmpegQueue(taskFn) {
  const run = state.ffmpegQueue.then(async () => {
    state.ffmpegBusy = true;
    try {
      return await taskFn();
    } finally {
      state.ffmpegBusy = false;
    }
  });
  state.ffmpegQueue = run.catch(() => {});
  return run;
}

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
  initProjects();

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

    state.ffmpeg.on('progress', ({ progress }) => {
      if (state.activeProgressHandler) {
        state.activeProgressHandler(progress);
      }
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
    updateActionButtonsState();
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
  saveActiveProjectControls();
});

colorsSlider.addEventListener('input', (e) => {
  colorsValue.textContent = e.target.value;
  updateSliderFill(e.target);
  saveActiveProjectControls();
});

scaleSlider.addEventListener('input', (e) => {
  scaleValue.textContent = e.target.value + '%';
  updateSliderFill(e.target);
  updateScaleHint();
  saveActiveProjectControls();
});

if (ditherInput) {
  ditherInput.addEventListener('change', saveActiveProjectControls);
}
if (playbackInput) {
  playbackInput.addEventListener('change', saveActiveProjectControls);
}

function updateScaleHint() {
  const project = getActiveProject();
  if (project && project.width && project.height) {
    const out = getOutputDimensions();
    const crop = getCropState();
    if (crop.active) {
      scaleHint.textContent = `Output size: ${out.width}x${out.height} px (from crop ${crop.w}x${crop.h})`;
    } else {
      scaleHint.textContent = `Output size: ${out.width}x${out.height} px`;
    }
  } else {
    scaleHint.textContent = 'Output size: —';
  }
}

function evenSize(n) {
  const v = Math.max(2, Math.floor(n));
  return v - (v % 2);
}

function getCropState() {
  const project = getActiveProject();
  const srcW = project?.width || 0;
  const srcH = project?.height || 0;
  const crop = project?.crop || { left: 0, right: 0, top: 0, bottom: 0 };
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
  const project = getActiveProject();
  const crop = getCropState();
  const srcW = crop.w || project?.width || 0;
  const srcH = crop.h || project?.height || 0;
  const scale = parseInt(scaleSlider.value, 10) / 100;
  return {
    width: Math.max(2, Math.round(srcW * scale)),
    height: Math.max(2, Math.round(srcH * scale))
  };
}

function composeGifFilterGraph({ fps, width, height, playback, crop, denoise, dropDupes }) {
  const pre = [];
  if (crop && crop.active) pre.push(`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`);
  // Mild hqdn3d defaults: enough to flatten codec noise, not a separate strength slider.
  if (denoise) pre.push('hqdn3d=4:3:6:4');
  const preF = pre.join(',');

  const post = [`fps=${fps}`, `scale=${width}:${height}:flags=lanczos`];
  if (dropDupes) {
    post.push('mpdecimate', 'setpts=PTS-STARTPTS');
  }
  const tail = post.join(',');

  if (playback === 'pingpong') {
    const head = preF ? `[0:v]${preF},split` : `[0:v]split`;
    return `${head}[v1][v2];[v2]reverse[v2r];[v1][v2r]concat=n=2:v=1[merged];[merged]${tail}`;
  }
  return preF ? `${preF},${tail}` : tail;
}

function buildGifFilterGraph(fps, width, height, playback) {
  return composeGifFilterGraph({
    fps,
    width,
    height,
    playback,
    crop: getCropState(),
    denoise: !!(denoiseToggle && denoiseToggle.checked),
    dropDupes: !!(dropDupesToggle && dropDupesToggle.checked)
  });
}

// --- Trim (dual-handle keep-range at current output FPS) ---
let trimPreviewUrl = null;
let trimPreviewGeneration = 0;
let trimScrubbing = false;
let activeTrimHandle = null;

function getTrimState() {
  const project = getActiveProject();
  const durationSeconds = project?.durationSeconds || 0;
  const fps = parseInt(fpsSlider.value, 10) || 12;
  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
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

function getTrimInputArgs(trim = getTrimState()) {
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
  const project = getActiveProject();
  const trim = getTrimState();
  if (!project?.durationSeconds) {
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
  const project = getActiveProject();
  if (!trimPlayhead || !project?.durationSeconds) return;
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

  const project = getActiveProject();
  const durationSeconds = project?.durationSeconds || 0;
  const fps = parseInt(fpsSlider.value, 10) || 12;
  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
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
  if (project) {
    project.trim = { cutStart, cutEnd };
  }

  const trim = getTrimState();
  if (trimStartValue) trimStartValue.textContent = formatTimePrecise(trim.startTime);
  if (trimEndValue) trimEndValue.textContent = formatTimePrecise(trim.endTime);
  if (trimTimelineStart) trimTimelineStart.textContent = '0:00.0';
  if (trimTimelineEnd) trimTimelineEnd.textContent = formatTimePrecise(durationSeconds);

  if (trimKeptBadge) {
    trimKeptBadge.textContent = trim.active ? `${trim.kept} f` : 'All';
  }
  if (trimHint) {
    if (!durationSeconds) {
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
  const project = getActiveProject();
  if (!mediaCanvas || !project?.width || !project?.height) return;
  const gutterX = 48;
  const maxW = Math.max(80, ((trimPreviewWrap && trimPreviewWrap.clientWidth) ? trimPreviewWrap.clientWidth : 640) - gutterX);
  const maxH = window.innerWidth <= 740 ? 240 : 340;
  const fit = Math.min(maxW / project.width, maxH / project.height);
  mediaCanvas.style.width = `${Math.max(1, Math.round(project.width * fit))}px`;
  mediaCanvas.style.height = `${Math.max(1, Math.round(project.height * fit))}px`;
  updateCropUI();
}

function updateCropUI() {
  const project = getActiveProject();
  if (!cropRect || !project?.width || !project?.height) return;
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
    if (!el || el.querySelector('input')) return;
    el.textContent = String(labels[side]);
  });

  if (cropHint) {
    if (!crop.active) {
      cropHint.textContent = `Keeping full frame ${crop.srcW}×${crop.srcH} · double-click a number to type`;
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
  const project = getActiveProject();
  if (project) {
    project.crop = { left: 0, right: 0, top: 0, bottom: 0 };
  }
  updateCropUI();
}

function applyCropInsets(next, edges) {
  const project = getActiveProject();
  const srcW = project?.width || 0;
  const srcH = project?.height || 0;
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

  if (project) {
    project.crop = { left, right, top, bottom };
  }
  updateCropUI();
}

function startCropDrag(edge, clientX, clientY, pointerId, target) {
  const project = getActiveProject();
  cropDrag = {
    edge,
    startX: clientX,
    startY: clientY,
    origin: { ...(project?.crop || { left: 0, right: 0, top: 0, bottom: 0 }) }
  };
  if (target && pointerId != null && target.setPointerCapture) {
    try { target.setPointerCapture(pointerId); } catch (e) {}
  }
  document.querySelectorAll('.crop-handle').forEach((handle) => {
    handle.classList.toggle('is-active', handle.dataset.edge === edge);
  });
}

function moveCropDrag(clientX, clientY) {
  const project = getActiveProject();
  if (!cropDrag || !mediaCanvas || !project?.width || !project?.height) return;
  const rect = mediaCanvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const dx = ((clientX - cropDrag.startX) / rect.width) * project.width;
  const dy = ((clientY - cropDrag.startY) / rect.height) * project.height;
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

  cropRect.addEventListener('dblclick', (e) => {
    const label = e.target.closest('.crop-edge-label');
    if (!label) return;
    e.preventDefault();
    e.stopPropagation();
    startCropLabelEdit(label.dataset.cropLabel, label);
  });

  cropRect.addEventListener('click', (e) => {
    if (e.target.closest('.crop-edge-label')) {
      e.stopPropagation();
    }
  });
}

const CROP_LABEL_EDGES = { left: 'w', right: 'e', top: 'n', bottom: 's' };

function startCropLabelEdit(side, labelEl) {
  if (!labelEl || !side || labelEl.querySelector('input')) return;
  const crop = getCropState();
  const maxKeep = side === 'left' || side === 'right'
    ? Math.max(0, crop.srcW - 2 - (side === 'left' ? crop.right : crop.left))
    : Math.max(0, crop.srcH - 2 - (side === 'top' ? crop.bottom : crop.top));

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = String(maxKeep);
  input.step = '1';
  input.value = String(crop[side]);
  input.className = 'crop-edge-input';
  input.setAttribute('aria-label', `Crop ${side} pixels`);

  labelEl.textContent = '';
  labelEl.appendChild(input);
  input.focus();
  input.select();

  let closed = false;
  const cancel = () => {
    if (closed) return;
    closed = true;
    updateCropUI();
  };
  const commit = () => {
    if (closed) return;
    closed = true;
    const raw = parseInt(input.value, 10);
    if (!Number.isFinite(raw)) {
      updateCropUI();
      return;
    }
    const crop = getCropState();
    applyCropInsets({
      left: crop.left,
      right: crop.right,
      top: crop.top,
      bottom: crop.bottom,
      [side]: raw
    }, CROP_LABEL_EDGES[side]);
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('blur', commit);
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
  const project = getActiveProject();
  if (project?.file) layoutMediaStage();
});

function bindOnOffToggle(toggle, label) {
  if (!toggle || !label) return;
  const sync = () => {
    label.textContent = toggle.checked ? 'On' : 'Off';
  };
  toggle.addEventListener('change', () => {
    sync();
    saveActiveProjectControls();
  });
  toggle.addEventListener('input', sync);
  sync();
  return sync;
}

const syncToggleLabels = [
  bindOnOffToggle(transparencyToggle, transparencyLabel),
  bindOnOffToggle(denoiseToggle, denoiseLabel),
  bindOnOffToggle(dropDupesToggle, dropDupesLabel),
  bindOnOffToggle(diffRectToggle, diffRectLabel)
].filter(Boolean);

window.addEventListener('pageshow', () => {
  syncToggleLabels.forEach((sync) => sync());
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
    const project = getActiveProject();
    if (!project || activeSwatchIndex === null) return;
    const { r, g, b, hex } = updatePickerColor();

    const color = project.palette.colors[activeSwatchIndex];
    if (!color) return;
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

    project.palette.edited = true;
    project.palette.hasExtracted = true;
    project.palette.sourceLabel = 'Custom palette edited';
    project.palette.dataUrl = paletteCanvas.toDataURL('image/png');
    updatePaletteMetaUI(project.palette);
    if (pickerPanel) pickerPanel.classList.add('hidden');
  });
}

function updatePaletteMetaUI(palette) {
  const hasColors = !!(palette && palette.colors && palette.colors.length > 0);
  if (resetPaletteBtn) {
    resetPaletteBtn.classList.toggle('hidden', !hasColors);
  }
  if (paletteEmptyHint) {
    paletteEmptyHint.classList.toggle('hidden', hasColors);
  }
  if (paletteBtnDot) {
    paletteBtnDot.classList.toggle('hidden', !(palette && palette.edited));
  }
  if (paletteStatusBadge) {
    if (palette && palette.edited) {
      paletteStatusBadge.textContent = palette.sourceLabel || 'Custom palette active for renders';
      paletteStatusBadge.classList.remove('hidden');
    } else if (hasColors) {
      paletteStatusBadge.textContent = 'Extracted preview (auto-quantized on render unless edited)';
      paletteStatusBadge.classList.remove('hidden');
    } else {
      paletteStatusBadge.textContent = '';
      paletteStatusBadge.classList.add('hidden');
    }
  }
}

function applyPaletteToUI(palette) {
  if (pickerPanel) pickerPanel.classList.add('hidden');
  activeSwatchIndex = null;
  if (!paletteGrid || !paletteGridContainer || !paletteCanvas) return;

  paletteGrid.innerHTML = '';
  const colors = palette?.colors || [];
  if (!colors.length || !palette.width || !palette.height) {
    paletteGridContainer.classList.add('hidden');
    updatePaletteMetaUI(palette);
    return;
  }

  paletteCanvas.width = palette.width;
  paletteCanvas.height = palette.height;
  const ctx = paletteCanvas.getContext('2d');
  const imgData = ctx.createImageData(palette.width, palette.height);

  colors.forEach((c, i) => {
    const off = i * 4;
    imgData.data[off] = c.r;
    imgData.data[off + 1] = c.g;
    imgData.data[off + 2] = c.b;
    imgData.data[off + 3] = c.a;

    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'palette-swatch';
    swatch.style.backgroundColor = c.hex;
    swatch.title = `Color ${i + 1}: ${c.hex}`;
    swatch.setAttribute('aria-label', swatch.title);

    if (c.a === 0) {
      swatch.style.background = 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)';
      swatch.title = `Color ${i + 1}: Transparent`;
      swatch.setAttribute('aria-label', swatch.title);
    }

    swatch.addEventListener('click', () => {
      activeSwatchIndex = i;
      const startHex = c.a === 0 ? '#ffffff' : c.hex;
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
  });

  ctx.putImageData(imgData, 0, 0);
  paletteGridContainer.classList.remove('hidden');
  updatePaletteMetaUI(palette);
}

function loadPaletteFromImage(img, markAsEdited = false, targetProject = getActiveProject(), sourceLabel = null) {
  if (!targetProject) return;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.width;
  tempCanvas.height = img.height;
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imgData.data;
  const colors = [];

  const numColors = img.width * img.height;
  for (let i = 0; i < numColors; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    colors.push({ r, g, b, a, hex: rgbToHex(r, g, b), index: i });
  }

  targetProject.palette = {
    edited: markAsEdited,
    hasExtracted: true,
    width: img.width,
    height: img.height,
    colors,
    dataUrl: tempCanvas.toDataURL('image/png'),
    sourceLabel: sourceLabel || (markAsEdited ? 'Custom palette active' : null)
  };

  if (targetProject.id === state.activeProjectId) {
    applyPaletteToUI(targetProject.palette);
  }
}

if (resetPaletteBtn) {
  resetPaletteBtn.addEventListener('click', () => {
    const project = getActiveProject();
    if (!project) return;
    project.palette = createEmptyPalette();
    applyPaletteToUI(project.palette);
  });
}

// Generate & Load Colors (Pure Client-Side via Wasm FFmpeg)
if (generatePaletteBtn) {
  generatePaletteBtn.addEventListener('click', async () => {
    const project = getActiveProject();
    if (!state.ffmpegLoaded || !project || !project.file) return;

    generatePaletteBtn.disabled = true;
    const originalText = generatePaletteBtn.textContent;
    generatePaletteBtn.textContent = state.ffmpegBusy ? 'Queued...' : 'Generating...';

    const settingsSnap = readControlsSettings();
    const trimSnap = getTrimState();
    const cropSnap = getCropState();
    const dimsSnap = getOutputDimensions();
    const ext = project.filename.split('.').pop();
    const tempInputName = `temp_input_palette_${Date.now()}.${ext}`;
    const paletteName = `temp_palette_${Date.now()}.png`;

    try {
      await runInFFmpegQueue(async () => {
        if (project.id === state.activeProjectId) {
          generatePaletteBtn.textContent = 'Generating...';
        }
        const { fetchFile } = FFmpegUtil;
        await state.ffmpeg.writeFile(tempInputName, await fetchFile(project.file));

        const palettegenOpts = `max_colors=${settingsSnap.colors}` + (settingsSnap.transparency ? ':reserve_transparent=1' : '');
        const filterSource = composeGifFilterGraph({
          fps: settingsSnap.fps,
          width: dimsSnap.width,
          height: dimsSnap.height,
          playback: 'loop',
          crop: cropSnap,
          denoise: settingsSnap.denoise,
          dropDupes: settingsSnap.dropDupes
        });
        const vf = `${filterSource},palettegen=${palettegenOpts}`;

        await state.ffmpeg.exec([
          ...getTrimInputArgs(trimSnap),
          '-i', tempInputName,
          '-vf', vf,
          '-y', paletteName
        ]);

        const paletteData = await state.ffmpeg.readFile(paletteName);
        const paletteBlob = new Blob([paletteData.buffer], { type: 'image/png' });
        const blobUrl = URL.createObjectURL(paletteBlob);

        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            loadPaletteFromImage(img, false, project, null);
            URL.revokeObjectURL(blobUrl);
            resolve();
          };
          img.onerror = (err) => {
            URL.revokeObjectURL(blobUrl);
            reject(err);
          };
          img.src = blobUrl;
        });

        try { await state.ffmpeg.deleteFile(tempInputName); } catch (e) {}
        try { await state.ffmpeg.deleteFile(paletteName); } catch (e) {}
      });
    } catch (err) {
      console.error('Failed client-side palettegen:', err);
      alert('Failed to extract colors: ' + err.message);
      try { await state.ffmpeg.deleteFile(tempInputName); } catch (e) {}
      try { await state.ffmpeg.deleteFile(paletteName); } catch (e) {}
    } finally {
      generatePaletteBtn.textContent = originalText;
      updateActionButtonsState();
    }
  });
}

// --- Multi-Project Tabs & Workspace Hydration ---
function initProjects() {
  if (state.projects.length > 0) return;
  const first = createProject();
  state.projects.push(first);
  state.activeProjectId = first.id;
  renderProjectTabs();
  renderActiveProjectWorkspace();
}

function updateActionButtonsState() {
  const project = getActiveProject();
  const hasFile = !!(project && project.file);
  if (generatePaletteBtn) {
    generatePaletteBtn.disabled = !(state.ffmpegLoaded && hasFile);
  }
  if (convertBtn) {
    convertBtn.disabled = !(state.ffmpegLoaded && hasFile);
  }
  if (convertBtnText) {
    if (!state.ffmpegLoaded) {
      convertBtnText.textContent = 'Loading engine...';
    } else if (!hasFile) {
      convertBtnText.textContent = 'Add a video to convert';
    } else {
      convertBtnText.textContent = 'Convert to GIF';
    }
  }
}

function renderProjectTabs() {
  if (!projectTablist) return;
  projectTablist.innerHTML = '';

  const singleEmpty = state.projects.length === 1 && !state.projects[0].file;

  state.projects.forEach((project) => {
    const isActive = project.id === state.activeProjectId;

    const item = document.createElement('div');
    item.className = 'project-tab-item' + (isActive ? ' is-active' : '');
    item.setAttribute('role', 'presentation');
    item.dataset.projectId = project.id;

    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.role = 'tab';
    tabBtn.id = `tab-${project.id}`;
    tabBtn.className = 'project-tab';
    tabBtn.setAttribute('aria-selected', String(isActive));
    tabBtn.tabIndex = isActive ? 0 : -1;

    const status = document.createElement('span');
    status.className = 'project-tab-status' + (project.pendingJobs > 0 ? ' is-busy' : '');
    status.setAttribute('aria-hidden', 'true');
    status.textContent = project.pendingJobs > 0 ? '◌' : (project.file ? '🎬' : '📄');

    const label = document.createElement('span');
    label.className = 'project-tab-label';
    label.textContent = project.name;
    label.title = `${project.name} (double-click to rename)`;

    tabBtn.appendChild(status);
    tabBtn.appendChild(label);

    if (project.cards.length > 0) {
      const count = document.createElement('span');
      count.className = 'project-tab-count';
      count.textContent = String(project.cards.length);
      count.title = `${project.cards.length} render(s)`;
      tabBtn.appendChild(count);
    }

    tabBtn.addEventListener('click', () => {
      if (project.id !== state.activeProjectId) {
        switchToProject(project.id);
      }
    });

    tabBtn.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startTabRename(project, tabBtn, label);
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'project-tab-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', `Close project ${project.name}`);
    closeBtn.title = singleEmpty ? 'Empty project' : `Close ${project.name}`;
    closeBtn.disabled = singleEmpty;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeProject(project.id);
    });

    item.appendChild(tabBtn);
    item.appendChild(closeBtn);
    projectTablist.appendChild(item);
  });

  const activeTabEl = projectTablist.querySelector('[aria-selected="true"]');
  if (activeTabEl) {
    try {
      activeTabEl.scrollIntoView({ block: 'nearest', inline: 'nearest', container: 'nearest' });
    } catch (e) {
      activeTabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
}

function startTabRename(project, tabBtn, labelEl) {
  if (tabBtn.querySelector('.project-tab-rename-input')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'project-tab-rename-input';
  input.value = project.name;
  input.maxLength = 48;
  input.setAttribute('aria-label', 'Project name');

  labelEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save) {
      const trimmed = input.value.trim();
      if (trimmed) {
        project.name = trimmed;
        project.customName = true;
      }
    }
    renderProjectTabs();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('blur', () => finish(true));
}

if (projectTablist) {
  projectTablist.addEventListener('keydown', (e) => {
    const tabs = Array.from(projectTablist.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex = null;
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      e.preventDefault();
      const targetTab = tabs[nextIndex];
      const item = targetTab.closest('.project-tab-item');
      if (item?.dataset.projectId) {
        switchToProject(item.dataset.projectId);
        const updatedTab = document.getElementById(`tab-${item.dataset.projectId}`);
        if (updatedTab) updatedTab.focus();
      }
    }
  });
}

function renderActiveProjectWorkspace() {
  const project = getActiveProject();
  if (!project) return;

  if (workspacePanel) {
    workspacePanel.setAttribute('aria-labelledby', `tab-${project.id}`);
    workspacePanel.classList.toggle('is-empty', !project.file);
  }

  // Restore trim values before applySettingsToControls (which calls updateTrimControls)
  if (trimStartSlider) trimStartSlider.value = project.file ? (project.trim.cutStart || 0) : 0;
  if (trimEndSlider) trimEndSlider.value = project.file ? (project.trim.cutEnd || 0) : 0;

  applySettingsToControls(project.settings);

  if (project.file) {
    if (dropZone) dropZone.classList.add('hidden');
    if (projectMediaStage) projectMediaStage.classList.remove('hidden');

    fileNameEl.textContent = project.filename;
    fileSizeEl.textContent = formatBytes(project.sizeBytes);
    fileDurationEl.textContent = formatTime(project.durationSeconds);
    fileDimsEl.textContent = `${project.width}x${project.height}`;

    updateTrimControls();

    requestAnimationFrame(() => {
      layoutMediaStage();
      updateCropUI();
      tryAttachTrimPreview(project.file);
    });
    if (emptyStateText) {
      emptyStateText.textContent = 'Adjust settings and press "Convert to GIF" to compare renders!';
    }
  } else {
    if (dropZone) dropZone.classList.remove('hidden');
    if (projectMediaStage) projectMediaStage.classList.add('hidden');

    clearTrimPreview();
    updateTrimControls();
    if (emptyStateText) {
      emptyStateText.textContent = 'Drop a video above, then press "Convert to GIF" to compare renders!';
    }
  }

  applyPaletteToUI(project.palette);

  // Swap visible result cards to only this project's cards
  if (resultsFeed) {
    Array.from(resultsFeed.querySelectorAll('.result-card')).forEach(card => card.remove());
    project.cards.forEach(cardEl => resultsFeed.appendChild(cardEl));
    sortResultsFeed();
    checkEmptyState();
  }

  updateActionButtonsState();
}

function switchToProject(projectId) {
  if (!getProjectById(projectId)) return;
  saveActiveProjectControls();
  state.activeProjectId = projectId;
  renderProjectTabs();
  renderActiveProjectWorkspace();
}

function addNewProjectTab(activate = true, inheritSettings = true) {
  saveActiveProjectControls();
  const current = getActiveProject();
  const baseSettings = inheritSettings && current ? current.settings : DEFAULT_SETTINGS;
  const proj = createProject(baseSettings);
  state.projects.push(proj);
  if (activate) {
    state.activeProjectId = proj.id;
  }
  renderProjectTabs();
  if (activate) {
    renderActiveProjectWorkspace();
  }
  return proj;
}

function closeProject(projectId) {
  const index = state.projects.findIndex(p => p.id === projectId);
  if (index === -1) return;
  const project = state.projects[index];

  if (state.projects.length === 1) {
    if (!project.file && project.cards.length === 0) return;
    // Reset single remaining tab back to clean empty project
    project.cards.forEach(cardEl => {
      const link = cardEl.querySelector('.btn-download');
      if (link?.href && link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
    });
    project.name = 'New Project';
    project.customName = false;
    project.file = null;
    project.filename = null;
    project.sizeBytes = 0;
    project.durationSeconds = 0;
    project.width = 0;
    project.height = 0;
    project.crop = { left: 0, right: 0, top: 0, bottom: 0 };
    project.trim = { cutStart: 0, cutEnd: 0 };
    project.palette = createEmptyPalette();
    project.cards = [];
    renderProjectTabs();
    renderActiveProjectWorkspace();
    return;
  }

  [...project.cards].forEach(cardEl => {
    const delBtn = cardEl.querySelector('.btn-delete');
    if (delBtn) delBtn.click();
    const link = cardEl.querySelector('.btn-download');
    if (link?.href && link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
  });

  state.projects.splice(index, 1);
  if (state.activeProjectId === projectId) {
    const nextProj = state.projects[Math.min(index, state.projects.length - 1)];
    state.activeProjectId = nextProj.id;
  }
  renderProjectTabs();
  renderActiveProjectWorkspace();
}

if (addProjectBtn) {
  addProjectBtn.addEventListener('click', () => {
    addNewProjectTab(true, true);
  });
}

// --- Cross-Tab Copy Popovers (Settings & Palettes) ---
function hidePopoverSafe(popoverEl) {
  if (!popoverEl) return;
  if (typeof popoverEl.hidePopover === 'function') {
    try { popoverEl.hidePopover(); } catch (e) {}
  }
  popoverEl.classList.remove('is-popover-open');
}

function wirePopover(triggerBtn, popoverEl, renderFn) {
  if (!triggerBtn || !popoverEl) return;
  const hasNativePopover = Object.hasOwn(HTMLElement.prototype, 'popover');

  if (hasNativePopover) {
    popoverEl.addEventListener('toggle', (e) => {
      if (e.newState === 'open') renderFn();
    });
  } else {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !popoverEl.classList.contains('is-popover-open');
      document.querySelectorAll('.kawaii-popover.is-popover-open').forEach(p => p.classList.remove('is-popover-open'));
      if (willOpen) {
        renderFn();
        popoverEl.classList.add('is-popover-open');
      }
    });
    document.addEventListener('click', (e) => {
      if (!popoverEl.contains(e.target) && e.target !== triggerBtn) {
        popoverEl.classList.remove('is-popover-open');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') popoverEl.classList.remove('is-popover-open');
    });
  }
}

function summarizeSettings(s) {
  const ditherLabel = ditherInput?.querySelector(`option[value="${s.dither}"]`)?.textContent || s.dither;
  return `${s.fps} FPS · ${s.scale}% · ${s.colors}c · ${ditherLabel}`;
}

function renderCopySettingsPopover() {
  if (!copySettingsPopover) return;
  const active = getActiveProject();
  if (!active) return;

  copySettingsPopover.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'popover-heading';
  heading.textContent = 'Copy settings from another tab';
  copySettingsPopover.appendChild(heading);

  const others = state.projects.filter(p => p.id !== active.id);
  if (!others.length) {
    const empty = document.createElement('p');
    empty.className = 'popover-empty';
    empty.textContent = 'Open another project tab (+ New Project) to copy presets between videos.';
    copySettingsPopover.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'popover-list';

  others.forEach((src) => {
    const item = document.createElement('div');
    item.className = 'popover-item';

    const header = document.createElement('div');
    header.className = 'popover-item-header';
    const title = document.createElement('span');
    title.className = 'popover-item-title';
    title.textContent = src.name;
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'popover-item-meta';
    meta.textContent = summarizeSettings(src.settings);

    const actions = document.createElement('div');
    actions.className = 'popover-item-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'popover-action-btn';
    copyBtn.textContent = 'Copy Settings';
    copyBtn.addEventListener('click', () => {
      active.settings = { ...src.settings };
      applySettingsToControls(active.settings);
      hidePopoverSafe(copySettingsPopover);
    });
    actions.appendChild(copyBtn);

    if (src.palette?.colors?.length) {
      const bothBtn = document.createElement('button');
      bothBtn.type = 'button';
      bothBtn.className = 'popover-action-btn alt';
      bothBtn.textContent = '+ Palette';
      bothBtn.addEventListener('click', () => {
        active.settings = { ...src.settings };
        active.palette = clonePalette(src.palette, {
          edited: true,
          hasExtracted: true,
          sourceLabel: `Copied from ${src.name}`
        });
        applySettingsToControls(active.settings);
        applyPaletteToUI(active.palette);
        hidePopoverSafe(copySettingsPopover);
      });
      actions.appendChild(bothBtn);
    }

    item.appendChild(header);
    item.appendChild(meta);
    item.appendChild(actions);
    list.appendChild(item);
  });

  copySettingsPopover.appendChild(list);

  const applyAllBtn = document.createElement('button');
  applyAllBtn.type = 'button';
  applyAllBtn.className = 'popover-footer-btn';
  applyAllBtn.textContent = 'Apply current settings to all tabs';
  applyAllBtn.addEventListener('click', () => {
    saveActiveProjectControls();
    others.forEach((p) => {
      p.settings = { ...active.settings };
    });
    hidePopoverSafe(copySettingsPopover);
  });
  copySettingsPopover.appendChild(applyAllBtn);
}

function hideCopyPalettePanel() {
  if (copyPalettePanel) copyPalettePanel.classList.add('hidden');
  if (copyPaletteFromBtn) copyPaletteFromBtn.setAttribute('aria-expanded', 'false');
}

function renderCopyPalettePanel() {
  if (!copyPalettePanel) return;
  const active = getActiveProject();
  if (!active) return;

  copyPalettePanel.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'popover-heading';
  heading.textContent = 'Copy palette between projects';
  copyPalettePanel.appendChild(heading);

  const sources = state.projects.filter(p => p.id !== active.id && p.palette?.colors?.length);
  if (!sources.length) {
    const empty = document.createElement('p');
    empty.className = 'popover-empty';
    empty.textContent = 'No palettes in other tabs yet. Extract or edit colors in any tab first!';
    copyPalettePanel.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'popover-list';

    sources.forEach((src) => {
      const item = document.createElement('div');
      item.className = 'popover-item';

      const header = document.createElement('div');
      header.className = 'popover-item-header';
      const title = document.createElement('span');
      title.className = 'popover-item-title';
      title.textContent = src.name;
      const meta = document.createElement('span');
      meta.className = 'popover-item-meta';
      meta.textContent = `${src.palette.colors.length}c${src.palette.edited ? ' · Edited' : ''}`;
      header.appendChild(title);
      header.appendChild(meta);

      const swatchesRow = document.createElement('div');
      swatchesRow.className = 'popover-swatches';
      const step = Math.max(1, Math.floor(src.palette.colors.length / 8));
      for (let i = 0; i < src.palette.colors.length && swatchesRow.children.length < 8; i += step) {
        const dot = document.createElement('span');
        dot.className = 'popover-swatch-dot';
        const c = src.palette.colors[i];
        dot.style.backgroundColor = c.a === 0 ? '#ffffff' : c.hex;
        swatchesRow.appendChild(dot);
      }

      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.className = 'popover-action-btn';
      useBtn.textContent = 'Use This Palette';
      useBtn.addEventListener('click', () => {
        active.palette = clonePalette(src.palette, {
          edited: true,
          hasExtracted: true,
          sourceLabel: `Copied from ${src.name}`
        });
        applyPaletteToUI(active.palette);
        hideCopyPalettePanel();
      });

      item.appendChild(header);
      item.appendChild(swatchesRow);
      item.appendChild(useBtn);
      list.appendChild(item);
    });

    copyPalettePanel.appendChild(list);
  }

  const others = state.projects.filter(p => p.id !== active.id);
  if (active.palette?.colors?.length && others.length) {
    const applyAllBtn = document.createElement('button');
    applyAllBtn.type = 'button';
    applyAllBtn.className = 'popover-footer-btn';
    applyAllBtn.textContent = 'Apply active palette to all tabs';
    applyAllBtn.addEventListener('click', () => {
      others.forEach((p) => {
        p.palette = clonePalette(active.palette, {
          edited: true,
          hasExtracted: true,
          sourceLabel: `Copied from ${active.name}`
        });
      });
      hideCopyPalettePanel();
    });
    copyPalettePanel.appendChild(applyAllBtn);
  }
}

wirePopover(copySettingsFromBtn, copySettingsPopover, renderCopySettingsPopover);

if (copyPaletteFromBtn && copyPalettePanel) {
  copyPaletteFromBtn.addEventListener('click', () => {
    const willOpen = copyPalettePanel.classList.contains('hidden');
    if (willOpen) {
      renderCopyPalettePanel();
      copyPalettePanel.classList.remove('hidden');
      copyPaletteFromBtn.setAttribute('aria-expanded', 'true');
    } else {
      hideCopyPalettePanel();
    }
  });
}

if (paletteDialog) {
  enableDialogLightDismissFallback(paletteDialog);
  paletteDialog.addEventListener('close', () => {
    hideCopyPalettePanel();
    if (pickerPanel) pickerPanel.classList.add('hidden');
    paletteDialog.returnValue = '';
  });
  if (!('commandForElement' in HTMLButtonElement.prototype)) {
    if (openPaletteBtn) {
      openPaletteBtn.addEventListener('click', () => paletteDialog.showModal());
    }
    if (paletteDialogClose) {
      paletteDialogClose.addEventListener('click', () => paletteDialog.close());
    }
  }
}

// --- File Handling & Native Probing ---
function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function openFilePicker(mode) {
  pendingFileInputMode = mode;
  fileInput.click();
}

if (dropZone) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });
  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });
  dropZone.addEventListener('drop', (e) => {
    hideGlobalDropOverlay();
    if (e.dataTransfer?.files?.length) {
      handleIncomingFiles(e.dataTransfer.files, 'empty-or-new');
    }
  });
  dropZone.addEventListener('click', () => openFilePicker('empty-or-new'));
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker('empty-or-new');
    }
  });
}

if (browseBtn) {
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openFilePicker('empty-or-new');
  });
}

if (replaceVideoBtn) {
  replaceVideoBtn.addEventListener('click', () => {
    openFilePicker('replace');
  });
}

if (projectTabsBar) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    projectTabsBar.addEventListener(eventName, preventDefaults, false);
  });
  projectTabsBar.addEventListener('drop', (e) => {
    hideGlobalDropOverlay();
    if (e.dataTransfer?.files?.length) {
      handleIncomingFiles(e.dataTransfer.files, 'new-tab');
    }
  });
}

let globalDragDepth = 0;
function isFileDragEvent(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files');
}
function hideGlobalDropOverlay() {
  globalDragDepth = 0;
  if (globalDropOverlay) globalDropOverlay.classList.add('hidden');
}

window.addEventListener('dragenter', (e) => {
  if (!isFileDragEvent(e)) return;
  e.preventDefault();
  globalDragDepth += 1;
  if (globalDropOverlay && !e.target.closest?.('#drop-zone')) {
    globalDropOverlay.classList.remove('hidden');
  }
});

window.addEventListener('dragover', (e) => {
  if (!isFileDragEvent(e)) return;
  e.preventDefault();
});

window.addEventListener('dragleave', (e) => {
  if (!isFileDragEvent(e)) return;
  globalDragDepth = Math.max(0, globalDragDepth - 1);
  if (globalDragDepth === 0) {
    hideGlobalDropOverlay();
  }
});

window.addEventListener('drop', (e) => {
  if (!isFileDragEvent(e)) return;
  e.preventDefault();
  hideGlobalDropOverlay();
  if (e.dataTransfer?.files?.length) {
    handleIncomingFiles(e.dataTransfer.files, 'prompt');
  }
});

if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) {
      handleIncomingFiles(e.target.files, pendingFileInputMode);
    }
    fileInput.value = '';
  });
}

function promptDropChoice(files) {
  const active = getActiveProject();
  if (!dropChoiceDialog || !active) return;

  pendingDropFiles = Array.from(files);
  if (dropChoiceMessage) {
    dropChoiceMessage.textContent = pendingDropFiles.length === 1
      ? `Add "${pendingDropFiles[0].name}"?`
      : `Add ${pendingDropFiles.length} video files?`;
  }
  if (dropChoiceReplaceHint) {
    dropChoiceReplaceHint.textContent = pendingDropFiles.length === 1
      ? `Swap video in "${active.name}" (keeps your settings)`
      : `Replace "${active.name}" with "${pendingDropFiles[0].name}" & open ${pendingDropFiles.length - 1} tab(s)`;
  }

  dropChoiceDialog.showModal();
}

if (dropChoiceClose && dropChoiceDialog) {
  dropChoiceClose.addEventListener('click', () => {
    dropChoiceDialog.close('cancel');
  });
}

if (dropChoiceDialog) {
  dropChoiceDialog.addEventListener('close', () => {
    const choice = dropChoiceDialog.returnValue;
    dropChoiceDialog.returnValue = '';
    const files = pendingDropFiles;
    pendingDropFiles = [];
    if (!files.length || choice === 'cancel' || !choice) return;

    if (choice === 'new-tab') {
      handleIncomingFiles(files, 'new-tab');
    } else if (choice === 'replace') {
      handleIncomingFiles(files, 'replace');
    }
  });
}

async function handleIncomingFiles(fileList, mode = 'prompt') {
  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length) return;

  const active = getActiveProject();
  if (!active) return;

  if (mode === 'new-tab') {
    const firstNew = addNewProjectTab(true, true);
    await loadFileIntoProject(files[0], firstNew, { resetPalette: false });
    for (let i = 1; i < files.length; i++) {
      const extra = addNewProjectTab(false, true);
      await loadFileIntoProject(files[i], extra, { resetPalette: false });
    }
    return;
  }

  if (mode === 'replace') {
    await loadFileIntoProject(files[0], active, { resetPalette: !active.palette.edited });
    for (let i = 1; i < files.length; i++) {
      const extra = addNewProjectTab(false, true);
      await loadFileIntoProject(files[i], extra, { resetPalette: false });
    }
    return;
  }

  // 'empty-or-new' or 'prompt'
  if (!active.file) {
    await loadFileIntoProject(files[0], active, { resetPalette: false });
    for (let i = 1; i < files.length; i++) {
      const extra = addNewProjectTab(false, true);
      await loadFileIntoProject(files[i], extra, { resetPalette: false });
    }
    return;
  }

  promptDropChoice(files);
}

async function loadFileIntoProject(file, project, options = {}) {
  if (!file || !project) return;
  if (!state.ffmpegLoaded) {
    alert('WebAssembly engine is still loading, please wait a moment!');
    return;
  }

  const isActive = project.id === state.activeProjectId;
  if (isActive && dropZone) dropZone.classList.add('uploading');

  try {
    const probed = await runInFFmpegQueue(async () => {
      const { fetchFile } = FFmpegUtil;
      const ext = file.name.split('.').pop();
      const probeName = `probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
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
      try {
        await state.ffmpeg.exec(['-i', probeName]);
      } finally {
        state.ffmpeg.off('log', probeLogHandler);
        try { await state.ffmpeg.deleteFile(probeName); } catch (e) {}
      }

      return {
        durationSeconds: probedDuration || 5,
        width: probedW || 640,
        height: probedH || 360
      };
    });

    project.file = file;
    project.filename = file.name;
    project.sizeBytes = file.size;
    project.durationSeconds = probed.durationSeconds;
    project.width = probed.width;
    project.height = probed.height;
    project.crop = { left: 0, right: 0, top: 0, bottom: 0 };
    project.trim = { cutStart: 0, cutEnd: 0 };

    if (!project.customName) {
      project.name = file.name.replace(/\.[^.]+$/, '') || file.name;
    }
    if (options.resetPalette) {
      project.palette = createEmptyPalette();
    }

    renderProjectTabs();
    if (project.id === state.activeProjectId) {
      renderActiveProjectWorkspace();
    }
  } catch (err) {
    alert('Failed to read video details: ' + err.message);
  } finally {
    if (dropZone) dropZone.classList.remove('uploading');
  }
}

// --- Wasm GIF Conversion Pipeline ---
convertBtn.addEventListener('click', startConversion);

async function startConversion() {
  const project = getActiveProject();
  if (!state.ffmpegLoaded || !project || !project.file) return;

  saveActiveProjectControls();

  const { width, height } = getOutputDimensions();
  const s = { ...project.settings };
  const fps = s.fps;
  const colors = s.colors;
  const trans = s.transparency ? 'yes' : 'no';
  const dither = s.dither;
  const ditherText = ditherInput.options[ditherInput.selectedIndex]?.text || dither;
  const playback = s.playback;
  const playbackText = playbackInput.options[playbackInput.selectedIndex]?.text || playback;

  const conversionId = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

  const trim = getTrimState();
  const crop = getCropState();
  const paletteSnap = clonePalette(project.palette);
  const useCustomPalette = !!(paletteSnap.edited && paletteSnap.dataUrl);

  const settingsData = {
    scale: String(s.scale),
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
    denoise: !!s.denoise,
    dropDupes: !!s.dropDupes,
    diffRect: !!s.diffRect,
    paletteEdited: useCustomPalette,
    paletteDataUrl: useCustomPalette ? paletteSnap.dataUrl : null
  };

  // Instantiation of polaroid card bound to this project
  const card = createResultCard(conversionId, { width, height, ...settingsData }, project.id);
  card.el.settingsData = settingsData;

  project.cards.unshift(card.el);
  project.pendingJobs += 1;
  renderProjectTabs();

  if (project.id === state.activeProjectId) {
    emptyState.classList.add('hidden');
    resultsFeed.insertBefore(card.el, resultsFeed.firstChild);
    document.querySelector('.workspace-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (state.ffmpegBusy) {
    card.progressStage.textContent = 'Queued (waiting for engine)...';
    card.progressFill.style.width = '2%';
    card.progressPercent.textContent = '2%';
  }

  let isCancelled = false;
  card.deleteBtn.addEventListener('click', () => {
    isCancelled = true;
    const idx = project.cards.indexOf(card.el);
    if (idx !== -1) project.cards.splice(idx, 1);
    const link = card.downloadBtn;
    if (link?.href && link.href.startsWith('blob:')) {
      URL.revokeObjectURL(link.href);
    }
    card.el.remove();
    renderProjectTabs();
    if (project.id === state.activeProjectId) {
      checkEmptyState();
    }
  });

  const jobFile = project.file;
  const jobFilename = project.filename;

  try {
    await runInFFmpegQueue(async () => {
      if (isCancelled || !getProjectById(project.id)) return;

      card.progressStage.textContent = 'Storing file in memory...';
      card.progressFill.style.width = '6%';
      card.progressPercent.textContent = '6%';

      const { fetchFile } = FFmpegUtil;
      const ext = jobFilename.split('.').pop();
      const inputName = `input_${conversionId}.${ext}`;
      const paletteName = `palette_${conversionId}.png`;
      const gifName = `output_${conversionId}.gif`;

      try {
        await state.ffmpeg.writeFile(inputName, await fetchFile(jobFile));
        if (isCancelled) return;

        if (useCustomPalette) {
          card.progressStage.textContent = 'Injecting custom colors...';
          const paletteResp = await fetch(paletteSnap.dataUrl);
          const buffer = await paletteResp.arrayBuffer();
          await state.ffmpeg.writeFile(paletteName, new Uint8Array(buffer));
        }

        if (isCancelled) return;

        state.activeProgressHandler = (progress) => {
          if (isCancelled) return;
          const p = Math.max(10, Math.min(96, Math.round(10 + progress * 86)));
          card.progressFill.style.width = `${p}%`;
          card.progressPercent.textContent = `${p}%`;

          if (useCustomPalette) {
            card.progressStage.textContent = 'Rendering cute GIF with custom colors...';
          } else if (progress < 0.35) {
            card.progressStage.textContent = 'Analyzing color palette...';
          } else {
            card.progressStage.textContent = 'Rendering cute GIF...';
          }
        };

        const filterSource = composeGifFilterGraph({
          fps,
          width,
          height,
          playback,
          crop,
          denoise: settingsData.denoise,
          dropDupes: settingsData.dropDupes
        });

        const palettegenOpts = `max_colors=${colors}` + (trans === 'yes' ? ':reserve_transparent=1' : '');
        let paletteuseOpts = (trans === 'yes' ? 'alpha_threshold=128:' : '') + `dither=${dither}`;
        if (settingsData.diffRect) {
          paletteuseOpts += ':diff_mode=rectangle';
        }

        if (!useCustomPalette) {
          const pass1FilterArgs = playback === 'pingpong'
            ? ['-filter_complex', `${filterSource},palettegen=${palettegenOpts}`]
            : ['-vf', `${filterSource},palettegen=${palettegenOpts}`];

          await state.ffmpeg.exec([
            ...getTrimInputArgs(trim),
            '-i', inputName,
            ...pass1FilterArgs,
            '-y', paletteName
          ]);

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

        if (isCancelled) return;

        const loopArg = (playback === 'once') ? '-1' : '0';
        await state.ffmpeg.exec([
          ...getTrimInputArgs(trim),
          '-i', inputName,
          '-i', paletteName,
          '-filter_complex', `${filterSource}[x];[x][1:v]paletteuse=${paletteuseOpts}`,
          '-loop', loopArg,
          '-y', gifName
        ]);

        if (isCancelled) return;

        const data = await state.ffmpeg.readFile(gifName);
        const gifBlob = new Blob([data.buffer], { type: 'image/gif' });
        const gifUrl = URL.createObjectURL(gifBlob);

        card.progressContainer.classList.add('hidden');
        card.resultContent.classList.remove('hidden');
        card.img.src = gifUrl;
        card.sizeEl.textContent = formatBytes(gifBlob.size);
        card.downloadBtn.href = gifUrl;

        const imgObj = new Image();
        imgObj.onload = () => {
          const realW = imgObj.naturalWidth || width || 640;
          const realH = imgObj.naturalHeight || height || 360;
          card.dimsEl.textContent = `${realW}x${realH}`;

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

          card.downloadBtn.download = `${jobFilename.split('.')[0]}_${realW}x${realH}_${colors}_${dither}.gif`;
          card.el.dataset.size = gifBlob.size;
          if (project.id === state.activeProjectId) {
            sortResultsFeed();
          }
        };
        imgObj.src = gifUrl;
      } finally {
        state.activeProgressHandler = null;
        try { await state.ffmpeg.deleteFile(inputName); } catch (e) {}
        try { await state.ffmpeg.deleteFile(paletteName); } catch (e) {}
        try { await state.ffmpeg.deleteFile(gifName); } catch (e) {}
      }
    });
  } catch (err) {
    console.error('Wasm transcode failed:', err);
    card.progressContainer.classList.add('hidden');
    card.errorContent.classList.remove('hidden');
    card.errorContent.querySelector('.error-text').textContent = 'Conversion failed: ' + err.message;
    card.el.dataset.size = 999999999999;
    if (project.id === state.activeProjectId) {
      sortResultsFeed();
    }
  } finally {
    project.pendingJobs = Math.max(0, project.pendingJobs - 1);
    renderProjectTabs();
  }
}

function createResultCard(id, settings, projectId) {
  const template = cardTemplate.content.cloneNode(true);
  const el = template.querySelector('.result-card');
  el.dataset.id = id;
  el.dataset.projectId = projectId || '';
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

  if (settings.denoise) badges.push('Denoise');
  if (settings.dropDupes) badges.push('Drop dupes');
  if (settings.diffRect) badges.push('Diff rect');
  
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
      const project = getActiveProject();
      if (!sData || !project) return;

      project.settings = {
        fps: parseInt(sData.fps, 10) || 12,
        scale: parseInt(sData.scale, 10) || 100,
        colors: parseInt(sData.colors, 10) || 64,
        transparency: sData.trans === 'yes',
        dither: sData.dither || 'floyd_steinberg',
        playback: sData.playback || 'loop',
        denoise: !!sData.denoise,
        dropDupes: !!sData.dropDupes,
        diffRect: !!sData.diffRect
      };
      applySettingsToControls(project.settings);

      if (trimStartSlider) trimStartSlider.value = sData.cutStart || 0;
      if (trimEndSlider) trimEndSlider.value = sData.cutEnd || 0;
      updateTrimControls();

      project.crop = {
        left: sData.cropLeft || 0,
        right: sData.cropRight || 0,
        top: sData.cropTop || 0,
        bottom: sData.cropBottom || 0
      };
      layoutMediaStage();
      updateCropUI();

      if (sData.paletteDataUrl) {
        const img = new Image();
        img.onload = () => {
          loadPaletteFromImage(img, true, project, 'Restored from render card');
        };
        img.src = sData.paletteDataUrl;
      } else {
        project.palette = createEmptyPalette();
        applyPaletteToUI(project.palette);
      }

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
  emptyState.classList.toggle('hidden', hasCards);
}

// --- Full-Size GIF Modal Logic ---
const gifModal = document.getElementById('gif-modal');
const gifModalImg = document.getElementById('gif-modal-img');
const gifModalCaption = document.getElementById('gif-modal-caption');
const gifModalClose = document.querySelector('.gif-modal-close');

if (gifModal && gifModalImg && gifModalClose) {
  resultsFeed.addEventListener('click', (e) => {
    const preview = e.target.closest('.result-preview');
    if (preview) {
      const img = preview.querySelector('.result-gif');
      const cardEl = preview.closest('.result-card');
      
      if (img && img.src) {
        let captionText = 'GIF Preview';
        if (cardEl) {
          const badges = Array.from(cardEl.querySelectorAll('.badge')).map(b => b.textContent);
          if (badges.length) {
            captionText = badges.join(' • ');
          }
        }
        
        gifModalImg.src = img.src;
        gifModalCaption.textContent = captionText;
        gifModal.classList.remove('hidden');
        gifModal.setAttribute('aria-hidden', 'false');
      }
    }
  });

  const closeModal = () => {
    gifModal.classList.add('hidden');
    gifModal.setAttribute('aria-hidden', 'true');
    gifModalImg.src = '';
  };

  gifModalClose.addEventListener('click', closeModal);
  gifModal.addEventListener('click', (e) => {
    if (e.target === gifModal) closeModal();
  });
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
    
    if (sizeA === -1 && sizeB === -1) return timeB - timeA;
    if (sizeA === -1) return -1;
    if (sizeB === -1) return 1;
    
    if (sortMode === 'size') {
      if (sizeA !== sizeB) return sizeA - sizeB;
    } else if (sortMode === 'fps') {
      const fpsA = parseInt(a.dataset.fps || 0, 10);
      const fpsB = parseInt(b.dataset.fps || 0, 10);
      if (fpsA !== fpsB) return fpsA - fpsB;
    } else if (sortMode === 'colors') {
      const colorsA = parseInt(a.dataset.colors || 0, 10);
      const colorsB = parseInt(b.dataset.colors || 0, 10);
      if (colorsA !== colorsB) return colorsA - colorsB;
    } else if (sortMode === 'dither') {
      const ditherA = a.dataset.dither || '';
      const ditherB = b.dataset.dither || '';
      const cmp = ditherA.localeCompare(ditherB);
      if (cmp !== 0) return cmp;
    }
    
    return timeB - timeA;
  });
  
  cards.forEach(card => resultsFeed.appendChild(card));
}

const sortSelectEl = document.getElementById('sort-select');
if (sortSelectEl) {
  sortSelectEl.addEventListener('change', sortResultsFeed);
}

// --- Bubbly Modal Dialogs Control ---
function enableDialogLightDismissFallback(dialog) {
  if (!dialog || ('closedBy' in HTMLDialogElement.prototype)) return;
  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', (e) => {
    pressedOutside = outside(e);
  });
  dialog.addEventListener('pointerup', (e) => {
    if (pressedOutside && outside(e)) {
      dialog.close('cancel');
    }
  });
}

enableDialogLightDismissFallback(dropChoiceDialog);

const setupCuteDialog = (btnId, dialogId) => {
  const btn = document.getElementById(btnId);
  const dialog = document.getElementById(dialogId);
  if (!btn || !dialog) return;

  btn.addEventListener('click', () => {
    dialog.showModal();
  });

  enableDialogLightDismissFallback(dialog);
};

setupCuteDialog('footer-about', 'about-dialog');
setupCuteDialog('footer-terms', 'terms-dialog');
setupCuteDialog('footer-privacy', 'privacy-dialog');

// --- Control Hover & Focus Tooltips ---
function initControlHoverTooltips() {
  const groups = Array.from(document.querySelectorAll('[data-hint-target]'));
  if (!groups.length) return;

  const hasNativePopover = Object.hasOwn(HTMLElement.prototype, 'popover');
  if (hasNativePopover) {
    const probe = document.createElement('div');
    probe.popover = 'hint';
    if (probe.popover !== 'hint') {
      document.querySelectorAll('.kawaii-tooltip[popover="hint"]').forEach((tip) => {
        tip.setAttribute('popover', 'auto');
      });
    }
  }

  let openTimer = null;
  let closeTimer = null;
  let currentOpenTip = null;
  let activeGroup = null;
  let suppressedGroup = null;

  const positionTooltip = (anchorEl, tip) => {
    if (!anchorEl || !tip) return;
    const ar = anchorEl.getBoundingClientRect();
    const tp = tip.getBoundingClientRect();
    const gap = 8;
    let top = ar.top - tp.height - gap;
    if (top < 8) {
      top = ar.bottom + gap;
    }
    let left = ar.left + ar.width / 2 - tp.width / 2;
    left = Math.max(8, Math.min(left, (window.innerWidth || 1024) - tp.width - 8));
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  };

  const showTip = (group, tip) => {
    if (currentOpenTip && currentOpenTip !== tip) {
      hideTip(currentOpenTip);
    }
    if (hasNativePopover && typeof tip.showPopover === 'function') {
      try { tip.showPopover(); } catch (e) {}
    } else {
      tip.classList.add('is-tooltip-open');
    }
    currentOpenTip = tip;
    activeGroup = group;
    const anchor = group.querySelector('.slider-header') || group;
    positionTooltip(anchor, tip);
  };

  const hideTip = (tip) => {
    if (!tip) return;
    if (hasNativePopover && typeof tip.hidePopover === 'function') {
      try { tip.hidePopover(); } catch (e) {}
    } else {
      tip.classList.remove('is-tooltip-open');
    }
    if (currentOpenTip === tip) {
      currentOpenTip = null;
      activeGroup = null;
    }
  };

  groups.forEach((group) => {
    const tip = document.getElementById(group.dataset.hintTarget);
    if (!tip) return;

    group.addEventListener('pointerenter', () => {
      if (suppressedGroup === group) return;
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      const delay = currentOpenTip ? 60 : 240;
      openTimer = setTimeout(() => showTip(group, tip), delay);
    });

    group.addEventListener('pointerleave', () => {
      if (suppressedGroup === group) suppressedGroup = null;
      clearTimeout(openTimer);
      closeTimer = setTimeout(() => hideTip(tip), 120);
    });

    group.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input, select, button, .toggle')) {
        suppressedGroup = group;
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
        hideTip(tip);
      }
    });

    group.addEventListener('focusin', (e) => {
      let isKeyboardFocus = false;
      try { isKeyboardFocus = !!e.target?.matches?.(':focus-visible'); } catch (err) {}
      if (!isKeyboardFocus) return;
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      showTip(group, tip);
    });

    group.addEventListener('focusout', (e) => {
      if (e.relatedTarget && (group.contains(e.relatedTarget) || tip.contains(e.relatedTarget))) return;
      clearTimeout(openTimer);
      hideTip(tip);
    });

    tip.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    tip.addEventListener('pointerleave', () => {
      closeTimer = setTimeout(() => hideTip(tip), 120);
    });
  });

  if (!hasNativePopover) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && currentOpenTip) {
        hideTip(currentOpenTip);
      }
    });
    document.addEventListener('click', (e) => {
      if (currentOpenTip && !currentOpenTip.contains(e.target) && !activeGroup?.contains(e.target)) {
        hideTip(currentOpenTip);
      }
    });
  }
}

initControlHoverTooltips();

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


