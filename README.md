# GrokApps

Non-game apps and scripts built with (and for) Grok.

## Apps

### [Daily Learn](./daily-learn/)

A mobile-first Progressive Web App that teaches **complex topics in simple language** — like you're 10 years old — then quizzes you after each section.

- **Flow:** Home (topic + streak) → lesson sections (metaphor, explanation, example) → quiz after each section → celebration
- **Topics:** On each fresh open / reload (and via **New topic**), the app asks the **xAI / Grok API** for a unique micro-lesson. Curated topics in `topics/` remain the **offline fallback**.
- **API key (phone):** Open Daily Learn → tap ⚙️ → paste your key from [console.x.ai](https://console.x.ai) → **Save key**. Stored only in this device’s `localStorage` as `daily-learn-xai-key` — never committed to the repo. Clear removes it. Without a key (or if the API fails), you get a random curated topic and a gentle offline banner.
- **Progress:** Streak and completions use Australia/Sydney calendar dates; finishing a lesson still counts toward streak. Recent AI titles (~30) are remembered so new topics stay fresh.
- **PWA:** Installable (`manifest.json`), offline shell via service worker, Apple mobile web app meta tags

**Phone preview (cache-bust):** [raw.githack Daily Learn](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/daily-learn/index.html?v=ai1)

**GitHub Pages tip:** enable Pages for this repo with source **Deploy from a branch**, folder `/` (root), then visit `/daily-learn/` and `/liam-words/`.

### [Liam Words](./liam-words/)

Phone-first PWA prototype for toddler word practice: **Picture → Say it → Auslan video** (Signbank links only).

- **Audience:** Liam (~2) with Dad — huge tap targets, soft colours, one step at a time
- **Vocabulary (v1):** mummy, daddy, milk, more, ball, dog, water, bye, eat, book, car, sleep
- **Pronunciation:** phonetic chunks + Web Speech API (slow rate, tap to speak)
- **Auslan:** no in-app sign diagrams or invented tips — opens the official [Auslan Signbank](https://auslan.org.au/dictionary/) video; confirm with therapists / teachers of the deaf
- **PWA:** manifest, basic service worker, Apple mobile web app meta

**Phone preview (use this — jsDelivr shows source code):** [raw.githack Liam Words](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/liam-words/index.html)

## License

Content and code in this repo unless noted otherwise.
