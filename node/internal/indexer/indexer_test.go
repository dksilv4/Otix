package indexer_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/indexer"
)

func TestFormatCategorization(t *testing.T) {
	tests := []struct {
		ext      string
		expected string
	}{
		{".iso", "iso"},
		{".img", "iso"},
		{".exe", "installer"},
		{".dmg", "installer"},
		{".pkg", "installer"},
		{".app", "game"},
		{".zip", "archive"},
		{".rar", "archive"},
		{".7z", "archive"},
		{".nsp", "rom"},
		{".chd", "rom"},
		{".rvz", "rom"},
		{".wbfs", "rom"},
		{".txt", "file"},
	}

	for _, tt := range tests {
		res := indexer.DetermineFormatCategory(tt.ext)
		if res != tt.expected {
			t.Errorf("ext %s: expected %s, got %s", tt.ext, tt.expected, res)
		}
	}
}

func TestCleanTitleFromFilename(t *testing.T) {
	tests := []struct {
		filename string
		expected string
	}{
		{"Cyberpunk.2077.v1.0.repack-fitgirl.iso", "Cyberpunk 2077"},
		{"Elden_Ring_dodi_repack.exe", "Elden Ring"},
		{"Super_Mario_64.iso", "Super Mario 64"},
		{"Hades.II.macOS.v1.0.dmg", "Hades Ii"},
	}

	for _, tt := range tests {
		res := indexer.CleanTitleFromFilename(tt.filename)
		if res != tt.expected {
			t.Errorf("file %s: expected %q, got %q", tt.filename, tt.expected, res)
		}
	}
}

func TestDetectInstallerType(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_installer_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// 1. By filename pattern
	if got := indexer.DetectInstallerType("", "setup.exe"); got != "installer" {
		t.Errorf("expected installer for setup.exe, got %q", got)
	}
	if got := indexer.DetectInstallerType("", "Elden_Ring_FitGirl_Repack.exe"); got != "installer" {
		t.Errorf("expected installer for FitGirl repack, got %q", got)
	}
	if got := indexer.DetectInstallerType("", "Cyberpunk_dodi_setup.exe"); got != "installer" {
		t.Errorf("expected installer for dodi setup, got %q", got)
	}

	// 2. By header sniffing (Inno Setup)
	innoPath := filepath.Join(tmpDir, "custom_named_tool.exe")
	_ = os.WriteFile(innoPath, []byte("MZ.....This program cannot be run in DOS mode...Inno Setup SetupLdr version 6.0"), 0644)
	if got := indexer.DetectInstallerType(innoPath, "custom_named_tool.exe"); got != "installer" {
		t.Errorf("expected installer via Inno Setup header, got %q", got)
	}

	// 3. By companion bin files
	compDir := filepath.Join(tmpDir, "game_folder")
	_ = os.MkdirAll(compDir, 0755)
	compExe := filepath.Join(compDir, "game.exe")
	_ = os.WriteFile(compExe, []byte("regular bytes"), 0644)
	_ = os.WriteFile(filepath.Join(compDir, "setup-1.bin"), []byte("payload"), 0644)
	if got := indexer.DetectInstallerType(compExe, "game.exe"); got != "installer" {
		t.Errorf("expected installer due to companion setup-1.bin, got %q", got)
	}

	// 4. Regular game executable
	regularExe := filepath.Join(tmpDir, "HollowKnight.exe")
	_ = os.WriteFile(regularExe, []byte("regular game executable bytes"), 0644)
	if got := indexer.DetectInstallerType(regularExe, "HollowKnight.exe"); got != "" {
		t.Errorf("expected empty string for regular game executable, got %q", got)
	}
}

