package organize

import (
	"encoding/json"

	"fmt"

	"io"

	"io/fs"

	"os"

	"path/filepath"

	"regexp"

	"strings"

	"sync"

	"github.com/dksilv4/otix/node/internal/otixmeta"
)

func safeRel(baseDir, targetDir string) (string, error) {
	b := strings.TrimRight(filepath.Clean(baseDir), "/\\")
	t := strings.TrimRight(filepath.Clean(targetDir), "/\\")
	if strings.EqualFold(b, t) {
		return ".", nil
	}
	return filepath.Rel(b, t)
}

type PreviewItem struct {
	SourcePath string `json:"sourcePath"`

	SourceFilename string `json:"sourceFilename"`

	Type string `json:"type"`

	Matched bool `json:"matched"`

	Extracted map[string]string `json:"extracted"`

	TargetPath string `json:"targetPath"`

	FoldersToCreate []string `json:"foldersToCreate"`

	Status string `json:"status"` // "rename_and_move", "already_organized", "conflict", "sample", "secondary_update", "secondary_dlc", "secondary_crack", "container_package"

	Anomalies []string `json:"anomalies,omitempty"`

	SuggestedRenames map[string]string `json:"suggestedRenames,omitempty"`

	Health string `json:"health,omitempty"`

	SourceSubdirectory string `json:"sourceSubdirectory,omitempty"`

	TargetSubdirectory string `json:"targetSubdirectory,omitempty"`

	Subdirectories []string `json:"subdirectories,omitempty"`
}

type ExecuteItem struct {
	SourcePath string `json:"sourcePath"`

	TargetPath string `json:"targetPath"`
}

func (e *ExecuteItem) UnmarshalJSON(data []byte) error {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if v, ok := raw["sourcePath"].(string); ok && v != "" {
		e.SourcePath = v
	} else if v, ok := raw["source_path"].(string); ok && v != "" {
		e.SourcePath = v
	}
	if v, ok := raw["targetPath"].(string); ok && v != "" {
		e.TargetPath = v
	} else if v, ok := raw["target_path"].(string); ok && v != "" {
		e.TargetPath = v
	}
	return nil
}

type ExecuteResult struct {
	SourcePath string `json:"sourcePath"`

	TargetPath string `json:"targetPath"`

	Success bool `json:"success"`

	Error string `json:"error,omitempty"`
}

var (
	noiseExecutablePatterns = []string{

		"unins000", "uninstall", "uninst",

		"crashreporter", "crash_reporter", "crashreport", "crashhandler", "crash_handler",

		"unitycrashhandler", "unitycrashhandler32", "unitycrashhandler64", "crashpad", "crashing",

		"vcredist", "dxsetup", "dxwebsetup", "directx", "dotnetfx", "oalinst", "physx", "redist",

		"easyanticheat", "battleye", "epic_online_services", "eosbootstrapper",

		"unrealcefsubprocessor", "cefsimple", "dedicatedserver", "benchmark",

		"bugreporter", "restarter", "dowser", "quicksfv", "launcher-installer",

		"ereg", "easyinfo",
	}

	noiseDirectoryNames = map[string]bool{
		"_commonredist": true, "commonredist": true, "redist": true, "_redist": true,
		"support": true, "directx": true, "vcredist": true, "vc_redist": true,
		"prerequisites": true, "prereq": true, "engine": true, "crashreports": true,
		"mono": true, "dependencies": true, ".git": true, "__macosx": true,
		"content": true, "assets": true, "textures": true, "sounds": true, "audio": true,
		"sound": true, "music": true, "video": true, "movies": true, "shaders": true,
		"levels": true, "maps": true, "res": true, "resources": true,
		"localization": true, "languages": true, "locale": true, "save": true, "saves": true,
		"cache": true, "runtimetools": true, "md5": true, "emulators": true, "node_modules": true,
		"data": true, "gamedata": true, "streamingassets": true, "plugins": true,
		"mods": true, "generated": true, "public": true, "scripts": true,
		"paks": true, "pak": true, "bundles": true, "cooked": true, "cookedpc": true,
		"logs": true, "log": true, "temp": true, "tmp": true,
		"$recycle.bin": true, "system volume information": true,
	}

	knownGameSubdirs = map[string]bool{
		"bin": true, "binaries": true, "bin32": true, "bin64": true,
		"x64": true, "x86": true, "win64": true, "win32": true,
		"system": true, "shipping": true, "retail": true, "game": true,
		"release": true, "app": true, "build": true,
	}

	collectionDirectoryNames = map[string]bool{
		"downloads": true, "download": true, "torrents": true, "torrent": true,
		"unsorted": true, "incoming": true, "completed": true, "staging": true,
		"games": true, "my games": true, "pc": true, "pc games": true,
		"repacks": true, "repack": true, "installers": true, "installer": true,
		"updates": true, "update": true, "patches": true, "patch": true,
		"dlc": true, "dlcs": true, "cracks": true, "crack": true,
		"updates & cracks": true, "updates and cracks": true, "updates & dlc": true,
		"cracked": true, "portable": true, "todo": true,
		"old_hard_drive_backup": true, "backup": true, "backups": true,
		"roms": true, "rom": true, "emulation": true, "emulators": true,
		"extracted": true, "unpacked": true, "temp": true, "tmp": true,
		"steam": true, "steamapps": true, "common": true, "userdata": true,
		"gog games": true, "gog galaxy": true, "gog installers": true,
		"epic games": true, "launcher": true, "portal": true,
		"ea games": true, "origin": true, "origin games": true,
		"ubisoft": true, "ubisoft game launcher": true,
		"battle.net": true, "xboxgames": true, "xbox": true,
		"library": true, "noise": true,
	}

	romExtensions = map[string]string{

		".nsp": "Switch", ".xci": "Switch", ".nsz": "Switch", ".xcz": "Switch",

		".3ds": "3DS", ".cia": "3DS", ".cxi": "3DS", ".nds": "NDS",

		".z64": "N64", ".n64": "N64", ".v64": "N64", ".rvz": "Wii",

		".wbfs": "Wii", ".gcz": "GameCube", ".chd": "PS2", ".pbp": "PSP",

		".vpk": "PSVita", ".sfc": "SNES", ".smc": "SNES", ".nes": "NES",

		".gba": "GBA", ".gbc": "GBC", ".gb": "GB", ".md": "Genesis",

		".gen": "Genesis", ".pkg": "PS3",
	}

	isoExtensions = map[string]bool{

		".iso": true, ".img": true, ".cue": true, ".mdf": true, ".mds": true, ".nrg": true,
	}

	ignoredExtensions = map[string]bool{

		// Artwork & media

		".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".ico": true,

		".bmp": true, ".gif": true, ".svg": true, ".tga": true, ".dds": true,

		// Metadata & sidecars

		".otix": true, ".ini": true, ".xml": true, ".json": true, ".db": true,

		".log": true, ".cfg": true, ".config": true, ".txt": true, ".nfo": true,

		".diz": true, ".url": true, ".sfv": true, ".sha": true, ".sha256": true,

		".md5": true, ".v": true, ".info": true, ".manifest": true,

		// Internal binaries & engine data

		".dll": true, ".so": true, ".dylib": true, ".pdb": true, ".lib": true,

		".assets": true, ".ress": true, ".resource": true, ".pak": true, ".dat": true,

		".idx": true, ".toc": true, ".sb": true, ".cas": true,

		// Temporary & OS metadata

		".tmp": true, ".part": true, ".crdownload": true, ".ds_store": true,
	}

	ignoredFilenames = map[string]bool{

		"folder.jpg": true, "cover.jpg": true, "icon.ico": true, "desktop.ini": true,

		".otix": true, "thumbs.db": true, ".ds_store": true,
	}
)

