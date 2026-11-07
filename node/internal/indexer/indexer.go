package indexer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"os"
	"path/filepath"
	"regexp"
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
	"eboot": true,
}

var GenericFolderNames = map[string]bool{
	"setup": true, "install": true, "installer": true, "autorun": true,
	"start": true, "play": true, "unins000": true, "uninstall": true,
	"bin": true, "bin32": true, "bin64": true, "x64": true, "x86": true, "x86_64": true,
	"win64": true, "win32": true, "binaries": true, "binary": true,
	"crack": true, "cracks": true, "redist": true, "commonredist": true, "_commonredist": true,
	"directx": true, "vcredist": true, "windows": true, "win": true, "files": true,
	"data": true, "game": true, "games": true, "disk1": true, "disc1": true, "cd1": true,
	"dvd": true, "iso": true, "unpacked": true, "extracted": true, "temp": true, "tmp": true,
	"update": true, "updates": true, "patch": true, "dlc": true, "support": true,
	"docs": true, "documentation": true, "payloads": true,
	"engine": true, "system": true, "system32": true, "shipping": true, "retail": true,
	"release": true, "debug": true, "build": true, "client": true, "server": true,
	"resources": true, "res": true, "prerequisites": true, "prereq": true,
	"plugins": true, "plugin": true, "cleaner": true, "mods": true, "menu-simulations": true,
	"app0": true, "sce_sys": true, "usrdir": true, "defaultprojects": true, "legacy": true,
}

var KnownEngineProjectFolders = map[string]bool{
	"phoenix": true, "end": true, "b1": true, "oakgame": true, "willowgame": true,
	"polaris": true, "athena": true, "pal": true, "factorygame": true,
	"bendgame": true, "biogame": true, "xgame": true, "mk12": true,
	"stalker2": true, "deadbydaylight": true, "atomicheart": true, "readyornot": true,
}

var ContainerFolderNames = map[string]bool{
	"steamapps": true, "common": true, "games": true, "game": true,
	"repacks": true, "repack": true, "fitgirl": true, "dodi": true,
	"elamigos": true, "gog": true, "gog games": true, "steam": true,
	"steam games": true, "epic": true, "epic games": true,
	"downloads": true, "download": true, "installed": true,
	"pc": true, "switch": true, "nsw": true, "ps1": true, "ps2": true,
	"ps3": true, "ps4": true, "ps5": true, "xbox": true, "xbox360": true,
	"wii": true, "wiiu": true, "gamecube": true, "3ds": true, "nds": true,
	"gba": true, "snes": true, "nes": true, "genesis": true, "n64": true,
	"roms": true, "rom": true, "iso": true, "isos": true,
	"emulation": true, "emulators": true,
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
	"vconsole2", "cleaner", "steam_api64", "sheep", "csgo_legacy_app",
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
	// Expanded OS, build, and package manager noise directories
	"$recycle.bin": true, "system volume information": true, "recovery": true,
	"node_modules": true, ".vs": true, ".vscode": true, ".idea": true, ".venv": true,
	"__pycache__": true, ".egstore": true, "!downloads": true,
	// PS5 / console internal noise directories that should never be scanned as separate folders
	"sce_module": true, "sce_pfs": true, "fakelib": true, "_duplex_": true,
	"menu-simulations": true, "menu-simulation": true, "mods": true, "mod": true,
	"plugins": true, "plugin": true, "cleaner": true, "defaultprojects": true, "legacy": true,
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
	RootDir        string                  `json:"root_dir,omitempty"`
	Platform       string                  `json:"platform,omitempty"`
	OtixMediaID    string                  `json:"otix_media_id,omitempty"`
	OtixTitle      string                  `json:"otix_title,omitempty"`
	OtixSlug       string                  `json:"otix_slug,omitempty"`
	OtixConfidence float64                 `json:"otix_confidence,omitempty"`
	OtixImages     map[string]OtixImageRef `json:"otix_images,omitempty"`
	OtixPath       string                  `json:"otix_path,omitempty"`
	OtixOverview   string                  `json:"otix_overview,omitempty"`
}

