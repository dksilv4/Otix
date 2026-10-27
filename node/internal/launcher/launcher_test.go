package launcher

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestLaunchExecutableWithMockRunner(t *testing.T) {
	ctx := context.Background()
	mockRunner := NewMockCommandRunner()
	mockRunner.NextExitCode = 0

	launcher := NewLauncher(WithCommandRunner(mockRunner))

	req := LaunchRequest{
		GameID:           "witcher3",
		Title:            "The Witcher 3: Wild Hunt",
		ExecutablePath:   "C:\\Games\\The Witcher 3\\bin\\x64\\witcher3.exe",
		WorkingDirectory: "C:\\Games\\The Witcher 3\\bin\\x64",
		Arguments:        []string{"-nosplash", "-force-d3d11"},
		Environment: map[string]string{
			"OTIX_OVERLAY": "1",
			"CUSTOM_OPT":   "fast",
		},
	}

	session, err := launcher.LaunchExecutable(ctx, req)
	if err != nil {
		t.Fatalf("unexpected launch error: %v", err)
	}

	if session.GameID != "witcher3" {
		t.Fatalf("expected game ID witcher3, got %s", session.GameID)
	}
	if session.Title != "The Witcher 3: Wild Hunt" {
		t.Fatalf("expected title The Witcher 3: Wild Hunt, got %s", session.Title)
	}
	if session.State != StateRunning {
		t.Fatalf("expected state running, got %s", session.State)
	}
	if session.PID <= 1000 {
		t.Fatalf("expected valid PID > 1000, got %d", session.PID)
	}

	// Verify mock runner received correct arguments and directory
	if len(mockRunner.Launches) != 1 {
		t.Fatalf("expected 1 launch call, got %d", len(mockRunner.Launches))
	}
	call := mockRunner.Launches[0]
	if call.Dir != "C:\\Games\\The Witcher 3\\bin\\x64" {
		t.Fatalf("expected working dir C:\\Games\\The Witcher 3\\bin\\x64, got %s", call.Dir)
	}
	if len(call.Args) != 2 || call.Args[0] != "-nosplash" || call.Args[1] != "-force-d3d11" {
		t.Fatalf("unexpected args: %v", call.Args)
	}

	// Verify environment variable propagation
	var foundOverlay, foundCustom bool
	for _, env := range call.Env {
		if env == "OTIX_OVERLAY=1" {
			foundOverlay = true
		}
		if env == "CUSTOM_OPT=fast" {
			foundCustom = true
		}
	}
	if !foundOverlay || !foundCustom {
		t.Fatalf("expected environment variables propagated (overlay=%v, custom=%v)", foundOverlay, foundCustom)
	}

	// Active sessions should reflect this process
	active := launcher.ActiveSessions()
	if len(active) != 1 || active[0].ID != session.ID {
		t.Fatalf("expected active session with ID %s", session.ID)
	}
}

func TestExitCodeTrappingCleanExit(t *testing.T) {
	ctx := context.Background()
	mockRunner := NewMockCommandRunner()
	mockRunner.NextExitCode = 0

	launcher := NewLauncher(WithCommandRunner(mockRunner))

	session, err := launcher.LaunchExecutable(ctx, LaunchRequest{
		ExecutablePath: "/usr/local/bin/clean_game",
	})
	if err != nil {
		t.Fatalf("unexpected launch error: %v", err)
	}

	// Trigger mock process termination with exit code 0
	launcher.mu.Lock()
	procHandle := launcher.activeProcesses[session.ID]
	launcher.mu.Unlock()

	if mockHandle, ok := procHandle.(*mockProcessHandle); ok {
		mockHandle.TriggerExit()
	}

	// Wait briefly for asynchronous goroutine to trap exit code
	time.Sleep(50 * time.Millisecond)

	finalSess, ok := launcher.GetSession(session.ID)
	if !ok {
		t.Fatal("expected session in history")
	}
	if finalSess.State != StateTerminated {
		t.Fatalf("expected StateTerminated, got %s", finalSess.State)
	}
	if finalSess.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", finalSess.ExitCode)
	}
	if finalSess.EndTime == nil {
		t.Fatal("expected EndTime set")
	}
}

