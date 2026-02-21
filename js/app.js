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
 *   - Clock display + Big clock
 *   - Stopwatch
 *   - Countdown timer
 *   - Breathing exercise
 *   - Equalizer
 *   - Ad detection / skip
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
  { name: 'Lofi Girl',              videoId: 'jfKfPfyJRdk', desc: 'lofi hip hop radio'    },
  { name: 'Lofi Girl — Synthwave',  videoId: '4xDzrJKXOOY', desc: 'synthwave radio'       },
  { name: 'Chillhop Music',         videoId: '5yx6BWlEVcY', desc: 'chillhop radio'        },
  { name: 'Lofi Girl — Sleep',      videoId: 'rUxyKA_-grg', desc: 'sleepy lofi radio'     },
  { name: 'Lofi Girl — Jazz',       videoId: 'HuFYqnbVbzY', desc: 'lofi jazz radio'       },
  { name: 'Lofi Girl — Ambient',    videoId: 'S_MOd40zlYU', desc: 'ambient lofi radio'    },
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

// Stopwatch state
let swRunning = false, swElapsed = 0, swStart = 0, swInterval = null, swLaps = [];
// Countdown state
let cdRunning = false, cdTotal = 300, cdLeft = 300, cdInterval = null;
// Breathing state
let brInterval = null, brPhase = -1;
// Ad detection
let adCheckInterval = null;

// ── Settings state ─────────────────────────────────────────
let settings = { theme: 'dark', clockFormat: 'system', scene: 'gradient' };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('focusfi-settings'));
    if (saved) settings = { ...settings, ...saved };
  } catch { /* ignore */ }
  // Backward compat: migrate old focusfi-bg key
  if (!localStorage.getItem('focusfi-settings')) {
    const oldBg = localStorage.getItem('focusfi-bg');
    if (oldBg) settings.scene = oldBg;
  }
}

function saveSettings() {
  localStorage.setItem('focusfi-settings', JSON.stringify(settings));
}

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
  loadSettings();
  initSettings();
  initBackground();
  initTimer();
  initTasks();
  initNotes();
  initPlayerControls();
  initStreamDialog();
  initPanels();
  initKeyboard();
  initClock();
  initBigClock();
  initStopwatch();
  initCountdown();
  initBreathing();
  initEqualizer();
  initSkipAd();
  initAmbientSounds();
  initQuote();
  initEasterEggs();
  initVisualizer();
  loadGifs();

  // Restore last background mode
  setBackground(settings.scene, true);
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
    startAdDetection();
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
 * @param {string}  mode   'gradient' | 'gif' | 'stream' | 'visualizer'
 * @param {boolean} silent  Skip toast (used on init)
 */
