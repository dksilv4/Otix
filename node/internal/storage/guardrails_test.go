package storage_test

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/dksilv4/otix/node/internal/storage"
)

func TestIsPathAllowed_Basic(t *testing.T) {
	tmpDir := t.TempDir()
	stagingDir := filepath.Join(tmpDir, "staging")
	libraryDir := filepath.Join(tmpDir, "library")
	_ = os.MkdirAll(stagingDir, 0755)
	_ = os.MkdirAll(libraryDir, 0755)

	roots := []string{stagingDir, libraryDir}

	// Allowed paths
	if !storage.IsPathAllowed(stagingDir, roots) {
		t.Errorf("expected root itself to be allowed")
	}
	if !storage.IsPathAllowed(filepath.Join(stagingDir, "game.iso"), roots) {
		t.Errorf("expected file inside staging to be allowed")
	}
	if !storage.IsPathAllowed(filepath.Join(libraryDir, "PC", "Game", "game.exe"), roots) {
		t.Errorf("expected nested path inside library to be allowed")
	}

	// Empty and invalid paths
	if storage.IsPathAllowed("", roots) {
		t.Errorf("empty path should not be allowed")
	}
	if storage.IsPathAllowed("   ", roots) {
		t.Errorf("whitespace path should not be allowed")
	}
	if storage.IsPathAllowed(filepath.Join(stagingDir, "bad\x00path"), roots) {
		t.Errorf("null byte in path should not be allowed")
	}
	if storage.IsPathAllowed(filepath.Join(stagingDir, "game.iso"), []string{}) {
		t.Errorf("empty allowedRoots should reject all paths")
	}

	// Outside paths
	if storage.IsPathAllowed(filepath.Join(tmpDir, "unauthorized"), roots) {
		t.Errorf("path outside roots should not be allowed")
	}
	if storage.IsPathAllowed("/etc/passwd", roots) {
		t.Errorf("system path should not be allowed")
	}
}

func TestIsPathAllowed_DirectoryTraversal(t *testing.T) {
	tmpDir := t.TempDir()
	stagingDir := filepath.Join(tmpDir, "staging")
	_ = os.MkdirAll(stagingDir, 0755)
	roots := []string{stagingDir}

	traversalAttempts := []string{
		filepath.Join(stagingDir, "..", "secret.txt"),
		filepath.Join(stagingDir, "subdir", "..", "..", "secret.txt"),
		stagingDir + "/../secret.txt",
		stagingDir + "/../../etc/passwd",
		stagingDir + "/../staging_other/file.txt",
	}

	for _, attempt := range traversalAttempts {
		if storage.IsPathAllowed(attempt, roots) {
			t.Errorf("traversal attempt %q should have been rejected", attempt)
		}
	}

	// Valid path containing redundant dots that resolve inside
	validRedundant := filepath.Join(stagingDir, "subdir", "..", "file.txt")
	if !storage.IsPathAllowed(validRedundant, roots) {
		t.Errorf("redundant dots resolving inside root %q should be allowed", validRedundant)
	}
}

func TestIsPathAllowed_SymlinkEscape(t *testing.T) {
	tmpDir := t.TempDir()
	stagingDir := filepath.Join(tmpDir, "staging")
	outsideDir := filepath.Join(tmpDir, "outside")
	_ = os.MkdirAll(stagingDir, 0755)
	_ = os.MkdirAll(outsideDir, 0755)

	secretFile := filepath.Join(outsideDir, "secret.key")
	if err := os.WriteFile(secretFile, []byte("sensitive-data"), 0600); err != nil {
		t.Fatal(err)
	}

	// Create symlink inside staging pointing to file outside staging
	symlinkPath := filepath.Join(stagingDir, "escape_link")
	if err := os.Symlink(secretFile, symlinkPath); err != nil {
		t.Skipf("symlinks not supported on this platform: %v", err)
	}

	roots := []string{stagingDir}

	// Symlink pointing outside must be rejected!
	if storage.IsPathAllowed(symlinkPath, roots) {
		t.Errorf("symlink %q pointing outside staging root must be rejected", symlinkPath)
	}

	// Symlink pointing inside allowed root should be permitted
	insideTarget := filepath.Join(stagingDir, "legit.txt")
	if err := os.WriteFile(insideTarget, []byte("legit"), 0644); err != nil {
		t.Fatal(err)
	}
	legitLink := filepath.Join(stagingDir, "legit_link")
	if err := os.Symlink(insideTarget, legitLink); err == nil {
		if !storage.IsPathAllowed(legitLink, roots) {
			t.Errorf("symlink pointing inside allowed root should be permitted")
		}
	}
}

