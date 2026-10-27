package launcher

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
)

var (
	ErrISONotFound       = errors.New("ISO file not found")
	ErrMountPointNotFound = errors.New("mount point not found")
	ErrMountFailed       = errors.New("failed to mount ISO image")
	ErrUnmountFailed     = errors.New("failed to unmount ISO image")
)

// ISOMountResult captures the filesystem path and target executable of a mounted image.
type ISOMountResult struct {
	ISOPath       string `json:"iso_path"`
	MountPoint    string `json:"mount_point"`
	TargetExePath string `json:"target_exe_path,omitempty"`
	MountedByOtix bool   `json:"mounted_by_otix"`
}

// ISOMounter defines the abstraction for mounting and dismounting disc images across platforms.
type ISOMounter interface {
	Mount(ctx context.Context, isoPath string) (*ISOMountResult, error)
	Unmount(ctx context.Context, mountPoint string) error
}

// CmdExecutor defines a function signature for executing external system commands.
type CmdExecutor func(ctx context.Context, name string, args ...string) ([]byte, error)

// defaultCmdExecutor executes commands using standard os/exec.
func defaultCmdExecutor(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	return cmd.CombinedOutput()
}

// MacOSISOMounter mounts disk images on macOS using the native hdiutil utility.
type MacOSISOMounter struct {
	executor CmdExecutor
}

// NewMacOSISOMounter creates a macOS disk image mounter.
func NewMacOSISOMounter(executor ...CmdExecutor) *MacOSISOMounter {
	execFn := defaultCmdExecutor
	if len(executor) > 0 && executor[0] != nil {
		execFn = executor[0]
	}
	return &MacOSISOMounter{executor: execFn}
}

// Mount attaches the ISO using hdiutil attach and locates any installer or game executable.
func (m *MacOSISOMounter) Mount(ctx context.Context, isoPath string) (*ISOMountResult, error) {
	if _, err := os.Stat(isoPath); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrISONotFound, isoPath)
	}

	out, err := m.executor(ctx, "hdiutil", "attach", isoPath, "-nobrowse")
	if err != nil {
		return nil, fmt.Errorf("%w: %s: %s", ErrMountFailed, err.Error(), string(out))
	}

	mountPoint, err := ParseHdiutilMountOutput(string(out))
	if err != nil {
		return nil, err
	}

	targetExe, _ := FindInstallerOrExecutable(mountPoint)

	return &ISOMountResult{
		ISOPath:       isoPath,
		MountPoint:    mountPoint,
		TargetExePath: targetExe,
		MountedByOtix: true,
	}, nil
}

// Unmount detaches the volume using hdiutil detach.
func (m *MacOSISOMounter) Unmount(ctx context.Context, mountPoint string) error {
	out, err := m.executor(ctx, "hdiutil", "detach", mountPoint, "-force")
	if err != nil {
		return fmt.Errorf("%w: %s: %s", ErrUnmountFailed, err.Error(), string(out))
	}
	return nil
}

// ParseHdiutilMountOutput parses stdout from hdiutil attach to extract the /Volumes/... mount point.
func ParseHdiutilMountOutput(output string) (string, error) {
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if idx := strings.Index(line, "/Volumes/"); idx != -1 {
			volPath := strings.TrimSpace(line[idx:])
			return volPath, nil
		}
	}
	return "", fmt.Errorf("%w: no /Volumes mount point identified in output: %q", ErrMountFailed, output)
}

// WindowsISOMounter mounts ISO images on Windows using PowerShell Mount-DiskImage.
type WindowsISOMounter struct {
	executor CmdExecutor
}

// NewWindowsISOMounter creates a Windows ISO mounter.
func NewWindowsISOMounter(executor ...CmdExecutor) *WindowsISOMounter {
	execFn := defaultCmdExecutor
	if len(executor) > 0 && executor[0] != nil {
		execFn = executor[0]
	}
	return &WindowsISOMounter{executor: execFn}
}

// Mount mounts the ISO via PowerShell Mount-DiskImage and retrieves the drive letter.
func (m *WindowsISOMounter) Mount(ctx context.Context, isoPath string) (*ISOMountResult, error) {
	if _, err := os.Stat(isoPath); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrISONotFound, isoPath)
	}

	// Escape single quotes for PowerShell
	escapedPath := strings.ReplaceAll(isoPath, "'", "''")
	psCmd := fmt.Sprintf(`Mount-DiskImage -ImagePath '%s' -PassThru | Get-Volume | Select-Object -ExpandProperty DriveLetter`, escapedPath)

	out, err := m.executor(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", psCmd)
	if err != nil {
		return nil, fmt.Errorf("%w: %s: %s", ErrMountFailed, err.Error(), string(out))
	}

	mountPoint, err := ParsePowerShellMountOutput(string(out))
	if err != nil {
		return nil, err
	}

	targetExe, _ := FindInstallerOrExecutable(mountPoint)

	return &ISOMountResult{
		ISOPath:       isoPath,
		MountPoint:    mountPoint,
		TargetExePath: targetExe,
		MountedByOtix: true,
	}, nil
}

