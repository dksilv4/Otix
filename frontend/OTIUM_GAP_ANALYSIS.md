# Otium → Otix Feature Gap Analysis

A detailed comparison of features present in Otium (Django) that are missing from Otix (FastAPI).

---

## 1. AUTH

### 1.1 Two-Factor Authentication (2FA)
- **Backend:** TOTP setup, enable, disable, verify during login. Backup codes. Multiple endpoint path fallbacks (`2fa` / `two-factor`).
- **Frontend:** `TwoFactorChallenge` component with `OtpInput`, QR code setup flow, verify/disable UI.

### 1.2 Email Verification
- **Backend:** `POST /auth/verify-email`, `AuthActionToken` model with EMAIL_VERIFY action. Verification required gate.
- **Frontend:** `VerifyEmailPage`, `VerificationRequiredPage`, `VerificationRequiredModal`, `useVerificationGate` hook. Resend verification email.

### 1.3 Password Reset
- **Backend:** `POST /auth/forgot-password`, `POST /auth/reset-password`, `AuthActionToken` with PASSWORD_RESET action. Email sending.
- **Frontend:** `ForgotPasswordPage`, `ResetPasswordPage` with key from email link.

### 1.4 Steam OAuth / Social Login
- **Backend:** `POST /auth/steam/initiate`, `GET /auth/steam/callback`, Steam OpenID client. SSO provider framework.
- **Frontend:** `SSOProviders` component, `OAuthProviderButton`, `OAuthCallbackPage` (popup `postMessage` flow).

### 1.5 Session Management
- **Backend:** `ActiveSessionMiddleware`, `UserSession` model with device info, `SessionRevocationAuditEvent`, `POST /auth/logout/all`, session listing.
- **Frontend:** Session info display, revoke individual sessions.

### 1.6 Auth Rate Limiting
- **Backend:** Redis sorted-set sliding window (20/IP, 10/identity per 5min).

### 1.7 Auth Restriction System (Feature Gates)
- **Backend:** Backend-defined permissions restricting access to social, integrations, etc.
- **Frontend:** Feature gate checks in UI, restricted feature messaging.

---

## 2. USER PROFILES

### 2.1 User Stats / XP / Level / Streaks
- **Backend:** `UserStats` model: `total_exp`, `level`, `current_streak`, `longest_streak`, `media_watched_count`, `media_reviewed_count`, `achievements_unlocked`, `lists_created`, `friends_count`, `last_activity_at`. XP awarded for achievements.
- **Frontend:** `XPBar` component, level display, streak tracking (current/longest/multiplier/bonus/freeze days), `XpFloatProvider` for XP gain animations.
- **Note:** Otix frontend computes a crude level from review count (`floor(reviews/3)+1`), but no backend persistence or streak system.

### 2.2 Dedicated Avatar/Background Upload Endpoints
- **Backend:** `POST /user/me/avatar`, `DELETE /user/me/avatar`, `POST /user/me/background`, `DELETE /user/me/background`.
- **Frontend:** `ProfileEditModal` with separate avatar/background uploaders, `BackgroundPositionPicker`.

### 2.3 User Insights
- **Backend:** `GET /user/me/insights`, `GET /user/{id}/insights` with stats aggregation.
- **Frontend:** `InsightsPage`, `ProfileInsights` component.

### 2.4 User Activity Calendar
- **Backend:** `GET /user/{id}/calendar` returning date-range activity data.
- **Frontend:** `CalendarPage` with user activity overlay.

### 2.5 Profile Edit Modal
- **Backend:** `POST /user/{id}/profile` multipart endpoint.
- **Frontend:** `ProfileEditModal` with avatar, background, bio, nickname, forename/surname fields.

### 2.6 Followers / Following
- **Backend:** Friend system covers this — see Section 12.
- **Frontend:** `FollowersModal`, `FollowingModal`, follow/unfollow buttons.

### 2.7 Memory Forge Progress
- **Backend:** `UserMemoryForgeProgress` model, `GET/PUT /user/me/memory-forge/progress`, leaderboard.
- **Frontend:** `MemoryForgePage` (idle/incremental game).

---

## 3. MEDIA