func TestExitCodeTrappingFailure(t *testing.T) {
	ctx := context.Background()
	mockRunner := NewMockCommandRunner()
	mockRunner.NextExitCode = 42
	mockRunner.NextWaitErr = errors.New("exit status 42")

	launcher := NewLauncher(WithCommandRunner(mockRunner))

	session, err := launcher.LaunchExecutable(ctx, LaunchRequest{
		ExecutablePath: "C:\\Games\\CrashApp.exe",
	})
	if err != nil {
		t.Fatalf("unexpected launch error: %v", err)
	}

	launcher.mu.Lock()
	procHandle := launcher.activeProcesses[session.ID]
	launcher.mu.Unlock()

	if mockHandle, ok := procHandle.(*mockProcessHandle); ok {
		mockHandle.TriggerExit()
	}

	time.Sleep(50 * time.Millisecond)

	finalSess, ok := launcher.GetSession(session.ID)
	if !ok {
		t.Fatal("expected session in history")
	}
	if finalSess.State != StateFailed {
		t.Fatalf("expected StateFailed, got %s", finalSess.State)
	}
	if finalSess.ExitCode != 42 {
		t.Fatalf("expected exit code 42, got %d", finalSess.ExitCode)
	}
	if finalSess.ErrorMessage != "exit status 42" {
		t.Fatalf("expected error message 'exit status 42', got %q", finalSess.ErrorMessage)
	}
}

