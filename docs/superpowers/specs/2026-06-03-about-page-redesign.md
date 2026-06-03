# About Page Redesign — Hero Section + Search Button

## Overview

Redesign the `/about` page with a glassmorphic floating hero, slim search bar, clean about text, feature highlights, and compact FAQ. Remove existing bloated sections (Profile Scores, Achievements, expanded FAQ) that clutter the page.

## Design

Approved interactive mockup at `http://localhost:59428` (session) — final iteration: `about-hero-final.html`.

### Hero Section (Glass Card)

- Floating glass card: `bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]`, `backdrop-blur-xl`, `shadow-[var(--dk-shadow-glass)]`, `ring-1 ring-white/[0.04]`, `rounded-[2rem]`
- Coloured accent blobs: radial gradients in top-right (primary red) and bottom-left (indigo), behind content
- Top accent line: 2px gradient `transparent → primary → transparent`
- Content: otix SVG wordmark, "About Otix" heading, tagline paragraph, 3 stat counters (4 Media Types, ∞ Free, 100+ Achievements)
- Each stat: `bg-[var(--dk-surface-glass)]`, rounded-xl, stacked number + uppercase label

### Slim Search Bar (Overlapping)

- Positioned below hero with `margin-top: -24px`, `z-index: 2`
- Same glass styling as hero but `rounded-full` (pill shape)
- Slimmer height: h-10 input, no mode tabs row
- Search icon (lucide `Search`) on left, input with placeholder "What are you in the mood for?", submit button (lucide `ArrowRight`) on right
- Submitting navigates to `/search?q=...`

### About Content Section

- Gradient heading "What is Otix?" (`linear-gradient(135deg, #e94560, #ff6b6b)` background-clip text)
- Media type pill badges (Movies/Shows/Games/Music) with Otix accent colors (rose/violet/emerald/amber)
- 2 paragraphs describing the platform
- 2×2 feature grid with SVG icons and short descriptions:
  - Rate & Review (star icon, amber)
  - Curated Lists (list icon)
  - Earn XP & Badges (trophy icon)
  - Connected Accounts (link icon)
- Closing paragraph about community discovery

### FAQ Section

- Gradient heading "Quick Answers"
- 5 collapsible accordion items with `useState` toggle
- Each: `bg-[var(--dk-surface-base)]`, `rounded-2xl`, ChevronDown icon rotation on open

### What's Removed

- Profile Scores (XP & Level, Aura, User Rating) — moved to dedicated page or profile
- Achievements / Badges section — moved to profile
- Expanded FAQ (10 questions → 5)
- Static About paragraphs restructured with visual elements

## Components

### Files to Modify

- `frontend/src/features/about/organisms/about-page.tsx` — complete rewrite

### Imports Needed

- `lucide-react`: `Search`, `ArrowRight`, `ChevronDown`, `Star`, `List`, `Trophy`, `Link`
- `@/lib/utils` (cn) — already imported
- `react-helmet-async` (Helmet) — already imported
- `useNavigate` from `@tanstack/react-router`
- `Logo` from `@/features/dk-ui/atoms/logo`

### Data

- Media type pill data (inline)
- Feature card data (inline)
- FAQ data (5 items, inline)
- Stat counter data (inline)

## States

- **Loading**: None — static page, no data fetching
- **Empty**: No empty state needed
- **Error**: No error state needed
- **Edge cases**:
  - Search button navigates to `/search` even with empty query (shows search page)
  - FAQ items independently toggleable
  - SEO meta tags via Helmet (already present)

## Implementation

Single file change to `about-page.tsx`. No new components needed — all inline within the page component.
