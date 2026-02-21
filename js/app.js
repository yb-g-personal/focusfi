/**
 * app.js — focusfi main entry point
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

// ── Spotify playlists ──────────────────────────────────────
const SPOTIFY_PLAYLISTS = [
  { name: 'Lofi Beats',             uri: '0vvXsWCC9xrXsKd4FyS8kM', desc: 'Chill lofi hip hop beats' },
  { name: 'Peaceful Piano',         uri: '37i9dQZF1DX4sWSpwq3LiO', desc: 'Relax with piano' },
  { name: 'Deep Focus',             uri: '37i9dQZF1DWZeKCadgRdKQ', desc: 'Deep focus music' },
  { name: 'Jazz Vibes',             uri: '37i9dQZF1DX0SM0LYsmbMT', desc: 'Jazz for studying' },
  { name: 'Ambient Chill',          uri: '37i9dQZF1DX3Ogo9pFvBkY', desc: 'Ambient soundscapes' },
  { name: 'Brain Food',             uri: '37i9dQZF1DWXe9gFZP0gtP', desc: 'Music to concentrate' },
];

// ── Application state ──────────────────────────────────────
let streams          = [...PRESETS];
let streamIndex      = 0;   // index into streams[]
let bgMode           = 'gradient';
let playerMode       = 'audio'; // 'audio' | 'bg' | 'modal'
let videoList        = [];
let videoIndex       = 0;
let videoShuffle     = false;  // true = shuffle, false = loop one
let videoShuffleTimer = null;  // 1-min timer for shuffle auto-switch
let zenActive        = false;
let musicSource      = 'youtube'; // 'youtube' | 'spotify'
let spotifyIndex     = 0;
let spotifyController = null;
let spotifyPaused     = true;
let spotifyForeground = false;
let adSkipCooldown    = false;

/** @type {YouTubePlayer} */  let player;
/** @type {PomodoroTimer} */  let timer;
/** @type {TaskList}      */ let taskList;
/** @type {Notes}         */ let notes;

// Stopwatch state
let swRunning = false, swElapsed = 0, swStart = 0, swInterval = null, swLaps = [];
// Countdown state
let cdRunning = false, cdTotal = 300, cdLeft = 300, cdInterval = null;
// Breathing state
let brInterval = null, brPhase = -1;
// Ad detection
const MAX_AD_DURATION_SECONDS = 120;
let adCheckInterval = null;

// ── Settings state ─────────────────────────────────────────
let settings = { theme: 'dark', clockFormat: 'system', scene: 'gradient', showSeconds: false, showDate: true, notifSounds: true, autoResume: true, showQuoteOnStart: false, showBriefs: true };

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
  initSkipAd();
  initAmbientSounds();
  initQuote();
  initClockClick();
  initEasterEggs();
  initMusicSource();
  initVideoControls();
  initSpotifyUI();
  initRunningTools();
  initCredits();
  initSettingHelps();
  initZenExit();
  loadVideos();

  // Pre-init Spotify controller so it's ready when user switches source
  ensureSpotifyController();

  // Restore last background mode
  setBackground(settings.scene, true);

  // Show quote on start if enabled
  if (settings.showQuoteOnStart) {
    const quotePanel = document.getElementById('quote-panel');
    if (quotePanel) quotePanel.classList.remove('hidden');
  }

  // Dismiss loader after animations complete (min 2s)
  dismissLoader();
});

// ── Loader ─────────────────────────────────────────────────
function dismissLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;
  const enterBtn = document.getElementById('loader-enter');
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      playLoaderChime();
      loader.classList.add('fade-out');
      loader.addEventListener('transitionend', () => {
        loader.classList.add('done');
      }, { once: true });
    });
  }
}

/** Ethereal heavenly chime — layered pads + shimmer over the loader. */
function playLoaderChime() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const now  = ctx.currentTime;

    // Master gain
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.18, now);
    master.connect(ctx.destination);

    // Reverb via convolver (synthetic impulse)
    const convolver  = ctx.createConvolver();
    const reverbLen  = ctx.sampleRate * 2.5;
    const impulse    = ctx.createBuffer(2, reverbLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < reverbLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, 2.2);
      }
    }
    convolver.buffer = impulse;

    // Dry/wet mix
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    dryGain.gain.value = 0.45;
    wetGain.gain.value = 0.55;
    dryGain.connect(master);
    convolver.connect(wetGain);
    wetGain.connect(master);

    // Pad chord: Cmaj7 spread across octaves — ethereal voicing
    const padNotes = [
      { freq: 261.63, start: 0,   dur: 2.8 },  // C4
      { freq: 329.63, start: 0.1, dur: 2.6 },  // E4
      { freq: 392.00, start: 0.2, dur: 2.5 },  // G4
      { freq: 493.88, start: 0.3, dur: 2.4 },  // B4
      { freq: 523.25, start: 0.15,dur: 2.5 },  // C5
    ];

    padNotes.forEach(({ freq, start, dur }) => {
      // Two detuned oscillators for warmth
      [-4, 4].forEach(detune => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type            = 'sine';
        osc.frequency.value = freq;
        osc.detune.value    = detune;
        // Slow swell in, long fade out
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.07, now + start + 0.6);
        gain.gain.setValueAtTime(0.07, now + start + dur * 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
        osc.connect(gain);
        gain.connect(dryGain);
        gain.connect(convolver);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.1);
      });
    });

    // Shimmer arpeggiated bells on top
    const shimmer = [
      { freq: 1046.50, start: 0.3, dur: 1.2 },  // C6
      { freq: 1318.51, start: 0.6, dur: 1.0 },  // E6
      { freq: 1567.98, start: 0.9, dur: 1.0 },  // G6
      { freq: 1975.53, start: 1.2, dur: 1.2 },  // B6
    ];

    shimmer.forEach(({ freq, start, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.04, now + start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain);
      gain.connect(dryGain);
      gain.connect(convolver);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.1);
    });

  } catch { /* AudioContext blocked or unavailable */ }
}

