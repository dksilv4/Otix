package indexer_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/dksilv4/otix/node/internal/indexer"
	"github.com/dksilv4/otix/node/internal/otixmeta"
)

func TestDeterminePlatform(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		path     string
		expected indexer.PlatformType
	}{
		// Switch
		{"Switch NSP", "Super Mario Odyssey.nsp", "", indexer.PlatformSwitch},
		{"Switch XCI", "Zelda Tears of the Kingdom.xci", "", indexer.PlatformSwitch},
		{"Switch in folder", "Mario.zip", "/roms/switch/Mario.zip", indexer.PlatformSwitch},
		{"Switch tag", "Pokemon [Switch].7z", "", indexer.PlatformSwitch},

		// N64
		{"N64 z64", "Super Mario 64.z64", "", indexer.PlatformN64},
		{"N64 n64", "Ocarina of Time.n64", "", indexer.PlatformN64},
		{"N64 tag", "GoldenEye 007 (N64).zip", "", indexer.PlatformN64},

		// SNES & NES
		{"SNES sfc", "Super Mario World.sfc", "", indexer.PlatformSNES},
		{"SNES smc", "Chrono Trigger.smc", "", indexer.PlatformSNES},
		{"NES nes", "Super Mario Bros.nes", "", indexer.PlatformNES},

		// Game Boy
		{"GBA", "Pokemon Emerald.gba", "", indexer.PlatformGBA},
		{"GBC", "Pokemon Crystal.gbc", "", indexer.PlatformGBC},
		{"GB", "Tetris.gb", "", indexer.PlatformGB},

		// DS / 3DS
		{"NDS", "Pokemon Platinum.nds", "", indexer.PlatformNDS},
		{"3DS cia", "Pokemon Sun.cia", "", indexer.Platform3DS},
		{"3DS 3ds", "Super Smash Bros.3ds", "", indexer.Platform3DS},

		// Wii & GameCube
		{"Wii rvz", "Mario Kart Wii.rvz", "", indexer.PlatformWii},
		{"Wii wbfs", "Super Smash Bros Brawl.wbfs", "", indexer.PlatformWii},
		{"GameCube gcm", "Super Smash Bros Melee.gcm", "", indexer.PlatformGameCube},
		{"GameCube rvz", "Luigis Mansion.rvz", "/games/gamecube/Luigis Mansion.rvz", indexer.PlatformGameCube},

		// PlayStation & Sega
		{"PS1 chd default", "Crash Bandicoot.chd", "", indexer.PlatformPS1},
		{"PS2 chd with path", "God of War II.chd", "/roms/ps2/God of War II.chd", indexer.PlatformPS2},
		{"Dreamcast chd", "Sonic Adventure.chd", "/roms/dreamcast/Sonic Adventure.chd", indexer.PlatformDreamcast},
		{"Saturn chd", "Nights into Dreams.chd", "/roms/saturn/Nights into Dreams.chd", indexer.PlatformSaturn},
		{"PSP pbp", "Crisis Core.pbp", "", indexer.PlatformPSP},
		{"PS1 pbp with tag", "Final Fantasy VII.pbp", "/roms/ps1/Final Fantasy VII.pbp", indexer.PlatformPS1},
		{"Genesis md", "Sonic the Hedgehog.md", "", indexer.PlatformGenesis},

		// PC & macOS
		{"PC exe", "game.exe", "", indexer.PlatformPC},
		{"PC msi", "installer.msi", "", indexer.PlatformPC},
		{"PC iso", "Elden Ring.iso", "", indexer.PlatformPC},
		{"PS2 iso with tag", "Final Fantasy X [PS2].iso", "", indexer.PlatformPS2},
		{"macOS app", "Hades.app", "", indexer.PlatformMacOS},
		{"macOS dmg", "Hades.dmg", "", indexer.PlatformMacOS},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := indexer.DeterminePlatform(tt.filename, tt.path)
			if actual != tt.expected {
				t.Errorf("DeterminePlatform(%q, %q) = %s, expected %s", tt.filename, tt.path, actual, tt.expected)
			}
		})
	}
}

func TestExtractReleaseYear(t *testing.T) {
	tests := []struct {
		input        string
		expectedYear int
	}{
		{"Cyberpunk 2077 (2020) FitGirl", 2020},
		{"Elden.Ring.2022.Repack-DODI", 2022},
		{"Super Mario 64 [1996]", 1996},
		{"The Witcher 3 Wild Hunt", 0},
	}

	for _, tt := range tests {
		year, _ := indexer.ExtractReleaseYear(tt.input)
		if year != tt.expectedYear {
			t.Errorf("ExtractReleaseYear(%q) = %d, expected %d", tt.input, year, tt.expectedYear)
		}
	}
}

func TestExtractReleaseGroup(t *testing.T) {
	tests := []struct {
		input         string
		expectedGroup string
	}{
		{"Cyberpunk.2077-FitGirl", "FITGIRL"},
		{"Elden_Ring_DODI_Repack", "DODI"},
		{"God.of.War.Ragnarok-RUNE", "RUNE"},
		{"Hollow_Knight_FLT", "FLT"},
		{"NoSceneGame.iso", ""},
	}

	for _, tt := range tests {
		actual := indexer.ExtractReleaseGroup(tt.input)
		if actual != tt.expectedGroup {
			t.Errorf("ExtractReleaseGroup(%q) = %q, expected %q", tt.input, actual, tt.expectedGroup)
		}
	}
}

