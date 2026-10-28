package indexer

import (
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/otixmeta"
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
	"bin": true, "x64": true, "x86": true, "win64": true, "win32": true, "binaries": true,
	"crack": true, "cracks": true, "redist": true, "commonredist": true, "_commonredist": true,
	"directx": true, "vcredist": true, "windows": true, "win": true, "files": true,
	"data": true, "game": true, "games": true, "disk1": true, "disc1": true, "cd1": true,
	"dvd": true, "iso": true, "unpacked": true, "extracted": true, "temp": true, "tmp": true,
	"update": true, "updates": true, "patch": true, "dlc": true, "support": true,
	"docs": true, "documentation": true, "payloads": true,
}

var NoiseExecutablePatterns = []string{
	"unins000", "uninstall", "uninst",
	"crashreporter", "crash_reporter", "crashreport", "crashhandler", "crash_handler",
	"unitycrashhandler", "unitycrashhandler32", "unitycrashhandler64", "crashpad", "crashing",
	"vcredist", "dxsetup", "directx", "dotnetfx", "oalinst", "physx", "redist",
	"easyanticheat", "battleye", "epic_online_services", "eosbootstrapper",
	"unrealcefsubprocessor", "cefsimple",
	"dedicatedserver", "benchmark",
	"bugreporter", "restarter", "dowser", "quicksfv", "launcher-installer",
	"ereg", "easyinfo",
}

var NoiseDirectoryNames = map[string]bool{
	"_commonredist": true, "commonredist": true, "redist": true, "_redist": true,
	"support": true, "directx": true, "vcredist": true, "vc_redist": true,
	"prerequisites": true, "prereq": true, "engine": true, "crashreports": true,
	"mono": true, "dependencies": true, ".git": true, "__macosx": true,
	"content": true, "assets": true, "textures": true, "sounds": true, "audio": true,
	"video": true, "movies": true, "films": true, "shaders": true, "levels": true, "maps": true,
	"res": true, "resources": true, "localization": true, "languages": true,
	"locale": true, "save": true, "saves": true, "cache": true,
	"runtimetools": true, "md5": true, "emulators": true,
	"anime shows": true, "anime movies": true, "anime": true,
	"shows": true, "tv shows": true, "tv": true, "television": true, "series": true,
	"music": true, "songs": true, "audiobooks": true, "podcasts": true,
	"incomplete": true, "incompleted": true,
}

var InstallerHeaderSignatures = []string{
	"Inno Setup", "SetupForm", "SetupLdr",
	"Nullsoft", "NSIS", "nVisi",
	"InstallShield", "ishield", "IKernel",
	"Wise", "WISE",
	"Burn", "WiX",
	"7-Zip",
}

var StripExtensions = map[string]bool{
	".iso": true, ".img": true, ".bin": true, ".cue": true, ".exe": true, ".msi": true, ".pkg": true, ".dmg": true,
	".zip": true, ".7z": true, ".rar": true, ".tar": true, ".gz": true,
	".nsp": true, ".xci": true, ".cia": true, ".3ds": true, ".nds": true, ".gba": true, ".sfc": true,
	".smc": true, ".nes": true, ".chd": true, ".rvz": true, ".wbfs": true, ".app": true,
}

type OtixImageRef struct {
	URL   string `json:"url,omitempty"`
	Local string `json:"local,omitempty"`
}

type HostedFile struct {
	ID             string                  `json:"id"`
	Filename       string                  `json:"filename"`
	Filepath       string                  `json:"filepath"`
	RelativePath   string                  `json:"relative_path"`
	Filesize       int64                   `json:"filesize"`
	SHA256Head     string                  `json:"sha256_head"`
	Extension      string                  `json:"extension"`
	FormatCategory string                  `json:"format_category"`
	LibraryName    string                  `json:"library_name"`
	GameTitle      string                  `json:"game_title"`
	ModifiedAt     string                  `json:"modified_at"`
	OtixMediaID    string                  `json:"otix_media_id,omitempty"`
	OtixTitle      string                  `json:"otix_title,omitempty"`
	OtixSlug       string                  `json:"otix_slug,omitempty"`
	OtixConfidence float64                 `json:"otix_confidence,omitempty"`
	OtixImages     map[string]OtixImageRef `json:"otix_images,omitempty"`
	OtixPath       string                  `json:"otix_path,omitempty"`
	OtixOverview   string                  `json:"otix_overview,omitempty"`
}

// DetermineFormatCategory maps a file extension to its baseline category.
func DetermineFormatCategory(ext string) string {
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))
	switch ext {
	case "iso", "img", "bin", "cue", "cso", "nkit", "gcm":
		return "iso"
	case "msi", "pkg", "dmg":
		return "installer"
	case "app":
		return "game"
	case "zip", "7z", "rar", "tar", "gz":
		return "archive"
	case "nsp", "xci", "cia", "3ds", "nds", "gba", "sfc", "smc", "nes", "z64", "n64", "v64", "pbp", "chd", "rvz", "wbfs":
		return "rom"
	case "exe":
		return "installer"
	default:
		return "file"
	}
}