type sampleDef struct {
	RawName string

	Ext string

	Platform string

	Category string

	IsDir bool

	SubDir string
}

var sampleReleases = []sampleDef{

	{RawName: "Cyberpunk.2077.v2.12.REPACK-ELAMIGOS", Ext: "iso", Platform: "PC", Category: "iso", SubDir: "Downloads"},

	{RawName: "Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE", Ext: "iso", Platform: "PC", Category: "iso", SubDir: "Downloads"},

	{RawName: "The.Witcher.3.Wild.Hunt.GOTY-GOG", Ext: "iso", Platform: "PC", Category: "iso", SubDir: "Downloads"},

	{RawName: "Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL", Ext: "", Platform: "PC", Category: "folder_package", IsDir: true, SubDir: "Downloads"},

	{RawName: "Hollow Knight", Ext: "", Platform: "PC", Category: "folder_package", IsDir: true, SubDir: "Games"},

	{RawName: "Hades.II.v0.91024-EarlyAccess", Ext: "exe", Platform: "PC", Category: "game_exe", SubDir: "Downloads/Hades 2"},

	{RawName: "Cyberpunk 2077 update 2.12 - 2.13", Ext: "exe", Platform: "PC", Category: "update", SubDir: "Downloads/Cyberpunk 2077/Updates"},

	{RawName: "Elden Ring update 1.12.3 - 1.13.0", Ext: "exe", Platform: "PC", Category: "update", SubDir: "Downloads/Elden Ring/Updates"},

	{RawName: "The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0]", Ext: "nsp", Platform: "Switch", Category: "rom", SubDir: "ROMs/Switch"},

	{RawName: "The Legend of Zelda Tears of the Kingdom [0100F2C0115B6800][v131072][UPD]", Ext: "nsp", Platform: "Switch", Category: "update", SubDir: "ROMs/Switch"},

	{RawName: "Super Smash Bros Ultimate [01006A800016F001][v0][DLC]", Ext: "nsp", Platform: "Switch", Category: "dlc", SubDir: "ROMs/Switch"},

	{RawName: "Super Mario 64 (USA)", Ext: "z64", Platform: "N64", Category: "rom", SubDir: "ROMs/N64"},

	{RawName: "God of War II (USA)", Ext: "chd", Platform: "PS2", Category: "rom", SubDir: "ROMs/PS2"},

	{RawName: "Pokemon - Emerald Version (USA, Europe)", Ext: "gba", Platform: "GBA", Category: "rom", SubDir: "ROMs/GBA"},
}

var illegalPathChars = regexp.MustCompile(`[\\/:*?"<>|]`)
var crackNameRegex = regexp.MustCompile(`(?i)(?:^|[\s._\-\[(])(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)(?:[\s._\-\])]|$)`)

func isCrackName(name string) bool {
	return crackNameRegex.MatchString(name) || strings.Contains(strings.ToLower(name), "+crack")
}

func isCollectionFolder(name string) bool {
	clean := strings.ToLower(strings.TrimSpace(name))
	if collectionDirectoryNames[clean] {
		return true
	}
	if strings.Contains(clean, "updates & cracks") || strings.Contains(clean, "updates and cracks") ||
		strings.Contains(clean, "updates & dlc") || strings.Contains(clean, "updates and dlc") {
		return true
	}
	return false
}

func isGenericContainerName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	if lower == "crack" || lower == "cracks" || lower == "updates" || lower == "update" || lower == "dlc" || lower == "dlcs" {
		return true
	}
	return isCollectionFolder(lower)
}

func resolveGameParentDir(filePath, baseDir string) string {
	curr := filepath.Dir(filePath)
	cleanBase := filepath.Clean(baseDir)
	for curr != "" && curr != "." && filepath.Clean(curr) != cleanBase {
		baseName := filepath.Base(curr)
		lower := strings.ToLower(baseName)
		if !knownGameSubdirs[lower] && !isGenericContainerName(lower) && !isCollectionFolder(lower) {
			return baseName
		}
		parent := filepath.Dir(curr)
		if parent == curr || parent == "." || filepath.Clean(parent) == cleanBase {
			break
		}
		curr = parent
	}
	return filepath.Base(filepath.Dir(filePath))
}

func sanitizePathTitle(title string) string {
	cleaned := illegalPathChars.ReplaceAllString(title, " - ")
	cleaned = regexp.MustCompile(`\s{2,}`).ReplaceAllString(cleaned, " ")
	return strings.TrimSpace(cleaned)
}

func getFolderTemplate(template string) string {
	if template == "" {
		return "{Title} [{Platform}]"
	}
	parts := strings.Split(template, "/")
	last := parts[len(parts)-1]
	lastLower := strings.ToLower(last)
	if strings.Contains(lastLower, ".{ext}") ||
		strings.Contains(lastLower, "{originalname}") ||
		strings.Contains(lastLower, ".iso") ||
		strings.Contains(lastLower, ".exe") ||
		(strings.Contains(lastLower, ".") && !strings.Contains(lastLower, "{title}")) {
		if len(parts) > 1 {
			return strings.Join(parts[:len(parts)-1], "/")
		}
	}
	return template
}