### 3.1 Similar Media / Recommendations
- **Backend:** `GET /media/{type}/{id}/similar`, `GET /media/{type}/{id}/recommendations`, `GET /media/{type}/{id}/cross-media`, `GET /media/for-you` (personalized). `MediaEntity` vector embeddings, `MediaRecommendationEdge` weighted graph, multiple recommendation runs.
- **Frontend:** Similar/recommendation sections on media detail, "For You" section on home page.

### 3.2 Media Subscriptions
- **Backend:** `POST /media/{type}/{id}/subscribe`, `DELETE /media/{type}/{id}/subscribe`, `GET /media/subscriptions`.
- **Frontend:** Subscribe/unsubscribe button.

### 3.3 Where to Watch (Streaming Availability)
- **Backend:** Watch provider data per country (flatrate/rent/buy), `WatchProvider` model.
- **Frontend:** `WhereToWatch` component with country selector and provider logos.

### 3.4 Smart Watch (Bulk Episode Marking)
- **Backend:** `POST /media/episode/{id}/watch-till` (batch mark up to point).
- **Frontend:** `SmartWatchModal` detecting missed episodes across season boundaries.

### 3.5 Episode Ratings Heatmap
- **Backend:** `GET /media/show/{id}/ratings-matrix`.
- **Frontend:** `EpisodeRatingsHeatmap`, `SeriesRatingsHeatmap`, `SeriesRatingsHeatmapModal`.

### 3.6 Season Detail Endpoint
- **Backend:** `GET /media/season/{id}` with full episode data.

### 3.7 Completeness Score Display
- **Backend:** `completeness_score` field exists on Otix `MediaItem`, but no UI exposure.
- **Frontend:** Visual completeness indicator.

### 3.8 Anime Classification
- **Backend:** `is_anime` field on Movie/Show. Otix has this in models but may not expose in API.
- **Frontend:** Anime badge/indicator on media cards.

---

## 4. DISCOVER

### 4.1 Dedicated Discover API Endpoints
- **Backend:** `GET /discover/hero`, `GET /discover/{media_type}/{list_type}` with list types: `trending`, `popular`, `top_rated`, `upcoming`, `now_playing`, `airing_today`, `on_the_air`, `airing_now`. Time windows (day/week). Locale-aware. Source routing (TMDB/IGDB).
- **Frontend:** `DiscoverPage` with hero, carousels, lists carousel, user interaction carousel.
- **Note:** Otix populates discover data via sync tasks (TMDB trending/popular/etc.) but has NO dedicated discover API endpoints. The data exists in the DB but isn't served through discover-specific routes.

### 4.2 Continue Watching
- **Backend:** Playback progress tracking, `GET /discover/continue_watching`.
- **Frontend:** Continue watching carousel on home/discover.

### 4.3 Discover Cache Warming
- **Backend:** Versioned Redis cache (v8), parallel ThreadPoolExecutor warming, locale-aware keys.

---

## 5. SEARCH

### 5.1 Smart Search (Natural Language)
- **Backend:** `GET /search/smart?q=...` — pattern detection: "movies directed by X", "films with X", "shows starring X", "movies like X", "shows similar to X". Reference media resolution with tokenized fallback.
- **Frontend:** Natural language query routing to `/search/smart`. Person-scoped search.

### 5.2 Autocomplete / Suggestions
- **Backend:** `GET /search/suggestions?q=...` — title matching + genre matching, smart prompts ("popular movies"), popularity-ranked, 8 results.
- **Frontend:** `SearchSuggestions` dropdown component.

### 5.3 Saved Searches
- **Backend:** `SavedSearch` model (implicit from SearchQuery).
- **Frontend:** `SavedSearches` modal.

### 5.4 Search with Genre/Year/Rating Facets
- **Backend:** Filtered search with year range, rating range, adult content toggle.
- **Frontend:** `AdvancedFilters` component, `SearchFilters`.

### 5.5 Determinisitic Search Pagination
- **Backend:** `ORDER BY rank DESC, popularity DESC, id` for stable pagination.
- **Note:** Otix uses trigram + pgvector hybrid; pagination approach may differ.

---

## 6. LISTS

### 6.1 Collaborators
- **Backend:** `MediaListCollaborator` model with VIEW/EDIT/ADMIN permissions. `POST /list/{id}/collaborators`, `DELETE /list/{id}/collaborators/{user_id}`, invitation system, accept/decline.
- **Frontend:** `ManageCollaboratorsModal`, invite flow, permission level management, collaborator list.

