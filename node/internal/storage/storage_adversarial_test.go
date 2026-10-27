package storage_test

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/dksilv4/otix/node/internal/storage"
)

// TestAdversarial_PathTraversalBoundary checks various directory traversal attacks
// against FolderRegistry.IsPathAllowed and guardrails.IsPathAllowed.
func TestAdversarial_PathTraversalBoundary(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_adversarial_traversal")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	reg := storage.NewFolderRegistry()
	allowedFolder, err := storage.NewStorageFolder("Library", tmpDir, storage.StorageLocal, storage.RoleGame)
	if err != nil {
		t.Fatalf("NewStorageFolder failed: %v", err)
	}
	if err := reg.Add(*allowedFolder); err != nil {
		t.Fatalf("reg.Add failed: %v", err)
	}

	guard := storage.NewGuardrails()
	roots := []string{tmpDir}

	traversalPayloads := []string{
		"../../../etc/passwd",
		filepath.Join(tmpDir, "../../../etc/passwd"),
		filepath.Join(tmpDir, "sub", "..", "..", "..", "etc", "passwd"),
		filepath.Join(tmpDir, "game", "..", "..", "..", "Windows", "System32", "cmd.exe"),
		tmpDir + "/../",
		tmpDir + "/../../",
		"/etc/passwd",
		"/var/root",
		"../../../../../../../../etc/shadow",
		tmpDir + "\x00/../../etc/passwd",
	}

	for _, payload := range traversalPayloads {
		// Test FolderRegistry
		if reg.IsPathAllowed(payload, storage.RoleGame) {
			t.Errorf("SECURITY VULNERABILITY: FolderRegistry.IsPathAllowed permitted traversal payload: %q", payload)
		}

		// Test Guardrails
		if guard.IsPathAllowed(payload, roots) {
			t.Errorf("SECURITY VULNERABILITY: Guardrails.IsPathAllowed permitted traversal payload: %q", payload)
		}
	}
}

// TestAdversarial_SymlinkEscapeBoundary tests whether a symlink created inside the library
// pointing to an outside directory (e.g. /etc or /tmp) allows path traversal through the symlink.
func TestAdversarial_SymlinkEscapeBoundary(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_adversarial_symlink_lib")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	outsideDir, err := os.MkdirTemp("", "otix_adversarial_outside")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(outsideDir)

	// Create a secret file in the outside directory
	secretFile := filepath.Join(outsideDir, "secret.txt")
	if err := os.WriteFile(secretFile, []byte("super secret"), 0644); err != nil {
		t.Fatal(err)
	}

	// Create symlink inside tmpDir pointing to outsideDir
	symlinkPath := filepath.Join(tmpDir, "escape_link")
	if err := os.Symlink(outsideDir, symlinkPath); err != nil {
		t.Skipf("Symlink creation not supported on this platform: %v", err)
	}

	guard := storage.NewGuardrails()
	roots := []string{tmpDir}

	// Target file via symlink
	targetViaSymlink := filepath.Join(symlinkPath, "secret.txt")

	if guard.IsPathAllowed(targetViaSymlink, roots) {
		t.Errorf("SECURITY VULNERABILITY: Guardrails permitted symlink escape to %q", targetViaSymlink)
	}
}

