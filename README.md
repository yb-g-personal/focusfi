# focusfi

A minimal, dark-themed focus workspace that plays lofi livestreams and ambient sounds while you study. Built with HTML5, CSS3, and vanilla ES6 JavaScript — no build step, no frameworks.

---

## Features

### Lofi Streams (YouTube)
- Four preset streams: **Lofi Girl**, **Lofi Girl Synthwave**, **Lofi Girl Ambient**, and **Chillhop Music**.
- All streams are controlled through focusfi's own buttons — YouTube's native controls are hidden.
- Skip between streams with **⏮ / ⏭**, or use **← / →** arrow keys.
- Add your own YouTube URL or video ID via **Stream Settings** (⚙ button in the player bar).

### Spotify Integration
- Built-in Spotify embed player — no Premium required, just a logged-in Spotify session.
- Switch between YouTube and Spotify as your music source from the settings panel.
- Five preset playlists (Lofi Beats, Deep Focus, Jazz Vibes, Ambient Chill, Study Essentials) or paste any Spotify playlist/album URL.
- Floating player with compact controls.

### Background Modes
Switch between four backgrounds using the pill selector in the header:

| Mode | Description |
|------|-------------|
| **Gradient** | Slowly animated dark gradient (default) |
| **Video** | Cycles through local MP4 videos from `assets/videos/` — supports shuffle or loop-one mode |
| **Stream** | Shows the live YouTube video full-screen as the background |
| **Visualizer** | Audio-reactive bars visualiser synced to the music |

When the **Stream** background is active, a subtle dark overlay keeps the rest of the UI readable.

### Watch in Foreground
Click the monitor icon (**📺** / `F` key) in the player bar to bring the video into a centred overlay modal. Click again, press `F`, or click the backdrop to return to the previous mode.

### Ambient Sounds
Layer nature and environment sounds on top of your music:
- **Rain**, **Thunderstorm**, **Forest**, **Ocean Waves**, **Fireplace**, **Café Chatter**, **Wind**, and **Birds**.
- Each sound has its own volume slider and can be mixed independently.
- Powered by procedural Web Audio API synthesis — no audio files required.

### Themes
Three colour themes accessible from the settings panel:
- **Dark** (default) — easy on the eyes for late-night sessions.
- **Light** — bright and clean.
- **Evening** — warm muted tones.

### Zen Mode
Press `Z` or toggle from settings to hide the header and player bar for a distraction-free workspace. Only the clock, tools, and background remain. Press again to restore.

### Loader Screen
An animated clock-draw intro with the **focusfi** wordmark and a heavenly layered chime (pads + shimmer + synthetic reverb) that plays as the app loads. The clock smoothly transitions into the menu bar clock on dismissal.

---

## Tools
Each tool has a **?** button that explains what it does.

### Focus Timer (Pomodoro)
Pomodoro-style timer with three modes:
- **Focus** (default 25 min) — music **pauses automatically** when the session ends.
- **Short Break** (default 5 min) — music resumes when the break ends.
- **Long Break** (every 4th session, default 15 min).

Session dots track your progress through each group of four sessions. Focus and break durations are configurable inline.

### Countdown Timer
A simple countdown timer independent of the Pomodoro system. Set minutes and seconds, start, and get alerted when it reaches zero.

### Persistent Alarm
When any timer ends (Pomodoro focus, Pomodoro break, or countdown), a **looping two-tone alarm** sounds and a centred overlay with a bell icon and **Stop** button appears. The alarm continues until you explicitly dismiss it — no more missing silent notifications.

### Tasks
A lightweight to-do list for the session. Tasks are saved in `localStorage` and survive page refreshes. Press **Enter** or click **+** to add a task; click the trash icon to remove one.

### Notes
A free-form scratch pad — useful for formulas, vocabulary, or quick ideas. Auto-saved to `localStorage` on every keystroke. A word and character count is shown at the bottom.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` | Previous preset stream |
| `→` | Next preset stream |
| `M` | Toggle mute |
| `F` | Toggle foreground video |
| `Z` | Toggle Zen Mode |

Shortcuts are disabled when focus is inside a text input or textarea.

---

## Adding Your Own Background Videos

1. Place `.mp4` files in the **`assets/videos/`** folder.
2. Open **`assets/videos/manifest.json`** and list the filenames:

```json
["cozy-room.mp4", "rain-window.mp4", "cafe.mp4"]
```

3. Select **Video** in the background selector — focusfi will play them with loop or shuffle mode.

---

## Project Structure

```
focusfi/
├── index.html              # Main page (SVG sprite, layout, scripts)
├── css/
│   └── style.css           # All styles — themes, animations, layout
├── js/
│   ├── app.js              # Entry point — coordinates all modules
│   ├── player.js           # YouTubePlayer class (IFrame API wrapper)
│   ├── timer.js            # PomodoroTimer class
│   ├── tasks.js            # TaskList class (localStorage)
│   └── notes.js            # Notes class (localStorage)
├── assets/
│   ├── ambient/            # (reserved for ambient sound assets)
│   └── videos/
│       └── manifest.json   # List of MP4 filenames to cycle through
└── README.md
```

---

## Running Locally

Because the page uses ES modules and fetches `manifest.json`, it must be served over HTTP (not opened as a `file://` URL).

```bash
# Python 3
python -m http.server 8080

# Node (npx)
npx serve .
```

Then open `http://localhost:8080`.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Markup | Semantic HTML5 with inline SVG sprite |
| Styles | CSS3 — custom properties, grid/flex, `backdrop-filter`, `@keyframes` |
| Scripts | Vanilla ES6 modules (no bundler) |
| Fonts | [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) via Google Fonts |
| Audio | YouTube IFrame API (streams) + Spotify Embed (playlists) + Web Audio API (ambient sounds, alarm, chime, visualiser) |
| Storage | `localStorage` for tasks, notes, volume, stream preference, background mode, theme, and more |

