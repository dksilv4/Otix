package explorer

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestIsSafeFolderName(t *testing.T) {
	valid := []string{"Games", "My Saves", "ISO_Files-2024", "SteamLibrary"}
	for _, v := range valid {
		if !IsSafeFolderName(v) {
			t.Errorf("expected %q to be safe", v)
		}
	}

	invalid := []string{"", "   ", "a/b", "a\\b", "a..b", "c:d", "a\x00b"}
	for _, inv := range invalid {
		if IsSafeFolderName(inv) {
			t.Errorf("expected %q to be unsafe", inv)
		}
	}
}

func TestGetSystemShortcuts(t *testing.T) {
	shortcuts := GetSystemShortcuts()
	if len(shortcuts) == 0 {
		t.Errorf("expected at least one system shortcut")
	}

	foundRootOrHome := false
	for _, sc := range shortcuts {
		if sc.Icon == "home" || sc.Icon == "root" || sc.Icon == "volumes" {
			foundRootOrHome = true
			break
		}
	}
	if !foundRootOrHome {
		t.Errorf("expected at least one home or root/volume shortcut, got %+v", shortcuts)
	}
}

func TestSanitizeAndResolvePath(t *testing.T) {
	tmpDir := t.TempDir()

	// Empty string with baseDir
	res, err := SanitizeAndResolvePath("", tmpDir)
	if err != nil || res != tmpDir {
		t.Errorf("expected baseDir %q, got %q, err=%v", tmpDir, res, err)
	}

	// "." with baseDir
	res, err = SanitizeAndResolvePath(".", tmpDir)
	if err != nil || res != tmpDir {
		t.Errorf("expected baseDir %q, got %q, err=%v", tmpDir, res, err)
	}

	// Root "/"
	res, err = SanitizeAndResolvePath("/", tmpDir)
	if err != nil || res != "/" {
		t.Errorf("expected /, got %q", res)
	}

	// Relative path to baseDir
	res, err = SanitizeAndResolvePath("subfolder", tmpDir)
	expectedSub := filepath.Join(tmpDir, "subfolder")
	if err != nil || res != expectedSub {
		t.Errorf("expected %q, got %q, err=%v", expectedSub, res, err)
	}

	// Home "~"
	home, _ := os.UserHomeDir()
	if home != "" {
		res, err = SanitizeAndResolvePath("~", tmpDir)
		if err != nil || res != home {
			t.Errorf("expected home %q, got %q, err=%v", home, res, err)
		}

		res, err = SanitizeAndResolvePath("~/test", tmpDir)
		if err != nil || res != filepath.Join(home, "test") {
			t.Errorf("expected ~/test to resolve to %q, got %q", filepath.Join(home, "test"), res)
		}
	}
}

