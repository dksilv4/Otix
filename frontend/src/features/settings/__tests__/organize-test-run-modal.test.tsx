import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrganizeTestRunModal } from '../components/organisms/organize-test-run-modal'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

describe('OrganizeTestRunModal', () => {
  const onOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as any).electronAPI
  })

  it('renders sample releases by default when opened without a node scan', () => {
    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"
        isoDirectory="D:\\Games\\Library"
      />,
    )

    expect(screen.getByText('Organize Test Run')).toBeInTheDocument()
    expect(screen.getByText('Items Scanned')).toBeInTheDocument()
    expect(screen.getByText('Matched')).toBeInTheDocument()
    expect(screen.getByText('Using Sample Releases')).toBeInTheDocument()
  })

  it('displays archive diagnostics and repair badge for repack anomaly sample', () => {
    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} ({Year})/{Title}.{ext}"
        isoDirectory="D:\\Games\\Library"
      />,
    )

    expect(screen.getByText('Archive Integrity Diagnostic')).toBeInTheDocument()
    expect(screen.getByText('Auto-Healable')).toBeInTheDocument()
    expect(screen.getByText(/Missing 'elamigos-' prefix/)).toBeInTheDocument()
  })

  it('supports desktop IPC execution when electronAPI is available', async () => {
    const user = userEvent.setup()
    const mockExecuteOrganization = vi.fn().mockResolvedValue([
      { sourcePath: 'D:\\Games\\Hollow Knight', targetPath: 'D:\\Games\\Organized\\Hollow Knight', success: true },
    ])

    ;(window as any).electronAPI = {
      smartOrganizePreview: vi.fn().mockResolvedValue([
        {
          sourcePath: 'D:\\Games\\Downloads\\Hollow Knight',
          sourceFilename: 'Hollow Knight',
          type: 'container_package',
          matched: true,
          extracted: { Title: 'Hollow Knight' },
          targetPath: 'D:\\Games\\Library\\Hollow Knight',
          status: 'container_package',
        },
      ]),
      executeOrganization: mockExecuteOrganization,
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} ({Year})/{Title}.{ext}"
        isoDirectory="D:\\Games\\Downloads"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Execute (1)')).toBeInTheDocument()
    })

    const executeBtn = screen.getByText('Execute (1)')
    await user.click(executeBtn)

    expect(mockExecuteOrganization).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByText(/Successfully organized 1 game artifacts/)).toBeInTheDocument()
    })
  })
})
