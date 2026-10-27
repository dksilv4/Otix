package storage_test

import (
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"testing"

	"github.com/dksilv4/otix/node/internal/organize"
	"github.com/dksilv4/otix/node/internal/storage"
)

// -----------------------------------------------------------------------------
// 1. ADVERSARIAL TEST: Truncated copies & disk full / write error rollback
// -----------------------------------------------------------------------------

// TestAdversarial_CopyFileAndVerify_DiskFullSimulation simulates a disk full / write
// limit failure using RLIMIT_FSIZE to ensure copyFileAndVerify unlinks the partial
// destination and leaves the source file completely intact.
func TestAdversarial_CopyFileAndVerify_DiskFullSimulation(t *testing.T) {
	tmpDir := t.TempDir()
	src := filepath.Join(tmpDir, "source_10k.bin")
	dst := filepath.Join(tmpDir, "dst_sub", "target_10k.bin")

	// Create 100KB source file with recognizable byte pattern
	srcData := make([]byte, 100*1024)
	for i := range srcData {
		srcData[i] = byte(i % 251)
	}
	if err := os.WriteFile(src, srcData, 0644); err != nil {
		t.Fatalf("failed creating source file: %v", err)
	}

	// Read current file size limit
	var origLimit syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_FSIZE, &origLimit); err != nil {
		t.Skipf("getrlimit not supported: %v", err)
	}

	// Ignore SIGXFSZ so process is not killed on write overflow
	signal.Ignore(syscall.SIGXFSZ)
	defer signal.Reset(syscall.SIGXFSZ)

	// Set limit to 2KB so 100KB write fails with EFBIG midway
	newLimit := syscall.Rlimit{Cur: 2048, Max: origLimit.Max}
	if err := syscall.Setrlimit(syscall.RLIMIT_FSIZE, &newLimit); err != nil {
		t.Skipf("setrlimit not permitted: %v", err)
	}

	err := organize.CopyFileAndVerify(src, dst, 0644)

	// Restore original limit immediately
	_ = syscall.Setrlimit(syscall.RLIMIT_FSIZE, &origLimit)

	if err == nil {
		t.Fatalf("expected CopyFileAndVerify to fail under RLIMIT_FSIZE, but it succeeded")
	}
	t.Logf("CopyFileAndVerify failed as expected with error: %v", err)

	// ASSERTION 1: Partial destination must be completely unlinked
	if _, statErr := os.Stat(dst); !os.IsNotExist(statErr) {
		t.Fatalf("SECURITY/INTEGRITY VULNERABILITY: partial destination %s was NOT unlinked after write error", dst)
	}

	// ASSERTION 2: Source file must remain completely intact with original size & content
	srcRead, readErr := os.ReadFile(src)
	if readErr != nil {
		t.Fatalf("source file was corrupted or unreadable after copy failure: %v", readErr)
	}
	if len(srcRead) != len(srcData) {
		t.Fatalf("source file size altered: got %d, expected %d", len(srcRead), len(srcData))
	}
	for i := range srcData {
		if srcRead[i] != srcData[i] {
			t.Fatalf("source file data corrupted at byte %d", i)
		}
	}
}

// TestAdversarial_CopyAndVerify_TruncatedSource simulates a source truncation or byte
// length mismatch during copy to verify rollback unlinking and source protection.
func TestAdversarial_CopyAndVerify_TruncatedSource(t *testing.T) {
	tmpDir := t.TempDir()
	src := filepath.Join(tmpDir, "source_truncated.bin")
	dst := filepath.Join(tmpDir, "target_truncated.bin")

	// Create a large file
	data := make([]byte, 20*1024*1024) // 20MB
	for i := range data {
		data[i] = byte(i % 127)
	}
	if err := os.WriteFile(src, data, 0644); err != nil {
		t.Fatalf("failed to write source: %v", err)
	}

	var copyErr error
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		copyErr = storage.CopyAndVerify(src, dst)
	}()

	go func() {
		defer wg.Done()
		// Concurrently truncate source to trigger length verification failure or short read
		for i := 0; i < 50; i++ {
			_ = os.Truncate(src, 1024)
		}
	}()

	wg.Wait()

	if copyErr != nil {
		t.Logf("Concurrent truncation caused expected copy error: %v", copyErr)
		// Destination must be unlinked
		if _, err := os.Stat(dst); !os.IsNotExist(err) {
			t.Fatalf("INTEGRITY FAILURE: destination %s still exists after failed copy", dst)
		}
	} else {
		t.Logf("Copy completed before truncation occurred (race outcome)")
	}
}