// DetermineFileFormatCategory inspects the filename, path, and headers to classify format.
func DetermineFileFormatCategory(fullPath, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	cleanExt := strings.TrimPrefix(ext, ".")

	switch cleanExt {
	case "iso", "img", "cso", "nkit", "gcm", "cue":
		return "iso"
	case "msi", "pkg", "dmg":
		return "installer"
	case "app":
		lower := strings.ToLower(filename)
		if strings.Contains(lower, "install") || strings.Contains(lower, "setup") {
			return "installer"
		}
		return "game"
	case "zip", "7z", "rar", "tar", "gz":
		return "archive"
	case "nsp", "xci", "cia", "3ds", "nds", "gba", "sfc", "smc", "nes", "z64", "n64", "v64", "pbp", "chd", "rvz", "wbfs":
		return "rom"
	case "exe":
		if DetectInstallerType(fullPath, filename) != "" {
			return "installer"
		}
		return "game"
	case "bin":
		return "iso"
	default:
		return "file"
	}
}

// DetectInstallerType checks filename patterns, companion files, and binary headers.
func DetectInstallerType(filePath, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".msi" || ext == ".pkg" || ext == ".dmg" {
		return "installer"
	}

	stem := strings.ToLower(strings.TrimSuffix(filename, ext))
	if GenericInstallerStems[stem] {
		return "installer"
	}

	lower := strings.ToLower(filename)
	if strings.HasPrefix(lower, "setup") || strings.HasPrefix(lower, "install") ||
		strings.Contains(lower, "_setup") || strings.Contains(lower, "-setup") ||
		strings.Contains(lower, "setup_") || strings.Contains(lower, "setup-") ||
		strings.Contains(lower, "_install") || strings.Contains(lower, "-install") ||
		strings.Contains(lower, "install_") || strings.Contains(lower, "install-") ||
		strings.Contains(lower, "installer") || strings.Contains(lower, "repack") ||
		strings.Contains(lower, "fitgirl") || strings.Contains(lower, "dodi") ||
		strings.Contains(lower, "elamigos") {
		return "installer"
	}

	// Companion installer data check (e.g. setup-1.bin, setup.bin)
	if filePath != "" {
		dir := filepath.Dir(filePath)
		if entries, err := os.ReadDir(dir); err == nil {
			for _, entry := range entries {
				name := strings.ToLower(entry.Name())
				if strings.HasPrefix(name, "setup") && (strings.HasSuffix(name, ".bin") || strings.HasSuffix(name, ".cab")) {
					return "installer"
				}
			}
		}
	}

	// Header sniffing on executables
	if filePath != "" && (ext == ".exe" || ext == "") {
		if hasInstallerHeader(filePath) {
			return "installer"
		}
	}

	return ""
}

func hasInstallerHeader(filePath string) bool {
	f, err := os.Open(filePath)
	if err != nil {
		return false
	}
	defer f.Close()

	buf := make([]byte, 65536) // 64KB
	n, err := f.Read(buf)
	if err != nil && err != io.EOF {
		return false
	}
	header := string(buf[:n])

	for _, sig := range InstallerHeaderSignatures {
		if strings.Contains(header, sig) {
			return true
		}
	}
	return false
}

var TVMovieNoiseRegex = regexp.MustCompile(`(?i)(S\d{1,2}E\d{1,2}|2160p|1080p|720p|480p|WEB-?DL|BDRip|BRRip|HDRip|DVDRip|HDTV)`)

// IsNoiseOrUtilityExecutable returns true if an executable is an uninstaller, crash reporter, or redistributable.
func IsNoiseOrUtilityExecutable(filename, fullPath string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != ".exe" {
		return false
	}

	if TVMovieNoiseRegex.MatchString(filename) {
		return true
	}

	stem := strings.ToLower(strings.TrimSuffix(filename, ext))
	for _, pattern := range NoiseExecutablePatterns {
		if strings.Contains(stem, pattern) {
			return true
		}
	}

	if fullPath != "" {
		parts := strings.Split(filepath.ToSlash(fullPath), "/")
		for _, part := range parts {
			if NoiseDirectoryNames[strings.ToLower(part)] {
				return true
			}
		}
	}

	return false
}

// IsUpdateOrPatchArtifact is true for patch/update installers belonging to a base game.
func IsUpdateOrPatchArtifact(filename, fullPath string) bool {
	lowerName := strings.ToLower(filename)
	lowerPath := strings.ToLower(filepath.ToSlash(fullPath))
	if strings.Contains(lowerName, "update") || strings.Contains(lowerName, "hotfix") {
		return true
	}
	for _, part := range strings.Split(lowerPath, "/") {
		if part == "updates" {
			return true
		}
		if strings.HasPrefix(part, "_unpack") && strings.Contains(part, "update") {
			return true
		}
		if strings.Contains(part, "_update_") || strings.Contains(part, "-update-") || strings.Contains(part, " update ") {
			ext := strings.ToLower(filepath.Ext(filename))
			if ext == ".exe" || ext == ".pkg" || ext == ".msi" || ext == ".dmg" {
				return true
			}
		}
	}
	return false
}

