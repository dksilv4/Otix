package storage_test

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/dksilv4/otix/node/internal/storage"
)

func TestNewStorageFolder_Local(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_storage_local_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	folder, err := storage.NewStorageFolder("PC Games", tmpDir, storage.StorageLocal, storage.RoleGame)
	if err != nil {
		t.Fatalf("NewStorageFolder failed: %v", err)
	}

	if folder.ID == "" {
		t.Errorf("expected generated UUID ID")
	}
	if folder.Name != "PC Games" {
		t.Errorf("expected Name 'PC Games', got %q", folder.Name)
	}
	if folder.Kind != storage.StorageLocal {
		t.Errorf("expected kind local, got %q", folder.Kind)
	}
	if folder.Role != storage.RoleGame {
		t.Errorf("expected role game, got %q", folder.Role)
	}
	if folder.IsNetwork {
		t.Errorf("expected IsNetwork false for local folder")
	}
	if !folder.IsLocal() {
		t.Errorf("expected IsLocal() true")
	}
	if folder.IsSMB() {
		t.Errorf("expected IsSMB() false")
	}
	if !folder.Available {
		t.Errorf("expected folder to be available since temp dir exists")
	}
}

func TestNewStorageFolder_SMB(t *testing.T) {
	uncPath := `\\nas-server\share\roms`
	folder, err := storage.NewStorageFolder("Network ROMs", uncPath, storage.StorageSMB, storage.RoleROM)
	if err != nil {
		t.Fatalf("NewStorageFolder failed: %v", err)
	}

	if folder.Kind != storage.StorageSMB {
		t.Errorf("expected kind smb, got %q", folder.Kind)
	}
	if folder.Role != storage.RoleROM {
		t.Errorf("expected role rom, got %q", folder.Role)
	}
	if !folder.IsNetwork {
		t.Errorf("expected IsNetwork true for SMB share")
	}
	if !folder.IsSMB() {
		t.Errorf("expected IsSMB() true")
	}
	if folder.IsLocal() {
		t.Errorf("expected IsLocal() false")
	}
}

func TestStorageFolder_Validation(t *testing.T) {
	tests := []struct {
		name      string
		folder    storage.StorageFolder
		wantError bool
	}{
		{
			name: "Valid local folder",
			folder: storage.StorageFolder{
				ID:   "id-1",
				Name: "Staging",
				Path: "/downloads",
				Kind: storage.StorageLocal,
				Role: storage.RoleStaging,
			},
			wantError: false,
		},
		{
			name: "Empty ID",
			folder: storage.StorageFolder{
				Name: "Staging",
				Path: "/downloads",
				Kind: storage.StorageLocal,
				Role: storage.RoleStaging,
			},
			wantError: true,
		},
		{
			name: "Empty Name",
			folder: storage.StorageFolder{
				ID:   "id-1",
				Path: "/downloads",
				Kind: storage.StorageLocal,
				Role: storage.RoleStaging,
			},
			wantError: true,
		},
		{
			name: "Empty Path",
			folder: storage.StorageFolder{
				ID:   "id-1",
				Name: "Staging",
				Kind: storage.StorageLocal,
				Role: storage.RoleStaging,
			},
			wantError: true,
		},
		{
			name: "Unsupported Kind",
			folder: storage.StorageFolder{
				ID:   "id-1",
				Name: "Staging",
				Path: "/downloads",
				Kind: "ftp",
				Role: storage.RoleStaging,
			},
			wantError: true,
		},
		{
			name: "Unsupported Role",
			folder: storage.StorageFolder{
				ID:   "id-1",
				Name: "Music",
				Path: "/music",
				Kind: storage.StorageLocal,
				Role: "music",
			},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.folder.Validate()
			if (err != nil) != tt.wantError {
				t.Errorf("Validate() error = %v, wantError = %v", err, tt.wantError)
			}
		})
	}
}

func TestIsUNCPath(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		{`\\server\share\games`, true},
		{`//server/share/games`, true},
		{`smb://server/share/games`, true},
		{`SMB://server/share/games`, true},
		{`/Volumes/Storage/Games`, false},
		{`C:\Games\Otix`, false},
		{`./relative/path`, false},
	}

	for _, tt := range tests {
		if got := storage.IsUNCPath(tt.path); got != tt.expected {
			t.Errorf("IsUNCPath(%q) = %v, want %v", tt.path, got, tt.expected)
		}
	}
}