// TestAdversarial_MovePath_SourcePreservedOnFailedDestination verifies that if destination
// cannot be written, MovePath leaves the source file completely intact and unmodified.
func TestAdversarial_MovePath_SourcePreservedOnFailedDestination(t *testing.T) {
	tmpDir := t.TempDir()
	src := filepath.Join(tmpDir, "game.bin")
	data := []byte("CRITICAL GAME PAYLOAD TO PRESERVE")
	if err := os.WriteFile(src, data, 0644); err != nil {
		t.Fatal(err)
	}

	// Create an un-writable directory for destination
	dstDir := filepath.Join(tmpDir, "readonly_dir")
	if err := os.MkdirAll(dstDir, 0555); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = os.Chmod(dstDir, 0755)
	}()

	dst := filepath.Join(dstDir, "target.bin")

	err := organize.MovePath(src, dst)
	if err == nil {
		t.Fatalf("expected MovePath into read-only directory to fail")
	}

	// Destination must not exist
	if _, statErr := os.Stat(dst); !os.IsNotExist(statErr) {
		t.Fatalf("destination should not exist on move failure")
	}

	// Source MUST remain completely intact
	srcData, readErr := os.ReadFile(src)
	if readErr != nil {
		t.Fatalf("source was lost or unreadable after failed MovePath: %v", readErr)
	}
	if string(srcData) != string(data) {
		t.Fatalf("source content mismatch: got %q, expected %q", string(srcData), string(data))
	}
}

// TestAdversarial_CopyAndVerify_DirectoryPartialFailureRollback verifies that when copying
// a multi-file directory tree, if one file copy fails, the entire destination directory
// is rolled back and removed, leaving the entire source directory structure intact.
func TestAdversarial_CopyAndVerify_DirectoryPartialFailureRollback(t *testing.T) {
	tmpDir := t.TempDir()
	srcDir := filepath.Join(tmpDir, "src_game")
	dstDir := filepath.Join(tmpDir, "dst_game")

	_ = os.MkdirAll(filepath.Join(srcDir, "sub"), 0755)
	_ = os.WriteFile(filepath.Join(srcDir, "file1.txt"), []byte("file1"), 0644)
	_ = os.WriteFile(filepath.Join(srcDir, "sub", "file2.txt"), []byte("file2"), 0644)

	// Set file2 as unreadable (0000)
	unreadableFile := filepath.Join(srcDir, "sub", "file2.txt")
	_ = os.Chmod(unreadableFile, 0000)
	defer func() {
		_ = os.Chmod(unreadableFile, 0644)
	}()

	err := storage.CopyAndVerify(srcDir, dstDir)
	if err == nil {
		t.Fatalf("expected CopyAndVerify to fail on unreadable file")
	}

	// Destination directory must be completely removed by rollback
	if _, statErr := os.Stat(dstDir); !os.IsNotExist(statErr) {
		t.Fatalf("ROLLBACK FAILURE: destination directory %s was not cleanly unlinked after failure", dstDir)
	}

	// Source directory must still have file1 intact
	f1Data, err := os.ReadFile(filepath.Join(srcDir, "file1.txt"))
	if err != nil || string(f1Data) != "file1" {
		t.Fatalf("source file1 was corrupted or deleted: %v", err)
	}
}

// -----------------------------------------------------------------------------
// 2. ADVERSARIAL TEST: Hostile symlink traversal, junction points & escapes
// -----------------------------------------------------------------------------