// IsNoiseHostedPackage skips tiny DLC unlocker pkgs / emulator tooling archives.
func IsNoiseHostedPackage(filename, fullPath string) bool {
	lowerName := strings.ToLower(filename)
	lowerPath := strings.ToLower(filepath.ToSlash(fullPath))
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".pkg":
		if strings.Contains(lowerName, "keyblade") || strings.Contains(lowerName, "unlocker") {
			return true
		}
	case ".zip", ".7z", ".rar":
		if strings.Contains(lowerPath, "/emulators/") {
			return true
		}
		if strings.Contains(lowerName, "prodkeys") || strings.Contains(lowerName, "yuzu") {
			return true
		}
		if strings.Contains(lowerName, "fix") && strings.Contains(lowerName, "repair") {
			return true
		}
	}
	return false
}

// StripUpdateSuffixFromTitle removes trailing "update …" / "hotfix …" version noise.
func StripUpdateSuffixFromTitle(title string) string {
	lower := strings.ToLower(title)
	for _, marker := range []string{" update ", " hotfix ", " patch "} {
		if idx := strings.Index(lower, marker); idx > 0 {
			return strings.TrimSpace(title[:idx])
		}
	}
	// Also handle "Foo_update_1.2" style already cleaned to "Foo Update 1 2"
	return strings.TrimSpace(title)
}

func stripUpdateTokenFromFolder(name string) string {
	lower := strings.ToLower(name)
	for _, sep := range []string{"_update_", "-update-", " update "} {
		if idx := strings.Index(lower, sep); idx > 0 {
			return name[:idx]
		}
	}
	return name
}

// CleanFolderTitle lightly normalizes a directory name without stripping scene tags
// (so "RuneScape Dragonwilds" is not destroyed by the "rune" release tag).
func CleanFolderTitle(name string) string {
	cleaned := strings.ReplaceAll(name, ".", " ")
	cleaned = strings.ReplaceAll(cleaned, "_", " ")
	cleaned = strings.ReplaceAll(cleaned, "-", " ")
	fields := strings.Fields(cleaned)
	if len(fields) == 0 {
		return name
	}
	for i, f := range fields {
		if len(f) > 0 {
			fields[i] = strings.ToUpper(f[:1]) + strings.ToLower(f[1:])
		}
	}
	return strings.Join(fields, " ")
}

// ParentGameTitleForUpdate resolves which base game an update/patch belongs to.
func ParentGameTitleForUpdate(filename, fullPath, libraryPath string) string {
	rel := RelativeLibraryPath(fullPath, libraryPath)
	parts := strings.Split(rel, "/")

	// Prefer the folder that owns an Updates/ directory.
	for i := len(parts) - 2; i >= 0; i-- {
		if strings.EqualFold(parts[i], "updates") && i > 0 {
			return CleanFolderTitle(parts[i-1])
		}
	}

	// Folder names like Final_Fantasy_VII_Rebirth_update_1.003_ElAmigos
	for i := len(parts) - 2; i >= 0; i-- {
		pl := strings.ToLower(parts[i])
		if strings.Contains(pl, "update") && !strings.EqualFold(parts[i], "updates") {
			stripped := stripUpdateTokenFromFolder(parts[i])
			if stripped != parts[i] && stripped != "" {
				return CleanFolderTitle(stripped)
			}
		}
	}

	// Filename: "Elden Ring update 1.12.3 - 1.13.0.exe"
	fromFile := StripUpdateSuffixFromTitle(CleanTitleFromFilename(filename))
	cleanedFile := CleanTitleFromFilename(filename)
	if fromFile != "" && !strings.EqualFold(fromFile, cleanedFile) {
		return fromFile
	}

	// Nearest non-generic ancestor
	for i := len(parts) - 2; i >= 0; i-- {
		p := parts[i]
		pl := strings.ToLower(p)
		if GenericFolderNames[pl] || strings.Contains(pl, "update") {
			continue
		}
		return CleanFolderTitle(p)
	}

	if fromFile != "" {
		return fromFile
	}
	return cleanedFile
}

