package storage

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

var collisionSuffixRegex = regexp.MustCompile(`^(.*) \((\d+)\)$`)

// Guardrails defines security, path containment, and data-integrity operations for file relocation.
type Guardrails interface {
	IsPathAllowed(targetPath string, allowedRoots []string) bool
	ValidateRelocation(sourcePath, targetPath string, stagingRoots, libraryRoots []string) error
	ResolveCollisionSafePath(targetPath string) (string, error)
	CopyAndVerify(sourceFile, targetFile string) error
}

var (
	globalCollisionMu   sync.Mutex
	globalReservedPaths = make(map[string]bool)
)

// ReleaseReservedPath releases a previously reserved collision-safe path.
func ReleaseReservedPath(targetPath string) {
	clean := filepath.Clean(strings.TrimSpace(targetPath))
	globalCollisionMu.Lock()
	delete(globalReservedPaths, clean)
	globalCollisionMu.Unlock()
}

// ResetReservedPaths clears all in-memory reservations (useful for test isolation).
func ResetReservedPaths() {
	globalCollisionMu.Lock()
	globalReservedPaths = make(map[string]bool)
	globalCollisionMu.Unlock()
}

// DefaultGuardrails provides the standard implementation of Guardrails.
type DefaultGuardrails struct {
	mu            sync.Mutex
	reservedPaths map[string]bool
}

// NewGuardrails creates a new DefaultGuardrails instance.
func NewGuardrails() Guardrails {
	return &DefaultGuardrails{
		reservedPaths: make(map[string]bool),
	}
}

// IsPathAllowed checks whether targetPath resides strictly within any of the allowed root directories.
// It enforces canonical path normalization, resolves existing symlinks, and rejects path traversal.
func (g *DefaultGuardrails) IsPathAllowed(targetPath string, allowedRoots []string) bool {
	return IsPathAllowed(targetPath, allowedRoots)
}

// ValidateRelocation ensures that the source path originates within designated staging roots
// and that the target path resolves within permitted library roots.
func (g *DefaultGuardrails) ValidateRelocation(sourcePath, targetPath string, stagingRoots, libraryRoots []string) error {
	return ValidateRelocation(sourcePath, targetPath, stagingRoots, libraryRoots)
}

// ResolveCollisionSafePath generates an incremental collision-safe path (e.g. "Game (1).iso", "Game (2)")
// if the target path already exists, preventing data loss or overwrites.
func (g *DefaultGuardrails) ResolveCollisionSafePath(targetPath string) (string, error) {
	return g.resolveCollisionSafePathInternal(targetPath)
}

// ReleaseReservedPath releases a reserved path from collision tracking.
func (g *DefaultGuardrails) ReleaseReservedPath(targetPath string) {
	ReleaseReservedPath(targetPath)
}

// CopyAndVerify copies a file or directory tree, synchronizes data to disk, and verifies exact byte length.
// On failure, it rolls back and cleans up any destination artifacts, leaving the source untouched.
func (g *DefaultGuardrails) CopyAndVerify(sourceFile, targetFile string) error {
	return CopyAndVerify(sourceFile, targetFile)
}

// IsPathAllowed checks whether targetPath resides strictly within any of the allowed root directories.
func IsPathAllowed(targetPath string, allowedRoots []string) bool {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" || len(allowedRoots) == 0 {
		return false
	}
	if strings.Contains(trimmed, "\x00") {
		return false
	}
	if trimmed == ".." || strings.HasSuffix(trimmed, "/..") || strings.HasSuffix(trimmed, "\\..") ||
		strings.Contains(trimmed, "/../") || strings.Contains(trimmed, "\\..\\") ||
		strings.HasPrefix(trimmed, "../") || strings.HasPrefix(trimmed, "..\\") {
		return false
	}

	cleanTarget := filepath.Clean(trimmed)
	absTarget, err := filepath.Abs(cleanTarget)
	if err != nil {
		absTarget = cleanTarget
	}

	evalTarget, err := resolveSymlinksExisting(absTarget)
	if err != nil {
		return false
	}

	for _, root := range allowedRoots {
		rootTrimmed := strings.TrimSpace(root)
		if rootTrimmed == "" {
			continue
		}

		cleanRoot := filepath.Clean(rootTrimmed)
		absRoot, err := filepath.Abs(cleanRoot)
		if err != nil {
			absRoot = cleanRoot
		}

		evalRoot, err := resolveSymlinksExisting(absRoot)
		if err != nil {
			evalRoot = absRoot
		}

		// Evaluated path containment check (canonical symlink resolution)
		if isContained(evalRoot, evalTarget) {
			return true
		}

		// Handle UNC network shares or slash representations
		if IsUNCPath(rootTrimmed) || IsUNCPath(trimmed) {
			if isSlashContained(rootTrimmed, trimmed) {
				return true
			}
		}
	}

	return false
}

