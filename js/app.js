/**
 * app.js — FocusFi main entry point
 *
 * Coordinates:
 *   - YouTube player (player.js)
 *   - Pomodoro timer (timer.js)
 *   - Task list (tasks.js)
 *   - Notes (notes.js)
 *   - Background switching
 *   - Stream settings dialog
 *   - Panel toggles
 *   - Keyboard shortcuts
 *   - Clock display
 *
 * The player wrapper (#yt-wrapper) uses CSS classes to switch modes:
 *   .mode-audio  → tiny / invisible, audio only
 *   .mode-bg     → fullscreen background video
 *   .mode-modal  → centred foreground overlay
 */

import { YouTubePlayer } from './player.js';
import { PomodoroTimer  } from './timer.js';
import { TaskList       } from './tasks.js';
import { Notes          } from './notes.js';

// ── Preset streams ─────────────────────────────────────────
const PRESETS = [
  { name: 'Lofi Girl',           videoId: 'jfKfPfyJRdk', desc: 'lofi hip hop radio' },
  { name: 'Lofi Girl — Synthwave', videoId: '4xDzrJKXOOY', desc: 'synthwave radio'    },
  { name: 'Chillhop Music',      videoId: '5yx6BWlEVcY', desc: 'chillhop radio'     },
];

// ── Application state ──────────────────────────────────────
let streams          = [...PRESETS];
let streamIndex      = 0;   // index into streams[]
let bgMode           = 'gradient';
let playerMode       = 'audio'; // 'audio' | 'bg' | 'modal'
let gifList          = [];
let gifIndex         = 0;

/** @type {YouTubePlayer} */ let player;
/** @type {PomodoroTimer} */ let timer;
/** @type {TaskList}      */ let taskList;
/** @type {Notes}         */ let notes;

// Load persisted custom stream
(function loadCustomStream() {
  try {
    const raw = localStorage.getItem('focusfi-custom-stream');
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.videoId) streams.push({ ...s, custom: true });
    }
  } catch { /* ignore */ }
})();

// Load persisted stream index
(function loadStreamIndex() {
  const i = parseInt(localStorage.getItem('focusfi-stream-index'), 10);
  if (!isNaN(i) && i >= 0 && i < streams.length) streamIndex = i;
})();

// ── DOMContentLoaded ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initBackground();
  initTimer();
  initTasks();
  initNotes();
  initPlayerControls();
  initStreamDialog();
  initPanels();
  initKeyboard();
  initClock();
  loadGifs();

  // Restore last background mode
  const savedBg = localStorage.getItem('focusfi-bg') || 'gradient';
  setBackground(savedBg, true);
});

// ── YouTube API ready ──────────────────────────────────────
window.addEventListener('yt-ready', () => {
  player = new YouTubePlayer('yt-player');
  player.init(streams[streamIndex].videoId);

  // Restore saved volume
  const savedVol = parseInt(localStorage.getItem('focusfi-volume'), 10);
  if (!isNaN(savedVol)) {
    player.volume = savedVol;
    setVolumeSliderFill(savedVol);
    document.getElementById('volume-slider').value = savedVol;
  }

  player.onReady(() => {
    setStreamStatus('Live');
    updatePlayBtn(player.isPlaying());
  });

  player.onStateChange((e) => {
    const s = e.data;
    updatePlayBtn(s === YT.PlayerState.PLAYING);
    if      (s === YT.PlayerState.PLAYING)   setStreamStatus('Live');
    else if (s === YT.PlayerState.BUFFERING) setStreamStatus('Loading\u2026');
    else if (s === YT.PlayerState.PAUSED)    setStreamStatus('Paused');
    else if (s === YT.PlayerState.ENDED)     setStreamStatus('Ended');
  });
});

// ═══════════════════════════════════════════════════════════
// BACKGROUND
// ═══════════════════════════════════════════════════════════

function initBackground() {
  document.querySelectorAll('.bg-btn').forEach((btn) => {
    btn.addEventListener('click', () => setBackground(btn.dataset.bg));
  });
}

/**
 * Switch the background mode.
 * @param {string}  mode   'gradient' | 'gif' | 'stream'
 * @param {boolean} silent  Skip toast (used on init)
 */
function setBackground(mode, silent = false) {
  bgMode = mode;
  localStorage.setItem('focusfi-bg', mode);

  document.querySelectorAll('.bg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.bg === mode);
  });

  // gradient / gif visibility
  document.getElementById('bg-gradient').classList.toggle('active', mode === 'gradient');
  document.getElementById('bg-gif').classList.toggle('active', mode === 'gif');

  // stream background
  if (mode === 'stream') {
    if (playerMode !== 'modal') setPlayerMode('bg');
  } else {
    if (playerMode === 'bg') setPlayerMode('audio');
  }

  if (!silent && mode === 'gif' && gifList.length === 0) {
    showToast('Add GIFs to assets/gifs/ and update manifest.json');
  }
}

