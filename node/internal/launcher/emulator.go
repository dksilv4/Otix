package launcher

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
)

var (
	ErrEmulatorNotFound = errors.New("emulator profile not found")
	ErrROMPathRequired  = errors.New("ROM path is required")
	ErrCoreRequired     = errors.New("emulator core is required for this platform")
)

// EmulatorLaunchRequest defines parameters for launching a game via an emulator.
type EmulatorLaunchRequest struct {
	EmulatorID     string   `json:"emulator_id"`
	ROMPath        string   `json:"rom_path"`
	Platform       string   `json:"platform"`
	Core           string   `json:"core,omitempty"`
	Fullscreen     bool     `json:"fullscreen,omitempty"`
	ExtraArgs      []string `json:"extra_args,omitempty"`
	ExecutablePath string   `json:"executable_path,omitempty"`
}

// EmulatorProfile describes an emulator's invocation pattern, supported platforms, and default settings.
type EmulatorProfile struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Description       string            `json:"description,omitempty"`
	Platforms         []string          `json:"platforms"`
	Extensions        []string          `json:"extensions"`
	DefaultExecutable string            `json:"default_executable"`
	LaunchTemplate    []string          `json:"launch_template"`
	FullscreenFlag    string            `json:"fullscreen_flag,omitempty"`
	FullscreenPosition string           `json:"fullscreen_position,omitempty"` // "prepend", "before_rom", "append"
	Cores             map[string]string `json:"cores,omitempty"`
	ProcessNames      []string          `json:"process_names,omitempty"`
}

// CanonicalEmulatorProfiles defines the 7 canonical emulator profiles plus retro extras.
var CanonicalEmulatorProfiles = []EmulatorProfile{
	{
		ID:                "retroarch",
		Name:              "RetroArch",
		Description:       "Multi-system Libretro frontend for retro consoles",
		Platforms:         []string{"nes", "snes", "n64", "gb", "gbc", "gba", "genesis", "mastersystem", "gamegear", "saturn", "ps1", "arcade"},
		Extensions:        []string{".nes", ".sfc", ".smc", ".z64", ".n64", ".v64", ".gb", ".gbc", ".gba", ".gen", ".md", ".sms", ".gg", ".cue", ".chd", ".zip", ".7z"},
		DefaultExecutable: "retroarch",
		LaunchTemplate:    []string{"-L", "{core}", "{romPath}"},
		FullscreenFlag:    "--fullscreen",
		FullscreenPosition: "append",
		Cores: map[string]string{
			"snes":         "cores/snes9x_libretro.dll",
			"nes":          "cores/mesen_libretro.dll",
			"gba":          "cores/mgba_libretro.dll",
			"gb":           "cores/gambatte_libretro.dll",
			"gbc":          "cores/gambatte_libretro.dll",
			"n64":          "cores/mupen64plus_next_libretro.dll",
			"genesis":      "cores/genesis_plus_gx_libretro.dll",
			"mastersystem": "cores/genesis_plus_gx_libretro.dll",
			"gamegear":     "cores/genesis_plus_gx_libretro.dll",
			"saturn":       "cores/mednafen_saturn_libretro.dll",
			"ps1":          "cores/mednafen_psx_hw_libretro.dll",
			"arcade":       "cores/fbneo_libretro.dll",
		},
		ProcessNames: []string{"retroarch.exe", "retroarch"},
	},
	{
		ID:                "dolphin",
		Name:              "Dolphin",
		Description:       "GameCube and Wii emulator",
		Platforms:         []string{"gamecube", "wii"},
		Extensions:        []string{".iso", ".rvz", ".gcm", ".wbfs", ".cso", ".elf", ".dol"},
		DefaultExecutable: "dolphin-emu",
		LaunchTemplate:    []string{"-b", "-e", "{romPath}"},
		FullscreenFlag:    "-b", // batch execution runs direct game
		FullscreenPosition: "before_rom",
		ProcessNames:      []string{"dolphin.exe", "dolphin-emu", "Dolphin"},
	},
	{
		ID:                "pcsx2",
		Name:              "PCSX2",
		Description:       "PlayStation 2 emulator",
		Platforms:         []string{"ps2"},
		Extensions:        []string{".iso", ".chd", ".cso", ".bin", ".gz", ".elf"},
		DefaultExecutable: "pcsx2-qt",
		LaunchTemplate:    []string{"-batch", "{romPath}"},
		FullscreenFlag:    "-fullscreen",
		FullscreenPosition: "before_rom",
		ProcessNames:      []string{"pcsx2-qt.exe", "pcsx2.exe", "pcsx2-qt", "pcsx2"},
	},
	{
		ID:                "rpcs3",
		Name:              "RPCS3",
		Description:       "PlayStation 3 emulator",
		Platforms:         []string{"ps3"},
		Extensions:        []string{".iso", ".pkg", "eboot.bin"},
		DefaultExecutable: "rpcs3",
		LaunchTemplate:    []string{"--no-gui", "{romPath}"},
		FullscreenFlag:    "--fullscreen",
		FullscreenPosition: "append",
		ProcessNames:      []string{"rpcs3.exe", "rpcs3"},
	},
	{
		ID:                "ryujinx",
		Name:              "Ryujinx",
		Description:       "Nintendo Switch emulator",
		Platforms:         []string{"switch"},
		Extensions:        []string{".nsp", ".xci"},
		DefaultExecutable: "ryujinx",
		LaunchTemplate:    []string{"{romPath}"},
		FullscreenFlag:    "--fullscreen",
		FullscreenPosition: "append",
		ProcessNames:      []string{"ryujinx.exe", "ryujinx", "Ryujinx"},
	},
	{
		ID:                "duckstation",
		Name:              "DuckStation",
		Description:       "PlayStation 1 emulator",
		Platforms:         []string{"ps1"},
		Extensions:        []string{".iso", ".chd", ".cue", ".bin", ".pbp", ".m3u"},
		DefaultExecutable: "duckstation-qt",
		LaunchTemplate:    []string{"-batch", "{romPath}"},
		FullscreenFlag:    "-fullscreen",
		FullscreenPosition: "before_rom",
		ProcessNames:      []string{"duckstation-qt-x64-ReleaseLTCG.exe", "duckstation-qt.exe", "duckstation-qt"},
	},
	{
		ID:                "cemu",
		Name:              "Cemu",
		Description:       "Wii U emulator",
		Platforms:         []string{"wiiu"},
		Extensions:        []string{".wua", ".rpx", ".wud"},
		DefaultExecutable: "cemu",
		LaunchTemplate:    []string{"-g", "{romPath}"},
		FullscreenFlag:    "-f",
		FullscreenPosition: "prepend",
		ProcessNames:      []string{"cemu.exe", "cemu", "Cemu"},
	},
	// Additional standard profiles
	{
		ID:                "ppsspp",
		Name:              "PPSSPP",
		Description:       "PlayStation Portable (PSP) emulator",
		Platforms:         []string{"psp"},
		Extensions:        []string{".iso", ".cso", ".pbp"},
		DefaultExecutable: "PPSSPPWindows64.exe",
		LaunchTemplate:    []string{"{romPath}"},
		FullscreenFlag:    "--fullscreen",
		FullscreenPosition: "append",
		ProcessNames:      []string{"ppssppwindows64.exe", "ppsspp.exe", "ppsspp"},
	},
}

