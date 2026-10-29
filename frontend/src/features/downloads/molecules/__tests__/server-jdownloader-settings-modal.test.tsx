import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ServerJDownloaderSettingsModal } from '../server-jdownloader-settings-modal';

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

let mockGameServers: Array<{ id: number; name: string }> = [];
let mockConfig: any = null;
const saveJD = vi.fn();
const testJD = vi.fn();

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
}));

vi.mock('@/features/downloads/hooks/use-node-jdownloader', () => ({
  useNodeJDownloaderConfig: () => ({ data: mockConfig, isLoading: false }),
  useSaveNodeJDownloaderConfig: () => ({ mutateAsync: saveJD, isPending: false }),
  useTestJDownloader: () => ({ mutateAsync: testJD, isPending: false }),
}));

describe('ServerJDownloaderSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGameServers = [{ id: 1, name: 'Node' }];
    mockConfig = {
      enabled: true,
      email: 'user@example.com',
      password: 'password123',
      deviceName: 'Home-NAS-JD2',
      configured: true,
      hasPassword: true,
    };
    saveJD.mockResolvedValue({ status: 'saved' });
    testJD.mockResolvedValue({ ok: true, message: 'Connected to JDownloader successfully' });
  });

  it('renders modal with title, email, and connection options', () => {
    render(<ServerJDownloaderSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'JDownloader 2' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toHaveValue('user@example.com');
    expect(screen.getByRole('button', { name: /MyJDownloader Cloud/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Direct HTTP Loopback/i })).toBeInTheDocument();
  });

  it('switches between MyJDownloader Cloud and Direct HTTP mode', async () => {
    const user = userEvent.setup();
    render(<ServerJDownloaderSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />);

    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();

    const directBtn = screen.getByRole('button', { name: /Direct HTTP Loopback/i });
    await user.click(directBtn);

    expect(screen.getByLabelText(/Host/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Port/i)).toBeInTheDocument();
  });

  it('runs connection test and calls testJD mutation', async () => {
    const user = userEvent.setup();
    render(<ServerJDownloaderSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />);

    const testBtn = screen.getByRole('button', { name: /Test Connection/i });
    await user.click(testBtn);

    await waitFor(() => {
      expect(testJD).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          deviceName: 'Home-NAS-JD2',
        })
      );
    });
  });

  it('saves updated settings when submitting form', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ServerJDownloaderSettingsModal serverId={1} serverName="Node" onClose={onClose} />);

    const emailInput = screen.getByLabelText(/Email/i);
    await user.clear(emailInput);
    await user.type(emailInput, 'newuser@example.com');

    const saveBtn = screen.getByRole('button', { name: /^Save$/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(saveJD).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newuser@example.com',
          enabled: true,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