// ─── GIF loading ──────────────────────────────────────────
async function loadGifs() {
  try {
    const res  = await fetch('assets/gifs/manifest.json');
    const data = await res.json();
    gifList = Array.isArray(data) ? data : (data.files || []);
    if (gifList.length > 0) {
      showGif(0);
      setInterval(() => {
        if (bgMode === 'gif') {
          gifIndex = (gifIndex + 1) % gifList.length;
          showGif(gifIndex);
        }
      }, 30000);
    }
  } catch { /* no manifest yet */ }
}

function showGif(i) {
  if (gifList.length === 0) return;
  document.getElementById('gif-img').src = `assets/gifs/${gifList[i]}`;
}

// ═══════════════════════════════════════════════════════════
// PLAYER MODE  (audio / bg / modal)
// ═══════════════════════════════════════════════════════════

/**
 * @param {'audio'|'bg'|'modal'} mode
 */
function setPlayerMode(mode) {
  const wrapper = document.getElementById('yt-wrapper');
  wrapper.className = ''; // clear all mode classes
  wrapper.classList.add(`mode-${mode}`);
  playerMode = mode;

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.toggle('hidden', mode !== 'modal');

  // reflect in the view button
  document.getElementById('btn-view').classList.toggle('active', mode === 'modal');
}

// ═══════════════════════════════════════════════════════════
// PLAYER CONTROLS
// ═══════════════════════════════════════════════════════════

function initPlayerControls() {
  document.getElementById('btn-play-pause').addEventListener('click', () => {
    if (player) player.toggle();
  });

  document.getElementById('btn-prev').addEventListener('click', prevStream);
  document.getElementById('btn-next').addEventListener('click', nextStream);

  document.getElementById('btn-mute').addEventListener('click', () => {
    if (!player) return;
    const muted = player.toggleMute();
    updateMuteBtn(muted);
  });

  const volSlider = document.getElementById('volume-slider');
  volSlider.addEventListener('input', () => {
    const vol = parseInt(volSlider.value, 10);
    if (player) {
      player.setVolume(vol);
      updateMuteBtn(vol === 0);
    }
    setVolumeSliderFill(vol);
    localStorage.setItem('focusfi-volume', vol);
  });

  // view / foreground toggle
  document.getElementById('btn-view').addEventListener('click', toggleForeground);

  // close modal overlay on backdrop click
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeForeground();
  });
  document.getElementById('modal-close').addEventListener('click', closeForeground);

  updateStreamName();
}

function prevStream() {
  streamIndex = (streamIndex - 1 + streams.length) % streams.length;
  switchStream();
}

function nextStream() {
  streamIndex = (streamIndex + 1) % streams.length;
  switchStream();
}

function switchStream() {
  localStorage.setItem('focusfi-stream-index', streamIndex);
  const s = streams[streamIndex];
  if (player) player.loadVideo(s.videoId);
  updateStreamName();
  showToast(`Switched to ${s.name}`);
}

function toggleForeground() {
  if (playerMode === 'modal') {
    closeForeground();
  } else {
    setPlayerMode('modal');
  }
}

function closeForeground() {
  setPlayerMode(bgMode === 'stream' ? 'bg' : 'audio');
}

// ── DOM helpers ────────────────────────────────────────────
function updateStreamName() {
  document.getElementById('stream-name').textContent = streams[streamIndex].name;
}
function setStreamStatus(text) {
  document.getElementById('stream-status').textContent = text;
}
function updatePlayBtn(isPlaying) {
  const btn = document.getElementById('btn-play-pause');
  const use = btn.querySelector('use');
  use.setAttribute('href', isPlaying ? '#ic-pause' : '#ic-play');
  btn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
}
function updateMuteBtn(isMuted) {
  const btn = document.getElementById('btn-mute');
  const use = btn.querySelector('use');
  use.setAttribute('href', isMuted ? '#ic-volume-off' : '#ic-volume');
  btn.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
}
function setVolumeSliderFill(vol) {
  const slider = document.getElementById('volume-slider');
  slider.style.background =
    `linear-gradient(to right, var(--accent) ${vol}%, var(--border-hi) ${vol}%)`;
}

// ═══════════════════════════════════════════════════════════
// POMODORO TIMER
// ═══════════════════════════════════════════════════════════

