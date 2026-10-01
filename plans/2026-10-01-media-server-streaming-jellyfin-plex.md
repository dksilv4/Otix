# Media Server In-App Streaming Plan (Jellyfin & Plex)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Otix users to stream video (movies and TV show episodes) and audio (music tracks) directly inside the Otix application (Web UI and Electron Desktop) from their personal **Jellyfin** and **Plex** media servers, with playback session reporting (scrobbling / continue watching).

**Architecture:**
1. A unified in-app video player modal (`MediaStreamPlayerModal`) built on HTML5 `<video>` with [`hls.js`](https://github.com/video-dev/hls.js) for adaptive HLS transcoding fallback and direct HTTP-range streaming for supported formats.
2. Provider streaming adapters for **Jellyfin** and **Plex** that resolve direct stream URLs, HLS transcode manifests, subtitle WebVTT tracks, and audio streams.
3. Bidirectional playback reporting (start, periodic progress tick, stopped) synced to the user's server so resume points and watched status remain up-to-date.
4. A new **Jellyfin Desktop Plugin** (`extensions/plugins/jellyfin/`) matching the pattern established by `extensions/plugins/plex/`.
5. Extension of the existing Plex integration to support embedded streaming alongside external deep links.

**Tech Stack:**
- Frontend: React 18, TypeScript, Tailwind CSS, `hls.js` (lightweight, standard HLS playback), Framer Motion, Lucide icons.
- Desktop: Electron IPC bridge (bypasses browser CORS for LAN servers like `192.168.x.x`).
- Plugins: CommonJS JavaScript runtime (`desktop/plugin-runtime/`).
- Network: Standard HTTP/HTTPS Range Requests (`206 Partial Content`) and HLS (`application/x-mpegURL`).

---

## ⚖️ Legal & Licensing Safeguards (Jellyfin GPL-2.0 Compliance)

1. **Network API Boundary:** Jellyfin Server is licensed under **GPL-2.0**. Otix connects exclusively over HTTP/HTTPS REST and WebSocket protocols as an external network client. Under copyright law and Free Software Foundation guidance, network API consumers do not form derivative works and Otix remains free of GPL contamination.
2. **Client Library Restrictions:** 
   - **Allowed:** Standard `fetch` / `httpJson`, native browser APIs, and official TypeScript packages licensed under MPL-2.0 (`@jellyfin/sdk`) or MIT.
   - **Prohibited:** Do NOT import `jellyfin-apiclient-python` into Otix's Python backend, as it is licensed under GPLv3.
3. **No Direct Binary Bundling:** Otix does not bundle or distribute Jellyfin server binaries; users connect to their own self-hosted servers.

---

## 📁 File Map

### New Files

| File | Responsibility |
| :--- | :--- |
| `extensions/plugins/jellyfin/manifest.json` | Plugin manifest defining settings (`serverUrl`, `authType`, `username`, `password`, `apiKey`), permissions (`network:external`), and UI slots. |
| `extensions/plugins/jellyfin/main.js` | Jellyfin plugin implementation: authentication (`/Users/AuthenticateByName`), library sync, TMDB/TVDB item resolution, stream URL generation, and session reporting. |
| `frontend/src/features/media/components/organisms/media-stream-player-modal.tsx` | Full-featured in-app video player modal: play/pause, seek scrubber, volume, quality selector, subtitle tracks, audio tracks, theater/fullscreen mode. |
| `frontend/src/features/media/hooks/use-media-stream-player.ts` | Context/hook managing the active video streaming session, URL resolution, fallback logic (Direct Play -> HLS), and playback heartbeats. |
| `frontend/src/features/media/types/stream-player.ts` | TypeScript types for stream sessions, subtitle tracks, media sources, and progress updates. |
| `frontend/src/lib/player/jellyfin-audio-provider.tsx` | Audio streaming provider for Jellyfin music tracks, plugging into the Otix music bar. |
| `frontend/src/features/media/components/organisms/__tests__/media-stream-player-modal.test.tsx` | Vitest tests for player controls, keyboard shortcuts, and stream events. |
| `frontend/src/features/media/hooks/__tests__/use-media-stream-player.test.ts` | Unit tests for stream player state and heartbeat timers. |

### Modified Files

| File | Responsibility |
| :--- | :--- |
| `extensions/plugins/plex/main.js` | Add `play.stream` endpoint returning stream URL, transcode URL, parts, and subtitle streams. |
| `frontend/src/features/media/components/organisms/plugin-detail-actions.tsx` | Add "Stream in Otix" primary action button for matched Jellyfin and Plex instances, with secondary dropdown for "Open in Web/App". |
| `frontend/src/features/media/hooks/use-media-detail-plugin-actions.ts` | Support triggering embedded video streaming via `useMediaStreamPlayer`. |
| `frontend/src/lib/player/types.ts` | Update `PlayerSource` union to include `'jellyfin'`, add Jellyfin audio dispatch methods. |
| `frontend/src/lib/player/hooks/use-player.tsx` | Wire Jellyfin audio actions and state into the unified audio player hook. |
| `frontend/src/main.tsx` | Wrap application root with `MediaStreamPlayerProvider`. |
| `package.json` | Add `hls.js` dependency to `frontend/package.json`. |

---

## 📋 Task Breakdown

### Phase 1: Stream Player Core & UI (`frontend`)

- [ ] **Task 1.1: Install `hls.js` and Define Stream Player Types**
  - Add `hls.js` (and `@types/hls.js` if separate) to `frontend/package.json`.
  - Create `frontend/src/features/media/types/stream-player.ts` with:
    - `StreamSource`: `'jellyfin' | 'plex'`
    - `SubtitleTrack`: `{ id: string; label: string; language: string; url: string; format: 'vtt' | 'srt' }`
    - `AudioTrack`: `{ id: string; label: string; language: string; index: number }`
    - `StreamPlaybackSession`: `{ source: StreamSource; serverUrl: string; token: string; itemId: string; title: string; subtitle?: string; directUrl: string; hlsUrl?: string; subtitles?: SubtitleTrack[]; startPositionMs?: number; durationMs?: number }`
  - Verify with `pnpm --filter frontend typecheck` (or `npm run typecheck`).

- [ ] **Task 1.2: Build the Streaming Hook & Session Manager (`use-media-stream-player.ts`)**
  - Implement `MediaStreamPlayerContext` and `useMediaStreamPlayer()`.
  - Track session state: `isOpen`, `isPlaying`, `isBuffering`, `currentTime`, `duration`, `volume`, `isMuted`, `activeSubtitle`, `activeQuality`.
  - Implement auto-fallback logic:
    - Attempt direct play via HTML5 `<video src={directUrl}>`.
    - If `video.error` triggers (codecs unsupported by client, e.g. MKV container or DTS audio), cleanly switch to `hlsUrl` via `Hls.js`.
  - Implement heartbeat timer:
    - Fire progress callback every 10 seconds.
    - Fire stopped callback on unmount or modal close.

- [ ] **Task 1.3: Build the In-App Video Player Component (`media-stream-player-modal.tsx`)**
  - Implement modal using `createPortal` and Framer Motion animations matching Otix's design system (`glass-card`, dark mode styling).
  - Controls:
    - Play / Pause button with spacebar toggle.
    - Timeline scrubber with hover thumbnail / timestamp preview and buffered progress range.
    - Skip -10s / +10s buttons.
    - Volume slider + mute toggle (persisted to `localStorage`).
    - Subtitle track picker (Off / track list) via native `<track kind="subtitles">`.
    - Quality selector (Original / 1080p / 720p).
    - Theater mode toggle and Fullscreen toggle (`document.fullscreenElement`).
  - Overlay auto-hide: Controls fade out after 3 seconds of mouse inactivity during playback.

---

### Phase 2: Jellyfin Plugin Implementation (`extensions/plugins/jellyfin`)

- [ ] **Task 2.1: Create Plugin Manifest (`extensions/plugins/jellyfin/manifest.json`)**
  - Configure plugin ID `jellyfin`, version `1.0.0`, permissions `["network:external"]`.
  - Define configuration schema:
    - `serverUrl`: text input (URL of user's Jellyfin instance).
    - `authMode`: dropdown (`credentials` or `apiKey`).
    - `username`: text input (if `credentials`).
    - `password`: password input (if `credentials`).
    - `apiKey`: secret input (if `apiKey`).
  - Register UI slots: `media/detail/actions` (for play/stream buttons) and `settings/integrations`.

- [ ] **Task 2.2: Implement Authentication & Connection Testing**
  - In `extensions/plugins/jellyfin/main.js`:
    - Implement `auth.test`: Call `GET /System/Info/Public` to verify reachability.
    - Implement `auth.login`: Call `POST /Users/AuthenticateByName` with `X-Emby-Authorization` / `Authorization` header containing `Client="Otix", Device="Desktop", DeviceId="...", Version="1.0.0"`.
    - Store returned `AccessToken` and `User.Id` in `ctx.config`.

- [ ] **Task 2.3: Implement Media Item Resolution & Playback Endpoints**
  - Implement `resolveMedia(ctx, { mediaType, tmdbId, tvdbId, title, year })`:
    - Search Jellyfin library via `GET /Users/{userId}/Items` with `AnyProviderIdEquals=tmdb.{tmdbId}` (or title search fallback).
    - Return matched item details (`Id`, `Name`, `MediaSources`, `UserData.PlaybackPositionTicks`).
  - Implement `play.stream(ctx, { itemId })`:
    - Construct direct stream URL: `${serverUrl}/Videos/${itemId}/stream?static=true&api_key=${token}`.
    - Construct HLS URL: `${serverUrl}/Videos/${itemId}/master.m3u8?DeviceId=${deviceId}&api_key=${token}&VideoCodec=h264&AudioCodec=aac`.
    - Extract subtitle tracks from `item.MediaStreams` where `Type === 'Subtitle'`:
      - URL: `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${index}/Stream.vtt?api_key=${token}`.
    - Return stream payload with current resume position.
  - Implement session reporting:
    - `session.start`: `POST /Sessions/Playing` with `ItemId`.
    - `session.progress`: `POST /Sessions/Playing/Progress` with `ItemId`, `PositionTicks` (1 sec = 10,000,000 ticks), `IsPaused`.
    - `session.stop`: `POST /Sessions/Playing/Stopped` with `ItemId`, `PositionTicks`.

---

### Phase 3: Upgrade Plex Plugin for In-App Video Streaming

- [ ] **Task 3.1: Add Video Stream Resolver to Plex Plugin (`extensions/plugins/plex/main.js`)**
  - Implement `play.stream(ctx, { serverId, ratingKey })`:
    - Resolve server connection info (IP/URL and token).
    - Fetch metadata: `GET /library/metadata/${ratingKey}`.
    - Extract `Part.key` for Direct Play: `${serverUrl}${part.key}?X-Plex-Token=${token}`.
    - Construct Plex Universal Transcode HLS URL for fallback:
      `${serverUrl}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(itemPath)}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&X-Plex-Token=${token}`.
    - Extract subtitle streams (`StreamType == 3`):
      `${serverUrl}${subStream.key}?X-Plex-Token=${token}`.
    - Return `StreamPlaybackSession` payload.
  - Implement Plex video timeline reporting:
    - `session.progress`: Call `GET /:/timeline?ratingKey=${ratingKey}&key=${key}&state=${state}&time=${ms}&duration=${durationMs}&X-Plex-Token=${token}`.

---

### Phase 4: UI Integration in Otix Media Detail Page

- [ ] **Task 4.1: Update Detail Actions (`plugin-detail-actions.tsx`)**
  - Update `PlayWidget` interface to support action types (`'stream'` | `'openExternal'`).
  - Update the Play button to default to **"Stream in Otix"**:
    - Clicking the main button opens the in-app `MediaStreamPlayerModal`.
    - A chevron dropdown provides secondary actions: "Open in Jellyfin Web / Plex App".
  - Display server source badge (e.g. Jellyfin server name, Plex server name).

- [ ] **Task 4.2: Connect `useMediaDetailPluginActions` to Stream Player**
  - In `frontend/src/features/media/hooks/use-media-detail-plugin-actions.ts`:
    - When `handlePlay` is invoked with `mode: 'stream'`, call plugin method `play.stream`.
    - Pass returned stream session to `useMediaStreamPlayer().openStream(...)`.

---

### Phase 5: Audio Streaming Support (Jellyfin Music)

- [ ] **Task 5.1: Generalize Otix Audio Player (`frontend/src/lib/player/`)**
  - Extend `types.ts`:
    - Add `'jellyfin'` to `PlayerSource = 'plex' | 'jellyfin' | 'none'`.
    - Add `JellyfinTrackInfo` interface.
  - Implement `jellyfin-audio-provider.tsx` matching `plex-audio-provider.tsx`:
    - Stream URL: `${serverUrl}/Audio/${trackId}/stream?static=true&api_key=${token}`.
    - Session tracking via `/Sessions/Playing` and `/Sessions/Playing/Progress`.
  - Update `use-player.tsx` to handle both Plex and Jellyfin sources seamlessly.

---

## 🧪 Verification & Testing Plan

1. **Automated Unit Tests:**
   - Run `npm test` / `vitest` in `frontend/` to test `MediaStreamPlayerModal` rendering, timeline scrubbing, and keybindings.
   - Test `useMediaStreamPlayer` fallback logic (Direct Play error -> HLS switch).
2. **CORS & Network Verification (Desktop vs Web):**
   - Test Electron desktop playback against LAN IP (`http://192.168.x.x:8096`).
   - Test Web UI playback against CORS-enabled or proxied server.
3. **Playback & Scrobble Verification:**
   - Start playback in Otix -> verify session appears active in Jellyfin/Plex Admin Dashboard.
   - Pause / seek in Otix -> verify progress updates.
   - Close player -> verify resume timestamp is saved in Jellyfin/Plex.
4. **Code Quality & Linting:**
   - Run `npm run lint` and `npm run typecheck` across `frontend/` and `desktop/`.
