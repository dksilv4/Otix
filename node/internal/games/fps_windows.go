//go:build windows

package games

import (
	"syscall"
	"unsafe"
)

var (
	fpsUser32                       = syscall.NewLazyDLL("user32.dll")
	procFpsGetForegroundWindow      = fpsUser32.NewProc("GetForegroundWindow")
	procFpsGetWindowThreadProcessId = fpsUser32.NewProc("GetWindowThreadProcessId")
)

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