function setBackground(mode, silent = false) {
  bgMode = mode;
  settings.scene = mode;
  saveSettings();

  document.querySelectorAll('.bg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.bg === mode);
  });

  // Background layer visibility
  document.getElementById('bg-gradient').classList.toggle('active', mode === 'gradient');
  document.getElementById('bg-gif').classList.toggle('active', mode === 'gif');
  document.getElementById('bg-visualizer').classList.toggle('active', mode === 'visualizer');

  // Big clock: centered on gradient, shrink-transition for others
  const bigClock = document.getElementById('big-clock');
  bigClock.classList.toggle('mini', mode !== 'gradient');

  // Header clock: hidden in clock scene, visible otherwise
  const headerClock = document.getElementById('clock');
  headerClock.classList.toggle('clock-scene', mode === 'gradient');

  // Visualizer
  if (mode === 'visualizer') {
    startVisualizer();
  } else {
    stopVisualizer();
  }

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
      // Update big clock Pomodoro overlay
      updateBigClockPomo(secs);
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
      hideBigClockPomo();
    },
    onModeChange: (mode) => {
      syncModeTabUI(mode);
      updateSessionMeta();
      document.getElementById('timer-time').textContent =
        timer.format(timer.timeLeft);
      document.getElementById('btn-timer-start').textContent = 'Start';
      document.title = 'FocusFi';
      hideBigClockPomo();
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
    if (running) {
      showBigClockPomo();
    } else {
      // still show it while paused if time remains
    }
  });

  // Reset
  document.getElementById('btn-timer-reset').addEventListener('click', () => {
    timer.reset();
    document.getElementById('btn-timer-start').textContent = 'Start';
    hideBigClockPomo();
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

// ── Big clock Pomodoro integration ────────────────────────
function showBigClockPomo() {
  document.getElementById('big-clock-pomo').classList.remove('hidden');
}
function hideBigClockPomo() {
  document.getElementById('big-clock-pomo').classList.add('hidden');
}
function updateBigClockPomo(secs) {
  const el = document.getElementById('big-clock-pomo');
  if (el.classList.contains('hidden')) return;
  document.getElementById('big-clock-pomo-time').textContent = timer.format(secs);
  const endDate = new Date(Date.now() + secs * 1000);
  const opts = { hour: '2-digit', minute: '2-digit' };
  if (settings.clockFormat === '12h') opts.hour12 = true;
  else if (settings.clockFormat === '24h') opts.hour12 = false;
  const endStr = endDate.toLocaleTimeString([], opts);
  document.getElementById('big-clock-pomo-end').textContent = `ends at ${endStr}`;
}

/**
 * Tiny Web Audio beep — no audio files needed.
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
// STOPWATCH
// ═══════════════════════════════════════════════════════════

function initStopwatch() {
  const display = document.getElementById('stopwatch-time');
  const startBtn = document.getElementById('btn-stopwatch-start');
  const resetBtn = document.getElementById('btn-stopwatch-reset');
  const lapBtn = document.getElementById('btn-stopwatch-lap');

  startBtn.addEventListener('click', () => {
    if (swRunning) {
      // Pause
      clearInterval(swInterval);
      swElapsed += Date.now() - swStart;
      swRunning = false;
      startBtn.textContent = 'Start';
      lapBtn.disabled = true;
    } else {
      // Start
      swStart = Date.now();
      swRunning = true;
      startBtn.textContent = 'Pause';
      lapBtn.disabled = false;
      swInterval = setInterval(() => {
        const total = swElapsed + (Date.now() - swStart);
        display.textContent = formatMs(total);
      }, 50);
    }
  });

  resetBtn.addEventListener('click', () => {
    clearInterval(swInterval);
    swRunning = false;
    swElapsed = 0;
    swLaps = [];
    display.textContent = '00:00:00';
    startBtn.textContent = 'Start';
    lapBtn.disabled = true;
    document.getElementById('stopwatch-laps').innerHTML = '';
  });

  lapBtn.addEventListener('click', () => {
    if (!swRunning) return;
    const total = swElapsed + (Date.now() - swStart);
    swLaps.push(total);
    const lapsEl = document.getElementById('stopwatch-laps');
    const lapItem = document.createElement('div');
    lapItem.className = 'lap-item';
    lapItem.innerHTML = `<span>Lap ${swLaps.length}</span><span>${formatMs(total)}</span>`;
    lapsEl.prepend(lapItem);
  });
}

function formatMs(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════
// COUNTDOWN TIMER
// ═══════════════════════════════════════════════════════════

function initCountdown() {
  const display = document.getElementById('countdown-time');
  const startBtn = document.getElementById('btn-countdown-start');
  const resetBtn = document.getElementById('btn-countdown-reset');
  const minInput = document.getElementById('inp-countdown-min');
  const secInput = document.getElementById('inp-countdown-sec');

  function readInputs() {
    const m = Math.max(0, parseInt(minInput.value, 10) || 0);
    const s = Math.max(0, Math.min(59, parseInt(secInput.value, 10) || 0));
    return m * 60 + s;
  }

  function updateDisplay() {
    const m = Math.floor(cdLeft / 60);
    const s = cdLeft % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  startBtn.addEventListener('click', () => {
    if (cdRunning) {
      // Pause
      clearInterval(cdInterval);
      cdRunning = false;
      startBtn.textContent = 'Start';
    } else {
      // Start
      if (cdLeft <= 0) {
        cdTotal = readInputs();
        cdLeft = cdTotal;
      }
      if (cdLeft <= 0) return;
      cdRunning = true;
      startBtn.textContent = 'Pause';
      cdInterval = setInterval(() => {
        cdLeft--;
        updateDisplay();
        if (cdLeft <= 0) {
          clearInterval(cdInterval);
          cdRunning = false;
          startBtn.textContent = 'Start';
          showToast('Timer finished!');
          beep(880, 0.3, 0.5);
          beep(660, 0.25, 0.5, 0.4);
        }
      }, 1000);
    }
  });

  resetBtn.addEventListener('click', () => {
    clearInterval(cdInterval);
    cdRunning = false;
    cdTotal = readInputs();
    cdLeft = cdTotal;
    updateDisplay();
    startBtn.textContent = 'Start';
  });

  // Update display when inputs change
  minInput.addEventListener('change', () => {
    if (!cdRunning) { cdTotal = readInputs(); cdLeft = cdTotal; updateDisplay(); }
  });
  secInput.addEventListener('change', () => {
    if (!cdRunning) { cdTotal = readInputs(); cdLeft = cdTotal; updateDisplay(); }
  });

  // Initial display
  cdTotal = readInputs();
  cdLeft = cdTotal;
  updateDisplay();
}

// ═══════════════════════════════════════════════════════════
// BREATHING EXERCISE
// ═══════════════════════════════════════════════════════════

function initBreathing() {
  const circle = document.getElementById('breathing-circle');
  const label = document.getElementById('breathing-label');
  const startBtn = document.getElementById('btn-breathing-start');
  const stopBtn = document.getElementById('btn-breathing-stop');

  const phases = [
    { name: 'Inhale',  duration: 4, cls: 'inhale' },
    { name: 'Hold',    duration: 7, cls: 'hold'   },
    { name: 'Exhale',  duration: 8, cls: 'exhale' },
  ];

  function stopBreathing() {
    clearInterval(brInterval);
    brInterval = null;
    brPhase = -1;
    circle.className = 'breathing-circle';
    label.textContent = 'Ready';
  }

  function nextPhase() {
    brPhase = (brPhase + 1) % phases.length;
    const p = phases[brPhase];
    circle.className = `breathing-circle ${p.cls}`;
    let remaining = p.duration;
    label.textContent = `${p.name} ${remaining}s`;
    clearInterval(brInterval);
    brInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        nextPhase();
      } else {
        label.textContent = `${phases[brPhase].name} ${remaining}s`;
      }
    }, 1000);
  }

  startBtn.addEventListener('click', () => {
    stopBreathing();
    nextPhase();
  });
  stopBtn.addEventListener('click', stopBreathing);
}

// ═══════════════════════════════════════════════════════════
// EQUALIZER (Web Audio API)
// ═══════════════════════════════════════════════════════════

const EQ_PRESETS = {
  flat:   { bass: 0,  mid: 0,  treble: 0  },
  bass:   { bass: 8,  mid: 2,  treble: -2 },
  treble: { bass: -2, mid: 0,  treble: 8  },
  vocal:  { bass: -3, mid: 6,  treble: 3  },
  night:  { bass: 4,  mid: -2, treble: -4 },
};

function initEqualizer() {
  const bassSlider   = document.getElementById('eq-bass');
  const midSlider    = document.getElementById('eq-mid');
  const trebleSlider = document.getElementById('eq-treble');
  const bassVal      = document.getElementById('eq-bass-val');
  const midVal       = document.getElementById('eq-mid-val');
  const trebleVal    = document.getElementById('eq-treble-val');

  function updateSliderLabels() {
    bassVal.textContent   = bassSlider.value;
    midVal.textContent    = midSlider.value;
    trebleVal.textContent = trebleSlider.value;
  }

  function applyPreset(name) {
    const p = EQ_PRESETS[name];
    if (!p) return;
    bassSlider.value   = p.bass;
    midSlider.value    = p.mid;
    trebleSlider.value = p.treble;
    updateSliderLabels();
    document.querySelectorAll('.eq-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.eq === name);
    });
    localStorage.setItem('focusfi-eq', name);
  }

  // Preset buttons
  document.querySelectorAll('.eq-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.eq));
  });

  // Sliders
  [bassSlider, midSlider, trebleSlider].forEach(slider => {
    slider.addEventListener('input', () => {
      updateSliderLabels();
      // Deselect preset buttons when manually adjusting
      document.querySelectorAll('.eq-btn').forEach(b => b.classList.remove('active'));
    });
  });

  // Restore saved EQ
  const saved = localStorage.getItem('focusfi-eq') || 'flat';
  applyPreset(saved);
}

// ═══════════════════════════════════════════════════════════
// AD DETECTION & SKIP
// ═══════════════════════════════════════════════════════════

function initSkipAd() {
  document.getElementById('btn-skip-ad').addEventListener('click', () => {
    if (!player) return;
    // Reload the current stream to skip the ad
    player.loadVideo(streams[streamIndex].videoId);
    hideSkipAd();
    showToast('Reloading stream to skip ad…');
  });
}

function startAdDetection() {
  if (adCheckInterval) clearInterval(adCheckInterval);
  adCheckInterval = setInterval(checkForAd, 2000);
}

function checkForAd() {
  if (!player || !player.isReady) return;
  try {
    const p = player.player;
    // Method 1: Check if video data title contains "advertisement" patterns
    const videoData = p.getVideoData ? p.getVideoData() : null;
    const currentUrl = p.getVideoUrl ? p.getVideoUrl() : '';

    // Method 2: For live streams, duration is 0 or very large.
    // During ads, duration is short and finite.
    const duration = p.getDuration ? p.getDuration() : 0;
    const state = p.getPlayerState();
    const isPlaying = state === YT.PlayerState.PLAYING;

    // If the video is playing with a short finite duration (ad),
    // or the current video URL doesn't match our expected video
    const expectedId = streams[streamIndex].videoId;
    const urlHasOurVideo = currentUrl.includes(expectedId);

    // Heuristic: playing + short duration (< 120s) + doesn't match our stream
    const possibleAd = isPlaying && duration > 0 && duration < 120 && !urlHasOurVideo;

    if (possibleAd) {
      showSkipAd();
    } else {
      hideSkipAd();
    }
  } catch {
    // Player API call failed, ignore
  }
}

function showSkipAd() {
  document.getElementById('skip-ad-overlay').classList.remove('hidden');
}

function hideSkipAd() {
  document.getElementById('skip-ad-overlay').classList.add('hidden');
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
// CLOCK (header)
// ═══════════════════════════════════════════════════════════

function initClock() {
  const el = document.getElementById('clock');
  function tick() {
    const opts = { hour: '2-digit', minute: '2-digit' };
    if (settings.clockFormat === '12h') opts.hour12 = true;
    else if (settings.clockFormat === '24h') opts.hour12 = false;
    el.textContent = new Date().toLocaleTimeString([], opts);
  }
  tick();
  setInterval(tick, 1000);
}

// ═══════════════════════════════════════════════════════════
// BIG CLOCK (centre of gradient background)
// ═══════════════════════════════════════════════════════════

function initBigClock() {
  function tick() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const use12 = settings.clockFormat === '12h' ||
      (settings.clockFormat === 'system' &&
        /[AP]M/i.test(new Date().toLocaleTimeString([], { hour: 'numeric' })));

    let ampm = '';
    if (use12) {
      ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
    }

    document.getElementById('big-clock-hours').textContent   = use12 ? String(hours) : String(hours).padStart(2, '0');
    document.getElementById('big-clock-minutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('big-clock-seconds').textContent = String(seconds).padStart(2, '0');
    document.getElementById('big-clock-ampm').textContent    = ampm;

    document.getElementById('big-clock-date').textContent = now.toLocaleDateString([], {
      weekday: 'long',
      year:    'numeric',
      month:   'long',
      day:     'numeric',
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

// ═══════════════════════════════════════════════════════════
// AMBIENT SOUNDS (Web Audio API — generated noise)
// ═══════════════════════════════════════════════════════════

const AMBIENT_SOUNDS = [
  { id: 'rain',      name: 'Rain',      type: 'brown' },
  { id: 'wind',      name: 'Wind',      type: 'pink'  },
  { id: 'white',     name: 'White Noise', type: 'white' },
  { id: 'fireplace', name: 'Fireplace', type: 'crackle' },
  { id: 'forest',    name: 'Forest',    type: 'filtered-pink' },
  { id: 'ocean',     name: 'Ocean',     type: 'ocean' },
];

let ambientCtx = null;
const ambientNodes = {};

function initAmbientSounds() {
  const grid = document.getElementById('ambient-grid');
  const volSlider = document.getElementById('ambient-volume');

  AMBIENT_SOUNDS.forEach(s => {
    const item = document.createElement('div');
    item.className = 'ambient-item';
    item.dataset.id = s.id;
    item.innerHTML = `<svg class="ambient-icon"><use href="#ic-headphones"/></svg><span class="ambient-name">${s.name}</span>`;
    item.addEventListener('click', () => toggleAmbient(s));
    grid.appendChild(item);
  });

  volSlider.addEventListener('input', () => {
    const vol = parseInt(volSlider.value, 10) / 100;
    Object.values(ambientNodes).forEach(n => {
      if (n.gain) n.gain.gain.setValueAtTime(vol * 0.3, n.ctx.currentTime);
    });
  });
}

function getAmbientCtx() {
  if (!ambientCtx) ambientCtx = new (window.AudioContext || window.webkitAudioContext)();
  return ambientCtx;
}

function toggleAmbient(sound) {
  const item = document.querySelector(`.ambient-item[data-id="${sound.id}"]`);
  if (ambientNodes[sound.id]) {
    // Stop
    ambientNodes[sound.id].source.stop();
    delete ambientNodes[sound.id];
    item.classList.remove('active');
  } else {
    // Start
    try {
      const ctx = getAmbientCtx();
      const vol = parseInt(document.getElementById('ambient-volume').value, 10) / 100;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
      gain.connect(ctx.destination);

      const bufferSize = 2 * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Generate different noise types
      if (sound.type === 'white') {
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      } else if (sound.type === 'pink' || sound.type === 'filtered-pink') {
        let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
        for (let i = 0; i < bufferSize; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759;
          b2 = 0.96900*b2 + w*0.1538520; b3 = 0.86650*b3 + w*0.3104856;
          b4 = 0.55000*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.0168980;
          data[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
          b6 = w * 0.115926;
        }
      } else if (sound.type === 'brown' || sound.type === 'crackle') {
        let last = 0;
        for (let i = 0; i < bufferSize; i++) {
          const w = Math.random() * 2 - 1;
          data[i] = (last + (0.02 * w)) / 1.02;
          last = data[i];
          data[i] *= 3.5;
          if (sound.type === 'crackle' && Math.random() < 0.001) {
            data[i] += (Math.random() - 0.5) * 0.5;
          }
        }
      } else if (sound.type === 'ocean') {
        let last = 0;
        for (let i = 0; i < bufferSize; i++) {
          const t = i / ctx.sampleRate;
          const wave = Math.sin(t * 0.15 * Math.PI * 2) * 0.5 + 0.5;
          const w = Math.random() * 2 - 1;
          data[i] = (last + (0.02 * w)) / 1.02;
          last = data[i];
          data[i] *= 3.5 * wave;
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();

      ambientNodes[sound.id] = { source, gain, ctx };
      item.classList.add('active');
    } catch { /* AudioContext not available */ }
  }
}

