//go:build !windows

package hardware

import (
	"bufio"
	"math"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

func detectHardware() *MachineHardware {
	return &MachineHardware{
		CPU:     detectUnixCPU(),
		Memory:  detectUnixMemory(),
		GPUs:    detectUnixGPUs(),
		Storage: detectUnixStorage(),
		System:  detectUnixSystem(),
		OS:      detectUnixOS(),
	}
}

func detectUnixCPU() CPUInfo {
	model := ""
	threads := runtime.NumCPU()
	cores := threads

	if runtime.GOOS == "darwin" {
		if out, err := exec.Command("sysctl", "-n", "machdep.cpu.brand_string").Output(); err == nil {
			model = strings.TrimSpace(string(out))
		}
		if out, err := exec.Command("sysctl", "-n", "hw.physicalcpu").Output(); err == nil {
			if c, errParse := strconv.Atoi(strings.TrimSpace(string(out))); errParse == nil && c > 0 {
				cores = c
			}
		}
	} else {
		// Linux: parse /proc/cpuinfo
		if f, err := os.Open("/proc/cpuinfo"); err == nil {
			defer f.Close()
			scanner := bufio.NewScanner(f)
			for scanner.Scan() {
				line := scanner.Text()
				if strings.HasPrefix(line, "model name") {
					parts := strings.SplitN(line, ":", 2)
					if len(parts) == 2 {
						model = strings.TrimSpace(parts[1])
						break
					}
				}
			}
		}
	}

	if model == "" {
		model = runtime.GOARCH + " Processor"
	}

	return CPUInfo{
		ModelName:    model,
		Cores:        cores,
		Threads:      threads,
		Architecture: runtime.GOARCH,
	}
}

func detectUnixMemory() MemoryInfo {
	if runtime.GOOS == "darwin" {
		if out, err := exec.Command("sysctl", "-n", "hw.memsize").Output(); err == nil {
			if total, errParse := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64); errParse == nil {
				return MemoryInfo{
					TotalBytes: NormalizeRAMBytes(total),
				}
			}
		}
	} else {
		// Linux: parse /proc/meminfo for MemTotal
		if f, err := os.Open("/proc/meminfo"); err == nil {
			defer f.Close()
			var totalKB uint64
			scanner := bufio.NewScanner(f)
			for scanner.Scan() {
				line := scanner.Text()
				fields := strings.Fields(line)
				if len(fields) >= 2 && fields[0] == "MemTotal:" {
					totalKB, _ = strconv.ParseUint(fields[1], 10, 64)
					break
				}
			}
			if totalKB > 0 {
				return MemoryInfo{
					TotalBytes: NormalizeRAMBytes(totalKB * 1024),
				}
			}
		}
	}

	return MemoryInfo{}
}

func detectUnixGPUs() []GPUInfo {
	gpus := make([]GPUInfo, 0)

	// Try nvidia-smi
	cmdNvidia := exec.Command("nvidia-smi", "--query-gpu=gpu_name,driver_version,memory.total", "--format=csv,noheader,nounits")
	if out, err := cmdNvidia.Output(); err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			parts := strings.Split(line, ",")
			if len(parts) >= 3 {
				name := strings.TrimSpace(parts[0])
				driver := strings.TrimSpace(parts[1])
				memMB, _ := strconv.ParseUint(strings.TrimSpace(parts[2]), 10, 64)
				if name != "" {
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

	return gpus
}

func detectUnixStorage() []DiskVolumeInfo {
	volumes := make([]DiskVolumeInfo, 0)
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err == nil {
		total := uint64(stat.Blocks) * uint64(stat.Bsize)
		free := uint64(stat.Bavail) * uint64(stat.Bsize)
		used := total - free
		pct := float64(0)
		if total > 0 {
			pct = math.Round(float64(used)/float64(total)*1000) / 10
		}
		volumes = append(volumes, DiskVolumeInfo{
			Drive:        "/",
			Label:        "Root",
			FileSystem:   "rootfs",
			TotalBytes:   total,
			FreeBytes:    free,
			UsedBytes:    used,
			UsagePercent: pct,
		})
	}
	return volumes
}

func detectUnixSystem() SystemInfo {
	host, _ := os.Hostname()
	mfg := ""
	model := ""

	if b, err := os.ReadFile("/sys/class/dmi/id/sys_vendor"); err == nil {
		mfg = strings.TrimSpace(string(b))
	}
	if b, err := os.ReadFile("/sys/class/dmi/id/product_name"); err == nil {
		model = strings.TrimSpace(string(b))
	}

	return SystemInfo{
		Manufacturer: mfg,
		Model:        model,
		Hostname:     host,
	}
}

func detectUnixOS() OSInfo {
	name := runtime.GOOS
	ver := ""

	if f, err := os.Open("/etc/os-release"); err == nil {
		defer f.Close()
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "PRETTY_NAME=") {
				name = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"`)
			} else if strings.HasPrefix(line, "VERSION_ID=") {
				ver = strings.Trim(strings.TrimPrefix(line, "VERSION_ID="), `"`)
			}
		}
	}

	return OSInfo{
		Name:         name,
		Version:      ver,
		Platform:     runtime.GOOS,
		Architecture: runtime.GOARCH,
	}
}