func TestAdversarial_HostileSymlinkDeepChainsAndLoops(t *testing.T) {
	tmpDir := t.TempDir()
	staging := filepath.Join(tmpDir, "staging")
	library := filepath.Join(tmpDir, "library")
	outside := filepath.Join(tmpDir, "outside")
	_ = os.MkdirAll(staging, 0755)
	_ = os.MkdirAll(library, 0755)
	_ = os.MkdirAll(outside, 0755)

	secretFile := filepath.Join(outside, "secret.key")
	_ = os.WriteFile(secretFile, []byte("TOP_SECRET_CREDENTIALS"), 0600)

	// Deep symlink chain inside staging pointing outside:
	// link1 -> link2 -> link3 -> outside/secret.key
	link3 := filepath.Join(staging, "link3")
	if err := os.Symlink(secretFile, link3); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}
	link2 := filepath.Join(staging, "link2")
	_ = os.Symlink(link3, link2)
	link1 := filepath.Join(staging, "link1")
	_ = os.Symlink(link2, link1)

	// Deeply nested directory with symlink directory pointing outside:
	// staging/a/b/c/outside_dir -> outside
	nestedDir := filepath.Join(staging, "a", "b", "c")
	_ = os.MkdirAll(nestedDir, 0755)
	symlinkDir := filepath.Join(nestedDir, "outside_dir")
	_ = os.Symlink(outside, symlinkDir)

	// Symlink loop escaping outside: staging/loopOutside -> outside/loopA
	outsideLoopA := filepath.Join(outside, "loopA")
	outsideLoopB := filepath.Join(outside, "loopB")
	_ = os.Symlink(outsideLoopB, outsideLoopA)
	_ = os.Symlink(outsideLoopA, outsideLoopB)
	loopOutside := filepath.Join(staging, "loopOutside")
	_ = os.Symlink(outsideLoopA, loopOutside)

	// Symlink to root: staging/root_link -> /
	rootLink := filepath.Join(staging, "root_link")
	_ = os.Symlink("/", rootLink)

	// Symlink pointing to parent of staging: staging/up_link -> ..
	upLink := filepath.Join(staging, "up_link")
	_ = os.Symlink("..", upLink)

	// Test IsPathAllowed
	guard := storage.NewGuardrails()
	stagingRoots := []string{staging}
	libraryRoots := []string{library}

	hostileEscapingPaths := []string{
		link1,
		link2,
		link3,
		filepath.Join(symlinkDir, "secret.key"),
		filepath.Join(staging, "a", "b", "c", "outside_dir", "secret.key"),
		filepath.Join(rootLink, "etc", "passwd"),
		filepath.Join(upLink, "outside", "secret.key"),
		loopOutside,
	}

	for _, p := range hostileEscapingPaths {
		if guard.IsPathAllowed(p, stagingRoots) {
			t.Errorf("SECURITY VULNERABILITY: IsPathAllowed permitted hostile symlink traversal: %q", p)
		}

		// Also test ValidateRelocation
		err := guard.ValidateRelocation(p, filepath.Join(library, "target.bin"), stagingRoots, libraryRoots)
		if err == nil {
			t.Errorf("SECURITY VULNERABILITY: ValidateRelocation permitted hostile source path: %q", p)
		}
	}

	// Adversarial Target in ValidateRelocation:
	// Destination inside library uses symlink pointing to outside
	libEvilDir := filepath.Join(library, "evil_link")
	_ = os.Symlink(outside, libEvilDir)
	evilDst := filepath.Join(libEvilDir, "exploit.txt")

	legitSrc := filepath.Join(staging, "legit.iso")
	_ = os.WriteFile(legitSrc, []byte("legit"), 0644)

	if guard.IsPathAllowed(evilDst, libraryRoots) {
		t.Errorf("SECURITY VULNERABILITY: IsPathAllowed permitted target escaping via symlink directory: %q", evilDst)
	}

	err := guard.ValidateRelocation(legitSrc, evilDst, stagingRoots, libraryRoots)
	if err == nil {
		t.Errorf("SECURITY VULNERABILITY: ValidateRelocation permitted target writing outside library via symlink: %q", evilDst)
	}
}

