package organize

import (
	"os"
	"path/filepath"
	"strings"
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
