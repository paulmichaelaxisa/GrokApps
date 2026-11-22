# Liam Words

Phone-first PWA for toddler word practice (picture → say it → Auslan video).

## Open

- Local: open `index.html` over HTTP(S) (the service worker needs a real origin).
- Quick preview: [raw.githack](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/liam-words/index.html)
- Hosted: [liam-words-paul.web.app](https://liam-words-paul.web.app)
- Phone: open that URL in Safari/Chrome, or Add to Home Screen. There is also an Android build under [`android/liam-words/`](../android/liam-words/).

## Words

mummy, daddy, milk, more, ball, dog, water, bye, eat, book, car, sleep, cat, duck, bird, bath, shoes, hat, up, please, finished, truck

Art is Remy’s picture-book illustrations (PNG stills and animated WebP). Speak uses bundled `en-AU` audio, with `speechSynthesis` as a fallback.

## Auslan

Each word includes the official [Auslan Signbank](https://auslan.org.au/dictionary/) video, bundled unmodified and played in the app (muted, looping, tap to replay). Credit: “Sign videos: Auslan Signbank, auslan.org.au. CC BY-NC-ND 4.0.” Always confirm with Liam’s therapists / teachers of the deaf. The “up” sign in particular may need a check.

## Stack

Zero-build static HTML/CSS/JS · bundled audio · PWA manifest + basic service worker
