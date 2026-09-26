import React from 'react';
import {
  NodeArrSettingsModal,
  type NodeArrSettingsModalProps,
} from './node-arr-settings-modal';

export type NodeSonarrSettingsModalProps = Omit<NodeArrSettingsModalProps, 'appType'>;
export type ServerSonarrSettingsModalProps = NodeSonarrSettingsModalProps;

export function NodeSonarrSettingsModal(props: NodeSonarrSettingsModalProps) {
  return <NodeArrSettingsModal {...props} appType="sonarr" />;
}

export const ServerSonarrSettingsModal = NodeSonarrSettingsModal;
