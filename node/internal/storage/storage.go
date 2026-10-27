package storage

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
)

var (
	ErrPathOutOfBounds       = errors.New("path is outside permitted library or staging boundaries")
	ErrCollisionDetected     = errors.New("target path collision detected")
	ErrIntegrityCheckFail    = errors.New("cross-drive copy failed size or checksum verification")
	ErrInvalidStorageFolder  = errors.New("invalid storage folder definition")
	ErrFolderNotFound        = errors.New("storage folder not found")
	ErrFolderExists          = errors.New("storage folder already exists")
)

type StorageKind string

const (
	StorageLocal StorageKind = "local"
	StorageSMB   StorageKind = "smb"
)

const (
	RoleGame    = "game"
	RoleISO     = "iso"
	RoleROM     = "rom"
	RoleStaging = "staging"
)

var validRoles = map[string]bool{
	RoleGame:    true,
	RoleISO:     true,
	RoleROM:     true,
	RoleStaging: true,
}

// StorageFolder represents a designated local directory or network storage source.
type StorageFolder struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Path      string      `json:"path"`
	Kind      StorageKind `json:"kind"`
	Role      string      `json:"role"` // "game", "iso", "rom", "staging"
	IsNetwork bool        `json:"is_network"`
	Available bool        `json:"available"`
}

// IsUNCPath checks if a path string matches Samba/SMB network path conventions.
func IsUNCPath(path string) bool {
	clean := strings.TrimSpace(path)
	if strings.HasPrefix(clean, `\\`) || strings.HasPrefix(clean, `//`) {
		return true
	}
	lower := strings.ToLower(clean)
	return strings.HasPrefix(lower, "smb://")
}

// NormalizeStoragePath returns a clean, uniform path representation.
func NormalizeStoragePath(path string) string {
	clean := strings.TrimSpace(path)
	if IsUNCPath(clean) {
		return filepath.ToSlash(clean)
	}
	return filepath.Clean(clean)
}

// Validate ensures all required properties of a StorageFolder are populated and valid.
func (sf *StorageFolder) Validate() error {
	if sf == nil {
		return fmt.Errorf("%w: folder is nil", ErrInvalidStorageFolder)
	}
	if strings.TrimSpace(sf.ID) == "" {
		return fmt.Errorf("%w: ID cannot be empty", ErrInvalidStorageFolder)
	}
	if strings.TrimSpace(sf.Name) == "" {
		return fmt.Errorf("%w: Name cannot be empty", ErrInvalidStorageFolder)
	}
	if strings.TrimSpace(sf.Path) == "" {
		return fmt.Errorf("%w: Path cannot be empty", ErrInvalidStorageFolder)
	}
	if sf.Kind != StorageLocal && sf.Kind != StorageSMB {
		return fmt.Errorf("%w: unsupported storage kind %q", ErrInvalidStorageFolder, sf.Kind)
	}
	if !validRoles[sf.Role] {
		return fmt.Errorf("%w: unsupported storage role %q", ErrInvalidStorageFolder, sf.Role)
	}
	return nil
}

// CheckAvailability verifies whether the folder is reachable on the filesystem.
func (sf *StorageFolder) CheckAvailability() bool {
	if sf == nil || sf.Path == "" {
		return false
	}
	// For local folders, inspect filesystem state
	if !sf.IsNetwork && !IsUNCPath(sf.Path) {
		info, err := os.Stat(sf.Path)
		sf.Available = (err == nil && info.IsDir())
		return sf.Available
	}

	// For network / SMB folders, test basic stat if mounted, or assume available if valid UNC
	if info, err := os.Stat(sf.Path); err == nil && info.IsDir() {
		sf.Available = true
	} else if IsUNCPath(sf.Path) {
		// UNC share path registered
		sf.Available = true
	} else {
		sf.Available = false
	}
	return sf.Available
}

// IsSMB returns true if the folder represents a Samba / SMB network location.
func (sf *StorageFolder) IsSMB() bool {
	if sf == nil {
		return false
	}
	return sf.Kind == StorageSMB || sf.IsNetwork || IsUNCPath(sf.Path)
}

// IsLocal returns true if the folder is on local direct-attached storage.
func (sf *StorageFolder) IsLocal() bool {
	return !sf.IsSMB()
}

