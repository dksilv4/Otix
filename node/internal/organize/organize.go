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

		"video": true, "movies": true, "shaders": true, "levels": true, "maps": true,

		"res": true, "resources": true, "localization": true, "languages": true,

		"locale": true, "save": true, "saves": true, "cache": true,

		"runtimetools": true, "md5": true, "emulators": true, "node_modules": true,

		"$recycle.bin": true, "system volume information": true,
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

func sanitizePathTitle(title string) string {
	cleaned := illegalPathChars.ReplaceAllString(title, " - ")
	cleaned = regexp.MustCompile(`\s{2,}`).ReplaceAllString(cleaned, " ")
	return strings.TrimSpace(cleaned)
}

func findOtixSidecar(dir string) (*otixmeta.Sidecar, string) {
	if sc, err := otixmeta.Read(dir); err == nil && sc != nil && (sc.MediaID != "" || sc.Title != "") {
		return sc, otixmeta.Path(dir)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, ""
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		nameLower := strings.ToLower(e.Name())
		if noiseDirectoryNames[nameLower] || strings.HasPrefix(nameLower, "$") || strings.HasPrefix(nameLower, ".") {
			continue
		}
		subPath := filepath.Join(dir, e.Name())
		if sc, err := otixmeta.Read(subPath); err == nil && sc != nil && (sc.MediaID != "" || sc.Title != "") {
			return sc, otixmeta.Path(subPath)
		}
		subEntries, err := os.ReadDir(subPath)
		if err == nil {
			for _, se := range subEntries {
				if se.IsDir() {
					seLower := strings.ToLower(se.Name())
					if noiseDirectoryNames[seLower] || strings.HasPrefix(seLower, "$") || strings.HasPrefix(seLower, ".") {
						continue
					}
					deepPath := filepath.Join(subPath, se.Name())
					if sc, err := otixmeta.Read(deepPath); err == nil && sc != nil && (sc.MediaID != "" || sc.Title != "") {
						return sc, otixmeta.Path(deepPath)
					}
				}
			}
		}
	}
	return nil, ""
}

