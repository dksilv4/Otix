import React from 'react';
import {
  NodeArrSettingsModal,
  type NodeArrSettingsModalProps,
} from './node-arr-settings-modal';

export type NodeRadarrSettingsModalProps = Omit<NodeArrSettingsModalProps, 'appType'>;
export type ServerRadarrSettingsModalProps = NodeRadarrSettingsModalProps;

export const NodeRadarrSettingsModal = (props: NodeRadarrSettingsModalProps) => {
  return <NodeArrSettingsModal {...props} appType="radarr" />;
};

export const ServerRadarrSettingsModal = NodeRadarrSettingsModal;
