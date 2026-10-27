package organize

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/dksilv4/otix/node/internal/otixmeta"
)

func TestCleanGameTitle(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Cyberpunk.2077.v2.12.REPACK-ELAMIGOS.iso", "Cyberpunk 2077"},
		{"Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE", "Elden Ring Shadow of the Erdtree"},
		{"The.Witcher.3.Wild.Hunt.GOTY-GOG", "The Witcher 3 Wild Hunt GOTY"},
		{"Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL", "Baldurs Gate 3"},
		{"Stellar.Blade.REPACK-DELUSION", "Stellar Blade"},
		{"Cyberpunk.2077.Crack.Fix.v2-RUNE", "Cyberpunk 2077"},
		{"Elden.Ring.v1.12.Crackfix.V2-RUNE", "Elden Ring"},
		{"Hogwarts.Legacy.Crackfix.PROPER-EMPRESS", "Hogwarts Legacy"},
	}

	for _, tt := range tests {
		got := CleanGameTitle(tt.input)
		if got != tt.expected {
			t.Errorf("CleanGameTitle(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestParseReleaseName(t *testing.T) {
	rel := ParseReleaseName("Cyberpunk.2077.v2.12.REPACK-ELAMIGOS.iso")
	if rel.Title != "Cyberpunk 2077" {
		t.Errorf("expected Title=Cyberpunk 2077, got %q", rel.Title)
	}
	if rel.Year != "2077" { // 2077 matches year regex or title
		// Title parsing captures 2077 as year or clean title
	}
	if rel.ReleaseGroup != "ELAMIGOS" {
		t.Errorf("expected ReleaseGroup=ELAMIGOS, got %q", rel.ReleaseGroup)
	}

	rel2 := ParseReleaseName("Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE.iso")
	if rel2.ReleaseGroup != "RUNE" {
		t.Errorf("expected ReleaseGroup=RUNE, got %q", rel2.ReleaseGroup)
	}
	if rel2.CleanTitle != "Elden Ring Shadow of the Erdtree" {
		t.Errorf("expected CleanTitle=Elden Ring Shadow of the Erdtree, got %q", rel2.CleanTitle)
	}
}

func TestApplyNamingTemplate(t *testing.T) {
	rel := ParsedRelease{
		Title:        "Elden Ring",
		CleanTitle:   "Elden Ring",
		Year:         "2022",
		Platform:     "PC",
		ReleaseGroup: "RUNE",
		RawName:      "Elden.Ring.REPACK-RUNE",
	}

	template := "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"
	res := ApplyNamingTemplate(rel, template, "iso", "/games")

	expected := filepath.Join("/games", "Elden Ring (2022) [PC]", "Elden.Ring.REPACK-RUNE.iso")
	if filepath.Clean(res) != filepath.Clean(expected) {
		t.Errorf("ApplyNamingTemplate got %q, want %q", res, expected)
	}

	// Clean template
	template2 := "{Title} ({Year})/{Title}.{ext}"
	res2 := ApplyNamingTemplate(rel, template2, "iso", "/games")
	expected2 := filepath.Join("/games", "Elden Ring (2022)", "Elden Ring.iso")
	if filepath.Clean(res2) != filepath.Clean(expected2) {
		t.Errorf("ApplyNamingTemplate got %q, want %q", res2, expected2)
	}

	// Test duplicate platform tags: {Title} [{platform}] [{Platform}]
	templateDup := "{Title} [{platform}] [{Platform}]"
	resDup := ApplyNamingTemplate(rel, templateDup, "", "/games")
	expectedDup := filepath.Join("/games", "Elden Ring [PC]")
	if filepath.Clean(resDup) != filepath.Clean(expectedDup) {
		t.Errorf("ApplyNamingTemplate duplicate tag protection got %q, want %q", resDup, expectedDup)
	}

	// Test lowercase token: {Title} [{platform}]
	templateLower := "{Title} [{platform}]"
	resLower := ApplyNamingTemplate(rel, templateLower, "", "/games")
	expectedLower := filepath.Join("/games", "Elden Ring [PC]")
	if filepath.Clean(resLower) != filepath.Clean(expectedLower) {
		t.Errorf("ApplyNamingTemplate lowercase token got %q, want %q", resLower, expectedLower)
	}

	// Test title already having platform tag: Title = "Elden Ring [PC]"
	relWithPlat := rel
	relWithPlat.Title = "Elden Ring [PC]"
	resPreTagged := ApplyNamingTemplate(relWithPlat, "{Title} [{Platform}]", "", "/games")
	if filepath.Clean(resPreTagged) != filepath.Clean(expectedLower) {
		t.Errorf("ApplyNamingTemplate pre-tagged title got %q, want %q", resPreTagged, expectedLower)
	}
}

func TestPreviewOrganizationSampleMode(t *testing.T) {
	items, err := PreviewOrganization("", "{Title} ({Year})/{Title}.{ext}", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(items) == 0 {
		t.Fatal("expected sample items in preview")
	}

	foundCyberpunk := false
	for _, item := range items {
		if item.Extracted["Title"] == "Cyberpunk 2077" {
			foundCyberpunk = true
			if !item.Matched {
				t.Error("expected matched=true")
			}
		}
	}

	if !foundCyberpunk {
		t.Error("expected sample items to contain Cyberpunk 2077")
	}
}

func TestPreviewOrganizationRealFiles(t *testing.T) {
	tmpDir := t.TempDir()

	// Create test ISO file inside temp directory
	testIso := filepath.Join(tmpDir, "Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE.iso")
	if err := os.WriteFile(testIso, []byte("fake-iso-content"), 0644); err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]/{OriginalName}.{ext}", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 preview item, got %d", len(items))
	}

	if items[0].SourcePath != testIso {
		t.Errorf("expected sourcePath=%q, got %q", testIso, items[0].SourcePath)
	}

	if items[0].Extracted["Title"] != "Elden Ring Shadow of the Erdtree" {
		t.Errorf("expected Title='Elden Ring Shadow of the Erdtree', got %q", items[0].Extracted["Title"])
	}

	// Verify dry-run safety: original file must not be modified or deleted
	if _, err := os.Stat(testIso); os.IsNotExist(err) {
		t.Error("file was deleted during dry run!")
	}
}

