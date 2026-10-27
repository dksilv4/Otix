package launcher

import (
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
	ErrExecutableRequired = errors.New("executable path is required")
	ErrProcessLaunchFailed = errors.New("failed to launch process")
)

// LaunchRequest specifies options for starting a game executable or installer.
type LaunchRequest struct {
	GameID           string            `json:"game_id"`
	Title            string            `json:"title"`
	ExecutablePath   string            `json:"executable_path"`
	WorkingDirectory string            `json:"working_directory,omitempty"`
	Arguments        []string          `json:"arguments,omitempty"`
	Environment      map[string]string `json:"environment,omitempty"`
	IsInstaller      bool              `json:"is_installer,omitempty"`
}

// Launcher coordinates launching games, emulators, mounting ISOs, and tracking sessions.
type Launcher interface {
	LaunchExecutable(ctx context.Context, req LaunchRequest) (*ProcessSession, error)
	LaunchEmulator(ctx context.Context, req EmulatorLaunchRequest) (*ProcessSession, error)
	MountISO(ctx context.Context, isoPath string) (*ISOMountResult, error)
	UnmountISO(ctx context.Context, mountPoint string) error
	GetSession(sessionID string) (*ProcessSession, bool)
	ActiveSessions() []*ProcessSession
	StopSession(sessionID string) error
}

// ProcessHandle models a running process that can be waited on or terminated.
type ProcessHandle interface {
	PID() int
	Wait() (int, error) // Returns exitCode, error
	Kill() error
}

// CommandRunner abstracts process creation to enable deterministic cross-platform unit testing.
type CommandRunner interface {
	Run(ctx context.Context, execPath string, args []string, dir string, env []string) (ProcessHandle, error)
}

// osProcessHandle wraps standard os/exec.Cmd.
type osProcessHandle struct {
	cmd *exec.Cmd
}

func (h *osProcessHandle) PID() int {
	if h.cmd.Process != nil {
		return h.cmd.Process.Pid
	}
	return 0
}

func (h *osProcessHandle) Wait() (int, error) {
	err := h.cmd.Wait()
	if err == nil {
		return 0, nil
	}
	if exitErr, ok := err.(*exec.ExitError); ok {
		return exitErr.ExitCode(), exitErr
	}
	return -1, err
}

func (h *osProcessHandle) Kill() error {
	if h.cmd.Process != nil {
		return h.cmd.Process.Kill()
	}
	return nil
}

// OSCommandRunner launches real OS processes using os/exec.
type OSCommandRunner struct{}

