package organize

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sync"

	"github.com/dksilv4/otix/node/internal/otixmeta"
)

var (
	moveMu    sync.Mutex
	moveLocks = make(map[string]*pathLock)
)

type pathLock struct {
	mu       sync.Mutex
	refCount int
}

func acquireMoveLock(p string) func() {
	moveMu.Lock()
	pl, exists := moveLocks[p]
	if !exists {
		pl = &pathLock{}
		moveLocks[p] = pl
	}
	pl.refCount++
	moveMu.Unlock()

	pl.mu.Lock()

	return func() {
		pl.mu.Unlock()
		moveMu.Lock()
		pl.refCount--
		if pl.refCount == 0 {
			delete(moveLocks, p)
		}
		moveMu.Unlock()
	}
}

func MovePath(src, dst string) error {
	return moveAtomic(src, dst)
}

func moveAtomic(src, dst string) error {
	cleanSrc := filepath.Clean(src)
	cleanDst := filepath.Clean(dst)

	if cleanSrc == "" || cleanSrc == "." {
		return fmt.Errorf("source path is empty")
	}
	if cleanDst == "" || cleanDst == "." {
		return fmt.Errorf("destination path is empty")
	}
	if cleanSrc == cleanDst {
		return fmt.Errorf("source and destination are identical: %s", cleanSrc)
	}

	srcFi, err := os.Lstat(cleanSrc)
	if err != nil {
		return fmt.Errorf("source stat failed: %w", err)
	}

	unlock := acquireMoveLock(cleanDst)
	defer unlock()

	if dstFi, err := os.Lstat(cleanDst); err == nil {
		if dstFi.IsDir() {
			if entries, _ := os.ReadDir(cleanDst); len(entries) > 0 {
				return fmt.Errorf("destination path %q already exists and is not empty: %w", cleanDst, os.ErrExist)
			}
		}
		return fmt.Errorf("destination path %q already exists: %w", cleanDst, os.ErrExist)
	}

	if err := os.MkdirAll(filepath.Dir(cleanDst), 0755); err != nil {
		return fmt.Errorf("create destination directory failed: %w", err)
	}

	if err := os.Rename(cleanSrc, cleanDst); err == nil {
		return nil
	}

	if srcFi.IsDir() {
		if err := copyDir(cleanSrc, cleanDst); err != nil {
			_ = os.RemoveAll(cleanDst)
			return fmt.Errorf("cross-device directory copy failed: %w", err)
		}
		if err := os.RemoveAll(cleanSrc); err != nil {
			return fmt.Errorf("cleanup source directory failed: %w", err)
		}
		return nil
	}

	if err := copyFileAndVerify(cleanSrc, cleanDst, srcFi.Mode()); err != nil {
		return fmt.Errorf("cross-device file copy failed: %w", err)
	}

	if err := os.Remove(cleanSrc); err != nil {
		return fmt.Errorf("cleanup source file failed: %w", err)
	}
	return nil
}

// CopyFileAndVerify copies src to dst, calls Sync, and verifies exact byte size match.
func CopyFileAndVerify(src, dst string, mode fs.FileMode) error {
	return copyFileAndVerify(src, dst, mode)
}

func copyFileAndVerify(src, dst string, mode fs.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("open source file failed: %w", err)
	}
	defer in.Close()

	srcInfo, err := in.Stat()
	if err != nil {
		return fmt.Errorf("stat source file failed: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return fmt.Errorf("create destination directory failed: %w", err)
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("create destination file failed: %w", err)
	}

	copied, copyErr := io.Copy(out, in)
	if copyErr != nil {
		_ = out.Close()
		_ = os.Remove(dst)
		return fmt.Errorf("stream copy failed: %w", copyErr)
	}

	if syncErr := out.Sync(); syncErr != nil {
		_ = out.Close()
		_ = os.Remove(dst)
		return fmt.Errorf("sync destination file failed: %w", syncErr)
	}

	if closeErr := out.Close(); closeErr != nil {
		_ = os.Remove(dst)
		return fmt.Errorf("close destination file failed: %w", closeErr)
	}

	if copied != srcInfo.Size() {
		_ = os.Remove(dst)
		return fmt.Errorf("size verification failed: copied %d bytes, expected %d", copied, srcInfo.Size())
	}

	dstInfo, statErr := os.Stat(dst)
	if statErr != nil {
		_ = os.Remove(dst)
		return fmt.Errorf("stat destination file failed: %w", statErr)
	}

	if dstInfo.Size() != srcInfo.Size() {
		_ = os.Remove(dst)
		return fmt.Errorf("destination file size on disk mismatch: got %d, expected %d", dstInfo.Size(), srcInfo.Size())
	}
	return nil
}

func copyFile(src, dst string, mode fs.FileMode) error {
	return copyFileAndVerify(src, dst, mode)
}

func copyDir(src, dst string) error {
	err := filepath.Walk(src, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := safeRel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		return copyFileAndVerify(path, target, info.Mode())
	})
	if err != nil {
		_ = os.RemoveAll(dst)
		return err
	}
	return nil
}

func syncPS5Sidecar(targetDir string) {
	candidatePaths := []string{
		filepath.Join(targetDir, "sce_sys", "param.json"),
	}
	if entries, err := os.ReadDir(targetDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				candidatePaths = append(candidatePaths, filepath.Join(targetDir, e.Name(), "sce_sys", "param.json"))
			}
		}
	}
	for _, p := range candidatePaths {
		if _, err := os.Stat(p); err == nil {
			tId, tName := parsePS5ParamJSON(p)
			if tId != "" {
				sc, _ := otixmeta.Read(targetDir)
				if sc == nil {
					sc = &otixmeta.Sidecar{
						Version:   1,
						TitleID:   tId,
						Title:     tName,
						Platforms: []map[string]any{{"name": "PlayStation 5", "slug": "playstation-5"}},
					}
				} else {
					sc.TitleID = tId
					if sc.Title == "" && tName != "" {
						sc.Title = tName
					}
				}
				_ = otixmeta.Write(targetDir, sc)
				break
			}
		}
	}
}

func syncSidecarMetadata(src, dst string) {
	origName := filepath.Base(src)
	rel := ParseReleaseName(origName)
	sc, _ := otixmeta.Read(dst)
	if sc == nil {
		sc = &otixmeta.Sidecar{
			Version: 1,
		}
	}
	updated := false
	if sc.OriginalName == "" && origName != filepath.Base(dst) {
		sc.OriginalName = origName
		updated = true
	}
	if sc.ReleaseGroup == "" && rel.ReleaseGroup != "" {
		sc.ReleaseGroup = rel.ReleaseGroup
		updated = true
	}
	if sc.GameVersion == "" && rel.Version != "" {
		sc.GameVersion = rel.Version
		updated = true
	}
	if sc.Edition == "" && rel.Edition != "" {
		sc.Edition = rel.Edition
		updated = true
	}
	if sc.Title == "" && rel.Title != "" {
		sc.Title = rel.Title
		updated = true
	}
	if updated {
		_ = otixmeta.Write(dst, sc)
	}
}
