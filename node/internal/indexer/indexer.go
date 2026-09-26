package indexer

import (
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
)

var SkipExtensions = map[string]bool{
	".bin": true,
}

var GenericInstallerStems = map[string]bool{
	"setup": true, "install": true, "installer": true, "autorun": true,
	"start": true, "play": true, "unins000": true, "uninstall": true,
}

var GenericFolderNames = map[string]bool{
	"setup": true, "install": true, "installer": true, "autorun": true,
	"start": true, "play": true, "unins000": true, "uninstall": true,
	"bin": true, "crack": true, "cracks": true, "redist": true, "commonredist": true,
	"directx": true, "vcredist": true, "windows": true, "win": true, "files": true,
	"data": true, "game": true, "games": true, "disk1": true, "disc1": true, "cd1": true,
	"dvd": true, "iso": true, "unpacked": true, "extracted": true, "temp": true, "tmp": true,
	"update": true, "updates": true, "patch": true, "dlc": true, "support": true,
	"docs": true, "documentation": true, "payloads": true,
}

var StripExtensions = map[string]bool{
	".iso": true, ".img": true, ".bin": true, ".cue": true, ".exe": true, ".msi": true, ".pkg": true, ".dmg": true,
	".zip": true, ".7z": true, ".rar": true, ".tar": true, ".gz": true,
	".nsp": true, ".xci": true, ".cia": true, ".3ds": true, ".nds": true, ".gba": true, ".sfc": true,
	".smc": true, ".nes": true, ".chd": true, ".rvz": true, ".wbfs": true,
}

type HostedFile struct {
	ID             string `json:"id"`
	Filename       string `json:"filename"`
	Filepath       string `json:"filepath"`
	RelativePath   string `json:"relative_path"`
	Filesize       int64  `json:"filesize"`
	SHA256Head     string `json:"sha256_head"`
	Extension      string `json:"extension"`
	FormatCategory string `json:"format_category"`
	LibraryName    string `json:"library_name"`
	GameTitle      string `json:"game_title"`
	ModifiedAt     string `json:"modified_at"`
}

func DetermineFormatCategory(ext string) string {
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))
	switch ext {
	case "iso", "img", "bin", "cue":
		return "iso"
	case "exe", "msi", "pkg", "dmg", "app":
		return "installer"
	case "zip", "7z", "rar", "tar", "gz":
		return "archive"
	case "nsp", "xci", "cia", "3ds", "nds", "gba", "sfc", "smc", "nes", "chd", "rvz", "wbfs":
		return "rom"
	default:
		return "file"
	}
}

func ComputeHeadHash(filepath string) string {
	f, err := os.Open(filepath)
	if err != nil {
		return "0000000000000000000000000000000000000000000000000000000000000000"
	}
	defer f.Close()

	hasher := sha256.New()
	buf := make([]byte, 1024*1024) // 1MB
	n, err := f.Read(buf)
	if err != nil && err != io.EOF {
		return "0000000000000000000000000000000000000000000000000000000000000000"
	}
	hasher.Write(buf[:n])
	return hex.EncodeToString(hasher.Sum(nil))
}

func CleanTitleFromFilename(filename string) string {
	base := filename
	ext := filepath.Ext(filename)
	if StripExtensions[strings.ToLower(ext)] {
		base = strings.TrimSuffix(filename, ext)
	}

	tags := []string{
		"repack", "fitgirl", "dodi", "gog", "iso", "codex", "skidrow",
		"elamigos", "flt", "rune", "setup", "v1.0", "v1.1", "v1.2",
		"x64", "x86", "multi10", "multi12", "direct play", "macos", "mac", "osx",
	}

	lower := strings.ToLower(base)
	for _, tag := range tags {
		lower = strings.ReplaceAll(lower, tag, " ")
	}

	cleaned := strings.ReplaceAll(lower, ".", " ")
	cleaned = strings.ReplaceAll(cleaned, "_", " ")
	cleaned = strings.ReplaceAll(cleaned, "-", " ")
	cleaned = strings.TrimSpace(cleaned)

	fields := strings.Fields(cleaned)
	if len(fields) == 0 {
		return base
	}

	for i, f := range fields {
		if len(f) > 0 {
			fields[i] = strings.ToUpper(f[:1]) + strings.ToLower(f[1:])
		}
	}
	return strings.Join(fields, " ")
}

func IsGenericInstallerName(filename string) bool {
	stem := strings.ToLower(strings.TrimSuffix(filename, filepath.Ext(filename)))
	return GenericInstallerStems[stem]
}