func TestNoiseAndUtilityFiltering(t *testing.T) {
	noiseTests := []struct {
		filename string
		path     string
		isNoise  bool
	}{
		{"CrashReporter.exe", "/Games/Witcher 3/bin/x64/CrashReporter.exe", true},
		{"UnityCrashHandler64.exe", "/Games/OuterWilds/UnityCrashHandler64.exe", true},
		{"vcredist_x64.exe", "/Games/DirectX/vcredist_x64.exe", true},
		{"dxsetup.exe", "/Games/DirectX/dxsetup.exe", true},
		{"unins000.exe", "/Games/Hollow Knight/unins000.exe", true},
		{"witcher3.exe", "/Games/Witcher 3/bin/x64/witcher3.exe", false},
		{"HollowKnight.exe", "/Games/Hollow Knight/HollowKnight.exe", false},
	}

	for _, tt := range noiseTests {
		res := indexer.IsNoiseOrUtilityExecutable(tt.filename, tt.path)
		if res != tt.isNoise {
			t.Errorf("file %s (path %s): expected isNoise=%v, got %v", tt.filename, tt.path, tt.isNoise, res)
		}
	}
}

func TestStorageIndexerScanning(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_indexer_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// 1. Installer directory with setup.exe and companion .bin files
	cpDir := filepath.Join(tmpDir, "Cyberpunk 2077")
	_ = os.MkdirAll(cpDir, 0755)
	_ = os.WriteFile(filepath.Join(cpDir, "setup.exe"), []byte("setup bytes"), 0644)
	_ = os.WriteFile(filepath.Join(cpDir, "setup-1.bin"), []byte("payload 1"), 0644)
	_ = os.WriteFile(filepath.Join(cpDir, "setup-2.bin"), []byte("payload 2"), 0644)

	// 2. Installed game directory with game exe, crash reporter, redist, unins
	w3Dir := filepath.Join(tmpDir, "The Witcher 3", "bin", "x64")
	_ = os.MkdirAll(w3Dir, 0755)
	// Create simulated game binary (>10MB to verify size scoring)
	w3Exe := filepath.Join(w3Dir, "witcher3.exe")
	fW3, _ := os.Create(w3Exe)
	_ = fW3.Truncate(15 * 1024 * 1024) // 15MB
	_ = fW3.Close()

	_ = os.WriteFile(filepath.Join(w3Dir, "CrashReporter.exe"), []byte("crash"), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "The Witcher 3", "unins000.exe"), []byte("uninstaller"), 0644)
	redistDir := filepath.Join(tmpDir, "The Witcher 3", "_CommonRedist")
	_ = os.MkdirAll(redistDir, 0755)
	_ = os.WriteFile(filepath.Join(redistDir, "vcredist_x64.exe"), []byte("redist"), 0644)

	// 3. Standalone ISO file
	_ = os.WriteFile(filepath.Join(tmpDir, "God.of.War.iso"), []byte("iso image bytes"), 0644)

	// 4. macOS .app bundle directory
	appDir := filepath.Join(tmpDir, "Hades", "Hades.app", "Contents", "MacOS")
	_ = os.MkdirAll(appDir, 0755)
	_ = os.WriteFile(filepath.Join(appDir, "Hades"), []byte("macos binary"), 0755)
	_ = os.WriteFile(filepath.Join(tmpDir, "Hades", "Hades.app", "Contents", "Info.plist"), []byte("<plist></plist>"), 0644)

	libraries := []config.LibraryConfig{
		{
			Name:              "Games",
			Path:              tmpDir,
			Kind:              "game",
			AllowedExtensions: []string{".exe", ".iso", ".dmg", ".bin"},
		},
	}

	idx := indexer.NewStorageIndexer(libraries)
	files := idx.ScanAll()

	// Verify we got 4 distinct, clean items:
	// - Cyberpunk 2077 (installer)
	// - The Witcher 3 (game - elected witcher3.exe, filtered CrashReporter, vcredist, unins000)
	// - God of War (iso)
	// - Hades (game - from Hades.app)
	if len(files) != 4 {
		t.Fatalf("expected 4 files indexed, got %d: %+v", len(files), files)
	}

	byTitle := make(map[string]indexer.HostedFile)
	for _, f := range files {
		byTitle[f.GameTitle] = f
	}

	// Verify Cyberpunk 2077
	cp, ok := byTitle["Cyberpunk 2077"]
	if !ok {
		t.Fatalf("missing Cyberpunk 2077 in indexed files")
	}
	if cp.FormatCategory != "installer" {
		t.Errorf("Cyberpunk 2077 format: expected installer, got %s", cp.FormatCategory)
	}
	if cp.Filename != "setup.exe" {
		t.Errorf("Cyberpunk 2077 filename: expected setup.exe, got %s", cp.Filename)
	}

	// Verify The Witcher 3
	w3, ok := byTitle["The Witcher 3"]
	if !ok {
		t.Fatalf("missing The Witcher 3 in indexed files")
	}
	if w3.FormatCategory != "game" {
		t.Errorf("The Witcher 3 format: expected game, got %s", w3.FormatCategory)
	}
	if w3.Filename != "witcher3.exe" {
		t.Errorf("The Witcher 3 filename: expected witcher3.exe, got %s", w3.Filename)
	}

	// Verify God of War
	gow, ok := byTitle["God Of War"]
	if !ok {
		t.Fatalf("missing God of War in indexed files")
	}
	if gow.FormatCategory != "iso" {
		t.Errorf("God of War format: expected iso, got %s", gow.FormatCategory)
	}

	// Verify Hades .app bundle
	hades, ok := byTitle["Hades"]
	if !ok {
		t.Fatalf("missing Hades in indexed files")
	}
	if hades.FormatCategory != "game" {
		t.Errorf("Hades format: expected game, got %s", hades.FormatCategory)
	}
	if hades.Extension != ".app" {
		t.Errorf("Hades extension: expected .app, got %s", hades.Extension)
	}
}