func findOtixSidecar(dir string) (*otixmeta.Sidecar, string) {
	if sc, err := otixmeta.Read(dir); err == nil && sc != nil && (sc.MediaID != "" || sc.Title != "") {
		return sc, otixmeta.Path(dir)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, ""
	}
	var nonNoiseSubdirs []os.DirEntry
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		nameLower := strings.ToLower(e.Name())
		if noiseDirectoryNames[nameLower] || strings.HasPrefix(nameLower, "$") || strings.HasPrefix(nameLower, ".") {
			continue
		}
		nonNoiseSubdirs = append(nonNoiseSubdirs, e)
	}
	// CRITICAL: Only look down into a child directory if there is EXACTLY ONE child directory.
	// If there are multiple child directories, dir is a parent collection (e.g. containing multiple games).
	// Adopting one child's sidecar causes the entire collection (and all sibling games) to be renamed
	// and organized as that single child, putting other games inside it!
	if len(nonNoiseSubdirs) == 1 {
		subPath := filepath.Join(dir, nonNoiseSubdirs[0].Name())
		if sc, err := otixmeta.Read(subPath); err == nil && sc != nil && (sc.MediaID != "" || sc.Title != "") {
			return sc, otixmeta.Path(subPath)
		}
	}
	return nil, ""
}

func platformFromSidecar(sc *otixmeta.Sidecar, fallback string) string {
	if sc != nil && len(sc.Platforms) > 0 {
		// 1. Prioritize PC if present anywhere in platforms
		for _, p := range sc.Platforms {
			name := ""
			if n, ok := p["name"].(string); ok {
				name = n
			}
			slug := ""
			if s, ok := p["slug"].(string); ok {
				slug = s
			}
			pUpper := strings.ToUpper(name)
			slugUpper := strings.ToUpper(slug)

			if strings.Contains(pUpper, "PC") || strings.Contains(pUpper, "WINDOWS") || strings.Contains(pUpper, "LINUX") || strings.Contains(pUpper, "MAC") ||
				strings.Contains(slugUpper, "WIN") || strings.Contains(slugUpper, "PC") || strings.Contains(slugUpper, "LINUX") || strings.Contains(slugUpper, "MAC") {
				return "PC"
			}
		}

		// 2. If no PC platform, check console platforms in order
		for _, p := range sc.Platforms {
			name := ""
			if n, ok := p["name"].(string); ok {
				name = n
			}
			slug := ""
			if s, ok := p["slug"].(string); ok {
				slug = s
			}
			pUpper := strings.ToUpper(name)
			slugUpper := strings.ToUpper(slug)
			combined := pUpper + " " + slugUpper
			if strings.Contains(combined, "SWITCH") || strings.Contains(combined, "NSW") {
				return "Switch"
			} else if strings.Contains(combined, "PS5") || strings.Contains(combined, "PLAYSTATION 5") || strings.Contains(combined, "PLAYSTATION-5") {
				return "PS5"
			} else if strings.Contains(combined, "PS4") || strings.Contains(combined, "PLAYSTATION 4") || strings.Contains(combined, "PLAYSTATION-4") {
				return "PS4"
			} else if strings.Contains(combined, "PS3") || strings.Contains(combined, "PLAYSTATION 3") || strings.Contains(combined, "PLAYSTATION-3") {
				return "PS3"
			} else if strings.Contains(combined, "3DS") {
				return "3DS"
			} else if strings.Contains(combined, "WII U") || strings.Contains(combined, "WIIU") || strings.Contains(combined, "WII-U") {
				return "WiiU"
			} else if strings.Contains(combined, "WII") {
				return "Wii"
			} else if strings.Contains(combined, "XBOX 360") || strings.Contains(combined, "XBOX-360") || strings.Contains(combined, "XBOX360") {
				return "Xbox360"
			} else if strings.Contains(combined, "XBOX ONE") || strings.Contains(combined, "XBOX-ONE") || strings.Contains(combined, "XBOX SERIES") || strings.Contains(combined, "SERIES-X") {
				return "Xbox"
			} else if strings.Contains(combined, "XBOX") {
				return "Xbox"
			}
			if name != "" {
				return name
			}
		}
	}
	if fallback != "" {
		return fallback
	}
	return "PC"
}

func yearFromSidecar(sc *otixmeta.Sidecar, rawName string) string {
	if y := ExtractYear(rawName); y > 1980 && y <= 2030 {
		return fmt.Sprintf("%d", y)
	}
	if sc != nil && sc.Title != "" {
		if y := ExtractYear(sc.Title); y > 1980 && y <= 2030 {
			return fmt.Sprintf("%d", y)
		}
	}
	return ""
}