func platformFromSidecar(sc *otixmeta.Sidecar, fallback string) string {
	if sc != nil && len(sc.Platforms) > 0 {
		for _, p := range sc.Platforms {
			if name, ok := p["name"].(string); ok && name != "" {
				pUpper := strings.ToUpper(name)
				if strings.Contains(pUpper, "PC") || strings.Contains(pUpper, "WINDOWS") || strings.Contains(pUpper, "LINUX") || strings.Contains(pUpper, "MAC") {
					return "PC"
				} else if strings.Contains(pUpper, "SWITCH") {
					return "Switch"
				} else if strings.Contains(pUpper, "PS5") || strings.Contains(pUpper, "PLAYSTATION 5") {
					return "PS5"
				} else if strings.Contains(pUpper, "PS4") || strings.Contains(pUpper, "PLAYSTATION 4") {
					return "PS4"
				} else if strings.Contains(pUpper, "PS3") || strings.Contains(pUpper, "PLAYSTATION 3") {
					return "PS3"
				} else if strings.Contains(pUpper, "3DS") {
					return "3DS"
				} else if strings.Contains(pUpper, "WII") {
					return "Wii"
				} else if strings.Contains(pUpper, "XBOX") {
					return "Xbox"
				}
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

	lowerName := strings.ToLower(filename)

	for _, p := range noiseExecutablePatterns {

		if strings.Contains(lowerName, p) {

			return true

		}

	}

	parts := strings.FieldsFunc(strings.ToLower(fullPath), func(r rune) bool {

		return r == '/' || r == '\\'

	})

	for _, part := range parts {

		if noiseDirectoryNames[part] {

			return true

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

	// Scan directory up to depth 4

	_ = filepath.WalkDir(cleanDir, func(path string, d fs.DirEntry, err error) error {

		if err != nil {

			return nil

		}

		if d.IsDir() {

			nameLower := strings.ToLower(d.Name())

			if noiseDirectoryNames[nameLower] || strings.HasPrefix(nameLower, "$") || strings.HasPrefix(nameLower, ".") {

				return filepath.SkipDir

			}

			if nameLower == "updates" || nameLower == "dlc" || nameLower == "support" || nameLower == "_commonredist" {

				return nil

			}

			// If directory within cleanDir, check if it's a container folder package

			rel, _ := safeRel(cleanDir, path)

			if rel != "." && strings.Count(rel, string(filepath.Separator)) <= 4 {

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

						if strings.HasSuffix(cName, ".exe") && !isNoise(cName, "") {

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
					isLinked := sc != nil && (sc.MediaID != "" || sc.Title != "")

					hasIso := false
					for _, c := range children {
						if isoExtensions[strings.ToLower(filepath.Ext(c.Name()))] {
							hasIso = true
							break
						}
					}

					isCrackFolder := (hasCrackDll && (strings.Contains(folderLower, "crack") || strings.Contains(folderLower, "codex") || strings.Contains(folderLower, "rune") || isElAmigos)) ||
						isCrackName(folderLower) || folderLower == "crack" || folderLower == "onlinefix" || folderLower == "nocd"

					isTopLevel := strings.Count(rel, string(filepath.Separator)) == 0
					isPackage := isLinked || isCrackFolder || (hasSetup && hasBin) || isConsolePackage || (hasGameExe && (len(children) >= 3 || hasCrackDll)) || (isTopLevel && hasIso)

					if isPackage {
						var release ParsedRelease
						if isLinked {
							t := sc.Title
							if t == "" {
								t = CleanGameTitle(d.Name())
							}
							t = sanitizePathTitle(CleanGameTitle(t))
							plat := platformFromSidecar(sc, consolePlatform)
							y := yearFromSidecar(sc, d.Name())
							release = ParsedRelease{
								Title:      t,
								CleanTitle: t,
								Platform:   plat,
								Year:       y,
								RawName:    d.Name(),
							}
						} else {
							release = ParseReleaseName(d.Name())
							if consolePlatform != "" {
								release.Platform = consolePlatform
							}
						}

						folderTemplate := template
						if idx := strings.LastIndex(folderTemplate, "/"); idx != -1 {
							folderTemplate = folderTemplate[:idx]
						}
						target := ApplyNamingTemplate(release, folderTemplate, "", cleanDir)

						status := "container_package"
						if isCrackFolder {
							target = filepath.Join(target, "Crack", d.Name())
							status = "secondary_crack"
						} else if strings.EqualFold(filepath.Clean(path), filepath.Clean(target)) {
							status = "already_organized"
						} else if targetPaths[strings.ToLower(target)] {
							status = "conflict"
						}
						targetPaths[strings.ToLower(target)] = true

						var subdirs []string

						for _, c := range children {

							if c.IsDir() && !noiseDirectoryNames[strings.ToLower(c.Name())] {

								subdirs = append(subdirs, c.Name())

							}

						}

						relParent, _ := safeRel(cleanDir, filepath.Dir(path))

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

							SourcePath: path,

							SourceFilename: d.Name(),

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

			if strings.Count(rel, string(filepath.Separator)) > 4 {

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

		parentDir := parentDirRaw

		if strings.EqualFold(parentDir, "updates") || strings.EqualFold(parentDir, "dlc") || strings.EqualFold(parentDir, "crack") {

			grandparentDir := filepath.Base(filepath.Dir(filepath.Dir(path)))

			if grandparentDir != "." && grandparentDir != "" && !strings.HasPrefix(grandparentDir, "..") {

				parentDir = grandparentDir

			}

		}

		if parentDir != "." && parentDir != "" && !strings.HasPrefix(parentDir, "..") {

			pRel := ParseReleaseName(parentDir)

			isGenericTitle := release.Title == "" || release.Title == "1" || len(release.Title) <= 3 ||

				strings.EqualFold(release.Title, "exe") || strings.EqualFold(release.Title, "bin") ||

				strings.EqualFold(release.Title, "patch") || strings.EqualFold(release.Title, "update") ||

				strings.EqualFold(release.Title, "setup") || strings.EqualFold(release.Title, "installer") ||

				strings.HasPrefix(strings.ToLower(release.Title), "elamigos")

			if pRel.Title != "" && (isGenericTitle || strings.EqualFold(parentDirRaw, "updates") || strings.EqualFold(parentDirRaw, "dlc") || strings.EqualFold(parentDirRaw, "crack")) {

				release.Title = pRel.Title

				if release.Year == "" {

					release.Year = pRel.Year

				}

				if release.Platform == "" || release.Platform == "PC" {

					release.Platform = pRel.Platform

				}

			}

		}

		if itemType == "crack" {
			itemType = "crack"
			status = "secondary_crack"
			yearPart := ""
			if release.Year != "" {
				yearPart = fmt.Sprintf(" (%s)", release.Year)
			}
			folderBase := fmt.Sprintf("%s%s [%s]", release.Title, yearPart, release.Platform)
			if template != "" {
				folderBase = ApplyNamingTemplate(release, template, "", "")
			}
			parentRel := filepath.Join(folderBase, "Crack", filename)
			target = filepath.Join(cleanDir, parentRel)
		} else if itemType == "update" || strings.Contains(lowerName, "[upd]") {

			itemType = "update"

			status = "secondary_update"

			yearPart := ""

			if release.Year != "" {

				yearPart = fmt.Sprintf(" (%s)", release.Year)

			}

			parentRel := fmt.Sprintf("%s%s [%s]/Updates/%s", release.Title, yearPart, release.Platform, filename)

			target = filepath.Join(cleanDir, filepath.FromSlash(parentRel))

		} else if itemType == "dlc" || strings.Contains(lowerName, "[dlc]") {

			itemType = "dlc"

			status = "secondary_dlc"

			yearPart := ""

			if release.Year != "" {

				yearPart = fmt.Sprintf(" (%s)", release.Year)

			}

			parentRel := fmt.Sprintf("%s%s [%s]/DLC/%s", release.Title, yearPart, release.Platform, filename)

			target = filepath.Join(cleanDir, filepath.FromSlash(parentRel))

		} else if itemType == "archive_part" {

			status = "secondary_archive_part"

			yearPart := ""

			if release.Year != "" {

				yearPart = fmt.Sprintf(" (%s)", release.Year)

			}

			parentRel := fmt.Sprintf("%s%s [%s]/%s", release.Title, yearPart, release.Platform, filename)

			target = filepath.Join(cleanDir, filepath.FromSlash(parentRel))

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

		if s.Category == "folder_package" {

			folderTemplate := template

			if idx := strings.LastIndex(folderTemplate, "/"); idx != -1 {

				folderTemplate = folderTemplate[:idx]

			}

			target = ApplyNamingTemplate(release, folderTemplate, "", cleanBase)

			status = "container_package"

		} else if s.Category == "update" {

			status = "secondary_update"

			yearPart := ""

			if release.Year != "" {

				yearPart = fmt.Sprintf(" (%s)", release.Year)

			}

			parentRel := fmt.Sprintf("%s%s [%s]/Updates/%s", release.Title, yearPart, release.Platform, filename)

			target = filepath.Join(cleanBase, filepath.FromSlash(parentRel))

		} else if s.Category == "dlc" {

			status = "secondary_dlc"

			yearPart := ""

			if release.Year != "" {

				yearPart = fmt.Sprintf(" (%s)", release.Year)

			}

			parentRel := fmt.Sprintf("%s%s [%s]/DLC/%s", release.Title, yearPart, release.Platform, filename)

			target = filepath.Join(cleanBase, filepath.FromSlash(parentRel))

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

				Success: true,
			})

			continue

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

func cleanEmptyDirsUp(dir string, maxLevels int) {
	cleanEmptySubdirs(dir)
	curr := dir
	for i := 0; i < maxLevels; i++ {
		entries, err := os.ReadDir(curr)
		if err == nil && len(entries) == 0 {
			clean := filepath.Clean(curr)
			vol := filepath.VolumeName(clean)
			if clean != vol && clean != "/" && clean != "\\" && clean != "." {
				_ = os.Remove(curr)
			}
			parent := filepath.Dir(curr)
			if parent == curr || parent == "." || parent == vol || parent == "/" || parent == "\\" {
				break
			}
			curr = parent
		} else {
			break
		}
	}
}

func cleanEmptySubdirs(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			cleanEmptySubdirs(filepath.Join(dir, entry.Name()))
		}
	}
	recheck, err := os.ReadDir(dir)
	if err == nil && len(recheck) == 0 {
		clean := filepath.Clean(dir)
		vol := filepath.VolumeName(clean)
		if clean != vol && clean != "/" && clean != "\\" && clean != "." {
			_ = os.Remove(dir)
		}
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

func movePath(src, dst string) error {

	// Fast atomic rename on same filesystem

	if err := os.Rename(src, dst); err == nil {

		return nil

	}

	// Fallback: cross-device or cross-mount move (copy + delete)

	fi, err := os.Stat(src)

	if err != nil {

		return fmt.Errorf("source stat failed: %w", err)

	}

	if fi.IsDir() {

		if err := copyDir(src, dst); err != nil {

			return fmt.Errorf("cross-device directory copy failed: %w", err)

		}

		if err := os.RemoveAll(src); err != nil {

			return fmt.Errorf("cleanup source directory failed: %w", err)

		}

		return nil

	}

	if err := copyFile(src, dst, fi.Mode()); err != nil {

		return fmt.Errorf("cross-device file copy failed: %w", err)

	}

	if err := os.Remove(src); err != nil {

		return fmt.Errorf("cleanup source file failed: %w", err)

	}

	return nil

}

func copyFile(src, dst string, mode fs.FileMode) error {

	in, err := os.Open(src)

	if err != nil {

		return err

	}

	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)

	if err != nil {

		return err

	}

	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {

		return err

	}

	return out.Sync()

}

func copyDir(src, dst string) error {

	return filepath.Walk(src, func(path string, info fs.FileInfo, err error) error {

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

		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {

			return err

		}

		return copyFile(path, target, info.Mode())

	})

}
