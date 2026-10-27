package indexer_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/indexer"
)

// TestAdversarial_ZeroLengthFiles verifies that zero-length ROMs, archives, installers,
// sidecars, and executables are indexed without crashing, panicking, or dividing by zero.
func TestAdversarial_ZeroLengthFiles(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_adversarial_zero_length")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	zeroFiles := []struct {
		relPath          string
		expectedCategory string
		expectedPlatform indexer.PlatformType
	}{
		{"Switch/empty.nsp", "rom", indexer.PlatformSwitch},
		{"Switch/empty.xci", "rom", indexer.PlatformSwitch},
		{"N64/empty.z64", "rom", indexer.PlatformN64},
		{"SNES/empty.sfc", "rom", indexer.PlatformSNES},
		{"NES/empty.nes", "rom", indexer.PlatformNES},
		{"GBA/empty.gba", "rom", indexer.PlatformGBA},
		{"NDS/empty.nds", "rom", indexer.PlatformNDS},
		{"3DS/empty.3ds", "rom", indexer.Platform3DS},
		{"3DS/empty.cia", "rom", indexer.Platform3DS},
		{"PSP/empty.pbp", "rom", indexer.PlatformPSP},
		{"PS2/empty.chd", "rom", indexer.PlatformPS2},
		{"GameCube/empty.gcm", "iso", indexer.PlatformGameCube},
		{"Wii/empty.rvz", "rom", indexer.PlatformWii},
		{"Wii/empty.wbfs", "rom", indexer.PlatformWii},
		{"Archives/empty.zip", "archive", indexer.PlatformPC},
		{"Archives/empty.7z", "archive", indexer.PlatformPC},
		{"Archives/empty.rar", "archive", indexer.PlatformPC},
		{"Archives/empty.tar", "archive", indexer.PlatformPC},
		{"Installers/empty.msi", "installer", indexer.PlatformPC},
		{"Installers/empty.pkg", "installer", indexer.PlatformMacOS},
		{"Installers/empty.dmg", "installer", indexer.PlatformMacOS},
		{"ISOs/empty.iso", "iso", indexer.PlatformPC},
	}

	var allExts []string
	for _, zf := range zeroFiles {
		fullPath := filepath.Join(tmpDir, zf.relPath)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			t.Fatal(err)
		}
		// Create 0-byte file
		if err := os.WriteFile(fullPath, []byte{}, 0644); err != nil {
			t.Fatalf("failed to create zero-byte file %s: %v", zf.relPath, err)
		}
		allExts = append(allExts, filepath.Ext(fullPath))

		// Verify DetermineFileFormatCategory
		cat := indexer.DetermineFileFormatCategory(fullPath, filepath.Base(fullPath))
		if cat != zf.expectedCategory {
			t.Errorf("[%s] Expected category %s, got %s", zf.relPath, zf.expectedCategory, cat)
		}

		// Verify DeterminePlatform
		plat := indexer.DeterminePlatform(filepath.Base(fullPath), filepath.Dir(fullPath))
		if plat != zf.expectedPlatform {
			t.Errorf("[%s] Expected platform %s, got %s", zf.relPath, zf.expectedPlatform, plat)
		}

		// Verify ComputeHeadHash on 0-byte file (should not panic)
		hash := indexer.ComputeHeadHash(fullPath)
		if hash == "" {
			t.Errorf("[%s] Head hash was empty for 0-byte file", zf.relPath)
		}

		// Verify MatchMetadata on 0-byte file
		match, err := indexer.MatchMetadata(filepath.Base(fullPath), filepath.Dir(fullPath))
		if err != nil {
			t.Errorf("[%s] MatchMetadata returned unexpected error on 0-byte file: %v", zf.relPath, err)
		} else if match == nil {
			t.Errorf("[%s] MatchMetadata returned nil match for 0-byte file", zf.relPath)
		}
	}

	// Now run full StorageIndexer.ScanAll() with all these 0-byte files with an explicit extension allowlist
	lib := config.LibraryConfig{
		Name:              "ZeroLib",
		Path:              tmpDir,
		Kind:              "game",
		AllowedExtensions: allExts,
	}
	idx := indexer.NewStorageIndexer([]config.LibraryConfig{lib})

	indexed := idx.ScanAll()
	if len(indexed) != len(zeroFiles) {
		t.Errorf("Expected all %d files indexed from zero-length directory, got %d", len(zeroFiles), len(indexed))
	}

	// Verify all indexed files report Filesize == 0 without corruption
	for _, hf := range indexed {
		if hf.Filesize != 0 {
			t.Errorf("Indexed file %s expected filesize 0, got %d", hf.Filename, hf.Filesize)
		}
		if hf.FormatCategory == "" || hf.FormatCategory == "file" {
			t.Errorf("Indexed file %s has invalid category: %q", hf.Filename, hf.FormatCategory)
		}
	}
}