### 6.2 List Likes / Follows
- **Backend:** `MediaListLike` model, `POST/DELETE /list/{id}/like`.
- **Frontend:** Like button on lists, liked lists section.

### 6.3 Drag-and-Drop Reorder UI
- **Backend:** `PATCH /list/{id}/items/{id}/position` (individual) + `POST /list/{id}/reorder_items` (batch).
- **Frontend:** `@dnd-kit` drag-and-drop reordering.
- **Note:** Otix has `PUT /list/{id}/item` for reorder but no drag-and-drop UI.

### 6.4 System Lists
- **Backend:** Auto-generated lists at `GET /list/user/{watchlisted|liked|rated|watched|reviewed}`.
- **Frontend:** `SystemListsQuickAccess` component.

### 6.5 List Export / Share
- **Backend:** Export endpoint (format options).
- **Frontend:** `ExportModal`, `ShareModal`.

### 6.6 List Recommendations
- **Backend:** `GET /list/{id}/recommendations`.
- **Frontend:** `ListRecommendations` component.

### 6.7 Rank Change History
- **Backend:** Ranking history tracking.
- **Frontend:** `HistoryTimelineView` in list detail.

### 6.8 Advanced List Options
- **Backend:** `is_collaborative`, `is_ranked`, `sort_order`, `slug`, `cover_image`.
- **Frontend:** `CreateListModal` with advanced options (ranked, collaborative, cover image).

---

## 7. SOCIAL

### 7.1 Posts
- **Backend:** `Post` model (user, content, media GFK, privacy, pinned). Full CRUD at `/social/posts`.
- **Frontend:** Post composer, post display in feed.

### 7.2 Post Likes & Comments
- **Backend:** `PostLike` model, `PostComment` model with self-referential parent (nesting). `POST /social/posts/{id}/like`, `POST /social/posts/{id}/comments`, `DELETE`.
- **Frontend:** Like button on posts, comment composer, nested reply display.

### 7.3 Activity Feed
- **Backend:** `ActivityEvent` model, `GET /social/feed` (friends + public with filters), `GET /social/feed/stats`, `GET /social/feed/trending`, `GET /social/feed/recommendations`.
- **Frontend:** `ActivityTimeline`, `HomeFeed`, `CompactActivityFeed`, `FeedControls`, `HomeActivityItem`.

### 7.4 Watch History
- **Backend:** `GET /social/history`.
- **Frontend:** `HistoryTimeline` component, dedicated history page at `/profile/history`.

### 7.5 Activity Detail with Comments
- **Backend:** `GET /social/{id}`, comment CRUD on activities.
- **Frontend:** `ActivityPage` at `/activity/$activityId`, `CommentsSection` with sort, replies pagination, like/dislike/helpful on comments.

---

## 8. NOTIFICATIONS

### 8.1 Notification CRUD
- **Backend:** `Notification` model (user, actor, verb, message, target GFK, read status). `GET /notification` (paginated), `PATCH /notification/{id}/read`, `POST /notification/read-all`, `GET /notification/unread-count`, `DELETE /notification/{id}`.
- **Frontend:** `NotificationBar` slide-out panel, `NotificationButton` with unread badge, `NotificationCard`.

### 8.2 Push Notifications (Web Push)
- **Backend:** `PushSubscription` model, `POST /notification/push-subscribe`, `DELETE`, VAPID key endpoint. `send_web_push_notification` Celery task using pywebpush.
- **Frontend:** Service worker registration, push subscription management, browser permission handling.

### 8.3 Real-Time Delivery (WebSocket)
- **Backend:** Django Channels `AppConsumer` at `ws/app` — `send_notification`, `send_sync_progress`, `send_xp_update`, `send_search_hydration`, `send_discover_hydration`, `send_media_detail`. `NotificationService` creates + persists + broadcasts + dispatches push.
- **Frontend:** `AppWebSocketProvider` context, event listeners for each message type.

### 8.4 Toast Notifications
- **Frontend:** `ToastNotificationCard`, `ToastContent`. Real-time toast display for WebSocket events.

---