func TestScanAllSkipsJunkWithEmptyAllowlist(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_indexer_junk")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	gameDir := filepath.Join(tmpDir, "Some Game")
	_ = os.MkdirAll(gameDir, 0755)
	_ = os.WriteFile(filepath.Join(gameDir, "UnityEngine.dll"), []byte("dll"), 0644)
	_ = os.WriteFile(filepath.Join(gameDir, "folder.jpg"), []byte("jpg"), 0644)
	_ = os.WriteFile(filepath.Join(gameDir, "readme.txt"), []byte("txt"), 0644)
	_ = os.WriteFile(filepath.Join(gameDir, "Assembly-CSharp.pdb"), []byte("pdb"), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "Cool Game.iso"), []byte("iso"), 0644)

	fExe, _ := os.Create(filepath.Join(gameDir, "SomeGame.exe"))
	_ = fExe.Truncate(12 * 1024 * 1024)
	_ = fExe.Close()

	idx := indexer.NewStorageIndexer([]config.LibraryConfig{{
		Name: "Games",
		Path: tmpDir,
		Kind: "game",
		// Empty allowlist used to index every file — must still stay game-only.
	}})
	files := idx.ScanAll()

	if len(files) != 2 {
		t.Fatalf("expected 2 hosted files (iso + game exe), got %d: %+v", len(files), files)
	}
	for _, f := range files {
		if f.FormatCategory == "file" {
			t.Fatalf("junk file was indexed: %+v", f)
		}
	}
}

