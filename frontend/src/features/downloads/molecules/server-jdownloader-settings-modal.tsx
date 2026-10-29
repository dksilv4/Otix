import { NodeJDownloaderSettingsModal, type NodeJDownloaderSettingsModalProps } from './node-jdownloader-settings-modal';

export type ServerJDownloaderSettingsModalProps = NodeJDownloaderSettingsModalProps;

export const ServerJDownloaderSettingsModal = (props: ServerJDownloaderSettingsModalProps) => {
  return <NodeJDownloaderSettingsModal {...props} />;
};