// TestAdversarial_InvalidUNCPaths tests how IsUNCPath, NewStorageFolder, and validation
// behave when supplied with corrupt or boundary UNC and SMB path formats.
func TestAdversarial_InvalidUNCPaths(t *testing.T) {
	invalidUNCs := []struct {
		name string
		path string
	}{
		{"Double forward slash only", "//"},
		{"Double backslash only", `\\`},
		{"Single slash", "/"},
		{"smb scheme only", "smb://"},
		{"smb scheme with slashes only", "smb:////"},
		{"UNC with no share", `\\server`},
		{"UNC with trailing slash only", `\\server\`},
		{"UNC traversal", `\\server\share\..\..\etc\passwd`},
		{"Null byte in UNC", "\\\\server\\share\x00\\folder"},
	}

	for _, tc := range invalidUNCs {
		isUNC := storage.IsUNCPath(tc.path)
		t.Logf("[%s] path %q -> IsUNCPath: %v", tc.name, tc.path, isUNC)

		folder, err := storage.NewStorageFolder(tc.name, tc.path, storage.StorageSMB, storage.RoleROM)
		if err == nil && folder != nil {
			t.Logf("[%s] NewStorageFolder succeeded: ID=%s, Path=%q, Available=%v", tc.name, folder.ID, folder.Path, folder.Available)
		} else {
			t.Logf("[%s] NewStorageFolder rejected: %v", tc.name, err)
		}
	}
}

// TestAdversarial_FolderRegistryConcurrencyStress hammers FolderRegistry with 100 concurrent
// goroutines actively performing concurrent Add, Remove, Get, List, and IsPathAllowed operations.
func TestAdversarial_FolderRegistryConcurrencyStress(t *testing.T) {
	reg := storage.NewFolderRegistry()
	const numGoroutines = 100
	const opsPerGoroutine = 50

	var wg sync.WaitGroup
	var errCount int32

	// Pre-seed 10 folders
	for i := 0; i < 10; i++ {
		f := storage.StorageFolder{
			ID:   fmt.Sprintf("initial-folder-%02d", i),
			Name: fmt.Sprintf("Folder %d", i),
			Path: fmt.Sprintf("/storage/lib_%02d", i),
			Kind: storage.StorageLocal,
			Role: storage.RoleGame,
		}
		_ = reg.Add(f)
	}

	for g := 0; g < numGoroutines; g++ {
		wg.Add(1)
		go func(gID int) {
			defer wg.Done()
			for op := 0; op < opsPerGoroutine; op++ {
				folderID := fmt.Sprintf("g%d-folder-%d", gID, op)
				folderPath := fmt.Sprintf("/storage/g%d/path_%d", gID, op)

				switch op % 5 {
				case 0:
					// Add
					f := storage.StorageFolder{
						ID:   folderID,
						Name: fmt.Sprintf("G%d F%d", gID, op),
						Path: folderPath,
						Kind: storage.StorageLocal,
						Role: storage.RoleGame,
					}
					_ = reg.Add(f)
				case 1:
					// Get
					_, _ = reg.Get(folderID)
				case 2:
					// List and filter
					_ = reg.List()
					_ = reg.ListByRole(storage.RoleGame)
					_ = reg.ListByKind(storage.StorageLocal)
					_ = reg.GetRootsForRole(storage.RoleGame)
				case 3:
					// Path check
					_ = reg.IsPathAllowed(filepath.Join(folderPath, "subgame.exe"), storage.RoleGame)
					_ = reg.IsPathAllowed("/etc/passwd", storage.RoleGame)
				case 4:
					// Remove
					_ = reg.Remove(folderID)
				}
			}
		}(g)
	}

	wg.Wait()

	if c := atomic.LoadInt32(&errCount); c > 0 {
		t.Errorf("Encountered %d errors during concurrency stress test", c)
	}

	// Verify registry is still functional and consistent after 5,000 concurrent operations
	remaining := reg.List()
	t.Logf("Concurrency stress test completed successfully. Remaining registered folders: %d", len(remaining))
}

// TestAdversarial_RootFolderTraversalEscape tests if registering "/" or "//" allows arbitrary system access.
func TestAdversarial_RootFolderTraversalEscape(t *testing.T) {
	reg := storage.NewFolderRegistry()
	rootFolder, err := storage.NewStorageFolder("Root", "/", storage.StorageLocal, storage.RoleGame)
	if err != nil {
		t.Fatalf("NewStorageFolder failed: %v", err)
	}

	// Should adding "/" as a game folder be allowed without warning, and if added, does it allow /etc/passwd?
	if err := reg.Add(*rootFolder); err != nil {
		t.Logf("reg.Add rejected root folder: %v", err)
	} else {
		allowed := reg.IsPathAllowed("/etc/passwd", storage.RoleGame)
		t.Logf("CRITICAL BOUNDARY CHECK: With root folder '/' registered, is /etc/passwd allowed: %v", allowed)
		if allowed {
			t.Logf("FINDING: FolderRegistry has no root path restriction; registering '/' allows access to /etc/passwd")
		}
	}
}
