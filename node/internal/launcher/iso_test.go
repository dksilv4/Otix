package launcher

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestMockISOMounter(t *testing.T) {
	ctx := context.Background()
	mounter := NewMockISOMounter()

	res, err := mounter.Mount(ctx, "/path/to/game.iso")
	if err != nil {
		t.Fatalf("unexpected error mounting mock ISO: %v", err)
	}
	if res.ISOPath != "/path/to/game.iso" {
		t.Fatalf("expected ISO path /path/to/game.iso, got %s", res.ISOPath)
	}
	if res.MountPoint == "" {
		t.Fatal("expected non-empty mount point")
	}
	if !res.MountedByOtix {
		t.Fatal("expected MountedByOtix to be true")
	}
	if mounter.MountedCount() != 1 {
		t.Fatalf("expected 1 mounted count, got %d", mounter.MountedCount())
	}

	// Unmount
	if err := mounter.Unmount(ctx, res.MountPoint); err != nil {
		t.Fatalf("unexpected error unmounting: %v", err)
	}
	if mounter.MountedCount() != 0 {
		t.Fatalf("expected 0 mounted count, got %d", mounter.MountedCount())
	}

	// Unmount non-existent
	if err := mounter.Unmount(ctx, "/Volumes/NonExistent"); !errors.Is(err, ErrMountPointNotFound) {
		t.Fatalf("expected ErrMountPointNotFound, got %v", err)
	}

	// Error simulation
	simErr := errors.New("simulated I/O disk error")
	mounter.SetSimulateError(simErr)
	_, err = mounter.Mount(ctx, "/path/to/game.iso")
	if !errors.Is(err, simErr) {
		t.Fatalf("expected simulated error, got %v", err)
	}
}

func TestMacOSParseHdiutilOutput(t *testing.T) {
	// Sample hdiutil output
	sampleOutput := `/dev/disk4          GUID_partition_scheme
/dev/disk4s1        EFI
/dev/disk4s2        Apple_HFS                       /Volumes/EldenRingDisc`

	mountPoint, err := ParseHdiutilMountOutput(sampleOutput)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	expected := "/Volumes/EldenRingDisc"
	if mountPoint != expected {
		t.Fatalf("expected %s, got %s", expected, mountPoint)
	}

	// Invalid output without /Volumes/
	_, err = ParseHdiutilMountOutput("no volume here")
	if err == nil {
		t.Fatal("expected error parsing output without /Volumes/")
	}
}

func TestMacOSISOMounterWithMockExecutor(t *testing.T) {
	ctx := context.Background()
	tmpDir := t.TempDir()
	isoFile := filepath.Join(tmpDir, "test.iso")
	if err := os.WriteFile(isoFile, []byte("fake-iso-bytes"), 0644); err != nil {
		t.Fatalf("failed to write test iso: %v", err)
	}

	mockExec := func(ctx context.Context, name string, args ...string) ([]byte, error) {
		if name == "hdiutil" && args[0] == "attach" {
			return []byte("/dev/disk5s1  Apple_HFS  /Volumes/TestVolume"), nil
		}
		if name == "hdiutil" && args[0] == "detach" {
			return []byte("detached"), nil
		}
		return nil, errors.New("unknown command")
	}

	mounter := NewMacOSISOMounter(mockExec)

	res, err := mounter.Mount(ctx, isoFile)
	if err != nil {
		t.Fatalf("unexpected mount error: %v", err)
	}
	if res.MountPoint != "/Volumes/TestVolume" {
		t.Fatalf("expected /Volumes/TestVolume, got %s", res.MountPoint)
	}

	if err := mounter.Unmount(ctx, res.MountPoint); err != nil {
		t.Fatalf("unexpected unmount error: %v", err)
	}

	// Non-existent ISO file check
	_, err = mounter.Mount(ctx, filepath.Join(tmpDir, "nonexistent.iso"))
	if !errors.Is(err, ErrISONotFound) {
		t.Fatalf("expected ErrISONotFound, got %v", err)
	}
}

