import React from 'react';
import {
  ServerArrSettingsModal,
  type ServerArrSettingsModalProps,
} from './server-arr-settings-modal';

export type ServerSonarrSettingsModalProps = Omit<ServerArrSettingsModalProps, 'appType'>;

export function ServerSonarrSettingsModal(props: ServerSonarrSettingsModalProps) {
  return <ServerArrSettingsModal {...props} appType="sonarr" />;
}