func isSlashContained(root, target string) bool {
	r := strings.ReplaceAll(strings.TrimSpace(root), "\\", "/")
	t := strings.ReplaceAll(strings.TrimSpace(target), "\\", "/")

	r = strings.TrimPrefix(strings.TrimPrefix(r, "smb:"), "SMB:")
	t = strings.TrimPrefix(strings.TrimPrefix(t, "smb:"), "SMB:")

	r = path.Clean(r)
	t = path.Clean(t)

	if r == t {
		return true
	}

	prefix := r
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}

	if !strings.HasPrefix(t, prefix) {
		return false
	}

	remainder := strings.TrimPrefix(t, prefix)
	parts := strings.Split(remainder, "/")
	for _, p := range parts {
		if p == ".." {
			return false
		}
	}
	return true
}

// ValidateRelocation ensures source is within stagingRoots and target is within libraryRoots.
func ValidateRelocation(sourcePath, targetPath string, stagingRoots, libraryRoots []string) error {
	cleanSrc := filepath.Clean(strings.TrimSpace(sourcePath))
	cleanDst := filepath.Clean(strings.TrimSpace(targetPath))

	if cleanSrc == "" || cleanSrc == "." {
		return fmt.Errorf("%w: source path cannot be empty", ErrPathOutOfBounds)
	}
	if cleanDst == "" || cleanDst == "." {
		return fmt.Errorf("%w: target path cannot be empty", ErrPathOutOfBounds)
	}
	if len(stagingRoots) == 0 {
		return fmt.Errorf("%w: no staging roots configured", ErrPathOutOfBounds)
	}
	if len(libraryRoots) == 0 {
		return fmt.Errorf("%w: no library roots configured", ErrPathOutOfBounds)
	}

	if cleanSrc == cleanDst {
		return fmt.Errorf("%w: source and target paths are identical (%s)", ErrCollisionDetected, cleanSrc)
	}

	if !IsPathAllowed(cleanSrc, stagingRoots) {
		return fmt.Errorf("%w: source path %q is outside permitted staging boundaries", ErrPathOutOfBounds, cleanSrc)
	}

	if !IsPathAllowed(cleanDst, libraryRoots) {
		return fmt.Errorf("%w: target path %q is outside permitted library boundaries", ErrPathOutOfBounds, cleanDst)
	}

	// Guard against nesting target inside source
	rel, err := filepath.Rel(cleanSrc, cleanDst)
	if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("target path %q is nested inside source path %q", cleanDst, cleanSrc)
	}

	return nil
}

var defaultGuardrailsInstance = NewGuardrails()

func (g *DefaultGuardrails) resolveCollisionSafePathInternal(targetPath string) (string, error) {
	cleanPath := filepath.Clean(strings.TrimSpace(targetPath))
	if cleanPath == "" || cleanPath == "." {
		return "", errors.New("target path is empty")
	}

	globalCollisionMu.Lock()
	defer globalCollisionMu.Unlock()

	if !globalReservedPaths[cleanPath] {
		_, err := os.Lstat(cleanPath)
		if os.IsNotExist(err) {
			globalReservedPaths[cleanPath] = true
			return cleanPath, nil
		}
	}

	dir := filepath.Dir(cleanPath)
	base := filepath.Base(cleanPath)

	var name, ext string
	fi, err := os.Lstat(cleanPath)
	if err == nil && fi.IsDir() {
		name = base
		ext = ""
	} else {
		ext = filepath.Ext(base)
		name = strings.TrimSuffix(base, ext)
	}

	basePrefix := name
	startNum := 1

	if matches := collisionSuffixRegex.FindStringSubmatch(name); len(matches) == 3 {
		basePrefix = matches[1]
		if num, parseErr := strconv.Atoi(matches[2]); parseErr == nil {
			startNum = num + 1
		}
	}

	for i := startNum; i <= 9999; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s (%d)%s", basePrefix, i, ext))
		if !globalReservedPaths[candidate] {
			if _, err := os.Lstat(candidate); os.IsNotExist(err) {
				globalReservedPaths[candidate] = true
				return candidate, nil
			}
		}
	}

	return "", fmt.Errorf("%w: unable to find non-colliding path after 9999 attempts for %s", ErrCollisionDetected, cleanPath)
}

// ResolveCollisionSafePath generates an incremental collision-safe path without data loss.
func ResolveCollisionSafePath(targetPath string) (string, error) {
	return defaultGuardrailsInstance.ResolveCollisionSafePath(targetPath)
}