func (r *OSCommandRunner) Run(ctx context.Context, execPath string, args []string, dir string, env []string) (ProcessHandle, error) {
	resolved := execPath

	// Resolve macOS .app bundle if necessary
	if strings.HasSuffix(strings.ToLower(execPath), ".app") || strings.HasSuffix(strings.ToLower(execPath), ".app/") {
		if bin, err := ResolveMacAppExecutable(execPath); err == nil && bin != "" {
			resolved = bin
		}
	}

	cmd := exec.CommandContext(ctx, resolved, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	if len(env) > 0 {
		cmd.Env = env
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("%w: %s: %w", ErrProcessLaunchFailed, execPath, err)
	}

	return &osProcessHandle{cmd: cmd}, nil
}

// DefaultLauncher is the primary implementation of Launcher.
type DefaultLauncher struct {
	mu               sync.Mutex
	tracker          *SessionTracker
	emulatorRegistry *EmulatorRegistry
	isoMounter       ISOMounter
	cmdRunner        CommandRunner
	activeProcesses  map[string]ProcessHandle // sessionID -> ProcessHandle
}

// LauncherOption configures optional DefaultLauncher parameters.
type LauncherOption func(l *DefaultLauncher)

// WithTracker configures a custom session tracker.
func WithTracker(st *SessionTracker) LauncherOption {
	return func(l *DefaultLauncher) {
		l.tracker = st
	}
}

// WithEmulatorRegistry configures an emulator registry.
func WithEmulatorRegistry(reg *EmulatorRegistry) LauncherOption {
	return func(l *DefaultLauncher) {
		l.emulatorRegistry = reg
	}
}

// WithISOMounter configures an ISO mounter.
func WithISOMounter(m ISOMounter) LauncherOption {
	return func(l *DefaultLauncher) {
		l.isoMounter = m
	}
}

// WithCommandRunner configures the command runner (e.g. mock or OS).
func WithCommandRunner(runner CommandRunner) LauncherOption {
	return func(l *DefaultLauncher) {
		l.cmdRunner = runner
	}
}

// NewLauncher creates a configured DefaultLauncher.
func NewLauncher(opts ...LauncherOption) *DefaultLauncher {
	l := &DefaultLauncher{
		tracker:          NewSessionTracker(nil),
		emulatorRegistry: NewEmulatorRegistry(),
		isoMounter:       NewPlatformISOMounter(),
		cmdRunner:        &OSCommandRunner{},
		activeProcesses:  make(map[string]ProcessHandle),
	}

	for _, opt := range opts {
		opt(l)
	}

	return l
}

// LaunchExecutable executes an arbitrary executable (Windows .exe or macOS binary/.app).
func (l *DefaultLauncher) LaunchExecutable(ctx context.Context, req LaunchRequest) (*ProcessSession, error) {
	if strings.TrimSpace(req.ExecutablePath) == "" {
		return nil, ErrExecutableRequired
	}

	cleanExe := filepath.Clean(req.ExecutablePath)
	resolvedExe := cleanExe

	// If macOS .app bundle, resolve binary inside Contents/MacOS
	if strings.HasSuffix(strings.ToLower(cleanExe), ".app") || strings.HasSuffix(strings.ToLower(cleanExe), ".app/") {
		if bin, err := ResolveMacAppExecutable(cleanExe); err == nil && bin != "" {
			resolvedExe = bin
		}
	}

	// Default working directory to executable directory if not specified
	workDir := req.WorkingDirectory
	if strings.TrimSpace(workDir) == "" {
		workDir = filepath.Dir(cleanExe)
	}

	// Prepare environment variables: start with host environ, then apply overrides
	var envList []string
	if len(req.Environment) > 0 {
		envMap := make(map[string]string)
		for _, e := range os.Environ() {
			parts := strings.SplitN(e, "=", 2)
			if len(parts) == 2 {
				envMap[parts[0]] = parts[1]
			}
		}
		for k, v := range req.Environment {
			envMap[k] = v
		}
		envList = make([]string, 0, len(envMap))
		for k, v := range envMap {
			envList = append(envList, fmt.Sprintf("%s=%s", k, v))
		}
	} else {
		envList = os.Environ()
	}

	// Derive default game title and ID if missing
	title := req.Title
	if strings.TrimSpace(title) == "" {
		base := filepath.Base(cleanExe)
		title = strings.TrimSuffix(base, filepath.Ext(base))
	}

	gameID := req.GameID
	if strings.TrimSpace(gameID) == "" {
		gameID = title
	}

	// Start process
	proc, err := l.cmdRunner.Run(ctx, resolvedExe, req.Arguments, workDir, envList)
	if err != nil {
		return nil, err
	}

	// Record active session
	session := l.tracker.StartSession(gameID, title, req.ExecutablePath, proc.PID())

	l.mu.Lock()
	l.activeProcesses[session.ID] = proc
	l.mu.Unlock()

	// Asynchronously trap exit code and duration upon termination
	go func(sessID string, handle ProcessHandle) {
		exitCode, waitErr := handle.Wait()
		var errMsg string
		if waitErr != nil {
			errMsg = waitErr.Error()
		}

		l.mu.Lock()
		delete(l.activeProcesses, sessID)
		l.mu.Unlock()

		_, _ = l.tracker.EndSession(sessID, exitCode, errMsg)
	}(session.ID, proc)

	return session, nil
}

// LaunchEmulator constructs emulator arguments and spawns the emulator process.
func (l *DefaultLauncher) LaunchEmulator(ctx context.Context, req EmulatorLaunchRequest) (*ProcessSession, error) {
	var profile EmulatorProfile
	var found bool

	if strings.TrimSpace(req.EmulatorID) != "" {
		profile, found = l.emulatorRegistry.Get(req.EmulatorID)
	} else if strings.TrimSpace(req.Platform) != "" {
		profile, found = l.emulatorRegistry.FindForPlatform(req.Platform)
	} else {
		profile, found = l.emulatorRegistry.FindForROM(req.ROMPath)
	}

	if !found {
		return nil, fmt.Errorf("%w: %s", ErrEmulatorNotFound, req.EmulatorID)
	}

	inv, err := BuildEmulatorInvocation(profile, req)
	if err != nil {
		return nil, err
	}

	romBase := filepath.Base(req.ROMPath)
	romTitle := strings.TrimSuffix(romBase, filepath.Ext(romBase))
	gameID := fmt.Sprintf("%s:%s", profile.ID, romTitle)

	launchReq := LaunchRequest{
		GameID:           gameID,
		Title:            romTitle,
		ExecutablePath:   inv.Executable,
		WorkingDirectory: inv.WorkingDir,
		Arguments:        inv.Args,
		IsInstaller:      false,
	}

	return l.LaunchExecutable(ctx, launchReq)
}

// MountISO mounts the specified disc image file.
func (l *DefaultLauncher) MountISO(ctx context.Context, isoPath string) (*ISOMountResult, error) {
	return l.isoMounter.Mount(ctx, isoPath)
}

// UnmountISO unmounts the disc image at the given mount point.
func (l *DefaultLauncher) UnmountISO(ctx context.Context, mountPoint string) error {
	return l.isoMounter.Unmount(ctx, mountPoint)
}

// GetSession returns a session by ID.
func (l *DefaultLauncher) GetSession(sessionID string) (*ProcessSession, bool) {
	return l.tracker.GetSession(sessionID)
}

// ActiveSessions returns all currently active sessions.
func (l *DefaultLauncher) ActiveSessions() []*ProcessSession {
	return l.tracker.ActiveSessions()
}

// StopSession forcefully terminates a running session.
func (l *DefaultLauncher) StopSession(sessionID string) error {
	l.mu.Lock()
	proc, exists := l.activeProcesses[sessionID]
	l.mu.Unlock()

	if !exists {
		// Verify if session exists in tracker
		sess, found := l.tracker.GetSession(sessionID)
		if !found {
			return ErrSessionNotFound
		}
		if !sess.IsActive() {
			return ErrSessionEnded
		}

		// Attempt killing via OS PID if handle was detached
		if sess.PID > 0 {
			if p, err := os.FindProcess(sess.PID); err == nil {
				_ = p.Kill()
			}
		}
		_, err := l.tracker.EndSession(sessionID, -1, "terminated by user")
		return err
	}

	// Kill through process handle
	_ = proc.Kill()

	_, err := l.tracker.EndSession(sessionID, -1, "terminated by user")
	return err
}

// ResolveMacAppExecutable scans a .app bundle to find its main binary in Contents/MacOS.
func ResolveMacAppExecutable(appPath string) (string, error) {
	macOSDir := filepath.Join(appPath, "Contents", "MacOS")
	if fi, err := os.Stat(macOSDir); err != nil || !fi.IsDir() {
		return "", fmt.Errorf("Contents/MacOS directory not found in %s", appPath)
	}

	// Try reading CFBundleExecutable from Info.plist
	infoPlist := filepath.Join(appPath, "Contents", "Info.plist")
	if data, err := os.ReadFile(infoPlist); err == nil {
		re := regexp.MustCompile(`<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>`)
		matches := re.FindSubmatch(data)
		if len(matches) > 1 {
			candidate := filepath.Join(macOSDir, string(matches[1]))
			if _, err := os.Stat(candidate); err == nil {
				return candidate, nil
			}
		}
	}

	// Fallback: search directory for first executable file
	entries, err := os.ReadDir(macOSDir)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			return filepath.Join(macOSDir, entry.Name()), nil
		}
	}

	return "", fmt.Errorf("no executable found in %s", macOSDir)
}

