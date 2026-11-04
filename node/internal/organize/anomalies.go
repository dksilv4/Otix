package organize

import (
	"fmt"
	"os"
	"path/filepath"
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

func detectPackageAnomalies(children []os.DirEntry, isElAmigos bool) ([]string, map[string]string, string) {
	var anomalies []string
	suggestedRenames := make(map[string]string)
	health := "HEALTHY"

	if isElAmigos {
		for _, c := range children {
			cName := strings.ToLower(c.Name())
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
	return anomalies, suggestedRenames, health
}

func detectConsolePackage(path string, children []os.DirEntry) (bool, string, string, string) {
	isConsolePackage := false
	consolePlatform := ""
	ps5TitleId := ""
	ps5TitleName := ""

	for _, c := range children {
		cName := strings.ToLower(c.Name())
		if cName == "ps3_game" || cName == "ps3_disc.sfb" {
			isConsolePackage = true
			consolePlatform = "PS3"
		}
		if cName == "sce_sys" {
			isConsolePackage = true
			consolePlatform = "PS4"
			paramJsonPath := filepath.Join(path, c.Name(), "param.json")
			if _, pErr := os.Stat(paramJsonPath); pErr == nil {
				consolePlatform = "PS5"
				if tId, tName := parsePS5ParamJSON(paramJsonPath); tId != "" || tName != "" {
					if tId != "" {
						ps5TitleId = tId
					}
					if tName != "" {
						ps5TitleName = tName
					}
				}
			}
		}
		if strings.HasPrefix(cName, "ppsa") || strings.Contains(cName, "ps5") {
			isConsolePackage = true
			consolePlatform = "PS5"
			if c.IsDir() {
				subParam := filepath.Join(path, c.Name(), "sce_sys", "param.json")
				if _, pErr := os.Stat(subParam); pErr == nil {
					if tId, tName := parsePS5ParamJSON(subParam); tId != "" || tName != "" {
						if tId != "" {
							ps5TitleId = tId
						}
						if tName != "" {
							ps5TitleName = tName
						}
					}
				}
			}
		}
	}
	return isConsolePackage, consolePlatform, ps5TitleId, ps5TitleName
}

func resolvePackageRelease(
	actualName string,
	dirName string,
	sc *otixmeta.Sidecar,
	consolePlatform string,
	ps5TitleId string,
	ps5TitleName string,
	isPcPackage bool,
	isConsolePackage bool,
	actualPath string,
) ParsedRelease {
	var release ParsedRelease
	isLinked := sc != nil && (sc.MediaID != "" || sc.Title != "")

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
		if y == "" && actualName != dirName {
			y = yearFromSidecar(sc, dirName)
		}
		tId := sc.TitleID
		if tId == "" {
			tId = ps5TitleId
		}
		release = ParsedRelease{
			Title:      t,
			CleanTitle: t,
			Platform:   plat,
			Year:       y,
			TitleId:    tId,
			RawName:    actualName,
		}
	} else {
		release = ParseReleaseName(actualName)
		if actualName != dirName {
			parentRel := ParseReleaseName(dirName)
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
		if consolePlatform == "PS5" {
			if ps5TitleId != "" {
				release.TitleId = ps5TitleId
			}
			if ps5TitleName != "" {
				release.Title = ps5TitleName
				release.CleanTitle = CleanGameTitle(ps5TitleName)
			} else if strings.EqualFold(release.Title, "app0") || strings.HasPrefix(strings.ToLower(release.Title), "app0") {
				paramPath := filepath.Join(actualPath, "sce_sys", "param.json")
				if tId, tName := parsePS5ParamJSON(paramPath); tId != "" || tName != "" {
					if tId != "" {
						release.TitleId = tId
					}
					if tName != "" {
						release.Title = tName
						release.CleanTitle = CleanGameTitle(tName)
					}
				}
			}
		}
	}

	if sc != nil {
		if release.ReleaseGroup == "" && sc.ReleaseGroup != "" {
			release.ReleaseGroup = sc.ReleaseGroup
		}
		if release.Version == "" && sc.GameVersion != "" {
			release.Version = sc.GameVersion
		}
		if release.Edition == "" && sc.Edition != "" {
			release.Edition = sc.Edition
		}
		if release.TitleId == "" && sc.TitleID != "" {
			release.TitleId = sc.TitleID
		}
	}

	return release
}

func resolveTargetConflict(actualPath, target string, targetPaths map[string]bool) string {
	cleanSrc := strings.ToLower(filepath.Clean(actualPath))
	cleanDst := strings.ToLower(filepath.Clean(target))
	if cleanSrc == cleanDst {
		return "already_organized"
	}
	if targetPaths[cleanDst] {
		return "conflict"
	}
	if strings.HasPrefix(cleanDst, cleanSrc+string(filepath.Separator)) {
		return "conflict"
	}
	if fi, err := os.Stat(target); err == nil {
		if fi.IsDir() {
			entries, err := os.ReadDir(target)
			if err == nil && len(entries) > 0 {
				return "conflict"
			}
		} else {
			return "conflict"
		}
	}
	return ""
}
