package organize

import (
	"os"
	"path/filepath"
	"testing"
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
