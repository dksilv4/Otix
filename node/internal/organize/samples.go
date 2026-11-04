package organize

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func getFolderTemplate(template string) string {
	if template == "" {
		return "{Title} [{Platform}]"
	}
	parts := strings.Split(template, "/")
	last := parts[len(parts)-1]
	lastLower := strings.ToLower(last)
	if strings.Contains(lastLower, ".{ext}") ||
		strings.Contains(lastLower, "{originalname}") ||
		strings.Contains(lastLower, ".iso") ||
		strings.Contains(lastLower, ".exe") ||
		(strings.Contains(lastLower, ".") && !strings.Contains(lastLower, "{title}")) {
		if len(parts) > 1 {
			return strings.Join(parts[:len(parts)-1], "/")
		}
	}
	return template
}

func computeFoldersToCreate(targetPath, baseDir string) []string {
	targetDir := filepath.Dir(targetPath)
	rel, err := safeRel(baseDir, targetDir)
	if err != nil || rel == "." || rel == "" {
		return nil
	}
	if _, err := os.Stat(ResolveUNCPath(targetDir)); err == nil {
		return nil
	}
	return []string{filepath.Base(targetDir)}
}

func generateSamplePreviews(baseDir string, template string) []PreviewItem {
	if baseDir == "" || baseDir == "." {
		baseDir = "D:\\Games\\Library"
	}
	cleanBase := filepath.Clean(baseDir)
	items := make([]PreviewItem, 0)

	for _, s := range sampleReleases {
		release := ParseReleaseName(s.RawName)
		var filename string
		if s.Ext != "" {
			filename = fmt.Sprintf("%s.%s", s.RawName, s.Ext)
		} else {
			filename = s.RawName
		}

		source := filepath.Join(cleanBase, filepath.FromSlash(s.SubDir), filename)
		var target string
		var status string = "sample"

		folderTemplate := getFolderTemplate(template)
		gameFolderTarget := ApplyNamingTemplate(release, folderTemplate, "", cleanBase)

		if s.Category == "folder_package" {
			target = gameFolderTarget
			status = "container_package"
		} else if s.Category == "update" {
			status = "secondary_update"
			target = filepath.Join(gameFolderTarget, "Updates", filename)
		} else if s.Category == "dlc" {
			status = "secondary_dlc"
			target = filepath.Join(gameFolderTarget, "DLC", filename)
		} else {
			target = ApplyNamingTemplate(release, template, s.Ext, cleanBase)
		}

		folders := computeFoldersToCreate(target, cleanBase)
		targetSub := ""
		if len(folders) > 0 {
			targetSub = filepath.ToSlash(folders[0])
		}

		var sampleSubdirs []string
		if s.Category == "folder_package" {
			sampleSubdirs = []string{"Crack", "Support"}
		}

		items = append(items, PreviewItem{
			SourcePath:     source,
			SourceFilename: filename,
			Type:           s.Category,
			Matched:        true,
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
			SourceSubdirectory: filepath.ToSlash(s.SubDir),
			TargetSubdirectory: targetSub,
			Subdirectories:     sampleSubdirs,
		})
	}

	return items
}
