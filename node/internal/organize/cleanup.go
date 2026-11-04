package organize

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// isProtectedVolumeOrRoot returns true if the path is a root drive, volume, or system mount point.
func isProtectedVolumeOrRoot(p string) bool {
	clean := filepath.Clean(p)
	vol := filepath.VolumeName(clean)
	if clean == vol || clean == "/" || clean == "\\" || clean == "." {
		return true
	}
	parts := strings.Split(filepath.ToSlash(clean), "/")
	if len(parts) <= 3 && len(parts) >= 2 && (parts[1] == "Volumes" || parts[1] == "mnt" || parts[1] == "media") {
		return true
	}
	return false
}

// cleanEmptyDirsUp removes empty directories upward up to maxLevels, never pruning protected roots or non-empty dirs.
func cleanEmptyDirsUp(dir string, maxLevels int) {
	curr := ResolveUNCPath(filepath.Clean(dir))
	for i := 0; i < maxLevels; i++ {
		if isProtectedVolumeOrRoot(curr) {
			break
		}
		entries, err := os.ReadDir(curr)
		if err != nil || len(entries) > 0 {
			// Directory contains files or is unreadable; NEVER prune.
			break
		}
		_ = os.Remove(curr)
		parent := filepath.Dir(curr)
		if parent == curr || isProtectedVolumeOrRoot(parent) {
			break
		}
		curr = parent
	}
}

// healRepackDir restores canonical filenames in multi-bin repack directories (e.g. elamigos-1.bin).
func healRepackDir(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	folderLower := strings.ToLower(filepath.Base(dir))
	isElAmigos := strings.Contains(folderLower, "elamigos")

	for _, e := range entries {
		if e.IsDir() {
			continue
		}

		name := e.Name()
		nameLower := strings.ToLower(name)
		var canonical string

		if strings.Contains(nameLower, " (1).bin") {
			canonical = strings.ReplaceAll(name, " (1).bin", ".bin")
		} else if isElAmigos && (strings.HasSuffix(nameLower, ".bin") || strings.Contains(nameLower, ".bin")) && !strings.HasPrefix(nameLower, "elamigos-") && !strings.HasPrefix(nameLower, "elamigos.") {
			chunk := "1"
			for i := 1; i <= 99; i++ {
				if strings.Contains(nameLower, fmt.Sprintf("%d", i)) {
					chunk = fmt.Sprintf("%d", i)
					break
				}
			}
			canonical = fmt.Sprintf("elamigos-%s.bin", chunk)
		}

		if canonical != "" && canonical != name {
			srcFile := filepath.Join(dir, name)
			dstFile := filepath.Join(dir, canonical)
			if _, existsErr := os.Stat(dstFile); os.IsNotExist(existsErr) {
				_ = os.Rename(srcFile, dstFile)
			}
		}
	}
}