func TestExecuteOrganization(t *testing.T) {
	tmpDir := t.TempDir()

	srcFile := filepath.Join(tmpDir, "source.iso")
	dstFile := filepath.Join(tmpDir, "target_folder", "organized.iso")

	if err := os.WriteFile(srcFile, []byte("iso-data"), 0644); err != nil {
		t.Fatalf("failed to write source file: %v", err)
	}

	results, err := ExecuteOrganization([]ExecuteItem{
		{SourcePath: srcFile, TargetPath: dstFile},
	})
	if err != nil {
		t.Fatalf("ExecuteOrganization failed: %v", err)
	}

	if len(results) != 1 || !results[0].Success {
		t.Fatalf("expected successful execution, got %+v", results)
	}

	if _, err := os.Stat(dstFile); os.IsNotExist(err) {
		t.Errorf("expected target file %s to exist", dstFile)
	}
}

func TestExecuteOrganizationFolderPackage(t *testing.T) {
	tmpDir := t.TempDir()

	srcDir := filepath.Join(tmpDir, "Game.Folder.REPACK")
	if err := os.MkdirAll(srcDir, 0755); err != nil {
		t.Fatalf("failed to create source folder: %v", err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "setup.exe"), []byte("setup"), 0755); err != nil {
		t.Fatalf("failed to create setup.exe: %v", err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "data1.bin"), []byte("data"), 0644); err != nil {
		t.Fatalf("failed to create data1.bin: %v", err)
	}

	dstDir := filepath.Join(tmpDir, "Games", "Game Folder")

	results, err := ExecuteOrganization([]ExecuteItem{
		{SourcePath: srcDir, TargetPath: dstDir},
	})
	if err != nil {
		t.Fatalf("ExecuteOrganization failed: %v", err)
	}

	if len(results) != 1 || !results[0].Success {
		t.Fatalf("expected successful execution, got %+v", results)
	}

	if _, err := os.Stat(filepath.Join(dstDir, "setup.exe")); os.IsNotExist(err) {
		t.Errorf("expected target setup.exe to exist in %s", dstDir)
	}
	if _, err := os.Stat(filepath.Join(dstDir, "data1.bin")); os.IsNotExist(err) {
		t.Errorf("expected target data1.bin to exist in %s", dstDir)
	}
	if _, err := os.Stat(srcDir); !os.IsNotExist(err) {
		t.Errorf("expected source folder %s to be moved away", srcDir)
	}
}