func isNoise(filename, fullPath string) bool {
	if filename == "" || fullPath == "" {
		return false
	}

	lowerName := strings.ToLower(filename)
	for _, p := range noiseExecutablePatterns {
		if strings.Contains(lowerName, p) {
			return true
		}
	}

	cleanPath := filepath.Clean(fullPath)
	checkPath := cleanPath

	tempCandidates := []string{os.TempDir()}
	if t := os.Getenv("TEMP"); t != "" {
		tempCandidates = append(tempCandidates, t)
	}
	if t := os.Getenv("TMP"); t != "" {
		tempCandidates = append(tempCandidates, t)
	}

	for _, td := range tempCandidates {
		if td == "" {
			continue
		}
		cleanTemp := strings.ToLower(filepath.Clean(td))
		cleanFull := strings.ToLower(checkPath)
		if strings.HasPrefix(cleanFull, cleanTemp) {
			trimmed := checkPath[len(cleanTemp):]
			trimmed = strings.TrimPrefix(trimmed, "/")
			trimmed = strings.TrimPrefix(trimmed, "\\")
			checkPath = trimmed
			break
		} else if rel, err := filepath.Rel(cleanTemp, cleanFull); err == nil && !strings.HasPrefix(rel, "..") {
			checkPath = rel
			break
		}
	}

	parts := strings.FieldsFunc(checkPath, func(r rune) bool {
		return r == '/' || r == '\\'
	})
	if len(parts) <= 1 {
		return false
	}

	// Remove trailing filename from directory segments
	dirs := parts[:len(parts)-1]

	// Determine starting index of directories that are inside the game root.
	// Any directory preceding a known game library collection (e.g. Games, Torrents, Downloads)
	// or user profile / OS root cannot be an interior noise directory.
	startIdx := 0

	for i := len(dirs) - 1; i >= 0; i-- {
		lowerDir := strings.ToLower(dirs[i])
		if noiseDirectoryNames[lowerDir] {
			continue // noise subdirectories (temp, tmp, redist, etc.) are not collection roots
		}
		if collectionDirectoryNames[lowerDir] {
			// Found collection folder. The game directory is at i+1.
			// Interior game subdirectories start at i+2.
			if i+2 <= len(dirs) {
				startIdx = i + 2
			} else {
				startIdx = len(dirs)
			}
			break
		}
	}

	if startIdx == 0 {
		maxInteriorDepth := 3
		if len(dirs) > maxInteriorDepth {
			startIdx = len(dirs) - maxInteriorDepth
		}
	}

	for i := startIdx; i < len(dirs); i++ {
		lowerPart := strings.ToLower(dirs[i])

		// Skip user profile folders (e.g. C:\Users\temp, /home/temp)
		if i >= 1 {
			parentLower := strings.ToLower(dirs[i-1])
			if parentLower == "users" || parentLower == "home" {
				continue
			}
		}

		// Skip OS temp directories (e.g. AppData\Local\Temp or Windows\Temp)
		if (lowerPart == "temp" || lowerPart == "tmp") &&
			((i >= 2 && strings.ToLower(dirs[i-1]) == "local" && strings.ToLower(dirs[i-2]) == "appdata") ||
				(i >= 1 && strings.ToLower(dirs[i-1]) == "windows")) {
			continue
		}

		// Skip system directories
		if lowerPart == "windows" || lowerPart == "program files" || lowerPart == "program files (x86)" ||
			lowerPart == "appdata" || lowerPart == "local" || lowerPart == "users" {
			continue
		}

		if noiseDirectoryNames[lowerPart] {
			return true
		}
	}

	return false
}

func isGameExeName(name, fullPath string) bool {
	lower := strings.ToLower(name)
	if !strings.HasSuffix(lower, ".exe") {
		return false
	}
	if isNoise(name, fullPath) {
		return false
	}
	if strings.Contains(lower, "setup") || strings.Contains(lower, "installer") ||
		strings.Contains(lower, "update") || strings.Contains(lower, "patch") ||
		strings.Contains(lower, "hotfix") || strings.Contains(lower, "dlc") ||
		strings.Contains(lower, "addon") || isCrackName(lower) {
		return false
	}
	return true
}

func scanForGameExe(dirPath string) bool {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return false
	}
	var nonNoiseSubdirs []os.DirEntry
	for _, e := range entries {
		eLower := strings.ToLower(e.Name())
		if e.IsDir() {
			if !noiseDirectoryNames[eLower] && !strings.HasPrefix(eLower, "$") && !strings.HasPrefix(eLower, ".") && eLower != "updates" && eLower != "dlc" && eLower != "crack" {
				nonNoiseSubdirs = append(nonNoiseSubdirs, e)
			}
		} else {
			if isGameExeName(e.Name(), filepath.Join(dirPath, e.Name())) {
				return true
			}
		}
	}
	for _, sd := range nonNoiseSubdirs {
		sdLower := strings.ToLower(sd.Name())
		if len(nonNoiseSubdirs) > 1 && !knownGameSubdirs[sdLower] {
			continue
		}
		subPath := filepath.Join(dirPath, sd.Name())
		subEntries, sErr := os.ReadDir(subPath)
		if sErr != nil {
			continue
		}
		var deeperSubdirs []os.DirEntry
		for _, se := range subEntries {
			seLower := strings.ToLower(se.Name())
			if se.IsDir() {
				if !noiseDirectoryNames[seLower] && !strings.HasPrefix(seLower, "$") && !strings.HasPrefix(seLower, ".") && seLower != "updates" && seLower != "dlc" && seLower != "crack" {
					deeperSubdirs = append(deeperSubdirs, se)
				}
			} else {
				if isGameExeName(se.Name(), filepath.Join(subPath, se.Name())) {
					return true
				}
			}
		}
		for _, dsd := range deeperSubdirs {
			dsdLower := strings.ToLower(dsd.Name())
			if len(deeperSubdirs) > 1 && !knownGameSubdirs[dsdLower] {
				continue
			}
			deeperPath := filepath.Join(subPath, dsd.Name())
			deeperEntries, dErr := os.ReadDir(deeperPath)
			if dErr != nil {
				continue
			}
			for _, de := range deeperEntries {
				if !de.IsDir() && isGameExeName(de.Name(), filepath.Join(deeperPath, de.Name())) {
					return true
				}
			}
		}
	}
	return false
}

