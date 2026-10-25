/** Types for the Otix Node File Explorer & Remote Download Location. */

export type FormatCategory = 'folder' | 'iso' | 'installer' | 'game' | 'archive' | 'rom' | 'file';

export interface NodeExplorerEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  extension: string;
  format_category: FormatCategory;
  modified_at?: string | null;
  is_downloadable: boolean;
  is_download_location: boolean;
}

export type ServerExplorerEntry = NodeExplorerEntry;

export interface ExplorerShortcut {
  name: string;
  path: string;
  icon: 'home' | 'downloads' | 'documents' | 'desktop' | 'volumes' | 'root' | string;
  exist?: boolean;
}

export interface ExplorerDrive {
  name: string;
  path: string;
  free_bytes?: number | null;
  total_bytes?: number | null;
  is_network?: boolean;
}

export interface NodeExplorerBrowseResult {
  current_path: string;
  parent_path?: string | null;
  is_root: boolean;
  entries: NodeExplorerEntry[];
  active_download_path: string;
  total_items: number;
  disk_free_bytes?: number | null;
  disk_total_bytes?: number | null;
  shortcuts?: ExplorerShortcut[];
  drives?: ExplorerDrive[];
  permission_denied?: boolean;
  permission_message?: string;
}

export interface RequestNodePermissionPayload {
  path: string;
}

export interface RequestNodePermissionResult {
  path: string;
  granted: boolean;
  prompted: boolean;
  message: string;
}

export type ServerExplorerBrowseResult = NodeExplorerBrowseResult;

export interface SetNodeDownloadPathPayload {
  path: string;
  create_if_missing?: boolean;
  add_as_library?: boolean;
}

export type SetServerDownloadPathPayload = SetNodeDownloadPathPayload;

export interface CreateNodeFolderPayload {
  parent_path: string;
  folder_name: string;
}

export type CreateServerFolderPayload = CreateNodeFolderPayload;

export interface NodePathBreadcrumb {
  label: string;
  fullPath: string;
}

export type ServerPathBreadcrumb = NodePathBreadcrumb;

export interface ConnectNodeSharePayload {
  url: string;
  share_name?: string;
  username?: string;
  password?: string;
  workgroup?: string;
}

export type ConnectServerSharePayload = ConnectNodeSharePayload;

export interface ConnectNodeShareResult {
  status: string;
  path: string;
  message?: string;
}

export type ConnectServerShareResult = ConnectNodeShareResult;
