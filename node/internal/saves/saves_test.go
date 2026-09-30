package saves

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSaveCloudManager(t *testing.T) {
	tmpDir := t.TempDir()

	// Test default maxSnapshots
	mgrDefault := NewSaveCloudManager(tmpDir, 0)
	if mgrDefault.maxSnapshots != 10 {
		t.Errorf("expected maxSnapshots to default to 10, got %d", mgrDefault.maxSnapshots)
	}

	// Test manager with maxSnapshots = 2
	mgr := NewSaveCloudManager(tmpDir, 2)

	// List snapshots for non-existent game
	emptySnaps := mgr.ListSnapshots("non_existent_game")
	if len(emptySnaps) != 0 {
		t.Errorf("expected 0 snapshots for non-existent game, got %d", len(emptySnaps))
	}

	// Save snapshot 1
	snap1, err := mgr.SaveSnapshot("game1", "Cyberpunk", []byte("save data 1"), "slot1.sav")
	if err != nil {
		t.Fatalf("SaveSnapshot 1 failed: %v", err)
	}
	if snap1.Filesize != 11 || snap1.Filename == "" || snap1.Filepath == "" {
		t.Errorf("unexpected snap1 attributes: %+v", snap1)
	}

	// Verify file was written
	content, err := os.ReadFile(snap1.Filepath)
	if err != nil || string(content) != "save data 1" {
		t.Errorf("file content mismatch: %v, %s", err, string(content))
	}

	// GetSnapshotPath
	foundPath := mgr.GetSnapshotPath("game1", snap1.SnapshotID)
	if foundPath != snap1.Filepath {
		t.Errorf("expected %s, got %s", snap1.Filepath, foundPath)
	}

	// Non-existent snapshot path
	if notFound := mgr.GetSnapshotPath("game1", "nonexistent_id"); notFound != "" {
		t.Errorf("expected empty string for non-existent snapshot, got %q", notFound)
	}

	time.Sleep(1100 * time.Millisecond) // Ensure unique timestamp in snapshot ID format

	// Save snapshot 2
	snap2, err := mgr.SaveSnapshot("game1", "Cyberpunk", []byte("save data 2"), "slot2.sav")
	if err != nil {
		t.Fatalf("SaveSnapshot 2 failed: %v", err)
	}

	snaps := mgr.ListSnapshots("game1")
	if len(snaps) != 2 {
		t.Fatalf("expected 2 snapshots, got %d", len(snaps))
	}
	// Verify newest first
	if snaps[0].Filename != snap2.Filename {
		t.Errorf("expected newest first, got %s then %s", snaps[0].Filename, snaps[1].Filename)
	}

	time.Sleep(1100 * time.Millisecond)

	// Save snapshot 3 (should trigger pruning of snap1)
	snap3, err := mgr.SaveSnapshot("game1", "Cyberpunk", []byte("save data 3"), "slot3.sav")
	if err != nil {
		t.Fatalf("SaveSnapshot 3 failed: %v", err)
	}

	snaps = mgr.ListSnapshots("game1")
	if len(snaps) != 2 {
		t.Fatalf("expected 2 snapshots after pruning, got %d", len(snaps))
	}

	// Verify snap1 was pruned and deleted from disk
	if _, err := os.Stat(snap1.Filepath); !os.IsNotExist(err) {
		t.Errorf("expected snap1 to be deleted from disk, but file still exists")
	}

	// Verify snap2 and snap3 remain (snap3 newest, snap2 older)
	if snaps[0].Filename != snap3.Filename || snaps[1].Filename != snap2.Filename {
		t.Errorf("expected snaps 3 and 2, got: %+v", snaps)
	}

	// Verify ListSnapshots ignores non-snapshot files and directories
	gameDir := filepath.Join(tmpDir, "game1")
	_ = os.WriteFile(filepath.Join(gameDir, "random.txt"), []byte("ignore"), 0644)
	_ = os.Mkdir(filepath.Join(gameDir, "subfolder"), 0755)

	snapsAfterNoise := mgr.ListSnapshots("game1")
	if len(snapsAfterNoise) != 2 {
		t.Errorf("expected 2 snapshots ignoring noise, got %d", len(snapsAfterNoise))
	}
}
