# FocusFi

A minimal, dark-themed focus workspace that plays Lofi Girl livestreams in the background while you study. Built with HTML5, CSS3, and vanilla ES6 JavaScript — no build step, no frameworks.

---

## Features

### Lofi Streams
- Three preset streams out of the box: **Lofi Girl**, **Lofi Girl Synthwave**, and **Chillhop Music**.
- All streams are controlled entirely through FocusFi's own buttons — YouTube's native controls are hidden.
- Skip between streams with **⏮ / ⏭**, or use **← / →** arrow keys.
- Streams start muted (browser autoplay policy); move the volume slider to unmute.
- Add your own YouTube URL or video ID via **Stream Settings** (⚙ button in the player bar).

### Background Modes
Switch between three backgrounds using the pill selector in the header:

| Mode | Description |
|------|-------------|
| **Gradient** | Slowly animated dark gradient (default) |
| **GIF** | Cycles through handpicked GIFs every 30 s |
| **Stream** | Shows the live video full-screen as the background |

When the **Stream** background is active, a subtle dark overlay keeps the rest of the UI readable.

### Watch in Foreground
Click the monitor icon (**📺** / `F` key) in the player bar to bring the video into a centred overlay modal. Click again, press `F`, or click the backdrop to return to the previous mode.

### Tools
Each tool has a **?** button that explains what it does.

#### Focus Timer
Pomodoro-style timer with three modes:
- **Focus** (default 25 min) — music **pauses automatically** when the session ends and a soft beep plays.
- **Short Break** (default 5 min) — music resumes when the break ends.
- **Long Break** (every 4th session, default 15 min).

Session dots in the panel track your progress through each group of four sessions. Focus and break durations are configurable inline.

#### Tasks
A lightweight to-do list for the session. Tasks are saved in `localStorage` and survive page refreshes. Press **Enter** or click **+** to add a task; click the trash icon to remove one.

#### Notes
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

Shortcuts are disabled when focus is inside a text input or textarea.

---

## Adding Your Own GIFs

1. Place your `.gif` files in the **`assets/gifs/`** folder.
2. Open **`assets/gifs/manifest.json`** and list the filenames:

```json
["cozy-room.gif", "rain-window.gif", "cafe.gif"]
```

3. Select **GIF** in the background selector — FocusFi will cycle through them every 30 seconds.

Recommended GIF size: **1920 × 1080 px** or similar widescreen ratio, kept under ~5 MB per file for smooth loading.

---

## Project Structure

```
focusfi/
├── index.html              # Main page (SVG sprite, layout, scripts)
├── css/
│   └── style.css           # All styles — dark theme, animations, layout
├── js/
│   ├── app.js              # Entry point — coordinates all modules
│   ├── player.js           # YouTubePlayer class (IFrame API wrapper)
│   ├── timer.js            # PomodoroTimer class
│   ├── tasks.js            # TaskList class (localStorage)
│   └── notes.js            # Notes class (localStorage)
├── assets/
│   └── gifs/
│       └── manifest.json   # List of GIF filenames to cycle through
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
| Audio | YouTube IFrame API (streams) + Web Audio API (timer beep) |
| Storage | `localStorage` for tasks, notes, volume, stream preference, and background mode |

