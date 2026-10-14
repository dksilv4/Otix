//go:build !windows

package games

import "os/exec"

// configureCmdForProcess stub for non-windows platforms.
func configureCmdForProcess(cmd *exec.Cmd) {}

// isProcessInForeground stub for non-windows platforms.
func isProcessInForeground(pid int) bool {
	return true
}

// getForegroundProcessPID stub for non-windows platforms.
func getForegroundProcessPID() int {
	return 0
}