func TestMatchMetadata_Heuristics(t *testing.T) {
	match, err := indexer.MatchMetadata("Cyberpunk.2077.v1.0.repack-fitgirl.iso", "")
	if err != nil {
		t.Fatalf("MatchMetadata error: %v", err)
	}

	if match.Platform != indexer.PlatformPC {
		t.Errorf("expected platform PC, got %s", match.Platform)
	}
	if match.ReleaseGroup != "FITGIRL" {
		t.Errorf("expected release group FITGIRL, got %s", match.ReleaseGroup)
	}
	if match.Source != "heuristic" {
		t.Errorf("expected source heuristic, got %s", match.Source)
	}
	if match.Confidence <= 0.70 {
		t.Errorf("expected confidence > 0.70, got %f", match.Confidence)
	}
	if match.NormalizedTitle != "cyberpunk 2077" {
		t.Errorf("expected normalized title 'cyberpunk 2077', got %q", match.NormalizedTitle)
	}

	// Test ROM matching
	romMatch, err := indexer.MatchMetadata("Super Mario 64 (USA).z64", "/roms/n64")
	if err != nil {
		t.Fatalf("MatchMetadata error: %v", err)
	}
	if romMatch.Platform != indexer.PlatformN64 {
		t.Errorf("expected platform N64, got %s", romMatch.Platform)
	}
	if romMatch.NormalizedTitle != "super mario 64" {
		t.Errorf("expected normalized title 'super mario 64', got %q", romMatch.NormalizedTitle)
	}
}

func TestMatchMetadata_SidecarOtix(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_sidecar_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	sc := &otixmeta.Sidecar{
		Version:    1,
		Title:      "The Witcher 3: Wild Hunt",
		Overview:   "Monster hunting open world RPG.",
		Confidence: 0.99,
		Companies: []map[string]any{
			{"name": "CD PROJEKT RED"},
		},
		Platforms: []map[string]any{
			{"name": "PC"},
		},
		Images: map[string]*otixmeta.ImageRef{
			"poster": {URL: "https://example.com/poster.jpg"},
		},
	}
	if err := otixmeta.Write(tmpDir, sc); err != nil {
		t.Fatalf("failed to write sidecar: %v", err)
	}

	match, err := indexer.MatchMetadata("witcher3.exe", tmpDir)
	if err != nil {
		t.Fatalf("MatchMetadata failed: %v", err)
	}

	if match.Source != "sidecar" {
		t.Errorf("expected source sidecar, got %s", match.Source)
	}
	if match.Title != "The Witcher 3: Wild Hunt" {
		t.Errorf("expected title 'The Witcher 3: Wild Hunt', got %q", match.Title)
	}
	if match.Developer != "CD PROJEKT RED" {
		t.Errorf("expected developer CD PROJEKT RED, got %q", match.Developer)
	}
	if match.Artwork["poster"] != "https://example.com/poster.jpg" {
		t.Errorf("expected poster artwork URL, got %q", match.Artwork["poster"])
	}
	if match.Confidence != 0.99 {
		t.Errorf("expected confidence 0.99, got %f", match.Confidence)
	}
}

func TestMatchMetadata_SidecarOtixmeta(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otixmeta_json_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	metaContent := map[string]any{
		"title":        "Metroid Prime",
		"year":         2002,
		"platform":     "GameCube",
		"developer":    "Retro Studios",
		"publisher":    "Nintendo",
		"overview":     "First person adventure on Tallon IV.",
		"confidence":   0.98,
		"artwork": map[string]string{
			"cover": "cover.jpg",
		},
	}
	bytes, _ := json.Marshal(metaContent)
	if err := os.WriteFile(filepath.Join(tmpDir, ".otixmeta"), bytes, 0644); err != nil {
		t.Fatalf("failed to write .otixmeta: %v", err)
	}

	match, err := indexer.MatchMetadata("game.iso", tmpDir)
	if err != nil {
		t.Fatalf("MatchMetadata failed: %v", err)
	}

	if match.Source != "sidecar" {
		t.Errorf("expected source sidecar, got %s", match.Source)
	}
	if match.Title != "Metroid Prime" {
		t.Errorf("expected title 'Metroid Prime', got %q", match.Title)
	}
	if match.Year != 2002 {
		t.Errorf("expected year 2002, got %d", match.Year)
	}
	if match.Platform != indexer.PlatformGameCube {
		t.Errorf("expected platform GameCube, got %s", match.Platform)
	}
	if match.Developer != "Retro Studios" {
		t.Errorf("expected developer 'Retro Studios', got %q", match.Developer)
	}
	if match.Artwork["cover"] != "cover.jpg" {
		t.Errorf("expected cover artwork 'cover.jpg', got %q", match.Artwork["cover"])
	}
}