// MockCommandRunner enables tests to simulate process launches and exit codes.
type MockCommandRunner struct {
	mu           sync.Mutex
	Launches     []MockLaunchRecord
	NextPID      int
	NextExitCode int
	NextWaitErr  error
	SimulateErr  error
	waitCh       chan struct{}
}

// MockLaunchRecord records arguments of a mock Run call.
type MockLaunchRecord struct {
	ExecPath string
	Args     []string
	Dir      string
	Env      []string
}

// NewMockCommandRunner creates an instance of MockCommandRunner.
func NewMockCommandRunner() *MockCommandRunner {
	return &MockCommandRunner{
		NextPID: 1000,
		waitCh:  make(chan struct{}),
	}
}

type mockProcessHandle struct {
	pid      int
	exitCode int
	waitErr  error
	waitCh   chan struct{}
	killed   bool
	mu       sync.Mutex
}

func (h *mockProcessHandle) PID() int {
	return h.pid
}

func (h *mockProcessHandle) Wait() (int, error) {
	<-h.waitCh
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.killed {
		return -1, errors.New("process killed")
	}
	return h.exitCode, h.waitErr
}

func (h *mockProcessHandle) Kill() error {
	h.mu.Lock()
	h.killed = true
	h.mu.Unlock()
	select {
	case <-h.waitCh:
	default:
		close(h.waitCh)
	}
	return nil
}

func (m *MockCommandRunner) Run(ctx context.Context, execPath string, args []string, dir string, env []string) (ProcessHandle, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.SimulateErr != nil {
		return nil, m.SimulateErr
	}

	m.Launches = append(m.Launches, MockLaunchRecord{
		ExecPath: execPath,
		Args:     args,
		Dir:      dir,
		Env:      env,
	})

	m.NextPID++
	handle := &mockProcessHandle{
		pid:      m.NextPID,
		exitCode: m.NextExitCode,
		waitErr:  m.NextWaitErr,
		waitCh:   m.waitCh,
	}

	// Prepare new channel for future calls
	m.waitCh = make(chan struct{})

	return handle, nil
}

// TriggerExit signals mock processes to terminate with configured exit code.
func (h *mockProcessHandle) TriggerExit() {
	select {
	case <-h.waitCh:
	default:
		close(h.waitCh)
	}
}

// Ensure unused runtime import warning avoided
var _ = runtime.GOOS