// ── YouTube API ready ──────────────────────────────────────
function handleYTReady() {
  if (player) return; // Already initialized (guard against double-fire)
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
    // Ensure the stream starts playing (autoplay may be blocked)
    if (!player.isPlaying()) {
      player.play();
    }
  });

  player.onStateChange((e) => {
    const s = e.data;
    if (musicSource !== 'youtube') return; // Ignore YT state when Spotify is active
    updatePlayBtn(s === YT.PlayerState.PLAYING);
    if      (s === YT.PlayerState.PLAYING)   setStreamStatus('Live');
    else if (s === YT.PlayerState.BUFFERING) setStreamStatus('Loading\u2026');
    else if (s === YT.PlayerState.PAUSED)    setStreamStatus('Paused');
    else if (s === YT.PlayerState.ENDED)     setStreamStatus('Ended');
  });
}

// Guard against race: if YT API loaded before module executed, fire immediately
if (window._ytApiReady) {
  handleYTReady();
} else {
  window.addEventListener('yt-ready', handleYTReady);
}

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
  // If saved mode was visualizer, fall back to gradient
  if (mode === 'visualizer') mode = 'gradient';
  bgMode = mode;
  settings.scene = mode;
  saveSettings();

  document.querySelectorAll('.bg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.bg === mode);
  });

  // Background layer visibility
  document.getElementById('bg-gradient').classList.toggle('active', mode === 'gradient');
  document.getElementById('bg-gif').classList.toggle('active', mode === 'gif');

  // Big clock: centered on gradient, shrink-transition for others
  const bigClock = document.getElementById('big-clock');
  bigClock.classList.toggle('mini', mode !== 'gradient');

  // Header clock: hidden in clock scene, visible otherwise
  const headerClock = document.getElementById('clock');
  headerClock.classList.toggle('clock-scene', mode === 'gradient');

  // stream background
  if (mode === 'stream') {
    if (playerMode !== 'modal') setPlayerMode('bg');
  } else {
    if (playerMode === 'bg') setPlayerMode('audio');
  }

  // Show/hide video background controls
  const vidControls = document.getElementById('video-bg-controls');
  if (vidControls) vidControls.classList.toggle('hidden', mode !== 'gif');

  // Play/pause background video + manage shuffle timer
  const bgVid = document.getElementById('bg-video');
  if (bgVid) {
    if (mode === 'gif') {
      bgVid.play().catch(() => {});
      if (videoShuffle && videoList.length > 1 && !videoShuffleTimer) {
        startVideoShuffleTimer();
      }
    } else {
      bgVid.pause();
      clearInterval(videoShuffleTimer);
      videoShuffleTimer = null;
    }
  }

  if (!silent && mode === 'gif' && videoList.length === 0) {
    showToast('Add MP4s to assets/videos/ and update manifest.json');
  }
}

// ─── Video background loading ─────────────────────────────
async function loadVideos() {
  try {
    const res  = await fetch('assets/videos/manifest.json');
    const data = await res.json();
    videoList = Array.isArray(data) ? data : (data.files || []);
    if (videoList.length > 0) {
      showVideo(0);
      // If video bg mode was restored before manifest loaded, start playback now
      if (bgMode === 'gif') {
        const bgVid = document.getElementById('bg-video');
        if (bgVid) bgVid.play().catch(() => {});
      }
    }
  } catch { /* no manifest yet */ }
}

function showVideo(i) {
  if (videoList.length === 0) return;
  videoIndex = i;
  const vid = document.getElementById('bg-video');
  // Dissolve transition: fade out, swap, fade in
  vid.classList.add('dissolve-out');
  setTimeout(() => {
    vid.src = `assets/videos/${videoList[i]}`;
    vid.load();
    if (bgMode === 'gif') {
      vid.play().catch(() => {});
    }
    // Wait for video to start, then fade in
    vid.addEventListener('canplay', () => {
      vid.classList.remove('dissolve-out');
    }, { once: true });
    // Fallback fade-in if canplay doesn't fire quickly
    setTimeout(() => vid.classList.remove('dissolve-out'), 300);
  }, 400); // match CSS transition duration
  // Update name display
  const nameEl = document.getElementById('video-name');
  if (nameEl) {
    const name = videoList[i].replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    nameEl.textContent = name || `Video ${i + 1}`;
  }
}

function onBgVideoEnded() {
  if (videoShuffle && videoList.length > 1) {
    let next;
    do { next = Math.floor(Math.random() * videoList.length); } while (next === videoIndex);
    videoIndex = next;
    showVideo(videoIndex);
  }
  // if not shuffle, video.loop handles it
}

function setVideoMode(shuffle) {
  videoShuffle = shuffle;
  const vid = document.getElementById('bg-video');
  vid.loop = !shuffle;
  document.querySelectorAll('.vid-mode-btn').forEach(b => {
    b.classList.toggle('active', (b.dataset.vidmode === 'shuffle') === shuffle);
  });
  // Manage the 1-minute auto-switch timer
  clearInterval(videoShuffleTimer);
  videoShuffleTimer = null;
  if (shuffle && bgMode === 'gif' && videoList.length > 1) {
    startVideoShuffleTimer();
  }
}

function startVideoShuffleTimer() {
  clearInterval(videoShuffleTimer);
  videoShuffleTimer = setInterval(() => {
    if (!videoShuffle || bgMode !== 'gif' || videoList.length <= 1) {
      clearInterval(videoShuffleTimer);
      videoShuffleTimer = null;
      return;
    }
    let next;
    do { next = Math.floor(Math.random() * videoList.length); } while (next === videoIndex);
    videoIndex = next;
    showVideo(videoIndex);
  }, 60000); // 1 minute
}

function prevVideo() {
  if (videoList.length === 0) return;
  videoIndex = (videoIndex - 1 + videoList.length) % videoList.length;
  showVideo(videoIndex);
}

function nextVideo() {
  if (videoList.length === 0) return;
  videoIndex = (videoIndex + 1) % videoList.length;
  showVideo(videoIndex);
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
  // Keep yt-wrapper hidden when Spotify is the active source
  if (musicSource === 'spotify') wrapper.classList.add('source-hidden');
  playerMode = mode;

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.toggle('hidden', mode !== 'modal');

  // Hide yt-cover in modal mode so user can interact with YouTube controls
  const cover = document.getElementById('yt-cover');
  if (cover) cover.style.display = (mode === 'modal') ? 'none' : '';

  // reflect in the view button
  document.getElementById('btn-view').classList.toggle('active', mode === 'modal');
}