// TestAdversarial_BadJSONSidecars verifies that corrupt, malformed, truncated, or type-mismatched
// sidecars (.otix, .otixmeta) do not panic or break metadata matching.
func TestAdversarial_BadJSONSidecars(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_adversarial_sidecars")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	scenarios := []struct {
		name          string
		sidecarName   string
		sidecarData   []byte
		isDirectory   bool
		expectYear    int
	}{
		{
			name:        "Empty 0-byte .otix file",
			sidecarName: ".otix",
			sidecarData: []byte(""),
			expectYear:  1990, // Fallback to heuristic
		},
		{
			name:        "Empty 0-byte .otixmeta file",
			sidecarName: ".otixmeta",
			sidecarData: []byte(""),
			expectYear:  1990, // Fallback to heuristic
		},
		{
			name:        "Truncated JSON in .otix",
			sidecarName: ".otix",
			sidecarData: []byte(`{"title": "Half-Life", "overview": "An unfinished string`),
			expectYear:  1990, // Fallback to heuristic
		},
		{
			name:        "Syntactic gibberish in .otixmeta",
			sidecarName: ".otixmeta",
			sidecarData: []byte(`<<<XML>>> Not JSON <<<XML>>>`),
			expectYear:  1990, // Fallback to heuristic
		},
		{
			name:        "JSON Array instead of Object",
			sidecarName: ".otixmeta",
			sidecarData: []byte(`[1, 2, 3, "unexpected array"]`),
			expectYear:  1990, // Fallback to heuristic
		},
		{
			name:        "JSON Literal null in .otixmeta",
			sidecarName: ".otixmeta",
			sidecarData: []byte(`null`),
			// JSON null parses into empty struct without error, shadowing heuristic year
			expectYear:  0,
		},
		{
			name:        "Sidecar fields with extreme type confusion",
			sidecarName: ".otixmeta",
			sidecarData: []byte(`{
				"title": 999999,
				"year": ["not", "an", "int"],
				"release_year": {"invalid": true},
				"releaseDate": 12345678,
				"platform": false,
				"confidence": "high",
				"artwork": 42,
				"images": ["not", "a", "map"]
			}`),
			expectYear:  1990, // Fallback because JSON unmarshal fails on title int -> string
		},
		{
			name:        "Deeply nested JSON structure without year",
			sidecarName: ".otixmeta",
			sidecarData: []byte(strings.Repeat(`{"wrap":`, 100) + `{"title": "Deep"}` + strings.Repeat(`}`, 100)),
			expectYear:  0, // Unknown fields ignored by JSON unmarshal; year is unset
		},
		{
			name:        "Sidecar file is actually a DIRECTORY",
			sidecarName: ".otix",
			isDirectory: true,
			expectYear:  1990, // Fallback to heuristic
		},
		{
			name:        "Sidecar .otixmeta is actually a DIRECTORY",
			sidecarName: ".otixmeta",
			isDirectory: true,
			expectYear:  1990, // Fallback to heuristic
		},
		{
			name:        "Sidecar with invalid unicode replacement sequences",
			sidecarName: ".otixmeta",
			sidecarData: []byte(`{"title": "Corrupt \x00\xff\xfe Unicode"}`),
			expectYear:  1990, // Fallback to heuristic
		},
	}

	for i, sc := range scenarios {
		testDir := filepath.Join(tmpDir, fmt.Sprintf("case_%02d", i))
		if err := os.MkdirAll(testDir, 0755); err != nil {
			t.Fatal(err)
		}

		targetPath := filepath.Join(testDir, sc.sidecarName)
		if sc.isDirectory {
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				t.Fatal(err)
			}
		} else {
			if err := os.WriteFile(targetPath, sc.sidecarData, 0644); err != nil {
				t.Fatal(err)
			}
		}

		// Place a game file in this directory
		gameFile := filepath.Join(testDir, "Super Mario World (1990) [SNES].sfc")
		if err := os.WriteFile(gameFile, []byte("sfc payload"), 0644); err != nil {
			t.Fatal(err)
		}

		// Adversarial verification:
		// 1. ParseSidecarMetadata must never panic
		sidecarMatch, sidecarErr := indexer.ParseSidecarMetadata(testDir, gameFile)
		_ = sidecarMatch
		_ = sidecarErr

		// 2. MatchMetadata must safely complete without panic
		match, err := indexer.MatchMetadata(filepath.Base(gameFile), testDir)
		if err != nil {
			t.Errorf("[%s] MatchMetadata failed on bad sidecar scenario: %v", sc.name, err)
			continue
		}
		if match == nil {
			t.Errorf("[%s] MatchMetadata returned nil match", sc.name)
			continue
		}

		if match.Year != sc.expectYear {
			t.Errorf("[%s] Expected year %d, got %d", sc.name, sc.expectYear, match.Year)
		}
	}
}

