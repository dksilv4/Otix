/** Types for the Otix Node File Explorer & Remote Download Location. */

export type FormatCategory = 'folder' | 'iso' | 'installer' | 'archive' | 'rom' | 'file';

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

export interface NodeExplorerBrowseResult {
  current_path: string;
  parent_path?: string | null;
  is_root: boolean;
  entries: NodeExplorerEntry[];
  active_download_path: string;
  total_items: number;
  disk_free_bytes?: number | null;
  disk_total_bytes?: number | null;
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
