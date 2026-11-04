//go:build !windows

package server

// AcquireSingleInstanceMutex is a no-op on non-Windows platforms.
func AcquireSingleInstanceMutex(name string) (uintptr, bool) {
	return 0, true
}
