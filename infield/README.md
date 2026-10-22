# Infield Updates

Voice-first field notes and lists for crews in the field. No build step, no backend.

- **Notes** – dictate a company update (job/site, category, GPS tag). Voice punctuation: "period", "comma", "new line"; "scratch that" removes the last phrase.
- **Lists** – dictate items (each pause = new item), check off, share as text.
- **Feed** – search, share, delete, export everything as JSON.
- Works offline as an installable PWA; data stays on the device (localStorage).

## Run
Voice needs HTTPS or localhost, and Chrome/Edge/Safari:

    cd infield && python3 -m http.server 8000   # open http://localhost:8000

Deploy the folder to any static host (GitHub Pages, Netlify) and "Add to Home Screen".
