package launcher

import (
	"reflect"
	"testing"
)

func TestCanonicalEmulatorProfilesRegistered(t *testing.T) {
	reg := NewEmulatorRegistry()

	canonicalIDs := []string{
		"retroarch",
		"dolphin",
		"pcsx2",
		"rpcs3",
		"ryujinx",
		"duckstation",
		"cemu",
	}

	for _, id := range canonicalIDs {
		p, found := reg.Get(id)
		if !found {
			t.Fatalf("expected canonical emulator profile %s to be registered", id)
		}
		if p.ID != id {
			t.Fatalf("expected profile ID %s, got %s", id, p.ID)
		}
		if p.DefaultExecutable == "" {
			t.Fatalf("expected default executable for %s", id)
		}
		if len(p.Platforms) == 0 {
			t.Fatalf("expected platforms for %s", id)
		}
		if len(p.LaunchTemplate) == 0 {
			t.Fatalf("expected launch template for %s", id)
		}
	}
}

func TestRetroArchInvocationBuilder(t *testing.T) {
	reg := NewEmulatorRegistry()
	profile, _ := reg.Get("retroarch")

	// 1. Standard SNES launch with default core
	req := EmulatorLaunchRequest{
		EmulatorID: "retroarch",
		ROMPath:    "/roms/snes/SuperMarioWorld.sfc",
		Platform:   "snes",
		Fullscreen: false,
	}

	inv, err := BuildEmulatorInvocation(profile, req)
	if err != nil {
		t.Fatalf("unexpected error building RetroArch invocation: %v", err)
	}

	expectedArgs := []string{"-L", "cores/snes9x_libretro.dll", "/roms/snes/SuperMarioWorld.sfc"}
	if !reflect.DeepEqual(inv.Args, expectedArgs) {
		t.Fatalf("expected args %v, got %v", expectedArgs, inv.Args)
	}

	// 2. Custom core, fullscreen and extra arguments
	reqCustom := EmulatorLaunchRequest{
		EmulatorID:     "retroarch",
		ExecutablePath: "/opt/bin/retroarch",
		ROMPath:        "/roms/n64/Mario64.z64",
		Platform:       "n64",
		Core:           "/custom/cores/parallel_n64.dylib",
		Fullscreen:     true,
		ExtraArgs:      []string{"--verbose", "--record", "/tmp/demo.mkv"},
	}

	invCustom, err := BuildEmulatorInvocation(profile, reqCustom)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if invCustom.Executable != "/opt/bin/retroarch" {
		t.Fatalf("expected custom executable /opt/bin/retroarch, got %s", invCustom.Executable)
	}

	expectedCustomArgs := []string{
		"-L", "/custom/cores/parallel_n64.dylib",
		"/roms/n64/Mario64.z64",
		"--fullscreen",
		"--verbose", "--record", "/tmp/demo.mkv",
	}
	if !reflect.DeepEqual(invCustom.Args, expectedCustomArgs) {
		t.Fatalf("expected args %v, got %v", expectedCustomArgs, invCustom.Args)
	}
}