// ExtensionToPlatform maps known ROM file extensions to console platform identifiers.
var ExtensionToPlatform = map[string]string{
	".sfc":  "snes",
	".smc":  "snes",
	".nes":  "nes",
	".z64":  "n64",
	".n64":  "n64",
	".v64":  "n64",
	".gb":   "gb",
	".gbc":  "gbc",
	".gba":  "gba",
	".nds":  "nds",
	".3ds":  "3ds",
	".cia":  "3ds",
	".rvz":  "gamecube",
	".gcm":  "gamecube",
	".wbfs": "wii",
	".wua":  "wiiu",
	".rpx":  "wiiu",
	".nsp":  "switch",
	".xci":  "switch",
	".sms":  "mastersystem",
	".gg":   "gamegear",
	".cdi":  "dreamcast",
	".gdi":  "dreamcast",
	".xex":  "xbox360",
}

// EmulatorRegistry maintains registered emulator profiles with concurrent-safe access.
type EmulatorRegistry struct {
	mu       sync.RWMutex
	profiles map[string]EmulatorProfile
}

// NewEmulatorRegistry initializes a registry preloaded with canonical profiles.
func NewEmulatorRegistry() *EmulatorRegistry {
	reg := &EmulatorRegistry{
		profiles: make(map[string]EmulatorProfile),
	}
	for _, p := range CanonicalEmulatorProfiles {
		reg.profiles[p.ID] = p
	}
	return reg
}

// Register adds or updates an emulator profile.
func (r *EmulatorRegistry) Register(profile EmulatorProfile) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.profiles[profile.ID] = profile
}

// Get returns the profile with the given ID.
func (r *EmulatorRegistry) Get(id string) (EmulatorProfile, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.profiles[strings.ToLower(id)]
	return p, ok
}

// All returns a slice of all registered profiles.
func (r *EmulatorRegistry) All() []EmulatorProfile {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]EmulatorProfile, 0, len(r.profiles))
	for _, p := range r.profiles {
		list = append(list, p)
	}
	return list
}

// FindForPlatform finds the first emulator registered to handle the given platform.
func (r *EmulatorRegistry) FindForPlatform(platform string) (EmulatorProfile, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	norm := strings.ToLower(strings.TrimSpace(platform))
	for _, p := range r.profiles {
		for _, plat := range p.Platforms {
			if strings.ToLower(plat) == norm {
				return p, true
			}
		}
	}
	return EmulatorProfile{}, false
}