// ═══════════════════════════════════════════════════════════
// FOCUS QUOTE
// ═══════════════════════════════════════════════════════════

const QUOTES = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: 'It is during our darkest moments that we must focus to see the light.', author: 'Aristotle' },
  { text: 'Concentrate all your thoughts upon the work at hand.', author: 'Alexander Graham Bell' },
  { text: 'The successful warrior is the average man, with laser-like focus.', author: 'Bruce Lee' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'You don\'t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'Don\'t count the days, make the days count.', author: 'Muhammad Ali' },
  { text: 'Your limitation — it\'s only your imagination.', author: 'Unknown' },
  { text: 'Dream it. Wish it. Do it.', author: 'Unknown' },
  { text: 'Great things never come from comfort zones.', author: 'Unknown' },
  { text: 'The harder you work for something, the greater you\'ll feel when you achieve it.', author: 'Unknown' },
  { text: 'Stay focused, go after your dreams, and keep moving toward your goals.', author: 'LL Cool J' },
  { text: 'Deep work is the ability to focus without distraction on a cognitively demanding task.', author: 'Cal Newport' },
  { text: 'Where focus goes, energy flows.', author: 'Tony Robbins' },
];

let quoteIndex = Math.floor(Math.random() * QUOTES.length);

function initQuote() {
  showQuote();
  document.getElementById('btn-new-quote').addEventListener('click', () => {
    quoteIndex = (quoteIndex + 1) % QUOTES.length;
    showQuote();
  });
}