// IsInstallerPayloadFile checks if a file is an installer chunk rather than a standalone game.
func IsInstallerPayloadFile(filename string) bool {
	lower := strings.ToLower(filename)
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".bin" || ext == ".cab" || ext == ".sfv" || ext == ".nfo" || ext == ".md5" || ext == ".sha" {
		if strings.HasPrefix(lower, "setup") || strings.HasPrefix(lower, "data") || ext == ".sfv" || ext == ".nfo" || ext == ".cab" {
			return true
		}
	}
	return false
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

var (
	reCamel       = regexp.MustCompile(`([a-z])([A-Z])`)
	reAcronym     = regexp.MustCompile(`([A-Z]+)([A-Z][a-z])`)
	reLetterDigit = regexp.MustCompile(`([a-uw-zA-UW-Z])([0-9]+)`)
	reDigitLetter = regexp.MustCompile(`([0-9]+)([a-zA-Z])`)
	rePreTags     = regexp.MustCompile(`(?i)\bmac\s*os\b|\bmacos\b`)
)

func CleanTitleFromFilename(filename string) string {
	base := filename
	ext := filepath.Ext(filename)
	if StripExtensions[strings.ToLower(ext)] {
		base = strings.TrimSuffix(filename, ext)
	}

	// Remove macOS before CamelCase splitting turns it into mac OS
	base = rePreTags.ReplaceAllString(base, " ")

	// Split CamelCase, acronyms, and alphanumeric boundaries
	base = reCamel.ReplaceAllString(base, "$1 $2")
	base = reAcronym.ReplaceAllString(base, "$1 $2")
	base = reLetterDigit.ReplaceAllString(base, "$1 $2")
	base = reDigitLetter.ReplaceAllString(base, "$1 $2")

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
			// Find nearest non-generic ancestor folder
			for i := len(parts) - 2; i >= 0; i-- {
				ancestor := parts[i]
				if !GenericFolderNames[strings.ToLower(ancestor)] {
					return CleanTitleFromFilename(ancestor)
				}
			}
		}
	}
	return CleanTitleFromFilename(filename)
}

// FindGameRootFolder walks up from candidatePath towards libraryPath to find the game folder.
func FindGameRootFolder(candidatePath, libraryPath string) (rootDir string, rootName string) {
	rel := RelativeLibraryPath(candidatePath, libraryPath)
	parts := strings.Split(rel, "/")
	if len(parts) <= 1 {
		return filepath.Dir(candidatePath), filepath.Base(candidatePath)
	}

	for i := len(parts) - 2; i >= 0; i-- {
		part := parts[i]
		if !GenericFolderNames[strings.ToLower(part)] {
			sub := parts[:i+1]
			fullRoot := filepath.Join(libraryPath, filepath.Join(sub...))
			return fullRoot, part
		}
	}

	return filepath.Dir(candidatePath), parts[0]
}

// GameRootForFile resolves the folder that should hold a `.otix` sidecar.
func GameRootForFile(filepathAbs, libraryPath string) string {
	if strings.EqualFold(filepath.Ext(filepathAbs), ".app") {
		return filepathAbs
	}
	if libraryPath != "" {
		root, _ := FindGameRootFolder(filepathAbs, libraryPath)
		if root != "" {
			return root
		}
	}
	return filepath.Dir(filepathAbs)
}

// AttachOtixSidecar loads `.otix` next to the game root and fills HostedFile otix_* fields.
func AttachOtixSidecar(hf *HostedFile, libraryPath string) {
	if hf == nil || hf.Filepath == "" {
		return
	}
	root := GameRootForFile(hf.Filepath, libraryPath)
	sc, err := otixmeta.Read(root)
	if err != nil || sc == nil {
		return
	}
	hf.OtixPath = otixmeta.Path(root)
	hf.OtixMediaID = sc.MediaID
	hf.OtixTitle = sc.Title
	hf.OtixSlug = sc.Slug
	hf.OtixConfidence = sc.Confidence
	hf.OtixOverview = sc.Overview
	if len(sc.Images) > 0 {
		hf.OtixImages = make(map[string]OtixImageRef, len(sc.Images))
		for role, ref := range sc.Images {
			if ref == nil {
				continue
			}
			local := ""
			if ref.Local != nil {
				local = *ref.Local
			}
			hf.OtixImages[role] = OtixImageRef{URL: ref.URL, Local: local}
		}
	}
}

// ScoreGameCandidate evaluates how likely an executable is to be the primary game binary.
func ScoreGameCandidate(candidatePath string, gameRootName string, info os.FileInfo, isInstaller bool) int {
	if isInstaller || strings.HasPrefix(filepath.Base(candidatePath), ".") {
		return -1000
	}

	score := 0
	filename := filepath.Base(candidatePath)
	ext := filepath.Ext(filename)
	stem := strings.ToLower(strings.TrimSuffix(filename, ext))
	normGame := strings.ToLower(CleanTitleFromFilename(gameRootName))
	normStem := strings.ToLower(CleanTitleFromFilename(stem))

	// Direct match against the game folder title
	if stem == strings.ToLower(gameRootName) || normStem == normGame {
		score += 150
	} else if strings.Contains(normStem, normGame) || strings.Contains(normGame, normStem) {
		score += 80
	}

	// Launchers / prelaunchers
	if strings.Contains(stem, "launcher") || strings.Contains(stem, "prelauncher") {
		score -= 15
	}

	// Path location
	lowerPath := strings.ToLower(candidatePath)
	if strings.Contains(lowerPath, "bin/x64") || strings.Contains(lowerPath, "binaries/win64") {
		score += 40
	} else if strings.Contains(lowerPath, "bin/") || strings.Contains(lowerPath, "binaries/") {
		score += 25
	}

	// File size bonus (installed game binaries are typically > 10MB)
	size := info.Size()
	if size > 30*1024*1024 {
		score += 35
	} else if size > 10*1024*1024 {
		score += 25
	} else if size > 2*1024*1024 {
		score += 10
	} else if size < 500*1024 {
		score -= 20
	}

	return score
}

