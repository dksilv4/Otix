package indexer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/dksilv4/otix/node/internal/otixmeta"
)

func init() {
	if NoiseDirectoryNames != nil {
		NoiseDirectoryNames["node_modules"] = true
	}
	if StripExtensions != nil {
		for _, e := range []string{
			".z64", ".n64", ".v64", ".gbc", ".gb", ".gcm", ".md", ".gen", ".smd", ".pbp",
		} {
			StripExtensions[e] = true
		}
	}
}

// PlatformType represents a normalized platform classification.
type PlatformType string

const (
	PlatformPC        PlatformType = "PC"
	PlatformSwitch    PlatformType = "Switch"
	PlatformN64       PlatformType = "N64"
	PlatformSNES      PlatformType = "SNES"
	PlatformNES       PlatformType = "NES"
	PlatformGBA       PlatformType = "GBA"
	PlatformGBC       PlatformType = "GBC"
	PlatformGB        PlatformType = "GB"
	PlatformNDS       PlatformType = "NDS"
	Platform3DS       PlatformType = "3DS"
	PlatformPS1       PlatformType = "PS1"
	PlatformPS2       PlatformType = "PS2"
	PlatformPS3       PlatformType = "PS3"
	PlatformPS4       PlatformType = "PS4"
	PlatformPS5       PlatformType = "PS5"
	PlatformPSP       PlatformType = "PSP"
	PlatformPSVita    PlatformType = "PSVita"
	PlatformGameCube  PlatformType = "GameCube"
	PlatformWii       PlatformType = "Wii"
	PlatformWiiU      PlatformType = "WiiU"
	PlatformXbox      PlatformType = "Xbox"
	PlatformGenesis   PlatformType = "Genesis"
	PlatformDreamcast PlatformType = "Dreamcast"
	PlatformSaturn    PlatformType = "Saturn"
	PlatformArcade    PlatformType = "Arcade"
	PlatformMacOS     PlatformType = "macOS"
	PlatformUnknown   PlatformType = "Unknown"
)

// GameMetadataMatch contains identified metadata for an indexed or scanned game.
type GameMetadataMatch struct {
	Title           string            `json:"title"`
	NormalizedTitle string            `json:"normalized_title"`
	Year            int               `json:"year,omitempty"`
	Platform        PlatformType      `json:"platform"`
	Confidence      float64           `json:"confidence"`
	Developer       string            `json:"developer,omitempty"`
	Publisher       string            `json:"publisher,omitempty"`
	Overview        string            `json:"overview,omitempty"`
	Artwork         map[string]string `json:"artwork,omitempty"`
	ReleaseGroup    string            `json:"release_group,omitempty"`
	Source          string            `json:"source,omitempty"` // "sidecar" or "heuristic"
}

// SidecarOtixMeta represents a potential JSON structure of a .otixmeta file.
type SidecarOtixMeta struct {
	Title           string            `json:"title,omitempty"`
	NormalizedTitle string            `json:"normalized_title,omitempty"`
	Year            any               `json:"year,omitempty"`
	ReleaseYear     any               `json:"release_year,omitempty"`
	ReleaseDate     string            `json:"releaseDate,omitempty"`
	Platform        string            `json:"platform,omitempty"`
	Developer       string            `json:"developer,omitempty"`
	Publisher       string            `json:"publisher,omitempty"`
	Overview        string            `json:"overview,omitempty"`
	Artwork         map[string]string `json:"artwork,omitempty"`
	Images          map[string]any    `json:"images,omitempty"`
	Confidence      float64           `json:"confidence,omitempty"`
}

var (
	reYearExplicit  = regexp.MustCompile(`(?:\(|\b|\[)((?:19|20)\d{2})(?:\)|\b|\])`)
	reYearStandalone = regexp.MustCompile(`\b((?:19[7-9]\d|20[0-3]\d))\b`)

	sceneReleaseGroups = []string{
		"FITGIRL", "DODI", "ELAMIGOS", "RUNE", "FLT", "CODEX", "SKIDROW",
		"PLAZA", "TENOKE", "GOLDBERG", "RAZOR1911", "FAIRLIGHT", "HOODLUM",
		"EMPRESS", "CPY", "RELOADED", "PROPHET", "TINYISO", "CHRONOS",
		"TIKi", "KAOS", "DARCK", "XATAB", "SELAX",
	}

	sceneJunkTokens = []string{
		"repack", "multi10", "multi12", "multi9", "multi8", "multi7", "multi6", "multi5",
		"multi4", "multi3", "multi2", "multi1", "multilingual", "proper", "goty",
		"game of the year", "definitive", "enhanced", "remastered", "deluxe",
		"collectors", "special edition", "direct play", "crackfix", "dlc", "incl",
		"crack", "rip", "build", "x64", "x86", "win64", "win32",
	}

	reCleanSeparators = regexp.MustCompile(`[._\-]`)
	reBracketTags     = regexp.MustCompile(`\[[^\]]*\]|\([^\)]*\)`)
	reMultiSpaces     = regexp.MustCompile(`\s+`)
	reAlphanumeric    = regexp.MustCompile(`[^a-z0-9\s]`)
)

