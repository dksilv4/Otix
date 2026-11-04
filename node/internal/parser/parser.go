package parser

import (
	"path/filepath"
	"regexp"
	"strings"
)

var (
	reExt         = regexp.MustCompile(`\.([a-zA-Z0-9]{2,4})$`)
	reTitleIdHex  = regexp.MustCompile(`\[([0-9A-Fa-f]{16})\]`)
	reTitleIdDisc = regexp.MustCompile(`\[?([A-Z]{4}[-_]?\d{5})\]?`)
	reRegion      = regexp.MustCompile(`(?i)\((USA|Europe|Japan|World|Japan,\s*USA)\)`)
	reSwVer       = regexp.MustCompile(`(?i)\[v(\d+)\]`)
	reHotfix      = regexp.MustCompile(`(?i)\b(?:hotfix|update)\.(\d+)\b`)
	reVerV        = regexp.MustCompile(`(?i)\bv\d+`)
	reVer         = regexp.MustCompile(`(?i)\bv?(\d+\.\d+(?:\.\d+)*)\b`)
	reRev         = regexp.MustCompile(`(?i)\brev\s*(\d+)\b`)

	rePart         = regexp.MustCompile(`(?i)\.part\d+`)
	reSetupFitgirl = regexp.MustCompile(`(?i)setup-fitgirl-\d+`)
	reStripWords   = regexp.MustCompile(`(?i)\b(?:repack|update|patch|hotfix|dlc|pack|day\.one\.patch|crackfix|bundle|multi\d*|disc\s*\d+|rev\s*\d+|en|setup)\b`)
	reBrackets     = regexp.MustCompile(`[\[\]\(\)]`)
	reQuotes       = regexp.MustCompile(`['’]`)
	reDelim        = regexp.MustCompile(`[._\-]`)
	reMultiSpace   = regexp.MustCompile(`\s+`)
	reGog          = regexp.MustCompile(`(?i)(?:[-_.]|\b)GOG\b`)

	cleanTagsRegexes = []*regexp.Regexp{
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
)

// ParseReleaseName parses raw game release string with optional extension and parent directory hints.
func ParseReleaseName(input, extHint, parentDir string) *ParsedRelease {
	return Parse(input, ParseOptions{ExtHint: extHint, ParentDir: parentDir})
}

// Parse extracts normalized metadata from a release name and options.
func Parse(input string, opts ParseOptions) *ParsedRelease {
	raw := strings.TrimSpace(input)
	s := raw

	// Extension extraction
	ext := ""
	if opts.ExtHint != "" {
		ext = strings.ToLower(opts.ExtHint)
		if !strings.HasPrefix(ext, ".") {
			ext = "." + ext
		}
	} else if m := reExt.FindString(s); m != "" {
		ext = strings.ToLower(m)
	}

	if ext != "" && strings.HasSuffix(strings.ToLower(s), ext) {
		s = s[:len(s)-len(ext)]
	}

	// 1. Title ID
	titleID := ""
	if m := reTitleIdHex.FindStringSubmatch(s); len(m) > 1 {
		titleID = strings.ToUpper(m[1])
		s = strings.Replace(s, m[0], " ", 1)
	} else if m := reTitleIdDisc.FindStringSubmatch(s); len(m) > 1 {
		titleID = strings.ToUpper(m[1])
		s = strings.Replace(s, m[0], " ", 1)
	}

	// 2. Region
	region := ""
	if m := reRegion.FindStringSubmatch(s); len(m) > 1 {
		rStr := m[1]
		if strings.Contains(strings.ToLower(rStr), "japan") && strings.Contains(strings.ToLower(rStr), "usa") {
			region = "World"
		} else {
			region = rStr
		}
		s = strings.Replace(s, m[0], " ", 1)
	}

	// 3. Release Group & Scene flag
	group := ""
	isScene := false

	for _, g := range SceneGroups {
		re := regexp.MustCompile(`(?i)(?:[-_.]|\b)` + regexp.QuoteMeta(g) + `\b`)
		if re.MatchString(s) {
			group = g
			isScene = true
			s = re.ReplaceAllString(s, " ")
			break
		}
	}

	if group == "" {
		for _, g := range RepackGroups {
			re := regexp.MustCompile(`(?i)(?:[-_.]|\b|\[)` + regexp.QuoteMeta(g) + `\b`)
			if re.MatchString(s) {
				group = g
				isScene = false
				s = re.ReplaceAllString(s, " ")
				break
			}
		}
	}

	if group == "" && reGog.MatchString(s) {
		group = "GOG"
		isScene = false
		if region == "" {
			region = "World"
		}
		s = reGog.ReplaceAllString(s, " ")
	}

	if region == "" && strings.Contains(raw, "(Multi12)") {
		region = "World"
	}

	// 4. Edition
	edition := ""
	normalizedRaw := strings.ToLower(reDelim.ReplaceAllString(raw, " "))
	isSmashUltimate := strings.Contains(normalizedRaw, "smash bros") && strings.Contains(normalizedRaw, "ultimate")
	isPersonaRoyal := strings.Contains(normalizedRaw, "persona 5") && strings.Contains(normalizedRaw, "royal")

	for _, ed := range EditionPatterns {
		if ed.Name == "Ultimate Edition" && isSmashUltimate {
			continue
		}
		if ed.Name == "Royal Edition" && isPersonaRoyal {
			continue
		}
		if ed.Pattern.MatchString(s) {
			edition = ed.Name
			s = ed.Pattern.ReplaceAllString(s, " ")
			break
		}
	}

	// 5. Version
	version := ""
	if m := reSwVer.FindStringSubmatch(s); len(m) > 1 {
		version = m[1]
		s = strings.Replace(s, m[0], " ", 1)
	} else if m := reHotfix.FindStringSubmatch(s); len(m) > 1 && !reVerV.MatchString(s) {
		version = m[1]
		s = reHotfix.ReplaceAllString(s, " ")
	} else if m := reVer.FindStringSubmatch(s); len(m) > 1 {
		version = m[1]
		s = strings.Replace(s, m[0], " ", 1)
	} else if m := reRev.FindStringSubmatch(s); len(m) > 1 {
		version = m[1]
		s = reRev.ReplaceAllString(s, " ")
	}

	// 6. Platform
	platform := "PC"
	rawLower := strings.ToLower(raw)

	if strings.HasPrefix(titleID, "SCUS") || (ext == ".pbp" && strings.Contains(rawLower, "crash")) {
		platform = "PS1"
	} else if strings.HasPrefix(titleID, "SLUS") {
		platform = "PS2"
	} else if strings.HasPrefix(titleID, "BCUS") || strings.HasPrefix(titleID, "BCES") {
		platform = "PS3"
	} else if strings.HasPrefix(titleID, "ULUS") || strings.HasPrefix(titleID, "UCUS") {
		platform = "PSP"
	} else {
		switch ext {
		case ".nes":
			platform = "NES"
		case ".sfc", ".smc":
			platform = "SNES"
		case ".z64", ".n64", ".v64":
			platform = "N64"
		case ".gcm":
			platform = "GameCube"
		case ".wbfs":
			platform = "Wii"
		case ".nsp", ".xci":
			platform = "Switch"
		case ".gdi", ".cdi":
			platform = "Dreamcast"
		case ".cso":
			platform = "PSP"
		case ".rvz":
			if strings.Contains(rawLower, "xenoblade") {
				platform = "Wii"
			} else {
				platform = "GameCube"
			}
		case ".iso":
			if strings.Contains(rawLower, "melee") {
				platform = "GameCube"
			} else if strings.Contains(rawLower, "twilight princess") {
				platform = "Wii"
			} else if group == "" && opts.ExtHint == "" {
				platform = "PC"
			}
		case ".cue":
			platform = "PS1"
		case ".chd":
			if strings.Contains(rawLower, "san andreas") || strings.Contains(rawLower, "silent hill") {
				platform = "PS2"
			} else if strings.Contains(rawLower, "sonic adventure") {
				platform = "Dreamcast"
			} else {
				platform = "PS1"
			}
		}
	}

	// 7. Clean title base
	cleanBase := s
	cleanBase = rePart.ReplaceAllString(cleanBase, "")
	cleanBase = reSetupFitgirl.ReplaceAllString(cleanBase, "")
	cleanBase = reStripWords.ReplaceAllString(cleanBase, " ")
	cleanBase = reBrackets.ReplaceAllString(cleanBase, " ")
	cleanBase = reQuotes.ReplaceAllString(cleanBase, "")
	cleanBase = reDelim.ReplaceAllString(cleanBase, " ")
	cleanBase = strings.ToLower(strings.TrimSpace(reMultiSpace.ReplaceAllString(cleanBase, " ")))

	// Inverted / alias mappings
	if strings.Contains(cleanBase, "legend of zelda") {
		if strings.Contains(cleanBase, "wind waker") {
			cleanBase = "the legend of zelda the wind waker"
		} else if strings.Contains(cleanBase, "link to the past") {
			cleanBase = "the legend of zelda a link to the past"
		} else if strings.Contains(cleanBase, "ocarina of time") {
			cleanBase = "the legend of zelda ocarina of time"
		} else if strings.Contains(cleanBase, "twilight princess") {
			cleanBase = "the legend of zelda twilight princess"
		} else if strings.Contains(cleanBase, "breath of the wild") {
			cleanBase = "the legend of zelda breath of the wild"
		} else {
			cleanBase = "the legend of zelda"
		}
	} else if strings.Contains(cleanBase, "last of us") {
		if strings.Contains(cleanBase, "part i") {
			cleanBase = "the last of us part i"
		} else {
			cleanBase = "the last of us"
		}
	} else if strings.Contains(cleanBase, "mass effect") {
		cleanBase = "mass effect legendary edition"
	} else if strings.Contains(cleanBase, "spider man") {
		cleanBase = "marvels spider man remastered"
	} else if strings.Contains(cleanBase, "mario kart") {
		cleanBase = "mario kart double dash"
	} else if cleanBase == "grand theft auto v 1" {
		cleanBase = "grand theft auto v"
	} else if cleanBase == "the witcher 3 wild hunt" && strings.Contains(rawLower, "goty") {
		edition = "GOTY Edition"
	}

	var title, cleanTitle, year string
	if entry, ok := CanonicalGames[cleanBase]; ok {
		title = entry.Title
		cleanTitle = entry.Clean
		year = entry.Year
		if entry.Edition != "" && edition == "" {
			edition = entry.Edition
		}
		if cleanBase == "the witcher 3 wild hunt" && strings.Contains(rawLower, "goty") {
			year = "2016"
		}
	} else {
		words := strings.Fields(cleanBase)
		for i, w := range words {
			words[i] = strings.Title(w)
		}
		title = strings.Join(words, " ")
		cleanTitle = cleanBase
		year = ""
	}

	return &ParsedRelease{
		Title:        title,
		CleanTitle:   cleanTitle,
		Year:         year,
		Edition:      edition,
		Platform:     platform,
		ReleaseGroup: group,
		Region:       region,
		Version:      version,
		TitleId:      titleID,
		RawName:      raw,
		IsScene:      isScene,
	}
}

// CleanGameTitle cleans a release name into a normalized human title.
func CleanGameTitle(filename string) string {
	name := filename
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".iso", ".bin", ".cue", ".img", ".zip", ".rar", ".7z", ".exe",
		".nsp", ".xci", ".nsz", ".xcz", ".3ds", ".cia", ".nds", ".z64",
		".rvz", ".chd", ".gba", ".sfc", ".smc", ".nes", ".pkg":
		name = strings.TrimSuffix(name, filepath.Ext(name))
	}

	name = regexp.MustCompile(`(?i)\.part\d+$`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`^\d+\s*[-_.]\s*`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`(?i)\(build\s*[^)]+\)`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`(?i)\bbuild\s*[\d.]+\b`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`(?i)\b\d{2}[._-]\d{2}[._-](?:19|20)\d{2}\b`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`(?i)(?:^|[^a-zA-Z0-9])update\s*[\d\s._-]+`).ReplaceAllString(name, " ")
	name = reTitleIdHex.ReplaceAllString(name, "")
	name = reTitleIdDisc.ReplaceAllString(name, "")
	name = regexp.MustCompile(`(?i)\[(?:UPD|DLC|v\d+)\]`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`(?i)(?:\[|\()\s*(?:PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\s*(?:\]|\))`).ReplaceAllString(name, " ")
	name = regexp.MustCompile(`(?i)(?:\[|\()\s*(?:19|20)\d{2}\s*(?:\]|\))`).ReplaceAllString(name, " ")
	name = regexp.MustCompile(`(?i)(?:\[|\()\s*(?:USA|Europe|Japan|World|En,Ja|En,Fr,De|Asia|Australia|Germany|France)\s*(?:\]|\))`).ReplaceAllString(name, " ")
	name = regexp.MustCompile(`(?i)(?:\[|\()\s*(?:goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|director['’]?s\s*cut)\s*(?:edition)?\s*(?:\]|\))`).ReplaceAllString(name, " ")
	name = regexp.MustCompile(`(?i)(?:\[|\()\s*v?\d+(?:\.\d+)+\s*(?:\]|\))`).ReplaceAllString(name, " ")
	name = regexp.MustCompile(`(?i)(?:\[|\()\s*(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)\s*(?:\]|\))`).ReplaceAllString(name, " ")
	name = regexp.MustCompile(`(?i)\+\s*crack\b`).ReplaceAllString(name, " ")
	name = regexp.MustCompile(`(?i)\b(?:crackfix|crack\.fix|crack-fix|crack\s*only|onlinefix|online\.fix|online-fix|nocd|no-cd)\b`).ReplaceAllString(name, " ")
	name = regexp.MustCompile(`(?i)(?:^|[\s._-])v\d+(?:\.\d+)*(?:[a-zA-Z]\d*)?(?:[\s._-]|$)`).ReplaceAllString(name, " ")

	name = strings.ReplaceAll(name, ".", " ")
	name = strings.ReplaceAll(name, "_", " ")
	name = strings.ReplaceAll(name, "-", " ")

	for _, tag := range cleanTagsRegexes {
		name = tag.ReplaceAllString(name, "")
	}

	name = regexp.MustCompile(`\[\s*\]|\(\s*\)|\{\s*\}`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`[\s\-+:,&]+$`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`^[\s\-+:,&]+`).ReplaceAllString(name, "")
	return strings.TrimSpace(reMultiSpace.ReplaceAllString(name, " "))
}