func TestParentGameTitleForUpdate(t *testing.T) {
	tests := []struct {
		filename string
		path     string
		lib      string
		want     string
	}{
		{
			"Elden Ring update 1.12.3 - 1.13.0.exe",
			"/Games/Elden Ring/Updates/Elden Ring update 1.12.3 - 1.13.0.exe",
			"/Games",
			"Elden Ring",
		},
		{
			"God of War Ragnarok update 1.1.1.exe",
			"/Games/God of War/God of War - Ragnarok/Updates/God of War Ragnarok update 1.1.1.exe",
			"/Games",
			"God Of War Ragnarok",
		},
		{
			"RuneScape Dragonwilds update 240163 - 243922.exe",
			"/Games/Runescape/Dragonwilds/RuneScape Dragonwilds update 240163 - 243922-ElAmigos/RuneScape Dragonwilds update 240163 - 243922.exe",
			"/Games",
			"Runescape Dragonwilds",
		},
		{
			"Final Fantasy VII Rebirth update 1.003.exe",
			"/Games/Final Fantasy/Final_Fantasy_VII_Rebirth_update_1.003_ElAmigos/Final Fantasy VII Rebirth update 1.003/Final Fantasy VII Rebirth update 1.003.exe",
			"/Games",
			"Final Fantasy Vii Rebirth",
		},
		{
			"Cyberpunk 2077 update 2.20 - 2.21.exe",
			"/Games/Cyberpunk 2077/Cyberpunk 2077 Ultimate Edition/Updates/Cyberpunk 2077 update 2.20 - 2.21.exe",
			"/Games",
			"Cyberpunk 2077 Ultimate Edition",
		},
	}
	for _, tt := range tests {
		got := indexer.ParentGameTitleForUpdate(tt.filename, tt.path, tt.lib)
		if got != tt.want {
			t.Errorf("%s: got %q want %q", tt.filename, got, tt.want)
		}
	}
}

func TestScanAllIndexesUpdatesWithParentGame(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_indexer_updates")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	base := filepath.Join(tmpDir, "Elden Ring", "Elden Ring Deluxe")
	updates := filepath.Join(base, "Updates")
	_ = os.MkdirAll(updates, 0755)
	_ = os.WriteFile(filepath.Join(base, "Elden Ring Deluxe.iso"), []byte("iso"), 0644)
	_ = os.WriteFile(filepath.Join(updates, "Elden Ring update 1.12.0 - 1.12.3.exe"), []byte("u1"), 0644)
	_ = os.WriteFile(filepath.Join(updates, "Elden Ring update 1.12.3 - 1.13.0.exe"), []byte("u2"), 0644)
	_ = os.WriteFile(filepath.Join(updates, "Elden Ring update 1.13.0 - 1.14.0.exe"), []byte("u3"), 0644)

	idx := indexer.NewStorageIndexer([]config.LibraryConfig{{
		Name: "Games",
		Path: tmpDir,
		Kind: "game",
	}})
	files := idx.ScanAll()

	var isoCount, updateCount int
	for _, f := range files {
		switch f.FormatCategory {
		case "iso":
			isoCount++
		case "update":
			updateCount++
			if f.GameTitle != "Elden Ring Deluxe" {
				t.Errorf("update %s parent title: got %q want Elden Ring Deluxe", f.Filename, f.GameTitle)
			}
		}
	}
	if isoCount != 1 {
		t.Fatalf("expected 1 iso, got %d (%+v)", isoCount, files)
	}
	if updateCount != 3 {
		t.Fatalf("expected 3 updates, got %d (%+v)", updateCount, files)
	}
}

func TestDetermineFileFormatCategoryAndPlatformROMsAndArchives(t *testing.T) {
	tests := []struct {
		filename         string
		fullPath         string
		expectedCategory string
		expectedPlatform indexer.PlatformType
	}{
		// ROMs
		{"Super Mario Odyssey.nsp", "/roms/switch/Super Mario Odyssey.nsp", "rom", indexer.PlatformSwitch},
		{"Super Mario 64.z64", "/roms/n64/Super Mario 64.z64", "rom", indexer.PlatformN64},
		{"Super Mario World.sfc", "/roms/snes/Super Mario World.sfc", "rom", indexer.PlatformSNES},
		{"Crash Bandicoot.chd", "/roms/ps1/Crash Bandicoot.chd", "rom", indexer.PlatformPS1},
		{"Mario Kart Wii.rvz", "/roms/wii/Mario Kart Wii.rvz", "rom", indexer.PlatformWii},

		// Archives
		{"Pokemon Emerald [GBA].zip", "/roms/gba/Pokemon Emerald [GBA].zip", "archive", indexer.PlatformGBA},
		{"Metroid Dread [Switch].7z", "/roms/switch/Metroid Dread [Switch].7z", "archive", indexer.PlatformSwitch},
		{"FitGirl Repack.zip", "/downloads/FitGirl Repack.zip", "archive", indexer.PlatformPC},
	}

	for _, tt := range tests {
		t.Run(tt.filename, func(t *testing.T) {
			cat := indexer.DetermineFileFormatCategory(tt.fullPath, tt.filename)
			if cat != tt.expectedCategory {
				t.Errorf("DetermineFileFormatCategory(%q) = %s, want %s", tt.filename, cat, tt.expectedCategory)
			}

			plat := indexer.DeterminePlatform(tt.filename, tt.fullPath)
			if plat != tt.expectedPlatform {
				t.Errorf("DeterminePlatform(%q, %q) = %s, want %s", tt.filename, tt.fullPath, plat, tt.expectedPlatform)
			}
		})
	}
}