type candidateExe struct {
	path        string
	filename    string
	info        os.FileInfo
	isInstaller bool
	score       int
}

type ScanPhase string

const (
	ScanPhaseIdle      ScanPhase = "idle"
	ScanPhaseScanning  ScanPhase = "scanning"
	ScanPhaseCompleted ScanPhase = "completed"
	ScanPhaseError     ScanPhase = "error"
)

type ScanStatus struct {
	Phase            ScanPhase `json:"phase"`
	CurrentDirectory string    `json:"current_directory"`
	FilesScanned     int       `json:"files_scanned"`
	TotalFiles       int       `json:"total_files"`
	Percentage       float64   `json:"percentage"`
	StartedAt        time.Time `json:"started_at,omitempty"`
	ElapsedMs        int64     `json:"elapsed_ms"`
	LastCompletedAt  time.Time `json:"last_completed_at,omitempty"`
	ErrorMessage     string    `json:"error_message,omitempty"`
}

type ScanProgressEvent struct {
	Event string     `json:"event"`
	Data  ScanStatus `json:"data"`
}

type StorageIndexer struct {
	mu           sync.RWMutex
	scanMu       sync.Mutex
	libraries    []config.LibraryConfig
	filesByID    map[string]HostedFile
	filesByPath  map[string]string // filepath -> ID
	mtimesByPath map[string]int64  // filepath -> mtime unix
	lastScanned  time.Time
	store        *Store
	watcher      *Watcher

	statusMu    sync.RWMutex
	status      ScanStatus
	subscribers map[chan ScanProgressEvent]struct{}
	subMu       sync.Mutex
}

func NewStorageIndexer(libraries []config.LibraryConfig) *StorageIndexer {
	return &StorageIndexer{
		libraries:    libraries,
		filesByID:    make(map[string]HostedFile),
		filesByPath:  make(map[string]string),
		mtimesByPath: make(map[string]int64),
		status:       ScanStatus{Phase: ScanPhaseIdle},
		subscribers:  make(map[chan ScanProgressEvent]struct{}),
	}
}

// SetStore attaches a persistent SQLite store and loads cached files on startup.
func (si *StorageIndexer) SetStore(s *Store) error {
	si.mu.Lock()
	si.store = s
	si.mu.Unlock()

	if s == nil {
		return nil
	}

	cachedFiles, cachedMtimes, err := s.LoadAll()
	if err != nil {
		return err
	}

	si.mu.Lock()
	si.filesByID = cachedFiles
	si.mtimesByPath = cachedMtimes
	si.filesByPath = make(map[string]string, len(cachedFiles))
	for id, f := range cachedFiles {
		si.filesByPath[f.Filepath] = id
	}
	si.mu.Unlock()

	return nil
}

// AttachWatcher attaches an active directory watcher to the indexer.
func (si *StorageIndexer) AttachWatcher(w *Watcher) {
	si.mu.Lock()
	defer si.mu.Unlock()
	si.watcher = w
	si.syncWatcherPathsLocked()
}

// Close cleanly stops the watcher and closes the database store.
func (si *StorageIndexer) Close() error {
	si.mu.Lock()
	defer si.mu.Unlock()
	if si.watcher != nil {
		_ = si.watcher.Close()
		si.watcher = nil
	}
	if si.store != nil {
		_ = si.store.Close()
		si.store = nil
	}
	return nil
}

func (si *StorageIndexer) syncWatcherPathsLocked() {
	if si.watcher == nil {
		return
	}
	var paths []string
	for _, lib := range si.libraries {
		if lib.Path != "" {
			paths = append(paths, lib.Path)
		}
	}
	watcher := si.watcher
	go watcher.SetPaths(paths)
}