// DeterminePlatform inspects a filename and optional folder or full path to classify the platform.
func DeterminePlatform(filename string, folderOrPath ...string) PlatformType {
	ext := strings.ToLower(filepath.Ext(filename))
	cleanExt := strings.TrimPrefix(ext, ".")

	combinedContext := strings.ToLower(filename)
	for _, p := range folderOrPath {
		if p != "" {
			combinedContext += " " + strings.ToLower(filepath.ToSlash(p))
		}
	}

	// 1. Direct extension matching for console ROMs
	switch cleanExt {
	case "nsp", "xci":
		return PlatformSwitch
	case "z64", "n64", "v64":
		return PlatformN64
	case "sfc", "smc":
		return PlatformSNES
	case "nes":
		return PlatformNES
	case "gba":
		return PlatformGBA
	case "gbc":
		return PlatformGBC
	case "gb":
		return PlatformGB
	case "nds":
		return PlatformNDS
	case "3ds", "cia":
		return Platform3DS
	case "gcm":
		return PlatformGameCube
	case "wbfs":
		return PlatformWii
	case "rvz":
		if strings.Contains(combinedContext, "gamecube") || strings.Contains(combinedContext, "gcm") || strings.Contains(combinedContext, "/gc/") || strings.Contains(combinedContext, "[gc]") {
			return PlatformGameCube
		}
		return PlatformWii
	case "chd":
		if strings.Contains(combinedContext, "ps2") || strings.Contains(combinedContext, "playstation 2") {
			return PlatformPS2
		} else if strings.Contains(combinedContext, "dreamcast") || strings.Contains(combinedContext, "/dc/") {
			return PlatformDreamcast
		} else if strings.Contains(combinedContext, "saturn") {
			return PlatformSaturn
		} else if strings.Contains(combinedContext, "arcade") || strings.Contains(combinedContext, "mame") {
			return PlatformArcade
		}
		return PlatformPS1
	case "pbp":
		if strings.Contains(combinedContext, "ps1") || strings.Contains(combinedContext, "psx") {
			return PlatformPS1
		}
		return PlatformPSP
	case "md", "gen", "smd":
		return PlatformGenesis
	}

	// 2. Check for bracketed platform identifiers (e.g. [Switch], [PS2], [SNES], [N64])
	if strings.Contains(combinedContext, "[switch]") || strings.Contains(combinedContext, "[nsw]") || strings.Contains(combinedContext, "(switch)") {
		return PlatformSwitch
	}
	if strings.Contains(combinedContext, "[n64]") || strings.Contains(combinedContext, "(n64)") {
		return PlatformN64
	}
	if strings.Contains(combinedContext, "[snes]") || strings.Contains(combinedContext, "(snes)") {
		return PlatformSNES
	}
	if strings.Contains(combinedContext, "[nes]") || strings.Contains(combinedContext, "(nes)") {
		return PlatformNES
	}
	if strings.Contains(combinedContext, "[gba]") || strings.Contains(combinedContext, "(gba)") {
		return PlatformGBA
	}
	if strings.Contains(combinedContext, "[ps1]") || strings.Contains(combinedContext, "[psx]") {
		return PlatformPS1
	}
	if strings.Contains(combinedContext, "[ps2]") || strings.Contains(combinedContext, "(ps2)") {
		return PlatformPS2
	}
	if strings.Contains(combinedContext, "[ps3]") || strings.Contains(combinedContext, "(ps3)") {
		return PlatformPS3
	}
	if strings.Contains(combinedContext, "[ps4]") {
		return PlatformPS4
	}
	if strings.Contains(combinedContext, "[ps5]") {
		return PlatformPS5
	}
	if strings.Contains(combinedContext, "[psp]") || strings.Contains(combinedContext, "(psp)") {
		return PlatformPSP
	}
	if strings.Contains(combinedContext, "[psvita]") || strings.Contains(combinedContext, "[vita]") {
		return PlatformPSVita
	}
	if strings.Contains(combinedContext, "[gamecube]") || strings.Contains(combinedContext, "[gc]") {
		return PlatformGameCube
	}
	if strings.Contains(combinedContext, "[wii]") {
		return PlatformWii
	}
	if strings.Contains(combinedContext, "[wiiu]") || strings.Contains(combinedContext, "[wii u]") {
		return PlatformWiiU
	}
	if strings.Contains(combinedContext, "[xbox]") {
		return PlatformXbox
	}
	if strings.Contains(combinedContext, "[genesis]") || strings.Contains(combinedContext, "[megadrive]") {
		return PlatformGenesis
	}
	if strings.Contains(combinedContext, "[dreamcast]") {
		return PlatformDreamcast
	}
	if strings.Contains(combinedContext, "[saturn]") {
		return PlatformSaturn
	}
	if strings.Contains(combinedContext, "[arcade]") || strings.Contains(combinedContext, "[mame]") {
		return PlatformArcade
	}
	if strings.Contains(combinedContext, "[pc]") {
		return PlatformPC
	}

	// 3. Inspect directory structure clues
	for _, segment := range strings.Split(combinedContext, "/") {
		seg := strings.TrimSpace(segment)
		switch seg {
		case "switch", "nsw":
			return PlatformSwitch
		case "n64":
			return PlatformN64
		case "snes":
			return PlatformSNES
		case "nes":
			return PlatformNES
		case "gba":
			return PlatformGBA
		case "gbc":
			return PlatformGBC
		case "gb":
			return PlatformGB
		case "nds":
			return PlatformNDS
		case "3ds":
			return Platform3DS
		case "ps1", "psx":
			return PlatformPS1
		case "ps2":
			return PlatformPS2
		case "ps3":
			return PlatformPS3
		case "psp":
			return PlatformPSP
		case "gamecube", "gc":
			return PlatformGameCube
		case "wii":
			return PlatformWii
		case "genesis", "megadrive":
			return PlatformGenesis
		case "dreamcast":
			return PlatformDreamcast
		case "saturn":
			return PlatformSaturn
		case "arcade", "mame":
			return PlatformArcade
		}
	}

	// 4. Executables and installers
	switch cleanExt {
	case "exe", "msi":
		return PlatformPC
	case "app", "dmg", "pkg":
		return PlatformMacOS
	case "iso":
		// ISO could be PC or console
		if strings.Contains(combinedContext, "ps2") {
			return PlatformPS2
		} else if strings.Contains(combinedContext, "ps3") {
			return PlatformPS3
		} else if strings.Contains(combinedContext, "xbox") {
			return PlatformXbox
		} else if strings.Contains(combinedContext, "gamecube") {
			return PlatformGameCube
		} else if strings.Contains(combinedContext, "wii") {
			return PlatformWii
		} else if strings.Contains(combinedContext, "psp") {
			return PlatformPSP
		}
		return PlatformPC
	case "zip", "7z", "rar", "tar", "gz":
		// Check if PC repacker scene group is mentioned
		for _, group := range sceneReleaseGroups {
			if strings.Contains(strings.ToUpper(combinedContext), group) {
				return PlatformPC
			}
		}
		// If inside roms directory, keep Unknown/Console, else default to PC
		if strings.Contains(combinedContext, "rom") {
			return PlatformUnknown
		}
		return PlatformPC
	}

	return PlatformPC
}

