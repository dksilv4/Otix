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
	"sync"
	"syscall"
	"unsafe"
)

var (
	kernel32                              = syscall.NewLazyDLL("kernel32.dll")
	procGlobalMemoryStatusEx              = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetPhysicallyInstalledSystemMemory = kernel32.NewProc("GetPhysicallyInstalledSystemMemory")
	procGetLogicalDrives                  = kernel32.NewProc("GetLogicalDrives")
	procGetDriveTypeW                     = kernel32.NewProc("GetDriveTypeW")
	procGetVolumeInfoW                    = kernel32.NewProc("GetVolumeInformationW")
	procGetDiskFreeSpaceEx                = kernel32.NewProc("GetDiskFreeSpaceExW")

	user32                   = syscall.NewLazyDLL("user32.dll")
	procEnumDisplayMonitors  = user32.NewProc("EnumDisplayMonitors")
	procGetMonitorInfoW      = user32.NewProc("GetMonitorInfoW")
	procEnumDisplaySettingsW = user32.NewProc("EnumDisplaySettingsW")
	procEnumDisplayDevicesW  = user32.NewProc("EnumDisplayDevicesW")
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

type rect struct {
	left, top, right, bottom int32
}

type monitorInfoExW struct {
	cbSize    uint32
	rcMonitor rect
	rcWork    rect
	dwFlags   uint32
	szDevice  [32]uint16
}

type rawMon struct {
	device    string
	left      int
	top       int
	width     int
	height    int
	isPrimary bool
}

var (
	enumMonsMu            sync.Mutex
	enumMonsList          []rawMon
	enumDisplayMonitorsCb = syscall.NewCallback(func(hMon, hdc, lprc, lParam uintptr) uintptr {
		var mi monitorInfoExW
		mi.cbSize = uint32(unsafe.Sizeof(mi))
		ok, _, _ := procGetMonitorInfoW.Call(hMon, uintptr(unsafe.Pointer(&mi)))
		if ok != 0 {
			w := int(mi.rcMonitor.right - mi.rcMonitor.left)
			h := int(mi.rcMonitor.bottom - mi.rcMonitor.top)
			isPrimary := (mi.dwFlags & 1) != 0
			dev := syscall.UTF16ToString(mi.szDevice[:])
			enumMonsList = append(enumMonsList, rawMon{
				device:    dev,
				left:      int(mi.rcMonitor.left),
				top:       int(mi.rcMonitor.top),
				width:     w,
				height:    h,
				isPrimary: isPrimary,
			})
		}
		return 1
	})
)

type displayDeviceW struct {
	cb           uint32
	deviceName   [32]uint16
	deviceString [128]uint16
	stateFlags   uint32
	deviceID     [128]uint16
	deviceKey    [128]uint16
}

type devModeW struct {
	dmDeviceName         [32]uint16
	dmSpecVersion        uint16
	dmDriverVersion      uint16
	dmSize               uint16
	dmDriverExtra        uint16
	dmFields             uint32
	dmPositionX          int32
	dmPositionY          int32
	dmDisplayOrientation uint32
	dmDisplayFixedOutput uint32
	dmColor              int16
	dmDuplex             int16
	dmYResolution        int16
	dmTTOption           int16
	dmCollate            int16
	dmFormName           [32]uint16
	dmLogPixels          uint16
	dmBitsPerPel         uint32
	dmPelsWidth          uint32
	dmPelsHeight         uint32
	dmDisplayFlags       uint32
	dmDisplayFrequency   uint32
	dmICMMethod          uint32
	dmICMIntent          uint32
	dmMediaType          uint32
	dmDitherType         uint32
	dmReserved1          uint32
	dmReserved2          uint32
	dmPanningWidth       uint32
	dmPanningHeight      uint32
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

func detectDisplays() []DisplayInfo {
	displays := make([]DisplayInfo, 0)
	wmiMap := queryWmiMonitorMap()

	var rawMons []rawMon

	enumMonsMu.Lock()
	enumMonsList = nil
	procEnumDisplayMonitors.Call(0, 0, enumDisplayMonitorsCb, 0)
	rawMons = make([]rawMon, len(enumMonsList))
	copy(rawMons, enumMonsList)
	enumMonsList = nil
	enumMonsMu.Unlock()

	if len(rawMons) == 0 {
		return displays
	}

	var primary rawMon
	for _, m := range rawMons {
		if m.isPrimary {
			primary = m
			break
		}
	}
	if !primary.isPrimary && len(rawMons) > 0 {
		primary = rawMons[0]
	}

	for idx, m := range rawMons {
		displayIdx := idx + 1
		devPtr, err := syscall.UTF16PtrFromString(m.device)
		if err != nil {
			continue
		}

		var dm devModeW
		dm.dmSize = uint16(unsafe.Sizeof(dm))
		refreshRate := 60
		orientation := "Landscape"
		okSet, _, _ := procEnumDisplaySettingsW.Call(uintptr(unsafe.Pointer(devPtr)), ^uintptr(0), uintptr(unsafe.Pointer(&dm)))
		if okSet != 0 {
			if dm.dmDisplayFrequency > 0 {
				refreshRate = int(dm.dmDisplayFrequency)
			}
			switch dm.dmDisplayOrientation {
			case 1:
				orientation = "Portrait"
			case 2:
				orientation = "Landscape (Flipped)"
			case 3:
				orientation = "Portrait (Flipped)"
			default:
				orientation = "Landscape"
			}
		}

		var monDev displayDeviceW
		monDev.cb = uint32(unsafe.Sizeof(monDev))
		procEnumDisplayDevicesW.Call(uintptr(unsafe.Pointer(devPtr)), 0, uintptr(unsafe.Pointer(&monDev)), 0)
		monDeviceID := syscall.UTF16ToString(monDev.deviceID[:])
		monDeviceStr := syscall.UTF16ToString(monDev.deviceString[:])

		var mfg, model, friendlyName string
		matched := false
		for pnpKey, detail := range wmiMap {
			if strings.Contains(strings.ToUpper(monDeviceID), pnpKey) {
				mfg = detail.Manufacturer
				model = detail.Model
				matched = true
				break
			}
		}

		if matched && model != "" {
			if mfg != "" && !strings.HasPrefix(strings.ToLower(model), strings.ToLower(mfg)) {
				friendlyName = fmt.Sprintf("%s %s", mfg, model)
			} else {
				friendlyName = model
			}
		} else if monDeviceStr != "" && monDeviceStr != "Generic PnP Monitor" {
			friendlyName = monDeviceStr
			model = monDeviceStr
		} else {
			friendlyName = fmt.Sprintf("Display %d (%s)", displayIdx, m.device)
			model = fmt.Sprintf("%dx%d Display", m.width, m.height)
		}

		var arrangement string
		if m.isPrimary {
			arrangement = "Primary Display (Center)"
		} else {
			px := primary.left
			py := primary.top
			pw := primary.width
			ph := primary.height

			mr := m.left + m.width
			mb := m.top + m.height

			if mb <= py+10 && m.left >= px-200 && mr <= px+pw+200 {
				arrangement = "Stacked Above Primary"
			} else if m.top >= py+ph-10 && m.left >= px-200 && mr <= px+pw+200 {
				arrangement = "Stacked Below Primary"
			} else if mr <= px+10 {
				arrangement = "Left of Primary"
			} else if m.left >= px+pw-10 {
				arrangement = "Right of Primary"
			} else if m.left < px && m.top < py {
				arrangement = "Top-Left of Primary"
			} else if m.left > px && m.top < py {
				arrangement = "Top-Right of Primary"
			} else if m.left < px && m.top > py {
				arrangement = "Bottom-Left of Primary"
			} else if m.left > px && m.top > py {
				arrangement = "Bottom-Right of Primary"
			} else {
				arrangement = "Secondary Display"
			}

			if strings.Contains(orientation, "Portrait") && !strings.Contains(arrangement, "Portrait") {
				arrangement += " (Vertical Portrait)"
			}
		}

		displays = append(displays, DisplayInfo{
			Index:        displayIdx,
			DeviceName:   m.device,
			Name:         friendlyName,
			Manufacturer: mfg,
			Model:        model,
			Resolution:   fmt.Sprintf("%dx%d", m.width, m.height),
			Width:        m.width,
			Height:       m.height,
			RefreshRate:  refreshRate,
			IsPrimary:    m.isPrimary,
			PositionX:    m.left,
			PositionY:    m.top,
			Orientation:  orientation,
			Arrangement:  arrangement,
		})
	}

	return displays
}

type wmiMonitorID struct {
	InstanceName     string `json:"InstanceName"`
	ManufacturerName []int  `json:"ManufacturerName"`
	UserFriendlyName []int  `json:"UserFriendlyName"`
	SerialNumberID   []int  `json:"SerialNumberID"`
}

type wmiMonDetail struct {
	Manufacturer string
	Model        string
	Serial       string
}

func parseAsciiInts(ints []int) string {
	var sb strings.Builder
	for _, v := range ints {
		if v > 0 && v < 128 {
			sb.WriteByte(byte(v))
		}
	}
	return strings.TrimSpace(sb.String())
}

func queryWmiMonitorMap() map[string]wmiMonDetail {
	result := make(map[string]wmiMonDetail)
	psScript := "Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue | Select-Object InstanceName, ManufacturerName, UserFriendlyName, SerialNumberID | ConvertTo-Json -Compress"
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", psScript)
	out, err := cmd.Output()
	if err != nil {
		return result
	}
	outBytes := bytes.TrimSpace(out)
	if len(outBytes) == 0 {
		return result
	}

	var list []wmiMonitorID
	if outBytes[0] == '[' {
		_ = json.Unmarshal(outBytes, &list)
	} else if outBytes[0] == '{' {
		var single wmiMonitorID
		if err := json.Unmarshal(outBytes, &single); err == nil {
			list = append(list, single)
		}
	}

	for _, item := range list {
		mfg := parseAsciiInts(item.ManufacturerName)
		model := parseAsciiInts(item.UserFriendlyName)
		serial := parseAsciiInts(item.SerialNumberID)

		switch strings.ToUpper(mfg) {
		case "SAM":
			mfg = "Samsung"
		case "MSI":
			mfg = "MSI"
		case "AUS":
			mfg = "ASUS"
		case "DEL":
			mfg = "Dell"
		case "LGD", "GSM":
			mfg = "LG"
		case "ACR":
			mfg = "Acer"
		case "AOC":
			mfg = "AOC"
		case "BEN":
			mfg = "BenQ"
		case "GIG":
			mfg = "Gigabyte"
		}

		detail := wmiMonDetail{
			Manufacturer: mfg,
			Model:        model,
			Serial:       serial,
		}

		parts := strings.Split(item.InstanceName, "\\")
		if len(parts) >= 2 {
			pnpKey := strings.ToUpper(parts[1])
			result[pnpKey] = detail
		}
		result[strings.ToLower(item.InstanceName)] = detail
	}
	return result
}

func detectHardware() *MachineHardware {
	return &MachineHardware{
		CPU:      detectCPU(),
		Memory:   detectMemory(),
		GPUs:     detectGPUs(),
		Displays: detectDisplays(),
		Storage:  detectStorage(),
		System:   detectSystem(),
		OS:       detectOS(),
	}
}
