# Media Server In-App Streaming Plan (Jellyfin & Plex)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Otix users to stream video (movies and TV show episodes) and audio (music tracks) directly inside the Otix application (Web UI and Electron Desktop) from their personal **Jellyfin** and **Plex** media servers, with full playback session reporting (scrobbling / continue watching synchronization).

---

## 🏗️ Architecture & Technical Decisions

1. **Unified Video Player Modal (`MediaStreamPlayerModal`):**
   - Built on HTML5 `<video>` paired with [`hls.js`](https://github.com/video-dev/hls.js) for adaptive HLS transcoding and HTTP Range Requests (`206 Partial Content`) for direct playback.
   - Design system: Glassmorphism, Framer Motion transitions, responsive controls, theater mode, and full-screen support.
   - Standard media controls: Play/pause, scrub bar with buffered ranges and time hover preview, skip ±10s, volume slider with persistence, full keyboard shortcuts (Space, Arrow keys, `F`, `M`), audio track selector, subtitle track picker, and TV episode navigation (Next/Prev Episode).

2. **Pre-Playback Codec & Container Compatibility Engine:**
   - **Addressing the "Silent Video" Trap:** Chromium decoders natively play H.264/VP9/AV1 video, but **lack decoders for AC-3, E-AC-3, DTS, and TrueHD audio**, which are standard in most media rips. Playing files with unsupported audio in HTML5 `<video>` does *not* trigger `video.error`; the video plays with complete silence.
   - **Resolution:** The player inspects stream metadata (container, video codec, audio codec) before starting playback. If the container is not MP4/WebM or the audio is AC3/DTS, the player routes directly to direct-stream remuxing or HLS transcoding with audio converted to AAC/Opus, bypassing the silent video failure mode.

3. **Subtitle Pipeline (SRT, WebVTT, Embedded, and PGS):**
   - Native `<track>` elements strictly require WebVTT (`text/vtt`).
   - External SubRip (`.srt`) tracks are dynamically converted to WebVTT client-side or retrieved via server conversion.
   - External & embedded text subtitles (SRT, VTT) are served as WebVTT streams via Jellyfin (`/Videos/{itemId}/Subtitles/{index}/Stream.vtt`) or Plex external stream keys.
   - Image-based bitmap subtitles (PGS/SUP) and stylized ASS/SSA subtitles that cannot be converted to VTT trigger server-side subtitle burn-in (`SubtitleMethod: Encode` in Jellyfin; transcode with selected subtitle stream in Plex).

4. **Transcode Session Lifecycle & CPU Leak Prevention:**
   - Every streaming session generates a unique `PlaySessionId` / `session` UUID.
   - The session ID is transmitted to Jellyfin (`master.m3u8` query parameter) and Plex (`session` parameter on `/video/:/transcode/universal/start.m3u8`).
   - On pause, modal close, or episode switch, an explicit stop event (`session.stop` / `/Sessions/Playing/Stopped`) is dispatched with the active `PlaySessionId` to immediately terminate host FFmpeg processes and prevent server CPU hogging.

5. **Networking & Platform Boundary (Desktop vs Web):**
   - **Electron Desktop:** The renderer process operates with `webPreferences.webSecurity = false` (configured in `desktop/main.ts`), enabling direct HTTP/HLS streaming from local LAN IP addresses (`http://192.168.x.x`) without browser CORS restrictions or memory-heavy IPC streaming.
   - **Standalone Web UI:** Web browser mode warns users when accessing unencrypted HTTP LAN servers from an HTTPS origin due to browser Mixed Content blocking, and gracefully provides external deep links ("Open in Jellyfin / Plex Web") when direct local access is restricted by browser security policies.

6. **Legal & Licensing Safeguards (Jellyfin GPL-2.0 Compliance):**
   - **Network API Boundary:** Jellyfin Server is licensed under **GPL-2.0**. Otix connects exclusively over HTTP/HTTPS REST and WebSocket protocols as an external network client. Network API consumers do not form derivative works; Otix remains free of GPL copyleft contamination.
   - **Client Library Restrictions:** Standard `fetch`, native browser APIs, and official TypeScript packages licensed under MPL-2.0 (`@jellyfin/sdk`) or MIT are permitted. Importing `jellyfin-apiclient-python` into Otix's Python backend is strictly prohibited.
   - **No Direct Binary Bundling:** Otix does not distribute Jellyfin server binaries; users connect to their own self-hosted servers.

---

## 📁 File Map

### New Files

| File | Responsibility |
| :--- | :--- |
| `extensions/plugins/jellyfin/manifest.json` | Plugin manifest defining settings (`serverUrl`, `authMode`, `username`, `password`, `apiKey`), permissions (`network:external`), and UI slots. |
| `extensions/plugins/jellyfin/main.js` | Jellyfin plugin implementation: authentication (`/Users/AuthenticateByName`), library sync, TMDB/TVDB item resolution, stream URL generation with `PlaySessionId`, and session reporting (`/Sessions/Playing`, `/Sessions/Playing/Progress`, `/Sessions/Playing/Stopped`). |
| `frontend/src/features/media/types/stream-player.ts` | TypeScript types for stream sessions, media streams, audio tracks, subtitle tracks, TV episode context, and playback progress updates. |
| `frontend/src/features/media/utils/stream-compatibility.ts` | Evaluates container and audio/video codecs to determine whether Direct Play, Audio Remux, or Full HLS Transcode is required. |
| `frontend/src/features/media/utils/subtitle-parser.ts` | Client-side SRT to WebVTT converter utility for external subtitles lacking direct VTT endpoints. |
| `frontend/src/features/media/hooks/use-media-stream-player.ts` | Context and React hook managing active video streaming session, URL resolution, transcode session lifecycle, and 10-second heartbeat reporting. |
| `frontend/src/features/media/components/organisms/media-stream-player-modal.tsx` | Full-featured in-app video player modal: play/pause, scrubber with preview, skip ±10s, volume persistence, subtitle track picker, audio track selector, quality selector, TV episode controls, keyboard shortcuts, and theater/fullscreen modes. |
| `frontend/src/lib/player/jellyfin-audio-provider.tsx` | Audio streaming provider for Jellyfin music tracks, plugging seamlessly into the Otix music bar. |
| `frontend/src/features/media/components/organisms/__tests__/media-stream-player-modal.test.tsx` | Vitest tests for player controls, keyboard shortcuts, and stream events. |
| `frontend/src/features/media/hooks/__tests__/use-media-stream-player.test.ts` | Unit tests for stream player state, compatibility fallback, and heartbeat timers. |

### Modified Files

| File | Responsibility |
| :--- | :--- |
| `extensions/plugins/plex/main.js` | Implement `play.stream` endpoint returning stream URL, universal transcode HLS URL with session ID and client headers, subtitle streams, and timeline progress tracking. |
| `frontend/src/features/media/components/organisms/plugin-detail-actions.tsx` | Add "Stream in Otix" primary action button for matched Jellyfin and Plex instances, with secondary dropdown for "Open in Web/App". |
| `frontend/src/features/media/hooks/use-media-detail-plugin-actions.ts` | Support triggering embedded video streaming via `useMediaStreamPlayer`. |
| `frontend/src/lib/player/types.ts` | Update `PlayerSource` union to include `'jellyfin'`, add Jellyfin audio dispatch methods. |
| `frontend/src/lib/player/hooks/use-player.tsx` | Wire Jellyfin audio actions and state into the unified audio player hook. |
| `frontend/src/main.tsx` | Wrap application root with `MediaStreamPlayerProvider`. |
| `frontend/package.json` | Add `hls.js` dependency. |

---

## 📋 Task Breakdown

### Phase 1: Stream Player Core, UI & Subtitle/Codec Helpers (`frontend`)

- [ ] **Task 1.1: Install `hls.js` and Define Stream Player Types**
  - Add `hls.js` and `@types/hls.js` to `frontend/package.json`.
  - Create `frontend/src/features/media/types/stream-player.ts`:
    - `StreamSource`: `'jellyfin' | 'plex'`
    - `SubtitleFormat`: `'vtt' | 'srt' | 'pgs' | 'ass'`
    - `SubtitleTrack`: `{ id: string; index: number; label: string; language: string; url?: string; format: SubtitleFormat; isExternal: boolean; requiresBurnIn: boolean }`
    - `AudioTrack`: `{ id: string; index: number; label: string; language: string; codec: string; channels: number }`
    - `EpisodeContext`: `{ seriesTitle: string; seasonNumber: number; episodeNumber: number; episodeTitle: string; nextEpisodeId?: string; prevEpisodeId?: string }`
    - `StreamPlaybackSession`: `{ source: StreamSource; serverUrl: string; token: string; itemId: string; title: string; subtitle?: string; playSessionId: string; directUrl?: string; hlsUrl: string; audioTracks: AudioTrack[]; selectedAudioIndex?: number; subtitles: SubtitleTrack[]; selectedSubtitleIndex?: number; episodeContext?: EpisodeContext; startPositionMs?: number; durationMs?: number }`
  - Verify with `npm run typecheck` in `frontend/`.

- [ ] **Task 1.2: Build Codec & Compatibility Engine and Subtitle Utility**
  - Create `frontend/src/features/media/utils/stream-compatibility.ts`:
    - Define browser native codec support matrix (video: `h264`, `vp9`, `av1`; audio: `aac`, `mp3`, `opus`, `flac`; container: `mp4`, `webm`).
    - Implement `determinePlaybackMethod(container, videoCodec, audioCodec)` returning `'direct-play' | 'direct-stream' | 'transcode'`.
  - Create `frontend/src/features/media/utils/subtitle-parser.ts`:
    - Implement `convertSrtToVtt(srtContent: string): string` to convert `.srt` timestamps and cues into standard WebVTT format for native `<track>` rendering.
  - Add unit tests for compatibility matrix and subtitle parsing.

- [ ] **Task 1.3: Build the Streaming Hook & Session Manager (`use-media-stream-player.ts`)**
  - Implement `MediaStreamPlayerContext` and `useMediaStreamPlayer()`.
  - State tracking: `isOpen`, `isPlaying`, `isBuffering`, `currentTime`, `duration`, `volume`, `isMuted`, `activeSubtitle`, `activeAudio`, `playbackMethod` (`'direct'` | `'hls'`).
  - Implement robust playback selection:
    - If `determinePlaybackMethod` indicates safe direct play and `directUrl` exists, mount direct stream on `<video>`.
    - If audio is AC3/DTS, container is MKV, or `video.error` triggers, initialize `Hls.js` with `hlsUrl`.
  - Implement session lifecycle:
    - Generate unique `playSessionId` per stream.
    - 10-second periodic heartbeat reporting (`session.progress`).
    - Immediate `session.stop` cleanup on modal close, unmount, or page navigation.

- [ ] **Task 1.4: Build the In-App Video Player Component (`media-stream-player-modal.tsx`)**
  - Implement modal using `createPortal` and Framer Motion animations matching Otix's design system (`glass-card`, dark mode styling).
  - Controls & UI:
    - Play / Pause button with spacebar toggle.
    - Timeline scrubber with hover timestamp preview, buffered progress bar, and seek drag.
    - Skip -10s / +10s buttons.
    - Volume slider + mute toggle (persisted to `localStorage`).
    - Audio track selector dropdown (switching between audio languages / tracks).
    - Subtitle track picker (Off / WebVTT tracks / server burn-in indicator).
    - TV Episode controls: Episode title header (`S01E03: Title`), "Next Episode" button, and auto-play prompt on playback completion.
    - Theater mode toggle and Fullscreen toggle (`document.fullscreenElement`).
    - Comprehensive keyboard shortcuts: Space (play/pause), Left/Right (seek ±10s), Up/Down (volume ±5%), `F` (fullscreen), `M` (mute).
    - Auto-hide controls overlay after 3 seconds of mouse inactivity during playback.

---

### Phase 2: Jellyfin Plugin Implementation (`extensions/plugins/jellyfin`)

- [ ] **Task 2.1: Create Plugin Manifest (`extensions/plugins/jellyfin/manifest.json`)**
  - Plugin ID `jellyfin`, version `1.0.0`, permissions `["network:external"]`.
  - Configuration schema:
    - `serverUrl`: text input (URL of user's Jellyfin instance).
    - `authMode`: dropdown (`credentials` or `apiKey`).
    - `username`: text input (if `credentials`).
    - `password`: password input (if `credentials`).
    - `apiKey`: secret input (if `apiKey`).
  - Register UI slots: `media/detail/actions` (for play/stream buttons), `media/card/badges` (for "On Jellyfin" badge), and `settings/integrations`.

- [ ] **Task 2.2: Implement Authentication & Connection Testing**
  - In `extensions/plugins/jellyfin/main.js`:
    - Implement `auth.test`: Call `GET /System/Info/Public` to verify reachability.
    - Implement `auth.login`: Call `POST /Users/AuthenticateByName` with `X-Emby-Authorization` header containing `Client="Otix", Device="Desktop", DeviceId="...", Version="1.0.0"`.
    - Store returned `AccessToken` and `User.Id` in `ctx.config`.

- [ ] **Task 2.3: Implement Media Item Resolution & Playback Endpoints**
  - Implement `resolveMedia(ctx, { mediaType, tmdbId, tvdbId, title, year })`:
    - Search Jellyfin library via `GET /Users/{userId}/Items` with `AnyProviderIdEquals=tmdb.{tmdbId}` (with title/year fallback).
    - Return matched item details (`Id`, `Name`, `MediaSources`, `UserData.PlaybackPositionTicks`).
  - Implement `play.stream(ctx, { itemId, audioIndex, subtitleIndex, playSessionId })`:
    - Generate or accept `playSessionId`.
    - Retrieve item details and media stream specs (`MediaStreams` containing video, audio, and subtitle streams).
    - Direct stream URL: `${serverUrl}/Videos/${itemId}/stream?static=true&api_key=${token}`.
    - HLS transcode URL:
      `${serverUrl}/Videos/${itemId}/master.m3u8?PlaySessionId=${playSessionId}&DeviceId=${deviceId}&api_key=${token}&VideoCodec=h264&AudioCodec=aac&TranscodingMaxAudioChannels=2${audioIndex != null ? `&AudioStreamIndex=${audioIndex}` : ''}${subtitleIndex != null ? `&SubtitleStreamIndex=${subtitleIndex}&SubtitleMethod=Encode` : ''}`.
    - Extract subtitle tracks:
      - If text format (SRT, VTT): `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${index}/Stream.vtt?api_key=${token}`.
      - If image format (PGS/SUP): Flag `requiresBurnIn: true`.
    - Return complete `StreamPlaybackSession` payload with resume position (`startPositionMs`).
  - Implement session reporting:
    - `session.start`: `POST /Sessions/Playing` with `ItemId` and `PlaySessionId`.
    - `session.progress`: `POST /Sessions/Playing/Progress` with `ItemId`, `PlaySessionId`, `PositionTicks` (10,000,000 ticks/sec), `IsPaused`.
    - `session.stop`: `POST /Sessions/Playing/Stopped` with `ItemId` and `PlaySessionId` to immediately terminate transcoding FFmpeg tasks.

---

### Phase 3: Upgrade Plex Plugin for In-App Video Streaming (`extensions/plugins/plex`)

- [ ] **Task 3.1: Add Video Stream Resolver to Plex Plugin (`extensions/plugins/plex/main.js`)**
  - Implement `play.stream(ctx, { serverId, ratingKey, playSessionId, audioIndex, subtitleIndex })`:
    - Resolve server connection info (IP/URL and token).
    - Fetch metadata: `GET /library/metadata/${ratingKey}` with `Accept: application/json`.
    - Extract `Part.key` for Direct Play: `${serverUrl}${part.key}?X-Plex-Token=${token}`.
    - Extract video, audio, and subtitle streams from `Part.Stream`:
      - Audio streams: codec, language, channels, index.
      - Subtitle streams: format, language, key (for external sidecar files).
    - Construct Plex Universal Transcode HLS URL with all required session and client headers:
      `${serverUrl}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent('/library/metadata/' + ratingKey)}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&hasMDE=1&session=${playSessionId}&X-Plex-Client-Identifier=${clientId}&X-Plex-Product=Otix&X-Plex-Platform=Desktop&X-Plex-Token=${token}${audioIndex != null ? `&audioStreamID=${audioIndex}` : ''}${subtitleIndex != null ? `&subtitleStreamID=${subtitleIndex}` : ''}`.
    - Return `StreamPlaybackSession` payload.
  - Implement Plex video timeline reporting:
    - `session.progress`: Call `GET /:/timeline?ratingKey=${ratingKey}&key=${encodeURIComponent('/library/metadata/' + ratingKey)}&state=${state}&time=${ms}&duration=${durationMs}&X-Plex-Session-Identifier=${playSessionId}&X-Plex-Token=${token}`.
    - `session.stop`: Send `state=stopped` to cleanly terminate transcode sessions.

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
  - Add episode-level streaming trigger for TV Show season/episode listings.

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
   - Vitest tests for `stream-compatibility.ts` (verifying correct detection of AC3, DTS, MKV containers).
   - Vitest tests for `subtitle-parser.ts` (verifying SRT to WebVTT timestamp and cue parsing).
   - Vitest tests for `MediaStreamPlayerModal` rendering, timeline scrubbing, volume persistence, and keyboard shortcuts.
   - Vitest tests for `useMediaStreamPlayer` fallback logic (safe direct play vs HLS switch) and heartbeat timers.

2. **Network & Session Cleanup Verification:**
   - Stream high-bitrate MKV with AC-3 audio -> verify player correctly engages HLS transcode/remux and plays audio without silence.
   - Pause / close modal -> verify `/Sessions/Playing/Stopped` is called with the matching `PlaySessionId` and host FFmpeg process terminates immediately.

3. **Subtitles & Audio Track Switching:**
   - Toggle between external WebVTT/SRT subtitles -> verify `<track>` displays text correctly.
   - Select PGS subtitle track -> verify server transcode with burn-in is requested.
   - Switch audio tracks -> verify stream reloads smoothly with selected audio index.

4. **Code Quality & Type Safety:**
   - Run `npm run lint` and `npm run typecheck` across `frontend/` and `desktop/`.
