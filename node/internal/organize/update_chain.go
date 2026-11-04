package organize

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var updateRangeRegex = regexp.MustCompile(`(?i)(?:update|patch|v)?\s*v?([0-9]+(?:\.[0-9]+)*|\d{2}[._-]\d{2}[._-]\d{4}|\d{4,8})\s*(?:-|to|_to_|\s-\s)\s*v?([0-9]+(?:\.[0-9]+)*|\d{2}[._-]\d{2}[._-]\d{4}|\d{4,8})`)

type PatchRange struct {
	Filename string
	From     string
	To       string
}

func parseDateOrSemVerParts(s string) []int {
	clean := strings.TrimPrefix(strings.TrimSpace(strings.ToLower(s)), "v")
	dateRegex := regexp.MustCompile(`^(\d{2})[._-](\d{2})[._-](\d{4})$`)
	if m := dateRegex.FindStringSubmatch(clean); len(m) == 4 {
		d, _ := strconv.Atoi(m[1])
		mth, _ := strconv.Atoi(m[2])
		y, _ := strconv.Atoi(m[3])
		return []int{y, mth, d}
	}
	chunks := regexp.MustCompile(`[._-]`).Split(clean, -1)
	var parts []int
	for _, c := range chunks {
		if val, err := strconv.Atoi(c); err == nil {
			parts = append(parts, val)
		}
	}
	return parts
}

func compareVersionStrings(v1, v2 string) int {
	if v1 == v2 {
		return 0
	}
	p1 := parseDateOrSemVerParts(v1)
	p2 := parseDateOrSemVerParts(v2)
	minLen := len(p1)
	if len(p2) < minLen {
		minLen = len(p2)
	}
	for i := 0; i < minLen; i++ {
		if p1[i] < p2[i] {
			return -1
		}
		if p1[i] > p2[i] {
			return 1
		}
	}
	if len(p1) < len(p2) {
		return -1
	}
	if len(p1) > len(p2) {
		return 1
	}
	if len(p1) > 0 {
		return 0
	}
	return strings.Compare(v1, v2)
}

func parseUpdateRange(filename string) (from, to string, ok bool) {
	clean := strings.TrimSuffix(filename, filepath.Ext(filename))
	m := updateRangeRegex.FindStringSubmatch(clean)
	if len(m) >= 3 {
		return m[1], m[2], true
	}
	return "", "", false
}

func checkUpdateChain(dirPath string, baseVersion string) (anomalies []string, reachableVer string, targetVer string) {
	var candidateFiles []string
	if entries, err := os.ReadDir(dirPath); err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				candidateFiles = append(candidateFiles, e.Name())
			} else if strings.Contains(strings.ToLower(e.Name()), "update") {
				candidateFiles = append(candidateFiles, e.Name())
				if subEntries, subErr := os.ReadDir(filepath.Join(dirPath, e.Name())); subErr == nil {
					for _, se := range subEntries {
						if !se.IsDir() {
							candidateFiles = append(candidateFiles, se.Name())
						}
					}
				}
			}
		}
	}

	seenRanges := make(map[string]bool)
	var patches []PatchRange
	for _, f := range candidateFiles {
		from, to, ok := parseUpdateRange(f)
		if ok {
			key := from + "->" + to
			if !seenRanges[key] {
				seenRanges[key] = true
				patches = append(patches, PatchRange{Filename: f, From: from, To: to})
			}
		}
	}

	if len(patches) == 0 {
		return nil, baseVersion, baseVersion
	}

	sort.Slice(patches, func(i, j int) bool {
		cmp := compareVersionStrings(patches[i].From, patches[j].From)
		if cmp != 0 {
			return cmp < 0
		}
		return compareVersionStrings(patches[i].To, patches[j].To) < 0
	})

	targetVer = patches[len(patches)-1].To
	reachableVer = baseVersion
	chainBroken := false

	for i := 0; i < len(patches); i++ {
		curr := patches[i]
		if i == 0 {
			if baseVersion != "" && compareVersionStrings(baseVersion, curr.From) < 0 {
				anomalies = append(anomalies, fmt.Sprintf("Broken update chain: base game is v%s, but earliest available update '%s' requires v%s", baseVersion, curr.Filename, curr.From))
				chainBroken = true
			} else {
				reachableVer = curr.To
			}
		} else {
			prev := patches[i-1]
			cmp := compareVersionStrings(prev.To, curr.From)
			if cmp < 0 {
				anomalies = append(anomalies, fmt.Sprintf("Broken update chain: missing update between v%s and v%s (patch '%s' requires v%s but previous update only reaches v%s)", prev.To, curr.From, curr.Filename, curr.From, prev.To))
				chainBroken = true
			} else if !chainBroken && cmp == 0 {
				reachableVer = curr.To
			}
		}
	}

	return anomalies, reachableVer, targetVer
}