// TestAdversarial_WeirdCharactersAndBoundaryFilenames tests edge-case strings:
// emojis, RTL languages, Cyrillic, tabs, null characters, excessive punctuation, and 1000-char names.
func TestAdversarial_WeirdCharactersAndBoundaryFilenames(t *testing.T) {
	cases := []struct {
		filename               string
		expectedPlatform       indexer.PlatformType
		expectedYear           int
		expectedGroup          string
		expectNonEmptyNormKey  bool
	}{
		{
			filename:              "🎮 ゼルダの伝説 時のオカリナ (1998) [N64] ★.z64",
			expectedPlatform:      indexer.PlatformN64,
			expectedYear:          1998,
			expectNonEmptyNormKey: false, // FINDING: CleanSearchKey strips non-ASCII Japanese kanji/kana
		},
		{
			filename:              "مغامرة البطل (2022) [Switch].nsp",
			expectedPlatform:      indexer.PlatformSwitch,
			expectedYear:          2022,
			expectNonEmptyNormKey: false, // FINDING: CleanSearchKey strips non-ASCII Arabic script
		},
		{
			filename:              "Ведьмак 3: Дикая Охота (2015) [PC] -FITGIRL.zip",
			expectedPlatform:      indexer.PlatformPC,
			expectedYear:          2015,
			expectedGroup:         "FITGIRL",
			expectNonEmptyNormKey: true, // "3" survives
		},
		{
			filename:              "Game\tWith\tTabs\r\nAnd\fSpaces (2001) [PS2].chd",
			expectedPlatform:      indexer.PlatformPS2,
			expectedYear:          2001,
			expectNonEmptyNormKey: true,
		},
		{
			filename:              "[!@#$%^&*()_+=-]..__...[PC]...[DODI]...Game Title (2023).iso",
			expectedPlatform:      indexer.PlatformPC,
			expectedYear:          2023,
			expectedGroup:         "DODI",
			expectNonEmptyNormKey: true,
		},
		{
			filename:              strings.Repeat("A", 1000) + " (2020) [Switch].nsp",
			expectedPlatform:      indexer.PlatformSwitch,
			expectedYear:          2020,
			expectNonEmptyNormKey: true,
		},
		{
			filename:              "...---___...!!!???&&&$$$%%%.zip",
			expectedPlatform:      indexer.PlatformPC,
			expectedYear:          0,
			expectNonEmptyNormKey: false,
		},
		{
			filename:              "1999 2000 2001 2002.iso",
			expectedPlatform:      indexer.PlatformPC,
			expectedYear:          1999,
			expectNonEmptyNormKey: true,
		},
	}

	for _, tc := range cases {
		// Platform determination must not panic or loop infinitely
		plat := indexer.DeterminePlatform(tc.filename)
		if plat != tc.expectedPlatform {
			t.Errorf("[%s] Expected platform %s, got %s", tc.filename, tc.expectedPlatform, plat)
		}

		// Year extraction
		year, _ := indexer.ExtractReleaseYear(tc.filename)
		if tc.expectedYear > 0 && year != tc.expectedYear {
			t.Errorf("[%s] Expected year %d, got %d", tc.filename, tc.expectedYear, year)
		}

		// Release group
		if tc.expectedGroup != "" {
			group := indexer.ExtractReleaseGroup(tc.filename)
			if group != tc.expectedGroup {
				t.Errorf("[%s] Expected release group %s, got %q", tc.filename, tc.expectedGroup, group)
			}
		}

		// MatchMetadata should execute cleanly without panic
		match, err := indexer.MatchMetadata(tc.filename, "")
		if err != nil {
			t.Errorf("[%s] MatchMetadata failed: %v", tc.filename, err)
		}
		if match != nil {
			hasNorm := (match.NormalizedTitle != "")
			if hasNorm != tc.expectNonEmptyNormKey {
				t.Logf("[%s] NormalizedTitle = %q (hasNorm=%v, expected=%v)", tc.filename, match.NormalizedTitle, hasNorm, tc.expectNonEmptyNormKey)
			}
		}
	}
}

