import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SettingsAppearancePage } from '../pages/settings-appearance-page'
import * as envModule from '@/lib/config/env'
import * as themeModule from '@/lib/providers/theme'

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ hash: '' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('../hooks/use-settings-hash-scroll', () => ({
  useSettingsHashScroll: vi.fn(),
}))

vi.mock('@/lib/providers/shader-quality', () => ({
  useShaderQuality: () => ({
    shaderQuality: 'medium',
    setShaderQuality: vi.fn(),
  }),
  SHADER_QUALITY_OPTIONS: [{ value: 'medium', label: 'Medium', description: 'Balanced' }],
}))

vi.mock('@/lib/providers/motion-preference', () => ({
  useMotionPreference: () => ({
    motionPreference: 'system',
    setMotionPreference: vi.fn(),
  }),
  MOTION_OPTIONS: [{ value: 'system', label: 'System', description: 'Follows OS' }],
}))

describe('SettingsAppearancePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders theme choice when HIDE_THEME_CHOICE is false (development mode)', () => {
    vi.spyOn(envModule, 'ENV', 'get').mockReturnValue({
      ...envModule.ENV,
      HIDE_THEME_CHOICE: false,
    })

    const setThemeMock = vi.fn()
    vi.spyOn(themeModule, 'useTheme').mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: setThemeMock,
      layoutTheme: 'default',
      setLayoutTheme: vi.fn(),
    })

    render(<SettingsAppearancePage />)

    const themeHeading = screen.getByRole('heading', { level: 3, name: 'Theme' })
    expect(themeHeading).toBeDefined()
    const themeCard = themeHeading.closest('div.rounded-2xl, div.rounded-3xl') as HTMLElement
    expect(themeCard).not.toBeNull()

    const lightBtn = within(themeCard).getByRole('button', { name: 'Light' })
    expect(within(themeCard).getByRole('button', { name: 'Dark' })).toBeDefined()
    expect(within(themeCard).getByRole('button', { name: 'System' })).toBeDefined()
    expect(lightBtn).toBeDefined()

    fireEvent.click(lightBtn)
    expect(setThemeMock).toHaveBeenCalledWith('light')
  })

  it('hides theme choice card when HIDE_THEME_CHOICE is true (production mode)', () => {
    vi.spyOn(envModule, 'ENV', 'get').mockReturnValue({
      ...envModule.ENV,
      HIDE_THEME_CHOICE: true,
    })

    render(<SettingsAppearancePage />)

    expect(screen.queryByRole('heading', { level: 3, name: 'Theme' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Light' })).toBeNull()
    // Other appearance settings such as Accent and Interface Animations should still be present
    expect(screen.getByRole('heading', { level: 3, name: 'Accent' })).toBeDefined()
  })
})
