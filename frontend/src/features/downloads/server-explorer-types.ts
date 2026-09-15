/** Types for the Otix Server File Explorer & Remote Download Location. */

export type FormatCategory = 'folder' | 'iso' | 'installer' | 'archive' | 'rom' | 'file';

export interface ServerExplorerEntry {
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

export interface ServerExplorerBrowseResult {
  current_path: string;
  parent_path?: string | null;
  is_root: boolean;
  entries: ServerExplorerEntry[];
  active_download_path: string;
  total_items: number;
  disk_free_bytes?: number | null;
  disk_total_bytes?: number | null;
}

export interface SetServerDownloadPathPayload {
  path: string;
  create_if_missing?: boolean;
  add_as_library?: boolean;
}

export interface CreateServerFolderPayload {
  parent_path: string;
  folder_name: string;
}

export interface ServerPathBreadcrumb {
  label: string;
  fullPath: string;
}
