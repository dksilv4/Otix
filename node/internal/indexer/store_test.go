package indexer_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/indexer"
)

func TestPersistentStore(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_store_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "cache.db")
	store, err := indexer.OpenStore(dbPath)
	if err != nil {
		t.Fatalf("OpenStore failed: %v", err)
	}
	defer store.Close()

	// 1. Initial state empty
	files, mtimes, err := store.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}
	if len(files) != 0 || len(mtimes) != 0 {
		t.Fatalf("expected empty store, got %d files", len(files))
	}

	// 2. Upsert
	testFile := indexer.HostedFile{
		ID:             "file_001",
		Filename:       "Game.iso",
		Filepath:       "/games/Game.iso",
		RelativePath:   "Game.iso",
		Filesize:       1024 * 1024 * 500,
		SHA256Head:     "abcdef123456",
		Extension:      ".iso",
		FormatCategory: "iso",
		LibraryName:    "ISOs",
		GameTitle:      "Game",
		ModifiedAt:     time.Now().UTC().Format(time.RFC3339),
	}
	if err := store.UpsertFiles([]indexer.HostedFile{testFile}); err != nil {
		t.Fatalf("UpsertFiles failed: %v", err)
	}

	// 3. Reload from store
	files, mtimes, err = store.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(files))
	}
	loaded := files["file_001"]
	if loaded.GameTitle != "Game" || loaded.Filesize != testFile.Filesize {
		t.Fatalf("loaded file mismatch: %+v", loaded)
	}
	if _, ok := mtimes["/games/Game.iso"]; !ok {
		t.Fatalf("expected mtime for /games/Game.iso")
	}

	// 4. Delete missing
	active := map[string]bool{"/games/Other.iso": true}
	deleted, err := store.DeleteMissing(active, "ISOs")
	if err != nil {
		t.Fatalf("DeleteMissing failed: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("expected 1 deleted, got %d", deleted)
	}

	files, _, _ = store.LoadAll()
	if len(files) != 0 {
		t.Fatalf("expected 0 files after delete missing, got %d", len(files))
	}
}

func TestIndexerWithPersistentStoreAndIncrementalScan(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_indexer_store_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "indexer_cache.db")
	store, err := indexer.OpenStore(dbPath)
	if err != nil {
		t.Fatalf("OpenStore failed: %v", err)
	}
	defer store.Close()

	libDir := filepath.Join(tmpDir, "GamesLib")
	_ = os.MkdirAll(libDir, 0755)

	isoPath := filepath.Join(libDir, "SuperMario.iso")
	_ = os.WriteFile(isoPath, []byte("isodata1234567890"), 0644)

	// First indexer instance with store
	idx1 := indexer.NewStorageIndexer([]config.LibraryConfig{{
		Name: "Games",
		Path: libDir,
		Kind: "iso",
	}})
	if err := idx1.SetStore(store); err != nil {
		t.Fatalf("SetStore failed: %v", err)
	}

	scanned1 := idx1.ScanAll()
	if len(scanned1) != 1 {
		t.Fatalf("expected 1 file, got %d", len(scanned1))
	}
	origID := scanned1[0].ID

	// Second indexer instance simulating node restart
	idx2 := indexer.NewStorageIndexer([]config.LibraryConfig{{
		Name: "Games",
		Path: libDir,
		Kind: "iso",
	}})
	if err := idx2.SetStore(store); err != nil {
		t.Fatalf("SetStore on idx2 failed: %v", err)
	}

	// Verify loaded immediately from store before scanning
	if len(idx2.Files()) != 1 {
		t.Fatalf("expected 1 file loaded from store before scan, got %d", len(idx2.Files()))
	}
	if idx2.Files()[0].ID != origID {
		t.Fatalf("expected cached ID %s, got %s", origID, idx2.Files()[0].ID)
	}

	// Incremental scan should reuse cached entry
	scanned2 := idx2.ScanAllWithDeep(false)
	if len(scanned2) != 1 {
		t.Fatalf("expected 1 file on incremental scan, got %d", len(scanned2))
	}
	if scanned2[0].ID != origID {
		t.Fatalf("expected identical file ID, got %s vs %s", scanned2[0].ID, origID)
	}

	// Verify ScanStatus
	status := idx2.GetStatus()
	if status.Phase != indexer.ScanPhaseCompleted {
		t.Fatalf("expected phase completed, got %s", status.Phase)
	}
	if status.TotalFiles != 1 {
		t.Fatalf("expected TotalFiles 1, got %d", status.TotalFiles)
	}
}
