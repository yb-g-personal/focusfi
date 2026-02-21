/**
 * timer.js — Pomodoro-style focus timer
 *
 * Modes: focus | short (break) | long (break)
 * After every 4 focus sessions a long break is suggested.
 * Fires callbacks on each tick and when a session ends.
 * The caller is responsible for pausing/resuming music.
 */
export class PomodoroTimer {
  /**
   * @param {object} opts
   * @param {function} [opts.onTick]       (secondsLeft, mode) → void
   * @param {function} [opts.onEnd]        (mode, totalFocusSessions) → void
   * @param {function} [opts.onModeChange] (mode) → void
   */
  constructor(opts = {}) {
    this.durations = {
      focus: 25 * 60,
      short:  5 * 60,
      long:  15 * 60,
    };

    this.mode          = 'focus';
    this.timeLeft      = this.durations.focus;
    this.isRunning     = false;
    this.focusSessions = 0;   // completed focus sessions
    this._interval     = null;

    this.onTick       = opts.onTick       || null;
    this.onEnd        = opts.onEnd        || null;
    this.onModeChange = opts.onModeChange || null;
  }

  // ── Control ──────────────────────────────────────────────

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._interval = setInterval(() => this._tick(), 1000);
  }

  pause() {
    this.isRunning = false;
    clearInterval(this._interval);
    this._interval = null;
  }

  /** Toggle between running and paused. Returns new isRunning state. */
  toggle() {
    this.isRunning ? this.pause() : this.start();
    return this.isRunning;
  }

  /** Reset the current mode back to its full duration. */
  reset() {
    this.pause();
    this.timeLeft = this.durations[this.mode];
    if (this.onTick) this.onTick(this.timeLeft, this.mode);
  }

  /** Switch to a named mode and reset. */
  setMode(mode) {
    this.mode     = mode;
    this.timeLeft = this.durations[mode];
    this.pause();
    if (this.onModeChange) this.onModeChange(mode);
    if (this.onTick) this.onTick(this.timeLeft, mode);
  }

  /**
   * Update the duration (in minutes) for a given mode.
   * Resets if the mode is currently active.
   */
  setDuration(mode, minutes) {
    const secs = Math.max(1, Math.min(99, minutes)) * 60;
    this.durations[mode] = secs;
    if (this.mode === mode) this.reset();
  }

  // ── Helpers ──────────────────────────────────────────────

  /** Format seconds as MM:SS string. */
  format(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  /**
   * Session progress dots as a string, e.g. "●●○○"
   * Represents progress within the current group of 4.
   */
  get dots() {
    const filled = this.focusSessions % 4;
    return '●'.repeat(filled) + '○'.repeat(4 - filled);
  }

  /** 1-based session number within the current group of 4. */
  get sessionNumber() {
    return (this.focusSessions % 4) + 1;
  }

  // ── Private ──────────────────────────────────────────────

  _tick() {
    this.timeLeft -= 1;
    if (this.onTick) this.onTick(this.timeLeft, this.mode);
    if (this.timeLeft <= 0) this._handleEnd();
  }

  _handleEnd() {
    const endedMode = this.mode;

    if (endedMode === 'focus') this.focusSessions += 1;

    // Notify caller (e.g. pause music on focus end)
    if (this.onEnd) this.onEnd(endedMode, this.focusSessions);

    // Auto-advance to the next mode
    if (endedMode === 'focus') {
      this.setMode(this.focusSessions % 4 === 0 ? 'long' : 'short');
    } else {
      this.setMode('focus');
    }
  }
}