// ExtractReleaseYear extracts a four-digit release year from text and returns (year, remainingText).
func ExtractReleaseYear(text string) (int, string) {
	// Look for bracketed or parenthesized year first: (2020) or [1998]
	reExplicit := regexp.MustCompile(`(?:\(|\[)((?:19[7-9]\d|20[0-3]\d))(?:\)|\])`)
	if match := reExplicit.FindStringSubmatchIndex(text); len(match) >= 4 {
		yearStr := text[match[2]:match[3]]
		if y, err := strconv.Atoi(yearStr); err == nil && y >= 1970 && y <= 2035 {
			remaining := strings.TrimSpace(text[:match[0]] + " " + text[match[1]:])
			return y, remaining
		}
	}

	// Look for standalone year bounded by dots, underscores, or spaces
	if match := reYearStandalone.FindStringSubmatchIndex(text); len(match) >= 4 {
		yearStr := text[match[2]:match[3]]
		if y, err := strconv.Atoi(yearStr); err == nil && y >= 1970 && y <= 2035 {
			remaining := strings.TrimSpace(text[:match[0]] + " " + text[match[1]:])
			return y, remaining
		}
	}

	return 0, text
}

// ExtractReleaseGroup returns the scene release group name if present.
func ExtractReleaseGroup(text string) string {
	upper := strings.ToUpper(text)
	for _, group := range sceneReleaseGroups {
		// Look for -GROUP or .GROUP or [GROUP]
		if strings.Contains(upper, "-"+group) ||
			strings.Contains(upper, "."+group) ||
			strings.Contains(upper, "_"+group) ||
			strings.Contains(upper, "["+group+"]") ||
			strings.HasSuffix(upper, " "+group) ||
			strings.HasPrefix(upper, group+" ") {
			return group
		}
	}
	return ""
}