// TestAdversarial_DeepUncreatedSymlinkEscape tests escaping when intermediate directories
// do not exist yet on disk, but ancestor is a symlink pointing outside.
func TestAdversarial_DeepUncreatedSymlinkEscape(t *testing.T) {
	tmpDir := t.TempDir()
	staging := filepath.Join(tmpDir, "staging")
	library := filepath.Join(tmpDir, "library")
	outside := filepath.Join(tmpDir, "outside")
	_ = os.MkdirAll(staging, 0755)
	_ = os.MkdirAll(library, 0755)
	_ = os.MkdirAll(outside, 0755)

	// staging/symlink_dir -> outside
	symlinkDir := filepath.Join(staging, "symlink_dir")
	if err := os.Symlink(outside, symlinkDir); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	// Deeply nested hypothetical path where level1/level2/file.iso does not exist
	deepTarget := filepath.Join(symlinkDir, "level1", "level2", "file.iso")

	guard := storage.NewGuardrails()
	if guard.IsPathAllowed(deepTarget, []string{staging}) {
		t.Errorf("SECURITY VULNERABILITY: IsPathAllowed permitted deeply nested uncreated path through symlink ancestor: %q", deepTarget)
	}
}

// TestAdversarial_DanglingSymlinkEscape tests whether a symlink inside staging pointing
// to a non-existent file outside staging (e.g. /etc/cron.d/pwned or /outside/newfile) escapes IsPathAllowed.
func TestAdversarial_DanglingSymlinkEscape(t *testing.T) {
	tmpDir := t.TempDir()
	staging := filepath.Join(tmpDir, "staging")
	library := filepath.Join(tmpDir, "library")
	outside := filepath.Join(tmpDir, "outside")
	_ = os.MkdirAll(staging, 0755)
	_ = os.MkdirAll(library, 0755)
	_ = os.MkdirAll(outside, 0755)

	// Create symlink inside staging pointing to non-existent file outside staging
	danglingLink := filepath.Join(staging, "dangling_exploit")
	outsideTarget := filepath.Join(outside, "non_existent_exploit.iso")
	if err := os.Symlink(outsideTarget, danglingLink); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	guard := storage.NewGuardrails()
	allowed := guard.IsPathAllowed(danglingLink, []string{staging})
	t.Logf("IsPathAllowed on dangling symlink pointing outside returned: %v", allowed)
	if allowed {
		t.Errorf("SECURITY VULNERABILITY: IsPathAllowed permitted symlink %q pointing to outside path %q", danglingLink, outsideTarget)
	}
}

// TestAdversarial_SequentialCollisionResolution_Baseline demonstrates that collision resolution
// functions correctly in a single-threaded/sequential environment as a baseline.
func TestAdversarial_SequentialCollisionResolution_Baseline(t *testing.T) {
	tmpDir := t.TempDir()
	library := filepath.Join(tmpDir, "library")
	_ = os.MkdirAll(library, 0755)

	targetBase := filepath.Join(library, "Game.iso")
	guard := storage.NewGuardrails()

	const count = 10
	for i := 0; i < count; i++ {
		safePath, err := guard.ResolveCollisionSafePath(targetBase)
		if err != nil {
			t.Fatalf("step %d: ResolveCollisionSafePath failed: %v", i, err)
		}
		// Create file at resolved path
		if err := os.WriteFile(safePath, []byte(fmt.Sprintf("data-%d", i)), 0644); err != nil {
			t.Fatalf("step %d: write failed: %v", i, err)
		}
	}

	entries, err := os.ReadDir(library)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != count {
		t.Fatalf("expected %d files in baseline sequential test, got %d", count, len(entries))
	}
}

