//go:build windows

package games

import (
	"bytes"
	"encoding/csv"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

var (
	trackerKernel32             = syscall.NewLazyDLL("kernel32.dll")
	procCreateToolhelp32Snapshot = trackerKernel32.NewProc("CreateToolhelp32Snapshot")
	procProcess32FirstW          = trackerKernel32.NewProc("Process32FirstW")
	procProcess32NextW           = trackerKernel32.NewProc("Process32NextW")
)

const (
	th32csSnapProcess  = 0x00000002
	invalidHandleValue = ^uintptr(0)
	createNoWindow     = 0x08000000
)

type processEntry32W struct {
	dwSize              uint32
	cntUsage            uint32
	th32ProcessID       uint32
	th32DefaultHeapID   uintptr
	th32ModuleID        uint32
	cntThreads          uint32
	th32ParentProcessID uint32
	pcPriClassBase      int32
	dwFlags             uint32
	szExeFile           [260]uint16
}

// listProcessesOS enumerates active Windows processes using in-memory Toolhelp32 API.
// This is pure Win32 memory enumeration with zero child process spawns and no console creation.
func listProcessesOS() ([]ProcessInfo, error) {
	hSnap, _, _ := procCreateToolhelp32Snapshot.Call(th32csSnapProcess, 0)
	if hSnap != invalidHandleValue && hSnap != 0 {
		defer procCloseHandle.Call(hSnap)

		var entry processEntry32W
		entry.dwSize = uint32(unsafe.Sizeof(entry))

		ret, _, _ := procProcess32FirstW.Call(hSnap, uintptr(unsafe.Pointer(&entry)))
		if ret != 0 {
			result := make([]ProcessInfo, 0, 128)
			seen := make(map[int]bool)

			for {
				pid := int(entry.th32ProcessID)
				if pid > 0 && !seen[pid] {
					seen[pid] = true
					name := syscall.UTF16ToString(entry.szExeFile[:])
					if name != "" {
						result = append(result, ProcessInfo{
							PID:  pid,
							Name: name,
						})
					}
				}

				ret, _, _ = procProcess32NextW.Call(hSnap, uintptr(unsafe.Pointer(&entry)))
				if ret == 0 {
					break
				}
			}
			return result, nil
		}
	}

	// Fallback to tasklist with CREATE_NO_WINDOW and HideWindow flags
	cmd := exec.Command("tasklist", "/fo", "csv", "/nh")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNoWindow,
		HideWindow:    true,
	}
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil, err
	}

	reader := csv.NewReader(&out)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	result := make([]ProcessInfo, 0, len(records))
	seen := make(map[int]bool)

	for _, rec := range records {
		if len(rec) < 2 {
			continue
		}
		name := strings.TrimSpace(rec[0])
		pid, err := strconv.Atoi(strings.TrimSpace(rec[1]))
		if err != nil || pid <= 0 || seen[pid] {
			continue
		}
		seen[pid] = true
		result = append(result, ProcessInfo{
			PID:  pid,
			Name: name,
		})
	}

	return result, nil
}
