//go:build windows

package games

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"
)

var (
	fpsUser32                       = syscall.NewLazyDLL("user32.dll")
	procFpsGetForegroundWindow      = fpsUser32.NewProc("GetForegroundWindow")
	procFpsGetWindowThreadProcessId = fpsUser32.NewProc("GetWindowThreadProcessId")
)

// configureCmdForProcess configures process attributes on Windows to prevent console window flashing.
func configureCmdForProcess(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		HideWindow:    true,
	}
}

// cleanupInterferingEtwSessions stops existing sessions that would prevent PresentMon from starting.
func cleanupInterferingEtwSessions() {
	sessions := []string{"OtixPresentMon", "PresentMon", "GraphicsPerfMonitorSession"}
	for _, s := range sessions {
		cmd := exec.Command("logman", "stop", s, "-ets")
		configureCmdForProcess(cmd)
		_ = cmd.Run()
	}
}

// FixFpsPermissions installs the zero-reboot OtixCapture Windows Service and adds the current
// Windows user to the "Performance Log Users" group via elevated PowerShell.
func FixFpsPermissions() (bool, error) {
	username := os.Getenv("USERNAME")
	exePath, _ := os.Executable()
	if exePath == "" {
		exePath = "otix-node.exe"
	}

	escapedExe := strings.ReplaceAll(exePath, "'", "''")
	escapedUser := strings.ReplaceAll(username, "'", "''")

	psCommands := fmt.Sprintf(
		"$exe = '%s'; if (Test-Path $exe) { sc.exe create OtixCapture binPath= ('\"' + $exe + '\" -capture-service') start= auto DisplayName= 'Otix Capture Service'; sc.exe description OtixCapture 'Background capture helper for Otix in-game performance overlay'; sc.exe failure OtixCapture reset= 86400 actions= restart/5000; sc.exe start OtixCapture }; if ('%s' -ne '') { net localgroup 'Performance Log Users' '%s' /add }",
		escapedExe, escapedUser, escapedUser,
	)

	cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
		fmt.Sprintf(`Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command "%s"' -WindowStyle Hidden -Wait`, strings.ReplaceAll(psCommands, `"`, `\"`)),
	)
	configureCmdForProcess(cmd)
	err := cmd.Run()
	return err == nil, err
}

// getForegroundProcessPID returns the PID of the process owning the current foreground window.
func getForegroundProcessPID() int {
	hwnd, _, _ := procFpsGetForegroundWindow.Call()
	if hwnd == 0 {
		return 0
	}
	var fgPid uint32
	procFpsGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&fgPid)))
	return int(fgPid)
}

// isProcessInForeground checks if the window currently in the foreground belongs to the target PID.
func isProcessInForeground(pid int) bool {
	if pid <= 0 {
		return false
	}
	return getForegroundProcessPID() == pid
}
