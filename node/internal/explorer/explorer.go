package explorer

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/dksilv4/otix/node/internal/indexer"
)

var (
	networkSharesMu        sync.RWMutex
	connectedNetworkShares = make(map[string]ExplorerDrive)
)

func AddConnectedNetworkShare(drive ExplorerDrive) {
	networkSharesMu.Lock()
	defer networkSharesMu.Unlock()
	connectedNetworkShares[drive.Path] = drive
}

func GetConnectedNetworkShares() []ExplorerDrive {
	networkSharesMu.RLock()
	defer networkSharesMu.RUnlock()
	shares := make([]ExplorerDrive, 0, len(connectedNetworkShares))
	for _, s := range connectedNetworkShares {
		shares = append(shares, s)
	}
	return shares
}

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

type ExplorerDrive struct {
	Name       string  `json:"name"`
	Path       string  `json:"path"`
	FreeBytes  *uint64 `json:"free_bytes,omitempty"`
	TotalBytes *uint64 `json:"total_bytes,omitempty"`
	IsNetwork  bool    `json:"is_network,omitempty"`
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
	Drives             []ExplorerDrive    `json:"drives,omitempty"`
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

type ConnectShareRequest struct {
	URL       string `json:"url"`
	ShareName string `json:"share_name,omitempty"`
	Username  string `json:"username,omitempty"`
	Password  string `json:"password,omitempty"`
	Workgroup string `json:"workgroup,omitempty"`
}

type ConnectShareResult struct {
	Status  string `json:"status"`
	Path    string `json:"path"`
	Message string `json:"message"`
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

func GetSystemDrives() []ExplorerDrive {
	var drives []ExplorerDrive
	if runtime.GOOS == "windows" {
		for c := 'A'; c <= 'Z'; c++ {
			drivePath := string(c) + ":\\"
			if dirExists(drivePath) {
				ed := ExplorerDrive{
					Name: string(c) + ":",
					Path: drivePath,
				}
				if free, total, err := GetDiskUsage(drivePath); err == nil {
					ed.FreeBytes = &free
					ed.TotalBytes = &total
				}
				drives = append(drives, ed)
			}
		}
	} else if runtime.GOOS == "darwin" {
		rootDrive := ExplorerDrive{
			Name: "Macintosh HD",
			Path: "/",
		}
		if free, total, err := GetDiskUsage("/"); err == nil {
			rootDrive.FreeBytes = &free
			rootDrive.TotalBytes = &total
		}
		drives = append(drives, rootDrive)

		if dirExists("/Volumes") {
			if entries, err := os.ReadDir("/Volumes"); err == nil {
				for _, entry := range entries {
					volPath := filepath.Join("/Volumes", entry.Name())
					ed := ExplorerDrive{
						Name: entry.Name(),
						Path: volPath,
					}
					if free, total, err := GetDiskUsage(volPath); err == nil {
						ed.FreeBytes = &free
						ed.TotalBytes = &total
					}
					drives = append(drives, ed)
				}
			}
		}
	} else {
		rootDrive := ExplorerDrive{
			Name: "Root (/)",
			Path: "/",
		}
		if free, total, err := GetDiskUsage("/"); err == nil {
			rootDrive.FreeBytes = &free
			rootDrive.TotalBytes = &total
		}
		drives = append(drives, rootDrive)

		if dirExists("/media") {
			if entries, err := os.ReadDir("/media"); err == nil {
				for _, entry := range entries {
					mPath := filepath.Join("/media", entry.Name())
					ed := ExplorerDrive{
						Name: entry.Name(),
						Path: mPath,
					}
					if free, total, err := GetDiskUsage(mPath); err == nil {
						ed.FreeBytes = &free
						ed.TotalBytes = &total
					}
					drives = append(drives, ed)
				}
			}
		}
	}

	// Include connected network shares
	for _, ns := range GetConnectedNetworkShares() {
		exists := false
		for _, d := range drives {
			if strings.EqualFold(d.Path, ns.Path) {
				exists = true
				break
			}
		}
		if !exists {
			if free, total, err := GetDiskUsage(ns.Path); err == nil {
				ns.FreeBytes = &free
				ns.TotalBytes = &total
			}
			drives = append(drives, ns)
		}
	}

	return drives
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

	// 1. Support smb:// and cifs:// URLs
	lower := strings.ToLower(cleaned)
	if strings.HasPrefix(lower, "smb://") || strings.HasPrefix(lower, "cifs://") {
		trimmed := cleaned[6:]
		trimmed = strings.TrimPrefix(trimmed, "/")
		if runtime.GOOS == "windows" {
			unc := "\\\\" + strings.ReplaceAll(trimmed, "/", "\\")
			return filepath.Clean(unc), nil
		}
		parts := strings.Split(trimmed, "/")
		if len(parts) >= 2 {
			shareName := parts[1]
			if runtime.GOOS == "darwin" && dirExists(filepath.Join("/Volumes", shareName)) {
				sub := filepath.Join("/Volumes", shareName)
				if len(parts) > 2 {
					sub = filepath.Join(sub, filepath.Join(parts[2:]...))
				}
				return sub, nil
			}
		}
		return "/" + trimmed, nil
	}

	// 2. Support UNC paths (\\server\share, //server/share, or \server\share)
	if strings.HasPrefix(cleaned, "\\\\") || strings.HasPrefix(cleaned, "//") {
		if runtime.GOOS == "windows" {
			unc := strings.ReplaceAll(cleaned, "/", "\\")
			for strings.HasPrefix(unc, "\\\\\\") {
				unc = unc[1:]
			}
			return filepath.Clean(unc), nil
		}
		return filepath.Clean(cleaned), nil
	}

	if runtime.GOOS == "windows" && (strings.HasPrefix(cleaned, "\\") || strings.HasPrefix(cleaned, "/")) {
		norm := strings.ReplaceAll(cleaned, "/", "\\")
		stripped := strings.TrimLeft(norm, "\\")
		parts := strings.Split(stripped, "\\")
		if len(parts) >= 2 && parts[0] != "" && !strings.Contains(parts[0], ":") {
			unc := `\\` + stripped
			return filepath.Clean(unc), nil
		}
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

	if runtime.GOOS == "windows" {
		if len(cleaned) == 2 && cleaned[1] == ':' {
			cleaned = strings.ToUpper(cleaned) + "\\"
			return cleaned, nil
		}
		if len(cleaned) >= 2 && cleaned[1] == ':' {
			if len(cleaned) == 3 && (cleaned[2] == '\\' || cleaned[2] == '/') {
				return strings.ToUpper(cleaned[:2]) + "\\", nil
			}
			return filepath.Clean(cleaned), nil
		}
	}

	if filepath.IsAbs(cleaned) {
		return filepath.Clean(cleaned), nil
	}

	return filepath.Abs(filepath.Join(root, cleaned))
}

func ConnectShare(req ConnectShareRequest) (*ConnectShareResult, error) {
	raw := strings.TrimSpace(req.URL)
	if raw == "" && req.ShareName != "" {
		raw = req.ShareName
	}
	if raw == "" {
		return nil, fmt.Errorf("network share URL or path is required")
	}

	// Normalization for network share connection
	lower := strings.ToLower(raw)
	if strings.HasPrefix(lower, "smb://") {
		raw = raw[6:]
	} else if strings.HasPrefix(lower, "cifs://") {
		raw = raw[7:]
	}
	raw = strings.TrimSpace(raw)

	if runtime.GOOS == "windows" {
		// If not a local drive path like C:\...
		if len(raw) < 2 || raw[1] != ':' {
			norm := strings.ReplaceAll(raw, "/", "\\")
			stripped := strings.TrimLeft(norm, "\\")
			raw = `\\` + stripped
		}
	}

	targetPath, err := SanitizeAndResolvePath(raw, "")
	if err != nil {
		return nil, fmt.Errorf("invalid network share path: %w", err)
	}

	if runtime.GOOS == "windows" {
		if req.Username != "" {
			userArg := req.Username
			if req.Workgroup != "" && !strings.Contains(req.Username, "\\") && !strings.Contains(req.Username, "@") {
				userArg = req.Workgroup + "\\" + req.Username
			}
			var cmd *exec.Cmd
			if req.Password != "" {
				cmd = exec.Command("net", "use", targetPath, req.Password, "/user:"+userArg, "/persistent:no")
			} else {
				cmd = exec.Command("net", "use", targetPath, "/user:"+userArg, "/persistent:no")
			}
			out, err := cmd.CombinedOutput()
			if err != nil {
				if _, statErr := os.Stat(targetPath); statErr != nil {
					cleanOut := strings.TrimSpace(string(out))
					if cleanOut != "" {
						return nil, fmt.Errorf("authentication failed: %s", cleanOut)
					}
					return nil, fmt.Errorf("failed to connect to network share: %w", err)
				}
			}
		} else {
			if _, statErr := os.Stat(targetPath); statErr != nil {
				cmd := exec.Command("net", "use", targetPath, "/persistent:no")
				out, _ := cmd.CombinedOutput()
				if _, statErr2 := os.Stat(targetPath); statErr2 != nil {
					cleanOut := strings.TrimSpace(string(out))
					if cleanOut != "" {
						return nil, fmt.Errorf("could not connect to %s: %s", targetPath, cleanOut)
					}
					return nil, fmt.Errorf("could not access network share %s: %w", targetPath, statErr2)
				}
			}
		}
	}

	// Verify access
	entries, err := os.ReadDir(targetPath)
	if err != nil {
		if _, statErr := os.Stat(targetPath); statErr != nil {
			return nil, fmt.Errorf("could not access network share %s: %w", targetPath, err)
		}
	}

	// Register connected network share so it appears in Drives list
	ed := ExplorerDrive{
		Name:      targetPath,
		Path:      targetPath,
		IsNetwork: true,
	}
	if free, total, err := GetDiskUsage(targetPath); err == nil {
		ed.FreeBytes = &free
		ed.TotalBytes = &total
	}
	AddConnectedNetworkShare(ed)

	return &ConnectShareResult{
		Status:  "connected",
		Path:    targetPath,
		Message: fmt.Sprintf("Successfully connected to %s (%d items)", targetPath, len(entries)),
	}, nil
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
				Drives:             GetSystemDrives(),
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
				Drives:             GetSystemDrives(),
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
		Drives:             GetSystemDrives(),
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
