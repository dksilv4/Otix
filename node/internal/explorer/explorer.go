package explorer

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/dksilv4/otix/node/internal/indexer"
)

type ExplorerEntry struct {
	Name               string `json:"name"`
	Path               string `json:"path"`
	IsDir              bool   `json:"is_dir"`
	Size               int64  `json:"size"`
	Extension          string `json:"extension"`
	FormatCategory     string `json:"format_category"`
	ModifiedAt         string `json:"modified_at,omitempty"`
	IsDownloadable     bool   `json:"is_downloadable"`
	IsDownloadLocation bool   `json:"is_download_location"`
}

type ExplorerBrowseResponse struct {
	CurrentPath        string          `json:"current_path"`
	ParentPath         *string         `json:"parent_path"`
	IsRoot             bool            `json:"is_root"`
	Entries            []ExplorerEntry `json:"entries"`
	ActiveDownloadPath string          `json:"active_download_path"`
	TotalItems         int             `json:"total_items"`
	DiskFreeBytes      *uint64         `json:"disk_free_bytes"`
	DiskTotalBytes     *uint64         `json:"disk_total_bytes"`
}

type CreateFolderRequest struct {
	ParentPath string `json:"parent_path"`
	FolderName string `json:"folder_name"`
}

type SetDownloadPathRequest struct {
	Path             string `json:"path"`
	CreateIfMissing  bool   `json:"create_if_missing"`
	AddAsLibrary     bool   `json:"add_as_library"`
}

func IsSafeFolderName(name string) bool {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return false
	}
	invalid := []string{"/", "\\", "\x00", "..", ":"}
	for _, inv := range invalid {
		if strings.Contains(trimmed, inv) {
			return false
		}
	}
	return true
}

func SanitizeAndResolvePath(rawPath, baseDir string) (string, error) {
	root := baseDir
	if root == "" {
		var err error
		root, err = os.Getwd()
		if err != nil {
			root = "."
		}
	}

	cleaned := strings.TrimSpace(rawPath)
	if cleaned == "" || cleaned == "." || cleaned == "/" {
		return filepath.Abs(root)
	}

	if filepath.IsAbs(cleaned) {
		return filepath.Clean(cleaned), nil
	}

	return filepath.Abs(filepath.Join(root, cleaned))
}

func InspectDirectory(targetPath, activeDownloadPath, serverRoot string) (*ExplorerBrowseResponse, error) {
	resolvedTarget, err := SanitizeAndResolvePath(targetPath, serverRoot)
	if err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

	stat, err := os.Stat(resolvedTarget)
	if err != nil {
		return nil, fmt.Errorf("directory not found: %s", resolvedTarget)
	}
	if !stat.IsDir() {
		return nil, fmt.Errorf("path is not a directory: %s", resolvedTarget)
	}

	parent := filepath.Dir(resolvedTarget)
	isRoot := parent == resolvedTarget
	var parentPtr *string
	if !isRoot {
		parentPtr = &parent
	}

	dirEntries, err := os.ReadDir(resolvedTarget)
	if err != nil {
		return nil, fmt.Errorf("permission denied reading directory: %w", err)
	}

	var entries []ExplorerEntry
	for _, d := range dirEntries {
		if strings.HasPrefix(d.Name(), ".") {
			continue
		}

		info, errInfo := d.Info()
		if errInfo != nil {
			continue
		}

		fullPath := filepath.Join(resolvedTarget, d.Name())
		isDir := d.IsDir()
		modTime := info.ModTime().UTC().Format(time.RFC3339)

		if isDir {
			isDL := activeDownloadPath != "" && filepath.Clean(fullPath) == filepath.Clean(activeDownloadPath)
			entries = append(entries, ExplorerEntry{
				Name:               d.Name(),
				Path:               fullPath,
				IsDir:              true,
				Size:               0,
				Extension:          "",
				FormatCategory:     "folder",
				ModifiedAt:         modTime,
				IsDownloadable:     false,
				IsDownloadLocation: isDL,
			})
		} else {
			ext := strings.ToLower(filepath.Ext(d.Name()))
			cat := indexer.DetermineFormatCategory(ext)
			isDL := cat == "iso" || cat == "installer" || cat == "archive" || cat == "rom" ||
				ext == ".exe" || ext == ".zip" || ext == ".iso" || ext == ".rar" || ext == ".7z" || ext == ".bin" ||
				ext == ".dmg" || ext == ".pkg"
			entries = append(entries, ExplorerEntry{
				Name:               d.Name(),
				Path:               fullPath,
				IsDir:              false,
				Size:               info.Size(),
				Extension:          ext,
				FormatCategory:     cat,
				ModifiedAt:         modTime,
				IsDownloadable:     isDL,
				IsDownloadLocation: false,
			})
		}
	}

	// Sort directories first alphabetically, then files alphabetically
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})

	var freePtr, totalPtr *uint64
	free, total, errDisk := GetDiskUsage(resolvedTarget)
	if errDisk == nil {
		freePtr = &free
		totalPtr = &total
	}

	return &ExplorerBrowseResponse{
		CurrentPath:        resolvedTarget,
		ParentPath:         parentPtr,
		IsRoot:             isRoot,
		Entries:            entries,
		ActiveDownloadPath: activeDownloadPath,
		TotalItems:         len(entries),
		DiskFreeBytes:      freePtr,
		DiskTotalBytes:     totalPtr,
	}, nil
}