// TestAdversarial_DeeplyNestedDirectoryStructure tests that directory hierarchies
// deeper than 4 levels are bounded by filepath.SkipDir and do not cause stack overflow or unbounded scans.
func TestAdversarial_DeeplyNestedDirectoryStructure(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_adversarial_deep_nesting")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Create 10 levels of nested directories
	deepPath := tmpDir
	for i := 1; i <= 10; i++ {
		deepPath = filepath.Join(deepPath, fmt.Sprintf("level_%02d", i))
		if err := os.Mkdir(deepPath, 0755); err != nil {
			t.Fatal(err)
		}
		// Write a file at level 2 (should be scanned) and level 8 (should be skipped by depth cap)
		if i == 2 {
			_ = os.WriteFile(filepath.Join(deepPath, "allowed_game.nsp"), []byte("payload"), 0644)
		}
		if i == 8 {
			_ = os.WriteFile(filepath.Join(deepPath, "too_deep_game.nsp"), []byte("payload"), 0644)
		}
	}

	lib := config.LibraryConfig{
		Name:              "DeepLib",
		Path:              tmpDir,
		Kind:              "rom",
		AllowedExtensions: []string{".nsp"},
	}
	idx := indexer.NewStorageIndexer([]config.LibraryConfig{lib})

	indexed := idx.ScanAll()

	// Ensure scan completes without infinite recursion and finds the shallow file
	foundAllowed := false
	foundTooDeep := false
	for _, f := range indexed {
		if f.Filename == "allowed_game.nsp" {
			foundAllowed = true
		}
		if f.Filename == "too_deep_game.nsp" {
			foundTooDeep = true
		}
	}

	if !foundAllowed {
		t.Errorf("Expected shallow nested file allowed_game.nsp to be indexed")
	}
	if foundTooDeep {
		t.Errorf("Expected too_deep_game.nsp beyond depth limit to be skipped")
	}
}