// CopyAndVerify copies a file or directory tree and validates byte length and filesystem sync.
func CopyAndVerify(sourceFile, targetFile string) error {
	cleanSrc := filepath.Clean(strings.TrimSpace(sourceFile))
	cleanDst := filepath.Clean(strings.TrimSpace(targetFile))

	srcInfo, err := os.Stat(cleanSrc)
	if err != nil {
		return fmt.Errorf("stat source failed: %w", err)
	}

	if srcInfo.IsDir() {
		return copyDirAndVerify(cleanSrc, cleanDst)
	}

	return copySingleFileAndVerify(cleanSrc, cleanDst, srcInfo.Mode(), srcInfo.Size())
}

func copySingleFileAndVerify(src, dst string, mode os.FileMode, expectedSize int64) error {
	in, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("open source file failed: %w", err)
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return fmt.Errorf("create destination directory failed: %w", err)
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("create destination file failed: %w", err)
	}

	copied, copyErr := io.Copy(out, in)
	if copyErr != nil {
		out.Close()
		_ = os.Remove(dst)
		return fmt.Errorf("stream copy failed: %w", copyErr)
	}

	if syncErr := out.Sync(); syncErr != nil {
		out.Close()
		_ = os.Remove(dst)
		return fmt.Errorf("sync destination file failed: %w", syncErr)
	}

	if closeErr := out.Close(); closeErr != nil {
		_ = os.Remove(dst)
		return fmt.Errorf("close destination file failed: %w", closeErr)
	}

	if copied != expectedSize {
		_ = os.Remove(dst)
		return fmt.Errorf("%w: copied %d bytes, expected %d", ErrIntegrityCheckFail, copied, expectedSize)
	}

	dstInfo, statErr := os.Stat(dst)
	if statErr != nil {
		_ = os.Remove(dst)
		return fmt.Errorf("stat destination file failed: %w", statErr)
	}

	if dstInfo.Size() != expectedSize {
		_ = os.Remove(dst)
		return fmt.Errorf("%w: destination size on disk %d does not match expected %d", ErrIntegrityCheckFail, dstInfo.Size(), expectedSize)
	}

	return nil
}

func copyDirAndVerify(src, dst string) error {
	err := filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		return copySingleFileAndVerify(path, target, info.Mode(), info.Size())
	})
	if err != nil {
		_ = os.RemoveAll(dst)
		return err
	}
	return nil
}

func isContained(root, target string) bool {
	cleanRoot := filepath.Clean(root)
	cleanTarget := filepath.Clean(target)

	rel, err := filepath.Rel(cleanRoot, cleanTarget)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return false
	}
	parts := strings.Split(rel, string(filepath.Separator))
	for _, part := range parts {
		if part == ".." {
			return false
		}
	}
	return true
}

const maxSymlinkHops = 64

func resolveSymlinksExisting(p string) (string, error) {
	return resolveSymlinksExistingVisited(p, make(map[string]bool), 0)
}

func resolveSymlinksExistingVisited(p string, visited map[string]bool, depth int) (string, error) {
	if depth > maxSymlinkHops {
		return "", errors.New("too many levels of symbolic links")
	}

	clean := filepath.Clean(p)
	abs, err := filepath.Abs(clean)
	if err != nil {
		abs = clean
	}

	if visited[abs] {
		return "", errors.New("symlink cycle detected")
	}
	visited[abs] = true

	// Check if abs itself is a symlink (even if dangling)
	if fi, err := os.Lstat(abs); err == nil && fi.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(abs)
		if err != nil {
			return "", err
		}
		if !filepath.IsAbs(target) {
			target = filepath.Join(filepath.Dir(abs), target)
		}
		return resolveSymlinksExistingVisited(target, visited, depth+1)
	}

	if eval, err := filepath.EvalSymlinks(abs); err == nil {
		return filepath.Clean(eval), nil
	} else if !os.IsNotExist(err) {
		// An existing component has a symlink cycle or invalid symlink
		return "", err
	}

	curr := abs
	var parts []string
	for {
		parent := filepath.Dir(curr)
		if parent == curr {
			break
		}
		parts = append([]string{filepath.Base(curr)}, parts...)
		curr = parent

		if fi, err := os.Lstat(curr); err == nil {
			if fi.Mode()&os.ModeSymlink != 0 {
				target, err := os.Readlink(curr)
				if err != nil {
					return "", err
				}
				if !filepath.IsAbs(target) {
					target = filepath.Join(filepath.Dir(curr), target)
				}
				evalParent, err := resolveSymlinksExistingVisited(target, visited, depth+1)
				if err != nil {
					return "", err
				}
				curr = evalParent
				break
			}

			eval, err := filepath.EvalSymlinks(curr)
			if err != nil {
				return "", err
			}
			curr = filepath.Clean(eval)
			break
		}
	}

	for _, part := range parts {
		curr = filepath.Join(curr, part)
	}
	return filepath.Clean(curr), nil
}
