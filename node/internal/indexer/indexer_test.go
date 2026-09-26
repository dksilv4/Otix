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
		{".zip", "archive"},
		{".rar", "archive"},
		{".7z", "archive"},
		{".nsp", "rom"},
		{".chd", "rom"},
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

func TestStorageIndexerScanning(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_indexer_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	gameDir := filepath.Join(tmpDir, "Witcher 3")
	_ = os.MkdirAll(gameDir, 0755)
	dummyISO := filepath.Join(gameDir, "setup.exe")
	_ = os.WriteFile(dummyISO, []byte("dummy installer bytes"), 0644)

	// Create macOS metadata files that should be ignored
	_ = os.WriteFile(filepath.Join(gameDir, ".DS_Store"), []byte("junk"), 0644)
	_ = os.WriteFile(filepath.Join(gameDir, "._setup.exe"), []byte("apple double"), 0644)

	libraries := []config.LibraryConfig{
		{
			Name:              "Games",
			Path:              tmpDir,
			Kind:              "game",
			AllowedExtensions: []string{".exe", ".iso", ".dmg"},
		},
	}

	idx := indexer.NewStorageIndexer(libraries)
	files := idx.ScanAll()

	if len(files) != 1 {
		t.Fatalf("expected 1 file indexed (ignoring dotfiles), got %d", len(files))
	}

	f := files[0]
	if f.Filename != "setup.exe" {
		t.Errorf("expected filename setup.exe, got %s", f.Filename)
	}
	if f.GameTitle != "Witcher 3" {
		t.Errorf("expected game title Witcher 3, got %s", f.GameTitle)
	}
}
