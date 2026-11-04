package organize

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

func planFolderPackage(
	path string,
	d fs.DirEntry,
	actualCleanDir string,
	template string,
	sample bool,
	targetPaths map[string]bool,
) (*PreviewItem, bool, error) {
	nameLower := strings.ToLower(d.Name())
	if noiseDirectoryNames[nameLower] || strings.HasPrefix(nameLower, "$") || strings.HasPrefix(nameLower, ".") {
		return nil, true, nil
	}

	if nameLower == "updates" || nameLower == "dlc" || nameLower == "support" || nameLower == "_commonredist" || isCollectionFolder(nameLower) {
		return nil, false, nil
	}

	const maxOrganizeScanDepth = 12
	rel, _ := safeRel(actualCleanDir, path)
	if rel != "." && strings.Count(rel, string(filepath.Separator)) <= maxOrganizeScanDepth {
		children, rErr := os.ReadDir(path)
		if rErr == nil && len(children) > 0 {
			hasSetup, hasBin, hasGameExe, hasCrackDll, hasIso := false, false, false, false, false
			folderLower := strings.ToLower(d.Name())
			isElAmigos := strings.Contains(folderLower, "elamigos")

			isConsolePackage, consolePlatform, ps5TitleId, ps5TitleName := detectConsolePackage(path, children)
			anomalies, suggestedRenames, health := detectPackageAnomalies(children, isElAmigos)

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
				if isoExtensions[strings.ToLower(filepath.Ext(c.Name()))] {
					hasIso = true
				}
			}

			sc, _ := findOtixSidecar(path)
			isGenericContainer := isGenericContainerName(folderLower) || isCollectionFolder(d.Name())
			if isGenericContainer {
				return nil, false, nil
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
				release := resolvePackageRelease(
					actualName, d.Name(), sc,
					consolePlatform, ps5TitleId, ps5TitleName,
					isPcPackage, isConsolePackage, actualPath,
				)

				if strings.TrimSpace(release.Title) == "" {
					return nil, false, nil
				}

				chainAnomalies, reachableVer, targetVer := checkUpdateChain(actualPath, release.Version)
				if len(chainAnomalies) == 0 && targetVer == release.Version && actualPath != path {
					pAnomalies, pReachable, pTarget := checkUpdateChain(path, release.Version)
					if len(pAnomalies) > 0 || pTarget != release.Version {
						chainAnomalies = pAnomalies
						reachableVer = pReachable
						targetVer = pTarget
					}
				}
				if len(chainAnomalies) > 0 {
					anomalies = append(anomalies, chainAnomalies...)
					if health == "HEALTHY" {
						health = "WARNING"
					}
				}

				folderTemplate := getFolderTemplate(template)
				target := ApplyNamingTemplate(release, folderTemplate, "", actualCleanDir)

				status := "container_package"
				if isCrackFolder {
					if strings.EqualFold(actualName, "crack") || strings.EqualFold(actualName, "cracks") {
						target = filepath.Join(target, "Crack")
					} else {
						target = filepath.Join(target, "Crack", actualName)
					}
					status = "secondary_crack"
				} else if st := resolveTargetConflict(actualPath, target, targetPaths); st != "" {
					status = st
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

				relParent, _ := safeRel(actualCleanDir, filepath.Dir(actualPath))
				srcSub := ""
				if relParent != "." && relParent != "" && !strings.HasPrefix(relParent, "..") {
					srcSub = filepath.ToSlash(relParent)
				}

				targetFolders := computeFoldersToCreate(target, actualCleanDir)
				targetSub := ""
				if len(targetFolders) > 0 {
					targetSub = filepath.ToSlash(targetFolders[0])
				}

				extMap := map[string]string{
					"Title":        release.Title,
					"Year":         release.Year,
					"Platform":     release.Platform,
					"ReleaseGroup": release.ReleaseGroup,
					"Edition":      release.Edition,
					"Version":      release.Version,
				}
				if reachableVer != "" {
					extMap["ReachableVersion"] = reachableVer
				}
				if targetVer != "" {
					extMap["TargetVersion"] = targetVer
				}
				if release.TitleId != "" {
					extMap["TitleId"] = release.TitleId
					extMap["ps_id"] = release.TitleId
				}
				if isLinked && sc.MediaID != "" {
					extMap["MediaID"] = sc.MediaID
				}

				item := &PreviewItem{
					SourcePath:         actualPath,
					SourceFilename:     actualName,
					Type:               "folder_package",
					Matched:            isLinked || sample,
					Extracted:          extMap,
					TargetPath:         target,
					FoldersToCreate:    targetFolders,
					Status:             status,
					Anomalies:          anomalies,
					SuggestedRenames:   suggestedRenames,
					Health:             health,
					SourceSubdirectory: srcSub,
					TargetSubdirectory: targetSub,
					Subdirectories:     subdirs,
				}

				return item, true, nil
			}
		}
	}

	if strings.Count(rel, string(filepath.Separator)) > maxOrganizeScanDepth {
		return nil, true, nil
	}
	return nil, false, nil
}
