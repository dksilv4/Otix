package organize

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

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
		"ps5": true, "ps4": true, "ps3": true, "ps2": true, "ps1": true, "psx": true,
		"playstation": true, "playstation 4": true, "playstation 5": true,
		"switch": true, "nswitch": true, "nintendo switch": true,
		"wii": true, "wii u": true, "gamecube": true, "3ds": true, "nds": true,
		"xbox 360": true, "xbox one": true, "xbox series": true,
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
		".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".ico": true,
		".bmp": true, ".gif": true, ".svg": true, ".tga": true, ".dds": true,
		".otix": true, ".ini": true, ".xml": true, ".json": true, ".db": true,
		".log": true, ".cfg": true, ".config": true, ".txt": true, ".nfo": true,
		".diz": true, ".url": true, ".sfv": true, ".sha": true, ".sha256": true,
		".md5": true, ".v": true, ".info": true, ".manifest": true,
		".dll": true, ".so": true, ".dylib": true, ".pdb": true, ".lib": true,
		".assets": true, ".ress": true, ".resource": true, ".pak": true, ".dat": true,
		".idx": true, ".toc": true, ".sb": true, ".cas": true,
		".tmp": true, ".part": true, ".crdownload": true, ".ds_store": true,
	}

	ignoredFilenames = map[string]bool{
		"folder.jpg": true, "cover.jpg": true, "icon.ico": true, "desktop.ini": true,
		".otix": true, "thumbs.db": true, ".ds_store": true,
	}

	illegalPathChars = regexp.MustCompile(`[\\/:*?"<>|]`)
	crackNameRegex   = regexp.MustCompile(`(?i)(?:^|[\s._\-\[(])(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)(?:[\s._\-\])]|$)`)
)

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

func sanitizePathTitle(title string) string {
	cleaned := illegalPathChars.ReplaceAllString(title, " - ")
	cleaned = regexp.MustCompile(`\s{2,}`).ReplaceAllString(cleaned, " ")
	return strings.TrimSpace(cleaned)
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

	dirs := parts[:len(parts)-1]
	startIdx := 0

	for i := len(dirs) - 1; i >= 0; i-- {
		lowerDir := strings.ToLower(dirs[i])
		if noiseDirectoryNames[lowerDir] {
			continue
		}
		if collectionDirectoryNames[lowerDir] {
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

		if i >= 1 {
			parentLower := strings.ToLower(dirs[i-1])
			if parentLower == "users" || parentLower == "home" {
				continue
			}
		}

		if (lowerPart == "temp" || lowerPart == "tmp") &&
			((i >= 2 && strings.ToLower(dirs[i-1]) == "local" && strings.ToLower(dirs[i-2]) == "appdata") ||
				(i >= 1 && strings.ToLower(dirs[i-1]) == "windows")) {
			continue
		}

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
