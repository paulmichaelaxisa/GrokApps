# GrokApps

Non-game apps and scripts built with (and for) Grok.

## Apps

### [Daily Learn](./daily-learn/)

A mobile-first Progressive Web App that teaches **one complex topic per day** in simple language — like you're 10 years old — then quizzes you after each section.

- **Flow:** Home (today's topic + streak) → lesson sections (metaphor, explanation, example) → quiz after each section → celebration
- **Daily topic:** Deterministic from the **Australia/Sydney** calendar date (`YYYY-MM-DD`). The same date always shows the same topic.
- **Progress:** Streak, completed dates, and quiz scores stored in `localStorage`
- **PWA:** Installable (`manifest.json`), offline shell via service worker, Apple mobile web app meta tags

Open locally: open [`daily-learn/index.html`](./daily-learn/index.html) in a browser (service worker needs HTTP(S); use GitHub Pages or any static server for full PWA).

**GitHub Pages tip:** enable Pages for this repo with source **Deploy from a branch**, folder `/daily-learn` (or `/` and visit `/daily-learn/`).

## License

Content and code in this repo unless noted otherwise.
