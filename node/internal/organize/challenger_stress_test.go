package organize

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIsNoiseBoundaryConditions(t *testing.T) {
	testCases := []struct {
		name      string
		filename  string
		fullPath  string
		wantNoise bool
	}{
		{"EmptyStrings", "", "", false},
		{"EmptyFilename", "", `C:\Games\Cyberpunk\game.exe`, false},
		{"EmptyPath", "game.exe", "", false},
		{"StandardGame", "game.exe", `C:\Games\Cyberpunk\bin\x64\game.exe`, false},
		{"CrashReporterNoise", "CrashReporter.exe", `C:\Games\Cyberpunk\CrashReporter.exe`, true},
		{"UnityCrashNoise", "UnityCrashHandler64.exe", `C:\Games\Subnautica\UnityCrashHandler64.exe`, true},
		{"RedistDirNoise", "setup.exe", `C:\Games\Cyberpunk\_CommonRedist\DirectX\setup.exe`, true},
		{"AppDataLocalTempPath", "game.exe", `C:\Users\tester\AppData\Local\Temp\otix-test-123\Cyberpunk\game.exe`, false},
		{"WindowsTempPath", "game.exe", `C:\Windows\Temp\otix-test-123\Cyberpunk\game.exe`, false},
		{"CustomTempDirEnvMatch", "game.exe", filepath.Join(os.TempDir(), "otix-test-123", "Cyberpunk", "game.exe"), false},
		{"UserNamedTempGamePath", "game.exe", `C:\Users\temp\Games\Cyberpunk\game.exe`, false},
		{"UserNamedTmpGamePath", "game.exe", `C:\Users\tmp\Games\Cyberpunk\game.exe`, false},
		{"DataParentDirectoryGame", "game.exe", `D:\Data\Games\Cyberpunk\game.exe`, false},
		{"SubdirNamedTemp", "game.exe", `C:\Games\Cyberpunk\temp\game.exe`, true},
		{"SubdirNamedTmp", "game.exe", `C:\Games\Cyberpunk\tmp\game.exe`, true},
		{"DifferentDriveFromTempDir", "game.exe", `D:\Games\Witcher3\bin\x64\witcher3.exe`, false},
		{"ExtendedLengthUNC", "game.exe", `\\?\C:\Games\Cyberpunk\game.exe`, false},
		{"NetworkShareUNC", "game.exe", `\\192.168.1.100\SharedGames\Cyberpunk\game.exe`, false},
		{"PathWithDots", "game.exe", `C:\Games\Cyberpunk\.\..\Cyberpunk\game.exe`, false},
		{"UnicodeCharacters", "game.exe", `C:\Games\日本語\Русский\🎮\game.exe`, false},
		{"SpecialCharsInPath", "game.exe", `C:\Games\Game [Special - 2024] (v1.0.0)\game.exe`, false},
		{"RepeatedSlashes", "game.exe", `C:\\Games\\\\SubDir\\game.exe`, false},
		{"ForwardSlashesOnWindows", "game.exe", `C:/Games/Cyberpunk/game.exe`, false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := isNoise(tc.filename, tc.fullPath)
			if got != tc.wantNoise {
				t.Errorf("isNoise(%q, %q) = %v; want %v", tc.filename, tc.fullPath, got, tc.wantNoise)
			}
		})
	}
}

func TestIsNoise_AdversarialRootPaths(t *testing.T) {
	TestIsNoiseBoundaryConditions(t)
}

func TestPreviewOrganizationBoundaryTrees(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. Unicode folder name
	unicodeDir := filepath.Join(tmpDir, "日本語_Русский (2022) [PC]")
	_ = os.MkdirAll(unicodeDir, 0755)
	_ = os.WriteFile(filepath.Join(unicodeDir, "game.exe"), []byte("MZ"), 0755)

	// 2. Deep nested structure
	deepDir := filepath.Join(tmpDir, "DeepGame (2020) [PC]", "bin", "x64", "release", "shipping")
	_ = os.MkdirAll(deepDir, 0755)
	_ = os.WriteFile(filepath.Join(deepDir, "DeepGame.exe"), []byte("MZ"), 0755)

	// 3. Noise folder co-located with real game
	noiseSubdir := filepath.Join(tmpDir, "DeepGame (2020) [PC]", "_CommonRedist", "vcredist")
	_ = os.MkdirAll(noiseSubdir, 0755)
	_ = os.WriteFile(filepath.Join(noiseSubdir, "vcredist_x64.exe"), []byte("MZ"), 0755)

	// 4. Folder with brackets, dots, and versioning
	taggedDir := filepath.Join(tmpDir, "My.Game.v1.0.0.Deluxe.[GOG] (2023) [PC]")
	_ = os.MkdirAll(taggedDir, 0755)
	_ = os.WriteFile(filepath.Join(taggedDir, "MyGame.exe"), []byte("MZ"), 0755)

	preview, err := PreviewOrganization(tmpDir, "{title} ({year}) [{platform}]", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed on boundary trees: %v", err)
	}

	if len(preview) == 0 {
		t.Fatalf("Expected preview items from test directory tree, got 0")
	}

	// Verify that noise binaries were NOT included in preview
	for _, item := range preview {
		if strings.Contains(strings.ToLower(item.SourcePath), "vcredist") {
			t.Errorf("Noise binary was erroneously included in preview: %s", item.SourcePath)
		}
	}
}