func TestInspectDirectory(t *testing.T) {
	tmpDir := t.TempDir()

	// Non-existent directory
	_, err := InspectDirectory(filepath.Join(tmpDir, "missing"), "", tmpDir)
	if err == nil {
		t.Errorf("expected error for non-existent directory")
	}

	// File instead of directory
	filePath := filepath.Join(tmpDir, "testfile.txt")
	_ = os.WriteFile(filePath, []byte("hello"), 0644)
	_, err = InspectDirectory(filePath, "", tmpDir)
	if err == nil {
		t.Errorf("expected error when target is a file")
	}

	// Dedicated browse directory
	browseDir := filepath.Join(tmpDir, "browse")
	_ = os.Mkdir(browseDir, 0755)

	activeDL := filepath.Join(browseDir, "downloads")
	_ = os.Mkdir(activeDL, 0755)
	alphaDir := filepath.Join(browseDir, "alpha_dir")
	_ = os.Mkdir(alphaDir, 0755)

	// Hidden file (should be ignored)
	_ = os.WriteFile(filepath.Join(browseDir, ".DS_Store"), []byte("noise"), 0644)

	// Game file
	_ = os.WriteFile(filepath.Join(browseDir, "game.iso"), make([]byte, 1024), 0644)
	// Text file
	_ = os.WriteFile(filepath.Join(browseDir, "notes.txt"), []byte("notes"), 0644)

	resp, err := InspectDirectory(browseDir, activeDL, browseDir)
	if err != nil {
		t.Fatalf("InspectDirectory failed: %v", err)
	}

	if resp.CurrentPath != browseDir {
		t.Errorf("expected CurrentPath %q, got %q", browseDir, resp.CurrentPath)
	}
	if resp.TotalItems != 4 { // alpha_dir, downloads, game.iso, notes.txt
		t.Fatalf("expected 4 items (ignoring .DS_Store), got %d: %+v", resp.TotalItems, resp.Entries)
	}

	// Verify directory sorting (directories first, then files, both alphabetical)
	if !resp.Entries[0].IsDir || resp.Entries[0].Name != "alpha_dir" {
		t.Errorf("expected first entry to be directory alpha_dir, got %+v", resp.Entries[0])
	}
	if !resp.Entries[1].IsDir || resp.Entries[1].Name != "downloads" {
		t.Errorf("expected second entry to be directory downloads, got %+v", resp.Entries[1])
	}
	if !resp.Entries[1].IsDownloadLocation {
		t.Errorf("expected downloads entry to have IsDownloadLocation = true")
	}

	if resp.Entries[2].IsDir || resp.Entries[2].Name != "game.iso" || !resp.Entries[2].IsDownloadable {
		t.Errorf("expected third entry to be downloadable game.iso, got %+v", resp.Entries[2])
	}
	if resp.Entries[3].IsDir || resp.Entries[3].Name != "notes.txt" {
		t.Errorf("expected fourth entry to be notes.txt, got %+v", resp.Entries[3])
	}

	if resp.DiskFreeBytes == nil || resp.DiskTotalBytes == nil {
		t.Errorf("expected non-nil disk usage pointers")
	}
}

func TestRequestFolderPermission(t *testing.T) {
	tmpDir := t.TempDir()

	res, err := RequestFolderPermission(tmpDir)
	if err != nil {
		t.Fatalf("RequestFolderPermission failed: %v", err)
	}
	if !res.Granted {
		t.Errorf("expected permission to be granted for existing tmpDir")
	}

	if runtime.GOOS != "darwin" {
		// Non-existent directory
		res, err = RequestFolderPermission(filepath.Join(tmpDir, "missing", "folder"))
		if err != nil || res.Granted {
			t.Errorf("expected non-granted permission for non-existent folder, got %+v, err=%v", res, err)
		}
	}
}


func TestSanitizeNetworkSharePath(t *testing.T) {
	// Test SMB URL parsing
	res, err := SanitizeAndResolvePath("smb://192.168.1.100/games", "")
	if err != nil {
		t.Fatalf("expected smb:// to resolve, got error: %v", err)
	}
	if runtime.GOOS == "windows" {
		expected := `\\192.168.1.100\games`
		if res != expected {
			t.Errorf("expected %q, got %q", expected, res)
		}
	} else {
		if !strings.Contains(res, "192.168.1.100") && !strings.Contains(res, "games") {
			t.Errorf("expected path containing host/share, got %q", res)
		}
	}

	// Test UNC path resolution
	uncRes, err := SanitizeAndResolvePath(`\\nas.local\games\sub`, "")
	if err != nil {
		t.Fatalf("expected UNC path to resolve, got error: %v", err)
	}
	if runtime.GOOS == "windows" {
		expected := `\\nas.local\games\sub`
		if uncRes != expected {
			t.Errorf("expected %q, got %q", expected, uncRes)
		}
	}
}