func PreviewOrganization(dir string, template string, sample bool) ([]PreviewItem, error) {

	if template == "" {

		template = "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"

	}

	cleanDir := filepath.Clean(dir)

	// If sample mode requested, return simulated realistic releases

	if sample || cleanDir == "" || cleanDir == "." {

		return generateSamplePreviews(cleanDir, template), nil

	}

	// Verify directory exists

	info, err := os.Stat(cleanDir)

	if err != nil || !info.IsDir() {

		// Return samples gracefully if directory not found on host

		return generateSamplePreviews(cleanDir, template), nil

	}

	items := make([]PreviewItem, 0)

	targetPaths := make(map[string]bool)

	const maxOrganizeScanDepth = 12

	// Scan directory recursively up to maxOrganizeScanDepth
	_ = filepath.WalkDir(cleanDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if d.IsDir() {
			nameLower := strings.ToLower(d.Name())
			if noiseDirectoryNames[nameLower] || strings.HasPrefix(nameLower, "$") || strings.HasPrefix(nameLower, ".") {
				return filepath.SkipDir
			}

			if nameLower == "updates" || nameLower == "dlc" || nameLower == "support" || nameLower == "_commonredist" || isCollectionFolder(nameLower) {
				return nil
			}

			// If directory within cleanDir, check if it's a container folder package
			rel, _ := safeRel(cleanDir, path)
			if rel != "." && strings.Count(rel, string(filepath.Separator)) <= maxOrganizeScanDepth {
				// Read immediate children of this subfolder
				children, rErr := os.ReadDir(path)

				if rErr == nil && len(children) > 0 {

					hasSetup := false

					hasBin := false

					hasGameExe := false

					hasCrackDll := false

					isConsolePackage := false

					consolePlatform := ""

					var anomalies []string

					folderLower := strings.ToLower(d.Name())

					isElAmigos := strings.Contains(folderLower, "elamigos")

					suggestedRenames := make(map[string]string)

					health := "HEALTHY"

					for _, c := range children {

						cName := strings.ToLower(c.Name())

						if cName == "setup.exe" || cName == "installer.exe" || (strings.HasPrefix(cName, "setup") && strings.HasSuffix(cName, ".exe")) || strings.HasSuffix(cName, "setup.exe") {

							hasSetup = true

						}

						if strings.HasSuffix(cName, ".bin") || strings.HasSuffix(cName, ".cab") || strings.HasSuffix(cName, ".doi") || strings.Contains(cName, ".bin.") || strings.Contains(cName, ".bin(") {

							hasBin = true

						}

						if strings.HasSuffix(cName, ".exe") && !isNoise(cName, "") && !strings.Contains(cName, "setup") && !strings.Contains(cName, "installer") {

							hasGameExe = true

						}

						if cName == "steam_api64.dll" || cName == "steam_api.dll" || cName == "steam_emu.ini" || cName == "rune.ini" || cName == "onlinefix.ini" {

							hasCrackDll = true

						}

						if cName == "ps3_game" || cName == "ps3_disc.sfb" {

							isConsolePackage = true

							consolePlatform = "PS3"

						}

						if cName == "sce_sys" {

							isConsolePackage = true

							consolePlatform = "PS4"

						}

						if isElAmigos {

							if strings.Contains(cName, " (1).bin") {

								canonical := strings.ReplaceAll(c.Name(), " (1).bin", ".bin")

								suggestedRenames[c.Name()] = canonical

								anomalies = append(anomalies, fmt.Sprintf("Duplicate name collision: %s (installer will fail until renamed to %s)", c.Name(), canonical))

							} else if (strings.HasSuffix(cName, ".bin") || strings.Contains(cName, ".bin")) && !strings.HasPrefix(cName, "elamigos-") && !strings.HasPrefix(cName, "elamigos.") {

								chunk := "1"

								for i := 1; i <= 99; i++ {

									if strings.Contains(cName, fmt.Sprintf("%d", i)) {

										chunk = fmt.Sprintf("%d", i)

										break

									}

								}

								canonical := fmt.Sprintf("elamigos-%s.bin", chunk)

								suggestedRenames[c.Name()] = canonical

								anomalies = append(anomalies, fmt.Sprintf("Missing 'elamigos-' prefix: %s (installer will fail until renamed to %s)", c.Name(), canonical))

							}

							if strings.HasSuffix(cName, ".part") || strings.HasSuffix(cName, ".tmp") {

								anomalies = append(anomalies, fmt.Sprintf("Incomplete download part: %s (installer will fail)", c.Name()))

							}

						}

					}

					for _, a := range anomalies {

						if strings.Contains(a, "Incomplete download part") {

							health = "INCOMPLETE_DOWNLOAD"

							break

						}

						if len(suggestedRenames) > 0 {

							health = "CORRECTABLE_ANOMALY"

						}

					}

					sc, _ := findOtixSidecar(path)

					hasIso := false
					for _, c := range children {
						if isoExtensions[strings.ToLower(filepath.Ext(c.Name()))] {
							hasIso = true
							break
						}
					}

					isGenericContainer := isGenericContainerName(folderLower) || isCollectionFolder(d.Name())
					if isGenericContainer {
						return nil
					}

					isCrackFolder := (hasCrackDll && (strings.Contains(folderLower, "crack") || strings.Contains(folderLower, "codex") || strings.Contains(folderLower, "rune") || isElAmigos)) ||
						isCrackName(folderLower) || folderLower == "onlinefix" || folderLower == "nocd"

					var nonNoiseSubdirs []os.DirEntry
					var nonNoiseFiles []os.DirEntry
					for _, c := range children {
						cLower := strings.ToLower(c.Name())
						if c.IsDir() {
							if !noiseDirectoryNames[cLower] && !strings.HasPrefix(cLower, "$") && !strings.HasPrefix(cLower, ".") {
								nonNoiseSubdirs = append(nonNoiseSubdirs, c)
							}
						} else {
							if !strings.HasSuffix(cLower, ".nfo") && !strings.HasSuffix(cLower, ".sfv") && !strings.HasSuffix(cLower, ".txt") && !strings.HasSuffix(cLower, ".url") && cLower != ".otix" {
								nonNoiseFiles = append(nonNoiseFiles, c)
							}
						}
					}

					actualPath := path
					actualName := d.Name()

					// Unwrap single-child redundant wrapper folders
					if len(nonNoiseSubdirs) == 1 && len(nonNoiseFiles) == 0 && !hasSetup && !isCrackFolder {
						singleChild := nonNoiseSubdirs[0]
						childLower := strings.ToLower(singleChild.Name())
						genericFolderNames := map[string]bool{
							"bin": true, "x64": true, "win64": true, "win32": true, "data": true,
							"content": true, "engine": true, "system": true, "updates": true, "dlc": true, "crack": true,
						}
						if !genericFolderNames[childLower] && !isCollectionFolder(childLower) {
							childPath := filepath.Join(path, singleChild.Name())
							if scanForGameExe(childPath) {
								actualPath = childPath
								actualName = singleChild.Name()
								hasGameExe = true
							}
						}
					}

					// If no direct game exe, scan subdirectories (bin/, x64/, system/) up to 2 levels deep
					if !hasGameExe && !isGenericContainer && !knownGameSubdirs[folderLower] {
						hasGameExe = scanForGameExe(actualPath)
					}

					if actualPath != path {
						if innerSc, _ := findOtixSidecar(actualPath); innerSc != nil && (innerSc.MediaID != "" || innerSc.Title != "") {
							sc = innerSc
						}
					}
					isLinked := sc != nil && (sc.MediaID != "" || sc.Title != "")

					isPcPackage := (hasSetup && hasBin) || hasCrackDll || (hasGameExe && !isConsolePackage) || hasIso
					isPackage := !isGenericContainer && !knownGameSubdirs[folderLower] && (isLinked ||
						isCrackFolder ||
						(hasSetup && hasBin) ||
						isConsolePackage ||
						hasIso ||
						(hasGameExe && (len(nonNoiseSubdirs) > 0 || len(children) >= 2 || hasCrackDll)))

					if isPackage {
						var release ParsedRelease
						if isLinked {
							t := sc.Title
							if t == "" {
								t = CleanGameTitle(actualName)
							}
							t = sanitizePathTitle(CleanGameTitle(t))
							plat := platformFromSidecar(sc, consolePlatform)
							if isPcPackage && !isConsolePackage {
								plat = "PC"
							}
							y := yearFromSidecar(sc, actualName)
							if y == "" && actualName != d.Name() {
								y = yearFromSidecar(sc, d.Name())
							}
							release = ParsedRelease{
								Title:      t,
								CleanTitle: t,
								Platform:   plat,
								Year:       y,
								RawName:    actualName,
							}
						} else {
							release = ParseReleaseName(actualName)
							if actualName != d.Name() {
								parentRel := ParseReleaseName(d.Name())
								if release.Title == "" {
									release.Title = parentRel.Title
									release.CleanTitle = parentRel.CleanTitle
								}
								if release.Year == "" && parentRel.Year != "" {
									release.Year = parentRel.Year
								}
								if release.ReleaseGroup == "" && parentRel.ReleaseGroup != "" {
									release.ReleaseGroup = parentRel.ReleaseGroup
								}
							}
							if consolePlatform != "" {
								release.Platform = consolePlatform
							} else if isPcPackage {
								release.Platform = "PC"
							}
						}

						if strings.TrimSpace(release.Title) == "" {
							return nil
						}

						folderTemplate := getFolderTemplate(template)
						target := ApplyNamingTemplate(release, folderTemplate, "", cleanDir)

						status := "container_package"
						if isCrackFolder {
							if strings.EqualFold(actualName, "crack") || strings.EqualFold(actualName, "cracks") {
								target = filepath.Join(target, "Crack")
							} else {
								target = filepath.Join(target, "Crack", actualName)
							}
							status = "secondary_crack"
						} else if strings.EqualFold(filepath.Clean(actualPath), filepath.Clean(target)) {
							status = "already_organized"
						} else if targetPaths[strings.ToLower(target)] {
							status = "conflict"
						}

						cleanSrc := strings.ToLower(filepath.Clean(actualPath))
						cleanDst := strings.ToLower(filepath.Clean(target))
						if cleanSrc == cleanDst {
							status = "already_organized"
						} else if strings.HasPrefix(cleanDst, cleanSrc+string(filepath.Separator)) {
							status = "conflict"
						} else {
							if fi, err := os.Stat(target); err == nil {
								if fi.IsDir() {
									entries, err := os.ReadDir(target)
									if err == nil && len(entries) > 0 {
										status = "conflict"
									}
								} else {
									status = "conflict"
								}
							}
						}
						targetPaths[strings.ToLower(target)] = true

						var subdirs []string
						entriesForSubdirs := children
						if actualPath != path {
							if ac, acErr := os.ReadDir(actualPath); acErr == nil {
								entriesForSubdirs = ac
							}
						}
						for _, c := range entriesForSubdirs {
							if c.IsDir() && !noiseDirectoryNames[strings.ToLower(c.Name())] {
								subdirs = append(subdirs, c.Name())
							}
						}

						relParent, _ := safeRel(cleanDir, filepath.Dir(actualPath))
						srcSub := ""
						if relParent != "." && relParent != "" && !strings.HasPrefix(relParent, "..") {
							srcSub = filepath.ToSlash(relParent)
						}

						targetFolders := computeFoldersToCreate(target, cleanDir)
						targetSub := ""
						if len(targetFolders) > 0 {
							targetSub = filepath.ToSlash(targetFolders[0])
						}

						items = append(items, PreviewItem{
							SourcePath: actualPath,
							SourceFilename: actualName,

							Type: "folder_package",

							Matched: true,

							Extracted: func() map[string]string {
								ext := map[string]string{
									"Title":        release.Title,
									"Year":         release.Year,
									"Platform":     release.Platform,
									"ReleaseGroup": release.ReleaseGroup,
									"Edition":      release.Edition,
									"Version":      release.Version,
								}
								if isLinked && sc.MediaID != "" {
									ext["MediaID"] = sc.MediaID
								}
								return ext
							}(),

							TargetPath: target,

							FoldersToCreate: targetFolders,

							Status: status,

							Anomalies: anomalies,

							SuggestedRenames: suggestedRenames,

							Health: health,

							SourceSubdirectory: srcSub,

							TargetSubdirectory: targetSub,

							Subdirectories: subdirs,
						})

						return filepath.SkipDir

					}

				}

			}

			// Limit scan depth
			if strings.Count(rel, string(filepath.Separator)) > maxOrganizeScanDepth {
				return filepath.SkipDir
			}

			return nil

		}

		filename := d.Name()

		lowerName := strings.ToLower(filename)

		ext := strings.ToLower(filepath.Ext(path))

		// Skip hidden, OS metadata, sidecars, artwork, and internal engine assets

		if strings.HasPrefix(filename, ".") || ignoredFilenames[lowerName] || ignoredExtensions[ext] {

			return nil

		}

		if isNoise(filename, path) {

			return nil

		}

		var itemType string

		var status string

		var target string

		if isoExtensions[ext] {

			itemType = "iso"

		} else if plat, ok := romExtensions[ext]; ok {

			if ext == ".md" && IsDocBasename(lowerName) {

				return nil

			}

			itemType = "rom"

			_ = plat

		} else if ext == ".bin" {

			pathLower := strings.ToLower(path)

			isUpdateBin := strings.Contains(lowerName, "update") ||

				strings.Contains(lowerName, "patch") ||

				strings.Contains(lowerName, "elamigos") ||

				strings.Contains(pathLower, "/updates/") ||

				strings.Contains(pathLower, "\\updates\\")

			if isUpdateBin {

				itemType = "update"

			} else {

				return nil

			}

		} else if ext == ".exe" {
			if isCrackName(lowerName) {
				itemType = "crack"
			} else if strings.Contains(lowerName, "update") || strings.Contains(lowerName, "patch") || strings.Contains(lowerName, "hotfix") {
				itemType = "update"
			} else if strings.Contains(lowerName, "dlc") || strings.Contains(lowerName, "addon") {
				itemType = "dlc"
			} else if !isNoise(filename, path) {
				itemType = "game_exe"
			} else {
				return nil
			}
		} else if ext == ".zip" || ext == ".rar" || ext == ".7z" {
			if isCrackName(lowerName) {
				itemType = "crack"
			} else if strings.Contains(lowerName, "update") || strings.Contains(lowerName, "patch") || strings.Contains(lowerName, "hotfix") {

				itemType = "update"

			} else if strings.Contains(lowerName, "dlc") || strings.Contains(lowerName, "addon") {

				itemType = "dlc"

			} else if strings.Contains(lowerName, ".part") && !strings.Contains(lowerName, ".part01.") && !strings.Contains(lowerName, ".part1.") {

				itemType = "archive_part"

			} else {

				itemType = "archive"

			}

		} else {

			return nil

		}

		release := ParseReleaseName(filename)

		parentDirRaw := filepath.Base(filepath.Dir(path))

		parentDir := resolveGameParentDir(path, cleanDir)

		if parentDir != "." && parentDir != "" && !strings.HasPrefix(parentDir, "..") {
			pRel := ParseReleaseName(parentDir)
			isGenericTitle := release.Title == "" || release.Title == "1" || len(release.Title) <= 3 ||
				strings.EqualFold(release.Title, "exe") || strings.EqualFold(release.Title, "bin") ||
				strings.EqualFold(release.Title, "patch") || strings.EqualFold(release.Title, "update") ||
				strings.EqualFold(release.Title, "setup") || strings.EqualFold(release.Title, "installer") ||
				strings.HasPrefix(strings.ToLower(release.Title), "elamigos")

			if pRel.Title != "" && (isGenericTitle || strings.EqualFold(parentDirRaw, "updates") || strings.EqualFold(parentDirRaw, "dlc") || strings.EqualFold(parentDirRaw, "crack") || strings.EqualFold(parentDirRaw, "patches")) {

				release.Title = pRel.Title

				if release.Year == "" {

					release.Year = pRel.Year

				}

				if release.Platform == "" || release.Platform == "PC" {

					release.Platform = pRel.Platform

				}

			}

		}

		folderTemplate := getFolderTemplate(template)
		gameFolderTarget := ApplyNamingTemplate(release, folderTemplate, "", cleanDir)

		if itemType == "crack" {
			itemType = "crack"
			status = "secondary_crack"
			target = filepath.Join(gameFolderTarget, "Crack", filename)
		} else if itemType == "update" || strings.Contains(lowerName, "[upd]") {
			itemType = "update"
			status = "secondary_update"
			target = filepath.Join(gameFolderTarget, "Updates", filename)
		} else if itemType == "dlc" || strings.Contains(lowerName, "[dlc]") {
			itemType = "dlc"
			status = "secondary_dlc"
			target = filepath.Join(gameFolderTarget, "DLC", filename)
		} else if itemType == "archive_part" {
			status = "secondary_archive_part"
			target = filepath.Join(gameFolderTarget, filename)
		} else {
			status = "rename_and_move"
			target = ApplyNamingTemplate(release, template, ext, cleanDir)
		}

		if filepath.Clean(path) == filepath.Clean(target) {

			status = "already_organized"

		} else if targetPaths[strings.ToLower(target)] {

			status = "conflict"

		}

		targetPaths[strings.ToLower(target)] = true

		folders := computeFoldersToCreate(target, cleanDir)

		relParent, _ := safeRel(cleanDir, filepath.Dir(path))

		srcSub := ""

		if relParent != "." && relParent != "" && !strings.HasPrefix(relParent, "..") {

			srcSub = filepath.ToSlash(relParent)

		}

		targetSub := ""

		if len(folders) > 0 {

			targetSub = filepath.ToSlash(folders[0])

		}

		items = append(items, PreviewItem{

			SourcePath: path,

			SourceFilename: filename,

			Type: itemType,

			Matched: true,

			Extracted: map[string]string{

				"Title": release.Title,

				"Year": release.Year,

				"Platform": release.Platform,

				"ReleaseGroup": release.ReleaseGroup,

				"Edition": release.Edition,

				"Version": release.Version,

				"Region": release.Region,

				"TitleId": release.TitleId,
			},

			TargetPath: target,

			FoldersToCreate: folders,

			Status: status,

			SourceSubdirectory: srcSub,

			TargetSubdirectory: targetSub,
		})

		return nil

	})

	if len(items) == 0 && sample {

		return generateSamplePreviews(cleanDir, template), nil

	}

	return items, nil

}

