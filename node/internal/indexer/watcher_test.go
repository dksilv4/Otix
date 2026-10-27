package indexer_test

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/dksilv4/otix/node/internal/indexer"
)

func TestWatcher_DebounceAndDeduplication(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_watcher_debounce_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	triggerChan := make(chan string, 10)
	var callCount int32

	w, err := indexer.NewWatcher(func(changedPath string) {
		atomic.AddInt32(&callCount, 1)
		triggerChan <- changedPath
	})
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Close()

	w.SetPaths([]string{tmpDir})
	time.Sleep(100 * time.Millisecond) // Allow watcher to bind

	startTime := time.Now()

	// Rapidly produce 3 filesystem events within 400ms
	_ = os.WriteFile(filepath.Join(tmpDir, "file1.txt"), []byte("first"), 0644)
	time.Sleep(150 * time.Millisecond)
	_ = os.WriteFile(filepath.Join(tmpDir, "file2.txt"), []byte("second"), 0644)
	time.Sleep(150 * time.Millisecond)
	_ = os.WriteFile(filepath.Join(tmpDir, "file1.txt"), []byte("first modified"), 0644)

	// Since last write was at ~300ms, debounce of 1500ms should fire around ~1800ms
	select {
	case changedPath := <-triggerChan:
		elapsed := time.Since(startTime)
		if elapsed < 1400*time.Millisecond {
			t.Errorf("debounced callback fired too quickly: %v (expected >= 1400ms)", elapsed)
		}
		if changedPath != tmpDir {
			t.Errorf("expected changed path %s, got %s", tmpDir, changedPath)
		}
	case <-time.After(3500 * time.Millisecond):
		t.Fatalf("debounced callback did not fire within 3.5s")
	}

	// Verify no duplicate callback arrives
	time.Sleep(600 * time.Millisecond)
	if count := atomic.LoadInt32(&callCount); count != 1 {
		t.Errorf("expected exactly 1 callback invocation after debouncing, got %d", count)
	}
}

func TestWatcher_RecursiveSubdirectoryRegistration(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_watcher_recursive_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Pre-create nested directory structure
	deepDir := filepath.Join(tmpDir, "level1", "level2", "level3")
	if err := os.MkdirAll(deepDir, 0755); err != nil {
		t.Fatal(err)
	}

	triggerChan := make(chan string, 10)
	w, err := indexer.NewWatcher(func(changedPath string) {
		triggerChan <- changedPath
	})
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Close()

	w.SetPaths([]string{tmpDir})
	time.Sleep(100 * time.Millisecond)

	// Write inside deeply nested subdirectory
	targetFile := filepath.Join(deepDir, "game.iso")
	if err := os.WriteFile(targetFile, []byte("game data"), 0644); err != nil {
		t.Fatal(err)
	}

	select {
	case changedPath := <-triggerChan:
		if changedPath != tmpDir {
			t.Errorf("expected root path %s, got %s", tmpDir, changedPath)
		}
	case <-time.After(3500 * time.Millisecond):
		t.Fatalf("watcher did not detect change in nested subdirectory")
	}
}

func TestWatcher_DynamicDirectoryCreation(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_watcher_dynamic_dir_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	triggerChan := make(chan string, 10)
	w, err := indexer.NewWatcher(func(changedPath string) {
		triggerChan <- changedPath
	})
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Close()

	w.SetPaths([]string{tmpDir})
	time.Sleep(100 * time.Millisecond)

	// Dynamically create new directory while watcher is active
	newDir := filepath.Join(tmpDir, "new_downloads")
	if err := os.Mkdir(newDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Drain any debounce triggered by directory creation itself
	select {
	case <-triggerChan:
	case <-time.After(2000 * time.Millisecond):
	}

	// Now write a file inside the newly created directory
	if err := os.WriteFile(filepath.Join(newDir, "downloaded.iso"), []byte("iso bytes"), 0644); err != nil {
		t.Fatal(err)
	}

	select {
	case changedPath := <-triggerChan:
		if changedPath != tmpDir {
			t.Errorf("expected root path %s, got %s", tmpDir, changedPath)
		}
	case <-time.After(3500 * time.Millisecond):
		t.Fatalf("watcher did not watch dynamically added subdirectory")
	}
}

func TestWatcher_NoiseAndTempFiltering(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_watcher_noise_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	triggerChan := make(chan string, 10)
	w, err := indexer.NewWatcher(func(changedPath string) {
		triggerChan <- changedPath
	})
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Close()

	// Pre-create noise directories
	gitDir := filepath.Join(tmpDir, ".git")
	_ = os.MkdirAll(gitDir, 0755)
	nodeModulesDir := filepath.Join(tmpDir, "node_modules")
	_ = os.MkdirAll(nodeModulesDir, 0755)
	redistDir := filepath.Join(tmpDir, "_CommonRedist")
	_ = os.MkdirAll(redistDir, 0755)

	w.SetPaths([]string{tmpDir})
	time.Sleep(100 * time.Millisecond)

	// 1. Write file in .git (should be skipped)
	_ = os.WriteFile(filepath.Join(gitDir, "HEAD"), []byte("ref: refs/heads/main"), 0644)

	// 2. Write file in node_modules (should be skipped)
	_ = os.WriteFile(filepath.Join(nodeModulesDir, "package.json"), []byte("{}"), 0644)

	// 3. Write file in _CommonRedist (should be skipped)
	_ = os.WriteFile(filepath.Join(redistDir, "vcredist.exe"), []byte("redist"), 0644)

	// 4. Write temporary file ending in .tmp
	_ = os.WriteFile(filepath.Join(tmpDir, "game_download.tmp"), []byte("temp"), 0644)

	// 5. Write temporary file ending in .crdownload
	_ = os.WriteFile(filepath.Join(tmpDir, "game.crdownload"), []byte("downloading"), 0644)

	// 6. Write hidden file starting with dot
	_ = os.WriteFile(filepath.Join(tmpDir, ".DS_Store"), []byte("macos junk"), 0644)

	// Wait for debounce period + margin
	select {
	case unexpected := <-triggerChan:
		t.Fatalf("watcher triggered on ignored noise/temp file: %s", unexpected)
	case <-time.After(2000 * time.Millisecond):
		// Success: no event was dispatched for noise
	}
}

func TestWatcher_CloseIdempotency(t *testing.T) {
	w, err := indexer.NewWatcher(func(changedPath string) {})
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}

	if err := w.Close(); err != nil {
		t.Errorf("first Close() failed: %v", err)
	}

	// Second Close should be a clean no-op
	if err := w.Close(); err != nil {
		t.Errorf("second Close() failed: %v", err)
	}
}