function showQuote() {
  const q = QUOTES[quoteIndex];
  document.getElementById('focus-quote-text').textContent = q.text;
  document.getElementById('focus-quote-author').textContent = `— ${q.author}`;
}

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════

function initSettings() {
  // Apply theme
  document.documentElement.dataset.theme = settings.theme;

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    btn.addEventListener('click', () => {
      settings.theme = btn.dataset.theme;
      document.documentElement.dataset.theme = settings.theme;
      saveSettings();
      document.querySelectorAll('.theme-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.theme === settings.theme)
      );
    });
  });

  // Clock format buttons
  document.querySelectorAll('.clock-fmt-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.fmt === settings.clockFormat);
    btn.addEventListener('click', () => {
      settings.clockFormat = btn.dataset.fmt;
      saveSettings();
      document.querySelectorAll('.clock-fmt-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.fmt === settings.clockFormat)
      );
    });
  });
}

// ═══════════════════════════════════════════════════════════
// VISUALIZER (canvas animation)
// ═══════════════════════════════════════════════════════════

let vizAnimId = null;
let vizCanvas = null;
let vizCtx = null;
let vizBars = [];

function initVisualizer() {
  vizCanvas = document.getElementById('bg-visualizer');
  vizCtx = vizCanvas.getContext('2d');
  const barCount = 64;
  vizBars = Array.from({ length: barCount }, () => ({
    speed: 0.5 + Math.random() * 2,
    phase: Math.random() * Math.PI * 2,
    amplitude: 0.3 + Math.random() * 0.7,
  }));
  window.addEventListener('resize', resizeVizCanvas);
}

