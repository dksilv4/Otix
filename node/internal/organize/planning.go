package organize

import (
	"io/fs"
	"os"
	"path/filepath"
)

type PreviewItem struct {
	SourcePath         string            `json:"sourcePath"`
	SourceFilename     string            `json:"sourceFilename"`
	Type               string            `json:"type"`
	Matched            bool              `json:"matched"`
	Extracted          map[string]string `json:"extracted"`
	TargetPath         string            `json:"targetPath"`
	FoldersToCreate    []string          `json:"foldersToCreate"`
	Status             string            `json:"status"` // "rename_and_move", "already_organized", "conflict", "sample", "secondary_update", "secondary_dlc", "secondary_crack", "container_package"
	Anomalies          []string          `json:"anomalies,omitempty"`
	SuggestedRenames   map[string]string `json:"suggestedRenames,omitempty"`
	Health             string            `json:"health,omitempty"`
	SourceSubdirectory string            `json:"sourceSubdirectory,omitempty"`
	TargetSubdirectory string            `json:"targetSubdirectory,omitempty"`
	Subdirectories     []string          `json:"subdirectories,omitempty"`
}

// PreviewOrganization generates a preview plan of file moves and renames without making any disk mutations.
func PreviewOrganization(dir string, template string, sample bool) ([]PreviewItem, error) {
	if template == "" {
		template = "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"
	}

	cleanDir := filepath.Clean(dir)
	if sample || cleanDir == "" || cleanDir == "." {
		return generateSamplePreviews(cleanDir, template), nil
	}

	actualCleanDir := ResolveUNCPath(cleanDir)
	info, err := os.Stat(actualCleanDir)
	if err != nil || !info.IsDir() {
		return generateSamplePreviews(cleanDir, template), nil
	}

	items := make([]PreviewItem, 0)
	targetPaths := make(map[string]bool)

	_ = filepath.WalkDir(actualCleanDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if d.IsDir() {
			item, skipDir, err := planFolderPackage(path, d, actualCleanDir, template, sample, targetPaths)
			if err != nil {
				return err
			}
			if item != nil {
				items = append(items, *item)
			}
			if skipDir {
				return filepath.SkipDir
			}
			return nil
		}

		if item := planFileItem(path, d, actualCleanDir, template, sample, targetPaths); item != nil {
			items = append(items, *item)
		}
		return nil
	})

	if len(items) == 0 && sample {
		return generateSamplePreviews(cleanDir, template), nil
	}

	for i := range items {
		items[i].SourcePath = UnresolveUNCPath(items[i].SourcePath)
		items[i].TargetPath = UnresolveUNCPath(items[i].TargetPath)
	}

	return items, nil
}
