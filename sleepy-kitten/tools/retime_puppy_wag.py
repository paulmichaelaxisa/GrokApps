#!/usr/bin/env python3
"""Calmer puppy reward: re-encode Remy's happy_wag frames 1.3x slower (108 ms/frame, 3.9 s loop).
Same frames, size and encoder settings as Remy's build (libwebp via Pillow, q72, method 6)."""
from pathlib import Path
from PIL import Image
SRC = Path("/workspace/voice-games-art/work/final/puppy/happy_wag")
OUT = Path(__file__).resolve().parent.parent / "art/puppy/puppy_happy_wag.webp"
frames = [Image.open(p).convert("RGB") for p in sorted(SRC.glob("*.png"))]
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=108, loop=0,
               quality=72, method=6, minimize_size=False, allow_mixed=False, kmin=1, kmax=1)
print(OUT, len(frames), "frames,", round(len(frames) * 0.108, 2), "s")