function resizeVizCanvas() {
  if (!vizCanvas) return;
  vizCanvas.width = window.innerWidth;
  vizCanvas.height = window.innerHeight;
}

function startVisualizer() {
  if (vizAnimId) return;
  resizeVizCanvas();

  function draw() {
    const { width, height } = vizCanvas;
    vizCtx.clearRect(0, 0, width, height);
    const time = performance.now() / 1000;
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#7c6af5';
    const rgb = hexToRgb(accent);
    const barCount = vizBars.length;
    const barW = width / barCount;

    for (let i = 0; i < barCount; i++) {
      const b = vizBars[i];
      const w1 = Math.sin(time * b.speed + b.phase);
      const w2 = Math.sin(time * 0.7 + i * 0.15);
      const w3 = Math.sin(time * 0.3 + i * 0.05);
      const h = Math.max(4,
        ((w1 * 0.5 + 0.5) * (w2 * 0.3 + 0.7) * (w3 * 0.2 + 0.8) * b.amplitude) * height * 0.55
      );
      const x = i * barW;
      const y = height - h;
      const grad = vizCtx.createLinearGradient(x, height, x, y);
      grad.addColorStop(0, `rgba(${rgb},0.6)`);
      grad.addColorStop(0.5, `rgba(${rgb},0.25)`);
      grad.addColorStop(1, `rgba(${rgb},0.06)`);
      vizCtx.fillStyle = grad;
      vizCtx.fillRect(x + 1, y, barW - 2, h);
    }
    vizAnimId = requestAnimationFrame(draw);
  }
  draw();
}