func TestAdversarial_HostileDoubleDotAndNullByteEscapes(t *testing.T) {
	tmpDir := t.TempDir()
	staging := filepath.Join(tmpDir, "staging")
	library := filepath.Join(tmpDir, "library")
	_ = os.MkdirAll(staging, 0755)
	_ = os.MkdirAll(library, 0755)

	guard := storage.NewGuardrails()
	stagingRoots := []string{staging}
	libraryRoots := []string{library}

	adversarialPayloads := []string{
		filepath.Join(staging, "..", "..", "..", "etc", "passwd"),
		filepath.Join(staging, "subdir", "..", "..", "..", "outside.bin"),
		staging + "/../../../../etc/shadow",
		staging + "/../library/Game.iso",
		staging + "/../outside/data.bin",
		staging + "/file.iso\x00.exe",
		staging + "\x00/../../etc/passwd",
		staging + "/sub/\x00/evil.bin",
		"\x00",
		"   \x00   ",
		"..",
		"../..",
		"/",
		"",
		"    ",
	}

	for _, payload := range adversarialPayloads {
		if guard.IsPathAllowed(payload, stagingRoots) {
			t.Errorf("SECURITY VULNERABILITY: IsPathAllowed permitted traversal/null-byte payload: %q", payload)
		}

		err := guard.ValidateRelocation(payload, filepath.Join(library, "Game.iso"), stagingRoots, libraryRoots)
		if err == nil {
			t.Errorf("SECURITY VULNERABILITY: ValidateRelocation permitted invalid/escaping source: %q", payload)
		}
	}
}

// -----------------------------------------------------------------------------
// 3. ADVERSARIAL TEST: High-concurrency collision resolution (50 goroutines)
// -----------------------------------------------------------------------------

// TestAdversarial_HighConcurrencyCollisionResolution simulates 50 concurrent relocations
// targeting the exact same filename (e.g. "Game.iso").
// It verifies whether every file receives a distinct collision suffix `(1)`, `(2)`...
// without race conditions, overwrites, or data loss.
func TestAdversarial_HighConcurrencyCollisionResolution(t *testing.T) {
	tmpDir := t.TempDir()
	stagingDir := filepath.Join(tmpDir, "staging")
	libraryDir := filepath.Join(tmpDir, "library")
	_ = os.MkdirAll(stagingDir, 0755)
	_ = os.MkdirAll(libraryDir, 0755)

	const numRelocations = 50
	targetBase := "Cyberpunk 2077.iso"
	targetPath := filepath.Join(libraryDir, targetBase)

	// Create 50 distinct source files in staging with unique identifiable contents
	type SourceInfo struct {
		Path    string
		Content string
	}
	sources := make([]SourceInfo, numRelocations)
	for i := 0; i < numRelocations; i++ {
		srcFile := filepath.Join(stagingDir, fmt.Sprintf("download_part_%02d.iso", i))
		content := fmt.Sprintf("UNIQUE_PAYLOAD_FOR_FILE_%02d_TIMESTAMP_HASH", i)
		if err := os.WriteFile(srcFile, []byte(content), 0644); err != nil {
			t.Fatalf("failed to write source %d: %v", i, err)
		}
		sources[i] = SourceInfo{
			Path:    srcFile,
			Content: content,
		}
	}

	guard := storage.NewGuardrails()

	// Launch 50 concurrent goroutines synchronizing on a start gate
	startGate := make(chan struct{})
	var wg sync.WaitGroup

	type RelocateResult struct {
		Index       int
		ResolvedDst string
		Err         error
	}
	results := make([]RelocateResult, numRelocations)

	for i := 0; i < numRelocations; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			<-startGate // Synchronized barrier release

			// 1. Resolve collision safe path
			safeDst, err := guard.ResolveCollisionSafePath(targetPath)
			if err != nil {
				results[idx] = RelocateResult{Index: idx, Err: fmt.Errorf("ResolveCollisionSafePath: %w", err)}
				return
			}

			// 2. Perform relocation
			moveErr := organize.MovePath(sources[idx].Path, safeDst)
			results[idx] = RelocateResult{
				Index:       idx,
				ResolvedDst: safeDst,
				Err:         moveErr,
			}
		}(i)
	}

	// Release all 50 goroutines simultaneously
	close(startGate)
	wg.Wait()

	// Analyze outcomes
	var failedMoves int
	resolvedPaths := make(map[string]int) // path -> count

	for _, res := range results {
		if res.Err != nil {
			failedMoves++
			t.Logf("Goroutine %02d failed: %v", res.Index, res.Err)
		} else {
			resolvedPaths[res.ResolvedDst]++
		}
	}

	// Inspect library directory contents
	entries, readErr := os.ReadDir(libraryDir)
	if readErr != nil {
		t.Fatalf("failed to read library dir: %v", readErr)
	}

	t.Logf("=== 50 CONCURRENT RELOCATIONS SUMMARY ===")
	t.Logf("Total attempted: %d", numRelocations)
	t.Logf("Total unique destination paths returned: %d", len(resolvedPaths))
	t.Logf("Total files physically present on disk in library: %d", len(entries))
	t.Logf("Total failed move operations: %d", failedMoves)

	for p, count := range resolvedPaths {
		if count > 1 {
			t.Errorf("DATA LOSS / RACE CONDITION: Path %q was assigned to %d concurrent relocations!", p, count)
		}
	}

	// Check if all 50 unique payloads are present on disk
	payloadsFound := make(map[string]string) // payload -> filename
	for _, entry := range entries {
		p := filepath.Join(libraryDir, entry.Name())
		data, err := os.ReadFile(p)
		if err != nil {
			t.Errorf("unable to read file %s: %v", entry.Name(), err)
			continue
		}
		payloadsFound[string(data)] = entry.Name()
	}

	t.Logf("Unique payloads preserved on disk: %d / %d", len(payloadsFound), numRelocations)

	var missingPayloads []int
	for i, src := range sources {
		if fname, found := payloadsFound[src.Content]; found {
			_ = fname
		} else {
			missingPayloads = append(missingPayloads, i)
		}
	}

	if len(missingPayloads) > 0 {
		t.Errorf("CRITICAL DATA LOSS: %d / 50 files were lost or overwritten during concurrent relocation! Missing source indices: %v",
			len(missingPayloads), missingPayloads)
	}

	if len(entries) != numRelocations {
		t.Errorf("CONCURRENCY RESOLUTION FAILURE: expected %d files in library, found %d", numRelocations, len(entries))
	}
}

