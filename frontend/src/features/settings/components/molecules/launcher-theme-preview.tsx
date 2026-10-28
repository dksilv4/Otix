import React from 'react'
import type { LauncherThemeId } from '@/features/launcher/themes/theme-context'
import {
  Play,
  Flame,
  Search,
  Terminal,
  Gamepad2,
  Tv,
  Settings,
} from 'lucide-react'

interface LauncherThemePreviewProps {
  themeId: LauncherThemeId
  isSelected?: boolean
}

export const LauncherThemePreview = ({ themeId, isSelected }: LauncherThemePreviewProps) => {
  return (
    <div
      className={`w-full aspect-[16/10] rounded-lg overflow-hidden relative border transition-all duration-300 select-none pointer-events-none shadow-md ${
        isSelected
          ? 'border-white/30 shadow-[0_0_16px_rgba(255,255,255,0.15)]'
          : 'border-white/10 group-hover:border-white/20'
      }`}
    >
      <MiniTheme themeId={themeId} />
    </div>
  )
};

const MiniTheme = ({ themeId }: { themeId: LauncherThemeId }) => {
  switch (themeId) {
    case 'classic':
      return <ClassicMiniPreview />
    case 'modern':
      return <ModernMiniPreview />
    case 'steam':
      return <SteamMiniPreview />
    case 'playstation':
      return <PlayStationMiniPreview />
    case 'xbox':
      return <XboxMiniPreview />
    case 'switch':
      return <SwitchMiniPreview />
    case 'retro':
      return <RetroMiniPreview />
    case 'minimal':
      return <MinimalMiniPreview />
    case 'forge':
      return <ForgeMiniPreview />
    case 'glass':
      return <GlassMiniPreview />
    default:
      return null
  }
};

// ── V1: Classic (Original Otix Rail) ───────────────────────────
const ClassicMiniPreview = () => {
  return (
    <div className="w-full h-full bg-[#0a0c14] relative overflow-hidden flex">
      {/* Subtle blue backdrop glow */}
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-600/20 rounded-full blur-xl pointer-events-none" />
      <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-indigo-600/15 rounded-full blur-lg pointer-events-none" />

      {/* Floating Left Pill Rail */}
      <div className="w-3.5 my-1.5 ml-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 flex flex-col items-center py-1 gap-1 shrink-0 z-10 shadow-sm">
        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6]" />
        <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
        <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
        <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-between p-1.5 relative z-10">
        <div className="w-full flex items-center justify-between px-1">
          <span className="text-[6px] font-black tracking-widest text-white/50 uppercase">OTIX</span>
          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* 3D Tilted Game Cover Hero */}
        <div className="flex flex-col items-center">
          <div className="w-12 h-14 rounded bg-gradient-to-tr from-blue-700 via-indigo-600 to-sky-500 border border-blue-400/40 shadow-[0_6px_14px_rgba(0,0,0,0.6)] transform -rotate-6 skew-y-1 overflow-hidden p-1 flex flex-col justify-between">
            <span className="text-[5px] font-black text-white/90 tracking-tight leading-none">CYBER</span>
            <div className="w-3 h-3 rounded-full bg-white/20 flex items-center justify-center self-end">
              <Play size={6} className="text-white fill-white ml-0.5" />
            </div>
          </div>
          {/* Cover floor reflection shadow */}
          <div className="w-10 h-1 bg-blue-500/25 rounded-full blur-[1px] mt-0.5" />
        </div>

        {/* Bottom Shelf Tabs */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
          <div className="w-3 h-0.5 rounded-full bg-blue-400" />
          <div className="w-2 h-0.5 rounded-full bg-white/20" />
          <div className="w-2 h-0.5 rounded-full bg-white/20" />
        </div>
      </div>
    </div>
  )
};