func TestWindowsParsePowerShellOutput(t *testing.T) {
	sampleOutput := `
E
`
	drive, err := ParsePowerShellMountOutput(sampleOutput)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	if drive != `E:\` {
		t.Fatalf("expected E:\\, got %s", drive)
	}

	// Lowercase drive letter
	driveLower, err := ParsePowerShellMountOutput("g\r\n")
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	if driveLower != `G:\` {
		t.Fatalf("expected G:\\, got %s", driveLower)
	}

	// Invalid output without drive letter
	_, err = ParsePowerShellMountOutput("No drives found")
	if err == nil {
		t.Fatal("expected error parsing output without drive letter")
	}
}

func TestWindowsISOMounterWithMockExecutor(t *testing.T) {
	ctx := context.Background()
	tmpDir := t.TempDir()
	isoFile := filepath.Join(tmpDir, "game.iso")
	if err := os.WriteFile(isoFile, []byte("fake-iso-bytes"), 0644); err != nil {
		t.Fatalf("failed to write test iso: %v", err)
	}

	mockExec := func(ctx context.Context, name string, args ...string) ([]byte, error) {
		if name == "powershell.exe" {
			for _, arg := range args {
				if len(arg) > 0 && arg[:5] == "Mount" {
					return []byte("F\r\n"), nil
				}
				if len(arg) > 0 && arg[:3] == "Get" {
					return []byte("Dismounted"), nil
				}
			}
		}
		return []byte("F\r\n"), nil
	}

	mounter := NewWindowsISOMounter(mockExec)

	res, err := mounter.Mount(ctx, isoFile)
	if err != nil {
		t.Fatalf("unexpected mount error: %v", err)
	}
	if res.MountPoint != `F:\` {
		t.Fatalf("expected F:\\, got %s", res.MountPoint)
	}

	if err := mounter.Unmount(ctx, res.MountPoint); err != nil {
		t.Fatalf("unexpected unmount error: %v", err)
	}

	// Missing ISO
	_, err = mounter.Mount(ctx, filepath.Join(tmpDir, "missing.iso"))
	if !errors.Is(err, ErrISONotFound) {
		t.Fatalf("expected ErrISONotFound, got %v", err)
	}
}

func TestFindInstallerOrExecutable(t *testing.T) {
	tmpDir := t.TempDir()

	// Priority: setup.exe over random.exe and noise
	_ = os.WriteFile(filepath.Join(tmpDir, "unins000.exe"), []byte(""), 0755)
	_ = os.WriteFile(filepath.Join(tmpDir, "dxsetup.exe"), []byte(""), 0755)
	_ = os.WriteFile(filepath.Join(tmpDir, "extra.exe"), []byte(""), 0755)
	setupExe := filepath.Join(tmpDir, "setup.exe")
	_ = os.WriteFile(setupExe, []byte(""), 0755)

	target, err := FindInstallerOrExecutable(tmpDir)
	if err != nil {
		t.Fatalf("unexpected error finding executable: %v", err)
	}
	if target != setupExe {
		t.Fatalf("expected %s, got %s", setupExe, target)
	}

	// macOS .app bundle detection
	tmpMac := t.TempDir()
	appBundle := filepath.Join(tmpMac, "CoolGame.app")
	if err := os.MkdirAll(appBundle, 0755); err != nil {
		t.Fatalf("failed to create app bundle dir: %v", err)
	}

	targetMac, err := FindInstallerOrExecutable(tmpMac)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if targetMac != appBundle {
		t.Fatalf("expected app bundle %s, got %s", appBundle, targetMac)
	}

	// Empty dir returns error
	emptyDir := t.TempDir()
	_, err = FindInstallerOrExecutable(emptyDir)
	if err == nil {
		t.Fatal("expected error finding executable in empty dir")
	}
}

func TestPlatformISOMounterInstantiation(t *testing.T) {
	mounter := NewPlatformISOMounter()
	if mounter == nil {
		t.Fatal("expected non-nil platform mounter")
	}
}