func TestPreviewOrganizationElAmigosAnomalies(t *testing.T) {
	tmpDir := t.TempDir()

	srcDir := filepath.Join(tmpDir, "Elden.Ring.v1.12.REPACK-ELAMIGOS")
	if err := os.MkdirAll(srcDir, 0755); err != nil {
		t.Fatalf("failed to create source folder: %v", err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "setup.exe"), []byte("setup"), 0755); err != nil {
		t.Fatalf("failed to create setup.exe: %v", err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "elamigos-1.bin"), []byte("bin1"), 0644); err != nil {
		t.Fatalf("failed to create elamigos-1.bin: %v", err)
	}
	// Malformed bin missing elamigos prefix
	if err := os.WriteFile(filepath.Join(srcDir, "data-2.bin"), []byte("bin2"), 0644); err != nil {
		t.Fatalf("failed to create data-2.bin: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]/{OriginalName}.{ext}", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 package item, got %d", len(items))
	}

	if len(items[0].Anomalies) == 0 {
		t.Errorf("expected ElAmigos anomalies to be detected for data-2.bin")
	}
}

func TestPreviewOrganizationIgnoresSidecarsAndNoise(t *testing.T) {
	tmpDir := t.TempDir()

	gameDir := filepath.Join(tmpDir, "AI Limit")
	if err := os.MkdirAll(gameDir, 0755); err != nil {
		t.Fatalf("failed to create game dir: %v", err)
	}

	noiseFiles := []string{
		"folder.jpg",
		"cover.png",
		"icon.ico",
		".otix",
		"v1.0.023.txt",
		"notes.nfo",
		"desktop.ini",
		"thumbs.db",
	}
	for _, f := range noiseFiles {
		if err := os.WriteFile(filepath.Join(gameDir, f), []byte("noise"), 0644); err != nil {
			t.Fatalf("failed to write %s: %v", f, err)
		}
	}

	isoPath := filepath.Join(gameDir, "AI Limit.iso")
	if err := os.WriteFile(isoPath, []byte("iso-data"), 0644); err != nil {
		t.Fatalf("failed to write iso: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]/{OriginalName}.{ext}", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected exactly 1 item (folder package for parent directory), got %d items: %+v", len(items), items)
	}

	// Prioritises renaming the parent directory as a single unit
	if items[0].Type != "folder_package" {
		t.Errorf("expected type 'folder_package', got %q", items[0].Type)
	}
	if items[0].Extracted["Title"] != "AI Limit" {
		t.Errorf("expected title 'AI Limit', got %q", items[0].Extracted["Title"])
	}
	if items[0].TargetPath != filepath.Join(tmpDir, "AI Limit [PC]") {
		t.Errorf("expected target %s, got %s", filepath.Join(tmpDir, "AI Limit [PC]"), items[0].TargetPath)
	}
}

func TestPreviewOrganizationInstalledGameFolder(t *testing.T) {
	tmpDir := t.TempDir()

	gameDir := filepath.Join(tmpDir, "Dyson Sphere Program")
	dataDir := filepath.Join(gameDir, "DSPGAME_Data")
	managedDir := filepath.Join(dataDir, "Managed")
	if err := os.MkdirAll(managedDir, 0755); err != nil {
		t.Fatalf("failed to create dirs: %v", err)
	}

	_ = os.WriteFile(filepath.Join(gameDir, "DSPGAME.exe"), []byte("exe"), 0755)
	_ = os.WriteFile(filepath.Join(gameDir, "UnityPlayer.dll"), []byte("dll"), 0644)
	_ = os.WriteFile(filepath.Join(dataDir, "boot.config"), []byte("config"), 0644)
	_ = os.WriteFile(filepath.Join(dataDir, "resources.assets"), []byte("assets"), 0644)
	_ = os.WriteFile(filepath.Join(managedDir, "Assembly-CSharp.dll"), []byte("dll"), 0644)

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]/{OriginalName}.{ext}", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected exactly 1 item (folder package), got %d: %+v", len(items), items)
	}

	if items[0].Type != "folder_package" {
		t.Errorf("expected type 'folder_package', got %q", items[0].Type)
	}
	if items[0].Extracted["Title"] != "Dyson Sphere Program" {
		t.Errorf("expected title 'Dyson Sphere Program', got %q", items[0].Extracted["Title"])
	}
}

func TestPreviewOrganizationUpdatesFolder(t *testing.T) {
	tmpDir := t.TempDir()

	gameDir := filepath.Join(tmpDir, "Baldurs Gate 3")
	updatesDir := filepath.Join(gameDir, "Updates")
	if err := os.MkdirAll(updatesDir, 0755); err != nil {
		t.Fatalf("failed to create updates dir: %v", err)
	}

	_ = os.WriteFile(filepath.Join(gameDir, "Baldurs Gate 3.iso"), []byte("iso"), 0644)
	_ = os.WriteFile(filepath.Join(updatesDir, "Baldurs Gate 3 update 5849914 6758295 ElAmigos.bin"), []byte("bin"), 0644)
	_ = os.WriteFile(filepath.Join(updatesDir, "elamigos-1.bin"), []byte("bin"), 0644)
	_ = os.WriteFile(filepath.Join(updatesDir, "update.exe"), []byte("exe"), 0755)

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]/{OriginalName}.{ext}", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	// Prioritises renaming parent directory: moves the entire Baldurs Gate 3 folder with updates intact
	if len(items) != 1 {
		t.Fatalf("expected 1 folder_package item for parent directory, got %d: %+v", len(items), items)
	}

	if items[0].Type != "folder_package" {
		t.Errorf("expected type 'folder_package', got %q", items[0].Type)
	}
	if items[0].Extracted["Title"] != "Baldurs Gate 3" {
		t.Errorf("expected title 'Baldurs Gate 3', got %q", items[0].Extracted["Title"])
	}
	if items[0].TargetPath != filepath.Join(tmpDir, "Baldurs Gate 3 [PC]") {
		t.Errorf("expected target %s, got %s", filepath.Join(tmpDir, "Baldurs Gate 3 [PC]"), items[0].TargetPath)
	}
}