func (si *StorageIndexer) SetLibraries(libs []config.LibraryConfig) {
	si.mu.Lock()
	defer si.mu.Unlock()
	si.libraries = libs
	si.syncWatcherPathsLocked()
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

// UpsertFile replaces or inserts a hosted file in the index and store.
func (si *StorageIndexer) UpsertFile(f HostedFile) {
	if f.ID == "" {
		return
	}
	si.mu.Lock()
	si.filesByID[f.ID] = f
	si.filesByPath[f.Filepath] = f.ID
	if t, err := time.Parse(time.RFC3339, f.ModifiedAt); err == nil {
		si.mtimesByPath[f.Filepath] = t.Unix()
	}
	store := si.store
	si.mu.Unlock()

	if store != nil {
		_ = store.UpsertFiles([]HostedFile{f})
	}
}

// Clear drops the hosted file index and cache without deleting files on disk.
func (si *StorageIndexer) Clear() int {
	si.mu.Lock()
	n := len(si.filesByID)
	si.filesByID = make(map[string]HostedFile)
	si.filesByPath = make(map[string]string)
	si.mtimesByPath = make(map[string]int64)
	si.lastScanned = time.Time{}
	store := si.store
	si.mu.Unlock()

	if store != nil {
		_ = store.Clear()
	}

	return n
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

func (si *StorageIndexer) GetStatus() ScanStatus {
	si.statusMu.RLock()
	defer si.statusMu.RUnlock()
	return si.status
}

func (si *StorageIndexer) IsScanning() bool {
	si.statusMu.RLock()
	defer si.statusMu.RUnlock()
	return si.status.Phase == ScanPhaseScanning
}

func (si *StorageIndexer) SubscribeProgress() chan ScanProgressEvent {
	si.subMu.Lock()
	defer si.subMu.Unlock()
	ch := make(chan ScanProgressEvent, 32)
	si.subscribers[ch] = struct{}{}
	return ch
}

func (si *StorageIndexer) UnsubscribeProgress(ch chan ScanProgressEvent) {
	si.subMu.Lock()
	defer si.subMu.Unlock()
	delete(si.subscribers, ch)
	close(ch)
}

func (si *StorageIndexer) broadcastProgress(event ScanProgressEvent) {
	si.subMu.Lock()
	defer si.subMu.Unlock()
	for ch := range si.subscribers {
		select {
		case ch <- event:
		default:
			// Non-blocking drop if consumer buffer is full
		}
	}
}

func (si *StorageIndexer) updateStatus(mutate func(s *ScanStatus)) {
	si.statusMu.Lock()
	mutate(&si.status)
	current := si.status
	si.statusMu.Unlock()

	si.broadcastProgress(ScanProgressEvent{
		Event: "scan_progress",
		Data:  current,
	})
}

func (si *StorageIndexer) ScanAll() []HostedFile {
	return si.ScanAllWithDeep(false)
}

func (si *StorageIndexer) ScanAllWithDeep(deep bool) []HostedFile {
	si.scanMu.Lock()
	defer si.scanMu.Unlock()

	si.mu.RLock()
	libs := make([]config.LibraryConfig, len(si.libraries))
	copy(libs, si.libraries)
	cachedFiles := make(map[string]HostedFile, len(si.filesByID))
	for k, v := range si.filesByID {
		cachedFiles[k] = v
	}
	cachedByPath := make(map[string]string, len(si.filesByPath))
	for k, v := range si.filesByPath {
		cachedByPath[k] = v
	}
	cachedMtimes := make(map[string]int64, len(si.mtimesByPath))
	for k, v := range si.mtimesByPath {
		cachedMtimes[k] = v
	}
	store := si.store
	si.mu.RUnlock()

	startTime := time.Now()
	si.statusMu.Lock()
	si.status = ScanStatus{
		Phase:        ScanPhaseScanning,
		StartedAt:    startTime,
		FilesScanned: 0,
		TotalFiles:   len(cachedFiles),
	}
	si.statusMu.Unlock()
	si.broadcastProgress(ScanProgressEvent{
		Event: "scan_started",
		Data:  si.GetStatus(),
	})

	newFiles := make(map[string]HostedFile)
	newFilesByPath := make(map[string]string)
	newMtimes := make(map[string]int64)
	var indexed []HostedFile
	var filesToPersist []HostedFile
	activePathsPerLib := make(map[string]map[string]bool)

	totalFilesScanned := 0
	lastBroadcast := time.Now()

	for _, lib := range libs {
		libName := lib.Name
		if libName == "" {
			libName = "Default"
		}
		activePathsPerLib[libName] = make(map[string]bool)
		libPath := lib.Path
		if _, err := os.Stat(libPath); os.IsNotExist(err) {
			continue
		}

		allowedExts := lib.AllowedExtensions
		if len(allowedExts) == 0 {
			allowedExts = config.DefaultAllowedExtensions(lib.Kind)
		}
		allowedMap := make(map[string]bool, len(allowedExts))
		for _, ext := range allowedExts {
			allowedMap[strings.ToLower(ext)] = true
		}

		dirCandidates := make(map[string][]candidateExe)
		dirRootNames := make(map[string]string)

		_ = filepath.Walk(libPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}

			name := info.Name()
			if strings.HasPrefix(name, ".") {
				if info.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			totalFilesScanned++
			if time.Since(lastBroadcast) > 120*time.Millisecond {
				lastBroadcast = time.Now()
				si.updateStatus(func(s *ScanStatus) {
					s.CurrentDirectory = filepath.Dir(path)
					s.FilesScanned = totalFilesScanned
					s.ElapsedMs = time.Since(startTime).Milliseconds()
				})
			}

			// Handle macOS .app bundle
			if info.IsDir() {
				if strings.HasSuffix(strings.ToLower(name), ".app") {
					plist := filepath.Join(path, "Contents", "Info.plist")
					macosDir := filepath.Join(path, "Contents", "MacOS")
					if _, errP := os.Stat(plist); errP == nil || func() bool { _, errM := os.Stat(macosDir); return errM == nil }() {
						mtimeUnix := info.ModTime().Unix()
						activePathsPerLib[libName][path] = true
						cachedID, hasCached := cachedByPath[path]
						cachedMt, hasMt := cachedMtimes[path]

						if !deep && hasCached && hasMt && cachedMt == mtimeUnix {
							if existing, ok := cachedFiles[cachedID]; ok {
								newFiles[existing.ID] = existing
								newFilesByPath[path] = existing.ID
								newMtimes[path] = mtimeUnix
								indexed = append(indexed, existing)
								return filepath.SkipDir
							}
						}

						modTime := info.ModTime().UTC().Format(time.RFC3339)
						hasher := md5.New()
						hasher.Write([]byte(path))
						fileID := fmt.Sprintf("file_%s", hex.EncodeToString(hasher.Sum(nil))[:12])
						rel := RelativeLibraryPath(path, libPath)
						title := CleanTitleFromFilename(strings.TrimSuffix(name, ".app"))
						cat := "game"
						if strings.Contains(strings.ToLower(name), "install") || strings.Contains(strings.ToLower(name), "setup") {
							cat = "installer"
						}

						hf := HostedFile{
							ID:             fileID,
							Filename:       name,
							Filepath:       path,
							RelativePath:   rel,
							Filesize:       info.Size(),
							SHA256Head:     "0000000000000000000000000000000000000000000000000000000000000000",
							Extension:      ".app",
							FormatCategory: cat,
							LibraryName:    libName,
							GameTitle:      title,
							ModifiedAt:     modTime,
						}
						AttachOtixSidecar(&hf, libPath)
						newFiles[fileID] = hf
						newFilesByPath[path] = fileID
						newMtimes[path] = mtimeUnix
						indexed = append(indexed, hf)
						filesToPersist = append(filesToPersist, hf)
						return filepath.SkipDir
					}
				}

				if strings.HasPrefix(name, ".") && path != libPath {
					return filepath.SkipDir
				}
				if NoiseDirectoryNames[strings.ToLower(name)] {
					return filepath.SkipDir
				}
				if path != libPath {
					rel := RelativeLibraryPath(path, libPath)
					parts := strings.Split(rel, "/")
					if len(parts) > 7 {
						return filepath.SkipDir
					}
				}
				return nil
			}

			if strings.HasPrefix(name, ".") {
				return nil
			}

			ext := strings.ToLower(filepath.Ext(path))
			if len(allowedMap) > 0 && !allowedMap[ext] {
				return nil
			}
			if IsInstallerPayloadFile(name) {
				return nil
			}
			if ext == ".bin" && SkipExtensions[ext] {
				return nil
			}
			if IsNoiseHostedPackage(name, path) {
				return nil
			}

			activePathsPerLib[libName][path] = true
			mtimeUnix := info.ModTime().Unix()

			indexFile := func(cat, title string) {
				cachedID, hasCached := cachedByPath[path]
				cachedMt, hasMt := cachedMtimes[path]

				if !deep && hasCached && hasMt && cachedMt == mtimeUnix {
					if existing, ok := cachedFiles[cachedID]; ok {
						newFiles[existing.ID] = existing
						newFilesByPath[path] = existing.ID
						newMtimes[path] = mtimeUnix
						indexed = append(indexed, existing)
						return
					}
				}

				fileSize := info.Size()
				modTime := info.ModTime().UTC().Format(time.RFC3339)
				headHash := ComputeHeadHash(path)
				hasher := md5.New()
				hasher.Write([]byte(path))
				fileID := fmt.Sprintf("file_%s", hex.EncodeToString(hasher.Sum(nil))[:12])
				rel := RelativeLibraryPath(path, libPath)
				hf := HostedFile{
					ID:             fileID,
					Filename:       name,
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
				AttachOtixSidecar(&hf, libPath)
				newFiles[fileID] = hf
				newFilesByPath[path] = fileID
				newMtimes[path] = mtimeUnix
				indexed = append(indexed, hf)
				filesToPersist = append(filesToPersist, hf)
			}

			if IsUpdateOrPatchArtifact(name, path) {
				indexFile("update", ParentGameTitleForUpdate(name, path, libPath))
				return nil
			}

			if ext == ".exe" {
				if IsNoiseOrUtilityExecutable(name, path) {
					return nil
				}

				isInst := DetectInstallerType(path, name) != ""
				rootDir, rootName := FindGameRootFolder(path, libPath)
				dirCandidates[rootDir] = append(dirCandidates[rootDir], candidateExe{
					path:        path,
					filename:    name,
					info:        info,
					isInstaller: isInst,
				})
				dirRootNames[rootDir] = rootName
				return nil
			}

			cat := DetermineFileFormatCategory(path, name)
			if cat == "file" {
				return nil
			}

			indexFile(cat, TitleFromInstallerPath(name, path, libPath))
			return nil
		})

		for rootDir, candidates := range dirCandidates {
			if len(candidates) == 0 {
				continue
			}

			rootName := dirRootNames[rootDir]
			if rootName == "" {
				rootName = filepath.Base(rootDir)
			}

			var gameCandidates []candidateExe
			var installerCandidates []candidateExe

			for _, c := range candidates {
				if c.isInstaller {
					installerCandidates = append(installerCandidates, c)
				} else {
					c.score = ScoreGameCandidate(c.path, rootName, c.info, false)
					gameCandidates = append(gameCandidates, c)
				}
			}

			var elected candidateExe
			var formatCategory string

			if len(gameCandidates) > 0 {
				best := gameCandidates[0]
				for _, gc := range gameCandidates[1:] {
					if gc.score > best.score {
						best = gc
					}
				}
				elected = best
				formatCategory = "game"
			} else {
				best := installerCandidates[0]
				for _, ic := range installerCandidates[1:] {
					stem := strings.ToLower(strings.TrimSuffix(ic.filename, filepath.Ext(ic.filename)))
					if stem == "setup" || stem == "install" {
						best = ic
						break
					}
				}
				elected = best
				formatCategory = "installer"
			}

			mtimeUnix := elected.info.ModTime().Unix()
			cachedID, hasCached := cachedByPath[elected.path]
			cachedMt, hasMt := cachedMtimes[elected.path]

			if !deep && hasCached && hasMt && cachedMt == mtimeUnix {
				if existing, ok := cachedFiles[cachedID]; ok {
					newFiles[existing.ID] = existing
					newFilesByPath[elected.path] = existing.ID
					newMtimes[elected.path] = mtimeUnix
					indexed = append(indexed, existing)
					continue
				}
			}

			fileSize := elected.info.Size()
			modTime := elected.info.ModTime().UTC().Format(time.RFC3339)
			headHash := ComputeHeadHash(elected.path)

			hasher := md5.New()
			hasher.Write([]byte(elected.path))
			fileID := fmt.Sprintf("file_%s", hex.EncodeToString(hasher.Sum(nil))[:12])

			rel := RelativeLibraryPath(elected.path, libPath)
			title := TitleFromInstallerPath(elected.filename, elected.path, libPath)
			if formatCategory == "game" {
				if !GenericFolderNames[strings.ToLower(rootName)] && rootName != "." {
					title = CleanTitleFromFilename(rootName)
				}
			}

			ext := strings.ToLower(filepath.Ext(elected.filename))
			hf := HostedFile{
				ID:             fileID,
				Filename:       elected.filename,
				Filepath:       elected.path,
				RelativePath:   rel,
				Filesize:       fileSize,
				SHA256Head:     headHash,
				Extension:      ext,
				FormatCategory: formatCategory,
				LibraryName:    libName,
				GameTitle:      title,
				ModifiedAt:     modTime,
			}
			AttachOtixSidecar(&hf, libPath)

			newFiles[fileID] = hf
			newFilesByPath[elected.path] = fileID
			newMtimes[elected.path] = mtimeUnix
			indexed = append(indexed, hf)
			filesToPersist = append(filesToPersist, hf)
		}
	}

	// Persist changes to SQLite store
	if store != nil {
		if len(filesToPersist) > 0 {
			_ = store.UpsertFiles(filesToPersist)
		}
		for libName, activeMap := range activePathsPerLib {
			_, _ = store.DeleteMissing(activeMap, libName)
		}
	}

	si.mu.Lock()
	si.filesByID = newFiles
	si.filesByPath = newFilesByPath
	si.mtimesByPath = newMtimes
	si.lastScanned = time.Now()
	si.mu.Unlock()

	elapsed := time.Since(startTime).Milliseconds()
	si.statusMu.Lock()
	si.status = ScanStatus{
		Phase:           ScanPhaseCompleted,
		CurrentDirectory: "",
		FilesScanned:    totalFilesScanned,
		TotalFiles:      len(newFiles),
		Percentage:      100.0,
		StartedAt:       startTime,
		ElapsedMs:       elapsed,
		LastCompletedAt: time.Now(),
	}
	completedStatus := si.status
	si.statusMu.Unlock()

	si.broadcastProgress(ScanProgressEvent{
		Event: "scan_completed",
		Data:  completedStatus,
	})

	return indexed
}
