import React from 'react';
import {
  ServerArrSettingsModal,
  type ServerArrSettingsModalProps,
} from './server-arr-settings-modal';

export type ServerRadarrSettingsModalProps = Omit<ServerArrSettingsModalProps, 'appType'>;

export function ServerRadarrSettingsModal(props: ServerRadarrSettingsModalProps) {
  return <ServerArrSettingsModal {...props} appType="radarr" />;
}
