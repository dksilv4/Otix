import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { TermsPage } from '../terms-page'
import { PrivacyPage } from '../privacy-page'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className} data-testid={`link-${to}`}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

describe('Legal Pages (Terms of Service & Privacy Policy)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('TermsPage', () => {
    it('renders terms title, navigation switcher, and core BYOS terms', () => {
      render(
        <HelmetProvider>
          <TermsPage />
        </HelmetProvider>,
      )

      expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
      expect(screen.getByText('Bring Your Own Server (BYOS) Client Notice')).toBeInTheDocument()
      expect(screen.getByText('Zero Media Relay Architecture')).toBeInTheDocument()

      // Navigation switcher contains link to privacy policy
      const privacyLink = screen.getByTestId('link-/privacy')
      expect(privacyLink).toBeInTheDocument()
      expect(privacyLink).toHaveTextContent('Privacy Policy')
    })

    it('renders subscription, billing & refund policy as part of terms of service', () => {
      render(
        <HelmetProvider>
          <TermsPage />
        </HelmetProvider>,
      )

      expect(screen.getByText('7. Subscription, Billing & Refund Policy')).toBeInTheDocument()
      expect(screen.getByText('Self-Service Cancellation:')).toBeInTheDocument()
      expect(screen.getByText('14-Day Statutory Refund Window:')).toBeInTheDocument()
    })

    it('renders intellectual property and font asset licensing section', () => {
      render(
        <HelmetProvider>
          <TermsPage />
        </HelmetProvider>,
      )

      expect(screen.getByText('8. Font, Asset & Intellectual Property Licenses')).toBeInTheDocument()
      expect(screen.getByText('9. DMCA & Copyright Safe Harbor Notice')).toBeInTheDocument()
      expect(screen.getByText('10. Disclaimer of Warranties & Limitation of Liability')).toBeInTheDocument()
    })
  })

  describe('PrivacyPage', () => {
    it('renders privacy title, navigation switcher, and data minimization pledge', () => {
      render(
        <HelmetProvider>
          <PrivacyPage />
        </HelmetProvider>,
      )

      expect(screen.getByRole('heading', { level: 1, name: 'Privacy & Cookie Policy' })).toBeInTheDocument()
      expect(screen.getByText('Zero Unnecessary Data Collection Pledge')).toBeInTheDocument()

      // Navigation switcher contains link to terms of service
      const termsLink = screen.getByTestId('link-/terms')
      expect(termsLink).toBeInTheDocument()
      expect(termsLink).toHaveTextContent('Terms of Service')
    })

    it('does not contain misplaced refund or font licensing sections (strictly separated)', () => {
      render(
        <HelmetProvider>
          <PrivacyPage />
        </HelmetProvider>,
      )

      expect(screen.queryByText('Subscription, Billing & Refund Policy')).not.toBeInTheDocument()
      expect(screen.queryByText('Refund & Subscription Cancellation Policy')).not.toBeInTheDocument()
      expect(screen.queryByText('Font, Asset & Intellectual Property Licenses')).not.toBeInTheDocument()
    })

    it('allows resetting cookie preferences', () => {
      localStorage.setItem('otix_cookie_consent', 'all')
      render(
        <HelmetProvider>
          <PrivacyPage />
        </HelmetProvider>,
      )

      expect(screen.getByText('All Cookies Accepted')).toBeInTheDocument()
      const resetBtn = screen.getByRole('button', { name: /Reset Cookie Preference/i })
      fireEvent.click(resetBtn)

      expect(localStorage.getItem('otix_cookie_consent')).toBeNull()
      expect(screen.getByText('Not Yet Configured')).toBeInTheDocument()
    })
  })
})
