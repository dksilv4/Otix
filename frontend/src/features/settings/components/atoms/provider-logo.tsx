import EpicLogo from '@/assets/provider-logos/epic.svg?react'
import SteamLogo from '@/assets/provider-logos/steam.svg?react'
import GOGLogo from '@/assets/provider-logos/gog.svg?react'

interface ProviderLogoProps {
  platform: string
  className?: string
  showTextFallback?: boolean
}

export function ProviderLogo({ platform, className = 'h-4 w-4', showTextFallback = false }: ProviderLogoProps) {
  const p = (platform || '').toLowerCase().trim()

  if (p === 'epic' || p === 'egs' || p === 'epic games' || p === 'epic games store') {
    return <EpicLogo className={className + ' text-white/90 shrink-0'} />
  }

  if (p === 'steam') {
    return <SteamLogo className={className + ' text-sky-400 shrink-0'} />
  }

  if (p === 'gog' || p === 'gog galaxy') {
    return <GOGLogo className={className + ' shrink-0'} />
  }

  if (p === 'xbox' || p === 'microsoft' || p === 'game pass') {
    return (
      <svg className={className + ' text-emerald-400 shrink-0'} viewBox="0 0 24 24" fill="currentColor">
        <title>Xbox</title>
        <path d="M11.968 2.001c-5.518 0-9.983 4.465-9.983 9.983 0 2.217.726 4.264 1.954 5.918l4.474-5.918c-.808-1.545-1.121-2.909-1.121-4.045 0-1.89 1.134-2.88 2.827-2.88 1.455 0 2.409.73 3.864 2.236 1.455-1.506 2.409-2.236 3.864-2.236 1.693 0 2.827.99 2.827 2.88 0 1.136-.313 2.5-1.121 4.045l4.474 5.918c1.228-1.654 1.954-3.701 1.954-5.918 0-5.518-4.465-9.983-9.983-9.983z" />
      </svg>
    )
  }

  if (p.includes('playstation') || p === 'ps5' || p === 'ps4' || p === 'psn' || p === 'ps') {
    return (
      <svg className={className + ' text-blue-400 shrink-0'} viewBox="0 0 24 24" fill="currentColor">
        <title>PlayStation</title>
        <path d="M7.447 18.666l-5.632-2.1c-.812-.3-.825-.863-.038-1.25.788-.388 2.113-.45 2.925-.138l2.745.988V8.716c0-.85.3-1.463.788-1.563.488-.1 1.05.35 1.05 1.2v6.6l2.125.75v-9.65c0-1.125.4-1.925 1.05-2.063.65-.138 1.4.463 1.4 1.6v10.113l2.25.788c.813.3.825.863.038 1.25-.788.388-2.113.45-2.925.138l-2.763-.975v.85c0 .85-.3 1.463-.788 1.563-.488.1-1.05-.35-1.05-1.2v-.65l-2.138-.75v2.85c0 1.125-.4 1.925-1.05 2.063-.163.038-.325.038-.475 0z" />
      </svg>
    )
  }

  if (p.includes('nintendo') || p.includes('switch') || p === 'eshop') {
    return (
      <svg className={className + ' text-rose-500 shrink-0'} viewBox="0 0 24 24" fill="currentColor">
        <title>Nintendo Switch</title>
        <path d="M7.5 2h-2A3.5 3.5 0 0 0 2 5.5v13A3.5 3.5 0 0 0 5.5 22h2A3.5 3.5 0 0 0 11 18.5v-13A3.5 3.5 0 0 0 7.5 2zm-1.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 9a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zM16.5 2h2A3.5 3.5 0 0 1 22 5.5v13a3.5 3.5 0 0 1-3.5 3.5h-2a3.5 3.5 0 0 1-3.5-3.5v-13A3.5 3.5 0 0 1 16.5 2zm1.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0-6a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z" />
      </svg>
    )
  }

  if (p === 'ea' || p === 'origin' || p === 'ea app') {
    return (
      <svg className={className + ' text-amber-500 shrink-0'} viewBox="0 0 24 24" fill="currentColor">
        <title>EA App / Origin</title>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.6 14.5L12.7 12l2.9-4.5h-2.1L11.7 10h-2.2l2.3-3.5H9.7L6.8 12l2.9 4.5h2.1l-1.8-2.5h2.2l-2.3 3.5h2.1z" />
      </svg>
    )
  }

  if (p === 'ubisoft' || p === 'uplay' || p === 'ubisoft connect') {
    return (
      <svg className={className + ' text-indigo-400 shrink-0'} viewBox="0 0 24 24" fill="currentColor">
        <title>Ubisoft Connect</title>
        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm1 14.93V15a1 1 0 0 0-2 0v1.93A6 6 0 0 1 6.07 13H8a1 1 0 0 0 0-2H6.07A6 6 0 0 1 11 6.07V8a1 1 0 0 0 2 0V6.07A6 6 0 0 1 17.93 11H16a1 1 0 0 0 0 2h1.93A6 6 0 0 1 13 16.93z" />
      </svg>
    )
  }

  if (p === 'bnet' || p === 'battlenet' || p === 'blizzard') {
    return (
      <svg className={className + ' text-cyan-400 shrink-0'} viewBox="0 0 24 24" fill="currentColor">
        <title>Battle.net</title>
        <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.8l6.5 3.25L12 11.3 5.5 8.05 12 4.8zM4 9.1l7 3.5v7l-7-3.5V9.1zm16 7l-7 3.5v-7l7-3.5v7z" />
      </svg>
    )
  }

  if (p === 'itch' || p === 'itchio' || p === 'itch.io') {
    return (
      <svg className={className + ' text-pink-500 shrink-0'} viewBox="0 0 24 24" fill="currentColor">
        <title>Itch.io</title>
        <path d="M4.5 3A1.5 1.5 0 0 0 3 4.5v15A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 3h-15zM7.5 7.5h9a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75H15v1.5a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 9 12v-1.5H7.5a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 .75-.75z" />
      </svg>
    )
  }

  // Default PC / Desktop / Custom
  if (showTextFallback) {
    return <span className={className + ' text-white/60 text-xs font-mono uppercase'}>{platform || 'PC'}</span>
  }

  return (
    <svg className={className + ' text-white/60 shrink-0'} viewBox="0 0 24 24" fill="currentColor">
      <title>{platform || 'PC'}</title>
      <path d="M20 3H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h6l-2 3v1h8v-1l-2-3h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H4V5h16v10z" />
    </svg>
  )
}