// Unmount dismounts the ISO image via PowerShell.
func (m *WindowsISOMounter) Unmount(ctx context.Context, mountPoint string) error {
	driveLetter := strings.TrimSuffix(strings.TrimSuffix(mountPoint, `\`), ":")
	psCmd := fmt.Sprintf(`Get-Volume -DriveLetter '%s' -ErrorAction SilentlyContinue | Get-DiskImage | Dismount-DiskImage`, driveLetter)

	out, err := m.executor(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", psCmd)
	if err != nil {
		return fmt.Errorf("%w: %s: %s", ErrUnmountFailed, err.Error(), string(out))
	}
	return nil
}

// ParsePowerShellMountOutput extracts the drive letter from PowerShell output and returns "X:\".
func ParsePowerShellMountOutput(output string) (string, error) {
	lines := strings.Split(output, "\n")
	letterRegex := regexp.MustCompile(`^[A-Za-z]$`)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if letterRegex.MatchString(trimmed) {
			return strings.ToUpper(trimmed) + `:\`, nil
		}
	}
	return "", fmt.Errorf("%w: no drive letter extracted from PowerShell output: %q", ErrMountFailed, output)
}

// MockISOMounter provides an in-memory mounter for deterministic testing across platforms.
type MockISOMounter struct {
	mu            sync.RWMutex
	mounted       map[string]*ISOMountResult // mountPoint -> result
	customTarget  string
	simulateError error
}

// NewMockISOMounter initializes a mock ISO mounter.
func NewMockISOMounter() *MockISOMounter {
	return &MockISOMounter{
		mounted: make(map[string]*ISOMountResult),
	}
}

// SetCustomTarget sets a predefined target executable for mocked mounts.
func (m *MockISOMounter) SetCustomTarget(target string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.customTarget = target
}

// SetSimulateError configures an error to return on subsequent operations.
func (m *MockISOMounter) SetSimulateError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.simulateError = err
}

// Mount simulates mounting an ISO, creating a mock mount directory with a setup executable.
func (m *MockISOMounter) Mount(ctx context.Context, isoPath string) (*ISOMountResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.simulateError != nil {
		return nil, m.simulateError
	}

	baseName := strings.TrimSuffix(filepath.Base(isoPath), filepath.Ext(isoPath))
	var mountPoint string
	if runtime.GOOS == "windows" {
		mountPoint = "E:\\"
	} else {
		mountPoint = "/Volumes/" + baseName
	}

	targetExe := m.customTarget
	if targetExe == "" {
		if runtime.GOOS == "windows" {
			targetExe = filepath.Join(mountPoint, "setup.exe")
		} else {
			targetExe = filepath.Join(mountPoint, baseName+".app")
		}
	}

	res := &ISOMountResult{
		ISOPath:       isoPath,
		MountPoint:    mountPoint,
		TargetExePath: targetExe,
		MountedByOtix: true,
	}

	m.mounted[mountPoint] = res
	return res, nil
}

// Unmount removes the mock mount point from active mounts.
func (m *MockISOMounter) Unmount(ctx context.Context, mountPoint string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.simulateError != nil {
		return m.simulateError
	}

	if _, exists := m.mounted[mountPoint]; !exists {
		return fmt.Errorf("%w: %s", ErrMountPointNotFound, mountPoint)
	}

	delete(m.mounted, mountPoint)
	return nil
}

// MountedCount returns the number of simulated active mounts.
func (m *MockISOMounter) MountedCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.mounted)
}

// NewPlatformISOMounter returns the appropriate native mounter for current OS, or fallback.
func NewPlatformISOMounter() ISOMounter {
	switch runtime.GOOS {
	case "windows":
		return NewWindowsISOMounter()
	case "darwin":
		return NewMacOSISOMounter()
	default:
		return NewMockISOMounter()
	}
}

// FindInstallerOrExecutable scans a directory or volume root for setup executables or games.
func FindInstallerOrExecutable(mountPoint string) (string, error) {
	if _, err := os.Stat(mountPoint); err != nil {
		return "", err
	}

	var candidates []string
	var apps []string

	prioritySet := map[string]int{
		"setup.exe":     10,
		"install.exe":   9,
		"installer.exe": 8,
		"autorun.exe":   7,
		"game.exe":      6,
		"launch.exe":    5,
		"start.exe":     4,
	}

	// Walk top-level and 1 subdirectory level
	err := filepath.Walk(mountPoint, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		rel, _ := filepath.Rel(mountPoint, path)
		depth := strings.Count(rel, string(filepath.Separator))
		if depth > 2 {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		nameLower := strings.ToLower(info.Name())

		// Check for macOS .app bundle
		if info.IsDir() && strings.HasSuffix(nameLower, ".app") {
			apps = append(apps, path)
			return filepath.SkipDir
		}

		if !info.IsDir() {
			if strings.HasSuffix(nameLower, ".exe") {
				candidates = append(candidates, path)
			}
		}

		return nil
	})

	if err != nil && len(candidates) == 0 && len(apps) == 0 {
		return "", err
	}

	// 1. If macOS .app bundles found, return first
	if len(apps) > 0 {
		return apps[0], nil
	}

	// 2. Score candidate executables
	var bestMatch string
	highestScore := -1

	for _, cand := range candidates {
		base := strings.ToLower(filepath.Base(cand))
		score := 1

		if s, ok := prioritySet[base]; ok {
			score = s
		} else if strings.Contains(base, "setup") || strings.Contains(base, "install") {
			score = 8
		} else if isNoiseExecutable(base) {
			score = 0
		}

		if score > highestScore {
			highestScore = score
			bestMatch = cand
		}
	}

	if highestScore > 0 && bestMatch != "" {
		return bestMatch, nil
	}

	if len(candidates) > 0 {
		return candidates[0], nil
	}

	return "", errors.New("no suitable executable found in mount point")
}

func isNoiseExecutable(name string) bool {
	noise := []string{"unins", "uninstall", "directx", "dxsetup", "vcredist", "crashreporter", "bugreport"}
	for _, n := range noise {
		if strings.Contains(name, n) {
			return true
		}
	}
	return false
}

// Ensure bytes buffer unused warning avoided
var _ = bytes.NewBuffer