// ═══════════════════════════════════════════════════════════
// PLAYER CONTROLS
// ═══════════════════════════════════════════════════════════

function initPlayerControls() {
  document.getElementById('btn-play-pause').addEventListener('click', () => {
    if (musicSource === 'spotify' && spotifyController) {
      spotifyController.togglePlay();
    } else if (musicSource === 'youtube' && player) {
      player.toggle();
    }
  });

  document.getElementById('btn-prev').addEventListener('click', () => {
    if (musicSource === 'spotify') { prevSpotify(); } else { prevStream(); }
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    if (musicSource === 'spotify') { nextSpotify(); } else { nextStream(); }
  });

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

  // clicking stream name/icon opens foreground
  document.querySelector('.player-stream-info').addEventListener('click', toggleForeground);

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
  if (musicSource === 'spotify') {
    // Toggle Spotify foreground modal
    spotifyForeground = !spotifyForeground;
    const wrapper = document.getElementById('spotify-wrapper');
    const overlay = document.getElementById('modal-overlay');
    if (spotifyForeground) {
      // Ensure wrapper is visible first, then add modal class
      wrapper.classList.remove('hidden');
      wrapper.classList.add('spotify-modal');
      overlay.classList.remove('hidden');
      document.getElementById('btn-view').classList.add('active');
    } else {
      wrapper.classList.remove('spotify-modal');
      overlay.classList.add('hidden');
      document.getElementById('btn-view').classList.remove('active');
    }
    return;
  }
  if (playerMode === 'modal') {
    closeForeground();
  } else {
    setPlayerMode('modal');
  }
}

function closeForeground() {
  // Handle Spotify foreground close
  if (spotifyForeground) {
    spotifyForeground = false;
    document.getElementById('spotify-wrapper').classList.remove('spotify-modal');
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('btn-view').classList.remove('active');
    return;
  }
  setPlayerMode(bgMode === 'stream' ? 'bg' : 'audio');
}

// ═══════════════════════════════════════════════════════════
// SPOTIFY INTEGRATION (Enhanced Embed)
// ═══════════════════════════════════════════════════════════

function setMusicSource(source) {
  const prevSource = musicSource;
  musicSource = source;
  localStorage.setItem('focusfi-music-source', source);

  const ytWrapper      = document.getElementById('yt-wrapper');
  const spotifyWrapper = document.getElementById('spotify-wrapper');
  const spotifySection = document.getElementById('spotify-section');

  document.querySelectorAll('.source-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.source === source);
  });

  // Show/hide Spotify section in settings
  if (spotifySection) spotifySection.classList.toggle('hidden', source !== 'spotify');

  if (source === 'spotify') {
    // Fade out YouTube before switching
    if (prevSource === 'youtube' && player) {
      fadeOutYouTube(() => {
        ytWrapper.classList.add('source-hidden');
      });
    } else {
      ytWrapper.classList.add('source-hidden');
    }
    spotifyWrapper.classList.remove('hidden');
    loadSpotifyPlaylist(spotifyIndex);
    document.getElementById('btn-view').style.display = '';
    hideSkipAd();
  } else {
    // Fade in YouTube
    spotifyWrapper.classList.add('hidden');
    ytWrapper.classList.remove('source-hidden');
    document.getElementById('btn-view').style.display = '';
    updateStreamName();
    if (player) {
      setStreamStatus('Live');
      // If coming from spotify, fade in
      if (prevSource === 'spotify') {
        fadeInYouTube();
      } else {
        player.play();
      }
    }
  }
}

/** Fade YT volume out over 500ms, then call cb and pause. */
function fadeOutYouTube(cb) {
  if (!player || !player.player || typeof player.player.getVolume !== 'function') {
    if (player) player.pause();
    cb?.();
    return;
  }
  const startVol = player.player.getVolume();
  const steps = 10;
  let step = 0;
  const iv = setInterval(() => {
    step++;
    const v = Math.max(0, startVol * (1 - step / steps));
    try { player.player.setVolume(v); } catch {}
    if (step >= steps) {
      clearInterval(iv);
      player.pause();
      try { player.player.setVolume(startVol); } catch {}
      cb?.();
    }
  }, 50);
}

/** Resume YT and fade volume in over 500ms. */
function fadeInYouTube() {
  if (!player) return;
  const savedVol = parseInt(localStorage.getItem('focusfi-volume'), 10) || 50;
  try { player.player.setVolume(0); } catch {}
  player.play();
  const steps = 10;
  let step = 0;
  const iv = setInterval(() => {
    step++;
    const v = Math.min(savedVol, savedVol * (step / steps));
    try { player.player.setVolume(v); } catch {}
    if (step >= steps) clearInterval(iv);
  }, 50);
}

/**
 * Ensure the Spotify IFrame API controller is created.
 * Calls `cb` once the controller is ready.
 */
function ensureSpotifyController(cb) {
  if (spotifyController) { cb?.(); return; }
  const api = window._spotifyIFrameAPI;
  if (!api) {
    // API not loaded yet — wait for it
    window.addEventListener('spotify-iframe-ready', () => ensureSpotifyController(cb), { once: true });
    return;
  }
  const element = document.getElementById('spotify-embed');
  if (!element) return;

  // Spotify IFrame API needs the container to be visible to render
  const wrapper = document.getElementById('spotify-wrapper');
  const wasHidden = wrapper && wrapper.classList.contains('hidden');
  if (wasHidden) wrapper.classList.remove('hidden');

  const options = {
    width: '100%',
    height: 352,
    uri: `spotify:playlist:${SPOTIFY_PLAYLISTS[spotifyIndex].uri}`,
  };
  api.createController(element, options, (controller) => {
    spotifyController = controller;
    // Re-hide if Spotify isn't the active source yet
    if (wasHidden && musicSource !== 'spotify') wrapper.classList.add('hidden');
    controller.addListener('playback_update', (e) => {
      if (musicSource !== 'spotify') return;
      spotifyPaused = e.data.isPaused;
      updatePlayBtn(!e.data.isPaused);
    });
    controller.addListener('ready', () => {
      cb?.();
    });
  });
}

