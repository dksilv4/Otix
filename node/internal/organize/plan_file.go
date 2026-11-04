package organize

import (
	"io/fs"
	"path/filepath"
	"strings"
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

func planFileItem(
	path string,
	d fs.DirEntry,
	actualCleanDir string,
	template string,
	sample bool,
	targetPaths map[string]bool,
) *PreviewItem {
	filename := d.Name()
	lowerName := strings.ToLower(filename)
	ext := strings.ToLower(filepath.Ext(path))

	if strings.HasPrefix(filename, ".") || ignoredFilenames[lowerName] || ignoredExtensions[ext] {
		return nil
	}
	if isNoise(filename, path) {
		return nil
	}

	var itemType, status, target string
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
	parentDir := resolveGameParentDir(path, actualCleanDir)

	if parentDir != "." && parentDir != "" && !strings.HasPrefix(parentDir, "..") {
		pRel := ParseReleaseName(parentDir)
		isGenericTitle := release.Title == "" || release.Title == "1" || len(release.Title) <= 3 ||
			strings.EqualFold(release.Title, "exe") || strings.EqualFold(release.Title, "bin") ||
			strings.EqualFold(release.Title, "patch") || strings.EqualFold(release.Title, "update") ||
			strings.EqualFold(release.Title, "setup") || strings.EqualFold(release.Title, "installer") ||
			strings.HasPrefix(strings.ToLower(release.Title), "elamigos")

		if pRel.Title != "" && (isGenericTitle || strings.EqualFold(parentDirRaw, "updates") || strings.EqualFold(parentDirRaw, "dlc") || strings.EqualFold(parentDirRaw, "crack") || strings.EqualFold(parentDirRaw, "patches")) {
			release.Title = pRel.Title
			if release.Year == "" {
				release.Year = pRel.Year
			}
			if release.Platform == "" || release.Platform == "PC" {
				release.Platform = pRel.Platform
			}
		}
	}

	folderTemplate := getFolderTemplate(template)
	gameFolderTarget := ApplyNamingTemplate(release, folderTemplate, "", actualCleanDir)

	if itemType == "crack" {
		status = "secondary_crack"
		target = filepath.Join(gameFolderTarget, "Crack", filename)
	} else if itemType == "update" || strings.Contains(lowerName, "[upd]") {
		status = "secondary_update"
		target = filepath.Join(gameFolderTarget, "Updates", filename)
	} else if itemType == "dlc" || strings.Contains(lowerName, "[dlc]") {
		status = "secondary_dlc"
		target = filepath.Join(gameFolderTarget, "DLC", filename)
	} else if itemType == "archive_part" {
		status = "secondary_archive_part"
		target = filepath.Join(gameFolderTarget, filename)
	} else {
		status = "rename_and_move"
		target = ApplyNamingTemplate(release, template, ext, actualCleanDir)
	}

	if st := resolveTargetConflict(path, target, targetPaths); st != "" {
		status = st
	}
	targetPaths[strings.ToLower(target)] = true

	folders := computeFoldersToCreate(target, actualCleanDir)
	relParent, _ := safeRel(actualCleanDir, filepath.Dir(path))
	srcSub := ""
	if relParent != "." && relParent != "" && !strings.HasPrefix(relParent, "..") {
		srcSub = filepath.ToSlash(relParent)
	}

	targetSub := ""
	if len(folders) > 0 {
		targetSub = filepath.ToSlash(folders[0])
	}

	fileSc, _ := findOtixSidecar(path)
	if fileSc != nil {
		if release.ReleaseGroup == "" && fileSc.ReleaseGroup != "" {
			release.ReleaseGroup = fileSc.ReleaseGroup
		}
		if release.Version == "" && fileSc.GameVersion != "" {
			release.Version = fileSc.GameVersion
		}
		if release.Edition == "" && fileSc.Edition != "" {
			release.Edition = fileSc.Edition
		}
		if release.TitleId == "" && fileSc.TitleID != "" {
			release.TitleId = fileSc.TitleID
		}
	}
	fileMatched := sample || (fileSc != nil && (fileSc.MediaID != "" || fileSc.Title != ""))

	return &PreviewItem{
		SourcePath:     path,
		SourceFilename: filename,
		Type:           itemType,
		Matched:        fileMatched,
		Extracted: map[string]string{
			"Title":        release.Title,
			"Year":         release.Year,
			"Platform":     release.Platform,
			"ReleaseGroup": release.ReleaseGroup,
			"Edition":      release.Edition,
			"Version":      release.Version,
			"Region":       release.Region,
			"TitleId":      release.TitleId,
		},
		TargetPath:         target,
		FoldersToCreate:    folders,
		Status:             status,
		SourceSubdirectory: srcSub,
		TargetSubdirectory: targetSub,
	}
}
