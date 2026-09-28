package explorer

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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

type ExplorerShortcut struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Icon  string `json:"icon"` // "home", "downloads", "documents", "desktop", "volumes", "root"
	Exist bool   `json:"exist"`
}

type ExplorerBrowseResponse struct {
	CurrentPath        string             `json:"current_path"`
	ParentPath         *string            `json:"parent_path"`
	IsRoot             bool               `json:"is_root"`
	Entries            []ExplorerEntry    `json:"entries"`
	ActiveDownloadPath string             `json:"active_download_path"`
	TotalItems         int                `json:"total_items"`
	DiskFreeBytes      *uint64            `json:"disk_free_bytes"`
	DiskTotalBytes     *uint64            `json:"disk_total_bytes"`
	Shortcuts          []ExplorerShortcut `json:"shortcuts,omitempty"`
	PermissionDenied   bool               `json:"permission_denied,omitempty"`
	PermissionMessage  string             `json:"permission_message,omitempty"`
}

type CreateFolderRequest struct {
	ParentPath string `json:"parent_path"`
	FolderName string `json:"folder_name"`
}

type SetDownloadPathRequest struct {
	Path            string `json:"path"`
	CreateIfMissing bool   `json:"create_if_missing"`
	AddAsLibrary    bool   `json:"add_as_library"`
}

type PermissionRequest struct {
	Path string `json:"path"`
}

