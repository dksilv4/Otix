//go:build windows

package hardware

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

var (
	kernel32              = syscall.NewLazyDLL("kernel32.dll")
	procGlobalMemoryStatusEx              = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetPhysicallyInstalledSystemMemory = kernel32.NewProc("GetPhysicallyInstalledSystemMemory")
	procGetLogicalDrives                  = kernel32.NewProc("GetLogicalDrives")
	procGetDriveTypeW                     = kernel32.NewProc("GetDriveTypeW")
	procGetVolumeInfoW                    = kernel32.NewProc("GetVolumeInformationW")
	procGetDiskFreeSpaceEx                = kernel32.NewProc("GetDiskFreeSpaceExW")
)

const (
	hkeyLocalMachine = syscall.Handle(0x80000002)
	keyQueryValue    = uint32(0x0001)
	keyEnumerate     = uint32(0x0008)
	keyRead          = uint32(0x20019)

	driveRemovable = 2
	driveFixed     = 3
	driveRemote    = 4
	driveCDROM     = 5
	driveRAMDisk   = 6
)

type memoryStatusEx struct {
	dwLength                uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

func regGetString(root syscall.Handle, path string, valueName string) string {
	var key syscall.Handle
	sub16, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return ""
	}
	if syscall.RegOpenKeyEx(root, sub16, 0, keyRead, &key) != nil {
		return ""
	}
	defer syscall.RegCloseKey(key)

	val16, err := syscall.UTF16PtrFromString(valueName)
	if err != nil {
		return ""
	}
	var typ uint32
	var size uint32 = 1024
	buf := make([]uint16, 512)
	if syscall.RegQueryValueEx(key, val16, nil, &typ, (*byte)(unsafe.Pointer(&buf[0])), &size) != nil {
		return ""
	}
	return strings.TrimSpace(syscall.UTF16ToString(buf))
}

func regGetUint32(root syscall.Handle, path string, valueName string) uint32 {
	var key syscall.Handle
	sub16, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0
	}
	if syscall.RegOpenKeyEx(root, sub16, 0, keyRead, &key) != nil {
		return 0
	}
	defer syscall.RegCloseKey(key)

	val16, err := syscall.UTF16PtrFromString(valueName)
	if err != nil {
		return 0
	}
	var typ uint32
	var val uint32
	var size uint32 = 4
	if syscall.RegQueryValueEx(key, val16, nil, &typ, (*byte)(unsafe.Pointer(&val)), &size) != nil {
		return 0
	}
	return val
}

func detectCPU() CPUInfo {
	model := regGetString(hkeyLocalMachine, `HARDWARE\DESCRIPTION\System\CentralProcessor\0`, "ProcessorNameString")
	mhz := int(regGetUint32(hkeyLocalMachine, `HARDWARE\DESCRIPTION\System\CentralProcessor\0`, "~MHz"))
	vendor := regGetString(hkeyLocalMachine, `HARDWARE\DESCRIPTION\System\CentralProcessor\0`, "VendorIdentifier")

	threads := runtime.NumCPU()
	cores := threads

	// Parse physical cores if mentioned in ProcessorNameString (e.g. "8-Core Processor")
	lowerModel := strings.ToLower(model)
	if idx := strings.Index(lowerModel, "-core"); idx > 0 {
		start := idx - 1
		for start >= 0 && lowerModel[start] >= '0' && lowerModel[start] <= '9' {
			start--
		}
		if num, err := strconv.Atoi(lowerModel[start+1 : idx]); err == nil && num > 0 {
			cores = num
		}
	} else if threads >= 2 && threads%2 == 0 {
		// Fallback heuristic if hyperthreaded
		cores = threads / 2
	}

	if model == "" {
		model = fmt.Sprintf("%s %s Processor (%d cores)", vendor, runtime.GOARCH, threads)
	}

	return CPUInfo{
		ModelName:    model,
		Cores:        cores,
		Threads:      threads,
		BaseClockMHz: mhz,
		Architecture: runtime.GOARCH,
		Vendor:       vendor,
	}
}