## 9. REAL-TIME INFRASTRUCTURE

### 9.1 WebSocket / SSE
- **Backend (Otium):** Django Channels + Redis channel layer. 6 message types. JWT auth extraction from multiple header formats.
- **Backend (Otix):** No WebSocket or SSE infrastructure.
- **Frontend (Otium):** `AppWebSocketProvider`, per-message-type event handling.
- **Frontend (Otix):** No real-time provider.

### 9.2 Confetti / XP Float Animations
- **Frontend (Otium):** `Confetti` particle system atom, `XpFloatProvider` for XP gain floating animations.
- **Frontend (Otix):** Not present.

---

## 10. SETTINGS

### 10.1 Comprehensive Settings Sections
- **Backend (Otium):** `UserSettings` model with 35+ fields. Per-section endpoints: `GET/PATCH /settings/locale`, `/notifications`, `/privacy`, `/playback`. `GET/PATCH /settings` for all. `POST/DELETE /settings/blocked-keywords`.
- **Backend (Otix):** Only `PATCH /auth/me` for basic profile fields (username, email, bio, avatar_url, background_url).
- **Frontend (Otium):** Full settings page with sections: Profile, Account, Appearance, Content, Notifications, Subscriptions, Social, Integrations, Scanner. `SettingsLayout` with sidebar nav.
- **Frontend (Otix):** Settings page with Profile, Appearance, Account only.

### 10.2 Appearance Settings
- **Backend:** `ui_scale`, `font_size`, `reduced_motion` fields.
- **Frontend:** Theme toggle (dark/light), language selector, country code. Font size, UI scale, reduced motion toggle.

### 10.3 Content Settings
- **Backend:** `content_language`, `autoplay_trailers`, `autoplay_next_episode`, `subtitle_language`, `subtitle_enabled`.
- **Frontend:** `ContentSettings` section.

### 10.4 Notification Preferences
- **Backend:** `desktop_notifications`, `push_notifications`, `email_notifications`, `notification_types` JSON, `release_notification_platforms`, `release_notification_regions`.
- **Frontend:** `NotificationSettings` with channel toggles, `Subscriptions` management.

### 10.5 Playback Settings
- **Backend:** `playback_quality`, `download_quality`, `stream_quality_limit`, `download_directory`.
- **Frontend:** Playback preferences UI.

### 10.6 Privacy / Social Settings
- **Backend:** `privacy_level` (PUBLIC/FRIENDS_ONLY/PRIVATE), `show_watchlist`, `show_activity`, `show_achievements`, `show_stats`, `profile_visibility`, `activity_visibility`.
- **Frontend:** `SocialSettings` section with privacy toggles.

### 10.7 Blocked Keywords
- **Backend:** `UserBlockedKeyword` model, add/delete endpoints.
- **Frontend:** Keyword management UI.

---

## 11. PROVIDER INTEGRATIONS (User-Facing)

### 11.1 Plex Integration
- **Backend (Otium):** `PlexAccount` + `PlexServer` + `PlexServerLibrarySection` models. Link flow (OAuth PIN), server discovery, library sync with per-section control, scrobbling (`PlexWatchEvent`), playback progress, unmatched item resolution. Sync reports.
- **Backend (Otix):** `providers/plex/` directory exists but is EMPTY (only `__init__.py`).
- **Frontend (Otium):** Plex connection UI, library browse, HLS playback modal with quality/subtitle selection, sync reports page.
- **Frontend (Otix):** No Plex UI.

### 11.2 Steam Account Linking
- **Backend (Otium):** `SteamAccount` model, connect/confirm/disconnect flow, `POST /provider/steam/sync/library`, `POST /provider/steam/sync/recent`.
- **Backend (Otix):** Steam provider exists for data sync but no user account linking.
- **Frontend (Otium):** Steam connect button, library sync, game library card view.
- **Frontend (Otix):** No Steam account UI.

### 11.3 TMDB Account Linking
- **Backend (Otium):** `TMDBAccount` model, connect/confirm/disconnect flow.
- **Backend (Otix):** No user-facing TMDB linking.
- **Frontend (Otium):** TMDB connect button.
- **Frontend (Otix):** Not present.

