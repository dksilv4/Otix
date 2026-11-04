//go:build windows

package server

import (
	"syscall"
	"unsafe"
)

var (
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	procCreateMutex = kernel32.NewProc("CreateMutexW")
)

// AcquireSingleInstanceMutex ensures only one instance of the overlay daemon runs per session.
func AcquireSingleInstanceMutex(name string) (uintptr, bool) {
	nameUtf16, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return 0, true
	}
	h, _, callErr := procCreateMutex.Call(0, 1, uintptr(unsafe.Pointer(nameUtf16)))
	if callErr == syscall.ERROR_ALREADY_EXISTS {
		return h, false
	}
	return h, true
}
