package organize

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	reYearDigit      = regexp.MustCompile(`\b((?:19|20)\d{2})\b`)
	reDedupPlatforms = regexp.MustCompile(`(?i)(?:\[|\()\s*(PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\s*(?:\]|\))[\s_-]*(?:\[|\()\s*(PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\s*(?:\]|\))`)
	reTagPair        = regexp.MustCompile(`(?i)(?:\[([^\]]+)\]|\(([^)]+)\))\s*[\s_-]*\s*(?:\[([^\]]+)\]|\(([^)]+)\))`)
	reMultiSlash     = regexp.MustCompile(`/+`)
	reMultiSpace     = regexp.MustCompile(`\s{2,}`)
	reUnresolved     = regexp.MustCompile(`(?i)(?:\[|\(|\{)\s*\{[a-zA-Z0-9_]+\}\s*(?:\]|\)|\})`)
	reEmptyBrackets  = regexp.MustCompile(`\(\s*\)|\[\s*\]|\{\s*\}`)
)

// SanitizePathSegment cleans illegal characters from path tokens.
func SanitizePathSegment(val string) string {
	if val == "" {
		return ""
	}
	return sanitizePathTitle(val)
}

// ExtractYear extracts four-digit release year from a string.
func ExtractYear(s string) int {
	m := reYearDigit.FindStringSubmatch(s)
	if len(m) > 1 {
		if y, err := strconv.Atoi(m[1]); err == nil {
			return y
		}
	}
	return 0
}

func canonicalTagName(raw string) string {
	cleaned := strings.ToLower(strings.TrimSpace(raw))
	if cleaned == "nsw" || cleaned == "switch" {
		return "switch"
	}
	if cleaned == "win" || cleaned == "windows" || cleaned == "pc" {
		return "pc"
	}
	return cleaned
}

func dedupAllBracketTags(pathStr string) string {
	segments := strings.Split(strings.ReplaceAll(pathStr, "\\", "/"), "/")
	tagRegex := regexp.MustCompile(`\[([^\]]+)\]|\(([^)]+)\)`)

	for sIdx, seg := range segments {
		matches := tagRegex.FindAllStringSubmatchIndex(seg, -1)
		if len(matches) <= 1 {
			continue
		}

		for i := len(matches) - 1; i >= 0; i-- {
			m := matches[i]
			tagText := ""
			if m[2] != -1 && m[3] != -1 {
				tagText = seg[m[2]:m[3]]
			} else if m[4] != -1 && m[5] != -1 {
				tagText = seg[m[4]:m[5]]
			}
			canon := canonicalTagName(tagText)
			if canon == "" {
				continue
			}

			isDup := false
			for j := 0; j < i; j++ {
				mj := matches[j]
				prevText := ""
				if mj[2] != -1 && mj[3] != -1 {
					prevText = seg[mj[2]:mj[3]]
				} else if mj[4] != -1 && mj[5] != -1 {
					prevText = seg[mj[4]:mj[5]]
				}
				if canonicalTagName(prevText) == canon {
					isDup = true
					break
				}
			}
			if isDup {
				start := m[0]
				end := m[1]
				if start > 0 && seg[start-1] == ' ' {
					start--
				} else if end < len(seg) && seg[end] == ' ' {
					end++
				}
				seg = seg[:start] + seg[end:]
			}
		}
		segments[sIdx] = seg
	}
	return strings.Join(segments, "/")
}

// ApplyNamingTemplate formats game release into target directory and file name.
func ApplyNamingTemplate(release ParsedRelease, template string, ext string, baseDir string) string {
	extClean := strings.TrimPrefix(ext, ".")
	if extClean == "" {
		extClean = "iso"
	}

	rawBase := release.RawName
	if extClean != "" && strings.HasSuffix(strings.ToLower(rawBase), "."+strings.ToLower(extClean)) {
		rawBase = rawBase[:len(rawBase)-(len(extClean)+1)]
	}

	tokens := map[string]string{
		"Title":        SanitizePathSegment(release.Title),
		"CleanTitle":   SanitizePathSegment(release.CleanTitle),
		"Year":         release.Year,
		"Edition":      SanitizePathSegment(release.Edition),
		"Platform":     SanitizePathSegment(release.Platform),
		"ReleaseGroup": SanitizePathSegment(release.ReleaseGroup),
		"Version":      SanitizePathSegment(release.Version),
		"Region":       SanitizePathSegment(release.Region),
		"TitleId":      SanitizePathSegment(release.TitleId),
		"OriginalName": SanitizePathSegment(rawBase),
		"MediaType":    SanitizePathSegment(release.Platform),
		"ext":          extClean,
	}

	result := template
	for k, v := range tokens {
		re := regexp.MustCompile("(?i)\\{" + k + "\\}")
		result = re.ReplaceAllString(result, v)
	}

	result = reUnresolved.ReplaceAllString(result, "")
	result = reEmptyBrackets.ReplaceAllString(result, "")

	for reDedupPlatforms.MatchString(result) {
		result = reDedupPlatforms.ReplaceAllString(result, "[$1]")
	}

	for {
		changed := false
		result = reTagPair.ReplaceAllStringFunc(result, func(match string) string {
			sub := reTagPair.FindStringSubmatch(match)
			if len(sub) >= 5 {
				t1 := sub[1]
				if t1 == "" {
					t1 = sub[2]
				}
				t2 := sub[3]
				if t2 == "" {
					t2 = sub[4]
				}
				if strings.EqualFold(strings.TrimSpace(t1), strings.TrimSpace(t2)) && strings.TrimSpace(t1) != "" {
					changed = true
					return "[" + strings.TrimSpace(t1) + "]"
				}
			}
			return match
		})
		if !changed {
			break
		}
	}

	result = dedupAllBracketTags(result)
	result = strings.ReplaceAll(result, "\\", "/")
	result = reMultiSlash.ReplaceAllString(result, "/")
	result = strings.TrimPrefix(result, "/")
	result = strings.TrimSuffix(result, "/")
	result = reMultiSpace.ReplaceAllString(result, " ")
	result = strings.ReplaceAll(result, " /", "/")
	result = strings.ReplaceAll(result, "/ ", "/")

	if baseDir != "" {
		cleanBase := filepath.Clean(baseDir)
		targetRel := filepath.FromSlash(result)
		return filepath.Join(cleanBase, targetRel)
	}
	return filepath.FromSlash(result)
}
