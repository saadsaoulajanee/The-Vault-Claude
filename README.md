# The Vault 5.2

A planner for interviews, guests and conventions. It runs entirely in the browser, works offline, and can optionally sync between devices.

No build step: the app is plain HTML, CSS and ES modules.

## Run it

```bash
python3 -m http.server 8000     # then open http://localhost:8000
npm test                        # 54 unit tests, no dependencies
```

## Deploy to GitHub Pages

Push the folder to a repository, then Settings → Pages → deploy from the main branch. Everything uses relative paths, so it works under `/the-vault-app/`.
After each release, change `VERSION` in `sw.js` so installed copies pick up the new files.

## Upgrading from the previous version

Open the new app in the same browser as the old one. Your data is found automatically, a backup is made first, and it is shown in Settings → Local backups. You can also use Settings → Import a file with a JSON export.

## Optional: sync between devices

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor. It turns on Row Level Security, which is what makes the publishable key in `js/config.js` safe to ship.
2. Put your project URL and publishable key in `js/config.js`.
3. In Supabase, add your site address under Authentication → URL configuration.
4. In the app, open Settings and request a sign-in link.

Edits are merged record by record, so changing different episodes on two devices keeps both. If you change the same record in two places, the most recent edit wins.

## Optional: AI question studio

Deploy `worker/ai-questions-worker.js` to Cloudflare Workers, then set:

| Name | Type | Notes |
| --- | --- | --- |
| `VAULT_ACCESS_TOKEN` | secret | You type this into the studio. Use a long random value. |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` | secret | At least one. |
| `ALLOWED_ORIGIN` | variable | Your site, for example `https://you.github.io` (comma separate several). |
| `RATE_LIMIT` | KV binding | Optional. Makes the 12 requests per minute limit hold across instances. |

## What changed from version 4

- **Safer by construction.** No `innerHTML` and no inline `onclick` anywhere, so names and notes can never run as code. The tests include a hostile guest name.
- **Installable and offline.** A service worker caches the app. The sync library only loads when you sign in, and is pinned to an exact version.
- **Modular.** One 349 KB file became small modules (`store`, `merge`, `sync`, one file per view) with tests on the parts that could lose data.
- **Storage.** Data lives in IndexedDB, not the 5 MB `localStorage` limit. Failed saves show a message. Five automatic backups, restorable from Settings.
- **Better sync.** Per-record merge with deletion tracking, replacing "last full copy wins".
- **Better AI questions.** Batches of 50, de-duplicated against what you already have, works with question marks in Arabic and Japanese, constant-time token check, rate limit.
- **New experience.** Today screen, Live mode (one big question at a time, keyboard and wake-lock), undo instead of confirm-everything, pasting a list of questions, light and dark themes, mobile tab bar, keyboard and screen reader support.

## Brought back from version 4, improved (5.1)

- **Budget**: per convention, with category chart, automatic editing/marketing costs (default plus per-episode override), over-budget warning, CSV download.
- **Stats**: Interviews, Finances (per year) and Videos tabs. Every chart has a text value and a "View as table".
- **YouTube tools**: channel video list with view growth over time (key set in Stats, Videos).
- **Venues and floor plans**: rooms, JPG/PNG/PDF plans, draggable (or keyboard-movable) room markers. Plan images stay on the device.
- **Flights**: live status through your own Worker (`worker/flight-status-worker.js`).
- **Interview games**: formats, play mode.
- **Convention day**: one timeline per day with interviews, panels and activities, checklists, rooms, directions, print view.
- **Quick notes** on Today and per episode.

## Also brought back (5.2)

- **Organizer contacts**: name, role, phone, email and website per contact, with one-tap Call, Email and Website buttons. Shown on the convention (Trip tab) and on the convention day. Manage them under Organizers.
- **Focus mode**: from Convention day, a dark full-screen view of what is happening now (with minutes left) and what is next. Updates itself and keeps the screen awake.
- **Guest photo framing**: move and zoom a guest's photo with a live round preview. Used everywhere the guest appears, and on the poster.
- **Duplicate detection**: warns when a new or renamed guest looks like an existing one (typos, accents, word order, short first names), and Guests, Find duplicates merges two profiles without losing credits, journal, notes or episodes. A backup is made first.
- **Convention poster**: a lineup of the guests at a convention. Download as PNG or print. Hide guests you don't want on it.

## Not carried over

The thumbnail archive from version 4 (it stored images that would not fit in sync). Everything else from version 4 is now in.

See **DEPLOY.md** for the step by step deploy and test guide.