// TestAdversarial_ResolveCollisionSafePath_DirectRace tests calling ResolveCollisionSafePath
// directly across 50 concurrent goroutines without intermediate file creation,
// demonstrating whether check-then-act TOCTOU exists.
func TestAdversarial_ResolveCollisionSafePath_DirectRace(t *testing.T) {
	tmpDir := t.TempDir()
	basePath := filepath.Join(tmpDir, "RaceGame.iso")

	// Pre-create the initial file
	if err := os.WriteFile(basePath, []byte("seed"), 0644); err != nil {
		t.Fatal(err)
	}

	const goroutines = 50
	paths := make([]string, goroutines)
	var wg sync.WaitGroup
	startGate := make(chan struct{})

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			<-startGate
			p, err := storage.ResolveCollisionSafePath(basePath)
			if err == nil {
				paths[idx] = p
			}
		}(i)
	}

	close(startGate)
	wg.Wait()

	counts := make(map[string]int)
	for _, p := range paths {
		if p != "" {
			counts[p]++
		}
	}

	t.Logf("Direct concurrent ResolveCollisionSafePath results on existing file (%d calls):", goroutines)
	for p, count := range counts {
		t.Logf("  Path: %s -> returned %d times", filepath.Base(p), count)
	}

	// If multiple goroutines get the exact same collision path, TOCTOU is confirmed
	if count := counts[filepath.Join(tmpDir, "RaceGame (1).iso")]; count > 1 {
		t.Logf("CONFIRMED TOCTOU RACE: 'RaceGame (1).iso' returned %d times concurrently before file was created", count)
	}
}
