package indexer_test

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/dksilv4/otix/node/internal/indexer"
)

// TestWatcher_AdversarialHammer100Events hammers the watcher with 100 rapid file events
// in rapid succession and asserts that exactly 1 scan trigger occurs per debounce cycle.
func TestWatcher_AdversarialHammer100Events(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_watcher_hammer_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	triggerChan := make(chan string, 50)
	var callbackCount int32

	w, err := indexer.NewWatcher(func(changedPath string) {
		atomic.AddInt32(&callbackCount, 1)
		triggerChan <- changedPath
	})
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Close()

	w.SetPaths([]string{tmpDir})
	time.Sleep(100 * time.Millisecond) // Allow watcher to bind to directory

	startTime := time.Now()

	// Hammer: 100 rapid file write operations
	const eventCount = 100
	for i := 0; i < eventCount; i++ {
		filename := filepath.Join(tmpDir, fmt.Sprintf("hammer_file_%03d.dat", i))
		content := fmt.Sprintf("hammer payload %d timestamp %d", i, time.Now().UnixNano())
		if err := os.WriteFile(filename, []byte(content), 0644); err != nil {
			t.Fatalf("failed to write hammer file %d: %v", i, err)
		}
		// Introduce tiny jitter between 0 and 5ms to simulate realistic bursty filesystem writes
		if i%10 == 0 {
			time.Sleep(3 * time.Millisecond)
		}
	}

	burstDuration := time.Since(startTime)
	t.Logf("Wrote %d files in %v", eventCount, burstDuration)

	// Debounce window is 1500ms from the LAST event
	select {
	case changedPath := <-triggerChan:
		elapsed := time.Since(startTime)
		t.Logf("First trigger fired after %v for path %s", elapsed, changedPath)
		if elapsed < 1400*time.Millisecond {
			t.Errorf("Debounce callback fired prematurely (%v) before 1500ms quiet window", elapsed)
		}
		if changedPath != tmpDir {
			t.Errorf("Expected changedPath == %s, got %s", tmpDir, changedPath)
		}
	case <-time.After(4000 * time.Millisecond):
		t.Fatalf("Debounce callback timed out after 4 seconds")
	}

	// Verify that NO additional callback occurs for this cycle
	time.Sleep(1000 * time.Millisecond)
	finalCount := atomic.LoadInt32(&callbackCount)
	if finalCount != 1 {
		t.Errorf("ADVERSARIAL HAMMER FAILURE: Expected exactly 1 callback after 100 rapid events, got %d", finalCount)
	}
}

// TestWatcher_AdversarialConcurrentHammer hammers the watcher from 10 parallel goroutines
// each performing 10 writes simultaneously (100 concurrent writes total).
func TestWatcher_AdversarialConcurrentHammer(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_watcher_concurrent_hammer")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	triggerChan := make(chan string, 50)
	var callbackCount int32

	w, err := indexer.NewWatcher(func(changedPath string) {
		atomic.AddInt32(&callbackCount, 1)
		triggerChan <- changedPath
	})
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Close()

	w.SetPaths([]string{tmpDir})
	time.Sleep(100 * time.Millisecond)

	startTime := time.Now()
	var wg sync.WaitGroup
	const goroutines = 10
	const filesPerGoroutine = 10

	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func(gID int) {
			defer wg.Done()
			for f := 0; f < filesPerGoroutine; f++ {
				file := filepath.Join(tmpDir, fmt.Sprintf("concurrent_g%d_f%d.dat", gID, f))
				_ = os.WriteFile(file, []byte(fmt.Sprintf("data_%d_%d", gID, f)), 0644)
				time.Sleep(2 * time.Millisecond)
			}
		}(g)
	}

	wg.Wait()
	t.Logf("Completed 100 concurrent writes in %v", time.Since(startTime))

	select {
	case changedPath := <-triggerChan:
		t.Logf("Callback triggered for path %s", changedPath)
		if changedPath != tmpDir {
			t.Errorf("Expected root path %s, got %s", tmpDir, changedPath)
		}
	case <-time.After(4500 * time.Millisecond):
		t.Fatalf("Debounce callback timed out after concurrent hammering")
	}

	// Verify exactly 1 trigger
	time.Sleep(800 * time.Millisecond)
	count := atomic.LoadInt32(&callbackCount)
	if count != 1 {
		t.Errorf("ADVERSARIAL CONCURRENT HAMMER FAILURE: Expected exactly 1 callback, got %d", count)
	}
}

// TestWatcher_AdversarialMultiCycleHammer verifies that multiple consecutive debounce cycles
// each fire exactly 1 event when separated by quiet intervals.
func TestWatcher_AdversarialMultiCycleHammer(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_watcher_multicycle_hammer")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	triggerChan := make(chan string, 20)
	var callbackCount int32

	w, err := indexer.NewWatcher(func(changedPath string) {
		atomic.AddInt32(&callbackCount, 1)
		triggerChan <- changedPath
	})
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Close()

	w.SetPaths([]string{tmpDir})
	time.Sleep(100 * time.Millisecond)

	// Cycle 1: 30 rapid writes
	for i := 0; i < 30; i++ {
		f := filepath.Join(tmpDir, fmt.Sprintf("cycle1_file_%d.rom", i))
		_ = os.WriteFile(f, []byte("cycle1"), 0644)
	}

	select {
	case <-triggerChan:
		t.Logf("Cycle 1 callback received")
	case <-time.After(3500 * time.Millisecond):
		t.Fatalf("Cycle 1 callback timed out")
	}

	time.Sleep(500 * time.Millisecond)
	if c := atomic.LoadInt32(&callbackCount); c != 1 {
		t.Fatalf("Expected exactly 1 callback after Cycle 1, got %d", c)
	}

	// Cycle 2: another 30 rapid writes
	for i := 0; i < 30; i++ {
		f := filepath.Join(tmpDir, fmt.Sprintf("cycle2_file_%d.rom", i))
		_ = os.WriteFile(f, []byte("cycle2"), 0644)
	}

	select {
	case <-triggerChan:
		t.Logf("Cycle 2 callback received")
	case <-time.After(3500 * time.Millisecond):
		t.Fatalf("Cycle 2 callback timed out")
	}

	time.Sleep(500 * time.Millisecond)
	if c := atomic.LoadInt32(&callbackCount); c != 2 {
		t.Fatalf("Expected exactly 2 callbacks after Cycle 2, got %d", c)
	}
}
