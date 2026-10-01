//go:build !windows

package games

// isProcessInForeground stub for non-windows platforms.
func isProcessInForeground(pid int) bool {
	return true
}
