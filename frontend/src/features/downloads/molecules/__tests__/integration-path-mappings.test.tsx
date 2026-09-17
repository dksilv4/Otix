import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useState } from 'react'
import { IntegrationPathMappings, type PathMappingRow } from '../integration-path-mappings'

function Harness({
  initial = [{ remotePath: '', hostPath: '' }] as PathMappingRow[],
  folderError,
}: {
  initial?: PathMappingRow[]
  folderError?: string
}) {
  const [mappings, setMappings] = useState(initial)
  return (
    <IntegrationPathMappings
      mappings={mappings}
      onChange={setMappings}
      folderError={folderError}
    />
  )
}

describe('IntegrationPathMappings', () => {
  it('shows a calm discovery state instead of raw folderError copy', () => {
    render(
      <Harness folderError="SABnzbd completed folder has not been discovered yet" />
    )

    expect(screen.getByText('Folder not found yet')).toBeInTheDocument()
    expect(screen.getByText(/Point the remote path at the completed download folder/i)).toBeInTheDocument()
    expect(screen.getByText('Not found')).toBeInTheDocument()
    expect(screen.queryByText(/SABnzbd completed folder has not been discovered yet/i)).not.toBeInTheDocument()
  })

  it('shows a quiet Linked state when a mapping is linked', () => {
    render(
      <Harness
        initial={[{ remotePath: '/downloads', hostPath: '/mnt', linked: true }]}
        folderError="SABnzbd completed folder has not been discovered yet"
      />
    )

    expect(screen.getByText('Linked')).toBeInTheDocument()
    expect(screen.queryByText('Folder not found yet')).not.toBeInTheDocument()
  })

  it('renders a weighted Add mapping action', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const add = screen.getByRole('button', { name: /Add mapping/i })
    expect(add.className).toMatch(/bg-amber-500/)
    await user.click(add)
    expect(screen.getByText('Mapping 2')).toBeInTheDocument()
    expect(screen.getByText(/Both paths must point to the same shared folder/i).className).toMatch(/pl-4/)
  })
})