// NewStorageFolder creates and validates a new StorageFolder instance.
func NewStorageFolder(name, path string, kind StorageKind, role string) (*StorageFolder, error) {
	normPath := NormalizeStoragePath(path)
	isNetwork := (kind == StorageSMB) || IsUNCPath(normPath)

	sf := &StorageFolder{
		ID:        uuid.New().String(),
		Name:      strings.TrimSpace(name),
		Path:      normPath,
		Kind:      kind,
		Role:      role,
		IsNetwork: isNetwork,
	}

	if err := sf.Validate(); err != nil {
		return nil, err
	}

	sf.CheckAvailability()
	return sf, nil
}

// FolderRegistry manages configured library and staging storage locations thread-safely.
type FolderRegistry struct {
	mu      sync.RWMutex
	folders map[string]StorageFolder
}

// NewFolderRegistry creates an empty thread-safe folder registry.
func NewFolderRegistry() *FolderRegistry {
	return &FolderRegistry{
		folders: make(map[string]StorageFolder),
	}
}

// Add registers a new storage folder. Fails if ID already exists or path is duplicate for role.
func (r *FolderRegistry) Add(folder StorageFolder) error {
	if err := folder.Validate(); err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.folders[folder.ID]; exists {
		return fmt.Errorf("%w: folder ID %s", ErrFolderExists, folder.ID)
	}

	cleanPath := NormalizeStoragePath(folder.Path)
	for _, existing := range r.folders {
		if NormalizeStoragePath(existing.Path) == cleanPath && existing.Role == folder.Role {
			return fmt.Errorf("%w: path %s already registered for role %s", ErrFolderExists, cleanPath, folder.Role)
		}
	}

	folder.CheckAvailability()
	r.folders[folder.ID] = folder
	return nil
}

// Get retrieves a storage folder by ID.
func (r *FolderRegistry) Get(id string) (*StorageFolder, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	folder, exists := r.folders[id]
	if !exists {
		return nil, ErrFolderNotFound
	}
	return &folder, nil
}

// Remove deletes a registered folder by ID.
func (r *FolderRegistry) Remove(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.folders[id]; !exists {
		return ErrFolderNotFound
	}
	delete(r.folders, id)
	return nil
}

// List returns a slice of all registered storage folders.
func (r *FolderRegistry) List() []StorageFolder {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]StorageFolder, 0, len(r.folders))
	for _, f := range r.folders {
		result = append(result, f)
	}
	return result
}

// ListByRole returns storage folders matching the specified role (e.g. "game", "rom", "staging").
func (r *FolderRegistry) ListByRole(role string) []StorageFolder {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []StorageFolder
	for _, f := range r.folders {
		if f.Role == role {
			result = append(result, f)
		}
	}
	return result
}

// ListByKind returns storage folders matching the specified storage kind (local or smb).
func (r *FolderRegistry) ListByKind(kind StorageKind) []StorageFolder {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []StorageFolder
	for _, f := range r.folders {
		if f.Kind == kind {
			result = append(result, f)
		}
	}
	return result
}

// GetRootsForRole returns absolute/normalized root paths registered under the given role.
func (r *FolderRegistry) GetRootsForRole(role string) []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var roots []string
	for _, f := range r.folders {
		if f.Role == role {
			roots = append(roots, f.Path)
		}
	}
	return roots
}

// IsPathAllowed checks whether targetPath falls within any registered storage folder for given roles.
func (r *FolderRegistry) IsPathAllowed(targetPath string, allowedRoles ...string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	roleSet := make(map[string]bool, len(allowedRoles))
	for _, role := range allowedRoles {
		roleSet[role] = true
	}

	cleanTarget := filepath.Clean(targetPath)

	for _, f := range r.folders {
		if len(roleSet) > 0 && !roleSet[f.Role] {
			continue
		}

		cleanRoot := filepath.Clean(f.Path)
		rel, err := filepath.Rel(cleanRoot, cleanTarget)
		if err != nil {
			continue
		}

		if !strings.HasPrefix(rel, "..") && !strings.HasPrefix(rel, "/..") {
			return true
		}
	}

	return false
}
