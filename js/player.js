/**
 * player.js — YouTube IFrame API wrapper
 *
 * Encapsulates a single YouTube player instance.
 * Controls: play, pause, toggle, setVolume, mute, loadVideo.
 * The player starts muted (required for autoplay) and must be
 * unmuted explicitly by the user through volume/mute controls.
 */
export class YouTubePlayer {
  /**
   * @param {string} elementId  ID of the DOM element to replace with the iframe
   */
  constructor(elementId) {
    this.elementId = elementId;
    this.player    = null;
    this.isReady   = false;
    this.isMuted   = true;
    this.volume    = 50;

    this._readyCbs       = [];
    this._stateChangeCbs = [];
  }

  /** Create the YT.Player instance. Call once YT API is ready. */
  init(videoId) {
    this.videoId = videoId;
    this.player  = new YT.Player(this.elementId, {
      videoId,
      playerVars: {
        autoplay:       1,
        controls:       0,   // hide native controls
        mute:           1,   // start muted (browser autoplay policy)
        rel:            0,
        modestbranding: 1,
        iv_load_policy: 3,   // no annotations
        disablekb:      1,
        fs:             0,   // no fullscreen button
        playsinline:    1,
      },
      events: {
        onReady:       (e) => this._handleReady(e),
        onStateChange: (e) => this._handleStateChange(e),
      },
    });
  }

  /** Register a callback to run once the player is ready. */
  onReady(cb) {
    if (this.isReady) { cb(); return; }
    this._readyCbs.push(cb);
  }

  /** Register a callback for every player state change. */
  onStateChange(cb) {
    this._stateChangeCbs.push(cb);
  }

  // ── Playback ────────────────────────────────────────────

  play() {
    if (this.isReady) this.player.playVideo();
  }

  pause() {
    if (this.isReady) this.player.pauseVideo();
  }

  toggle() {
    if (!this.isReady) return;
    this.isPlaying() ? this.pause() : this.play();
  }

  /** @returns {boolean} */
  isPlaying() {
    return this.isReady && this.player.getPlayerState() === YT.PlayerState.PLAYING;
  }

  /** @returns {number} YT.PlayerState constant or -1 if not ready */
  getState() {
    return this.isReady ? this.player.getPlayerState() : -1;
  }

  // ── Volume ──────────────────────────────────────────────

  /** Set volume (0–100) and unmute. */
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, vol));
    if (!this.isReady) return;
    if (this.volume === 0) {
      this.mute();
    } else {
      this.player.unMute();
      this.player.setVolume(this.volume);
      this.isMuted = false;
    }
  }

  mute() {
    this.isMuted = true;
    if (this.isReady) this.player.mute();
  }

  unmute() {
    this.isMuted = false;
    if (!this.isReady) return;
    this.player.unMute();
    this.player.setVolume(this.volume || 50);
  }

  /** Toggle mute. Returns new muted state. */
  toggleMute() {
    this.isMuted ? this.unmute() : this.mute();
    return this.isMuted;
  }

  // ── Stream switching ────────────────────────────────────

  /** Load a different video/stream without recreating the player. */
  loadVideo(videoId) {
    this.videoId = videoId;
    if (!this.isReady) return;
    this.player.loadVideoById(videoId);
    // preserve mute state after load
    if (this.isMuted) {
      this.player.mute();
    } else {
      this.player.unMute();
      this.player.setVolume(this.volume);
    }
  }

  // ── Private ─────────────────────────────────────────────

  _handleReady() {
    this.isReady = true;
    // Apply stored volume (player starts muted)
    this.player.setVolume(this.volume);
    this._readyCbs.forEach((cb) => cb());
    this._readyCbs = [];
  }

  _handleStateChange(e) {
    this._stateChangeCbs.forEach((cb) => cb(e));
  }
}