function initTimer() {
  timer = new PomodoroTimer({
    onTick: (secs, mode) => {
      document.getElementById('timer-time').textContent = timer.format(secs);
      // Update page title during focus sessions
      if (mode === 'focus') {
        document.title = `${timer.format(secs)} — FocusFi`;
      }
    },
    onEnd: (mode) => {
      if (mode === 'focus') {
        if (player) player.pause();
        showToast('Focus session complete — take a break');
        beep(880, 0.25, 0.6);
        beep(660, 0.2, 0.6, 0.35);
      } else {
        if (player) player.play();
        showToast('Break over — back to work');
        beep(528, 0.25, 0.5);
      }
      updateSessionMeta();
      document.getElementById('btn-timer-start').textContent = 'Start';
    },
    onModeChange: (mode) => {
      syncModeTabUI(mode);
      updateSessionMeta();
      document.getElementById('timer-time').textContent =
        timer.format(timer.timeLeft);
      document.getElementById('btn-timer-start').textContent = 'Start';
      document.title = 'FocusFi';
    },
  });

  // Mode tab buttons
  document.querySelectorAll('.mode-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      timer.setMode(btn.dataset.mode);
    });
  });

  // Start / Pause
  document.getElementById('btn-timer-start').addEventListener('click', () => {
    const running = timer.toggle();
    document.getElementById('btn-timer-start').textContent = running ? 'Pause' : 'Start';
  });

  // Reset
  document.getElementById('btn-timer-reset').addEventListener('click', () => {
    timer.reset();
    document.getElementById('btn-timer-start').textContent = 'Start';
  });

  // Duration inputs
  document.getElementById('inp-focus').addEventListener('change', (e) => {
    timer.setDuration('focus', parseInt(e.target.value, 10));
  });
  document.getElementById('inp-break').addEventListener('change', (e) => {
    const mins = parseInt(e.target.value, 10);
    timer.setDuration('short', mins);
    timer.setDuration('long', mins * 3);
  });

  // Initial display
  document.getElementById('timer-time').textContent = timer.format(timer.timeLeft);
  updateSessionMeta();
}

function syncModeTabUI(mode) {
  document.querySelectorAll('.mode-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
    b.setAttribute('aria-selected', b.dataset.mode === mode);
  });
}

function updateSessionMeta() {
  document.getElementById('session-dots').textContent  = timer.dots;
  document.getElementById('session-label').textContent =
    `Session ${timer.sessionNumber} of 4`;
}

/**
 * Tiny Web Audio beep — no audio files needed.
 * @param {number} freq      Hz
 * @param {number} vol       0–1 gain
 * @param {number} duration  seconds
 * @param {number} [delay]   seconds before starting (default 0)
 */
function beep(freq, vol, duration, delay = 0) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  } catch { /* AudioContext blocked or unavailable */ }
}

// ═══════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════

function initTasks() {
  taskList = new TaskList();
  renderTasks();

  document.getElementById('btn-add-task').addEventListener('click', addTask);
  document.getElementById('new-task-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
  });
}

function addTask() {
  const input = document.getElementById('new-task-input');
  const text  = input.value.trim();
  if (!text) return;
  taskList.add(text);
  input.value = '';
  renderTasks();
}

function renderTasks() {
  const list = document.getElementById('task-list');
  list.innerHTML = '';

  taskList.items.forEach((task) => {
    const item = document.createElement('div');
    item.className = `task-item${task.done ? ' done' : ''}`;
    item.setAttribute('role', 'listitem');

    // checkbox
    const cb    = document.createElement('input');
    cb.type     = 'checkbox';
    cb.checked  = task.done;
    cb.setAttribute('aria-label', `Mark "${task.text}" as done`);
    cb.addEventListener('change', () => { taskList.toggle(task.id); renderTasks(); });

    // text
    const span       = document.createElement('span');
    span.className   = 'task-text';
    span.textContent = task.text;

    // delete button
    const del = document.createElement('button');
    del.className = 'task-del';
    del.setAttribute('aria-label', `Delete task "${task.text}"`);
    del.innerHTML = '<svg class="icon icon-sm"><use href="#ic-trash"/></svg>';
    del.addEventListener('click', () => { taskList.remove(task.id); renderTasks(); });

    item.append(cb, span, del);
    list.appendChild(item);
  });

  const { done, total } = taskList.progress;
  document.getElementById('tasks-progress').textContent =
    total === 0 ? 'No tasks yet' : `${done} of ${total} done`;
}

// ═══════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════

function initNotes() {
  notes = new Notes();
  const area = document.getElementById('notes-area');
  area.value = notes.load();
  updateWordCount(area.value);

  area.addEventListener('input', () => {
    notes.save(area.value);
    updateWordCount(area.value);
  });

  document.getElementById('btn-notes-clear').addEventListener('click', () => {
    if (!area.value) return;
    if (confirm('Clear all notes?')) {
      area.value = '';
      notes.clear();
      updateWordCount('');
    }
  });
}

