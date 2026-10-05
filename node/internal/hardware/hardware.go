package hardware

import (
	"math"
	"sync"
	"time"
)

// CPUInfo represents processor details.
type CPUInfo struct {
	ModelName    string `json:"modelName"`
	Cores        int    `json:"cores"`
	Threads      int    `json:"threads"`
	BaseClockMHz int    `json:"baseClockMhz,omitempty"`
	Architecture string `json:"architecture"`
	Vendor       string `json:"vendor,omitempty"`
}

// MemoryInfo represents system physical RAM capacity.
type MemoryInfo struct {
	TotalBytes     uint64  `json:"totalBytes"`
	AvailableBytes uint64  `json:"availableBytes,omitempty"`
	UsedBytes      uint64  `json:"usedBytes,omitempty"`
	UsagePercent   float64 `json:"usagePercent,omitempty"`
}

// GPUInfo represents an installed graphics adapter.
type GPUInfo struct {
	Name          string `json:"name"`
	DriverVersion string `json:"driverVersion,omitempty"`
	VRAMBytes     uint64 `json:"vramBytes,omitempty"`
	IsPrimary     bool   `json:"isPrimary"`
	IsDiscrete    bool   `json:"isDiscrete"`
}

// DiskVolumeInfo represents a local mounted filesystem/drive.
type DiskVolumeInfo struct {
	Drive        string  `json:"drive"`
	Label        string  `json:"label,omitempty"`
	FileSystem   string  `json:"fileSystem,omitempty"`
	TotalBytes   uint64  `json:"totalBytes"`
	FreeBytes    uint64  `json:"freeBytes"`
	UsedBytes    uint64  `json:"usedBytes"`
	UsagePercent float64 `json:"usagePercent"`
}

// SystemInfo represents motherboard, machine model, and vendor details.
type SystemInfo struct {
	Manufacturer string `json:"manufacturer,omitempty"`
	Model        string `json:"model,omitempty"`
	Hostname     string `json:"hostname,omitempty"`
	BIOSVersion  string `json:"biosVersion,omitempty"`
}

// OSInfo represents the operating system build and platform.
type OSInfo struct {
	Name         string `json:"name"`
	Version      string `json:"version,omitempty"`
	Build        string `json:"build,omitempty"`
	Platform     string `json:"platform"`
	Architecture string `json:"architecture"`
}

// DisplayInfo represents an active physical monitor and its desktop spatial arrangement.
type DisplayInfo struct {
	Index        int    `json:"index"`
	DeviceName   string `json:"deviceName"`             // e.g. "\\.\DISPLAY1"
	Name         string `json:"name"`                   // Friendly model e.g. "Samsung Odyssey G93SC"
	Manufacturer string `json:"manufacturer,omitempty"` // e.g. "Samsung"
	Model        string `json:"model,omitempty"`        // e.g. "Odyssey G93SC"
	Resolution   string `json:"resolution"`             // e.g. "5120x1440"
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	RefreshRate  int    `json:"refreshRate"`            // in Hz, e.g. 240
	IsPrimary    bool   `json:"isPrimary"`
	PositionX    int    `json:"positionX"`              // Desktop coordinate X
	PositionY    int    `json:"positionY"`              // Desktop coordinate Y
	Orientation  string `json:"orientation,omitempty"`  // "Landscape", "Portrait (90°)", etc.
	Arrangement  string `json:"arrangement,omitempty"`  // e.g. "Primary Display (Center)", "Stacked Above Primary", "Left of Primary (Vertical Portrait)"
}

// MachineHardware aggregates all detected host machine hardware components.
type MachineHardware struct {
	ProbedAt time.Time        `json:"probedAt"`
	CPU      CPUInfo          `json:"cpu"`
	Memory   MemoryInfo       `json:"memory"`
	GPUs     []GPUInfo        `json:"gpus"`
	Displays []DisplayInfo    `json:"displays"`
	Storage  []DiskVolumeInfo `json:"storage"`
	System   SystemInfo       `json:"system"`
	OS       OSInfo           `json:"os"`
}

var (
	cacheMu      sync.RWMutex
	cachedHW     *MachineHardware
	lastProbedAt time.Time
	cacheTTL     = 45 * time.Second
)

// GetMachineHardware returns the detected hardware components, using a cached snapshot unless expired or forceRefresh is true.
func GetMachineHardware(forceRefresh bool) *MachineHardware {
	cacheMu.RLock()
	if !forceRefresh && cachedHW != nil && time.Since(lastProbedAt) < cacheTTL {
		hw := cachedHW
		cacheMu.RUnlock()
		return hw
	}
	cacheMu.RUnlock()

	cacheMu.Lock()
	defer cacheMu.Unlock()

	if !forceRefresh && cachedHW != nil && time.Since(lastProbedAt) < cacheTTL {
		return cachedHW
	}

	hw := detectHardware()
	hw.ProbedAt = time.Now()
	cachedHW = hw
	lastProbedAt = hw.ProbedAt
	return hw
}

// ResetCache clears any in-memory hardware snapshot.
func ResetCache() {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	cachedHW = nil
	lastProbedAt = time.Time{}
}

// NormalizeRAMBytes maps raw OS usable memory bytes (which exclude hardware reserved RAM)
// to standard manufactured installed physical RAM capacity (e.g. 8GB, 16GB, 24GB, 32GB, 64GB).
func NormalizeRAMBytes(bytes uint64) uint64 {
	if bytes == 0 {
		return 0
	}
	const gigabyte = 1024 * 1024 * 1024
	gib := float64(bytes) / float64(gigabyte)
	tiers := []float64{1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024}
	for i, tier := range tiers {
		prev := 0.0
		if i > 0 {
			prev = tiers[i-1]
		}
		minBound := tier * 0.80
		if prev+0.1 > minBound {
			minBound = prev + 0.1
		}
		maxBound := tier * 1.05
		if gib >= minBound && gib <= maxBound {
			return uint64(tier * gigabyte)
		}
	}
	return uint64(math.Round(gib)) * gigabyte
}