func TestStorageFolder_Availability(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_storage_avail_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	existingFolder := storage.StorageFolder{
		ID:   "exist-1",
		Name: "Existing",
		Path: tmpDir,
		Kind: storage.StorageLocal,
		Role: storage.RoleGame,
	}
	if !existingFolder.CheckAvailability() {
		t.Errorf("expected existing directory to be available")
	}

	nonExistingFolder := storage.StorageFolder{
		ID:   "nonexist-1",
		Name: "Missing",
		Path: filepath.Join(tmpDir, "does_not_exist"),
		Kind: storage.StorageLocal,
		Role: storage.RoleGame,
	}
	if nonExistingFolder.CheckAvailability() {
		t.Errorf("expected non-existing path to not be available")
	}
}

func TestFolderRegistry(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix_registry_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	stagingDir := filepath.Join(tmpDir, "staging")
	gamesDir := filepath.Join(tmpDir, "games")
	romsDir := filepath.Join(tmpDir, "roms")
	_ = os.MkdirAll(stagingDir, 0755)
	_ = os.MkdirAll(gamesDir, 0755)
	_ = os.MkdirAll(romsDir, 0755)

	reg := storage.NewFolderRegistry()

	f1 := storage.StorageFolder{
		ID:   "f-games",
		Name: "Local Games",
		Path: gamesDir,
		Kind: storage.StorageLocal,
		Role: storage.RoleGame,
	}
	f2 := storage.StorageFolder{
		ID:        "f-roms",
		Name:      "Network ROMs",
		Path:      `\\nas\roms`,
		Kind:      storage.StorageSMB,
		Role:      storage.RoleROM,
		IsNetwork: true,
	}
	f3 := storage.StorageFolder{
		ID:   "f-staging",
		Name: "Downloads Staging",
		Path: stagingDir,
		Kind: storage.StorageLocal,
		Role: storage.RoleStaging,
	}

	// Add folders
	if err := reg.Add(f1); err != nil {
		t.Fatalf("Add(f1) failed: %v", err)
	}
	if err := reg.Add(f2); err != nil {
		t.Fatalf("Add(f2) failed: %v", err)
	}
	if err := reg.Add(f3); err != nil {
		t.Fatalf("Add(f3) failed: %v", err)
	}

	// Reject duplicate ID
	if err := reg.Add(f1); err == nil {
		t.Errorf("expected error adding duplicate ID")
	}

	// List
	all := reg.List()
	if len(all) != 3 {
		t.Errorf("expected 3 folders, got %d", len(all))
	}

	// Get
	got, err := reg.Get("f-games")
	if err != nil || got.Name != "Local Games" {
		t.Errorf("Get(f-games) failed: %v, got %+v", err, got)
	}

	// Get non-existent
	if _, err := reg.Get("missing"); err != storage.ErrFolderNotFound {
		t.Errorf("expected ErrFolderNotFound, got %v", err)
	}

	// ListByRole
	romFolders := reg.ListByRole(storage.RoleROM)
	if len(romFolders) != 1 || romFolders[0].ID != "f-roms" {
		t.Errorf("expected 1 ROM folder, got %+v", romFolders)
	}

	// ListByKind
	smbFolders := reg.ListByKind(storage.StorageSMB)
	if len(smbFolders) != 1 || smbFolders[0].ID != "f-roms" {
		t.Errorf("expected 1 SMB folder, got %+v", smbFolders)
	}

	// GetRootsForRole
	gameRoots := reg.GetRootsForRole(storage.RoleGame)
	if len(gameRoots) != 1 || gameRoots[0] != gamesDir {
		t.Errorf("expected gamesDir in roots, got %+v", gameRoots)
	}

	// IsPathAllowed
	insideGame := filepath.Join(gamesDir, "Witcher 3", "game.exe")
	if !reg.IsPathAllowed(insideGame, storage.RoleGame) {
		t.Errorf("expected path inside game folder to be allowed")
	}
	if reg.IsPathAllowed(insideGame, storage.RoleStaging) {
		t.Errorf("path inside games should not be allowed for staging role")
	}
	if reg.IsPathAllowed("/etc/passwd", storage.RoleGame) {
		t.Errorf("/etc/passwd must not be allowed")
	}

	// Remove
	if err := reg.Remove("f-games"); err != nil {
		t.Fatalf("Remove(f-games) failed: %v", err)
	}
	if len(reg.List()) != 2 {
		t.Errorf("expected 2 folders remaining, got %d", len(reg.List()))
	}
}

func TestFolderRegistry_Concurrency(t *testing.T) {
	reg := storage.NewFolderRegistry()
	var wg sync.WaitGroup

	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			folder := storage.StorageFolder{
				ID:   filepath.Join("id", string(rune('A'+id))),
				Name: "Folder",
				Path: filepath.Join("/storage", string(rune('A'+id))),
				Kind: storage.StorageLocal,
				Role: storage.RoleGame,
			}
			_ = reg.Add(folder)
			_ = reg.List()
			_ = reg.ListByRole(storage.RoleGame)
			_, _ = reg.Get(folder.ID)
		}(i)
	}

	wg.Wait()
}