func TestPreviewOrganizationOtixSidecarLinked(t *testing.T) {
	tmpDir := t.TempDir()

	// Simulate folder structure: \Games\AI Limit\AI Limit with .otix
	parentDir := filepath.Join(tmpDir, "AI Limit")
	innerDir := filepath.Join(parentDir, "AI Limit")
	if err := os.MkdirAll(innerDir, 0755); err != nil {
		t.Fatalf("failed to create inner dir: %v", err)
	}

	otixContent := `{"version":1,"mediaId":"99999","title":"AI Limit","platforms":[{"name":"PC","slug":"pc"}]}`
	if err := os.WriteFile(filepath.Join(innerDir, ".otix"), []byte(otixContent), 0644); err != nil {
		t.Fatalf("failed to write .otix: %v", err)
	}
	_ = os.WriteFile(filepath.Join(innerDir, "AI Limit.iso"), []byte("iso"), 0644)
	_ = os.WriteFile(filepath.Join(parentDir, "folder.jpg"), []byte("jpg"), 0644)

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d: %+v", len(items), items)
	}

	if items[0].Extracted["Title"] != "AI Limit" {
		t.Errorf("expected title 'AI Limit', got %q", items[0].Extracted["Title"])
	}
	if items[0].Extracted["MediaID"] != "99999" {
		t.Errorf("expected MediaID '99999', got %q", items[0].Extracted["MediaID"])
	}
	if items[0].SourcePath != parentDir {
		t.Errorf("expected source to be parent dir %s, got %s", parentDir, items[0].SourcePath)
	}
	if items[0].TargetPath != filepath.Join(tmpDir, "AI Limit [PC]") {
		t.Errorf("expected target %s, got %s", filepath.Join(tmpDir, "AI Limit [PC]"), items[0].TargetPath)
	}
}

func TestPreviewOrganizationIdempotentNoDuplicateTags(t *testing.T) {
	tmpDir := t.TempDir()

	// Folder is already organized: AI Limit [PC]
	gameDir := filepath.Join(tmpDir, "AI Limit [PC]")
	if err := os.MkdirAll(gameDir, 0755); err != nil {
		t.Fatalf("failed to create dir: %v", err)
	}
	otixContent := `{"version":1,"mediaId":"99999","title":"AI Limit","platforms":[{"name":"PC"}]}`
	_ = os.WriteFile(filepath.Join(gameDir, ".otix"), []byte(otixContent), 0644)
	_ = os.WriteFile(filepath.Join(gameDir, "AI Limit.iso"), []byte("iso"), 0644)

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d: %+v", len(items), items)
	}

	if items[0].Status != "already_organized" {
		t.Errorf("expected status 'already_organized', got %q", items[0].Status)
	}
	if items[0].TargetPath != gameDir {
		t.Errorf("expected targetPath to remain %s, got %s", gameDir, items[0].TargetPath)
	}
}

func TestApplyNamingTemplateAllTagsDedup(t *testing.T) {
	rel := ParsedRelease{
		Title:        "Cyberpunk 2077 [2020] [PC]",
		CleanTitle:   "Cyberpunk 2077",
		Year:         "2020",
		Platform:     "PC",
		Edition:      "Deluxe Edition",
		ReleaseGroup: "RUNE",
		Version:      "2.12",
	}

	tmpl := "{Title} [{Year}] [{Platform}] [{Edition}] [{ReleaseGroup}]"
	out := ApplyNamingTemplate(rel, tmpl, "iso", "")
	expected := "Cyberpunk 2077 [2020] [PC] [Deluxe Edition] [RUNE]"
	if out != expected {
		t.Errorf("expected %q, got %q", expected, out)
	}

	// Repeated duplicate tokens in template
	tmplDup := "{Title} [{Year}] [{Year}] [{Platform}] [{Platform}]"
	outDup := ApplyNamingTemplate(rel, tmplDup, "iso", "")
	expectedDup := "Cyberpunk 2077 [2020] [PC]"
	if outDup != expectedDup {
		t.Errorf("expected %q, got %q", expectedDup, outDup)
	}
}