// IsPathReachable quickly validates whether a local path or UNC network share is online and accessible.
func IsPathReachable(p string) bool {
	clean := filepath.Clean(p)
	if strings.HasPrefix(clean, `\\`) || strings.HasPrefix(clean, `//`) {
		trimmed := strings.TrimPrefix(strings.TrimPrefix(clean, `\\`), `//`)
		parts := strings.Split(trimmed, string(filepath.Separator))
		if len(parts) > 0 && parts[0] != "" {
			host := parts[0]
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, "445"), 500*time.Millisecond)
			if err != nil {
				conn139, err139 := net.DialTimeout("tcp", net.JoinHostPort(host, "139"), 300*time.Millisecond)
				if err139 != nil {
					return false
				}
				_ = conn139.Close()
			} else {
				_ = conn.Close()
			}
		}
	}
	_, err := os.Stat(clean)
	return err == nil
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
	lowerName := strings.ToLower(filename)
	if strings.HasSuffix(lowerName, ".nsp.hdf") {
		return "rom"
	}

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
		if strings.EqualFold(filename, "eboot.bin") {
			return "game"
		}
		return "iso"
	default:
		return "file"
	}
}

var (
	companionCheckMu    sync.RWMutex
	companionCheckCache = make(map[string]bool)
)

func hasCompanionInstallerFiles(dir string) bool {
	companionCheckMu.RLock()
	cached, ok := companionCheckCache[dir]
	companionCheckMu.RUnlock()
	if ok {
		return cached
	}

	companionCheckMu.Lock()
	defer companionCheckMu.Unlock()
	if cached, ok := companionCheckCache[dir]; ok {
		return cached
	}

	if len(companionCheckCache) > 10000 {
		companionCheckCache = make(map[string]bool)
	}

	found := false
	if entries, err := os.ReadDir(dir); err == nil {
		for _, entry := range entries {
			name := strings.ToLower(entry.Name())
			if strings.HasPrefix(name, "setup") && (strings.HasSuffix(name, ".bin") || strings.HasSuffix(name, ".cab")) {
				found = true
				break
			}
		}
	}
	companionCheckCache[dir] = found
	return found
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

	// Companion installer data check (e.g. setup-1.bin, setup.bin) - cached per directory
	if filePath != "" {
		dir := filepath.Dir(filePath)
		if hasCompanionInstallerFiles(dir) {
			return "installer"
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

	// Guard against full base games stating they bundle updates or DLC
	if strings.Contains(lowerName, "incl") || strings.Contains(lowerName, "with dlc") || strings.Contains(lowerName, "includes") {
		return false
	}

	if strings.Contains(lowerName, "update") || strings.Contains(lowerName, "hotfix") || (strings.Contains(lowerName, "patch") && !strings.Contains(lowerName, "dispatch") && !strings.Contains(lowerName, "despatch")) {
		return true
	}
	if strings.Contains(lowerName, "[upd") || strings.Contains(lowerName, "(upd") {
		return true
	}
	// Switch update Title ID hex (ends with 800)
	if strings.Contains(lowerName, "800]") || strings.Contains(lowerName, "800)") {
		if strings.Contains(lowerName, "[0100") || strings.Contains(lowerName, "(0100") {
			return true
		}
	}
	// Switch version tag [v65536] or higher
	if strings.Contains(lowerName, "[v65536]") || strings.Contains(lowerName, "[v131072]") || strings.Contains(lowerName, "[v196608]") || strings.Contains(lowerName, "[v262144]") {
		return true
	}

	for _, part := range strings.Split(lowerPath, "/") {
		if part == "updates" || part == "patches" {
			return true
		}
		if strings.HasPrefix(part, "_unpack") && strings.Contains(part, "update") {
			return true
		}
		if strings.Contains(part, "_update_") || strings.Contains(part, "-update-") || strings.Contains(part, " update ") {
			ext := strings.ToLower(filepath.Ext(filename))
			if ext == ".exe" || ext == ".pkg" || ext == ".msi" || ext == ".dmg" || ext == ".nsp" || ext == ".bin" {
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
		if strings.Contains(lowerPath, "/menu-simulation") || strings.Contains(lowerPath, "/mods/") || strings.Contains(lowerPath, "/steamapps/common/") || strings.Contains(lowerPath, "_data/") {
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

// StripUpdateSuffixFromTitle removes trailing "update â€¦" / "hotfix â€¦" version noise.
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
	reCamel              = regexp.MustCompile(`([a-z])([A-Z])`)
	reAcronym            = regexp.MustCompile(`([A-Z]+)([A-Z][a-z])`)
	reLetterDigit        = regexp.MustCompile(`([a-uw-zA-UW-Z])([0-9]+)`)
	reDigitLetter        = regexp.MustCompile(`([0-9]+)([a-zA-Z])`)
	rePreTags            = regexp.MustCompile(`(?i)\bmac\s*os\b|\bmacos\b`)
	reVersionPattern     = regexp.MustCompile(`(?i)\bv\d+(?:\.\d+)+(?:[a-z]\d*)?\b|\bbuild\s*\d+\b`)
	reTitleIdTag         = regexp.MustCompile(`(?i)\[[0-9a-f]{16}\]|\[?[a-z]{4}\d{5}\]?|\[(?:UPD|DLC|v\d+)\]`)
	reGeneralNoiseTags   = regexp.MustCompile(`(?i)\b(?:repack|fitgirl|dodi|elamigos|gog|iso|crackfix|onlinefix|direct\s*play|proper|earlyaccess|multi\d*|x64|x86)\b`)
	reTrailingSceneGroup = regexp.MustCompile(`(?i)(?:[-_.]\s*|\s+)(?:rune|codex|skidrow|flt|tenoke|goldberg|razor1911|fairlight|hoodlum|empress|cpy|reloaded|prophet|plaza|tinyiso|chronos|tiki|kaos|darck|xatab|selax|unleashed)\s*$`)
)

func CleanTitleFromFilename(filename string) string {
	base := filename
	ext := filepath.Ext(filename)
	lowerName := strings.ToLower(filename)
	if strings.HasSuffix(lowerName, ".nsp.hdf") {
		base = filename[:len(filename)-len(".nsp.hdf")]
	} else if StripExtensions[strings.ToLower(ext)] {
		base = strings.TrimSuffix(filename, ext)
	}

	// Remove title IDs and update flags
	base = reTitleIdTag.ReplaceAllString(base, " ")

	// Remove version tags (v1.0.4, build 1234)
	base = reVersionPattern.ReplaceAllString(base, " ")

	// Remove macOS before CamelCase splitting turns it into mac OS
	base = rePreTags.ReplaceAllString(base, " ")

	// Strip trailing scene release group if present (e.g. -RUNE, -TENOKE, .CODEX)
	base = reTrailingSceneGroup.ReplaceAllString(base, " ")

	// Split CamelCase, acronyms, and alphanumeric boundaries
	base = reCamel.ReplaceAllString(base, "$1 $2")
	base = reAcronym.ReplaceAllString(base, "$1 $2")
	base = reLetterDigit.ReplaceAllString(base, "$1 $2")
	base = reDigitLetter.ReplaceAllString(base, "$1 $2")

	cleaned := strings.ReplaceAll(base, ".", " ")
	cleaned = strings.ReplaceAll(cleaned, "_", " ")
	cleaned = strings.ReplaceAll(cleaned, "-", " ")
	cleaned = reGeneralNoiseTags.ReplaceAllString(cleaned, " ")
	cleaned = reTrailingSceneGroup.ReplaceAllString(cleaned, " ")
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
	if IsGenericInstallerName(filename) || strings.EqualFold(filename, "eboot.bin") || strings.EqualFold(filename, "ps3_disc.sfb") {
		rel := RelativeLibraryPath(fullPath, libraryPath)
		parts := strings.Split(rel, "/")
		if len(parts) > 1 {
			// Find nearest non-generic ancestor folder
			for i := len(parts) - 2; i >= 0; i-- {
				ancestor := parts[i]
				al := strings.ToLower(ancestor)

				if !GenericFolderNames[al] && !strings.HasPrefix(al, "app0") && !strings.Contains(al, "-app") {
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

	// 1. Walk up from immediate parent of candidatePath skipping generic folder names (e.g. bin, x64, Win64).
	firstNonGenericIdx := -1
	for i := len(parts) - 2; i >= 0; i-- {
		part := parts[i]
		pl := strings.ToLower(part)

		if !GenericFolderNames[pl] && !strings.HasPrefix(pl, "app0") && !strings.Contains(pl, "-app") {
			firstNonGenericIdx = i
			break
		}
	}

	// If all ancestor folders are generic (e.g. scanning single game directory directly where rel is "bin/x64/game.exe"),
	// the libraryPath itself is the game root.
	if firstNonGenericIdx < 0 {
		return libraryPath, filepath.Base(libraryPath)
	}

	// Check if this candidate folder is an internal engine project folder (e.g. Phoenix, End, b1, OakGame)
	// whose parent directory is the actual game root.
	resolvedIdx := firstNonGenericIdx
	if resolvedIdx > 0 {
		candidateFolder := strings.ToLower(parts[resolvedIdx])
		parentPart := parts[resolvedIdx-1]
		parentDir := filepath.Join(libraryPath, filepath.Join(parts[:resolvedIdx]...))

		isProjectFolder := KnownEngineProjectFolders[candidateFolder]
		if !isProjectFolder {
			// Check if parent directory on disk contains an "Engine" or "engine" folder
			if fi, err := os.Stat(filepath.Join(parentDir, "Engine")); err == nil && fi.IsDir() {
				isProjectFolder = true
			} else if fi, err := os.Stat(filepath.Join(parentDir, "engine")); err == nil && fi.IsDir() {
				isProjectFolder = true
			}
		}

		// Also check if candidate executable matches the parent directory name rather than candidateFolder,
		// or if candidateFolder is an engine subfolder echoing the parent game name (e.g. Portal 2/portal2 or Half-Life 2/hl2).
		if !isProjectFolder {
			exeStem := strings.ToLower(CleanTitleFromFilename(filepath.Base(candidatePath)))
			parentTitle := strings.ToLower(CleanTitleFromFilename(parentPart))
			candTitle := strings.ToLower(CleanTitleFromFilename(parts[resolvedIdx]))
			if parentTitle != "" && candTitle != "" && (parentTitle == candTitle || strings.Contains(parentTitle, candTitle) || strings.Contains(candTitle, parentTitle)) {
				isProjectFolder = true
			} else if parentTitle != "" && exeStem != "" && (parentTitle == exeStem || strings.Contains(parentTitle, exeStem) || strings.Contains(exeStem, parentTitle)) {
				if candTitle != exeStem {
					isProjectFolder = true
				}
			}
		}

		if isProjectFolder && !ContainerFolderNames[strings.ToLower(parentPart)] {
			resolvedIdx = resolvedIdx - 1
		}
	}

	sub := parts[:resolvedIdx+1]
	fullRoot := filepath.Join(libraryPath, filepath.Join(sub...))
	return fullRoot, parts[resolvedIdx]
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

// AttachOtixSidecar is disabled: sidecar files (.otix) are no longer supported or read.
func AttachOtixSidecar(hf *HostedFile, libraryPath string) {
}

func parsePS5ParamJSON(paramJsonPath string) (string, string) {
	data, err := os.ReadFile(paramJsonPath)
	if err != nil {
		return "", ""
	}
	var raw struct {
		TitleID             string                 `json:"titleId"`
		LocalizedParameters map[string]interface{} `json:"localizedParameters"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return "", ""
	}
	titleId := strings.TrimSpace(raw.TitleID)
	titleName := ""

	if raw.LocalizedParameters != nil {
		defaultLang := "en-GB"
		if dl, ok := raw.LocalizedParameters["defaultLanguage"].(string); ok && dl != "" {
			defaultLang = dl
		}
		candidates := []string{defaultLang, "en-GB", "en-US", "en", "default"}
		for _, lang := range candidates {
			if entry, ok := raw.LocalizedParameters[lang].(map[string]interface{}); ok {
				if tn, ok := entry["titleName"].(string); ok && strings.TrimSpace(tn) != "" {
					titleName = strings.TrimSpace(tn)
					break
				}
			}
		}
		if titleName == "" {
			for _, v := range raw.LocalizedParameters {
				if entry, ok := v.(map[string]interface{}); ok {
					if tn, ok := entry["titleName"].(string); ok && strings.TrimSpace(tn) != "" {
						titleName = strings.TrimSpace(tn)
						break
					}
				}
			}
		}
	}
	return titleId, titleName
}

// detectPS5GameDump inspects a directory to check if it represents a PS5 game dump package.
// It looks for sce_sys/param.json, eboot.bin, app0 subdirectories, or PS5 indicators,
// and returns (isPS5, targetExePath, titleId, titleName).
func detectPS5GameDump(dir string) (bool, string, string, string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false, "", "", ""
	}

	dirLower := strings.ToLower(filepath.Base(dir))
	var hasEboot bool
	var ebootPath string
	var paramJsonPath string
	var appSubdir string
	var pakPath string
	var hasPpsaFile bool
	var hasPs5InName bool = strings.Contains(dirLower, "ps5") || strings.Contains(dirLower, "ppsa")

	for _, e := range entries {
		nameLower := strings.ToLower(e.Name())
		if !e.IsDir() {
			if nameLower == "eboot.bin" {
				hasEboot = true
				ebootPath = filepath.Join(dir, e.Name())
			} else if nameLower == "param.json" {
				paramJsonPath = filepath.Join(dir, e.Name())
			} else if strings.HasSuffix(nameLower, ".pak") && strings.Contains(nameLower, "ps5") {
				pakPath = filepath.Join(dir, e.Name())
			} else if strings.HasPrefix(nameLower, "ppsa") {
				hasPpsaFile = true
			}
		} else {
			if nameLower == "sce_sys" {
				pj := filepath.Join(dir, e.Name(), "param.json")
				if _, err := os.Stat(pj); err == nil {
					paramJsonPath = pj
				}
			} else if nameLower == "app0" || strings.HasPrefix(nameLower, "app0") ||
				strings.HasPrefix(nameLower, "ppsa") || strings.Contains(nameLower, "app0") {
				appSubdir = e.Name()
			}
		}
	}

	// Check appSubdir for param.json if not found in root
	if paramJsonPath == "" && appSubdir != "" {
		pj := filepath.Join(dir, appSubdir, "sce_sys", "param.json")
		if _, err := os.Stat(pj); err == nil {
			paramJsonPath = pj
		} else {
			pj2 := filepath.Join(dir, appSubdir, "param.json")
			if _, err2 := os.Stat(pj2); err2 == nil {
				paramJsonPath = pj2
			}
		}
	}

	// Check appSubdir for eboot.bin if not found in root
	if !hasEboot && appSubdir != "" {
		eb := filepath.Join(dir, appSubdir, "eboot.bin")
		if _, err := os.Stat(eb); err == nil {
			hasEboot = true
			ebootPath = eb
		}
	}

	var titleId, titleName string
	if paramJsonPath != "" {
		titleId, titleName = parsePS5ParamJSON(paramJsonPath)
	}


	isPS5 := false
	if strings.HasPrefix(strings.ToUpper(titleId), "PPSA") {
		isPS5 = true
	} else if paramJsonPath != "" && (hasPs5InName || hasEboot || strings.Contains(dirLower, "app0")) {
		isPS5 = true
	} else if hasEboot && (hasPs5InName || hasPpsaFile || strings.Contains(dirLower, "app0") || appSubdir != "") {
		isPS5 = true
	} else if pakPath != "" && (hasPs5InName || hasPpsaFile) {
		isPS5 = true
	}

	if !isPS5 {
		return false, "", "", ""
	}

	targetExe := ebootPath
	if targetExe == "" {
		if pakPath != "" {
			targetExe = pakPath
		} else if paramJsonPath != "" {
			targetExe = paramJsonPath
		} else {
			targetExe = filepath.Join(dir, "eboot.bin")
		}
	}

	return true, targetExe, titleId, titleName
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
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
	File  *HostedFile `json:"file,omitempty"`
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

	pipeline := newScanPipeline(si, deep)
	for _, lib := range pipeline.libs {
		pipeline.scanLibrary(lib)
	}
	return pipeline.finalize()
}