func TestStorageIndexerScanningROMsAndArchives(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_indexer_roms_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Create synthetic fixture directory structure
	switchDir := filepath.Join(tmpDir, "Switch")
	n64Dir := filepath.Join(tmpDir, "N64")
	snesDir := filepath.Join(tmpDir, "SNES")
	ps1Dir := filepath.Join(tmpDir, "PS1")
	wiiDir := filepath.Join(tmpDir, "Wii")
	archiveDir := filepath.Join(tmpDir, "Archives")

	for _, d := range []string{switchDir, n64Dir, snesDir, ps1Dir, wiiDir, archiveDir} {
		if err := os.MkdirAll(d, 0755); err != nil {
			t.Fatal(err)
		}
	}

	// 1. Switch ROM (.nsp)
	_ = os.WriteFile(filepath.Join(switchDir, "Super Mario Odyssey.nsp"), []byte("nsp header"), 0644)

	// 2. N64 ROM (.z64)
	_ = os.WriteFile(filepath.Join(n64Dir, "Super Mario 64.z64"), []byte("z64 header"), 0644)

	// 3. SNES ROM (.sfc)
	_ = os.WriteFile(filepath.Join(snesDir, "Super Mario World.sfc"), []byte("sfc header"), 0644)

	// 4. PS1 ROM (.chd)
	_ = os.WriteFile(filepath.Join(ps1Dir, "Crash Bandicoot.chd"), []byte("chd header"), 0644)

	// 5. Wii ROM (.rvz)
	_ = os.WriteFile(filepath.Join(wiiDir, "Mario Kart Wii.rvz"), []byte("rvz header"), 0644)

	// 6. GBA Archive (.zip)
	_ = os.WriteFile(filepath.Join(archiveDir, "Pokemon Emerald [GBA].zip"), []byte("zip archive"), 0644)

	// 7. Switch Archive (.7z)
	_ = os.WriteFile(filepath.Join(archiveDir, "Metroid Dread [Switch].7z"), []byte("7z archive"), 0644)

	libraries := []config.LibraryConfig{
		{
			Name:              "Emulation",
			Path:              tmpDir,
			Kind:              "rom",
			AllowedExtensions: []string{".nsp", ".z64", ".sfc", ".chd", ".rvz", ".zip", ".7z"},
		},
	}

	idx := indexer.NewStorageIndexer(libraries)
	files := idx.ScanAll()

	if len(files) != 7 {
		t.Fatalf("expected 7 indexed files, got %d: %+v", len(files), files)
	}

	byName := make(map[string]indexer.HostedFile)
	for _, f := range files {
		byName[f.Filename] = f
	}

	// Verify .nsp
	nsp, ok := byName["Super Mario Odyssey.nsp"]
	if !ok {
		t.Fatalf("missing Super Mario Odyssey.nsp")
	}
	if nsp.FormatCategory != "rom" {
		t.Errorf("nsp category: expected rom, got %s", nsp.FormatCategory)
	}
	if plat := indexer.DeterminePlatform(nsp.Filename, nsp.Filepath); plat != indexer.PlatformSwitch {
		t.Errorf("nsp platform: expected Switch, got %s", plat)
	}

	// Verify .z64
	z64, ok := byName["Super Mario 64.z64"]
	if !ok {
		t.Fatalf("missing Super Mario 64.z64")
	}
	if z64.FormatCategory != "rom" {
		t.Errorf("z64 category: expected rom, got %s", z64.FormatCategory)
	}
	if plat := indexer.DeterminePlatform(z64.Filename, z64.Filepath); plat != indexer.PlatformN64 {
		t.Errorf("z64 platform: expected N64, got %s", plat)
	}

	// Verify .sfc
	sfc, ok := byName["Super Mario World.sfc"]
	if !ok {
		t.Fatalf("missing Super Mario World.sfc")
	}
	if sfc.FormatCategory != "rom" {
		t.Errorf("sfc category: expected rom, got %s", sfc.FormatCategory)
	}
	if plat := indexer.DeterminePlatform(sfc.Filename, sfc.Filepath); plat != indexer.PlatformSNES {
		t.Errorf("sfc platform: expected SNES, got %s", plat)
	}

	// Verify .chd
	chd, ok := byName["Crash Bandicoot.chd"]
	if !ok {
		t.Fatalf("missing Crash Bandicoot.chd")
	}
	if chd.FormatCategory != "rom" {
		t.Errorf("chd category: expected rom, got %s", chd.FormatCategory)
	}
	if plat := indexer.DeterminePlatform(chd.Filename, chd.Filepath); plat != indexer.PlatformPS1 {
		t.Errorf("chd platform: expected PS1, got %s", plat)
	}

	// Verify .rvz
	rvz, ok := byName["Mario Kart Wii.rvz"]
	if !ok {
		t.Fatalf("missing Mario Kart Wii.rvz")
	}
	if rvz.FormatCategory != "rom" {
		t.Errorf("rvz category: expected rom, got %s", rvz.FormatCategory)
	}
	if plat := indexer.DeterminePlatform(rvz.Filename, rvz.Filepath); plat != indexer.PlatformWii {
		t.Errorf("rvz platform: expected Wii, got %s", plat)
	}

	// Verify .zip
	zipFile, ok := byName["Pokemon Emerald [GBA].zip"]
	if !ok {
		t.Fatalf("missing Pokemon Emerald [GBA].zip")
	}
	if zipFile.FormatCategory != "archive" {
		t.Errorf("zip category: expected archive, got %s", zipFile.FormatCategory)
	}
	if plat := indexer.DeterminePlatform(zipFile.Filename, zipFile.Filepath); plat != indexer.PlatformGBA {
		t.Errorf("zip platform: expected GBA, got %s", plat)
	}

	// Verify .7z
	sevenZip, ok := byName["Metroid Dread [Switch].7z"]
	if !ok {
		t.Fatalf("missing Metroid Dread [Switch].7z")
	}
	if sevenZip.FormatCategory != "archive" {
		t.Errorf("7z category: expected archive, got %s", sevenZip.FormatCategory)
	}
	if plat := indexer.DeterminePlatform(sevenZip.Filename, sevenZip.Filepath); plat != indexer.PlatformSwitch {
		t.Errorf("7z platform: expected Switch, got %s", plat)
	}
}

func TestScanAllTestGamesLibrary(t *testing.T) {
	libPath := filepath.Join("..", "..", "..", "test_games_library")
	if _, err := os.Stat(libPath); os.IsNotExist(err) {
		t.Skip("test_games_library not found")
	}

	lib := config.LibraryConfig{
		Name: "TestGamesLib",
		Path: libPath,
		Kind: "game",
		AllowedExtensions: []string{
			".iso", ".img", ".exe", ".msi", ".dmg", ".pkg", ".app",
			".zip", ".7z", ".rar", ".chd", ".rvz", ".nsp", ".xci",
		},
	}
	idx := indexer.NewStorageIndexer([]config.LibraryConfig{lib})
	indexed := idx.ScanAll()
	t.Logf("Total games indexed from test_games_library: %d", len(indexed))
	if len(indexed) < 50 {
		t.Errorf("Expected at least 50 games indexed, got %d", len(indexed))
	}
}