func detectMemory() MemoryInfo {
	// 1. Try GetPhysicallyInstalledSystemMemory from SMBIOS BIOS tables (returns actual installed RAM in KB)
	var installedKB uint64
	r, _, _ := procGetPhysicallyInstalledSystemMemory.Call(uintptr(unsafe.Pointer(&installedKB)))
	if r != 0 && installedKB > 0 {
		return MemoryInfo{
			TotalBytes: installedKB * 1024,
		}
	}

	// 2. Fallback to GlobalMemoryStatusEx and normalize to standard installed hardware tier
	var ms memoryStatusEx
	ms.dwLength = uint32(unsafe.Sizeof(ms))
	r1, _, _ := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&ms)))
	if r1 == 0 {
		return MemoryInfo{}
	}

	return MemoryInfo{
		TotalBytes: NormalizeRAMBytes(ms.ullTotalPhys),
	}
}

type cimVideo struct {
	Name          string `json:"Name"`
	DriverVersion string `json:"DriverVersion"`
	AdapterRAM    uint64 `json:"AdapterRAM"`
}

func detectGPUs() []GPUInfo {
	gpus := make([]GPUInfo, 0)
	seen := make(map[string]bool)

	// 1. Try nvidia-smi for precise NVIDIA VRAM and driver
	cmdNvidia := exec.Command("nvidia-smi", "--query-gpu=gpu_name,driver_version,memory.total", "--format=csv,noheader,nounits")
	if out, err := cmdNvidia.Output(); err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			parts := strings.Split(line, ",")
			if len(parts) >= 3 {
				name := strings.TrimSpace(parts[0])
				driver := strings.TrimSpace(parts[1])
				memMB, _ := strconv.ParseUint(strings.TrimSpace(parts[2]), 10, 64)
				if name != "" && !seen[strings.ToLower(name)] {
					seen[strings.ToLower(name)] = true
					gpus = append(gpus, GPUInfo{
						Name:          name,
						DriverVersion: driver,
						VRAMBytes:     memMB * 1024 * 1024,
						IsPrimary:     true,
						IsDiscrete:    true,
					})
				}
			}
		}
	}

	// 2. Query Win32_VideoController via PowerShell for AMD/Intel/Integrated GPUs
	psScript := "Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM | ConvertTo-Json -Compress"
	cmdCim := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", psScript)
	if out, err := cmdCim.Output(); err == nil {
		outBytes := bytes.TrimSpace(out)
		if len(outBytes) > 0 {
			var list []cimVideo
			if outBytes[0] == '[' {
				_ = json.Unmarshal(outBytes, &list)
			} else if outBytes[0] == '{' {
				var single cimVideo
				if err := json.Unmarshal(outBytes, &single); err == nil {
					list = append(list, single)
				}
			}

			for _, v := range list {
				name := strings.TrimSpace(v.Name)
				if name == "" {
					continue
				}
				key := strings.ToLower(name)
				if seen[key] {
					continue
				}
				seen[key] = true

				lowerName := strings.ToLower(name)
				isDiscrete := !strings.Contains(lowerName, "intel(r) uhd") &&
					!strings.Contains(lowerName, "intel(r) iris") &&
					!strings.Contains(lowerName, "amd radeon(tm) graphics") &&
					!strings.Contains(lowerName, "basic display") &&
					!strings.Contains(lowerName, "microsoft remote")

				isPrimary := len(gpus) == 0

				gpus = append(gpus, GPUInfo{
					Name:          name,
					DriverVersion: strings.TrimSpace(v.DriverVersion),
					VRAMBytes:     v.AdapterRAM,
					IsPrimary:     isPrimary,
					IsDiscrete:    isDiscrete,
				})
			}
		}
	}

	return gpus
}

