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
					// Skip symlink pointing back to root filesystem
					if target, err := filepath.EvalSymlinks(volPath); err == nil && target == "/" {
						continue
					}
					isNet := isMacNetworkMount(volPath, entry.Name())
					ed := ExplorerDrive{
						Name:      entry.Name(),
						Path:      volPath,
						IsNetwork: isNet,
					}
					if free, total, err := GetDiskUsage(volPath); err == nil {
						ed.FreeBytes = &free
						ed.TotalBytes = &total
					}
					drives = append(drives, ed)
				}
			}
		}

		// Also detect any direct network mounts outside /Volumes (e.g. /Games)
		if out, err := exec.Command("mount").Output(); err == nil {
			lines := strings.Split(string(out), "\n")
			for _, line := range lines {
				lowerLine := strings.ToLower(line)
				if (strings.Contains(lowerLine, "smbfs") ||
					strings.Contains(lowerLine, "nfs") ||
					strings.Contains(lowerLine, "cifs")) && strings.Contains(line, " on ") {
					parts := strings.Split(line, " on ")
					if len(parts) >= 2 {
						mountRight := parts[1]
						idx := strings.Index(mountRight, " (")
						if idx != -1 {
							mPath := strings.TrimSpace(mountRight[:idx])
							if !strings.HasPrefix(mPath, "/Volumes") && mPath != "/" && !strings.HasPrefix(mPath, "/System") && dirExists(mPath) {
								alreadyIn := false
								for _, d := range drives {
									if strings.EqualFold(d.Path, mPath) {
										alreadyIn = true
										break
									}
								}
								if !alreadyIn {
									ed := ExplorerDrive{
										Name:      filepath.Base(mPath),
										Path:      mPath,
										IsNetwork: true,
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

		// Also detect any direct network mounts outside /Volumes (e.g. /Games)
		if out, err := exec.Command("mount").Output(); err == nil {
			lines := strings.Split(string(out), "\n")
			for _, line := range lines {
				lowerLine := strings.ToLower(line)
				if (strings.Contains(lowerLine, "smbfs") ||
					strings.Contains(lowerLine, "nfs") ||
					strings.Contains(lowerLine, "cifs")) && strings.Contains(line, " on ") {
					parts := strings.Split(line, " on ")
					if len(parts) >= 2 {
						mountRight := parts[1]
						idx := strings.Index(mountRight, " (")
						if idx != -1 {
							mPath := strings.TrimSpace(mountRight[:idx])
							if !strings.HasPrefix(mPath, "/Volumes") && mPath != "/" && !strings.HasPrefix(mPath, "/System") && dirExists(mPath) {
								alreadyIn := false
								for _, d := range drives {
									if strings.EqualFold(d.Path, mPath) {
										alreadyIn = true
										break
									}
								}
								if !alreadyIn {
									ed := ExplorerDrive{
										Name:      filepath.Base(mPath),
										Path:      mPath,
										IsNetwork: true,
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

func isMacNetworkMount(volPath, name string) bool {
	for _, ns := range GetConnectedNetworkShares() {
		if strings.EqualFold(ns.Path, volPath) || strings.EqualFold(ns.Name, name) {
			return true
		}
	}
	cmd := exec.Command("mount")
	if out, err := cmd.Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			if strings.Contains(line, " on "+volPath+" ") || strings.Contains(line, " on "+volPath+"(") {
				lower := strings.ToLower(line)
				if strings.Contains(lower, "smbfs") ||
					strings.Contains(lower, "nfs") ||
					strings.Contains(lower, "cifs") ||
					strings.Contains(lower, "afp") {
					return true
				}
			}
		}
	}
	return false
}

func findMacMountPoint(shareName string) string {
	volPath := filepath.Join("/Volumes", shareName)
	if dirExists(volPath) {
		return volPath
	}

	// Try case-insensitive or suffixed matches in /Volumes (e.g. "Games-1", "Games 1")
	if entries, err := os.ReadDir("/Volumes"); err == nil {
		lowerShare := strings.ToLower(shareName)
		for _, e := range entries {
			if strings.EqualFold(e.Name(), shareName) {
				return filepath.Join("/Volumes", e.Name())
			}
		}
		for _, e := range entries {
			lowerName := strings.ToLower(e.Name())
			if strings.HasPrefix(lowerName, lowerShare+"-") || strings.HasPrefix(lowerName, lowerShare+" ") {
				return filepath.Join("/Volumes", e.Name())
			}
		}
	}

	// Check if mounted directly at root level (e.g. /Games)
	rootPath := filepath.Join("/", shareName)
	if dirExists(rootPath) {
		return rootPath
	}

	// Inspect `mount` command output for any network filesystem mount (e.g. /Games or /Volumes/Games)
	cmd := exec.Command("mount")
	if out, err := cmd.Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		lowerShare := strings.ToLower(shareName)
		for _, line := range lines {
			lowerLine := strings.ToLower(line)
			if (strings.Contains(lowerLine, "smbfs") ||
				strings.Contains(lowerLine, "nfs") ||
				strings.Contains(lowerLine, "cifs") ||
				strings.Contains(lowerLine, "afp")) && strings.Contains(line, " on ") {
				parts := strings.Split(line, " on ")
				if len(parts) >= 2 {
					mountRight := parts[1]
					idx := strings.Index(mountRight, " (")
					if idx != -1 {
						mPath := strings.TrimSpace(mountRight[:idx])
						if strings.EqualFold(filepath.Base(mPath), shareName) ||
							strings.Contains(strings.ToLower(parts[0]), "/"+lowerShare) ||
							strings.Contains(strings.ToLower(mPath), "/"+lowerShare) {
							if dirExists(mPath) {
								return mPath
							}
						}
					}
				}
			}
		}
	}

	return volPath
}

func escapeAppleScript(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	return s
}

type parsedShareTarget struct {
	Host          string
	ShareName     string
	SubPath       string
	Username      string
	Password      string
	Workgroup     string
	IsLocalDir    bool
	IsLocalVolume bool
	LocalPath     string
}

func parseShareTarget(raw string, req ConnectShareRequest) parsedShareTarget {
	cleaned := strings.TrimSpace(raw)
	res := parsedShareTarget{
		Username:  strings.TrimSpace(req.Username),
		Password:  req.Password,
		Workgroup: strings.TrimSpace(req.Workgroup),
	}

	if cleaned == "" {
		if req.ShareName != "" {
			res.ShareName = strings.TrimSpace(req.ShareName)
		}
		return res
	}

	// 1. Existing local directory (e.g. temp directories used in tests or local drives)
	if filepath.IsAbs(cleaned) && dirExists(cleaned) && !strings.HasPrefix(cleaned, "/Volumes") {
		res.IsLocalDir = true
		res.LocalPath = filepath.Clean(cleaned)
		res.ShareName = filepath.Base(res.LocalPath)
		return res
	}

	// 2. Direct /Volumes/ path on macOS
	if strings.HasPrefix(cleaned, "/Volumes") {
		res.IsLocalVolume = true
		res.LocalPath = filepath.Clean(cleaned)
		trimmed := strings.TrimPrefix(cleaned, "/Volumes")
		trimmed = strings.TrimPrefix(trimmed, "/")
		parts := strings.Split(trimmed, "/")
		if len(parts) > 0 && parts[0] != "" {
			res.ShareName = parts[0]
		}
		if len(parts) > 1 {
			res.SubPath = filepath.Join(parts[1:]...)
		}
		return res
	}

	// 3. smb:// or cifs:// URLs
	lower := strings.ToLower(cleaned)
	rest := cleaned
	if strings.HasPrefix(lower, "smb://") {
		rest = cleaned[6:]
	} else if strings.HasPrefix(lower, "cifs://") {
		rest = cleaned[7:]
	}

	// 4. Extract credentials if present: [domain;][user[:password]@]host/share
	if strings.Contains(rest, "@") {
		atIdx := strings.LastIndex(rest, "@")
		credPart := rest[:atIdx]
		rest = rest[atIdx+1:]

		if strings.Contains(credPart, ";") {
			scIdx := strings.Index(credPart, ";")
			if res.Workgroup == "" {
				res.Workgroup = credPart[:scIdx]
			}
			credPart = credPart[scIdx+1:]
		}
		if strings.Contains(credPart, ":") {
			cIdx := strings.Index(credPart, ":")
			if res.Username == "" {
				res.Username = credPart[:cIdx]
			}
			if res.Password == "" {
				res.Password = credPart[cIdx+1:]
			}
		} else {
			if res.Username == "" {
				res.Username = credPart
			}
		}
	}

	// 5. Normalize slashes: convert \ to /
	norm := strings.ReplaceAll(rest, "\\", "/")
	norm = strings.Trim(norm, "/")

	parts := strings.Split(norm, "/")
	if len(parts) > 0 && parts[0] != "" {
		res.Host = parts[0]
	}
	if len(parts) > 1 && parts[1] != "" {
		res.ShareName = parts[1]
		if len(parts) > 2 {
			res.SubPath = strings.Join(parts[2:], "/")
		}
	} else if req.ShareName != "" {
		res.ShareName = strings.TrimSpace(req.ShareName)
	}

	return res
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
		if strings.HasPrefix(lower, "cifs://") {
			trimmed = cleaned[7:]
		}
		trimmed = strings.TrimPrefix(trimmed, "/")
		if runtime.GOOS == "windows" {
			unc := "\\\\" + strings.ReplaceAll(trimmed, "/", "\\")
			return filepath.Clean(unc), nil
		}
		// Split away credentials if any
		if strings.Contains(trimmed, "@") {
			trimmed = trimmed[strings.LastIndex(trimmed, "@")+1:]
		}
		parts := strings.Split(trimmed, "/")
		if len(parts) >= 2 {
			shareName := parts[1]
			if runtime.GOOS == "darwin" {
				mountPoint := findMacMountPoint(shareName)
				sub := mountPoint
				if len(parts) > 2 {
					sub = filepath.Join(sub, filepath.Join(parts[2:]...))
				}
				return filepath.Clean(sub), nil
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
		if runtime.GOOS == "darwin" {
			norm := strings.ReplaceAll(cleaned, "\\", "/")
			stripped := strings.TrimLeft(norm, "/")
			parts := strings.Split(stripped, "/")
			if len(parts) >= 2 && parts[0] != "" {
				shareName := parts[1]
				mountPoint := findMacMountPoint(shareName)
				sub := mountPoint
				if len(parts) > 2 {
					sub = filepath.Join(sub, filepath.Join(parts[2:]...))
				}
				return filepath.Clean(sub), nil
			}
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

	parsed := parseShareTarget(raw, req)

	if runtime.GOOS == "darwin" {
		return connectShareDarwin(parsed, req)
	} else if runtime.GOOS == "windows" {
		return connectShareWindows(parsed, req, raw)
	}
	return connectShareGeneric(parsed, req, raw)
}

func connectShareDarwin(parsed parsedShareTarget, req ConnectShareRequest) (*ConnectShareResult, error) {
	if parsed.IsLocalDir {
		if _, statErr := os.Stat(parsed.LocalPath); statErr != nil {
			return nil, fmt.Errorf("local directory does not exist: %s (%w)", parsed.LocalPath, statErr)
		}
		entries, _ := os.ReadDir(parsed.LocalPath)
		ed := ExplorerDrive{
			Name:      filepath.Base(parsed.LocalPath),
			Path:      parsed.LocalPath,
			IsNetwork: true,
		}
		if free, total, err := GetDiskUsage(parsed.LocalPath); err == nil {
			ed.FreeBytes = &free
			ed.TotalBytes = &total
		}
		AddConnectedNetworkShare(ed)
		return &ConnectShareResult{
			Status:  "connected",
			Path:    parsed.LocalPath,
			Message: fmt.Sprintf("Successfully connected to %s (%d items)", parsed.LocalPath, len(entries)),
		}, nil
	}

	shareName := parsed.ShareName
	if shareName == "" && parsed.IsLocalVolume {
		shareName = filepath.Base(parsed.LocalPath)
	}
	if shareName == "" {
		return nil, fmt.Errorf("network share name is required")
	}

	mountPoint := findMacMountPoint(shareName)
	isMounted := false
	if dirExists(mountPoint) {
		if _, err := os.ReadDir(mountPoint); err == nil {
			isMounted = true
		}
	}
	if !isMounted && parsed.IsLocalVolume && dirExists(parsed.LocalPath) {
		isMounted = true
		mountPoint = parsed.LocalPath
	}

	if !isMounted {
		if parsed.Host == "" {
			return nil, fmt.Errorf("server host is required to connect to share %s (or mount directly in /Volumes/%s)", shareName, shareName)
		}

		smbURL := fmt.Sprintf("smb://%s/%s", parsed.Host, shareName)
		var authClause string
		if parsed.Username != "" {
			userArg := parsed.Username
			if parsed.Workgroup != "" && !strings.Contains(userArg, ";") && !strings.Contains(userArg, "\\") {
				userArg = parsed.Workgroup + ";" + userArg
			}
			if parsed.Password != "" {
				authClause = fmt.Sprintf("as user name %q with password %q", escapeAppleScript(userArg), escapeAppleScript(parsed.Password))
			} else {
				authClause = fmt.Sprintf("as user name %q", escapeAppleScript(userArg))
			}
		}

		script := fmt.Sprintf("with timeout of 15 seconds\nmount volume %q %s\nend timeout", smbURL, authClause)
		cmd := exec.Command("osascript", "-e", script)
		out, err := cmd.CombinedOutput()
		if err != nil {
			mountPoint = findMacMountPoint(shareName)
			if !dirExists(mountPoint) {
				cleanOut := strings.TrimSpace(string(out))
				if cleanOut != "" {
					return nil, fmt.Errorf("failed to connect to network share on macOS: %s", cleanOut)
				}
				return nil, fmt.Errorf("failed to mount %s on macOS: %w", smbURL, err)
			}
		}

		mountPoint = findMacMountPoint(shareName)
	}

	targetPath := mountPoint
	if parsed.SubPath != "" {
		targetPath = filepath.Join(mountPoint, parsed.SubPath)
	}

	entries, err := os.ReadDir(targetPath)
	if err != nil {
		if _, statErr := os.Stat(targetPath); statErr != nil {
			return nil, fmt.Errorf("could not access network share %s: %w", targetPath, err)
		}
	}

	ed := ExplorerDrive{
		Name:      shareName,
		Path:      mountPoint,
		IsNetwork: true,
	}
	if free, total, err := GetDiskUsage(mountPoint); err == nil {
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

func connectShareWindows(parsed parsedShareTarget, req ConnectShareRequest, raw string) (*ConnectShareResult, error) {
	// Normalization for Windows UNC share connection
	lower := strings.ToLower(raw)
	if strings.HasPrefix(lower, "smb://") {
		raw = raw[6:]
	} else if strings.HasPrefix(lower, "cifs://") {
		raw = raw[7:]
	}
	raw = strings.TrimSpace(raw)

	if len(raw) < 2 || raw[1] != ':' {
		norm := strings.ReplaceAll(raw, "/", "\\")
		stripped := strings.TrimLeft(norm, "\\")
		raw = `\\` + stripped
	}

	targetPath, err := SanitizeAndResolvePath(raw, "")
	if err != nil {
		return nil, fmt.Errorf("invalid network share path: %w", err)
	}

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

	entries, err := os.ReadDir(targetPath)
	if err != nil {
		if _, statErr := os.Stat(targetPath); statErr != nil {
			return nil, fmt.Errorf("could not access network share %s: %w", targetPath, err)
		}
	}

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

func connectShareGeneric(parsed parsedShareTarget, req ConnectShareRequest, raw string) (*ConnectShareResult, error) {
	targetPath, err := SanitizeAndResolvePath(raw, "")
	if err != nil {
		return nil, fmt.Errorf("invalid network share path: %w", err)
	}

	entries, err := os.ReadDir(targetPath)
	if err != nil {
		if _, statErr := os.Stat(targetPath); statErr != nil {
			return nil, fmt.Errorf("could not access network share %s: %w", targetPath, err)
		}
	}

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
