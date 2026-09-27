# Project Rehearsal (web)

Mobile-first SPA port of Project Rehearsal — a flight simulator for delivery PMs.

## Open

**Phone / laptop preview:** [raw.githack Project Rehearsal](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/project-rehearsal/index.html)

1. Open the URL
2. Tap ⚙️ Settings → paste your xAI key from [console.x.ai](https://console.x.ai) → **Save key**
3. Tap a one-tap room (or paste artefacts) → talk → Debrief

Key is stored only in this device’s `localStorage` as `project-rehearsal-xai-key`. Browser calls `https://api.x.ai/v1/chat/completions` directly (CORS allows it).

## Included

- 5 one-tap scenarios + custom “from artefacts” room
- Paste artefacts (persisted locally)
- Timed room dialogue with speaker bubbles
- Hint chips after the room speaks
- Debrief scores + “line to steal”
- Settings gear for xAI key
- PWA shell (manifest + service worker)

## Skipped (vs full TanStack app)

- PDF / PPTX / DOCX upload (paste text instead)
- Server-side `REHEARSAL_XAI_KEY` (you bring your own key)
- Auth / multiplayer / DB

## Local

Open `index.html` over HTTPS or any static server (service worker needs a real origin).