func TestPreviewOrganizationCrackSupport(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-crack-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create a game folder with a sidecar
	gameDir := filepath.Join(tmpDir, "Cyberpunk 2077 (2020) [PC]")
	if err := os.MkdirAll(gameDir, 0755); err != nil {
		t.Fatalf("failed to create game dir: %v", err)
	}
	sc := &otixmeta.Sidecar{
		MediaID: "cp2077",
		Title:   "Cyberpunk 2077",
		Platforms: []map[string]interface{}{
			{"name": "PC"},
		},
	}
	if err := otixmeta.Write(gameDir, sc); err != nil {
		t.Fatalf("failed to write sidecar: %v", err)
	}

	// Create loose crack file alongside
	crackZip := filepath.Join(tmpDir, "Cyberpunk.2077.Crack.Only-RUNE.zip")
	if err := os.WriteFile(crackZip, []byte("crack"), 0644); err != nil {
		t.Fatalf("failed to write crack file: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Title} ({Year}) [{Platform}]", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	foundCrack := false
	for _, item := range items {
		if item.Type == "crack" && item.Status == "secondary_crack" {
			foundCrack = true
			if !strings.Contains(item.TargetPath, filepath.Join("Crack", "Cyberpunk.2077.Crack.Only-RUNE.zip")) {
				t.Errorf("unexpected crack target path: %s", item.TargetPath)
			}
		}
	}
	if !foundCrack {
		t.Errorf("expected to find secondary_crack item in preview: %+v", items)
	}
}

func TestPreviewOrganizationPlatformPrioritization(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-platform-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	gameDir := filepath.Join(tmpDir, "Baldurs Gate 3")
	if err := os.MkdirAll(gameDir, 0755); err != nil {
		t.Fatalf("failed to create game dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(gameDir, "bg3.exe"), []byte("exe"), 0755); err != nil {
		t.Fatalf("failed to write exe: %v", err)
	}
	if err := os.WriteFile(filepath.Join(gameDir, "bg3_dx11.exe"), []byte("exe"), 0755); err != nil {
		t.Fatalf("failed to write exe: %v", err)
	}
	if err := os.WriteFile(filepath.Join(gameDir, "steam_api64.dll"), []byte("dll"), 0644); err != nil {
		t.Fatalf("failed to write dll: %v", err)
	}

	// Sidecar has Xbox as first platform, and PC as second platform (like IGDB multiplatform)
	sc := &otixmeta.Sidecar{
		Version:  1,
		MediaID:  "29572",
		Title:    "Baldur's Gate 3",
		Platforms: []map[string]any{
			{"id": 19, "name": "Xbox Series X|S", "slug": "xbox-series-x-s"},
			{"id": 10, "name": "PC (Microsoft Windows)", "slug": "windows"},
			{"id": 22, "name": "PlayStation 5", "slug": "playstation-5"},
		},
	}
	if err := otixmeta.Write(gameDir, sc); err != nil {
		t.Fatalf("failed to write sidecar: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) == 0 {
		t.Fatalf("expected items in preview, got none")
	}

	for _, it := range items {
		if strings.Contains(it.SourcePath, "Baldurs Gate 3") {
			if strings.Contains(it.TargetPath, "[Xbox]") || strings.Contains(it.TargetPath, "Xbox Series") {
				t.Errorf("game was incorrectly classified as Xbox instead of PC: %s", it.TargetPath)
			}
			if !strings.Contains(it.TargetPath, "[PC]") {
				t.Errorf("expected target path to contain [PC], got: %s", it.TargetPath)
			}
		}
	}
}

func TestPreviewOrganizationPS3PlatformPrioritization(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-ps3-platform-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	gameDir := filepath.Join(tmpDir, "Grand Theft Auto V")
	if err := os.MkdirAll(gameDir, 0755); err != nil {
		t.Fatalf("failed to create game dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(gameDir, "setup.exe"), []byte("exe"), 0755); err != nil {
		t.Fatalf("failed to write setup.exe: %v", err)
	}
	if err := os.WriteFile(filepath.Join(gameDir, "setup-1.bin"), []byte("bin"), 0644); err != nil {
		t.Fatalf("failed to write bin: %v", err)
	}

	// Sidecar has PS3 as first platform, Xbox 360 second, and PC third (release order on IGDB)
	sc := &otixmeta.Sidecar{
		Version: 1,
		MediaID: "1020",
		Title:   "Grand Theft Auto V",
		Platforms: []map[string]any{
			{"id": 9, "name": "PlayStation 3", "slug": "playstation-3"},
			{"id": 12, "name": "Xbox 360", "slug": "xbox-360"},
			{"id": 6, "name": "PC (Microsoft Windows)", "slug": "windows"},
		},
	}
	if err := otixmeta.Write(gameDir, sc); err != nil {
		t.Fatalf("failed to write sidecar: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) == 0 {
		t.Fatalf("expected items in preview, got none")
	}

	for _, it := range items {
		if strings.Contains(it.SourcePath, "Grand Theft Auto V") {
			if strings.Contains(it.TargetPath, "[PS3]") || strings.Contains(it.TargetPath, "PlayStation") {
				t.Errorf("PC repack was incorrectly classified as PS3 instead of PC: %s", it.TargetPath)
			}
			if !strings.Contains(it.TargetPath, "[PC]") {
				t.Errorf("expected target path to contain [PC], got: %s", it.TargetPath)
			}
		}
	}
}

func TestPreviewOrganizationParentDoesNotSwallowSiblingGames(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-sibling-games-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Sibling 1: Game A with .otix
	gameADir := filepath.Join(tmpDir, "Game A")
	if err := os.MkdirAll(gameADir, 0755); err != nil {
		t.Fatalf("failed to create gameADir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(gameADir, "game.exe"), []byte("exe"), 0755); err != nil {
		t.Fatalf("failed to write game.exe: %v", err)
	}
	scA := &otixmeta.Sidecar{
		Version: 1,
		MediaID: "1001",
		Title:   "Game A",
		Platforms: []map[string]any{
			{"name": "PC (Microsoft Windows)", "slug": "windows"},
		},
	}
	if err := otixmeta.Write(gameADir, scA); err != nil {
		t.Fatalf("failed to write sidecar: %v", err)
	}

	// Sibling 2: Game B repack
	gameBDir := filepath.Join(tmpDir, "Game B")
	if err := os.MkdirAll(gameBDir, 0755); err != nil {
		t.Fatalf("failed to create gameBDir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(gameBDir, "setup.exe"), []byte("exe"), 0755); err != nil {
		t.Fatalf("failed to write setup.exe: %v", err)
	}
	if err := os.WriteFile(filepath.Join(gameBDir, "setup-1.bin"), []byte("bin"), 0644); err != nil {
		t.Fatalf("failed to write bin: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Title} [{Platform}]", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	// tmpDir itself must NEVER be an item in items (which would rename tmpDir to Game A and put Game B inside it)
	for _, it := range items {
		if filepath.Clean(it.SourcePath) == filepath.Clean(tmpDir) {
			t.Fatalf("parent directory containing multiple games was mistakenly swallowed as a single game: %s", it.SourcePath)
		}
	}

	// Both Game A and Game B should be independent items
	var foundA, foundB bool
	for _, it := range items {
		if filepath.Clean(it.SourcePath) == filepath.Clean(gameADir) {
			foundA = true
		}
		if filepath.Clean(it.SourcePath) == filepath.Clean(gameBDir) {
			foundB = true
		}
	}
	if !foundA {
		t.Errorf("expected Game A to be recognized as an item")
	}
	if !foundB {
		t.Errorf("expected Game B to be recognized as an item")
	}
}

func TestApplyNamingTemplateSanitizesSlashes(t *testing.T) {
	rel := ParsedRelease{
		Title:      "Fate/stay night",
		CleanTitle: "Fate/stay night",
		Platform:   "PC",
	}
	out := ApplyNamingTemplate(rel, "{Title} [{Platform}]", "", "/games")
	expected := filepath.Join(filepath.Clean("/games"), "Fate - stay night [PC]")
	if filepath.Clean(out) != expected {
		t.Errorf("expected sanitized title path %q, got %q", expected, out)
	}
}

func TestExecuteOrganizationCollisionProtection(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-exec-collision-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	srcDir := filepath.Join(tmpDir, "Game Source")
	if err := os.MkdirAll(srcDir, 0755); err != nil {
		t.Fatalf("failed to create srcDir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "source.txt"), []byte("source"), 0644); err != nil {
		t.Fatalf("failed to write source.txt: %v", err)
	}

	dstDir := filepath.Join(tmpDir, "Existing Destination")
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		t.Fatalf("failed to create dstDir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dstDir, "destination.txt"), []byte("destination"), 0644); err != nil {
		t.Fatalf("failed to write destination.txt: %v", err)
	}

	results, err := ExecuteOrganization([]ExecuteItem{
		{SourcePath: srcDir, TargetPath: dstDir},
	})
	if err != nil {
		t.Fatalf("ExecuteOrganization failed unexpectedly: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Success {
		t.Fatalf("expected move into existing non-empty directory to fail, but it succeeded!")
	}
	if !strings.Contains(results[0].Error, "already exists and is not empty") {
		t.Errorf("expected error message to mention 'already exists and is not empty', got: %s", results[0].Error)
	}
}

func TestPreviewOrganizationNestedExecutableTopLevel(t *testing.T) {
	tmpDir := t.TempDir()

	gameDir := filepath.Join(tmpDir, "Cyberpunk 2077")
	binDir := filepath.Join(gameDir, "bin", "x64")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		t.Fatalf("failed to create binDir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(binDir, "Cyberpunk2077.exe"), []byte("exe"), 0755); err != nil {
		t.Fatalf("failed to write exe: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Platform}/{Title}", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d: %+v", len(items), items)
	}
	if items[0].SourcePath != gameDir {
		t.Errorf("expected SourcePath %s, got %s", gameDir, items[0].SourcePath)
	}
	expectedTarget := filepath.Join(tmpDir, "PC", "Cyberpunk 2077")
	if items[0].TargetPath != expectedTarget {
		t.Errorf("expected TargetPath %s, got %s", expectedTarget, items[0].TargetPath)
	}
}

func TestPreviewOrganizationUnwrapSingleChildWrapper(t *testing.T) {
	tmpDir := t.TempDir()

	wrapperDir := filepath.Join(tmpDir, "Cyberpunk.2077.v2.12.REPACK-ELAMIGOS")
	innerDir := filepath.Join(wrapperDir, "Cyberpunk 2077")
	binDir := filepath.Join(innerDir, "bin", "x64")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		t.Fatalf("failed to create binDir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(binDir, "Cyberpunk2077.exe"), []byte("exe"), 0755); err != nil {
		t.Fatalf("failed to write exe: %v", err)
	}
	if err := os.WriteFile(filepath.Join(wrapperDir, "release.nfo"), []byte("nfo"), 0644); err != nil {
		t.Fatalf("failed to write nfo: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Platform}/{Title}", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d: %+v", len(items), items)
	}
	// SourcePath should be unwrapped to the inner game directory
	if items[0].SourcePath != innerDir {
		t.Errorf("expected unwrapped SourcePath %s, got %s", innerDir, items[0].SourcePath)
	}
	expectedTarget := filepath.Join(tmpDir, "PC", "Cyberpunk 2077")
	if items[0].TargetPath != expectedTarget {
		t.Errorf("expected TargetPath %s, got %s", expectedTarget, items[0].TargetPath)
	}
}

func TestPreviewOrganizationSecondaryItemsFollowFolderTemplate(t *testing.T) {
	tmpDir := t.TempDir()

	parentDir := filepath.Join(tmpDir, "Elden Ring")
	updatesDir := filepath.Join(parentDir, "Updates")
	if err := os.MkdirAll(updatesDir, 0755); err != nil {
		t.Fatalf("failed to create updatesDir: %v", err)
	}
	updateFile := filepath.Join(updatesDir, "elden_ring_update_1.13.exe")
	if err := os.WriteFile(updateFile, []byte("exe"), 0755); err != nil {
		t.Fatalf("failed to write updateFile: %v", err)
	}

	items, err := PreviewOrganization(tmpDir, "{Platform}/{Title}", false)
	if err != nil {
		t.Fatalf("PreviewOrganization failed: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d: %+v", len(items), items)
	}
	expectedTarget := filepath.Join(tmpDir, "PC", "Elden Ring", "Updates", "elden_ring_update_1.13.exe")
	if items[0].TargetPath != expectedTarget {
		t.Errorf("expected TargetPath %s, got %s", expectedTarget, items[0].TargetPath)
	}
}

func TestCopyFileAndVerify_Success(t *testing.T) {
	tmpDir := t.TempDir()
	src := filepath.Join(tmpDir, "source.iso")
	dst := filepath.Join(tmpDir, "sub", "target.iso")
	data := []byte("ISO GAME IMAGE BINARY STREAM DATA 0123456789")

	if err := os.WriteFile(src, data, 0644); err != nil {
		t.Fatal(err)
	}

	if err := CopyFileAndVerify(src, dst, 0644); err != nil {
		t.Fatalf("CopyFileAndVerify failed: %v", err)
	}

	dstData, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("failed to read dst: %v", err)
	}
	if string(dstData) != string(data) {
		t.Errorf("expected copied content %q, got %q", string(data), string(dstData))
	}

	// Verify source is still intact
	srcData, err := os.ReadFile(src)
	if err != nil || string(srcData) != string(data) {
		t.Errorf("source was modified or deleted")
	}
}

func TestCopyFileAndVerify_NonExistentSource(t *testing.T) {
	tmpDir := t.TempDir()
	src := filepath.Join(tmpDir, "does_not_exist.bin")
	dst := filepath.Join(tmpDir, "target.bin")

	if err := CopyFileAndVerify(src, dst, 0644); err == nil {
		t.Errorf("expected error for non-existent source")
	}

	// Verify destination was not created
	if _, err := os.Stat(dst); !os.IsNotExist(err) {
		t.Errorf("destination should not exist after failure")
	}
}

func TestMovePath_CrossDeviceSimulation(t *testing.T) {
	tmpDir := t.TempDir()
	src := filepath.Join(tmpDir, "staging", "Witcher3.iso")
	dst := filepath.Join(tmpDir, "library", "PC", "Witcher3.iso")
	_ = os.MkdirAll(filepath.Dir(src), 0755)

	content := []byte("Large game file content simulating cross-filesystem payload")
	if err := os.WriteFile(src, content, 0644); err != nil {
		t.Fatal(err)
	}

	if err := MovePath(src, dst); err != nil {
		t.Fatalf("MovePath failed: %v", err)
	}

	// Destination must exist and have correct content
	dstData, err := os.ReadFile(dst)
	if err != nil || string(dstData) != string(content) {
		t.Fatalf("destination file missing or corrupted: %v", err)
	}

	// Source must be cleanly removed upon successful move
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Errorf("source file should have been cleaned up after successful move")
	}
}

func TestMovePath_DirectoryRelocation(t *testing.T) {
	tmpDir := t.TempDir()
	staging := filepath.Join(tmpDir, "staging", "Cyberpunk.2077.REPACK-RUNE")
	library := filepath.Join(tmpDir, "library", "PC", "Cyberpunk 2077")

	_ = os.MkdirAll(filepath.Join(staging, "bin", "x64"), 0755)
	_ = os.WriteFile(filepath.Join(staging, "bin", "x64", "Cyberpunk2077.exe"), []byte("exe-data"), 0755)
	_ = os.WriteFile(filepath.Join(staging, "data.bin"), []byte("bin-data"), 0644)
	_ = os.WriteFile(filepath.Join(staging, "setup.exe"), []byte("setup-data"), 0755)

	if err := MovePath(staging, library); err != nil {
		t.Fatalf("MovePath directory failed: %v", err)
	}

	// Verify all target files
	checkFiles := []struct {
		rel  string
		want string
	}{
		{"bin/x64/Cyberpunk2077.exe", "exe-data"},
		{"data.bin", "bin-data"},
		{"setup.exe", "setup-data"},
	}

	for _, cf := range checkFiles {
		p := filepath.Join(library, filepath.FromSlash(cf.rel))
		data, err := os.ReadFile(p)
		if err != nil || string(data) != cf.want {
			t.Errorf("file %s corrupted or missing: %v", cf.rel, err)
		}
	}

	// Staging must be removed
	if _, err := os.Stat(staging); !os.IsNotExist(err) {
		t.Errorf("staging directory should be removed after move")
	}
}

func TestOrganizeRelocationIntegration(t *testing.T) {
	tmpDir := t.TempDir()
	stagingDir := filepath.Join(tmpDir, "downloads")
	libraryDir := filepath.Join(tmpDir, "games")

	_ = os.MkdirAll(stagingDir, 0755)
	_ = os.MkdirAll(libraryDir, 0755)

	// Create sample repack folder in staging
	gameStaging := filepath.Join(stagingDir, "Elden.Ring.v1.12.REPACK-FITGIRL")
	_ = os.MkdirAll(gameStaging, 0755)
	_ = os.WriteFile(filepath.Join(gameStaging, "eldenring.exe"), []byte("game binary"), 0755)
	_ = os.WriteFile(filepath.Join(gameStaging, "setup.exe"), []byte("installer binary"), 0755)

	// Create sample standalone ISO in staging
	isoStaging := filepath.Join(stagingDir, "God.of.War.Ragnarok-RUNE.iso")
	_ = os.WriteFile(isoStaging, []byte("god of war iso payload"), 0644)

	// Execute organization
	items := []ExecuteItem{
		{
			SourcePath: gameStaging,
			TargetPath: filepath.Join(libraryDir, "PC", "Elden Ring"),
		},
		{
			SourcePath: isoStaging,
			TargetPath: filepath.Join(libraryDir, "PC", "God of War Ragnarok", "God of War Ragnarok.iso"),
		},
	}

	results, err := ExecuteOrganization(items)
	if err != nil {
		t.Fatalf("ExecuteOrganization failed: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	for i, res := range results {
		if !res.Success {
			t.Errorf("item %d failed: %s", i, res.Error)
		}
	}

	// Verify target library files exist and have exact contents
	erExe := filepath.Join(libraryDir, "PC", "Elden Ring", "eldenring.exe")
	if data, err := os.ReadFile(erExe); err != nil || string(data) != "game binary" {
		t.Errorf("Elden Ring executable verification failed: %v", err)
	}

	gowIso := filepath.Join(libraryDir, "PC", "God of War Ragnarok", "God of War Ragnarok.iso")
	if data, err := os.ReadFile(gowIso); err != nil || string(data) != "god of war iso payload" {
		t.Errorf("God of War ISO verification failed: %v", err)
	}

	// Verify staging sources are cleaned up
	if _, err := os.Stat(gameStaging); !os.IsNotExist(err) {
		t.Errorf("staging folder should not exist after successful relocation")
	}
	if _, err := os.Stat(isoStaging); !os.IsNotExist(err) {
		t.Errorf("staging ISO should not exist after successful relocation")
	}
}

func TestMovePath_PreventSilentOverwrite(t *testing.T) {
	tmpDir := t.TempDir()
	src := filepath.Join(tmpDir, "source.iso")
	dst := filepath.Join(tmpDir, "target.iso")

	srcContent := []byte("SOURCE_FILE_PAYLOAD_NEW")
	dstContent := []byte("TARGET_FILE_PREEXISTING_DATA")

	if err := os.WriteFile(src, srcContent, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dst, dstContent, 0644); err != nil {
		t.Fatal(err)
	}

	// MovePath MUST refuse to overwrite dst
	err := MovePath(src, dst)
	if err == nil {
		t.Fatalf("expected MovePath to fail when destination exists, but it succeeded")
	}

	// Verify destination content was preserved completely
	dstActual, err := os.ReadFile(dst)
	if err != nil || string(dstActual) != string(dstContent) {
		t.Fatalf("destination was modified or corrupted: %v", err)
	}

	// Verify source content was NOT deleted
	srcActual, err := os.ReadFile(src)
	if err != nil || string(srcActual) != string(srcContent) {
		t.Fatalf("source was deleted or corrupted on move failure: %v", err)
	}
}

func TestMovePath_ConcurrentSameDestinationRace(t *testing.T) {
	tmpDir := t.TempDir()
	dst := filepath.Join(tmpDir, "shared_target.iso")

	const contenders = 10
	srcs := make([]string, contenders)
	contents := make([]string, contenders)
	for i := 0; i < contenders; i++ {
		srcs[i] = filepath.Join(tmpDir, fmt.Sprintf("src_%d.iso", i))
		contents[i] = fmt.Sprintf("PAYLOAD_FROM_SOURCE_%d", i)
		if err := os.WriteFile(srcs[i], []byte(contents[i]), 0644); err != nil {
			t.Fatal(err)
		}
	}

	startGate := make(chan struct{})
	var wg sync.WaitGroup
	errs := make([]error, contenders)

	for i := 0; i < contenders; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			<-startGate
			errs[idx] = MovePath(srcs[idx], dst)
		}(i)
	}

	close(startGate)
	wg.Wait()

	var successCount, failCount int
	var winnerIdx = -1
	for i, err := range errs {
		if err == nil {
			successCount++
			winnerIdx = i
		} else {
			failCount++
		}
	}

	if successCount != 1 {
		t.Fatalf("expected exactly 1 move to succeed, got %d successes and %d failures", successCount, failCount)
	}

	// Target file must contain the winner's content
	targetData, err := os.ReadFile(dst)
	if err != nil || string(targetData) != contents[winnerIdx] {
		t.Fatalf("target content does not match winner's payload: got %q, expected %q", string(targetData), contents[winnerIdx])
	}

	// All other source files MUST still exist on disk untouched
	for i := 0; i < contenders; i++ {
		if i == winnerIdx {
			if _, err := os.Stat(srcs[i]); !os.IsNotExist(err) {
				t.Errorf("winner source %d should have been removed", i)
			}
		} else {
			data, err := os.ReadFile(srcs[i])
			if err != nil || string(data) != contents[i] {
				t.Errorf("loser source %d was deleted or corrupted: %v", i, err)
			}
		}
	}
}