### 11.4 OAuth Framework
- **Backend (Otium):** Generic OAuth flow at `/provider/{id}/oauth/start` and `/complete`.
- **Backend (Otix):** Not present.

### 11.5 Integration Settings Hub
- **Frontend (Otium):** `IntegrationsSettings` page with provider cards, per-integration config pages at `/setting/integrations/$integration`.
- **Frontend (Otix):** Not present.

### 11.6 Provider Capabilities & API Proxy
- **Backend (Otium):** `GET /provider/{id}/capabilities`, `GET /provider/{id}/api/{resource}/{id}` (3-tier: raw → validated → transformed).

### 11.7 Provider Health Dashboard
- **Backend:** Rate limit status, circuit breaker states. `GET /sync/providers`.
- **Frontend:** Provider health display.

---

## 12. FRIENDS / SOCIAL GRAPH

### 12.1 Friend Requests
- **Backend:** `Friendship` model (PENDING/ACCEPTED/BLOCKED). `POST /friend/request/{id}`, `POST /friend/accept/{id}`, `POST /friend/reject/{id}`.
- **Frontend:** Friend request notifications, accept/reject buttons.

### 12.2 Friends List
- **Backend:** `GET /friend/list`, `POST /friend/remove/{id}`, `POST /friend/block/{id}`.
- **Frontend:** Friends list display, unfriend/block actions.

### 12.3 Friend Activity
- **Backend:** `FriendActivity` model, `GET /friend/activity`.
- **Frontend:** `FriendActivityStrip` component on home page.

### 12.4 Followers / Following
- **Frontend:** `FollowersModal`, `FollowingModal` on user profiles.

---

## 13. WORKOUT (Enhanced)

### 13.1 Exercise Catalog Facets
- **Backend (Otium):** `GET /workout/catalog/facets` — filterable by discipline, equipment, muscle group, difficulty. `ExerciseEquipment`, `ExerciseMuscleTarget` models.
- **Backend (Otix):** Only `GET /exercises` (flat list) and `GET /exercises/categories` (category counts).
- **Frontend (Otium):** Faceted exercise browser with multiple filter dimensions.
- **Frontend (Otix):** Flat exercise list (no facet filtering).

### 13.2 Exercise Media
- **Backend (Otium):** `ExerciseMedia` model (IMAGE/VIDEO/ANIMATION) with caption and sort order.
- **Frontend:** Exercise images/animations in catalog and during sessions.

### 13.3 Workout Templates
- **Backend (Otium):** `WorkoutTemplate` model with public/private, AI-generated flag. `CRUD /workout/templates`, `POST /workout/templates/{id}/clone`, `GET /workout/templates/featured`.
- **Backend (Otix):** No template system.
- **Frontend (Otium):** Template browser (system + user), template detail, clone button.
- **Frontend (Otix):** No template UI.

### 13.4 Detailed Set Tracking
- **Backend (Otium):** `WorkoutSet` model: `reps`, `weight_kg`, `duration_seconds`, `distance_meters`, `rpe`, `is_warmup`, `is_dropset`, `is_failure`, `completed_at`.
- **Backend (Otix):** Sets stored as JSONB on `WorkoutExercise` (simpler, no individual set model).
- **Frontend (Otium):** Per-set input with RPE, warmup/dropset/failure toggles.
- **Frontend (Otix):** Sets parsed from natural language input only.

### 13.5 AI Exercise Suggestions
- **Backend (Otium):** `ExerciseSuggestion` model, `POST /workout/catalog/suggestions`.
- **Frontend:** AI suggestion request UI.

### 13.6 Active Session Tracking
- **Backend (Otium):** `GET /workout/sessions/active`, `POST /workout/sessions/{id}/complete`, `POST /workout/sessions/{id}/abandon`.
- **Frontend:** Active session detection, resume/finish/abandon flow.

### 13.7 Exercise Aliases & Multilingual Support
- **Backend (Otium):** `ExerciseAlias` model for exercise name aliases in different languages.

### 13.8 Exercise Metric Profiles
- **Backend (Otium):** `ExerciseMetricProfile` model for default metric types and units per exercise.

---

## 14. CALENDAR