func TestMacOSAppBundleResolution(t *testing.T) {
	tmpDir := t.TempDir()
	appPath := filepath.Join(tmpDir, "BaldursGate3.app")
	macOSDir := filepath.Join(appPath, "Contents", "MacOS")
	if err := os.MkdirAll(macOSDir, 0755); err != nil {
		t.Fatalf("failed to create fake .app bundle: %v", err)
	}

	// Create binary inside Contents/MacOS
	binaryPath := filepath.Join(macOSDir, "bg3_binary")
	if err := os.WriteFile(binaryPath, []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatalf("failed to write fake binary: %v", err)
	}

	// Create Contents/Info.plist with CFBundleExecutable
	plistContent := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>bg3_binary</string>
</dict>
</plist>`
	if err := os.WriteFile(filepath.Join(appPath, "Contents", "Info.plist"), []byte(plistContent), 0644); err != nil {
		t.Fatalf("failed to write Info.plist: %v", err)
	}

	// 1. Test direct resolution function
	resolved, err := ResolveMacAppExecutable(appPath)
	if err != nil {
		t.Fatalf("unexpected resolution error: %v", err)
	}
	if resolved != binaryPath {
		t.Fatalf("expected resolved binary %s, got %s", binaryPath, resolved)
	}

	// 2. Test launcher launches the resolved binary
	mockRunner := NewMockCommandRunner()
	launcher := NewLauncher(WithCommandRunner(mockRunner))

	_, err = launcher.LaunchExecutable(context.Background(), LaunchRequest{
		ExecutablePath: appPath,
	})
	if err != nil {
		t.Fatalf("unexpected launch error: %v", err)
	}

	if len(mockRunner.Launches) != 1 {
		t.Fatalf("expected 1 launch call, got %d", len(mockRunner.Launches))
	}
	if mockRunner.Launches[0].ExecPath != binaryPath {
		t.Fatalf("expected launcher to execute resolved binary %s, got %s", binaryPath, mockRunner.Launches[0].ExecPath)
	}
}

func TestStopSession(t *testing.T) {
	ctx := context.Background()
	mockRunner := NewMockCommandRunner()
	launcher := NewLauncher(WithCommandRunner(mockRunner))

	session, err := launcher.LaunchExecutable(ctx, LaunchRequest{
		ExecutablePath: "/path/to/game.exe",
	})
	if err != nil {
		t.Fatalf("unexpected launch error: %v", err)
	}

	// Stop session
	if err := launcher.StopSession(session.ID); err != nil {
		t.Fatalf("unexpected error stopping session: %v", err)
	}

	stoppedSess, ok := launcher.GetSession(session.ID)
	if !ok {
		t.Fatal("expected session in history")
	}
	if stoppedSess.IsActive() {
		t.Fatal("expected session to NOT be active")
	}
	if stoppedSess.ExitCode != -1 {
		t.Fatalf("expected exit code -1, got %d", stoppedSess.ExitCode)
	}
	if stoppedSess.ErrorMessage != "terminated by user" {
		t.Fatalf("expected 'terminated by user', got %s", stoppedSess.ErrorMessage)
	}

	// Stopping non-existent session
	if err := launcher.StopSession("nonexistent"); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}
}

func TestLaunchEmulatorThroughLauncher(t *testing.T) {
	ctx := context.Background()
	mockRunner := NewMockCommandRunner()
	launcher := NewLauncher(WithCommandRunner(mockRunner))

	// Launch RetroArch game
	req := EmulatorLaunchRequest{
		EmulatorID: "retroarch",
		ROMPath:    "/roms/snes/ChronoTrigger.sfc",
		Platform:   "snes",
		Fullscreen: true,
	}

	session, err := launcher.LaunchEmulator(ctx, req)
	if err != nil {
		t.Fatalf("unexpected emulator launch error: %v", err)
	}

	if session.Title != "ChronoTrigger" {
		t.Fatalf("expected title ChronoTrigger, got %s", session.Title)
	}
	if session.GameID != "retroarch:ChronoTrigger" {
		t.Fatalf("expected game ID retroarch:ChronoTrigger, got %s", session.GameID)
	}

	if len(mockRunner.Launches) != 1 {
		t.Fatalf("expected 1 launch call, got %d", len(mockRunner.Launches))
	}

	call := mockRunner.Launches[0]
	if call.ExecPath != "retroarch" {
		t.Fatalf("expected executable retroarch, got %s", call.ExecPath)
	}
	expectedArgs := []string{
		"-L", "cores/snes9x_libretro.dll",
		"/roms/snes/ChronoTrigger.sfc",
		"--fullscreen",
	}
	if strings.Join(call.Args, " ") != strings.Join(expectedArgs, " ") {
		t.Fatalf("expected args %v, got %v", expectedArgs, call.Args)
	}
}

func TestLauncherMountAndUnmountISO(t *testing.T) {
	ctx := context.Background()
	mockMounter := NewMockISOMounter()
	launcher := NewLauncher(WithISOMounter(mockMounter))

	res, err := launcher.MountISO(ctx, "/games/Diablo2.iso")
	if err != nil {
		t.Fatalf("unexpected mount error: %v", err)
	}
	if res.ISOPath != "/games/Diablo2.iso" {
		t.Fatalf("expected ISO path /games/Diablo2.iso, got %s", res.ISOPath)
	}

	if err := launcher.UnmountISO(ctx, res.MountPoint); err != nil {
		t.Fatalf("unexpected unmount error: %v", err)
	}
}

func TestRealOSProcessExecutionOnHost(t *testing.T) {
	// Execute a standard binary on the current OS host
	var binPath string
	var args []string

	if runtime.GOOS == "windows" {
		binPath = "cmd.exe"
		args = []string{"/c", "echo hello"}
	} else {
		// macOS or Unix
		echoPath, err := exec.LookPath("echo")
		if err != nil {
			echoPath = "/bin/echo"
		}
		binPath = echoPath
		args = []string{"hello"}
	}

	ctx := context.Background()
	launcher := NewLauncher() // Uses real OSCommandRunner

	tmpDir := t.TempDir()
	session, err := launcher.LaunchExecutable(ctx, LaunchRequest{
		GameID:           "real-echo",
		Title:            "Echo Test",
		ExecutablePath:   binPath,
		WorkingDirectory: tmpDir,
		Arguments:        args,
		Environment: map[string]string{
			"OTIX_TEST": "true",
		},
	})
	if err != nil {
		t.Fatalf("failed to launch real OS process: %v", err)
	}

	if session.PID <= 0 {
		t.Fatalf("expected positive PID, got %d", session.PID)
	}

	// Wait up to 1 second for the process to exit and exit code to be trapped
	var finalSess *ProcessSession
	for i := 0; i < 20; i++ {
		time.Sleep(50 * time.Millisecond)
		s, _ := launcher.GetSession(session.ID)
		if s != nil && !s.IsActive() {
			finalSess = s
			break
		}
	}

	if finalSess == nil {
		t.Fatal("timed out waiting for real process termination")
	}
	if finalSess.State != StateTerminated {
		t.Fatalf("expected StateTerminated, got %s", finalSess.State)
	}
	if finalSess.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", finalSess.ExitCode)
	}
}