func detectStorage() []DiskVolumeInfo {
	volumes := make([]DiskVolumeInfo, 0)
	bitmask, _, _ := procGetLogicalDrives.Call()
	if bitmask == 0 {
		return volumes
	}

	for i := 0; i < 26; i++ {
		if (bitmask & (1 << i)) == 0 {
			continue
		}
		driveLetter := string(rune('A'+i)) + `:\`
		drivePtr, err := syscall.UTF16PtrFromString(driveLetter)
		if err != nil {
			continue
		}

		dt, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(drivePtr)))
		// Strictly fixed local drives only — exclude USB/removable drives (driveRemovable) and network drives
		if dt != driveFixed {
			continue
		}

		var freeBytes, totalBytes, totalFree uint64
		rDisk, _, _ := procGetDiskFreeSpaceEx.Call(
			uintptr(unsafe.Pointer(drivePtr)),
			uintptr(unsafe.Pointer(&freeBytes)),
			uintptr(unsafe.Pointer(&totalBytes)),
			uintptr(unsafe.Pointer(&totalFree)),
		)
		if rDisk == 0 || totalBytes == 0 {
			continue
		}

		volNameBuf := make([]uint16, 256)
		fsNameBuf := make([]uint16, 256)
		var serialNum, maxLen, flags uint32
		procGetVolumeInfoW.Call(
			uintptr(unsafe.Pointer(drivePtr)),
			uintptr(unsafe.Pointer(&volNameBuf[0])),
			uintptr(len(volNameBuf)),
			uintptr(unsafe.Pointer(&serialNum)),
			uintptr(unsafe.Pointer(&maxLen)),
			uintptr(unsafe.Pointer(&flags)),
			uintptr(unsafe.Pointer(&fsNameBuf[0])),
			uintptr(len(fsNameBuf)),
		)

		label := strings.TrimSpace(syscall.UTF16ToString(volNameBuf))
		fs := strings.TrimSpace(syscall.UTF16ToString(fsNameBuf))

		used := uint64(0)
		if totalBytes > freeBytes {
			used = totalBytes - freeBytes
		}
		usagePct := math.Round(float64(used)/float64(totalBytes)*1000) / 10

		volumes = append(volumes, DiskVolumeInfo{
			Drive:        driveLetter,
			Label:        label,
			FileSystem:   fs,
			TotalBytes:   totalBytes,
			FreeBytes:    freeBytes,
			UsedBytes:    used,
			UsagePercent: usagePct,
		})
	}

	return volumes
}

func detectSystem() SystemInfo {
	mfg := regGetString(hkeyLocalMachine, `HARDWARE\DESCRIPTION\System\BIOS`, "SystemManufacturer")
	model := regGetString(hkeyLocalMachine, `HARDWARE\DESCRIPTION\System\BIOS`, "SystemProductName")
	bios := regGetString(hkeyLocalMachine, `HARDWARE\DESCRIPTION\System\BIOS`, "BIOSVersion")
	host, _ := os.Hostname()

	return SystemInfo{
		Manufacturer: mfg,
		Model:        model,
		Hostname:     host,
		BIOSVersion:  bios,
	}
}

func detectOS() OSInfo {
	product := regGetString(hkeyLocalMachine, `SOFTWARE\Microsoft\Windows NT\CurrentVersion`, "ProductName")
	displayVer := regGetString(hkeyLocalMachine, `SOFTWARE\Microsoft\Windows NT\CurrentVersion`, "DisplayVersion")
	build := regGetString(hkeyLocalMachine, `SOFTWARE\Microsoft\Windows NT\CurrentVersion`, "CurrentBuild")
	if build == "" {
		build = regGetString(hkeyLocalMachine, `SOFTWARE\Microsoft\Windows NT\CurrentVersion`, "CurrentBuildNumber")
	}

	// Windows 11 backward compatibility adjustment in registry
	bNum, _ := strconv.Atoi(build)
	if bNum >= 22000 && strings.Contains(product, "Windows 10") {
		product = strings.Replace(product, "Windows 10", "Windows 11", 1)
	}

	if product == "" {
		product = "Microsoft Windows"
	}

	return OSInfo{
		Name:         product,
		Version:      displayVer,
		Build:        build,
		Platform:     "windows",
		Architecture: runtime.GOARCH,
	}
}

func detectHardware() *MachineHardware {
	return &MachineHardware{
		CPU:     detectCPU(),
		Memory:  detectMemory(),
		GPUs:    detectGPUs(),
		Storage: detectStorage(),
		System:  detectSystem(),
		OS:      detectOS(),
	}
}