func generateSamplePreviews(baseDir string, template string) []PreviewItem {

	if baseDir == "" || baseDir == "." {

		baseDir = "D:\\Games\\Library"

	}

	cleanBase := filepath.Clean(baseDir)

	items := make([]PreviewItem, 0)

	for _, s := range sampleReleases {

		release := ParseReleaseName(s.RawName)

		var filename string

		if s.Ext != "" {

			filename = fmt.Sprintf("%s.%s", s.RawName, s.Ext)

		} else {

			filename = s.RawName

		}

		source := filepath.Join(cleanBase, filepath.FromSlash(s.SubDir), filename)

		var target string

		var status string = "sample"

		folderTemplate := getFolderTemplate(template)
		gameFolderTarget := ApplyNamingTemplate(release, folderTemplate, "", cleanBase)

		if s.Category == "folder_package" {
			target = gameFolderTarget
			status = "container_package"
		} else if s.Category == "update" {
			status = "secondary_update"
			target = filepath.Join(gameFolderTarget, "Updates", filename)
		} else if s.Category == "dlc" {
			status = "secondary_dlc"
			target = filepath.Join(gameFolderTarget, "DLC", filename)
		} else {
			target = ApplyNamingTemplate(release, template, s.Ext, cleanBase)
		}

		folders := computeFoldersToCreate(target, cleanBase)

		targetSub := ""

		if len(folders) > 0 {

			targetSub = filepath.ToSlash(folders[0])

		}

		var sampleSubdirs []string

		if s.Category == "folder_package" {

			sampleSubdirs = []string{"Crack", "Support"}

		}

		items = append(items, PreviewItem{

			SourcePath: source,

			SourceFilename: filename,

			Type: s.Category,

			Matched: true,

			Extracted: map[string]string{

				"Title": release.Title,

				"Year": release.Year,

				"Platform": release.Platform,

				"ReleaseGroup": release.ReleaseGroup,

				"Edition": release.Edition,

				"Version": release.Version,

				"Region": release.Region,

				"TitleId": release.TitleId,
			},

			TargetPath: target,

			FoldersToCreate: folders,

			Status: status,

			SourceSubdirectory: filepath.ToSlash(s.SubDir),

			TargetSubdirectory: targetSub,

			Subdirectories: sampleSubdirs,
		})

	}

	return items

}

