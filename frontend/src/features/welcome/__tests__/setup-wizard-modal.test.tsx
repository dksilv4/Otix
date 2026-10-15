import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetupWizardModal } from '../components/organisms/setup-wizard-modal'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    refreshUser: vi.fn(),
  }),
}))

vi.mock('../utils/setup-wizard-utils', () => ({
  checkLocalNode: vi.fn().mockResolvedValue(null),
  claimNodeWithPin: vi.fn().mockResolvedValue({ success: true }),
  selectLocalGameDirectory: vi.fn().mockResolvedValue('/custom/games'),
  saveLibraryScanDirectory: vi.fn().mockResolvedValue(true),
  markOnboardingFinished: vi.fn().mockResolvedValue(undefined),
  hasSeenSetupWizard: vi.fn().mockReturnValue(false),
  getDefaultPrimaryGamePath: vi.fn().mockReturnValue('C:\\Otix'),
  getInitialGamePath: vi.fn().mockResolvedValue('C:\\Otix'),
  unclaimNode: vi.fn().mockResolvedValue(true),
  isNodeOrphaned: vi.fn().mockReturnValue(false),
  SETUP_WIZARD_SEEN_KEY: 'otix:setup-wizard-completed',
}))

describe('SetupWizardModal', () => {
  const onClose = vi.fn()
  const onCompleted = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Step 1 (Welcome & Mode Selection) when open', () => {
    render(<SetupWizardModal isOpen={true} onClose={onClose} onCompleted={onCompleted} />)

    expect(screen.getByRole('heading', { level: 2, name: /step 1 of 5: welcome/i })).toBeInTheDocument()
    expect(screen.getByText(/how do you want to use otix\?/i)).toBeInTheDocument()
    expect(screen.getByText('Desktop All-in-One')).toBeInTheDocument()
    expect(screen.getByText('Self-Hosted Companion')).toBeInTheDocument()
    expect(screen.getByText('Cloud Explorer')).toBeInTheDocument()
  })

  it('navigates through steps using Continue and Back', () => {
    render(<SetupWizardModal isOpen={true} onClose={onClose} onCompleted={onCompleted} />)

    // Initial: Step 1
    expect(screen.getByRole('heading', { level: 2, name: /step 1 of 5: welcome/i })).toBeInTheDocument()

    // Click Continue -> Step 2
    const continueBtn = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(continueBtn)
    expect(screen.getByRole('heading', { level: 2, name: /step 2 of 5: node/i })).toBeInTheDocument()

    // Click Continue -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('heading', { level: 2, name: /step 3 of 5: library/i })).toBeInTheDocument()

    // Click Back -> Step 2
    const backBtn = screen.getByRole('button', { name: /back/i })
    fireEvent.click(backBtn)
    expect(screen.getByRole('heading', { level: 2, name: /step 2 of 5: node/i })).toBeInTheDocument()
  })

  it('allows skipping to subsequent steps', () => {
    render(<SetupWizardModal isOpen={true} onClose={onClose} onCompleted={onCompleted} />)

    const skipBtn = screen.getByRole('button', { name: /skip/i })
    fireEvent.click(skipBtn)
    expect(screen.getByRole('heading', { level: 2, name: /step 2 of 5: node/i })).toBeInTheDocument()
  })

  it('calls onClose when clicking close button', () => {
    render(<SetupWizardModal isOpen={true} onClose={onClose} onCompleted={onCompleted} />)

    const closeBtn = screen.getByRole('button', { name: /close dialog/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})
