# Brutal Assault → Spotify

Scan a Brutal Assault festival badge QR code and turn the artists that person has favourited in the
[official app](https://play.google.com/store/apps/details?id=cz.brutalassault.official) into a Spotify playlist.

## How it works

The badge QR code is not a lineup link — it's a personal identity token used by the app's "share my favourite
artists" and "friend finder" features. It encodes:

```json
{ "id": "...", "pk": "...", "un": "...", "iu": "...", "sc": "..." }
```

`id` (identity), `pk` (RSA public key), `un` (display name), `iu` (icon), and `sc` (a one-time secret challenge).
This was found by decompiling the official app's APK — there is no documented public API.

This app replicates the protocol the real app uses when you scan a friend's badge:

1. Generate our own RSA-2048 identity in the browser (WebCrypto), and register it with the festival backend
   with a placeholder profile (`src/lib/festivalApi.ts`) — the backend requires *a* name/email but never
   verifies them, so there's no real onboarding step.
2. Redeem the scanned QR's `id` + `sc` via the `favouritesAccess` endpoint — this is exactly what the official
   app does when you scan a friend to see their favourites, and grants our identity standing read access to
   theirs (not a one-time data pull — it persists server-side).
3. Fetch the artists they've favourited, and resolve the artist IDs to names via the public artist list.
4. Let you review/deselect artists, connect Spotify (Authorization Code + PKCE, all client-side), and build a
   playlist from each artist's top tracks (approximated via search + popularity ranking — see below).

**Caveat:** `sc` is a one-time/short-lived secret tied to whenever the other person last opened their QR code
screen in the app. A photo of a QR code may have already expired by the time you scan it, and redeeming the
same QR twice will fail (`"Invalid friend's secret challenge"`) — you generally need someone to show you their
QR live in the app, once.

## Single-account model

The app tracks **one** local festival identity and **one** "current friend" at a time (`src/lib/currentFriend.ts`),
not a list — scanning a new QR just overwrites which friend is current. On load, it resumes straight to that
friend's current favourites (a plain re-fetch, no QR needed) rather than showing a picker.

**Switch account** (bottom of the page) is the one deliberately destructive action: it wipes the local RSA
identity, the remembered friend, and the Spotify connection, so the app re-registers as a brand-new anonymous
participant next time. Previously-granted `favouritesAccess` relationships aren't revoked server-side by this —
there's no revoke endpoint in the decompiled API — it just stops being tracked locally.

## Spotify API quirks discovered along the way

Spotify's Web API has been in flux; several endpoints the "obvious" implementation would use are deprecated
and now return a bare `403 Forbidden`/`400` with no useful detail. Current workarounds, in `src/lib/spotifyApi.ts`:

- **Get Artist's Top Tracks is deprecated.** Replaced with a `search` call scoped to `artist:"name"`, filtered
  to tracks whose artist ID actually matches, ranked by the `popularity` field.
- **Search's `limit` maxes out at 10** (not 50) — both artist lookup and the top-tracks approximation above ask
  for exactly as many results as they need.
- **Create Playlist moved to `POST /me/playlists`** — the old `/users/{user_id}/playlists` form 403s.
- **Add/replace playlist items moved from `/playlists/{id}/tracks` to `/playlists/{id}/items`** — the old path
  is deprecated and 403s (this one's easy to hit silently: playlist creation itself still succeeds, so a stale
  `/tracks` call just creates an empty playlist).
- `findArtist()` scopes its query to the artist-name field and prefers an exact case-insensitive match over
  Spotify's raw relevance ranking — a bare-text search can otherwise surface an unrelated, more popular artist
  ahead of an exact but niche match.

Spotify's rate limit is an undisclosed rolling-30-second-window count (429 + `Retry-After` when exceeded, higher
for apps with "Extended Quota" approval). To avoid hitting it on every revisit, artist/track search results and
the festival's artist catalog are cached client-side via TanStack Query, persisted to `localStorage`
(`src/main.tsx`) — resolving the same artist twice across reloads is free.

## Backend note: CORS proxy required

The festival's backend (`admin.best4fest.app`) sends no `Access-Control-Allow-Origin` header, so a browser
can't call it directly. This repo includes a tiny Cloudflare Worker in [`worker/`](worker/) that proxies
requests and adds CORS headers. You need to deploy it once (see below) — everything else is a static SPA.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `VITE_SPOTIFY_CLIENT_ID` — create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
  Add this site's URL as a Redirect URI there — for local dev, use `http://127.0.0.1:5180/` specifically
  (**not** `localhost`; Spotify requires the literal loopback IP for non-HTTPS redirects, and `localhost` vs
  `127.0.0.1` are different origins for `localStorage` purposes too, so pick one and stick to it).
- `VITE_FESTIVAL_API_BASE` — only needed for production; see below.

## Local development

```bash
npm run dev -- --port 5180
```

Open `http://127.0.0.1:5180/` (matching the Spotify redirect URI above — `vite.config.ts` sets `server.host:
true` so both `127.0.0.1` and `localhost` work, but only one of them shares `localStorage`/the Spotify session
with itself across reloads, so don't switch between them mid-session).

The dev server proxies `/festival-api` to `https://admin.best4fest.app` (see `vite.config.ts`), so you don't
need the Cloudflare Worker running locally.

## Deploying

### 1. Deploy the CORS proxy (Cloudflare Worker)

```bash
cd worker
npm install
npx wrangler login
npm run deploy
```

This prints a URL like `https://brutal-to-spotify-proxy.<your-subdomain>.workers.dev`. Set that as
`VITE_FESTIVAL_API_BASE` in your production environment (e.g. a GitHub Actions repo variable, or `.env.production`).

### 2. Deploy the SPA to GitHub Pages

A workflow is already set up at `.github/workflows/deploy.yml`: it builds on every push to `main` and publishes
via GitHub's native Pages deployment. To enable it:

1. In the repo's **Settings → Pages**, set **Source** to "GitHub Actions".
2. In **Settings → Secrets and variables → Actions → Variables**, add repo variables `VITE_SPOTIFY_CLIENT_ID`
   and `VITE_FESTIVAL_API_BASE` (the Worker URL from step 1).
3. Push to `main` — the workflow builds and deploys automatically.

The build outputs relative asset paths (`base: './'` in `vite.config.ts`), so it works from a GitHub Pages
project subpath (`https://<user>.github.io/<repo>/`) without extra config.

Remember to add the deployed GitHub Pages URL as a Redirect URI in your Spotify app settings, and set
`VITE_SPOTIFY_REDIRECT_URI` to that exact URL if it doesn't match the page's own origin + path.