func TestIsPathAllowed_UNCPath(t *testing.T) {
	uncRoot := `\\nas-server\share\games`
	roots := []string{uncRoot}

	if !storage.IsPathAllowed(`\\nas-server\share\games\Cyberpunk.iso`, roots) {
		t.Errorf("expected UNC child path to be allowed")
	}
	if storage.IsPathAllowed(`\\nas-server\share\other\Cyberpunk.iso`, roots) {
		t.Errorf("expected different UNC share to be rejected")
	}
}

func TestValidateRelocation(t *testing.T) {
	tmpDir := t.TempDir()
	stagingDir := filepath.Join(tmpDir, "downloads")
	libraryDir := filepath.Join(tmpDir, "library")
	_ = os.MkdirAll(stagingDir, 0755)
	_ = os.MkdirAll(libraryDir, 0755)

	stagingRoots := []string{stagingDir}
	libraryRoots := []string{libraryDir}

	src := filepath.Join(stagingDir, "Game.iso")
	dst := filepath.Join(libraryDir, "PC", "Game.iso")

	// Valid relocation
	if err := storage.ValidateRelocation(src, dst, stagingRoots, libraryRoots); err != nil {
		t.Fatalf("expected valid relocation to succeed, got: %v", err)
	}

	// Source outside staging
	outsideSrc := filepath.Join(tmpDir, "unauthorized", "Game.iso")
	err := storage.ValidateRelocation(outsideSrc, dst, stagingRoots, libraryRoots)
	if err == nil || !errors.Is(err, storage.ErrPathOutOfBounds) {
		t.Errorf("expected ErrPathOutOfBounds for unauthorized source, got: %v", err)
	}

	// Target outside library
	outsideDst := filepath.Join(tmpDir, "unauthorized", "Game.iso")
	err = storage.ValidateRelocation(src, outsideDst, stagingRoots, libraryRoots)
	if err == nil || !errors.Is(err, storage.ErrPathOutOfBounds) {
		t.Errorf("expected ErrPathOutOfBounds for unauthorized target, got: %v", err)
	}

	// Source and Target identical
	err = storage.ValidateRelocation(src, src, stagingRoots, stagingRoots)
	if err == nil || !errors.Is(err, storage.ErrCollisionDetected) {
		t.Errorf("expected ErrCollisionDetected when source equals target, got: %v", err)
	}

	// Target nested inside source (e.g. moving a folder into its own subfolder)
	folderSrc := filepath.Join(stagingDir, "GameFolder")
	nestedDst := filepath.Join(folderSrc, "Subdir")
	err = storage.ValidateRelocation(folderSrc, nestedDst, stagingRoots, []string{stagingDir})
	if err == nil || !strings.Contains(err.Error(), "nested") {
		t.Errorf("expected nesting error, got: %v", err)
	}

	// Empty paths
	if err := storage.ValidateRelocation("", dst, stagingRoots, libraryRoots); err == nil {
		t.Errorf("expected error for empty source")
	}
	if err := storage.ValidateRelocation(src, "", stagingRoots, libraryRoots); err == nil {
		t.Errorf("expected error for empty target")
	}
	if err := storage.ValidateRelocation(src, dst, nil, libraryRoots); err == nil {
		t.Errorf("expected error for empty staging roots")
	}
	if err := storage.ValidateRelocation(src, dst, stagingRoots, nil); err == nil {
		t.Errorf("expected error for empty library roots")
	}
}

