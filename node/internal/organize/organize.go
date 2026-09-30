package organize

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type PreviewItem struct {
	SourcePath      string            `json:"sourcePath"`
	SourceFilename  string            `json:"sourceFilename"`
	Type            string            `json:"type"`
	Matched         bool              `json:"matched"`
	Extracted       map[string]string `json:"extracted"`
	TargetPath      string            `json:"targetPath"`
	FoldersToCreate []string          `json:"foldersToCreate"`
	Status          string            `json:"status"` // "rename_and_move", "already_organized", "conflict", "sample"
}

type ExecuteItem struct {
	SourcePath string `json:"sourcePath"`
	TargetPath string `json:"targetPath"`
}

type ExecuteResult struct {
	SourcePath string `json:"sourcePath"`
	TargetPath string `json:"targetPath"`
	Success    bool   `json:"success"`
	Error      string `json:"error,omitempty"`
}

var sampleReleases = []struct {
	RawName  string
	Ext      string
	Platform string
}{
	{"Cyberpunk.2077.v2.12.REPACK-ELAMIGOS", "iso", "PC"},
	{"Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE", "iso", "PC"},
	{"The.Witcher.3.Wild.Hunt.GOTY-GOG", "iso", "PC"},
	{"Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL", "iso", "PC"},
}

var ignoredDirs = map[string]bool{
	"$recycle.bin": true, "system volume information": true,
	"node_modules": true, ".git": true, "windows": true,
	"appdata": true, "program files": true, "program files (x86)": true,
}

func PreviewOrganization(dir string, template string, sample bool) ([]PreviewItem, error) {
	if template == "" {
		template = "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"
	}

	cleanDir := filepath.Clean(dir)

	// If sample mode requested, return simulated realistic releases
	if sample || cleanDir == "" || cleanDir == "." {
		return generateSamplePreviews(cleanDir, template), nil
	}

	// Verify directory exists
	info, err := os.Stat(cleanDir)
	if err != nil || !info.IsDir() {
		// Return samples gracefully if directory not found on host
		return generateSamplePreviews(cleanDir, template), nil
	}

	var items []PreviewItem

	// Scan directory for ISO files up to depth 4
	_ = filepath.WalkDir(cleanDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if d.IsDir() {
			nameLower := strings.ToLower(d.Name())
			if ignoredDirs[nameLower] || strings.HasPrefix(nameLower, "$") || strings.HasPrefix(nameLower, ".") {
				return filepath.SkipDir
			}
			// Limit scan depth
			rel, _ := filepath.Rel(cleanDir, path)
			if strings.Count(rel, string(filepath.Separator)) > 4 {
				return filepath.SkipDir
			}
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if ext == ".iso" {
			filename := d.Name()
			release := ParseReleaseName(filename)
			target := ApplyNamingTemplate(release, template, ext, cleanDir)

			folders := computeFoldersToCreate(target, cleanDir)
			status := "rename_and_move"
			if filepath.Clean(path) == filepath.Clean(target) {
				status = "already_organized"
			}

			items = append(items, PreviewItem{
				SourcePath:     path,
				SourceFilename: filename,
				Type:           "iso",
				Matched:        true,
				Extracted: map[string]string{
					"Title":        release.Title,
					"Year":         release.Year,
					"Platform":     release.Platform,
					"ReleaseGroup": release.ReleaseGroup,
					"Edition":      release.Edition,
					"Version":      release.Version,
				},
				TargetPath:      target,
				FoldersToCreate: folders,
				Status:          status,
			})
		}

		return nil
	})

	if len(items) == 0 {
		return generateSamplePreviews(cleanDir, template), nil
	}

	return items, nil
}

func generateSamplePreviews(baseDir string, template string) []PreviewItem {
	if baseDir == "" || baseDir == "." {
		baseDir = "D:\\Games\\ISOs"
	}
	cleanBase := filepath.Clean(baseDir)

	var items []PreviewItem
	for _, s := range sampleReleases {
		release := ParseReleaseName(s.RawName)
		filename := fmt.Sprintf("%s.%s", s.RawName, s.Ext)
		source := filepath.Join(cleanBase, "Downloads", filename)
		target := ApplyNamingTemplate(release, template, s.Ext, cleanBase)

		folders := computeFoldersToCreate(target, cleanBase)

		items = append(items, PreviewItem{
			SourcePath:     source,
			SourceFilename: filename,
			Type:           "iso",
			Matched:        true,
			Extracted: map[string]string{
				"Title":        release.Title,
				"Year":         release.Year,
				"Platform":     release.Platform,
				"ReleaseGroup": release.ReleaseGroup,
				"Edition":      release.Edition,
				"Version":      release.Version,
			},
			TargetPath:      target,
			FoldersToCreate: folders,
			Status:          "sample",
		})
	}
	return items
}

func computeFoldersToCreate(targetPath, baseDir string) []string {
	targetDir := filepath.Dir(targetPath)
	rel, err := filepath.Rel(baseDir, targetDir)
	if err != nil || rel == "." || rel == "" {
		return nil
	}

	// Check if target directory already exists
	if _, err := os.Stat(targetDir); err == nil {
		return nil
	}

	return []string{filepath.Base(targetDir)}
}

func ExecuteOrganization(items []ExecuteItem) ([]ExecuteResult, error) {
	var results []ExecuteResult

	for _, item := range items {
		src := filepath.Clean(item.SourcePath)
		dst := filepath.Clean(item.TargetPath)

		if src == dst {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    true,
			})
			continue
		}

		// Ensure target directory exists
		targetDir := filepath.Dir(dst)
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    false,
				Error:      fmt.Sprintf("Failed to create directory: %v", err),
			})
			continue
		}

		// Atomic rename/move
		if err := os.Rename(src, dst); err != nil {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    false,
				Error:      fmt.Sprintf("Failed to move file: %v", err),
			})
			continue
		}

		results = append(results, ExecuteResult{
			SourcePath: src,
			TargetPath: dst,
			Success:    true,
		})
	}

	return results, nil
}
