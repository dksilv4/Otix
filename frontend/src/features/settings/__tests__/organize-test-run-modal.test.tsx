import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrganizeTestRunModal } from '../components/organisms/organize-test-run-modal'
import { clearDesktopAPICache } from '@/lib/desktop/api'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

describe('OrganizeTestRunModal', () => {
  const onOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    clearDesktopAPICache()
    delete (window as any).desktopAPI
    delete (window as any).electronAPI
  })

  it('renders target folder dropdown, scan button, and empty state when no files found', async () => {
    ;(window as any).desktopAPI = {
      smartOrganizePreview: vi.fn().mockResolvedValue([]),
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"
        isoDirectory={'D:\\Games\\EmptyFolder'}
      />,
    )

    expect(screen.getByText('Organize Test Run')).toBeInTheDocument()
    expect(screen.getByText('Target Folder')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /EmptyFolder/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/no game files found in this folder/i)).toBeInTheDocument()
    })
  })

  it('displays folder scan error card when desktop organizer fails or path does not exist', async () => {
    ;(window as any).desktopAPI = {
      smartOrganizePreview: vi.fn().mockRejectedValue(new Error('Folder does not exist: D:\\NonExistent')),
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} ({Year})/{Title}.{ext}"
        isoDirectory="D:\\NonExistent"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Folder Scan Error')).toBeInTheDocument()
      expect(screen.getByText(/Folder does not exist: D:\\NonExistent/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry scan/i })).toBeInTheDocument()
    })
  })

  it('displays onboarding message when no folder is selected', async () => {
    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} ({Year})/{Title}.{ext}"
        isoDirectory=""
        availableScanPaths={[]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Select or Browse a Folder to Test')).toBeInTheDocument()
    })
  })

  it('displays archive diagnostics and repair badge for repack anomaly', async () => {
    ;(window as any).desktopAPI = {
      smartOrganizePreview: vi.fn().mockResolvedValue([
        {
          sourcePath: 'D:\\Games\\Library\\Baldurs Gate 3',
          sourceFilename: 'Baldurs Gate 3',
          type: 'container_package',
          matched: true,
          extracted: { Title: 'Baldurs Gate 3' },
          targetPath: 'D:\\Games\\Library\\Baldurs Gate 3',
          status: 'container_package',
          health: 'CORRECTABLE_ANOMALY',
          anomalies: ["Missing 'elamigos-' prefix: data-2.bin"],
          suggestedRenames: { 'data-2.bin': 'elamigos-2.bin' },
        },
      ]),
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} ({Year})/{Title}.{ext}"
        isoDirectory="D:\\Games\\Library"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Archive Integrity Diagnostic')).toBeInTheDocument()
      expect(screen.getByText('Auto-Healable')).toBeInTheDocument()
      expect(screen.getByText(/Missing 'elamigos-' prefix/)).toBeInTheDocument()
    })
  })

  it('displays clear BEFORE and AFTER panels with source and target paths for all items', async () => {
    ;(window as any).desktopAPI = {
      smartOrganizePreview: vi.fn().mockResolvedValue([
        {
          sourcePath: 'D:\\Downloads\\Cyberpunk.2077.iso',
          sourceFilename: 'Cyberpunk.2077.iso',
          type: 'iso',
          matched: true,
          extracted: { Title: 'Cyberpunk 2077', Year: '2020', Platform: 'PC' },
          targetPath: 'D:\\Games\\Cyberpunk 2077 (2020) [PC]\\Cyberpunk.2077.iso',
          foldersToCreate: ['Cyberpunk 2077 (2020) [PC]'],
          status: 'rename_and_move',
        },
        {
          sourcePath: 'D:\\Downloads\\Hollow Knight',
          sourceFilename: 'Hollow Knight',
          type: 'container_package',
          matched: true,
          extracted: { Title: 'Hollow Knight', Year: '2017', Platform: 'PC' },
          targetPath: 'D:\\Games\\Hollow Knight (2017) [PC]',
          foldersToCreate: ['Hollow Knight (2017) [PC]'],
          status: 'container_package',
          isFolder: true,
        },
      ]),
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"
        isoDirectory="D:\\Downloads"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk.2077.iso')).toBeInTheDocument()
      expect(screen.getAllByText('Hollow Knight').length).toBeGreaterThan(0)
    })

    const beforeLabels = screen.getAllByText(/BEFORE \(Current\)/i)
    const afterLabels = screen.getAllByText(/AFTER \(Organized\)/i)
    expect(beforeLabels.length).toBe(2)
    expect(afterLabels.length).toBe(2)

    expect(screen.getByText('D:\\Downloads\\Cyberpunk.2077.iso')).toBeInTheDocument()
    expect(
      screen.getByText('D:\\Games\\Cyberpunk 2077 (2020) [PC]\\Cyberpunk.2077.iso'),
    ).toBeInTheDocument()
    expect(screen.getByText('D:\\Downloads\\Hollow Knight')).toBeInTheDocument()
    expect(screen.getByText('D:\\Games\\Hollow Knight (2017) [PC]')).toBeInTheDocument()

    // Simplified metrics check
    expect(screen.getByText('Total Scanned')).toBeInTheDocument()
    expect(screen.getByText('To Organize')).toBeInTheDocument()
  })

  it('filters items using real-time search and filter tabs', async () => {
    const user = userEvent.setup()

    ;(window as any).desktopAPI = {
      smartOrganizePreview: vi.fn().mockResolvedValue([
        {
          sourcePath: 'D:\\Downloads\\Elden.Ring.iso',
          sourceFilename: 'Elden.Ring.iso',
          type: 'iso',
          matched: true,
          extracted: { Title: 'Elden Ring' },
          targetPath: 'D:\\Games\\Elden Ring [PC]\\Elden.Ring.iso',
          status: 'rename_and_move',
        },
        {
          sourcePath: 'D:\\Downloads\\Zelda.nsp',
          sourceFilename: 'Zelda.nsp',
          type: 'rom',
          matched: true,
          extracted: { Title: 'Zelda' },
          targetPath: 'D:\\Games\\Zelda [Switch]\\Zelda.nsp',
          status: 'already_organized',
        },
        {
          sourcePath: 'D:\\Downloads\\Baldurs Gate 3',
          sourceFilename: 'Baldurs Gate 3',
          type: 'container_package',
          matched: true,
          extracted: { Title: 'Baldurs Gate 3' },
          targetPath: 'D:\\Games\\Baldurs Gate 3 [PC]',
          status: 'container_package',
          isFolder: true,
        },
      ]),
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} [{Platform}]/{OriginalName}.{ext}"
        isoDirectory="D:\\Downloads"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Elden.Ring.iso')).toBeInTheDocument()
      expect(screen.getByText('Zelda.nsp')).toBeInTheDocument()
      expect(screen.getAllByText('Baldurs Gate 3').length).toBeGreaterThan(0)
    })

    const searchInput = screen.getByPlaceholderText(/search files and folders/i)
    await user.type(searchInput, 'Zelda')

    expect(screen.getByText('Zelda.nsp')).toBeInTheDocument()
    expect(screen.queryByText('Elden.Ring.iso')).not.toBeInTheDocument()
    expect(screen.queryByText('Baldurs Gate 3')).not.toBeInTheDocument()

    await user.clear(searchInput)
    expect(screen.getByText('Elden.Ring.iso')).toBeInTheDocument()

    const toMoveTab = screen.getByRole('button', { name: /to move/i })
    await user.click(toMoveTab)

    expect(screen.getByText('Elden.Ring.iso')).toBeInTheDocument()
    expect(screen.queryByText('Zelda.nsp')).not.toBeInTheDocument()
  })

  it('supports desktop IPC execution when executeOrganization is available', async () => {
    const user = userEvent.setup()
    const mockExecuteOrganization = vi.fn().mockResolvedValue([
      { sourcePath: 'D:\\Games\\Hollow Knight', targetPath: 'D:\\Games\\Organized\\Hollow Knight', success: true },
    ])

    ;(window as any).desktopAPI = {
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

  it('displays source subdirectories, target subdirectories, and package subdirectories when applicable', async () => {
    ;(window as any).desktopAPI = {
      smartOrganizePreview: vi.fn().mockResolvedValue([
        {
          sourcePath: 'D:\\Downloads\\ROMs\\PS2\\God.Of.War.iso',
          sourceFilename: 'God.Of.War.iso',
          type: 'rom',
          matched: true,
          extracted: { Title: 'God of War', Year: '2005', Platform: 'PS2' },
          targetPath: 'D:\\Games\\PlayStation 2\\God of War (2005) [PS2]\\God.Of.War.iso',
          foldersToCreate: ['PlayStation 2\\God of War (2005) [PS2]'],
          status: 'rename_and_move',
          sourceSubdirectory: 'ROMs/PS2',
          targetSubdirectory: 'PlayStation 2/God of War (2005) [PS2]',
        },
        {
          sourcePath: 'D:\\Downloads\\Baldurs Gate 3',
          sourceFilename: 'Baldurs Gate 3',
          type: 'container_package',
          matched: true,
          extracted: { Title: 'Baldurs Gate 3', Year: '2023', Platform: 'PC' },
          targetPath: 'D:\\Games\\Baldurs Gate 3 (2023) [PC]',
          foldersToCreate: ['Baldurs Gate 3 (2023) [PC]'],
          status: 'container_package',
          isFolder: true,
          subdirectories: ['Crack', '_CommonRedist', 'Support'],
        },
        {
          sourcePath: 'D:\\Downloads\\RootGame.iso',
          sourceFilename: 'RootGame.iso',
          type: 'iso',
          matched: true,
          extracted: { Title: 'Root Game' },
          targetPath: 'D:\\Games\\Root Game\\RootGame.iso',
          status: 'rename_and_move',
        },
      ]),
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"
        isoDirectory="D:\\Downloads"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('God.Of.War.iso')).toBeInTheDocument()
      expect(screen.getAllByText('Baldurs Gate 3').length).toBeGreaterThan(0)
    })

    expect(screen.getByText('In Subdirs')).toBeInTheDocument()
    expect(screen.getByText('ROMs / PS2')).toBeInTheDocument()
    expect(screen.getByText('PlayStation 2 / God of War (2005) [PS2]')).toBeInTheDocument()
    expect(screen.getByText(/Folder Package Subdirectories \(3\)/)).toBeInTheDocument()
    expect(screen.getByText('Crack/')).toBeInTheDocument()
    expect(screen.getByText('_CommonRedist/')).toBeInTheDocument()
    expect(screen.getByText('Support/')).toBeInTheDocument()
  })

  it('filters by In Subdirs tab correctly', async () => {
    const user = userEvent.setup()

    ;(window as any).desktopAPI = {
      smartOrganizePreview: vi.fn().mockResolvedValue([
        {
          sourcePath: 'D:\\Downloads\\Updates\\Patch.exe',
          sourceFilename: 'Patch.exe',
          type: 'update',
          matched: true,
          extracted: { Title: 'Cyberpunk 2077' },
          targetPath: 'D:\\Games\\Cyberpunk 2077 [PC]\\Updates\\Patch.exe',
          foldersToCreate: ['Cyberpunk 2077 [PC]\\Updates'],
          status: 'secondary_update',
          sourceSubdirectory: 'Updates',
          targetSubdirectory: 'Cyberpunk 2077 [PC]/Updates',
        },
        {
          sourcePath: 'D:\\Downloads\\FlatFile.iso',
          sourceFilename: 'FlatFile.iso',
          type: 'iso',
          matched: true,
          extracted: { Title: 'Flat File' },
          targetPath: 'D:\\Downloads\\FlatFile.iso',
          status: 'already_organized',
        },
      ]),
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title} [{Platform}]/{OriginalName}.{ext}"
        isoDirectory="D:\\Downloads"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Patch.exe')).toBeInTheDocument()
      expect(screen.getByText('FlatFile.iso')).toBeInTheDocument()
    })

    const subdirsTab = screen.getByRole('button', { name: /in subdirs/i })
    await user.click(subdirsTab)

    expect(screen.getByText('Patch.exe')).toBeInTheDocument()
    expect(screen.queryByText('FlatFile.iso')).not.toBeInTheDocument()
  })

  it('allows selecting available library paths from dropdown', async () => {
    const user = userEvent.setup()
    const mockPreview = vi.fn().mockResolvedValue([])

    ;(window as any).desktopAPI = {
      smartOrganizePreview: mockPreview,
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        template="{Title}/{Title}.{ext}"
        isoDirectory="D:\\Games\\ISOs"
        availableScanPaths={[
          { path: 'D:\\Games\\ISOs', type: 'iso' },
          { path: 'E:\\ROMs', type: 'rom' },
        ]}
      />,
    )

    const dropdownTrigger = screen.getByRole('button', { name: /ISOs/i })
    expect(dropdownTrigger).toBeInTheDocument()

    await user.click(dropdownTrigger)
    const romOption = await screen.findByRole('option', { name: /ROMs/i })
    await user.click(romOption)

    expect(mockPreview).toHaveBeenCalledWith('E:\\ROMs', '{Title}/{Title}.{ext}')
  })

  it('falls back to desktop smartOrganizePreview when remote server proxy returns status 500', async () => {
    const { apiClient } = await import('@/lib/api/client')
    ;(apiClient.post as any).mockRejectedValueOnce(new Error('Request failed with status code 500'))

    const fallbackMock = vi.fn().mockResolvedValue([
      {
        sourcePath: 'D:\\Games\\Elden Ring\\Elden.Ring.iso',
        sourceFilename: 'Elden.Ring.iso',
        type: 'iso',
        matched: true,
        extracted: { Title: 'Elden Ring' },
        targetPath: 'D:\\Games\\Elden Ring [PC]\\Elden Ring.iso',
        status: 'rename_and_move',
      },
    ])
    ;(window as any).desktopAPI = {
      smartOrganizePreview: fallbackMock,
    }

    render(
      <OrganizeTestRunModal
        open={true}
        onOpenChange={onOpenChange}
        nodeId={9}
        template="{Title} [{Platform}]/{Title}.{ext}"
        isoDirectory={'D:\\Games\\Elden Ring'}
      />,
    )

    await waitFor(() => {
      expect(fallbackMock).toHaveBeenCalledWith('D:\\Games\\Elden Ring', '{Title} [{Platform}]/{Title}.{ext}')
      expect(screen.getByText('Elden.Ring.iso')).toBeInTheDocument()
      expect(screen.queryByText(/Folder Scan Error/i)).not.toBeInTheDocument()
    })
  })
})