func TestResolveCollisionSafePath(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. Path does not exist -> returns same path
	nonExistent := filepath.Join(tmpDir, "NewGame.iso")
	safe1, err := storage.ResolveCollisionSafePath(nonExistent)
	if err != nil || safe1 != nonExistent {
		t.Fatalf("expected non-existent path to be returned unchanged, got: %s (err: %v)", safe1, err)
	}

	// 2. Existing file -> appends (1)
	existingFile := filepath.Join(tmpDir, "Game.iso")
	if err := os.WriteFile(existingFile, []byte("data"), 0644); err != nil {
		t.Fatal(err)
	}
	safe2, err := storage.ResolveCollisionSafePath(existingFile)
	if err != nil {
		t.Fatalf("ResolveCollisionSafePath failed: %v", err)
	}
	expectedSafe2 := filepath.Join(tmpDir, "Game (1).iso")
	if safe2 != expectedSafe2 {
		t.Errorf("expected %q, got %q", expectedSafe2, safe2)
	}

	// 3. Existing file and (1) -> appends (2)
	if err := os.WriteFile(expectedSafe2, []byte("data-1"), 0644); err != nil {
		t.Fatal(err)
	}
	safe3, err := storage.ResolveCollisionSafePath(existingFile)
	if err != nil {
		t.Fatalf("ResolveCollisionSafePath failed: %v", err)
	}
	expectedSafe3 := filepath.Join(tmpDir, "Game (2).iso")
	if safe3 != expectedSafe3 {
		t.Errorf("expected %q, got %q", expectedSafe3, safe3)
	}

	// Release reservation so step 4 can test querying from expectedSafe2 without file creation
	storage.ReleaseReservedPath(safe3)

	// 4. Passing file with existing (1) suffix
	safe4, err := storage.ResolveCollisionSafePath(expectedSafe2)
	if err != nil {
		t.Fatalf("ResolveCollisionSafePath failed: %v", err)
	}
	if safe4 != expectedSafe3 {
		t.Errorf("expected %q, got %q", expectedSafe3, safe4)
	}

	// 5. Existing directory -> appends (1) without splitting by dot
	dirWithDot := filepath.Join(tmpDir, "Cyberpunk.2077.v1.5")
	if err := os.MkdirAll(dirWithDot, 0755); err != nil {
		t.Fatal(err)
	}
	safeDir, err := storage.ResolveCollisionSafePath(dirWithDot)
	if err != nil {
		t.Fatalf("ResolveCollisionSafePath failed: %v", err)
	}
	expectedDir := filepath.Join(tmpDir, "Cyberpunk.2077.v1.5 (1)")
	if safeDir != expectedDir {
		t.Errorf("expected %q, got %q", expectedDir, safeDir)
	}

	// 6. Empty path error
	if _, err := storage.ResolveCollisionSafePath(""); err == nil {
		t.Errorf("expected error for empty target path")
	}
}

func TestCopyAndVerify_File(t *testing.T) {
	tmpDir := t.TempDir()

	srcFile := filepath.Join(tmpDir, "source.bin")
	dstFile := filepath.Join(tmpDir, "dest", "target.bin")
	content := []byte("Otix verified relocation test payload 1234567890")

	if err := os.WriteFile(srcFile, content, 0644); err != nil {
		t.Fatal(err)
	}

	if err := storage.CopyAndVerify(srcFile, dstFile); err != nil {
		t.Fatalf("CopyAndVerify failed: %v", err)
	}

	dstData, err := os.ReadFile(dstFile)
	if err != nil {
		t.Fatalf("failed reading destination: %v", err)
	}
	if string(dstData) != string(content) {
		t.Errorf("destination content mismatch")
	}

	// Source must remain intact
	srcData, err := os.ReadFile(srcFile)
	if err != nil || string(srcData) != string(content) {
		t.Errorf("source file was modified or deleted")
	}
}