function stopVisualizer() {
  if (vizAnimId) {
    cancelAnimationFrame(vizAnimId);
    vizAnimId = null;
  }
  if (vizCtx && vizCanvas) {
    vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
  }
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  if (hex.length !== 6) return '124,106,245';
  return `${parseInt(hex.substring(0,2),16)},${parseInt(hex.substring(2,4),16)},${parseInt(hex.substring(4,6),16)}`;
}

// ═══════════════════════════════════════════════════════════
// EASTER EGGS
// ═══════════════════════════════════════════════════════════

function initEasterEggs() {
  // ── Konami Code: up up down down left right left right b a ──
  const konamiSequence = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let konamiPos = 0;
  document.addEventListener('keydown', (e) => {
    if (e.key === konamiSequence[konamiPos]) {
      konamiPos++;
      if (konamiPos === konamiSequence.length) {
        konamiPos = 0;
        triggerKonamiEgg();
      }
    } else {
      konamiPos = e.key === konamiSequence[0] ? 1 : 0;
    }
  });

  // ── Logo click 5 times → secret message ──
  let logoClicks = 0;
  let logoTimer = null;
  const logo = document.querySelector('.logo-text');
  if (logo) {
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', () => {
      logoClicks++;
      clearTimeout(logoTimer);
      logoTimer = setTimeout(() => { logoClicks = 0; }, 2000);
      if (logoClicks >= 5) {
        logoClicks = 0;
        logo.classList.add('logo-secret');
        showToast('You found a secret! Stay focused, stay awesome.');
        setTimeout(() => logo.classList.remove('logo-secret'), 4000);
      }
    });
  }

  // ── Type "zen" while no input is focused → calming pulse ──
  let zenBuffer = '';
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    zenBuffer += e.key.toLowerCase();
    if (zenBuffer.length > 10) zenBuffer = zenBuffer.slice(-10);
    if (zenBuffer.endsWith('zen')) {
      zenBuffer = '';
      triggerZenMode();
    }
  });
}

function triggerKonamiEgg() {
  showToast('Konami code activated! Enjoy the spin.');
  document.body.classList.add('easter-spin');
  setTimeout(() => document.body.classList.remove('easter-spin'), 2000);
}

function triggerZenMode() {
  showToast('Zen mode — breathe and focus.');
  const bg = document.getElementById('bg-gradient');
  const original = bg.style.animation;
  bg.style.animation = 'gradShift 60s ease infinite';
  setTimeout(() => { bg.style.animation = original || ''; }, 30000);
}
