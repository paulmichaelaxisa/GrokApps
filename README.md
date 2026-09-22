# GrokApps

Non-game apps and scripts built with (and for) Grok.

## Apps

### [Daily Learn](./daily-learn/)

A mobile-first Progressive Web App that teaches **one complex topic per day** in simple language — like you're 10 years old — then quizzes you after each section.

- **Flow:** Home (today's topic + streak) → lesson sections (metaphor, explanation, example) → quiz after each section → celebration
- **Daily topic:** Deterministic from the **Australia/Sydney** calendar date (`YYYY-MM-DD`). The same date always shows the same topic.
- **Progress:** Streak, completed dates, and quiz scores stored in `localStorage`
- **PWA:** Installable (`manifest.json`), offline shell via service worker, Apple mobile web app meta tags

**Phone preview:** [raw.githack Daily Learn](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/daily-learn/index.html)

**GitHub Pages tip:** enable Pages for this repo with source **Deploy from a branch**, folder `/` (root), then visit `/daily-learn/` and `/liam-words/`.

### [Liam Words](./liam-words/)

Phone-first PWA prototype for toddler word practice: **Picture → Say it → Auslan tip** (with Signbank links).

- **Audience:** Liam (~2) with Dad — huge tap targets, soft colours, one step at a time
- **Vocabulary (v1):** mummy, daddy, milk, more, ball, dog, water, bye, eat, book, car, sleep
- **Pronunciation:** phonetic chunks + Web Speech API (slow rate, tap to speak)
- **Auslan:** parent tips only — always confirm on [Auslan Signbank](https://auslan.org.au/dictionary/); placeholder hand art is not official
- **PWA:** manifest, basic service worker, Apple mobile web app meta

**Phone preview (use this — jsDelivr shows source code):** [raw.githack Liam Words](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/liam-words/index.html)

## License

Content and code in this repo unless noted otherwise.