// NormalizeTitle cleans scene tags, edition markers, version tokens, and returns a clean title.
func NormalizeTitle(raw string) string {
	cleaned := CleanTitleFromFilename(raw)
	return CleanFolderTitle(cleaned)
}

// CleanSearchKey produces a lowercase alphanumeric string suitable for database/Steam/IGDB lookups.
func CleanSearchKey(title string) string {
	lower := strings.ToLower(title)
	lower = reAlphanumeric.ReplaceAllString(lower, " ")
	lower = reMultiSpaces.ReplaceAllString(lower, " ")
	return strings.TrimSpace(lower)
}

// parseYearFromAny converts an int, float, or string from JSON to an integer year.
func parseYearFromAny(val any) int {
	if val == nil {
		return 0
	}
	switch v := val.(type) {
	case int:
		return v
	case float64:
		return int(v)
	case string:
		v = strings.TrimSpace(v)
		if len(v) >= 4 {
			if y, err := strconv.Atoi(v[:4]); err == nil && y >= 1970 && y <= 2035 {
				return y
			}
		}
	}
	return 0
}

// ParseSidecarMetadata checks for .otix and .otixmeta sidecar files in the given directory or for the file.
func ParseSidecarMetadata(folderName, filename string) (*GameMetadataMatch, error) {
	if folderName == "" && filename == "" {
		return nil, fmt.Errorf("empty paths")
	}

	dirsToCheck := []string{}
	if folderName != "" {
		dirsToCheck = append(dirsToCheck, folderName)
	}
	if filename != "" && filepath.IsAbs(filename) {
		dirsToCheck = append(dirsToCheck, filepath.Dir(filename))
	}

	// 1. First check for standard .otix via otixmeta package
	for _, dir := range dirsToCheck {
		if sc, err := otixmeta.Read(dir); err == nil && sc != nil {
			match := &GameMetadataMatch{
				Title:           sc.Title,
				NormalizedTitle: CleanSearchKey(sc.Title),
				Overview:        sc.Overview,
				Confidence:      sc.Confidence,
				Source:          "sidecar",
				Artwork:         make(map[string]string),
			}
			if match.Confidence == 0 {
				match.Confidence = 1.0
			}

			// Extract developer / publisher from companies
			for _, comp := range sc.Companies {
				if name, ok := comp["name"].(string); ok && name != "" {
					if match.Developer == "" {
						match.Developer = name
					} else if match.Publisher == "" {
						match.Publisher = name
					}
				}
			}

			// Extract platform from platforms
			if len(sc.Platforms) > 0 {
				if pName, ok := sc.Platforms[0]["name"].(string); ok {
					match.Platform = DeterminePlatform(pName)
				}
			}
			if match.Platform == "" || match.Platform == PlatformUnknown {
				match.Platform = DeterminePlatform(filename, folderName)
			}

			// Extract artwork
			for role, ref := range sc.Images {
				if ref != nil {
					if ref.Local != nil && *ref.Local != "" {
						match.Artwork[role] = *ref.Local
					} else if ref.URL != "" {
						match.Artwork[role] = ref.URL
					}
				}
			}

			return match, nil
		}
	}

	// 2. Check for .otixmeta or <stem>.otixmeta or <stem>.otix
	sidecarNames := []string{".otixmeta", ".otix"}
	if filename != "" {
		base := filepath.Base(filename)
		stem := strings.TrimSuffix(base, filepath.Ext(base))
		sidecarNames = append(sidecarNames, stem+".otixmeta", stem+".otix", base+".otixmeta", base+".otix")
	}

	for _, dir := range dirsToCheck {
		for _, name := range sidecarNames {
			scPath := filepath.Join(dir, name)
			data, err := os.ReadFile(scPath)
			if err != nil {
				continue
			}

			var om SidecarOtixMeta
			if err := json.Unmarshal(data, &om); err != nil {
				continue
			}

			title := om.Title
			if title == "" {
				title = NormalizeTitle(filepath.Base(dir))
			}

			year := parseYearFromAny(om.Year)
			if year == 0 {
				year = parseYearFromAny(om.ReleaseYear)
			}
			if year == 0 && om.ReleaseDate != "" {
				year = parseYearFromAny(om.ReleaseDate)
			}

			plat := PlatformType(om.Platform)
			if plat == "" || plat == PlatformUnknown {
				plat = DeterminePlatform(filename, folderName)
			}

			confidence := om.Confidence
			if confidence == 0 {
				confidence = 1.0
			}

			art := make(map[string]string)
			for k, v := range om.Artwork {
				art[k] = v
			}
			for k, v := range om.Images {
				if strVal, ok := v.(string); ok {
					art[k] = strVal
				} else if m, ok := v.(map[string]any); ok {
					if u, ok := m["url"].(string); ok {
						art[k] = u
					} else if l, ok := m["local"].(string); ok {
						art[k] = l
					}
				}
			}

			return &GameMetadataMatch{
				Title:           title,
				NormalizedTitle: CleanSearchKey(title),
				Year:            year,
				Platform:        plat,
				Confidence:      confidence,
				Developer:       om.Developer,
				Publisher:       om.Publisher,
				Overview:        om.Overview,
				Artwork:         art,
				Source:          "sidecar",
			}, nil
		}
	}

	return nil, os.ErrNotExist
}

