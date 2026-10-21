import {
  Rocket,
  Layers,
  Gamepad2,
  Puzzle,
  Keyboard,
  HelpCircle,
} from 'lucide-react'
import type { DocCategory } from '../types'

export const DOCS_CATEGORIES: DocCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Rocket,
    description: 'Platform installation, prerequisites, and first-time configuration.',
    articles: [
      {
        id: 'overview',
        categoryId: 'getting-started',
        title: 'Overview & Ecosystem',
        shortTitle: 'Overview',
        tagline: 'An all-in-one multi-platform media, game, and entertainment suite.',
        keywords: ['overview', 'introduction', 'stack', 'architecture', 'ecosystem', 'about'],
        subheadings: [
          { id: 'welcome-to-otix', title: 'Welcome to Otix' },
          { id: 'ecosystem-components', title: 'Ecosystem Components' },
          { id: 'byos-philosophy', title: 'Bring-Your-Own-Server (BYOS)' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Otix is an all-in-one multi-platform entertainment tracking and launching client. It bridges your personal libraries, local game launchers, self-hosted media servers, and automation tools into a unified, responsive interface.',
          },
          {
            type: 'subheading',
            subheading: { id: 'welcome-to-otix', title: 'Welcome to Otix' },
          },
          {
            type: 'paragraph',
            text: 'Whether you have games across Steam and Epic, media files on a local NAS, or Plex/Jellyfin streaming servers, Otix organizes everything into a singular cohesive library with automatic metadata enrichment, play sessions, and XP progression.',
          },
          {
            type: 'callout',
            callout: {
              kind: 'tip',
              title: 'Cross-Platform Flexibility',
              text: 'Otix runs either as a full Desktop Client (Electron), a lightweight standalone Go background daemon (Otix Node) on headless servers, or a Web UI connecting directly to your machines.',
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'ecosystem-components', title: 'Ecosystem Components' },
          },
          {
            type: 'table',
            table: {
              headers: ['Component', 'Technology', 'Role', 'Default Port'],
              rows: [
                ['Otix Desktop', 'Electron, React, Better-SQLite3', 'Native launcher, local game scanner, and sandboxed plugin runtime', '—'],
                ['Otix Node', 'Go (zero external runtime deps)', 'Self-hosted daemon for file storage, range streaming, cloud saves, and Arr sync', '8090'],
                ['Otix Web UI', 'React 18, Vite, TanStack Query', 'Web dashboard with desktop IPC bridge and direct player', '5173'],
                ['API Backend', 'Python 3.12, Django REST, Celery', 'Catalog hydration, metadata search, authentication, and node registry', '8000'],
                ['JS Extensions', 'CommonJS / V8 isolates', 'Community plugins for game stores, downloaders, and Arr integrations', '—'],
              ],
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'byos-philosophy', title: 'Bring-Your-Own-Server (BYOS)' },
          },
          {
            type: 'paragraph',
            text: 'Otix strictly adheres to a zero-media-relay architecture. Otix servers never host, cache, proxy, or relay your private files or streams. Direct browser playback connects straight to your local or remote Plex, Jellyfin, or Otix Node instance.',
          },
        ],
      },
      {
        id: 'installation',
        categoryId: 'getting-started',
        title: 'Platform Installation',
        shortTitle: 'Installation',
        tagline: 'Installing Otix Desktop and Otix Node across macOS, Windows, Linux, and Docker.',
        keywords: ['install', 'download', 'windows', 'macos', 'linux', 'docker', 'unraid', 'binaries'],
        subheadings: [
          { id: 'macos-install', title: 'macOS (Apple Silicon & Intel)' },
          { id: 'windows-install', title: 'Windows (x64)' },
          { id: 'linux-install', title: 'Linux (AppImage & deb)' },
          { id: 'docker-unraid', title: 'Docker & Unraid (Otix Node)' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Prebuilt binaries are published with each release under GitHub Releases. Depending on your workflow, you can install the all-in-one Desktop app, run the standalone Otix Node daemon on your home server, or deploy both.',
          },
          {
            type: 'subheading',
            subheading: { id: 'macos-install', title: 'macOS (Apple Silicon & Intel)' },
          },
          {
            type: 'steps',
            steps: [
              {
                step: 1,
                title: 'Download Desktop DMG',
                description: 'Download Otix-<version>-arm64.dmg for Apple Silicon (M1/M2/M3) or Otix-<version>-x64.dmg for Intel Macs from GitHub Releases.',
              },
              {
                step: 2,
                title: 'Install to Applications',
                description: 'Open the downloaded disk image and drag Otix.app into your /Applications directory.',
              },
              {
                step: 3,
                title: 'Clear Gatekeeper Quarantine (if required)',
                description: 'If macOS blocks unsigned development builds, right click Otix.app and choose Open, or run the terminal command below:',
                code: {
                  language: 'bash',
                  label: 'Terminal',
                  code: 'xattr -cr /Applications/Otix.app',
                },
              },
            ],
          },
          {
            type: 'subheading',
            subheading: { id: 'windows-install', title: 'Windows (x64)' },
          },
          {
            type: 'paragraph',
            text: 'For Windows systems, download either Otix-Setup-<version>.exe (standard NSIS installer) or Otix-Setup-<version>-portable.exe. The installer automatically registers the otix:// custom URI protocol for web-to-desktop launcher callbacks.',
          },
          {
            type: 'callout',
            callout: {
              kind: 'note',
              title: 'Windows SmartScreen Notice',
              text: 'If Windows SmartScreen displays a protective dialog during initial launch of fresh builds, select "More info" and click "Run anyway".',
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'linux-install', title: 'Linux (AppImage & deb)' },
          },
          {
            type: 'paragraph',
            text: 'Choose between the portable AppImage package or Debian/Ubuntu package:',
          },
          {
            type: 'code',
            code: {
              language: 'bash',
              label: 'AppImage Execution',
              code: 'chmod +x Otix-*.AppImage\n./Otix-*.AppImage',
            },
          },
          {
            type: 'code',
            code: {
              language: 'bash',
              label: 'Debian / Ubuntu Package',
              code: 'sudo dpkg -i Otix-*.deb',
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'docker-unraid', title: 'Docker & Unraid (Otix Node)' },
          },
          {
            type: 'paragraph',
            text: 'The standalone Go daemon can be deployed anywhere as a zero-overhead Docker container:',
          },
          {
            type: 'code',
            code: {
              language: 'bash',
              label: 'Docker Run',
              code: 'docker run -d \\\n  --name otix-node \\\n  -p 8090:8090 \\\n  -v /mnt/user/appdata/otix-node/config.yaml:/app/config.yaml \\\n  -v /mnt/user/games:/storage/games \\\n  ghcr.io/dksilv4/otix-node:latest',
            },
          },
        ],
      },
      {
        id: 'setup-wizard',
        categoryId: 'getting-started',
        title: 'Setup Wizard & Quick Start',
        shortTitle: 'Setup Wizard',
        tagline: 'Step-by-step walkthrough of the interactive in-app onboarding wizard.',
        keywords: ['wizard', 'onboarding', 'claim', 'pin', 'first-run', 'quickstart'],
        subheadings: [
          { id: 'wizard-overview', title: 'Onboarding Flow' },
          { id: 'pairing-node', title: 'Pairing Otix Node with Claim PIN' },
          { id: 'configuring-libraries', title: 'Initial Library Configuration' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'When launching Otix for the first time, the guided Setup Wizard assists you through selecting your deployment mode, pairing storage nodes, and scanning your first games or media directories.',
          },
          {
            type: 'action-button',
            action: {
              label: 'Launch Setup Wizard',
              type: 'setup-wizard',
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'wizard-overview', title: 'Onboarding Flow' },
          },
          {
            type: 'steps',
            steps: [
              {
                step: 1,
                title: 'Choose Environment Mode',
                description: 'Select between Desktop All-in-One (local scanning & embedded node), Remote Node Companion (connect to NAS/Unraid), or Cloud-Only.',
              },
              {
                step: 2,
                title: 'Pair Companion Daemon',
                description: 'Enter your 6-digit Claim PIN generated by your local or remote Otix Node at http://127.0.0.1:8090.',
              },
              {
                step: 3,
                title: 'Scan Media & Game Folders',
                description: 'Select default library paths. Otix automatically detects installed Steam games and local directory structures.',
              },
              {
                step: 4,
                title: 'Enable Features & Sync',
                description: 'Toggle cloud saves, Arr integration synchronization, and Decide-For-Me recommendations.',
              },
            ],
          },
          {
            type: 'subheading',
            subheading: { id: 'pairing-node', title: 'Pairing Otix Node with Claim PIN' },
          },
          {
            type: 'paragraph',
            text: 'When Otix Node starts in an unclaimed state, it binds on port 8090 and renders a pairing screen displaying an ephemeral 6-digit alphanumeric PIN. Entering this PIN into the wizard or Settings > Nodes securely generates an authorization token that binds the daemon to your account.',
          },
          {
            type: 'callout',
            callout: {
              kind: 'important',
              title: 'Claim PIN Expiry',
              text: 'Claim PINs expire after 15 minutes of inactivity for security. If your PIN expires, restart the node daemon or refresh its web UI to generate a new PIN.',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'architecture',
    title: 'Architecture & Concepts',
    icon: Layers,
    description: 'System design, Bring-Your-Own-Server model, and self-hosting.',
    articles: [
      {
        id: 'architecture',
        categoryId: 'architecture',
        title: 'System Architecture',
        shortTitle: 'System Design',
        tagline: 'Multi-tiered architecture across Desktop, Go daemon, and Django API.',
        keywords: ['architecture', 'system', 'django', 'electron', 'go', 'redis', 'pgvector'],
        subheadings: [
          { id: 'tier-breakdown', title: 'Architecture Tiers' },
          { id: 'ipc-bridge', title: 'IPC & Context Isolation' },
          { id: 'data-synchronization', title: 'Data Flow & Synchronization' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Otix combines the speed of native desktop and daemon runtimes with the responsiveness of modern web single-page applications. The system is split across distinct operational tiers to maintain high security and performance.',
          },
          {
            type: 'subheading',
            subheading: { id: 'tier-breakdown', title: 'Architecture Tiers' },
          },
          {
            type: 'bullet-list',
            items: [
              'Web UI (React 18, Vite): Renders the glassmorphic interface, handles client routing, state caching with TanStack Query, and audio streaming.',
              'Desktop Host (Electron): Provides native OS windows, system tray, titlebar controls, protocol handlers (otix://), and SQLite cache.',
              'Otix Node (Go Daemon): Lightweight user-hosted server running HTTP range streaming, local folder watchers, cloud save archives, and downloader bridges.',
              'Cloud API (Django REST + Celery + PostgreSQL): Handles global metadata catalogs, semantic vector search (pgvector), social features, and remote node discovery.',
            ],
          },
          {
            type: 'subheading',
            subheading: { id: 'ipc-bridge', title: 'IPC & Context Isolation' },
          },
          {
            type: 'paragraph',
            text: 'All native desktop capabilities (file pickers, child processes, updater triggers) are exposed through strict Electron preload scripts using contextBridge. No renderer code ever gains direct Node.js or OS privileges.',
          },
        ],
      },
      {
        id: 'byos-streaming',
        categoryId: 'architecture',
        title: 'Bring Your Own Server (BYOS)',
        shortTitle: 'BYOS Streaming',
        tagline: 'Direct peer-to-peer playback with zero central media relays.',
        keywords: ['byos', 'streaming', 'plex', 'jellyfin', 'privacy', 'direct play'],
        subheadings: [
          { id: 'zero-relay', title: 'Zero Media Relay Guarantee' },
          { id: 'direct-playback', title: 'Direct Playback Mechanism' },
          { id: 'playback-requirements', title: 'Browser Codec Capabilities' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Otix is strictly a media indexer and player frontend. It never proxies or stores your video and music files on central servers. All playback streams connect directly between your browser and your private servers.',
          },
          {
            type: 'subheading',
            subheading: { id: 'zero-relay', title: 'Zero Media Relay Guarantee' },
          },
          {
            type: 'callout',
            callout: {
              kind: 'note',
              title: 'Privacy by Design',
              text: 'Otix servers never receive playback stream URLs, streaming tokens, or file binary bytes. Your home server IP address and streaming tokens remain encrypted in your local browser and desktop storage.',
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'direct-playback', title: 'Direct Playback Mechanism' },
          },
          {
            type: 'paragraph',
            text: 'When playing an episode or movie, Otix queries your connected Plex or Jellyfin instance directly via its authenticated REST APIs. If the media format is supported natively by Chromium or your browser, it streams directly using HTTP Range requests without transcoding overhead.',
          },
        ],
      },
      {
        id: 'node-daemon',
        categoryId: 'architecture',
        title: 'Otix Node Daemon',
        shortTitle: 'Otix Node',
        tagline: 'Headless Go daemon for self-hosted storage, game syncing, and download management.',
        keywords: ['node', 'daemon', 'go', 'nas', 'unraid', 'synology', 'headless', 'saves'],
        subheadings: [
          { id: 'what-is-node', title: 'What is Otix Node?' },
          { id: 'daemon-capabilities', title: 'Key Capabilities' },
          { id: 'configuration-file', title: 'Configuration File' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Otix Node is a compiled Go binary designed to run continuously on home servers, NAS devices, or user desktop workstations with negligible CPU and RAM footprint (<30MB).',
          },
          {
            type: 'subheading',
            subheading: { id: 'daemon-capabilities', title: 'Key Capabilities' },
          },
          {
            type: 'bullet-list',
            items: [
              'High-Performance HTTP Range Streaming: Serves video, music, and disk ISOs with instant seek times.',
              'Cloud Save Synchronizer: Watches game save directories, creates compressed versioned snapshots, and syncs across devices.',
              'Download Orchestration: Bridges Usenet (SABnzbd) and BitTorrent clients directly to Otix download queues.',
              'Arr Tools Integration: Manages Radarr, Sonarr, and Prowlarr instances with unified status reports.',
            ],
          },
          {
            type: 'subheading',
            subheading: { id: 'configuration-file', title: 'Configuration File' },
          },
          {
            type: 'code',
            code: {
              language: 'yaml',
              label: 'config.yaml',
              code: 'server:\n  port: 8090\n  bind: "0.0.0.0"\n\nstorage:\n  paths:\n    - "/mnt/user/games"\n    - "/mnt/user/media"\n\nnetwork:\n  max_upload_kbps: 0 # Unlimited\n  allow_remote_access: true',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'guides',
    title: 'Features & User Guides',
    icon: Gamepad2,
    description: 'Managing libraries, launching games, media streaming, and progression.',
    articles: [
      {
        id: 'library-management',
        categoryId: 'guides',
        title: 'Unified Library Management',
        shortTitle: 'Library',
        tagline: 'Consolidate games, movies, series, and local files into a single catalog.',
        keywords: ['library', 'games', 'movies', 'shows', 'scanners', 'metadata', 'matching'],
        subheadings: [
          { id: 'library-scan', title: 'Adding & Scanning Folders' },
          { id: 'matching-proposals', title: 'Handling Matching Proposals' },
          { id: 'filters-sorting', title: 'Filtering & Views' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'The Unified Library allows you to aggregate titles from multiple platforms, external drives, and remote servers into one clean, searchable collection with posters, trailers, descriptions, and release dates.',
          },
          {
            type: 'subheading',
            subheading: { id: 'library-scan', title: 'Adding & Scanning Folders' },
          },
          {
            type: 'paragraph',
            text: 'Navigate to Settings > Library to add local or network directories. The Otix background scanner will crawl your folders, parse title names and years, and query the catalog for high-resolution posters and game assets.',
          },
          {
            type: 'subheading',
            subheading: { id: 'matching-proposals', title: 'Handling Matching Proposals' },
          },
          {
            type: 'paragraph',
            text: 'If a game title or video filename has multiple potential matches or ambiguous naming, Otix files a Matching Proposal. You can review and resolve proposals with a single click under Settings > Library > Proposals.',
          },
        ],
      },
      {
        id: 'game-launcher',
        categoryId: 'guides',
        title: 'Game Detection & Launcher',
        shortTitle: 'Game Launcher',
        tagline: 'Automatic game scanning, process monitoring, playtime tracking, and privacy.',
        keywords: ['launcher', 'games', 'steam', 'epic', 'detection', 'sessions', 'playtime'],
        subheadings: [
          { id: 'automatic-detection', title: 'Automatic Game Detection' },
          { id: 'session-monitoring', title: 'Process & Session Monitoring' },
          { id: 'custom-launch-options', title: 'Custom Executables & Arguments' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'The Launcher tab (/launcher) is a console-inspired hub for your games. Otix automatically detects installed titles from Steam libraries, Epic Games Store manifests, and local standalone executables.',
          },
          {
            type: 'subheading',
            subheading: { id: 'session-monitoring', title: 'Process & Session Monitoring' },
          },
          {
            type: 'paragraph',
            text: 'When a game is launched through Otix or started externally via Steam, the desktop process monitor detects the running binary. It tracks playtime, awards XP upon session completion, and displays current game presence on your profile.',
          },
        ],
      },
      {
        id: 'media-streaming',
        categoryId: 'guides',
        title: 'Media Streaming & Playback',
        shortTitle: 'Media Streaming',
        tagline: 'Direct streaming for Plex, Jellyfin, and personal audio collections.',
        keywords: ['streaming', 'plex', 'jellyfin', 'audio', 'video', 'player', 'subtitles'],
        subheadings: [
          { id: 'connecting-servers', title: 'Connecting Plex and Jellyfin' },
          { id: 'integrated-player', title: 'The Integrated Player' },
          { id: 'audio-background-playback', title: 'Global Audio Player' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Connect your personal media servers under Settings > Connections. Once linked, you can browse movies and series directly inside Otix and play them in our hardware-accelerated video player with subtitle and audio track switching.',
          },
          {
            type: 'subheading',
            subheading: { id: 'audio-background-playback', title: 'Global Audio Player' },
          },
          {
            type: 'paragraph',
            text: 'Music tracks and game soundtracks continue playing in the background as you navigate throughout the application, complete with a persistent mini-player, queue controls, and keyboard shortcuts.',
          },
        ],
      },
      {
        id: 'arr-suite',
        categoryId: 'guides',
        title: 'Arr Suite & Downloader Orchestration',
        shortTitle: 'Arr Integrations',
        tagline: 'Manage Radarr, Sonarr, Prowlarr, and SABnzbd downloads from a unified interface.',
        keywords: ['radarr', 'sonarr', 'prowlarr', 'sabnzbd', 'arr', 'downloads', 'usenet'],
        subheadings: [
          { id: 'arr-overview', title: 'Supported Downloader Integrations' },
          { id: 'connecting-arr', title: 'Configuring Instances' },
          { id: 'downloads-queue', title: 'Unified Download Queue' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Otix consolidates your downloading pipeline into the Downloads tab (/downloads). Monitor progress, speeds, queue priorities, and ETA across multiple SABnzbd, Radarr, and Sonarr instances simultaneously.',
          },
          {
            type: 'subheading',
            subheading: { id: 'connecting-arr', title: 'Configuring Instances' },
          },
          {
            type: 'paragraph',
            text: 'Add your instance URLs and API keys under Settings > Connections > Arr Suite. Otix securely verifies connections and synchronizes queue state automatically.',
          },
        ],
      },
      {
        id: 'progression-xp',
        categoryId: 'guides',
        title: 'XP Progression & Gamer Stats',
        shortTitle: 'Progression & XP',
        tagline: 'Level up your Otix profile through play sessions, media tracking, and achievements.',
        keywords: ['xp', 'levels', 'progression', 'achievements', 'gamification', 'stats'],
        subheadings: [
          { id: 'earning-xp', title: 'How XP is Awarded' },
          { id: 'level-up-animations', title: 'Profile Levels & Ranks' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Otix features an integrated progression engine that rewards you for gaming sessions, completing media titles, and building your collection.',
          },
          {
            type: 'subheading',
            subheading: { id: 'earning-xp', title: 'How XP is Awarded' },
          },
          {
            type: 'bullet-list',
            items: [
              'Gaming Sessions: Earn XP based on active playtime in detected games.',
              'Completing Watchlists: Mark movies, seasons, or anime as watched to claim completion XP.',
              'Library Milestones: Bonus badges for cataloging 50, 100, and 500 titles.',
              'Level Ups: Celebrate rank promotions with toast notifications and custom badges.',
            ],
          },
        ],
      },
      {
        id: 'session-privacy',
        categoryId: 'guides',
        title: 'Game Session Privacy Controls',
        shortTitle: 'Session Privacy',
        tagline: 'Fine-grained privacy controls for your gaming activity and status.',
        keywords: ['privacy', 'sessions', 'incognito', 'visibility', 'game history'],
        subheadings: [
          { id: 'privacy-toggle', title: 'Toggling Session Privacy' },
          { id: 'profile-visibility', title: 'Public vs Private Profiles' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'You have complete control over whether friends and social feeds see your active game session or historical playtime. You can toggle game activity tracking directly in Settings > Profile.',
          },
        ],
      },
    ],
  },
  {
    id: 'plugins',
    title: 'Plugin Development',
    icon: Puzzle,
    description: 'Building custom extensions, manifest format, and sandboxed runtimes.',
    articles: [
      {
        id: 'plugin-architecture',
        categoryId: 'plugins',
        title: 'Plugin Architecture & Manifest',
        shortTitle: 'Plugin Architecture',
        tagline: 'Specification for Otix extensions, plugin.json manifests, and sandbox runtimes.',
        keywords: ['plugin', 'extensions', 'manifest', 'plugin.json', 'sandbox', 'sdk', 'developer'],
        subheadings: [
          { id: 'manifest-schema', title: 'Manifest Schema (plugin.json)' },
          { id: 'runtime-isolation', title: 'Isolated Worker Runtime' },
          { id: 'plugin-capabilities', title: 'Declared Capabilities' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Otix plugins are modular JavaScript extensions executing in isolated V8 worker threads. Plugins can declare capabilities to provide custom metadata providers, downloader clients, or launcher platforms.',
          },
          {
            type: 'subheading',
            subheading: { id: 'manifest-schema', title: 'Manifest Schema (plugin.json)' },
          },
          {
            type: 'code',
            code: {
              language: 'json',
              label: 'plugin.json',
              code: '{\n  "id": "com.example.custom-arr",\n  "name": "Custom Arr Integration",\n  "version": "1.0.0",\n  "author": "Community Developer",\n  "description": "Connects custom media scrapers to Otix",\n  "main": "index.js",\n  "capabilities": [\n    "library.import",\n    "downloader"\n  ],\n  "settings": [\n    {\n      "key": "apiKey",\n      "label": "API Key",\n      "type": "password",\n      "required": true\n    }\n  ]\n}',
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'runtime-isolation', title: 'Isolated Worker Runtime' },
          },
          {
            type: 'paragraph',
            text: 'Plugins run in sandboxed Node.js worker pools with restricted globals. All interactions with the host system, network, and disk pass through structured IPC message contracts.',
          },
        ],
      },
      {
        id: 'plugin-development',
        categoryId: 'plugins',
        title: 'Developing an Extension',
        shortTitle: 'Building Plugins',
        tagline: 'Practical guide to writing, packaging, and testing a community extension.',
        keywords: ['plugin', 'extension', 'development', 'guide', 'tutorial', 'sample', 'testing'],
        subheadings: [
          { id: 'entry-point', title: 'Plugin Entry Point (index.js)' },
          { id: 'lifecycle-hooks', title: 'Lifecycle Hooks' },
          { id: 'testing-locally', title: 'Testing Locally in Otix' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Every plugin exports a standard JavaScript class or object that implements lifecycle hooks defined by the Otix Plugin SDK.',
          },
          {
            type: 'subheading',
            subheading: { id: 'entry-point', title: 'Plugin Entry Point (index.js)' },
          },
          {
            type: 'code',
            code: {
              language: 'javascript',
              label: 'index.js',
              code: 'module.exports = class CustomProviderPlugin {\n  async onInitialize(context) {\n    this.context = context;\n    this.logger = context.logger;\n    this.logger.info("Custom plugin initialized");\n  }\n\n  async onScanLibrary(options) {\n    // Return catalog items matching the search query\n    return [\n      {\n        id: "game-101",\n        title: "Sample Game",\n        platform: "pc",\n        executable: "C:\\\\Games\\\\Sample\\\\game.exe"\n      }\n    ];\n  }\n\n  async onDestroy() {\n    this.logger.info("Plugin unloaded");\n  }\n};',
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'testing-locally', title: 'Testing Locally in Otix' },
          },
          {
            type: 'paragraph',
            text: 'During development, symlink or copy your plugin directory to the extensions/plugins/ folder in the Otix repository root, or install it via Settings > Plugins > Load Unpacked.',
          },
        ],
      },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Shortcuts & Hub',
    icon: Keyboard,
    description: 'Command Palette, hotkeys, and rapid navigation tips.',
    articles: [
      {
        id: 'command-palette',
        categoryId: 'shortcuts',
        title: 'Command Palette & Fast Actions',
        shortTitle: 'Command Palette',
        tagline: 'Instantly jump anywhere and trigger actions with Cmd+K / Ctrl+K.',
        keywords: ['command', 'palette', 'search', 'hotkeys', 'shortcuts', 'navigation', 'hub'],
        subheadings: [
          { id: 'opening-palette', title: 'Opening the Command Palette' },
          { id: 'palette-features', title: 'Special Actions' },
          { id: 'palette-navigation', title: 'Quick Navigation' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'The Command Palette provides unified global search and rapid action triggers across the entire application without needing to click through menus.',
          },
          {
            type: 'subheading',
            subheading: { id: 'opening-palette', title: 'Opening the Command Palette' },
          },
          {
            type: 'table',
            table: {
              headers: ['Platform', 'Keyboard Shortcut', 'Alternative Action'],
              rows: [
                ['macOS', 'Cmd + K', 'Click Search Icon in Titlebar'],
                ['Windows / Linux', 'Ctrl + K', 'Click Search Icon in Titlebar'],
                ['Global In-App', 'Press / on any non-input field', 'Opens quick search'],
              ],
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'palette-features', title: 'Special Actions' },
          },
          {
            type: 'bullet-list',
            items: [
              '"Decide for me": Launches the intelligent recommendation picker to choose a movie or game based on your taste and available time.',
              '"Documentation": Navigates directly to this documentation center.',
              '"Settings": Quick access to appearance, integrations, node management, and account security.',
            ],
          },
        ],
      },
      {
        id: 'hotkeys',
        categoryId: 'shortcuts',
        title: 'Global Keyboard Shortcuts',
        shortTitle: 'Global Hotkeys',
        tagline: 'Standard keybindings for navigation, media playback, and modal controls.',
        keywords: ['hotkeys', 'keyboard', 'shortcuts', 'controls', 'space', 'escape'],
        subheadings: [
          { id: 'navigation-hotkeys', title: 'Navigation Shortcuts' },
          { id: 'media-hotkeys', title: 'Media Playback Shortcuts' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Control playback and navigation efficiently using our keyboard shortcuts table:',
          },
          {
            type: 'subheading',
            subheading: { id: 'navigation-hotkeys', title: 'Navigation Shortcuts' },
          },
          {
            type: 'table',
            table: {
              headers: ['Action', 'Shortcut', 'Description'],
              rows: [
                ['Command Palette', 'Cmd+K / Ctrl+K', 'Open global search and command palette'],
                ['Close Active Modal / Dropdown', 'Escape', 'Dismiss open dialogs and return focus'],
                ['Navigate Items', 'Arrow Up / Arrow Down', 'Traverse search results and command rows'],
                ['Execute Selection', 'Enter', 'Confirm or navigate to the selected result'],
              ],
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'media-hotkeys', title: 'Media Playback Shortcuts' },
          },
          {
            type: 'table',
            table: {
              headers: ['Action', 'Shortcut', 'Description'],
              rows: [
                ['Play / Pause', 'Space', 'Toggle audio or video stream playback'],
                ['Seek Backward', 'Arrow Left', 'Jump back 10 seconds in video or track'],
                ['Seek Forward', 'Arrow Right', 'Jump forward 10 seconds in video or track'],
                ['Toggle Fullscreen', 'F', 'Enter or exit fullscreen video mode'],
                ['Mute Audio', 'M', 'Toggle stream volume mute'],
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting & FAQ',
    icon: HelpCircle,
    description: 'Diagnosing connection issues, logs, codec compatibility, and FAQs.',
    articles: [
      {
        id: 'troubleshooting-node',
        categoryId: 'troubleshooting',
        title: 'Node Connection & Pairing',
        shortTitle: 'Node Connection',
        tagline: 'Resolving issues with Otix Node pairing, claim PINs, and firewall ports.',
        keywords: ['troubleshoot', 'node', 'firewall', 'pin', 'connection', 'port', '8090'],
        subheadings: [
          { id: 'cannot-reach-node', title: 'Cannot Connect to Otix Node' },
          { id: 'pin-expired', title: 'Claim PIN Expired or Invalid' },
          { id: 'firewall-ports', title: 'Port & Network Requirements' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'If your desktop app or web browser cannot communicate with your Otix Node companion, follow these diagnostic steps.',
          },
          {
            type: 'subheading',
            subheading: { id: 'cannot-reach-node', title: 'Cannot Connect to Otix Node' },
          },
          {
            type: 'steps',
            steps: [
              {
                step: 1,
                title: 'Verify Process is Running',
                description: 'On Windows, check Task Manager for otix-node-windows-amd64.exe. On macOS/Linux, verify with ps aux | grep otix-node.',
              },
              {
                step: 2,
                title: 'Check Browser Access',
                description: 'Open http://127.0.0.1:8090/api/v1/status in your web browser. If the page returns JSON status, the daemon is active.',
              },
              {
                step: 3,
                title: 'Ensure Correct IP for Docker/NAS',
                description: 'When running on Docker or Unraid, make sure port 8090 is mapped and your host IP (e.g. 192.168.1.50) is accessible from your client machine.',
              },
            ],
          },
          {
            type: 'subheading',
            subheading: { id: 'firewall-ports', title: 'Port & Network Requirements' },
          },
          {
            type: 'table',
            table: {
              headers: ['Port', 'Protocol', 'Service', 'Usage'],
              rows: [
                ['8090', 'TCP', 'Otix Node Daemon', 'HTTP range streaming, cloud save uploads, and Arr proxy'],
                ['8000', 'TCP', 'Otix API Backend', 'Metadata catalog search and authentication in self-hosted dev stacks'],
                ['5173', 'TCP', 'Vite Dev Server', 'Local development web server (production uses static web build)'],
              ],
            },
          },
        ],
      },
      {
        id: 'troubleshooting-codecs',
        categoryId: 'troubleshooting',
        title: 'Codec & Media Compatibility',
        shortTitle: 'Codec Support',
        tagline: 'Browser playback limitations, container formats, and direct play advice.',
        keywords: ['codecs', 'h264', 'h265', 'hevc', 'av1', 'subtitles', 'transcode'],
        subheadings: [
          { id: 'supported-containers', title: 'Supported Formats & Containers' },
          { id: 'hevc-av1-notes', title: 'HEVC (H.265) & AV1 Playback' },
          { id: 'subtitles-compatibility', title: 'Subtitles & ASS/SSA Styling' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'Because Otix connects directly to your Plex, Jellyfin, or Node instances without server-side transcoding relays, playback compatibility is determined by your client browser and hardware video decoders.',
          },
          {
            type: 'subheading',
            subheading: { id: 'supported-containers', title: 'Supported Formats & Containers' },
          },
          {
            type: 'bullet-list',
            items: [
              'Containers: MP4, WebM, and MKV (via Matroska demuxing).',
              'Video Codecs: H.264 (AVC) plays natively everywhere. HEVC (H.265) requires hardware decoding support in your GPU and Chromium/Electron flags.',
              'Audio Codecs: AAC, MP3, Opus, FLAC. Multi-channel AC-3 or DTS may be converted to stereo by Plex/Jellyfin direct stream profiles if unsupported by browser audio outputs.',
            ],
          },
        ],
      },
      {
        id: 'diagnostics-logs',
        categoryId: 'troubleshooting',
        title: 'Diagnostics & Log File Locations',
        shortTitle: 'Logs & Diagnostics',
        tagline: 'Where to find logs for Otix Desktop, Otix Node, and background workers.',
        keywords: ['logs', 'diagnostics', 'errors', 'debug', 'paths', 'appdata'],
        subheadings: [
          { id: 'desktop-logs', title: 'Otix Desktop Logs' },
          { id: 'node-logs', title: 'Otix Node Daemon Logs' },
        ],
        blocks: [
          {
            type: 'paragraph',
            text: 'When filing bug reports or debugging connectivity, diagnostic logs provide crucial trace information.',
          },
          {
            type: 'subheading',
            subheading: { id: 'desktop-logs', title: 'Otix Desktop Logs' },
          },
          {
            type: 'table',
            table: {
              headers: ['Operating System', 'Log Directory Path'],
              rows: [
                ['Windows', '%APPDATA%\\Otix\\logs\\main.log'],
                ['macOS', '~/Library/Logs/Otix/main.log'],
                ['Linux', '~/.config/Otix/logs/main.log'],
              ],
            },
          },
          {
            type: 'subheading',
            subheading: { id: 'node-logs', title: 'Otix Node Daemon Logs' },
          },
          {
            type: 'paragraph',
            text: 'Otix Node outputs human-readable structured logs directly to stdout and writes rolling log files in its working directory under ./logs/node.log or via docker logs otix-node.',
          },
        ],
      },
    ],
  },
]
