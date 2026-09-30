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
	RawName      string `json:"raw_name"`
	IsScene      bool   `json:"is_scene"`
}

var (
	editionRegex = regexp.MustCompile(`(?i)(goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary)\s*edition`)
	yearRegex    = regexp.MustCompile(`\b((?:19|20)\d{2})\b`)
	versionRegex = regexp.MustCompile(`(?i)\bv?(\d+(?:\.\d+)+)\b`)

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
		regexp.MustCompile(`(?i)\bdlc\b`),
		regexp.MustCompile(`(?i)\bincl\b`),
		regexp.MustCompile(`(?i)\bgog\b`),
		regexp.MustCompile(`(?i)\bcrack\b`),
	}

	coreSkipWords = map[string]bool{
		"repack": true, "codex": true, "crack": true, "gog": true,
		"elamigos": true, "dodi": true, "fitgirl": true, "skidrow": true,
		"flt": true, "update": true, "patch": true, "dlc": true,
		"iso": true, "setup": true, "rune": true, "tenoke": true,
	}
)

func CleanGameTitle(filename string) string {
	name := filename
	// Strip file extensions
	name = strings.TrimSuffix(name, filepath.Ext(name))

	// Strip version patterns
	vStrip := regexp.MustCompile(`(?i)(^|[^a-zA-Z0-9])v\d+(?:\.\d+)+(?:[a-zA-Z]\d*)?(?![a-zA-Z0-9])`)
	name = vStrip.ReplaceAllString(name, "$1")

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
	clean := CleanGameTitle(rawName)
	res := ParsedRelease{
		CleanTitle: clean,
		RawName:    rawName,
		Platform:   "PC",
	}

	// Check year
	if yMatch := yearRegex.FindStringSubmatch(rawName); len(yMatch) > 1 {
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

	// Strategy 1: Scene format match
	if m := sceneRegex.FindStringSubmatch(rawName); len(m) > 4 {
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
	if m := repackRegex.FindStringSubmatch(rawName); len(m) > 3 {
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
	res.ReleaseGroup = ExtractGroup(rawName)
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
		"OriginalName": release.RawName,
		"MediaType":    "ISO",
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