func RelativeLibraryPath(fullPath, libraryPath string) string {
	if libraryPath != "" {
		rel, err := filepath.Rel(libraryPath, fullPath)
		if err == nil {
			return filepath.ToSlash(rel)
		}
	}
	parts := strings.Split(filepath.ToSlash(fullPath), "/")
	if len(parts) >= 2 {
		return strings.Join(parts[len(parts)-2:], "/")
	}
	return filepath.Base(fullPath)
}

func TitleFromInstallerPath(filename, fullPath, libraryPath string) string {
	if IsGenericInstallerName(filename) {
		rel := RelativeLibraryPath(fullPath, libraryPath)
		parts := strings.Split(rel, "/")
		if len(parts) > 1 {
			// Check parent folder
			parent := parts[len(parts)-2]
			if !GenericFolderNames[strings.ToLower(parent)] {
				return CleanTitleFromFilename(parent)
			}
		}
	}
	return CleanTitleFromFilename(filename)
}

type StorageIndexer struct {
	mu         sync.RWMutex
	libraries  []config.LibraryConfig
	filesByID  map[string]HostedFile
	lastScanned time.Time
}

func NewStorageIndexer(libraries []config.LibraryConfig) *StorageIndexer {
	return &StorageIndexer{
		libraries: libraries,
		filesByID: make(map[string]HostedFile),
	}
}

func (si *StorageIndexer) SetLibraries(libs []config.LibraryConfig) {
	si.mu.Lock()
	defer si.mu.Unlock()
	si.libraries = libs
}

func (si *StorageIndexer) GetLibraries() []config.LibraryConfig {
	si.mu.RLock()
	defer si.mu.RUnlock()
	res := make([]config.LibraryConfig, len(si.libraries))
	copy(res, si.libraries)
	return res
}

func (si *StorageIndexer) Files() []HostedFile {
	si.mu.RLock()
	defer si.mu.RUnlock()
	res := make([]HostedFile, 0, len(si.filesByID))
	for _, f := range si.filesByID {
		res = append(res, f)
	}
	return res
}

func (si *StorageIndexer) GetFile(id string) (HostedFile, bool) {
	si.mu.RLock()
	defer si.mu.RUnlock()
	f, ok := si.filesByID[id]
	return f, ok
}

func (si *StorageIndexer) TotalFiles() int {
	si.mu.RLock()
	defer si.mu.RUnlock()
	return len(si.filesByID)
}

func (si *StorageIndexer) TotalSizeBytes() int64 {
	si.mu.RLock()
	defer si.mu.RUnlock()
	var total int64
	for _, f := range si.filesByID {
		total += f.Filesize
	}
	return total
}

func (si *StorageIndexer) ScanAll() []HostedFile {
	si.mu.RLock()
	libs := make([]config.LibraryConfig, len(si.libraries))
	copy(libs, si.libraries)
	si.mu.RUnlock()

	newFiles := make(map[string]HostedFile)
	var indexed []HostedFile

	for _, lib := range libs {
		libName := lib.Name
		if libName == "" {
			libName = "Default"
		}
		libPath := lib.Path
		if _, err := os.Stat(libPath); os.IsNotExist(err) {
			continue
		}

		allowedMap := make(map[string]bool)
		for _, ext := range lib.AllowedExtensions {
			allowedMap[strings.ToLower(ext)] = true
		}

		_ = filepath.Walk(libPath, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}

			filename := filepath.Base(path)
			if strings.HasPrefix(filename, ".") {
				return nil
			}

			ext := strings.ToLower(filepath.Ext(path))
			if SkipExtensions[ext] {
				return nil
			}
			if len(allowedMap) > 0 && !allowedMap[ext] {
				return nil
			}

			fileSize := info.Size()
			modTime := info.ModTime().UTC().Format(time.RFC3339)
			headHash := ComputeHeadHash(path)

			// ID based on MD5 of path
			hasher := md5.New()
			hasher.Write([]byte(path))
			fileID := fmt.Sprintf("file_%s", hex.EncodeToString(hasher.Sum(nil))[:12])

			rel := RelativeLibraryPath(path, libPath)
			title := TitleFromInstallerPath(filename, path, libPath)
			cat := DetermineFormatCategory(ext)

			hf := HostedFile{
				ID:             fileID,
				Filename:       filename,
				Filepath:       path,
				RelativePath:   rel,
				Filesize:       fileSize,
				SHA256Head:     headHash,
				Extension:      ext,
				FormatCategory: cat,
				LibraryName:    libName,
				GameTitle:      title,
				ModifiedAt:     modTime,
			}

			newFiles[fileID] = hf
			indexed = append(indexed, hf)
			return nil
		})
	}

	si.mu.Lock()
	si.filesByID = newFiles
	si.lastScanned = time.Now()
	si.mu.Unlock()

	return indexed
}