/**
 * Convert a Spotify URL/URI/ID to a canonical spotify:type:id URI.
 */
function toSpotifyUri(input, fallbackType = 'playlist') {
  if (input.startsWith('spotify:')) return input;
  if (input.startsWith('http')) {
    try {
      const url = new URL(input);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return `spotify:${parts[0]}:${parts[1].split('?')[0]}`;
    } catch { /* not a URL */ }
  }
  return `spotify:${fallbackType}:${input}`;
}

function loadSpotifyPlaylist(index) {
  spotifyIndex = index;
  const pl = SPOTIFY_PLAYLISTS[index];
  document.getElementById('stream-name').textContent = pl.name;
  document.getElementById('stream-status').textContent = 'Spotify';
  // Update preset highlights
  document.querySelectorAll('.spotify-preset-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });
  ensureSpotifyController(() => {
    spotifyController.loadUri(`spotify:playlist:${pl.uri}`);
  });
}

function loadSpotifyCustomUrl(input) {
  const raw = input.trim();
  if (!raw) return;
  const uri = toSpotifyUri(raw);
  document.getElementById('stream-name').textContent = 'Custom Playlist';
  document.getElementById('stream-status').textContent = 'Spotify';
  document.querySelectorAll('.spotify-preset-btn').forEach(b => b.classList.remove('active'));
  ensureSpotifyController(() => {
    spotifyController.loadUri(uri);
  });
  showToast('Loading Spotify playlist…');
}

function prevSpotify() {
  spotifyIndex = (spotifyIndex - 1 + SPOTIFY_PLAYLISTS.length) % SPOTIFY_PLAYLISTS.length;
  loadSpotifyPlaylist(spotifyIndex);
  showToast(`Switched to ${SPOTIFY_PLAYLISTS[spotifyIndex].name}`);
}

function nextSpotify() {
  spotifyIndex = (spotifyIndex + 1) % SPOTIFY_PLAYLISTS.length;
  loadSpotifyPlaylist(spotifyIndex);
  showToast(`Switched to ${SPOTIFY_PLAYLISTS[spotifyIndex].name}`);
}

// ── Spotify UI setup ──────────────────────────────────────

function initSpotifyUI() {
  // Build playlist presets grid
  const presetsGrid = document.getElementById('spotify-presets-grid');
  if (presetsGrid) {
    presetsGrid.innerHTML = '';
    SPOTIFY_PLAYLISTS.forEach((pl, i) => {
      const btn = document.createElement('button');
      btn.className = `spotify-preset-btn preset-btn${i === spotifyIndex ? ' active' : ''}`;
      btn.textContent = pl.name;
      btn.title = pl.desc;
      btn.addEventListener('click', () => {
        loadSpotifyPlaylist(i);
        showToast(`Playing ${pl.name}`);
      });
      presetsGrid.appendChild(btn);
    });
  }

  // Custom URL input
  const loadBtn  = document.getElementById('btn-spotify-load');
  const urlInput = document.getElementById('spotify-custom-url');
  if (loadBtn && urlInput) {
    loadBtn.addEventListener('click', () => loadSpotifyCustomUrl(urlInput.value));
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadSpotifyCustomUrl(urlInput.value);
    });
  }
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
        document.title = `${timer.format(secs)} — focusfi`;
      }
      // Update big clock Pomodoro overlay
      updateBigClockPomo(secs);
    },
    onEnd: (mode) => {
      if (mode === 'focus') {
        if (player) player.pause();
        startAlarm('Focus session complete — take a break!');
      } else {
        if (player && settings.autoResume) player.play();
        startAlarm('Break over — back to work!');
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
      document.title = 'focusfi';
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
  let endHours = endDate.getHours();
  const endMinutes = String(endDate.getMinutes()).padStart(2, '0');

  const use12 = settings.clockFormat === '12h' ||
    (settings.clockFormat === 'system' &&
      /[AP]M/i.test(new Date().toLocaleTimeString([], { hour: 'numeric' })));

  let endStr;
  if (use12) {
    const ampm = endHours >= 12 ? 'PM' : 'AM';
    endHours = endHours % 12 || 12;
    endStr = `${endHours}:${endMinutes} ${ampm}`;
  } else {
    endStr = `${String(endHours).padStart(2, '0')}:${endMinutes}`;
  }
  document.getElementById('big-clock-pomo-end').textContent = `ends at ${endStr}`;
}

/**
 * Tiny Web Audio beep — no audio files needed.
 * @param {number} freq      Hz
 * @param {number} vol       0–1 gain
 * @param {number} duration  seconds
 * @param {number} [delay]   seconds before starting (default 0)
 */
function beep(freq, vol, duration, delay = 0) {
  if (!settings.notifSounds) return;
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

// ── Persistent Alarm ──────────────────────────────────────
let alarmCtx  = null;
let alarmOscs = [];
let alarmInterval = null;

/**
 * Show the alarm overlay and play a looping alarm sound.
 * @param {string} message  Text to show in the overlay
 */
function startAlarm(message = "Time's up!") {
  if (!settings.notifSounds) {
    // Still show the visual overlay even if sounds are off
    showAlarmOverlay(message);
    return;
  }

  showAlarmOverlay(message);

  try {
    alarmCtx = new (window.AudioContext || window.webkitAudioContext)();
    playAlarmPattern();
    // Repeat the pattern every 1.6s
    alarmInterval = setInterval(playAlarmPattern, 1600);
  } catch { /* AudioContext unavailable */ }
}

function playAlarmPattern() {
  if (!alarmCtx) return;
  const ctx = alarmCtx;
  const now = ctx.currentTime;

  // Two-tone alternating alarm: high-low-high-low
  const pattern = [
    { freq: 880,  start: 0,    dur: 0.18 },
    { freq: 660,  start: 0.22, dur: 0.18 },
    { freq: 880,  start: 0.44, dur: 0.18 },
    { freq: 660,  start: 0.66, dur: 0.18 },
    { freq: 988,  start: 0.9,  dur: 0.25 },  // higher peak note
    { freq: 660,  start: 1.2,  dur: 0.18 },
  ];

  pattern.forEach(({ freq, start, dur }) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.22, now + start + 0.02);
    gain.gain.setValueAtTime(0.22, now + start + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.05);
    alarmOscs.push(osc);
  });
}