// FindForROM inspects the extension of a ROM path and returns an appropriate emulator profile.
func (r *EmulatorRegistry) FindForROM(romPath string) (EmulatorProfile, bool) {
	ext := strings.ToLower(filepath.Ext(romPath))
	platform, hasPlat := ExtensionToPlatform[ext]
	if hasPlat {
		return r.FindForPlatform(platform)
	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.profiles {
		for _, e := range p.Extensions {
			if strings.ToLower(e) == ext {
				return p, true
			}
		}
	}
	return EmulatorProfile{}, false
}

// ResolvedEmulatorInvocation contains the resolved binary and command-line arguments.
type ResolvedEmulatorInvocation struct {
	Executable string   `json:"executable"`
	Args       []string `json:"args"`
	WorkingDir string   `json:"working_dir"`
	Profile    EmulatorProfile
}

// BuildEmulatorInvocation constructs the exact executable path and arguments for a launch request.
func BuildEmulatorInvocation(profile EmulatorProfile, req EmulatorLaunchRequest) (*ResolvedEmulatorInvocation, error) {
	if strings.TrimSpace(req.ROMPath) == "" {
		return nil, ErrROMPathRequired
	}

	executable := profile.DefaultExecutable
	if strings.TrimSpace(req.ExecutablePath) != "" {
		executable = req.ExecutablePath
	}

	// Determine platform
	platform := strings.ToLower(strings.TrimSpace(req.Platform))
	if platform == "" {
		ext := strings.ToLower(filepath.Ext(req.ROMPath))
		if p, ok := ExtensionToPlatform[ext]; ok {
			platform = p
		} else if len(profile.Platforms) == 1 {
			platform = profile.Platforms[0]
		}
	}

	// Resolve core if template uses {core}
	resolvedCore := req.Core
	needsCore := false
	for _, t := range profile.LaunchTemplate {
		if strings.Contains(t, "{core}") {
			needsCore = true
			break
		}
	}

	if needsCore && resolvedCore == "" {
		if core, ok := profile.Cores[platform]; ok {
			resolvedCore = core
		} else if len(profile.Cores) > 0 {
			// Try first core if only one exists
			for _, c := range profile.Cores {
				resolvedCore = c
				break
			}
		}
		if resolvedCore == "" {
			return nil, fmt.Errorf("%w for platform %q in emulator %s", ErrCoreRequired, platform, profile.ID)
		}
	}

	// Build arguments according to template
	var args []string
	romInserted := false

	for _, token := range profile.LaunchTemplate {
		if strings.Contains(token, "{romPath}") {
			// If fullscreen needs to be before rom (e.g. PCSX2, DuckStation)
			if req.Fullscreen && profile.FullscreenFlag != "" && profile.FullscreenPosition == "before_rom" {
				if !contains(args, profile.FullscreenFlag) {
					args = append(args, profile.FullscreenFlag)
				}
			}
			formatted := strings.ReplaceAll(token, "{romPath}", req.ROMPath)
			args = append(args, formatted)
			romInserted = true
		} else if strings.Contains(token, "{core}") {
			formatted := strings.ReplaceAll(token, "{core}", resolvedCore)
			args = append(args, formatted)
		} else {
			args = append(args, token)
		}
	}

	if !romInserted {
		if req.Fullscreen && profile.FullscreenFlag != "" && profile.FullscreenPosition == "before_rom" {
			if !contains(args, profile.FullscreenFlag) {
				args = append(args, profile.FullscreenFlag)
			}
		}
		args = append(args, req.ROMPath)
	}

	// Prepend fullscreen if position is "prepend" (e.g. Cemu -f -g <rom>)
	if req.Fullscreen && profile.FullscreenFlag != "" && profile.FullscreenPosition == "prepend" {
		if !contains(args, profile.FullscreenFlag) {
			args = append([]string{profile.FullscreenFlag}, args...)
		}
	}

	// Append fullscreen if position is "append" or unspecified (e.g. RetroArch, RPCS3, Ryujinx)
	if req.Fullscreen && profile.FullscreenFlag != "" && (profile.FullscreenPosition == "append" || profile.FullscreenPosition == "") {
		if !contains(args, profile.FullscreenFlag) {
			args = append(args, profile.FullscreenFlag)
		}
	}

	// Append extra custom args
	if len(req.ExtraArgs) > 0 {
		args = append(args, req.ExtraArgs...)
	}

	workingDir := filepath.Dir(executable)
	if workingDir == "." || workingDir == "" {
		workingDir = filepath.Dir(req.ROMPath)
	}

	return &ResolvedEmulatorInvocation{
		Executable: executable,
		Args:       args,
		WorkingDir: workingDir,
		Profile:    profile,
	}, nil
}

func contains(slice []string, val string) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}
