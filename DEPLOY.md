# Deploy and test The Vault 5.2

Do Part 1 and Part 2 first. They are all you need to have a working app. Parts 3 to 5 are optional extras; do them in any order.

## Part 1: Test it on your computer (10 minutes)

You need Node 18 or newer and Python 3 (or any static file server).

```bash
cd the-vault-v5
npm test                 # expect: all 54 tests pass
python3 -m http.server 8000
```

Open http://localhost:8000 in Chrome. Use `localhost`, not a file path: service workers and modules need http.

## Part 2: Put it on GitHub Pages (10 minutes)

1. Create a repository, or use your existing `the-vault-app`. To keep version 4 as a fallback, make a new repository named `the-vault-5`.
2. Copy everything in this folder into it (the files, not the folder), commit and push to `main`.
3. In the repository: Settings, Pages, Source "Deploy from a branch", Branch `main`, folder `/ (root)`. Save.
4. After a minute, open `https://YOUR-NAME.github.io/REPO-NAME/`.
5. Every later release: edit `VERSION` in `sw.js` (for example `vault-5.2.1`) and push. Without that, installed copies keep the old files.

Moving from version 4 on the same address: open the new app in the same browser. Your data is imported automatically and a backup is made first (Settings, Local backups).

If you use a new address, the browser treats it as a different app and your data will not be there. Export from version 4 first, then use Settings, Import a file in 5.1.

## Part 3: Sync between devices (optional, 20 minutes)

1. Create a project at supabase.com.
2. SQL editor: paste and run `supabase/schema.sql`. This creates the table and turns on Row Level Security. Do not skip it, because it is what makes the publishable key safe to ship.
3. Settings, API: copy the project URL and the publishable (anon) key into `js/config.js`.
4. Authentication, URL configuration: set Site URL to your GitHub Pages address and add it to Redirect URLs. Add `http://localhost:8000` too if you test locally.
5. Bump `VERSION` in `sw.js`, push.
6. In the app: Settings, Sync, enter your email, open the link you receive.

First sync warning: records from version 4 have no edit stamps, so on a tie this device wins. Sign in first on the device that has the newest data, let it sync, then sign in on the others. Backups exist if anything looks wrong.

Floor plan images do not sync (they are too big). Use "Download a copy" to move them, or upload the plans on each device.

## Part 4: AI questions Worker (optional, 15 minutes)

1. cloudflare.com, Workers, create a Worker, paste `worker/ai-questions-worker.js`, deploy.
2. Settings of the Worker, add:
   - Secret `VAULT_ACCESS_TOKEN`: a long random string you choose.
   - Secret `GROQ_API_KEY` or `OPENROUTER_API_KEY` (at least one).
   - Variable `ALLOWED_ORIGIN`: `https://YOUR-NAME.github.io` (no path, no trailing slash).
   - Optional: a KV namespace bound as `RATE_LIMIT`.
3. In the app: Settings, Connected services, paste the Worker address and the token. Open an episode, Question studio, generate.

## Part 5: Flights and YouTube (optional)

Flights:
1. Get an AviationStack key. The free plan may not allow the date filter or HTTPS; if lookups fail, check your plan first.
2. Create a second Worker from `worker/flight-status-worker.js`. Secrets: `VAULT_ACCESS_TOKEN` (the same one is fine) and `AVIATIONSTACK_KEY`. Variable: `ALLOWED_ORIGIN`.
3. Settings, Connected services, paste the flight Worker address. Then a convention, Trip tab, add a flight.

YouTube:
1. Google Cloud console, enable YouTube Data API v3, create an API key.
2. Restrict the key to your site address (HTTP referrers) and to the YouTube Data API only.
3. Stats, Videos tab, paste the key and your channel.

These keys stay in this browser only. They are never synced or exported.

## Test script (30 minutes, on the deployed site)

Tick each line.

**Basics**
- [ ] Opens with no errors. Create a guest, an episode, a convention. Reload: they are still there.
- [ ] Delete something, then press Undo in the toast.
- [ ] Settings, Dark theme: every screen stays readable.

**Interviews**
- [ ] Add 10 questions (paste a list). Open Live mode: next and previous work with the arrow keys; mark asked.
- [ ] Today shows the right "Next up" for your earliest upcoming interview.

**Convention day**
- [ ] Give a convention dates and a venue with two rooms. Give an interview a day, time, duration and room.
- [ ] Day screen: the interview and a panel appear at the right times. Add an activity. Print preview looks clean.
- [ ] Tick checklist items; reload; they stay ticked.

**Money and stats**
- [ ] Budget: add an expense, set a limit below the total, confirm the over-budget message.
- [ ] Change the default automatic costs and see the automatic rows update. Download the CSV and open it.
- [ ] Stats: all three tabs open. Open "View as table" on a chart.

**Venues**
- [ ] Upload a JPG and a PDF floor plan. Drag a marker; also move it with the arrow keys after focusing it. Reload: positions are kept.

**Games and notes**
- [ ] Create a game format, play it. Add a quick note on Today and on an episode.

**Organizers, focus, photos, duplicates, poster (5.2)**
- [ ] Organizers: add a contact with phone, email and website. On your phone, Call opens the dialler and Email opens your mail app.
- [ ] The contact shows on the convention's Trip tab and on the Day screen.
- [ ] Day, Focus mode: during a convention day it shows Happening now with minutes left, and Up next. Close returns to Day.
- [ ] Guest, Edit name and photo: paste an https photo link, move and zoom; the round preview matches the guest's avatar after saving.
- [ ] Add a guest whose name is close to an existing one: you get the Possible duplicate warning.
- [ ] Guests, Find duplicates: merge two test guests; their episodes now point to the kept guest and nothing is lost. A backup appears in Settings.
- [ ] Convention, Poster: guests are listed; Download PNG gives an image. If a photo host blocks reuse, that guest shows initials in the PNG (not in the on-screen preview).

**Offline and install**
- [ ] Open the site once online. DevTools, Network, Offline, reload: the app still opens.
- [ ] On your phone: Add to Home Screen. Open it, confirm the bottom tab bar and no sideways scrolling.

**Data safety**
- [ ] Settings, Download a copy. Then Import a file: confirm a backup appears under Local backups.

**Sync (if enabled)**
- [ ] Sign in on two devices. Edit different episodes on each, sync both: both edits appear on both.
- [ ] Delete a guest on one device: it disappears on the other after sync.

**Services (if enabled)**
- [ ] Question studio returns questions. A wrong token gives a clear error.
- [ ] A flight lookup shows a status. YouTube list loads and shows views.

## If something goes wrong

- Old version still showing: bump `VERSION` in `sw.js`, push, then close all tabs of the app and reopen (or DevTools, Application, Service Workers, Unregister).
- Sign-in link goes to the wrong place: fix Site URL and Redirect URLs in Supabase.
- Worker says forbidden: `ALLOWED_ORIGIN` must match the site origin exactly, and the token in Settings must match `VAULT_ACCESS_TOKEN`.
- Fonts look plain: the app loads them from Google Fonts, so they appear once you are online; the app works with fallback fonts.
- Data looks wrong after import or sync: Settings, Local backups, Restore.
