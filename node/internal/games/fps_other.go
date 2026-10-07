//go:build !windows

package games

// isProcessInForeground stub for non-windows platforms.
func isProcessInForeground(pid int) bool {
	return true
}

// getForegroundProcessPID stub for non-windows platforms.
func getForegroundProcessPID() int {
	return 0
}