func computeFoldersToCreate(targetPath, baseDir string) []string {

	targetDir := filepath.Dir(targetPath)

	rel, err := safeRel(baseDir, targetDir)

	if err != nil || rel == "." || rel == "" {

		return nil

	}

	// Check if target directory already exists

	if _, err := os.Stat(targetDir); err == nil {

		return nil

	}

	return []string{filepath.Base(targetDir)}

}

func ExecuteOrganization(items []ExecuteItem, deleteEmptyFolders ...bool) ([]ExecuteResult, error) {

	var results []ExecuteResult

	for _, item := range items {

		if strings.TrimSpace(item.SourcePath) == "" || strings.TrimSpace(item.TargetPath) == "" {

			results = append(results, ExecuteResult{

				SourcePath: item.SourcePath,

				TargetPath: item.TargetPath,

				Success: false,

				Error: "Source or target path is empty",
			})

			continue

		}

		src := filepath.Clean(item.SourcePath)

		dst := filepath.Clean(item.TargetPath)

		if src == dst {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    true,
			})
			continue
		}

		cleanSrc := strings.ToLower(src)
		cleanDst := strings.ToLower(dst)

		// Protection against moving into own subdirectory
		if strings.HasPrefix(cleanDst, cleanSrc+string(filepath.Separator)) {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    false,
				Error:      fmt.Sprintf("Cannot copy or move '%s' to a subdirectory of self '%s'", src, dst),
			})
			continue
		}

		// Protection against overwriting or merging into existing directories/files
		if fi, statErr := os.Stat(dst); statErr == nil {
			if fi.IsDir() {
				entries, readErr := os.ReadDir(dst)
				if readErr == nil && len(entries) > 0 {
					results = append(results, ExecuteResult{
						SourcePath: src,
						TargetPath: dst,
						Success:    false,
						Error:      fmt.Sprintf("Target path already exists and is not empty: %s", dst),
					})
					continue
				} else {
					// Remove empty directory so atomic move succeeds cleanly
					_ = os.Remove(dst)
				}
			} else {
				results = append(results, ExecuteResult{
					SourcePath: src,
					TargetPath: dst,
					Success:    false,
					Error:      fmt.Sprintf("Target path already exists: %s", dst),
				})
				continue
			}
		}

		// Ensure target directory exists

		targetDir := filepath.Dir(dst)

		if err := os.MkdirAll(targetDir, 0755); err != nil {

			results = append(results, ExecuteResult{

				SourcePath: src,

				TargetPath: dst,

				Success: false,

				Error: fmt.Sprintf("Failed to create directory: %v", err),
			})

			continue

		}

		// Move with atomic rename and cross-device fallback

		if err := movePath(src, dst); err != nil {

			results = append(results, ExecuteResult{

				SourcePath: src,

				TargetPath: dst,

				Success: false,

				Error: fmt.Sprintf("Failed to move: %v", err),
			})

			continue

		}

		// If moved directory, check and heal any repack filename anomalies

		if fi, statErr := os.Stat(dst); statErr == nil && fi.IsDir() {

			healRepackDir(dst)

		}

		results = append(results, ExecuteResult{

			SourcePath: src,

			TargetPath: dst,

			Success: true,
		})

	}

	// Clean empty directories if requested
	shouldClean := false
	if len(deleteEmptyFolders) > 0 {
		shouldClean = deleteEmptyFolders[0]
	}
	if shouldClean {
		parents := make(map[string]bool)
		for _, item := range items {
			if strings.TrimSpace(item.SourcePath) != "" {
				dir := filepath.Dir(filepath.Clean(item.SourcePath))
				parents[dir] = true
			}
		}
		for dir := range parents {
			cleanEmptyDirsUp(dir, 4)
		}
	}

	return results, nil

}

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