### 14.1 Unified Calendar
- **Backend (Otium):** `GET /user/{id}/calendar` — returns events with types: `media_release`, `media_activity`, `workout_session`. Date range querying.
- **Frontend (Otium):** `CalendarPage` with month grid, mini-month picker, agenda view, day modal, event cards, sidebar filters (event kinds, media types, scope). `QuickGymLogModal`.
- **Otix:** No calendar features.

---

## 15. ACHIEVEMENTS

### 15.1 Achievement System
- **Backend (Otium):** `Achievement` model (10 seeded), `UserAchievement` (with progress), `AchievementProgressEvent`. Types: XP_THRESHOLD, STREAK, COLLECTION, SOCIAL, WATCH, REVIEW, CUSTOM. Claim rewards endpoint.
- **Frontend (Otium):** `AchievementBadge` (rarity-based styling: common→mythic), `AchievementCard`, `AchievementModal`, achievements list page at `/profile/achievement`.
- **Otix:** No achievement system.

---

## 16. GENRE

### 16.1 Dedicated Genre Discovery Page
- **Backend (Otium):** `GET /genre` (list, filterable by media_type), `GET /genre/{slug}`, `GET /genre/{id}/media` (paginated).
- **Frontend (Otium):** Full genre page at `/genre/$genreName` with type tabs (All/Movies/Shows/Games) with counts, sort options, filter modal (year range, rating range, adult toggle), infinite scroll, `MediaInfoSidebar`.
- **Frontend (Otix):** No dedicated genre route/page.

### 16.2 Genre-Relevance Scoring
- **Backend (Otium):** `MediaGenre.relevance_score` field.

---

## 17. GAMES (Enhanced)

### 17.1 Game Scanner (NAS Paths)
- **Backend (Otium):** `GameScannerPath` model, `GET/POST/DELETE /games/scanner/paths`, `POST /games/scanner/scan` (no auth — for desktop wrapper).
- **Frontend (Otium):** Scanner path management UI, manual scan trigger.

### 17.2 Game Installer Tracking
- **Backend (Otium):** `GameInstaller` model (installation_path, platform, install_status, play_time_total). `GET/POST/DELETE /games/installer`.
- **Frontend (Otium):** Installer library view, match editor (search Otium catalog to match/unmatch).

### 17.3 Steam CCU History
- **Backend (Otium):** `GET /provider/steam/ccu/history`.
- **Frontend (Otium):** `GameCCUChart` component.
- **Backend (Otix):** CCU snapshots are collected (`steam_ccu_batch` task) but no history API endpoint.

### 17.4 TCG Card Collection View
- **Frontend (Otium):** `GameTCGCard` component, card-based game library display.
- **Frontend (Otix):** Not present.

---

## 18. PERSON (Enhanced)

### 18.1 Person Statistics
- **Backend (Otium):** `GET /person/{id}/statistics` (film count, genres, years active).
- **Frontend:** `PersonStats` component.

### 18.2 Person Favorites
- **Backend (Otium):** `POST/DELETE /person/{id}/favorite`, `GET /person/{id}/favorite`.
- **Frontend:** Favorite person button.

### 18.3 Person Filmography Grouped by Department
- **Backend (Otium):** `GET /person/{id}/credits` grouped by department.
- **Frontend:** `PersonFilmography` with department grouping.
- **Note:** Otix has credits on PersonDetail but may not group by department.

### 18.4 Person Images
- **Backend (Otium):** `GET /person/{id}/images`, `PersonExternalID` model.
- **Frontend:** Person image gallery.

---

## 19. LIBRARY (Enhanced)

### 19.1 Plex Media Library
- **Backend (Otium):** `GET /provider/plex/library` with sections, pagination.
- **Frontend:** `MediaLibraryPage` with Plex source browsing.

### 19.2 Steam Game Library
- **Backend (Otium):** `GET /provider/steam/library` with owned games + playtime.
- **Frontend:** `GameLibraryPage` with Steam source display.

### 19.3 Library Source Hub
- **Frontend (Otium):** `LibraryHubPage` with `LibrarySourceGrid`/`LibrarySourceCard` for Plex and Steam sources.
- **Frontend (Otix):** Library page has 5 tabs (Watchlist, Liked, Watched, Played, Lists) — no provider-based library browsing.

### 19.4 Library View Modes
- **Frontend (Otium):** Grid and list views, `LibraryControls` (sort, filter).

