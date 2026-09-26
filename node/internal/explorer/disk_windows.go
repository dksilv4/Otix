//go:build windows

package explorer

import (
	"syscall"
	"unsafe"
)

func GetDiskUsage(path string) (freeBytes uint64, totalBytes uint64, err error) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpaceEx := kernel32.NewProc("GetDiskFreeSpaceExW")

	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes uint64
	p, errConv := syscall.UTF16PtrFromString(path)
	if errConv != nil {
		return 0, 0, errConv
	}

	r1, _, errCall := getDiskFreeSpaceEx.Call(
		uintptr(unsafe.Pointer(p)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if r1 == 0 {
		return 0, 0, errCall
	}
	return freeBytesAvailable, totalNumberOfBytes, nil
}