func cleanEmptyDirsUp(dir string, maxLevels int) {
	curr := filepath.Clean(dir)
	for i := 0; i < maxLevels; i++ {
		if isProtectedVolumeOrRoot(curr) {
			break
		}
		entries, err := os.ReadDir(curr)
		if err != nil || len(entries) > 0 {
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
	return movePath(src, dst)
}

func movePath(src, dst string) error {
	cleanSrc := filepath.Clean(strings.TrimSpace(src))
	cleanDst := filepath.Clean(strings.TrimSpace(dst))

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

	// Prevent silent overwrite of existing destination files or directories
	if _, err := os.Lstat(cleanDst); err == nil {
		return fmt.Errorf("destination path %q already exists: %w", cleanDst, os.ErrExist)
	}

	if err := os.MkdirAll(filepath.Dir(cleanDst), 0755); err != nil {
		return fmt.Errorf("create destination directory failed: %w", err)
	}

	// Fast atomic rename on same filesystem
	if err := os.Rename(cleanSrc, cleanDst); err == nil {
		return nil
	}

	// Fallback: cross-device or cross-mount move (copy + verify + delete)
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
		// Destination is already removed by copyFileAndVerify on failure.
		// Source file is preserved untouched.
		return fmt.Errorf("cross-device file copy failed: %w", err)
	}

	if err := os.Remove(cleanSrc); err != nil {
		return fmt.Errorf("cleanup source file failed: %w", err)
	}

	return nil
}

// CopyFileAndVerify copies src to dst, calls Sync, and verifies exact byte size match.
// On failure, dst is removed and src is untouched.
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

	// Verify exact byte length against source fi.Size()
	if copied != srcInfo.Size() {
		_ = os.Remove(dst)
		return fmt.Errorf("size verification failed: copied %d bytes, expected %d", copied, srcInfo.Size())
	}

	// Double check destination file on disk
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