type PermissionResult struct {
	Path     string `json:"path"`
	Granted  bool   `json:"granted"`
	Prompted bool   `json:"prompted"`
	Message  string `json:"message"`
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

func dirExists(path string) bool {
	stat, err := os.Stat(path)
	return err == nil && stat.IsDir()
}

func isPermissionDenied(err error) bool {
	if err == nil {
		return false
	}
	low := strings.ToLower(err.Error())
	return strings.Contains(low, "permission denied") || strings.Contains(low, "operation not permitted")
}

func GetSystemShortcuts() []ExplorerShortcut {
	var shortcuts []ExplorerShortcut
	home, _ := os.UserHomeDir()

	if home != "" {
		shortcuts = append(shortcuts, ExplorerShortcut{
			Name:  "Home",
			Path:  home,
			Icon:  "home",
			Exist: dirExists(home),
		})

		downloads := filepath.Join(home, "Downloads")
		shortcuts = append(shortcuts, ExplorerShortcut{
			Name:  "Downloads",
			Path:  downloads,
			Icon:  "downloads",
			Exist: dirExists(downloads),
		})

		documents := filepath.Join(home, "Documents")
		shortcuts = append(shortcuts, ExplorerShortcut{
			Name:  "Documents",
			Path:  documents,
			Icon:  "documents",
			Exist: dirExists(documents),
		})

		desktop := filepath.Join(home, "Desktop")
		shortcuts = append(shortcuts, ExplorerShortcut{
			Name:  "Desktop",
			Path:  desktop,
			Icon:  "desktop",
			Exist: dirExists(desktop),
		})
	}

	if runtime.GOOS == "darwin" {
		if dirExists("/Volumes") {
			shortcuts = append(shortcuts, ExplorerShortcut{
				Name:  "Volumes",
				Path:  "/Volumes",
				Icon:  "volumes",
				Exist: true,
			})
		}
		shortcuts = append(shortcuts, ExplorerShortcut{
			Name:  "Root (/)",
			Path:  "/",
			Icon:  "root",
			Exist: true,
		})
	} else if runtime.GOOS == "windows" {
		for c := 'A'; c <= 'Z'; c++ {
			drive := string(c) + ":\\"
			if dirExists(drive) {
				shortcuts = append(shortcuts, ExplorerShortcut{
					Name:  string(c) + ": Drive",
					Path:  drive,
					Icon:  "root",
					Exist: true,
				})
			}
		}
	} else {
		if dirExists("/media") {
			shortcuts = append(shortcuts, ExplorerShortcut{
				Name:  "Media",
				Path:  "/media",
				Icon:  "volumes",
				Exist: true,
			})
		}
		shortcuts = append(shortcuts, ExplorerShortcut{
			Name:  "Root (/)",
			Path:  "/",
			Icon:  "root",
			Exist: true,
		})
	}

	return shortcuts
}

func SanitizeAndResolvePath(rawPath, baseDir string) (string, error) {
	home, _ := os.UserHomeDir()

	root := baseDir
	if root == "" || root == "." || root == "/" {
		if home != "" && dirExists(home) {
			root = home
		} else {
			var err error
			root, err = os.Getwd()
			if err != nil {
				root = "."
			}
		}
	}

	cleaned := strings.TrimSpace(rawPath)
	if cleaned == "" || cleaned == "." {
		return filepath.Abs(root)
	}

	if cleaned == "/" {
		return "/", nil
	}

	if cleaned == "~" {
		if home != "" {
			return filepath.Abs(home)
		}
	} else if strings.HasPrefix(cleaned, "~/") || strings.HasPrefix(cleaned, "~\\") {
		if home != "" {
			return filepath.Abs(filepath.Join(home, cleaned[2:]))
		}
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
		if os.IsPermission(err) || isPermissionDenied(err) {
			parent := filepath.Dir(resolvedTarget)
			isRoot := parent == resolvedTarget
			var parentPtr *string
			if !isRoot {
				parentPtr = &parent
			}
			return &ExplorerBrowseResponse{
				CurrentPath:        resolvedTarget,
				ParentPath:         parentPtr,
				IsRoot:             isRoot,
				Entries:            []ExplorerEntry{},
				ActiveDownloadPath: activeDownloadPath,
				TotalItems:         0,
				Shortcuts:          GetSystemShortcuts(),
				PermissionDenied:   true,
				PermissionMessage:  fmt.Sprintf("Permission denied accessing %s. If prompted on your host machine, grant access to Otix Node, or enable permission in System Settings.", resolvedTarget),
			}, nil
		}
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
		if os.IsPermission(err) || isPermissionDenied(err) {
			return &ExplorerBrowseResponse{
				CurrentPath:        resolvedTarget,
				ParentPath:         parentPtr,
				IsRoot:             isRoot,
				Entries:            []ExplorerEntry{},
				ActiveDownloadPath: activeDownloadPath,
				TotalItems:         0,
				Shortcuts:          GetSystemShortcuts(),
				PermissionDenied:   true,
				PermissionMessage:  fmt.Sprintf("Permission denied reading %s. If prompted on your host machine, grant access to Otix Node, or enable permission in System Settings.", resolvedTarget),
			}, nil
		}
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
			cat := "folder"
			ext := ""
			if strings.HasSuffix(strings.ToLower(d.Name()), ".app") {
				cat = "game"
				ext = ".app"
			}
			entries = append(entries, ExplorerEntry{
				Name:               d.Name(),
				Path:               fullPath,
				IsDir:              true,
				Size:               0,
				Extension:          ext,
				FormatCategory:     cat,
				ModifiedAt:         modTime,
				IsDownloadable:     false,
				IsDownloadLocation: isDL,
			})
		} else {
			ext := strings.ToLower(filepath.Ext(d.Name()))
			cat := indexer.DetermineFileFormatCategory(fullPath, d.Name())
			isDL := cat == "iso" || cat == "installer" || cat == "game" || cat == "archive" || cat == "rom" ||
				ext == ".exe" || ext == ".zip" || ext == ".iso" || ext == ".rar" || ext == ".7z" || ext == ".bin" ||
				ext == ".dmg" || ext == ".pkg" || ext == ".app"
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
		Shortcuts:          GetSystemShortcuts(),
	}, nil
}

func RequestFolderPermission(targetPath string) (*PermissionResult, error) {
	resolvedTarget, err := SanitizeAndResolvePath(targetPath, "")
	if err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

	// 1. Probe access to directory
	_, readErr := os.ReadDir(resolvedTarget)
	if readErr == nil {
		return &PermissionResult{
			Path:     resolvedTarget,
			Granted:  true,
			Prompted: false,
			Message:  fmt.Sprintf("Permission already granted for %s.", resolvedTarget),
		}, nil
	}

	// 2. On macOS, try to bring app to front or open System Settings
	if runtime.GOOS == "darwin" {
		// Bring Otix Node to foreground in case a TCC prompt dialog is showing
		_ = exec.Command("open", "-b", "com.otix.node").Start()

		// Also open System Settings -> Files and Folders
		_ = exec.Command("open", "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders").Start()

		return &PermissionResult{
			Path:     resolvedTarget,
			Granted:  false,
			Prompted: true,
			Message:  fmt.Sprintf("Permission requested on Mac for %s. If prompted, click 'Allow'. System Settings > Privacy & Security has also been opened so you can enable Otix Node.", resolvedTarget),
		}, nil
	}

	return &PermissionResult{
		Path:     resolvedTarget,
		Granted:  false,
		Prompted: false,
		Message:  fmt.Sprintf("Permission denied on host: %v", readErr),
	}, nil
}