// ── V2: Modern (Cinematic Deck) ────────────────────────────────
const ModernMiniPreview = () => {
  return (
    <div className="w-full h-full bg-neutral-950 text-white relative overflow-hidden flex flex-col p-1.5 justify-between">
      {/* Top Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[6px] font-black text-white tracking-wider">OTIX</span>
          <div className="flex items-center gap-1">
            <span className="text-[5px] font-bold text-[oklch(0.705_0.213_47.604)]">Deck</span>
            <span className="text-[5px] text-white/30">Library</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-8 h-1.5 rounded-full bg-white/10" />
          <div className="w-2 h-2 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Cinematic Hero Spotlight Banner */}
      <div className="w-full h-11 rounded-md bg-gradient-to-r from-orange-600/70 via-amber-700/50 to-neutral-900 border border-orange-500/40 relative p-1.5 flex flex-col justify-between overflow-hidden shadow-inner">
        <div className="flex items-center justify-between">
          <span className="text-[4.5px] font-black uppercase tracking-wider px-1 py-0.2 rounded bg-orange-500/30 text-amber-300 border border-orange-400/30">
            Resume
          </span>
          <span className="text-[5px] text-white/60">★ 9.4</span>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <div className="text-[6.5px] font-black leading-tight text-white drop-shadow">Elden Ring</div>
            <div className="text-[4.5px] text-white/60">Ready to play · 142 hrs</div>
          </div>
          <div className="px-1.5 py-0.5 rounded bg-[oklch(0.705_0.213_47.604)] text-black text-[5px] font-black flex items-center gap-0.5 shadow">
            <Play size={5} fill="black" />
            <span>PLAY</span>
          </div>
        </div>
      </div>

      {/* Bottom Jump Back In Reel */}
      <div className="flex items-center gap-1">
        <div className="w-1/3 h-5 rounded bg-white/[0.07] border border-white/10 p-0.5 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent">
          <span className="text-[4.5px] font-bold text-white/80 truncate">Cyberpunk</span>
        </div>
        <div className="w-1/3 h-5 rounded bg-white/[0.07] border border-white/10 p-0.5 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent">
          <span className="text-[4.5px] font-bold text-white/80 truncate">Starfield</span>
        </div>
        <div className="w-1/3 h-5 rounded bg-white/[0.07] border border-white/10 p-0.5 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent">
          <span className="text-[4.5px] font-bold text-white/80 truncate">Hades II</span>
        </div>
      </div>
    </div>
  )
};