func TestDolphinInvocationBuilder(t *testing.T) {
	reg := NewEmulatorRegistry()
	profile, _ := reg.Get("dolphin")

	req := EmulatorLaunchRequest{
		EmulatorID: "dolphin",
		ROMPath:    "C:/Roms/GameCube/Melee.rvz",
		Platform:   "gamecube",
		Fullscreen: true,
	}

	inv, err := BuildEmulatorInvocation(profile, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expected := []string{"-b", "-e", "C:/Roms/GameCube/Melee.rvz"}
	if !reflect.DeepEqual(inv.Args, expected) {
		t.Fatalf("expected args %v, got %v", expected, inv.Args)
	}
}

func TestPCSX2InvocationBuilder(t *testing.T) {
	reg := NewEmulatorRegistry()
	profile, _ := reg.Get("pcsx2")

	// Standard windowed
	req := EmulatorLaunchRequest{
		EmulatorID: "pcsx2",
		ROMPath:    "/roms/ps2/GranTurismo4.iso",
		Platform:   "ps2",
		Fullscreen: false,
	}
	inv, err := BuildEmulatorInvocation(profile, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := []string{"-batch", "/roms/ps2/GranTurismo4.iso"}
	if !reflect.DeepEqual(inv.Args, expected) {
		t.Fatalf("expected args %v, got %v", expected, inv.Args)
	}

	// Fullscreen
	reqFullscreen := EmulatorLaunchRequest{
		EmulatorID: "pcsx2",
		ROMPath:    "/roms/ps2/GranTurismo4.iso",
		Platform:   "ps2",
		Fullscreen: true,
	}
	invFs, err := BuildEmulatorInvocation(profile, reqFullscreen)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectedFs := []string{"-batch", "-fullscreen", "/roms/ps2/GranTurismo4.iso"}
	if !reflect.DeepEqual(invFs.Args, expectedFs) {
		t.Fatalf("expected args %v, got %v", expectedFs, invFs.Args)
	}
}

func TestRPCS3InvocationBuilder(t *testing.T) {
	reg := NewEmulatorRegistry()
	profile, _ := reg.Get("rpcs3")

	req := EmulatorLaunchRequest{
		EmulatorID: "rpcs3",
		ROMPath:    "/roms/ps3/DemonSouls.iso",
		Platform:   "ps3",
		Fullscreen: true,
	}
	inv, err := BuildEmulatorInvocation(profile, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expected := []string{"--no-gui", "/roms/ps3/DemonSouls.iso", "--fullscreen"}
	if !reflect.DeepEqual(inv.Args, expected) {
		t.Fatalf("expected args %v, got %v", expected, inv.Args)
	}
}

func TestRyujinxInvocationBuilder(t *testing.T) {
	reg := NewEmulatorRegistry()
	profile, _ := reg.Get("ryujinx")

	req := EmulatorLaunchRequest{
		EmulatorID: "ryujinx",
		ROMPath:    "/roms/switch/ZeldaTOTK.nsp",
		Platform:   "switch",
		Fullscreen: true,
	}
	inv, err := BuildEmulatorInvocation(profile, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expected := []string{"/roms/switch/ZeldaTOTK.nsp", "--fullscreen"}
	if !reflect.DeepEqual(inv.Args, expected) {
		t.Fatalf("expected args %v, got %v", expected, inv.Args)
	}
}

func TestDuckStationInvocationBuilder(t *testing.T) {
	reg := NewEmulatorRegistry()
	profile, _ := reg.Get("duckstation")

	req := EmulatorLaunchRequest{
		EmulatorID: "duckstation",
		ROMPath:    "/roms/ps1/CastlevaniaSOTN.chd",
		Platform:   "ps1",
		Fullscreen: true,
	}
	inv, err := BuildEmulatorInvocation(profile, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expected := []string{"-batch", "-fullscreen", "/roms/ps1/CastlevaniaSOTN.chd"}
	if !reflect.DeepEqual(inv.Args, expected) {
		t.Fatalf("expected args %v, got %v", expected, inv.Args)
	}
}

func TestCemuInvocationBuilder(t *testing.T) {
	reg := NewEmulatorRegistry()
	profile, _ := reg.Get("cemu")

	// Windowed
	req := EmulatorLaunchRequest{
		EmulatorID: "cemu",
		ROMPath:    "/roms/wiiu/ZeldaBOTW.wua",
		Platform:   "wiiu",
		Fullscreen: false,
	}
	inv, err := BuildEmulatorInvocation(profile, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := []string{"-g", "/roms/wiiu/ZeldaBOTW.wua"}
	if !reflect.DeepEqual(inv.Args, expected) {
		t.Fatalf("expected args %v, got %v", expected, inv.Args)
	}

	// Fullscreen (prepends -f)
	reqFs := EmulatorLaunchRequest{
		EmulatorID: "cemu",
		ROMPath:    "/roms/wiiu/ZeldaBOTW.wua",
		Platform:   "wiiu",
		Fullscreen: true,
	}
	invFs, err := BuildEmulatorInvocation(profile, reqFs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectedFs := []string{"-f", "-g", "/roms/wiiu/ZeldaBOTW.wua"}
	if !reflect.DeepEqual(invFs.Args, expectedFs) {
		t.Fatalf("expected args %v, got %v", expectedFs, invFs.Args)
	}
}

func TestDetectEmulatorForROMAndPlatform(t *testing.T) {
	reg := NewEmulatorRegistry()

	// By ROM extension
	p1, ok1 := reg.FindForROM("/path/to/game.nsp")
	if !ok1 || p1.ID != "ryujinx" {
		t.Fatalf("expected ryujinx for .nsp, got %s (ok=%v)", p1.ID, ok1)
	}

	p2, ok2 := reg.FindForROM("/path/to/game.rvz")
	if !ok2 || p2.ID != "dolphin" {
		t.Fatalf("expected dolphin for .rvz, got %s (ok=%v)", p2.ID, ok2)
	}

	p3, ok3 := reg.FindForROM("/path/to/game.wua")
	if !ok3 || p3.ID != "cemu" {
		t.Fatalf("expected cemu for .wua, got %s (ok=%v)", p3.ID, ok3)
	}

	// By Platform name
	p4, ok4 := reg.FindForPlatform("ps2")
	if !ok4 || p4.ID != "pcsx2" {
		t.Fatalf("expected pcsx2 for ps2, got %s", p4.ID)
	}

	p5, ok5 := reg.FindForPlatform("ps3")
	if !ok5 || p5.ID != "rpcs3" {
		t.Fatalf("expected rpcs3 for ps3, got %s", p5.ID)
	}
}

func TestEmulatorInvocationErrors(t *testing.T) {
	reg := NewEmulatorRegistry()
	profile, _ := reg.Get("retroarch")

	// Empty ROM path
	_, err := BuildEmulatorInvocation(profile, EmulatorLaunchRequest{
		ROMPath: "",
	})
	if err != ErrROMPathRequired {
		t.Fatalf("expected ErrROMPathRequired, got %v", err)
	}

	// Unknown platform for RetroArch without explicit core
	customProfile := EmulatorProfile{
		ID:             "custom_retro",
		LaunchTemplate: []string{"-L", "{core}", "{romPath}"},
		Cores:          map[string]string{}, // empty cores
	}
	_, err = BuildEmulatorInvocation(customProfile, EmulatorLaunchRequest{
		ROMPath:  "/roms/unknown/game.bin",
		Platform: "unknown_plat",
	})
	if err == nil {
		t.Fatal("expected error when core is missing for template requiring {core}")
	}
}