function stopAlarm() {
  // Stop audio
  clearInterval(alarmInterval);
  alarmInterval = null;
  alarmOscs.forEach(osc => { try { osc.stop(); } catch {} });
  alarmOscs = [];
  if (alarmCtx) { try { alarmCtx.close(); } catch {} alarmCtx = null; }
  // Hide overlay
  hideAlarmOverlay();
}

function showAlarmOverlay(message) {
  const overlay = document.getElementById('alarm-overlay');
  const msgEl   = document.getElementById('alarm-message');
  if (msgEl) msgEl.textContent = message;
  overlay.classList.remove('hidden');
}

function hideAlarmOverlay() {
  document.getElementById('alarm-overlay').classList.add('hidden');
}

// Wire up the stop button (runs once at init)
(function initAlarmOverlay() {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-alarm-stop')?.addEventListener('click', stopAlarm);
  });
})();

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
          startAlarm('Timer finished!');
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
// AD DETECTION & SKIP
// ═══════════════════════════════════════════════════════════

function initSkipAd() {
  document.getElementById('btn-skip-ad').addEventListener('click', (e) => {
    e.stopPropagation();
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
    if (!p || typeof p.getPlayerState !== 'function') return;
    const state = p.getPlayerState();
    const isPlaying = state === YT.PlayerState.PLAYING;

    // Check multiple heuristics for ad detection
    const duration = typeof p.getDuration === 'function' ? p.getDuration() : 0;

    // Heuristic 1: playing + short finite duration = ad
    const shortDurationAd = isPlaying && duration > 0 && duration < MAX_AD_DURATION_SECONDS;

    // Heuristic 2: URL mismatch (may fail cross-origin, so wrapped separately)
    let wrongVideoAd = false;
    try {
      const currentUrl = typeof p.getVideoUrl === 'function' ? p.getVideoUrl() : '';
      const expectedId = streams[streamIndex].videoId;
      if (currentUrl && !currentUrl.includes(expectedId)) {
        wrongVideoAd = isPlaying;
      }
    } catch { /* getVideoUrl may throw cross-origin */ }

    if (shortDurationAd || wrongVideoAd) {
      showSkipAd();
    } else {
      hideSkipAd();
    }
  } catch {
    // Player API call failed, ignore
  }
}

function showSkipAd() {
  if (adSkipCooldown) return; // Prevent rapid-fire reloads
  adSkipCooldown = true;

  document.getElementById('skip-ad-overlay').classList.remove('hidden');

  // Auto-open foreground so user can see the stream
  if (playerMode !== 'modal' && musicSource === 'youtube') {
    setPlayerMode('modal');
  }

  // Auto-skip: reload stream to bypass the ad
  if (player) {
    player.loadVideo(streams[streamIndex].videoId);
    showToast('Ad detected — auto-skipping…');
  }

  // Cooldown before next auto-skip attempt
  setTimeout(() => {
    adSkipCooldown = false;
    hideSkipAd();
  }, 8000);
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

  if (musicSource === 'spotify') {
    // Show Spotify playlists
    SPOTIFY_PLAYLISTS.forEach((pl, i) => {
      const btn       = document.createElement('button');
      btn.className   = `preset-btn${i === spotifyIndex ? ' active' : ''}`;
      btn.textContent = pl.name;
      btn.addEventListener('click', () => {
        loadSpotifyPlaylist(i);
        document.getElementById('stream-dialog').classList.add('hidden');
        showToast(`Playing ${pl.name}`);
      });
      container.appendChild(btn);
    });
    return;
  }

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
  // Header toggle buttons (Settings button)
  document.querySelectorAll('.header-right > .tool-toggle[data-panel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel  = document.getElementById(btn.dataset.panel);
      const isOpen = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', isOpen);
      btn.classList.toggle('active', !isOpen);
    });
  });

  // Tools dropdown trigger
  const toolsTrigger = document.getElementById('tools-trigger');
  const toolsMenu = document.getElementById('tools-menu');
  if (toolsTrigger && toolsMenu) {
    toolsTrigger.addEventListener('click', () => {
      const isOpen = !toolsMenu.classList.contains('hidden');
      toolsMenu.classList.toggle('hidden', isOpen);
      toolsTrigger.setAttribute('aria-expanded', String(!isOpen));
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.tools-dropdown')) {
        toolsMenu.classList.add('hidden');
        toolsTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    // Tools menu items
    document.querySelectorAll('.tools-menu-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel  = document.getElementById(btn.dataset.panel);
        const isOpen = !panel.classList.contains('hidden');
        panel.classList.toggle('hidden', isOpen);
        btn.classList.toggle('active', !isOpen);
        // Close the dropdown after selection
        toolsMenu.classList.add('hidden');
        toolsTrigger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Close buttons inside panels
  document.querySelectorAll('.close-panel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel  = document.getElementById(btn.dataset.panel);
      panel.classList.add('hidden');
      // Update the tools menu item state
      const menuItem = document.querySelector(`.tools-menu-item[data-panel="${btn.dataset.panel}"]`);
      if (menuItem) menuItem.classList.remove('active');
      // Also update header toggle if it's settings
      const toggle = document.querySelector(`.header-right > .tool-toggle[data-panel="${btn.dataset.panel}"]`);
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
        if (musicSource === 'spotify' && spotifyController) {
          spotifyController.togglePlay();
        } else if (player) {
          player.toggle();
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (musicSource === 'spotify') prevSpotify(); else prevStream();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (musicSource === 'spotify') nextSpotify(); else nextStream();
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
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const use12 = settings.clockFormat === '12h' ||
      (settings.clockFormat === 'system' &&
        /[AP]M/i.test(now.toLocaleTimeString([], { hour: 'numeric' })));

    if (use12) {
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      el.textContent = `${hours}:${minutes} ${ampm}`;
    } else {
      el.textContent = `${String(hours).padStart(2, '0')}:${minutes}`;
    }
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

    // Show/hide seconds based on setting
    document.getElementById('big-clock-seconds').classList.toggle('hidden', !settings.showSeconds);

    // Show/hide date based on setting
    const dateEl = document.getElementById('big-clock-date');
    dateEl.classList.toggle('hidden', !settings.showDate);
    if (settings.showDate) {
      dateEl.textContent = now.toLocaleDateString([], {
        weekday: 'long',
        year:    'numeric',
        month:   'long',
        day:     'numeric',
      });
    }
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
// SHARED AUDIO GRAPH (for ambient sounds)
// ═══════════════════════════════════════════════════════════

let sharedAudioCtx = null;
let sharedAnalyser = null;

function getSharedAudioGraph() {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sharedAnalyser = sharedAudioCtx.createAnalyser();
    sharedAnalyser.fftSize = 128;
    sharedAnalyser.smoothingTimeConstant = 0.82;
    sharedAnalyser.connect(sharedAudioCtx.destination);
  }
  if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
  return { ctx: sharedAudioCtx, analyser: sharedAnalyser };
}

// ═══════════════════════════════════════════════════════════
// AMBIENT SOUNDS (HTML5 Audio — loopable audio files)
// Place audio files in assets/ambient/ (mp3, ogg, or wav).
// ═══════════════════════════════════════════════════════════

const AMBIENT_SOUNDS = [
  { id: 'rain',      name: 'Rain',        icon: '#ic-headphones', file: 'rain.mp3'      },
  { id: 'wind',      name: 'Wind',        icon: '#ic-wind',       file: 'wind.mp3'      },
  { id: 'white',     name: 'White Noise',  icon: '#ic-headphones', file: 'white.mp3'     },
  { id: 'fireplace', name: 'Fireplace',   icon: '#ic-headphones', file: 'fireplace.mp3' },
  { id: 'forest',    name: 'Forest',      icon: '#ic-headphones', file: 'forest.mp3'    },
  { id: 'ocean',     name: 'Ocean',       icon: '#ic-headphones', file: 'ocean.mp3'     },
];

const ambientAudios = {};   // id → { audio: HTMLAudioElement }

function initAmbientSounds() {
  const grid = document.getElementById('ambient-grid');
  const volSlider = document.getElementById('ambient-volume');

  AMBIENT_SOUNDS.forEach(s => {
    const item = document.createElement('div');
    item.className = 'ambient-item';
    item.dataset.id = s.id;
    item.innerHTML = `<svg class="ambient-icon"><use href="${s.icon}"/></svg><span class="ambient-name">${s.name}</span>`;
    item.addEventListener('click', () => toggleAmbient(s));
    grid.appendChild(item);
  });

  volSlider.addEventListener('input', () => {
    const vol = parseInt(volSlider.value, 10) / 100;
    Object.values(ambientAudios).forEach(n => {
      if (n.gain) n.gain.gain.value = vol;
      else if (n.audio) n.audio.volume = vol;
    });
  });
}

function toggleAmbient(sound) {
  const item = document.querySelector(`.ambient-item[data-id="${sound.id}"]`);
  if (ambientAudios[sound.id]) {
    // Stop
    const entry = ambientAudios[sound.id];
    entry.audio.pause();
    entry.audio.currentTime = 0;
    if (entry.source) { try { entry.source.disconnect(); } catch {} }
    if (entry.gain)   { try { entry.gain.disconnect(); } catch {} }
    delete ambientAudios[sound.id];
    item.classList.remove('active');
  } else {
    // Start — route through shared audio graph
    const vol = parseInt(document.getElementById('ambient-volume').value, 10) / 100;
    const audio = new Audio(`assets/ambient/${sound.file}`);
    audio.loop = true;
    audio.crossOrigin = 'anonymous';

    try {
      const { ctx, analyser } = getSharedAudioGraph();
      const source = ctx.createMediaElementSource(audio);
      const gain   = ctx.createGain();
      gain.gain.value = vol;
      source.connect(gain);
      gain.connect(analyser); // gain → analyser → destination
      audio.play().then(() => {
        item.classList.add('active');
      }).catch((err) => {
        // Clean up on failure
        try { source.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
        delete ambientAudios[sound.id];
        item.classList.remove('active');
        showToast(`Could not play ${sound.name}. Add ${sound.file} to assets/ambient/`);
      });
      ambientAudios[sound.id] = { audio, source, gain };
    } catch {
      // Fallback: plain HTML Audio if Web Audio fails
      audio.volume = vol;
      audio.play().then(() => {
        item.classList.add('active');
      }).catch(() => {
        delete ambientAudios[sound.id];
        item.classList.remove('active');
        showToast(`Could not play ${sound.name}. Add ${sound.file} to assets/ambient/`);
      });
      ambientAudios[sound.id] = { audio };
    }
  }
}

// ═══════════════════════════════════════════════════════════
// FOCUS QUOTE
// ═══════════════════════════════════════════════════════════

const QUOTES = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: 'It is during our darkest moments that we must focus to see the light.', author: 'Aristotle (attributed)' },
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
  applyTheme(settings.theme);

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    btn.addEventListener('click', () => {
      settings.theme = btn.dataset.theme;
      applyTheme(settings.theme);
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

  // Show seconds toggle
  const showSecondsCb = document.getElementById('setting-show-seconds');
  if (showSecondsCb) {
    showSecondsCb.checked = settings.showSeconds;
    showSecondsCb.addEventListener('change', () => {
      settings.showSeconds = showSecondsCb.checked;
      saveSettings();
    });
  }

  // Show date toggle
  const showDateCb = document.getElementById('setting-show-date');
  if (showDateCb) {
    showDateCb.checked = settings.showDate;
    showDateCb.addEventListener('change', () => {
      settings.showDate = showDateCb.checked;
      saveSettings();
    });
  }

  // Notification sounds toggle
  const notifSoundsCb = document.getElementById('setting-notif-sounds');
  if (notifSoundsCb) {
    notifSoundsCb.checked = settings.notifSounds;
    notifSoundsCb.addEventListener('change', () => {
      settings.notifSounds = notifSoundsCb.checked;
      saveSettings();
    });
  }

  // Auto-resume toggle
  const autoResumeCb = document.getElementById('setting-auto-resume');
  if (autoResumeCb) {
    autoResumeCb.checked = settings.autoResume;
    autoResumeCb.addEventListener('change', () => {
      settings.autoResume = autoResumeCb.checked;
      saveSettings();
    });
  }

  // Show quote on start toggle
  const showQuoteCb = document.getElementById('setting-show-quote');
  if (showQuoteCb) {
    showQuoteCb.checked = settings.showQuoteOnStart;
    showQuoteCb.addEventListener('change', () => {
      settings.showQuoteOnStart = showQuoteCb.checked;
      saveSettings();
    });
  }

  // Show briefs toggle
  const showBriefsCb = document.getElementById('setting-show-briefs');
  if (showBriefsCb) {
    showBriefsCb.checked = settings.showBriefs;
    showBriefsCb.addEventListener('change', () => {
      settings.showBriefs = showBriefsCb.checked;
      saveSettings();
      const bar = document.getElementById('running-tools-bar');
      if (bar) bar.style.display = settings.showBriefs ? '' : 'none';
    });
  }

  // Auto-theme: check every minute
  if (settings.theme === 'auto') startAutoThemeTimer();
}

/** Map 'auto' to time-based theme, otherwise use the literal theme name. */
function applyTheme(themeSetting) {
  let resolved = themeSetting;
  if (themeSetting === 'auto') {
    const h = new Date().getHours();
    if (h >= 8 && h < 16)       resolved = 'light';   // 8 AM – 3:59 PM
    else if (h >= 16 && h < 20)  resolved = 'evening'; // 4 PM – 7:59 PM
    else                         resolved = 'dark';    // 8 PM – 7:59 AM
  }
  document.documentElement.dataset.theme = resolved;
}

let _autoThemeInterval = null;
function startAutoThemeTimer() {
  if (_autoThemeInterval) clearInterval(_autoThemeInterval);
  _autoThemeInterval = setInterval(() => {
    if (settings.theme === 'auto') applyTheme('auto');
    else clearInterval(_autoThemeInterval);
  }, 60_000);
}

// ═══════════════════════════════════════════════════════════
// MUSIC SOURCE SELECTOR
// ═══════════════════════════════════════════════════════════

function initMusicSource() {
  // Restore saved source
  const saved = localStorage.getItem('focusfi-music-source');
  if (saved === 'spotify') musicSource = 'spotify';

  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.source === musicSource);
    btn.addEventListener('click', () => setMusicSource(btn.dataset.source));
  });

  // Apply saved source on first load — properly switch to spotify if saved
  if (musicSource === 'spotify') {
    // Defer to allow Spotify SDK to finish connecting + YT to be ready
    setTimeout(() => {
      setMusicSource('spotify');
    }, 500);
  }
}

// ═══════════════════════════════════════════════════════════
// VIDEO BACKGROUND CONTROLS
// ═══════════════════════════════════════════════════════════

function initVideoControls() {
  const bgVideo = document.getElementById('bg-video');
  if (bgVideo) {
    bgVideo.addEventListener('ended', onBgVideoEnded);
  }

  document.querySelectorAll('.vid-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setVideoMode(btn.dataset.vidmode === 'shuffle'));
  });

  const prevBtn = document.getElementById('btn-prev-video');
  const nextBtn = document.getElementById('btn-next-video');
  if (prevBtn) prevBtn.addEventListener('click', prevVideo);
  if (nextBtn) nextBtn.addEventListener('click', nextVideo);
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

  // ── Logo click → spin clock hands then return to position ──
  const logoSvg = document.querySelector('.logo-svg');
  if (logoSvg) {
    logoSvg.addEventListener('click', () => {
      if (logoSvg.classList.contains('spin-hands')) return; // already animating
      logoSvg.classList.add('spin-hands');
      logoSvg.addEventListener('animationend', () => {
        logoSvg.classList.remove('spin-hands');
      }, { once: true });
    });
  }

  // ── Logo text click 5 times → secret message ──
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
  zenActive = !zenActive;
  const header = document.getElementById('header');
  const playerBar = document.getElementById('player-bar');
  const zenExitBar = document.getElementById('zen-exit-bar');
  if (zenActive) {
    header.classList.add('zen-hidden');
    playerBar.classList.add('zen-hidden');
    if (zenExitBar) zenExitBar.classList.add('hidden');
    showToast('Zen mode ON — move mouse to show exit option');
  } else {
    header.classList.remove('zen-hidden');
    playerBar.classList.remove('zen-hidden');
    if (zenExitBar) zenExitBar.classList.add('hidden');
    showToast('Zen mode OFF');
  }
}

// ═══════════════════════════════════════════════════════════
// MINI CLOCK CLICK → CLOCK SCENE
// ═══════════════════════════════════════════════════════════

function initClockClick() {
  const headerClock = document.getElementById('clock');
  if (headerClock) {
    headerClock.style.cursor = 'pointer';
    headerClock.addEventListener('click', () => {
      setBackground('gradient');
      showToast('Switched to Clock scene');
    });
  }
}

// ═══════════════════════════════════════════════════════════
// RUNNING TOOLS BAR (header mini-briefs for live tools)
// ═══════════════════════════════════════════════════════════

let runningToolsInterval = null;

function initRunningTools() {
  // Update running tools bar every 500ms
  runningToolsInterval = setInterval(updateRunningTools, 500);
  updateRunningTools();
  // Apply saved briefs preference
  if (!settings.showBriefs) {
    const bar = document.getElementById('running-tools-bar');
    if (bar) bar.style.display = 'none';
  }
}

function updateRunningTools() {
  const bar = document.getElementById('running-tools-bar');
  if (!bar || !settings.showBriefs) return;
  const chips = [];

  // Pomodoro timer (live instance)
  if (timer && timer.isRunning) {
    const panel = document.getElementById('timer-panel');
    const isOpen = panel && !panel.classList.contains('hidden');
    if (!isOpen) {
      const timeStr = timer.format(timer.timeLeft);
      const modeLabel = timer.mode === 'focus' ? 'Focus' : 'Break';
      let urgency = '';
      if (timer.timeLeft <= 5) urgency = 'brief-flash';
      else if (timer.timeLeft <= 15) urgency = 'brief-danger';
      else if (timer.timeLeft <= 30) urgency = 'brief-warning';
      chips.push({
        id: 'timer-panel',
        icon: '#ic-tomato',
        text: `${modeLabel} ${timeStr}`,
        cls: urgency,
      });
    }
  }

  // Stopwatch (live instance)
  if (swRunning) {
    const panel = document.getElementById('stopwatch-panel');
    const isOpen = panel && !panel.classList.contains('hidden');
    if (!isOpen) {
      const total = swElapsed + (Date.now() - swStart);
      chips.push({
        id: 'stopwatch-panel',
        icon: '#ic-stopwatch',
        text: formatMs(total),
        cls: '',
      });
    }
  }

  // Countdown timer (live instance)
  if (cdRunning) {
    const panel = document.getElementById('countdown-panel');
    const isOpen = panel && !panel.classList.contains('hidden');
    if (!isOpen) {
      const m = Math.floor(cdLeft / 60);
      const s = cdLeft % 60;
      let urgency = '';
      if (cdLeft <= 5) urgency = 'brief-flash';
      else if (cdLeft <= 15) urgency = 'brief-danger';
      else if (cdLeft <= 30) urgency = 'brief-warning';
      chips.push({
        id: 'countdown-panel',
        icon: '#ic-hourglass',
        text: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
        cls: urgency,
      });
    }
  }

  // Breathing exercise (live instance)
  if (brInterval !== null) {
    const panel = document.getElementById('breathing-panel');
    const isOpen = panel && !panel.classList.contains('hidden');
    if (!isOpen) {
      const label = document.getElementById('breathing-label');
      const circle = document.getElementById('breathing-circle');
      let breathCls = '';
      if (circle) {
        if (circle.classList.contains('inhale')) breathCls = 'brief-inhale';
        else if (circle.classList.contains('hold')) breathCls = 'brief-hold';
        else if (circle.classList.contains('exhale')) breathCls = 'brief-exhale';
      }
      chips.push({
        id: 'breathing-panel',
        icon: '#ic-wind',
        text: label ? label.textContent : 'Breathing',
        cls: breathCls,
      });
    }
  }

  // Ambient sounds (when any are playing)
  const activeAmbientCount = Object.keys(ambientAudios).length;
  if (activeAmbientCount > 0) {
    const panel = document.getElementById('ambient-panel');
    const isOpen = panel && !panel.classList.contains('hidden');
    if (!isOpen) {
      const names = Object.keys(ambientAudios).map(id => {
        const s = AMBIENT_SOUNDS.find(s => s.id === id);
        return s ? s.name : id;
      });
      const text = names.length <= 2 ? names.join(', ') : `${names.length} sounds`;
      chips.push({
        id: 'ambient-panel',
        icon: '#ic-headphones',
        text: text,
        cls: 'brief-ambient',
      });
    }
  }

  // Build HTML
  const existing = bar.querySelectorAll('.running-tool-chip');
  const newIds = new Set(chips.map(c => c.id));

  // Remove stale chips
  existing.forEach(el => {
    if (!newIds.has(el.dataset.panel)) el.remove();
  });

  chips.forEach(chip => {
    let el = bar.querySelector(`.running-tool-chip[data-panel="${chip.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'running-tool-chip';
      el.dataset.panel = chip.id;
      el.innerHTML = `<svg class="icon"><use href="${chip.icon}"/></svg><span></span>`;
      el.addEventListener('click', () => {
        const panel = document.getElementById(chip.id);
        if (panel) {
          panel.classList.remove('hidden');
          const menuItem = document.querySelector(`.tools-menu-item[data-panel="${chip.id}"]`);
          if (menuItem) menuItem.classList.add('active');
        }
      });
      bar.appendChild(el);
    }
    el.querySelector('span').textContent = chip.text;
    // Update urgency/phase class
    el.classList.remove('brief-warning', 'brief-danger', 'brief-flash', 'brief-inhale', 'brief-hold', 'brief-exhale', 'brief-ambient');
    if (chip.cls) el.classList.add(chip.cls);
  });
}

// ═══════════════════════════════════════════════════════════
// CREDITS
// ═══════════════════════════════════════════════════════════

function initCredits() {
  const btn = document.getElementById('btn-credits');
  const panel = document.getElementById('credits-panel');
  if (btn && panel) {
    btn.addEventListener('click', () => {
      panel.classList.toggle('hidden');
    });
    // Wire up close button inside credits panel
    panel.querySelectorAll('.close-panel').forEach(closeBtn => {
      closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
    });
  }
}

// ═══════════════════════════════════════════════════════════
// SETTING HELP TOOLTIPS
// ═══════════════════════════════════════════════════════════

function initSettingHelps() {
  document.querySelectorAll('.setting-help').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tip = btn.dataset.tip;
      if (tip) showToast(tip, 4000);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// ZEN MODE EXIT BAR
// ═══════════════════════════════════════════════════════════

function initZenExit() {
  const zenExitBar = document.getElementById('zen-exit-bar');
  const exitBtn = document.getElementById('btn-zen-exit');
  if (!zenExitBar || !exitBtn) return;

  let hideTimer = null;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  function showZenExit() {
    if (!zenActive) return;
    zenExitBar.classList.remove('hidden');
    clearTimeout(hideTimer);
    if (isTouchDevice) {
      hideTimer = setTimeout(() => {
        zenExitBar.classList.add('hidden');
      }, 5000);
    }
  }

  function hideZenExit() {
    if (!zenActive) return;
    hideTimer = setTimeout(() => {
      zenExitBar.classList.add('hidden');
    }, 2000);
  }

  // Mouse move: show on move, hide when stops
  document.addEventListener('mousemove', () => {
    if (!zenActive) return;
    showZenExit();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      zenExitBar.classList.add('hidden');
    }, 2000);
  });

  // Touch: show on tap, auto-hide after 5s
  document.addEventListener('touchstart', () => {
    if (!zenActive) return;
    showZenExit();
  }, { passive: true });

  // Exit button click
  exitBtn.addEventListener('click', () => {
    triggerZenMode(); // toggles zen off
  });
}