---

## 20. DESKTOP / ELECTRON

### 20.1 Electron App
- **Frontend (Otium):** Full Electron app at `/play` route. Features: Setup wizard (5 steps), game installer library with sidebar, detail panel, match editor, scanner management, Electron IPC (`window.electronAPI`), zero-touch launch hub.
- **Otix:** No desktop/Electron app.

---

## 21. MEMORY FORGE

### 21.1 Idle/Incremental Game
- **Backend (Otium):** `UserMemoryForgeProgress` model with game_state JSON, level, score, badges, leaderboard.
- **Frontend (Otium):** `MemoryForgePage` — creative studio simulation with worlds, shards, ascensions, impact scores.
- **Otix:** Not present.

---

## 22. FRONTEND INFRASTRUCTURE

### 22.1 Local Database Layer
- **Frontend (Otium):** TanStack DB with collections (activity, listItems, lists, media, reviews, search, settings), Zod schemas, live hooks (`useLiveActivity`, `useLiveLists`, `useLiveSearch`, `useLiveSettings`), optimistic mutations, offline support.
- **Frontend (Otix):** Not present.

### 22.2 Offline / Connection Detection
- **Frontend (Otium):** `ConnectionProvider` with online/offline detection, `DisconnectedPage`.
- **Frontend (Otix):** Not present.

### 22.3 Mobile Navigation
- **Frontend (Otium):** `MobileBottomNav` component.
- **Frontend (Otix):** Floating glass pill nav only, no mobile-specific navigation.

### 22.4 i18n / Internationalization
- **Frontend (Otium):** Language selector in settings, locale-aware discover/content.
- **Frontend (Otix):** Not present.

### 22.5 PWA / Offline Support
- **Frontend (Otium):** Service worker for push notifications (could serve as PWA base).
- **Frontend (Otix):** Not present.

---

## 23. ADMIN / MODERATION

### 23.1 Admin Dashboard
- **Backend (Otium):** django-unfold admin with custom views: Task Runner (Quick/Targeted/Entity Sync/Search Hydration), Integration Budgets viewer.
- **Backend (Otix):** No admin interface.

### 23.2 Content Moderation
- **Backend (Otium):** Admin for reviews, lists, posts, comments.

---

## 24. METADATA / TAXONOMY (Backend)

### 24.1 Rich Taxonomy Models
- **Backend (Otium):** Country, Language, Company, ProductionCompany, Network, GameDeveloper, GamePublisher, Certification, ReleaseType, Job, WatchProvider, Timezone, Gender, Species, GameTheme, GamePlayerPerspective, GameEngine, GameFranchise, GameCollection.
- **Backend (Otix):** Has basic Company, Genre, Keyword, Platform, GameMode. Missing many taxonomy models.

### 24.2 Steam-Specific Ratings
- **Backend (Otium):** `SteamExternalRating` model (direct FK to Game, not GFK) with positive/negative reviews, playtime median/average.

### 24.3 MediaRelease by Country
- **Backend (Otix):** Has `MediaRelease` model but may not have full country-level release tracking that Otium has.

---

## SUMMARY: CRITICAL GAPS

### Tier 1 — Core User Experience
1. **Discover API endpoints** — data exists in DB but no dedicated API to serve it
2. **Smart search + autocomplete** — major UX regression
3. **Similar media / recommendations** — key discovery feature
4. **Notifications** — entire system (CRUD, push, real-time delivery)

### Tier 2 — Social & Engagement
5. **Social features** — posts, comments, activity feed
6. **Friends / followers** — social graph infrastructure
7. **Achievements** — gamification system
8. **User stats / XP / streaks** — engagement mechanics

### Tier 3 — Platform Integrations
9. **Plex integration** — user account linking, library, scrobbling
10. **Steam account linking** — user library sync
11. **Calendar** — unified content calendar

### Tier 4 — Enhanced Experiences
12. **Workout templates & advanced tracking** — sets, RPE, media
13. **Genre discovery page** — dedicated browsing
14. **Game scanner/installer** — desktop integration
15. **Where to watch** — streaming availability
16. **Settings completeness** — content, notifications, privacy, integrations
17. **Memory Forge** — gamified experience
18. **Desktop/Electron app** — full desktop experience