// MatchMetadata extracts game metadata by first checking sidecar files, then applying heuristic extraction.
func MatchMetadata(filename string, folderName string) (*GameMetadataMatch, error) {
	if filename == "" && folderName == "" {
		return nil, fmt.Errorf("both filename and folderName are empty")
	}

	// 1. Check for sidecar metadata (.otix or .otixmeta)
	if match, err := ParseSidecarMetadata(folderName, filename); err == nil && match != nil {
		return match, nil
	}

	// 2. Fall back to heuristic normalization
	candidate := filename
	ext := filepath.Ext(filename)
	stem := strings.TrimSuffix(filepath.Base(filename), ext)

	// If filename is generic or installer payload (setup.exe, game.iso), look at folder name
	if IsGenericInstallerName(filename) || stem == "game" || stem == "play" || stem == "" {
		if folderName != "" {
			candidate = filepath.Base(folderName)
		}
	}

	relGroup := ExtractReleaseGroup(candidate)
	if relGroup == "" && folderName != "" {
		relGroup = ExtractReleaseGroup(filepath.Base(folderName))
	}

	year, withoutYear := ExtractReleaseYear(candidate)
	if year == 0 && folderName != "" {
		year, _ = ExtractReleaseYear(filepath.Base(folderName))
	}

	// Clean candidate string
	cleanedTitle := withoutYear
	if ext != "" && strings.HasSuffix(strings.ToLower(cleanedTitle), strings.ToLower(ext)) {
		cleanedTitle = cleanedTitle[:len(cleanedTitle)-len(ext)]
	}

	// Remove release group and bracket tags
	if relGroup != "" {
		reGroup := regexp.MustCompile(`(?i)(?:^|[._\-\s])` + regexp.QuoteMeta(relGroup) + `(?:$|[._\-\s])`)
		cleanedTitle = reGroup.ReplaceAllString(cleanedTitle, " ")
	}
	cleanedTitle = reBracketTags.ReplaceAllString(cleanedTitle, " ")

	// Strip common scene junk words
	lower := strings.ToLower(cleanedTitle)
	for _, junk := range sceneJunkTokens {
		reJunk := regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(junk) + `\b`)
		lower = reJunk.ReplaceAllString(lower, " ")
	}

	// Format title cleanly
	title := CleanTitleFromFilename(lower)
	title = CleanFolderTitle(title)
	if strings.TrimSpace(title) == "" {
		title = CleanFolderTitle(candidate)
	}

	plat := DeterminePlatform(filename, folderName)

	confidence := 0.80
	if year > 0 {
		confidence += 0.05
	}
	if plat != PlatformUnknown && plat != PlatformPC {
		confidence += 0.05
	}
	if relGroup != "" {
		confidence += 0.05
	}
	if confidence > 0.95 {
		confidence = 0.95
	}

	return &GameMetadataMatch{
		Title:           title,
		NormalizedTitle: CleanSearchKey(title),
		Year:            year,
		Platform:        plat,
		Confidence:      confidence,
		ReleaseGroup:    relGroup,
		Source:          "heuristic",
	}, nil
}