func TestCopyAndVerify_Directory(t *testing.T) {
	tmpDir := t.TempDir()

	srcDir := filepath.Join(tmpDir, "srcGame")
	dstDir := filepath.Join(tmpDir, "dstGame")

	_ = os.MkdirAll(filepath.Join(srcDir, "bin"), 0755)
	_ = os.WriteFile(filepath.Join(srcDir, "game.exe"), []byte("exe-data"), 0755)
	_ = os.WriteFile(filepath.Join(srcDir, "bin", "game.dll"), []byte("dll-data"), 0644)

	if err := storage.CopyAndVerify(srcDir, dstDir); err != nil {
		t.Fatalf("CopyAndVerify directory failed: %v", err)
	}

	// Verify target contents
	exeData, err := os.ReadFile(filepath.Join(dstDir, "game.exe"))
	if err != nil || string(exeData) != "exe-data" {
		t.Errorf("exe in destination missing or corrupt")
	}
	dllData, err := os.ReadFile(filepath.Join(dstDir, "bin", "game.dll"))
	if err != nil || string(dllData) != "dll-data" {
		t.Errorf("dll in destination missing or corrupt")
	}
}

func TestGuardrailsInterface(t *testing.T) {
	var g storage.Guardrails = storage.NewGuardrails()

	tmpDir := t.TempDir()
	staging := filepath.Join(tmpDir, "staging")
	lib := filepath.Join(tmpDir, "lib")
	_ = os.MkdirAll(staging, 0755)
	_ = os.MkdirAll(lib, 0755)

	src := filepath.Join(staging, "file.iso")
	dst := filepath.Join(lib, "file.iso")
	_ = os.WriteFile(src, []byte("data"), 0644)

	if !g.IsPathAllowed(src, []string{staging}) {
		t.Errorf("Guardrails.IsPathAllowed failed")
	}
	if err := g.ValidateRelocation(src, dst, []string{staging}, []string{lib}); err != nil {
		t.Errorf("Guardrails.ValidateRelocation failed: %v", err)
	}
	safe, err := g.ResolveCollisionSafePath(dst)
	if err != nil || safe != dst {
		t.Errorf("Guardrails.ResolveCollisionSafePath failed: %v", err)
	}
	if err := g.CopyAndVerify(src, dst); err != nil {
		t.Errorf("Guardrails.CopyAndVerify failed: %v", err)
	}
}

func TestResolveCollisionSafePath_HighConcurrencyDirectRace(t *testing.T) {
	tmpDir := t.TempDir()
	basePath := filepath.Join(tmpDir, "RaceGameDirect.iso")

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
		if p == "" {
			t.Fatalf("goroutine received empty path")
		}
		counts[p]++
	}

	if len(counts) != goroutines {
		t.Fatalf("expected %d unique paths under concurrency, got %d", goroutines, len(counts))
	}

	for p, count := range counts {
		if count > 1 {
			t.Errorf("path %s was assigned %d times concurrently", p, count)
		}
	}
}

func TestIsPathAllowed_DanglingSymlinkEdgeCases(t *testing.T) {
	tmpDir := t.TempDir()
	staging := filepath.Join(tmpDir, "staging")
	outside := filepath.Join(tmpDir, "outside")
	_ = os.MkdirAll(staging, 0755)
	_ = os.MkdirAll(outside, 0755)

	roots := []string{staging}

	// 1. Dangling symlink inside staging pointing outside -> MUST be rejected
	danglingOutside := filepath.Join(staging, "dangling_outside")
	targetOutside := filepath.Join(outside, "uncreated_payload.iso")
	if err := os.Symlink(targetOutside, danglingOutside); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	if storage.IsPathAllowed(danglingOutside, roots) {
		t.Errorf("dangling symlink pointing outside must be rejected")
	}

	// 2. Dangling symlink inside staging pointing inside staging -> MUST be allowed
	danglingInside := filepath.Join(staging, "dangling_inside")
	targetInside := filepath.Join(staging, "future_download.iso")
	if err := os.Symlink(targetInside, danglingInside); err == nil {
		if !storage.IsPathAllowed(danglingInside, roots) {
			t.Errorf("dangling symlink pointing inside staging should be permitted")
		}
	}

	// 3. Nested path through dangling symlink directory pointing outside
	danglingDir := filepath.Join(staging, "dangling_dir")
	targetDir := filepath.Join(outside, "uncreated_folder")
	if err := os.Symlink(targetDir, danglingDir); err == nil {
		nestedChild := filepath.Join(danglingDir, "sub", "game.iso")
		if storage.IsPathAllowed(nestedChild, roots) {
			t.Errorf("nested path through dangling symlink directory pointing outside must be rejected")
		}
	}
}