// ── V3: Steam (Console Layout / Steam Deck) ───────────────────
const SteamMiniPreview = () => {
  return (
    <div className="w-full h-full bg-[#171a21] text-white relative overflow-hidden flex flex-col">
      {/* Top Steam Header */}
      <div className="h-3 bg-[#171a21] border-b border-[#0e141b] px-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[5px] font-bold uppercase tracking-wider">
          <span className="text-[#8f98a0]">Store</span>
          <span className="text-[#66c0f4] border-b border-[#66c0f4]">Library</span>
          <span className="text-[#8f98a0]">Community</span>
        </div>
        <div className="flex items-center gap-0.5">
          <div className="w-1 h-1 rounded-sm bg-white/20" />
          <div className="w-1 h-1 rounded-sm bg-white/20" />
        </div>
      </div>

      {/* Main 2-Pane Steam Client */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-2/5 bg-[#121a24] border-r border-[#0e141b] p-1 flex flex-col gap-0.5">
          <div className="h-2 bg-[#1b2838] rounded px-1 flex items-center justify-between text-[4.5px] text-[#536577]">
            <span>Filter...</span>
            <Search size={4} className="text-[#66c0f4]" />
          </div>
          <span className="text-[4px] font-black uppercase text-[#8f98a0] tracking-wider mt-0.5">
            READY TO PLAY (8)
          </span>
          <div className="space-y-0.5">
            <div className="bg-[#212f42] text-[#66c0f4] font-bold rounded px-1 py-0.5 flex items-center gap-1 text-[5px] border-l-2 border-[#66c0f4]">
              <span className="truncate">Half-Life: Alyx</span>
            </div>
            <div className="text-[#8f98a0] px-1 py-0.2 flex items-center gap-1 text-[4.5px] truncate">
              Portal 2
            </div>
            <div className="text-[#8f98a0] px-1 py-0.2 flex items-center gap-1 text-[4.5px] truncate">
              Left 4 Dead 2
            </div>
          </div>
        </div>

        {/* Right Stage */}
        <div className="flex-1 bg-gradient-to-b from-[#1e2e42] via-[#1b2838] to-[#121a24] p-1.5 flex flex-col justify-between">
          <div>
            <div className="text-[7px] font-black text-white leading-tight">Half-Life: Alyx</div>
            <div className="text-[4px] text-[#8f98a0] mt-0.5">Cloud in sync · 45 hrs</div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="px-2 py-0.5 rounded bg-[#5c7e10] hover:bg-[#6c9413] text-white text-[5.5px] font-black tracking-wider uppercase flex items-center gap-0.5 shadow">
              <Play size={5} fill="white" />
              <span>PLAY</span>
            </div>
            <div className="w-3 h-1 rounded bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  )
};

// ── V4: PlayStation (CrossBar / Console Ribbon) ────────────────
const PlayStationMiniPreview = () => {
  return (
    <div className="w-full h-full bg-[#05070e] text-white relative overflow-hidden flex flex-col justify-between p-1.5">
      {/* Ambient Blue Backlight */}
      <div className="absolute top-0 right-1/4 w-28 h-28 bg-blue-600/25 rounded-full blur-2xl pointer-events-none" />

      {/* Top PlayStation Status */}
      <div className="flex items-center justify-between px-0.5 relative z-10">
        <span className="text-[5px] font-black uppercase tracking-widest text-white/50">OTIX HOME</span>
        <div className="flex items-center gap-1">
          <span className="text-[5px] font-bold text-white/70">12:30</span>
        </div>
      </div>

      {/* Hero Game Meta */}
      <div className="relative z-10 px-0.5">
        <span className="text-[4.5px] px-1 py-0.2 rounded bg-white/10 font-bold text-white">PS5</span>
        <div className="text-[7.5px] font-black tracking-tight text-white leading-tight mt-0.5">
          Horizon Forbidden West
        </div>
        <div className="mt-1 px-2 py-0.5 rounded-full bg-white text-black text-[5px] font-black uppercase flex items-center gap-0.5 w-fit shadow-[0_0_8px_rgba(255,255,255,0.4)]">
          <Play size={5} fill="black" />
          <span>Play</span>
        </div>
      </div>

      {/* Bottom CrossBar Horizontal Ribbon */}
      <div className="flex items-end gap-1 px-0.5 relative z-10">
        {/* Enlarged active card */}
        <div className="w-7 h-10 rounded bg-gradient-to-t from-blue-900 to-indigo-700 ring-2 ring-white shadow-[0_0_10px_rgba(37,99,235,0.8)] -translate-y-1 relative overflow-hidden p-0.5 flex flex-col justify-end">
          <span className="text-[4px] font-black text-white">ACTIVE</span>
        </div>
        <div className="w-5 h-8 rounded bg-neutral-800/80 border border-white/10 opacity-50" />
        <div className="w-5 h-8 rounded bg-neutral-800/80 border border-white/10 opacity-50" />
        <div className="w-5 h-8 rounded bg-neutral-800/80 border border-white/10 opacity-50" />
      </div>
    </div>
  )
};

// ── V5: Xbox (Blade / Metro Matrix) ───────────────────────────
const XboxMiniPreview = () => {
  return (
    <div className="w-full h-full bg-[#0b120c] text-white relative overflow-hidden flex flex-col p-1.5 justify-between">
      {/* Subtle green ambient bloom */}
      <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-[#107c10]/20 rounded-full blur-xl pointer-events-none" />

      {/* Top Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1">
          <span className="text-[6px] font-black text-white">OTIX</span>
          <span className="text-[4.5px] font-black px-1 py-0.2 rounded bg-[#107c10]/30 text-[#107c10] border border-[#107c10]/40">
            BLADE
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[5px] font-bold text-[#107c10]">12,450 G</span>
          <div className="w-2 h-2 rounded-md bg-[#107c10] ring-1 ring-[#107c10]/50" />
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-5 gap-1 my-0.5 flex-1 items-stretch">
        {/* Large Left Featured Tile */}
        <div className="col-span-3 rounded bg-gradient-to-br from-[#111714] to-emerald-950/70 border border-[#107c10]/50 p-1 flex flex-col justify-between relative overflow-hidden shadow-inner">
          <div className="flex items-center gap-1">
            <span className="text-[4px] font-black uppercase px-1 py-0.2 rounded bg-[#107c10] text-black">
              Resume
            </span>
          </div>
          <div>
            <div className="text-[6.5px] font-black text-white leading-tight">Halo Infinite</div>
            <div className="mt-0.5 px-1.5 py-0.2 rounded bg-[#107c10] text-white text-[4.5px] font-black uppercase flex items-center gap-0.5 w-fit">
              <Play size={4} fill="white" />
              <span>A Play</span>
            </div>
          </div>
        </div>

        {/* Right Stacked Tiles */}
        <div className="col-span-2 flex flex-col gap-1">
          <div className="flex-1 rounded bg-[#111714] border border-white/10 p-1 flex flex-col justify-between">
            <span className="text-[4px] font-bold text-[#107c10] uppercase">Quick Resume</span>
            <Flame size={8} className="text-[#107c10] self-end" />
          </div>
          <div className="flex-1 rounded bg-[#111714] border border-white/10 p-1 flex flex-col justify-between">
            <span className="text-[4px] text-white/50">Activity</span>
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="w-2/3 h-full bg-[#107c10]" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Mini Bento Row */}
      <div className="grid grid-cols-4 gap-1">
        <div className="h-3 rounded bg-[#111714] border border-[#107c10]/40 flex items-center justify-center text-[4px] font-bold text-white/70">
          Gears 5
        </div>
        <div className="h-3 rounded bg-[#111714] border border-white/10 flex items-center justify-center text-[4px] text-white/50">
          Forza
        </div>
        <div className="h-3 rounded bg-[#111714] border border-white/10 flex items-center justify-center text-[4px] text-white/50">
          Sea
        </div>
        <div className="h-3 rounded bg-[#111714] border border-white/10 flex items-center justify-center text-[4px] text-white/50">
          Pass
        </div>
      </div>
    </div>
  )
};

// ── V6: Switch (Arcade / Handheld Carousel) ───────────────────
const SwitchMiniPreview = () => {
  return (
    <div className="w-full h-full bg-[#1b1b1e] text-white relative overflow-hidden flex flex-col justify-between p-1.5">
      {/* Joy-Con Color Edges */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-rose-600" />
      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-cyan-500" />

      {/* Top Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-rose-500 to-red-600 ring-1 ring-rose-400/60" />
          <span className="text-[5px] font-bold text-white/80">Online</span>
        </div>
        <span className="text-[5.5px] font-mono text-white/70 font-bold">12:45</span>
      </div>

      {/* Center Carousel */}
      <div className="flex items-center justify-center gap-1.5 py-0.5">
        <div className="w-7 h-7 rounded bg-neutral-800 border border-white/10 opacity-60" />
        {/* Active game card with vivid red ring */}
        <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-rose-600 to-amber-600 ring-2 ring-[#e60012] shadow-[0_4px_12px_rgba(230,0,18,0.5)] -translate-y-0.5 p-1 flex flex-col justify-between relative overflow-hidden">
          <span className="text-[4px] font-black uppercase text-white bg-rose-700/80 px-1 py-0.2 rounded w-fit">
            Mario
          </span>
          <div className="w-3 h-3 rounded-full bg-white/20 self-end flex items-center justify-center">
            <Play size={5} fill="white" />
          </div>
        </div>
        <div className="w-7 h-7 rounded bg-neutral-800 border border-white/10 opacity-60" />
      </div>

      {/* Bottom Switch Circle Dock Buttons */}
      <div className="flex items-center justify-center gap-1.5 pt-0.5 border-t border-white/5">
        <div className="w-3 h-3 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
          <Gamepad2 size={6} className="text-rose-400" />
        </div>
        <div className="w-3 h-3 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
          <Tv size={6} className="text-white/60" />
        </div>
        <div className="w-3 h-3 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
          <Settings size={6} className="text-white/60" />
        </div>
      </div>
    </div>
  )
};

// ── V7: Retro (Cyberpunk / Terminal Netrunner) ─────────────────
const RetroMiniPreview = () => {
  return (
    <div className="w-full h-full bg-[#080a08] text-[#33ff33] font-mono relative overflow-hidden flex flex-col p-1.5 justify-between">
      {/* CRT Scanline Effect */}
      <div
        className="absolute inset-0 pointer-events-none z-20 opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.8) 50%)',
          backgroundSize: '100% 2px',
        }}
      />

      {/* CRT Header */}
      <div className="flex items-center justify-between border-b border-[#1f3f1f] pb-0.5 text-[4.5px] text-[#228822] relative z-10">
        <div className="flex items-center gap-1">
          <Terminal size={5} className="text-[#33ff33]" />
          <span className="font-bold text-[#33ff33]">NETRUNNER_V7</span>
        </div>
        <span>CPU: 24% · 144FPS</span>
      </div>

      {/* Dual Column Matrix */}
      <div className="flex-1 flex gap-1 py-1 relative z-10">
        {/* Left Grep Target Index */}
        <div className="w-2/5 border-r border-[#1f3f1f] pr-1 space-y-0.5 text-[4.5px]">
          <div className="bg-[#33ff33]/20 text-[#33ff33] px-0.5 rounded border-l border-[#33ff33] truncate font-bold">
            [01] DEUS_EX
          </div>
          <div className="text-[#227722] px-0.5 truncate">[02] SYSTEM_SHOCK</div>
          <div className="text-[#227722] px-0.5 truncate">[03] NET_HACK</div>
        </div>

        {/* Right Wireframe / Visualizer */}
        <div className="flex-1 flex flex-col justify-between pl-0.5">
          <div className="border border-[#1f3f1f] bg-black/60 rounded p-1 flex-1 flex flex-col justify-between">
            <span className="text-[4px] text-[#33ff33]">RAW FEED // CAM 01</span>
            <div className="w-full h-3 border border-[#1f3f1f] border-dashed rounded flex items-center justify-center text-[4px] text-[#227722]">
              + WIREFRAME +
            </div>
          </div>
          <div className="mt-0.5 px-1 py-0.2 rounded bg-[#33ff33]/20 border border-[#33ff33] text-[#33ff33] text-[4.5px] font-bold w-fit">
            EXEC [&gt;]
          </div>
        </div>
      </div>

      <div className="border-t border-[#1f3f1f] pt-0.5 text-[4px] text-[#228822] flex justify-between relative z-10">
        <span>STATUS: READY</span>
        <span>NODE::ROOT</span>
      </div>
    </div>
  )
};

// ── V8: Minimal (Gallery Zen) ─────────────────────────────────
const MinimalMiniPreview = () => {
  return (
    <div className="w-full h-full bg-[#09090b] text-neutral-300 font-sans relative overflow-hidden flex p-1.5 gap-2">
      {/* Left Clean Index */}
      <div className="w-2/5 flex flex-col justify-between">
        <div>
          <span className="text-[6px] tracking-widest uppercase font-semibold text-neutral-400">OTIX</span>
          <div className="text-[4px] tracking-wider uppercase font-mono text-neutral-600">V8 · MINIMAL</div>
        </div>

        <div className="space-y-0.5 text-[5px]">
          <div className="text-white font-bold border-l border-white pl-1">01 Elden Ring</div>
          <div className="text-neutral-600 pl-1">02 Cyberpunk</div>
          <div className="text-neutral-600 pl-1">03 Bloodborne</div>
        </div>

        <span className="text-[4px] font-mono text-neutral-600">32 titles</span>
      </div>

      {/* Right Museum Gallery Poster */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-12 h-16 rounded-sm bg-gradient-to-t from-neutral-950 via-neutral-800 to-neutral-700 border border-white/20 shadow-xl p-1 flex flex-col justify-between">
          <div className="w-2 h-0.5 bg-white/40" />
          <div>
            <div className="text-[5.5px] font-serif text-white tracking-wide leading-tight">Elden Ring</div>
            <div className="text-[4px] text-neutral-400 mt-0.2">2024 · FromSoft</div>
          </div>
        </div>
      </div>
    </div>
  )
};

// ── V9: Forge (Storefront Client) ─────────────────────────────
const ForgeMiniPreview = () => {
  return (
    <div className="w-full h-full bg-[#121212] text-white font-sans relative overflow-hidden flex">
      {/* Left Navigation Rail */}
      <div className="w-1/4 bg-[#181818] border-r border-[#242424] p-1 flex flex-col justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-0.5">
            <span className="text-[6px] font-black text-white">OTIX</span>
            <span className="text-[4px] text-cyan-400 font-bold">V9</span>
          </div>
          <div className="space-y-0.5 text-[4.5px]">
            <div className="bg-cyan-500/20 text-cyan-400 font-bold px-1 py-0.2 rounded">Store</div>
            <div className="text-neutral-500 px-1 py-0.2">Library</div>
          </div>
        </div>
      </div>

      {/* Main Storefront Area */}
      <div className="flex-1 p-1 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[5.5px] font-bold text-white">Storefront</span>
          <div className="w-6 h-1.5 rounded bg-[#202020]" />
        </div>

        {/* Marquee Promo Banner */}
        <div className="w-full h-9 rounded bg-gradient-to-r from-cyan-950 via-neutral-900 to-neutral-800 border border-cyan-500/40 p-1 flex flex-col justify-between">
          <span className="text-[4px] uppercase font-bold text-cyan-400">Featured</span>
          <div>
            <div className="text-[6px] font-black text-white leading-none">Cyberpunk 2077</div>
            <div className="mt-0.5 px-1 py-0.2 rounded bg-cyan-500 text-black text-[4.5px] font-black uppercase w-fit">
              Play Now
            </div>
          </div>
        </div>

        {/* Bottom Shelf Cards */}
        <div className="flex items-center gap-1">
          <div className="w-1/3 h-4 rounded bg-[#202020] border border-white/5" />
          <div className="w-1/3 h-4 rounded bg-[#202020] border border-white/5" />
          <div className="w-1/3 h-4 rounded bg-[#202020] border border-white/5" />
        </div>
      </div>
    </div>
  )
};

// ── V10: Spatial Glass (Aero Prism) ───────────────────────────
const GlassMiniPreview = () => {
  return (
    <div className="w-full h-full bg-[#07050d] text-white font-sans relative overflow-hidden flex flex-col p-1.5 justify-between">
      {/* Ambient Gradient Mesh Orbs */}
      <div className="absolute -top-4 -left-4 w-16 h-16 bg-purple-600/40 rounded-full blur-lg pointer-events-none" />
      <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-pink-600/35 rounded-full blur-lg pointer-events-none" />
      <div className="absolute top-1/2 left-1/3 w-12 h-12 bg-blue-600/25 rounded-full blur-md pointer-events-none" />

      {/* Top Floating Glass Capsule */}
      <div className="rounded-full bg-white/[0.08] backdrop-blur-md border border-white/20 px-1.5 py-0.5 flex items-center justify-between relative z-10 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="text-[5.5px] font-black text-white">SPATIAL</span>
          <span className="text-[4px] px-1 py-0.2 rounded-full bg-purple-500/30 text-purple-300 font-bold border border-purple-400/40">
            V10
          </span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
      </div>

      {/* Floating Translucent Glass Card */}
      <div className="rounded-lg bg-white/[0.07] backdrop-blur-md border border-white/25 p-1.5 flex flex-col justify-between shadow-[0_4px_16px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden h-11">
        <div className="flex items-center justify-between">
          <span className="text-[6.5px] font-black bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
            Starfield
          </span>
          <span className="text-[4.5px] text-purple-300">★ 9.2</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[4px] text-white/60">Frosted Glass Deck</span>
          <div className="px-1.5 py-0.2 rounded-full bg-purple-600/70 border border-purple-400/50 text-white text-[4.5px] font-bold shadow-[0_0_8px_rgba(168,85,247,0.5)]">
            Launch
          </div>
        </div>
      </div>

      {/* Bottom Floating Glass Pills */}
      <div className="flex items-center justify-center gap-1 relative z-10">
        <div className="w-6 h-1.5 rounded-full bg-white/[0.08] border border-white/15" />
        <div className="w-8 h-1.5 rounded-full bg-purple-500/30 border border-purple-400/40" />
        <div className="w-6 h-1.5 rounded-full bg-white/[0.08] border border-white/15" />
      </div>
    </div>
  )
};