func TestConnectShareValidation(t *testing.T) {
	// Empty URL should return error
	_, err := ConnectShare(ConnectShareRequest{})
	if err == nil {
		t.Errorf("expected error when URL is empty")
	}

	// Existing directory as share
	tmpDir := t.TempDir()
	res, err := ConnectShare(ConnectShareRequest{URL: tmpDir})
	if err != nil {
		t.Fatalf("ConnectShare with local tmpDir failed: %v", err)
	}
	if res.Status != "connected" {
		t.Errorf("expected status 'connected', got %q", res.Status)
	}

	// Verify it was added to connected network shares and appears in GetConnectedNetworkShares
	shares := GetConnectedNetworkShares()
	found := false
	for _, s := range shares {
		if s.Path == res.Path {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected connected share %q in GetConnectedNetworkShares", res.Path)
	}

	drives := GetSystemDrives()
	foundInDrives := false
	for _, d := range drives {
		if d.Path == res.Path {
			foundInDrives = true
			if !d.IsNetwork {
				t.Errorf("expected drive to be marked as network drive")
			}
			break
		}
	}
	if !foundInDrives {
		t.Errorf("expected connected share %q to appear in GetSystemDrives", res.Path)
	}
}

func TestParseShareTarget(t *testing.T) {
	// 1. Windows UNC
	p1 := parseShareTarget(`\\192.168.1.58\Games\SubFolder`, ConnectShareRequest{})
	if p1.Host != "192.168.1.58" || p1.ShareName != "Games" || p1.SubPath != "SubFolder" {
		t.Errorf("unexpected p1: %+v", p1)
	}

	// 2. Forward slash UNC
	p2 := parseShareTarget(`//192.168.1.58/Games`, ConnectShareRequest{})
	if p2.Host != "192.168.1.58" || p2.ShareName != "Games" || p2.SubPath != "" {
		t.Errorf("unexpected p2: %+v", p2)
	}

	// 3. SMB URL with credentials and workgroup
	p3 := parseShareTarget(`smb://WORKGROUP;dk:mypassword@192.168.1.58/Games/ROMs`, ConnectShareRequest{})
	if p3.Host != "192.168.1.58" || p3.ShareName != "Games" || p3.SubPath != "ROMs" ||
		p3.Username != "dk" || p3.Password != "mypassword" || p3.Workgroup != "WORKGROUP" {
		t.Errorf("unexpected p3: %+v", p3)
	}

	// 4. macOS /Volumes/ path
	p4 := parseShareTarget(`/Volumes/Games/Half-Life`, ConnectShareRequest{})
	if !p4.IsLocalVolume || p4.ShareName != "Games" || p4.SubPath != "Half-Life" {
		t.Errorf("unexpected p4: %+v", p4)
	}

	// 5. Host only with separate ShareName
	p5 := parseShareTarget(`192.168.1.58`, ConnectShareRequest{ShareName: "Downloads"})
	if p5.Host != "192.168.1.58" || p5.ShareName != "Downloads" {
		t.Errorf("unexpected p5: %+v", p5)
	}
}

func TestSanitizeAndResolvePathDarwin(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("skipping macOS path resolution test on non-darwin")
	}

	// When UNC is passed on macOS, it resolves to /Volumes/<Share>
	res, err := SanitizeAndResolvePath(`\\192.168.1.58\NonExistentShare\SubDir`, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := filepath.Join("/Volumes", "NonExistentShare", "SubDir")
	if res != expected {
		t.Errorf("expected %q, got %q", expected, res)
	}

	// When smb:// is passed on macOS, it resolves to /Volumes/<Share>
	resSMB, err := SanitizeAndResolvePath(`smb://192.168.1.58/NonExistentShare`, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectedSMB := filepath.Join("/Volumes", "NonExistentShare")
	if resSMB != expectedSMB {
		t.Errorf("expected %q, got %q", expectedSMB, resSMB)
	}
}

func TestConnectShareDarwinMounted(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("skipping macOS connect share test on non-darwin")
	}
	if !dirExists("/Volumes/Games") {
		t.Skip("/Volumes/Games is not mounted, skipping live test")
	}

	res, err := ConnectShare(ConnectShareRequest{URL: `\\192.168.1.58\Games`})
	if err != nil {
		t.Fatalf("ConnectShare failed: %v", err)
	}
	if res.Path != "/Volumes/Games" {
		t.Errorf("expected path /Volumes/Games, got %q", res.Path)
	}
	if res.Status != "connected" {
		t.Errorf("expected status 'connected', got %q", res.Status)
	}
}

func TestConnectShareDarwinUnmounted(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("skipping macOS connect share test on non-darwin")
	}

	res, err := ConnectShare(ConnectShareRequest{URL: `\\192.168.1.58\Emulators`})
	if err != nil {
		t.Fatalf("ConnectShare failed: %v", err)
	}
	if res.Path != "/Volumes/Emulators" {
		t.Errorf("expected path /Volumes/Emulators, got %q", res.Path)
	}
	if res.Status != "connected" {
		t.Errorf("expected status 'connected', got %q", res.Status)
	}
	defer exec.Command("diskutil", "unmount", "/Volumes/Emulators").Run()
}
