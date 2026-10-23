package organize

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type ParsedRelease struct {
	Title        string `json:"title"`
	CleanTitle   string `json:"clean_title"`
	Year         string `json:"year,omitempty"`
	Edition      string `json:"edition,omitempty"`
	Platform     string `json:"platform,omitempty"`
	ReleaseGroup string `json:"release_group,omitempty"`
	Version      string `json:"version,omitempty"`
	Region       string `json:"region,omitempty"`
	TitleId      string `json:"title_id,omitempty"`
	RawName      string `json:"raw_name"`
	IsScene      bool   `json:"is_scene"`
}

var (
	editionRegex = regexp.MustCompile(`(?i)(goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|director['’]?s\s*cut)\s*(?:edition)?`)
	yearRegex    = regexp.MustCompile(`\b((?:19|20)\d{2})\b`)
	versionRegex = regexp.MustCompile(`(?i)\bv?(\d+(?:\.\d+)+)\b`)
	regionRegex  = regexp.MustCompile(`(?i)\((USA|Europe|Japan|World|En,Ja|En,Fr,De|Asia|Australia|Germany|France)\)`)
	switchIdRegex = regexp.MustCompile(`\[([0-9A-Fa-f]{16})\]`)
	psIdRegex     = regexp.MustCompile(`\[?([A-Z]{4}\d{5})\]?`)

	sceneRegex = regexp.MustCompile(`(?i)^([A-Za-z0-9._+\-]+?)(?:\.(?:v?(\d+(?:\.\d+)*)))?[._-]?(REPACK|PROPER|UPDATE|MULTI\d*|GOTY|DEF|ENHANCED)?[._-]([A-Za-z0-9]{2,12})$`)

	repackRegex = regexp.MustCompile(`(?i)^(.+?)\s+(?:(?:update|v)\s+)?(?:v?\s*)?((?:\d+(?:\.\d+)+)|\d{3,})(?:\s*-\s*(?:\d+(?:\.\d+)+|\d{3,}))?[\s-]+([A-Za-z0-9]+?)(?:\s+password=.*)?$`)

	tagsRegexes = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\[repack\]`),
		regexp.MustCompile(`(?i)\brepack\b`),
		regexp.MustCompile(`(?i)\belamigos\b`),
		regexp.MustCompile(`(?i)\bfitgirl\b`),
		regexp.MustCompile(`(?i)\bdodi\b`),
		regexp.MustCompile(`(?i)\bcodex\b`),
		regexp.MustCompile(`(?i)\bflt\b`),
		regexp.MustCompile(`(?i)\bplaza\b`),
		regexp.MustCompile(`(?i)\bskidrow\b`),
		regexp.MustCompile(`(?i)\brune\b`),
		regexp.MustCompile(`(?i)\btenoke\b`),
		regexp.MustCompile(`(?i)\bgoldberg\b`),
		regexp.MustCompile(`(?i)\brazor1911\b`),
		regexp.MustCompile(`(?i)\bfairlight\b`),
		regexp.MustCompile(`(?i)\bhoodlum\b`),
		regexp.MustCompile(`(?i)\bmulti\d+\b`),
		regexp.MustCompile(`(?i)\bvoices\d*\b`),
		regexp.MustCompile(`(?i)\bbuild\s*\d+\b`),
		regexp.MustCompile(`(?i)\bupdate\s*\d*\b`),
		regexp.MustCompile(`(?i)\bunleashed\b`),
		regexp.MustCompile(`(?i)\bprophet\b`),
		regexp.MustCompile(`(?i)\bpart\s*\d+\b`),
		regexp.MustCompile(`(?i)\bdlc\b`),
		regexp.MustCompile(`(?i)\bincl\b`),
		regexp.MustCompile(`(?i)\bgog\b`),
		regexp.MustCompile(`(?i)\bdelusion\b`),
		regexp.MustCompile(`(?i)\bempress\b`),
		regexp.MustCompile(`(?i)\bcpy\b`),
		regexp.MustCompile(`(?i)\breloaded\b`),
		regexp.MustCompile(`(?i)\bcrack\s*fix(?:\s*v\d+)?\b`),
		regexp.MustCompile(`(?i)\bcrackfix(?:\s*v\d+)?\b`),
		regexp.MustCompile(`(?i)\bcrack\s*only\b`),
		regexp.MustCompile(`(?i)\bcrack\b`),
		regexp.MustCompile(`(?i)\bproper\b`),
		regexp.MustCompile(`(?i)\b(?:ps[1-5]|nsw)\b`),
		regexp.MustCompile(`(?i)\bwin(?:dows)?\s*(?:10|11|7|8|xp)?\b`),
		regexp.MustCompile(`(?i)\b(?:2[1-5]h[12]|x64|x86|64bit|32bit)\b`),
		regexp.MustCompile(`(?i)\bunlocker\b`),
		regexp.MustCompile(`(?i)\bsmall\b`),
		regexp.MustCompile(`(?i)\+\s*\d+\s*(?:dlcs?|bonuses|bonus|extras?|addons?)\b`),
	}

	coreSkipWords = map[string]bool{
		"repack": true, "codex": true, "crack": true, "gog": true,
		"elamigos": true, "dodi": true, "fitgirl": true, "skidrow": true,
		"flt": true, "update": true, "patch": true, "dlc": true,
		"iso": true, "setup": true, "rune": true, "tenoke": true, "delusion": true,
	}
)


func IsDocBasename(lower string) bool {
	docNames := []string{"readme", "changelog", "install", "license", "instructions", "release", "notes", "contributing", "info", "faq", "todo", "manual"}
	for _, d := range docNames {
		if strings.Contains(lower, d) {
			return true
		}
	}
	return false
}

func CleanGameTitle(filename string) string {
	name := filename

	// Strip leading update/part sequence prefix like "1 - ", "2 - ", "01. "
	name = regexp.MustCompile(`^\d+\s*[-_.]\s*`).ReplaceAllString(name, "")

	// Strip full build date expressions like (build 13.06.2024)
	name = regexp.MustCompile(`(?i)\(build\s*[^)]+\)`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`(?i)\bbuild\s*[\d.]+\b`).ReplaceAllString(name, "")

	// Strip date patterns (e.g. 20.02.2026, 13.03.2026 - 05.05.2026, 27.05.2025)
	name = regexp.MustCompile(`(?i)\b\d{2}[._-]\d{2}[._-](?:19|20)\d{2}\b`).ReplaceAllString(name, "")

	// Strip update followed by version numbers / ranges
	name = regexp.MustCompile(`(?i)(?:^|[^a-zA-Z0-9])(?:update\s*[\d\s._-]+(?=[a-zA-Z]|$))`).ReplaceAllString(name, " ")

	// Strip file extensions if recognized
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".iso", ".bin", ".cue", ".img", ".zip", ".rar", ".7z", ".exe",
		".nsp", ".xci", ".nsz", ".xcz", ".3ds", ".cia", ".nds", ".z64",
		".rvz", ".chd", ".gba", ".sfc", ".smc", ".nes", ".pkg":
		name = strings.TrimSuffix(name, filepath.Ext(name))
	}
	name = regexp.MustCompile(`(?i)\.part\d+$`).ReplaceAllString(name, "")

	// Strip Title IDs like [0100F2C0115B6000] or [BCUS98174] or PPSA15552
	name = switchIdRegex.ReplaceAllString(name, "")
	name = psIdRegex.ReplaceAllString(name, "")

	// Strip ROM update/DLC flags
	updDlcRegex := regexp.MustCompile(`(?i)\[(?:UPD|DLC|v\d+)\]`)
	name = updDlcRegex.ReplaceAllString(name, "")

	// Strip version patterns
	vStrip := regexp.MustCompile(`(?i)(?:^|[\s._-])v\d+(?:\.\d+)+(?:[a-zA-Z]\d*)?(?:[\s._-]|$)`)
	name = vStrip.ReplaceAllString(name, " ")

	// Convert dots, underscores, hyphens to spaces
	name = strings.ReplaceAll(name, ".", " ")
	name = strings.ReplaceAll(name, "_", " ")
	name = strings.ReplaceAll(name, "-", " ")

	// Strip release and scene tags
	for _, tag := range tagsRegexes {
		name = tag.ReplaceAllString(name, "")
	}

	// Clean brackets
	bracketRegex := regexp.MustCompile(`\[\s*\]|\(\s*\)|\{\s*\}`)
	name = bracketRegex.ReplaceAllString(name, "")

	// Clean trailing and leading punctuation
	name = regexp.MustCompile(`[\s\-+:,&]+$`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`^[\s\-+:,&]+`).ReplaceAllString(name, "")

	// Clean whitespace
	spaceRegex := regexp.MustCompile(`\s+`)
	name = strings.TrimSpace(spaceRegex.ReplaceAllString(name, " "))

	return name
}

func ExtractGroup(raw string) string {
	lower := strings.ToLower(strings.TrimSpace(raw))
	words := strings.Fields(lower)
	if len(words) == 0 {
		return ""
	}

	last := words[len(words)-1]
	if last != "" && !coreSkipWords[last] && len(last) >= 2 && len(last) <= 12 {
		return strings.ToUpper(last[:1]) + last[1:]
	}

	// Try trailing hyphen match
	hyphenRegex := regexp.MustCompile(`-([a-zA-Z0-9]{2,12})$`)
	if m := hyphenRegex.FindStringSubmatch(raw); len(m) > 1 {
		g := m[1]
		if !coreSkipWords[strings.ToLower(g)] {
			return g
		}
	}

	return ""
}

func ParseReleaseName(rawName string) ParsedRelease {
	baseName := strings.TrimSuffix(rawName, filepath.Ext(rawName))
	clean := CleanGameTitle(rawName)
	res := ParsedRelease{
		CleanTitle: clean,
		RawName:    rawName,
		Platform:   "PC",
	}

	processed := regexp.MustCompile(`(?i)\(build\s*[^)]+\)`).ReplaceAllString(baseName, "")
	processed = regexp.MustCompile(`(?i)\bbuild\s*[\d.]+\b`).ReplaceAllString(processed, "")
	processed = regexp.MustCompile(`(?i)\b\d{2}[._-]\d{2}[._-](?:19|20)\d{2}\b`).ReplaceAllString(processed, "")
	processed = regexp.MustCompile(`^\d+\s*[-_.]\s*`).ReplaceAllString(processed, "")

	// Check year (from processed string to avoid build dates / patch dates)
	if yMatch := yearRegex.FindStringSubmatch(processed); len(yMatch) > 1 {
		res.Year = yMatch[1]
	}

	// Check edition
	if edMatch := editionRegex.FindStringSubmatch(rawName); len(edMatch) > 0 {
		res.Edition = strings.Title(strings.ToLower(edMatch[0]))
	}

	// Check version
	if vMatch := versionRegex.FindStringSubmatch(rawName); len(vMatch) > 1 {
		res.Version = vMatch[1]
	}

	// Platform detection from extension or bracket
	ext := strings.ToLower(filepath.Ext(rawName))
	switch ext {
	case ".nsp", ".xci", ".nsz", ".xcz":
		res.Platform = "Switch"
	case ".3ds", ".cia", ".cxi":
		res.Platform = "3DS"
	case ".nds":
		res.Platform = "NDS"
	case ".z64", ".n64", ".v64":
		res.Platform = "N64"
	case ".rvz", ".wbfs":
		res.Platform = "Wii"
	case ".gcz":
		res.Platform = "GameCube"
	case ".chd":
		res.Platform = "PS2"
	case ".pbp":
		res.Platform = "PSP"
	case ".vpk":
		res.Platform = "PSVita"
	case ".sfc", ".smc":
		res.Platform = "SNES"
	case ".nes":
		res.Platform = "NES"
	case ".gba":
		res.Platform = "GBA"
	case ".gbc":
		res.Platform = "GBC"
	case ".gb":
		res.Platform = "GB"
	case ".gen":
		res.Platform = "Genesis"
	case ".md":
		if IsDocBasename(strings.ToLower(baseName)) {
			res.Platform = "PC"
		} else {
			res.Platform = "Genesis"
		}
	case ".pkg":
		res.Platform = "PS3"
	default:
		platRegex := regexp.MustCompile(`(?i)\[(PC|Switch|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\]`)
		if m := platRegex.FindStringSubmatch(baseName); len(m) > 1 {
			res.Platform = strings.ToUpper(m[1])
		}
	}

	// Region extraction
	if regMatch := regionRegex.FindStringSubmatch(baseName); len(regMatch) > 1 {
		res.Region = regMatch[1]
	}

	// Title ID extraction
	if sMatch := switchIdRegex.FindStringSubmatch(baseName); len(sMatch) > 1 {
		res.TitleId = sMatch[1]
	} else if pMatch := psIdRegex.FindStringSubmatch(baseName); len(pMatch) > 1 {
		res.TitleId = pMatch[1]
	}

	if res.TitleId != "" {
		upperId := strings.ToUpper(res.TitleId)
		if strings.HasPrefix(upperId, "PPSA") {
			res.Platform = "PS5"
		} else if strings.HasPrefix(upperId, "BCUS") || strings.HasPrefix(upperId, "BLES") || strings.HasPrefix(upperId, "BLUS") {
			res.Platform = "PS3"
		} else if strings.HasPrefix(upperId, "CUSA") {
			res.Platform = "PS4"
		}
	} else if regexp.MustCompile(`(?i)\[?PPSA\d{5}\]?`).MatchString(baseName) {
		res.Platform = "PS5"
	} else if regexp.MustCompile(`(?i)\[(?:BCUS|BLES|BLUS)\d{5}\]`).MatchString(baseName) {
		res.Platform = "PS3"
	} else if regexp.MustCompile(`(?i)\[?CUSA\d{5}\]?`).MatchString(baseName) {
		res.Platform = "PS4"
	}

	// Strategy 1: Scene format match
	if m := sceneRegex.FindStringSubmatch(baseName); len(m) > 4 {
		title := strings.ReplaceAll(m[1], ".", " ")
		title = strings.ReplaceAll(title, "_", " ")
		res.Title = CleanGameTitle(title)
		if res.Title == "" {
			res.Title = clean
		}
		if m[2] != "" && res.Version == "" {
			res.Version = m[2]
		}
		res.ReleaseGroup = m[4]
		res.IsScene = true
		return res
	}

	// Strategy 2: Repack format match
	if m := repackRegex.FindStringSubmatch(baseName); len(m) > 3 {
		res.Title = CleanGameTitle(m[1])
		if res.Title == "" {
			res.Title = clean
		}
		res.Version = m[2]
		res.ReleaseGroup = m[3]
		return res
	}

	// Fallback generic
	res.Title = clean
	res.ReleaseGroup = ExtractGroup(baseName)
	return res
}

func ApplyNamingTemplate(release ParsedRelease, template string, ext string, baseDir string) string {
	extClean := strings.TrimPrefix(ext, ".")
	if extClean == "" {
		extClean = "iso"
	}

	tokens := map[string]string{
		"Title":        release.Title,
		"CleanTitle":   release.CleanTitle,
		"Year":         release.Year,
		"Edition":      release.Edition,
		"Platform":     release.Platform,
		"ReleaseGroup": release.ReleaseGroup,
		"Version":      release.Version,
		"Region":       release.Region,
		"TitleId":      release.TitleId,
		"OriginalName": release.RawName,
		"MediaType":    release.Platform,
		"ext":          extClean,
	}

	result := template
	for k, v := range tokens {
		result = strings.ReplaceAll(result, "{"+k+"}", v)
	}

	// Clean empty brackets and formatting artifacts
	cleanBrackets := regexp.MustCompile(`\(\s*\)|\[\s*\]|\{\s*\}`)
	result = cleanBrackets.ReplaceAllString(result, "")

	// Normalize slashes
	result = strings.ReplaceAll(result, "\\", "/")
	multiSlash := regexp.MustCompile(`/+`)
	result = multiSlash.ReplaceAllString(result, "/")
	result = strings.TrimPrefix(result, "/")
	result = strings.TrimSuffix(result, "/")

	multiSpace := regexp.MustCompile(`\s{2,}`)
	result = multiSpace.ReplaceAllString(result, " ")
	result = strings.ReplaceAll(result, " /", "/")
	result = strings.ReplaceAll(result, "/ ", "/")

	if baseDir != "" {
		cleanBase := filepath.Clean(baseDir)
		targetRel := filepath.FromSlash(result)
		return filepath.Join(cleanBase, targetRel)
	}

	return filepath.FromSlash(result)
}

func ExtractYear(s string) int {
	m := yearRegex.FindStringSubmatch(s)
	if len(m) > 1 {
		if y, err := strconv.Atoi(m[1]); err == nil {
			return y
		}
	}
	return 0
}