function updateWordCount(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  document.getElementById('notes-count').textContent =
    `${words} word${words !== 1 ? 's' : ''} · ${chars} char${chars !== 1 ? 's' : ''}`;
}

// ═══════════════════════════════════════════════════════════
// STREAM SETTINGS DIALOG
// ═══════════════════════════════════════════════════════════

function initStreamDialog() {
  const dialog   = document.getElementById('stream-dialog');
  const openBtn  = document.getElementById('btn-stream-settings');
  const closeBtn = document.getElementById('btn-dialog-close');
  const loadBtn  = document.getElementById('btn-load-stream');

  openBtn.addEventListener('click', () => {
    renderPresets();
    dialog.classList.remove('hidden');
    document.getElementById('custom-url-input').focus();
  });

  closeBtn.addEventListener('click', () => dialog.classList.add('hidden'));

  // close on backdrop click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.classList.add('hidden');
  });

  // close on Escape
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dialog.classList.add('hidden');
  });

  loadBtn.addEventListener('click', loadCustomStream);
  document.getElementById('custom-url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadCustomStream();
  });
}

function renderPresets() {
  const container = document.getElementById('stream-presets');
  container.innerHTML = '';

  streams.forEach((s, i) => {
    const btn       = document.createElement('button');
    btn.className   = `preset-btn${i === streamIndex ? ' active' : ''}`;
    btn.textContent = s.name;
    if (s.custom) {
      const badge       = document.createElement('span');
      badge.className   = 'preset-badge';
      badge.textContent = 'custom';
      btn.appendChild(badge);
    }
    btn.addEventListener('click', () => {
      streamIndex = i;
      switchStream();
      document.getElementById('stream-dialog').classList.add('hidden');
    });
    container.appendChild(btn);
  });
}

function loadCustomStream() {
  const input   = document.getElementById('custom-url-input');
  const errorEl = document.getElementById('stream-error');
  const url     = input.value.trim();
  const videoId = parseYouTubeId(url);

  if (!videoId) {
    errorEl.textContent = 'Could not find a valid YouTube video ID in that URL.';
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');

  // Replace any existing custom stream
  streams = streams.filter((s) => !s.custom);
  const custom = { name: 'Custom Stream', videoId, custom: true };
  streams.push(custom);
  localStorage.setItem('focusfi-custom-stream', JSON.stringify(custom));

  streamIndex = streams.length - 1;
  localStorage.setItem('focusfi-stream-index', streamIndex);
  if (player) player.loadVideo(videoId);
  updateStreamName();
  document.getElementById('stream-dialog').classList.add('hidden');
  input.value = '';
  showToast('Custom stream loaded');
}

/**
 * Extract a YouTube video ID from a URL or plain ID string.
 * Handles: youtube.com/watch?v=, youtu.be/, /live/, /embed/, bare IDs.
 * @param {string} input
 * @returns {string|null}
 */
function parseYouTubeId(input) {
  // Bare 11-char video ID
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('?')[0];
    const v = url.searchParams.get('v');
    if (v) return v;
    const m = url.pathname.match(/\/(live|embed|shorts)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[2];
  } catch { /* not a URL */ }
  return null;
}

// ═══════════════════════════════════════════════════════════
// PANELS (open / close)
// ═══════════════════════════════════════════════════════════

function initPanels() {
  // Header toggle buttons
  document.querySelectorAll('.tool-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel  = document.getElementById(btn.dataset.panel);
      const isOpen = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', isOpen);
      btn.classList.toggle('active', !isOpen);
    });
  });

  // Close buttons inside panels
  document.querySelectorAll('.close-panel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel  = document.getElementById(btn.dataset.panel);
      panel.classList.add('hidden');
      const toggle = document.querySelector(`.tool-toggle[data-panel="${btn.dataset.panel}"]`);
      if (toggle) toggle.classList.remove('active');
    });
  });
}

// ═══════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (player) player.toggle();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        prevStream();
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextStream();
        break;
      case 'm':
      case 'M':
        if (player) updateMuteBtn(player.toggleMute());
        break;
      case 'f':
      case 'F':
        toggleForeground();
        break;
    }
  });
}

// ═══════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════

function initClock() {
  const el = document.getElementById('clock');
  function tick() {
    el.textContent = new Date().toLocaleTimeString([], {
      hour:   '2-digit',
      minute: '2-digit',
    });
  }
  tick();
  setInterval(tick, 1000);
}

// ═══════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Show a brief non-blocking message.
 * @param {string} msg
 * @param {number} [duration]  ms to show (default 3000)
 */
function showToast(msg, duration = 3000) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const toast       = document.createElement('div');
  toast.className   = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(8px)';
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, duration);
}
