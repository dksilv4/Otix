package organize

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ExecuteItem specifies source and target filepaths for an organization operation.
type ExecuteItem struct {
	SourcePath string `json:"sourcePath"`
	TargetPath string `json:"targetPath"`
}

func (e *ExecuteItem) UnmarshalJSON(data []byte) error {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if v, ok := raw["sourcePath"].(string); ok && v != "" {
		e.SourcePath = v
	} else if v, ok := raw["source_path"].(string); ok && v != "" {
		e.SourcePath = v
	}
	if v, ok := raw["targetPath"].(string); ok && v != "" {
		e.TargetPath = v
	} else if v, ok := raw["target_path"].(string); ok && v != "" {
		e.TargetPath = v
	}
	return nil
}

// ExecuteResult contains the execution status of a single organized item.
type ExecuteResult struct {
	SourcePath string `json:"sourcePath"`
	TargetPath string `json:"targetPath"`
	Success    bool   `json:"success"`
	Error      string `json:"error,omitempty"`
}

// ExecuteOrganization runs the planned file operations with atomic moves, collision checks, and zero data overwrite.
func ExecuteOrganization(items []ExecuteItem, deleteEmptyFolders ...bool) ([]ExecuteResult, error) {
	var results []ExecuteResult

	for _, item := range items {
		if strings.TrimSpace(item.SourcePath) == "" || strings.TrimSpace(item.TargetPath) == "" {
			results = append(results, ExecuteResult{
				SourcePath: item.SourcePath,
				TargetPath: item.TargetPath,
				Success:    false,
				Error:      "Source or target path is empty",
			})
			continue
		}

		src := filepath.Clean(item.SourcePath)
		dst := filepath.Clean(item.TargetPath)

		actualSrc := ResolveUNCPath(src)
		actualDst := ResolveUNCPath(dst)

		if strings.EqualFold(actualSrc, actualDst) {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    true,
			})
			continue
		}

		cleanSrc := strings.ToLower(actualSrc)
		cleanDst := strings.ToLower(actualDst)

		if strings.HasPrefix(cleanDst, cleanSrc+string(filepath.Separator)) {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    false,
				Error:      fmt.Sprintf("Cannot copy or move '%s' to a subdirectory of self '%s'", src, dst),
			})
			continue
		}

		if fi, err := os.Stat(actualDst); err == nil {
			if fi.IsDir() {
				entries, err := os.ReadDir(actualDst)
				if err == nil && len(entries) > 0 {
					results = append(results, ExecuteResult{
						SourcePath: src,
						TargetPath: dst,
						Success:    false,
						Error:      fmt.Sprintf("Target path already exists and is not empty: %s", dst),
					})
					continue
				}
				_ = os.Remove(actualDst)
			} else {
				results = append(results, ExecuteResult{
					SourcePath: src,
					TargetPath: dst,
					Success:    false,
					Error:      fmt.Sprintf("Target path already exists: %s", dst),
				})
				continue
			}
		}

		if err := moveAtomic(actualSrc, actualDst); err != nil {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    false,
				Error:      err.Error(),
			})
			continue
		}

		if strings.HasSuffix(strings.ToLower(actualDst), ".iso") || strings.HasSuffix(strings.ToLower(actualDst), ".pkg") {
			syncSidecarMetadata(actualSrc, actualDst)
		} else if fi, err := os.Stat(actualDst); err == nil && fi.IsDir() {
			syncPS5Sidecar(actualDst)
			syncSidecarMetadata(actualSrc, actualDst)
		}

		srcDir := filepath.Dir(actualSrc)
		if len(deleteEmptyFolders) > 0 && deleteEmptyFolders[0] {
			cleanEmptyDirsUp(srcDir, 4)
		} else {
			cleanEmptyDirsUp(srcDir, 1)
		}

		results = append(results, ExecuteResult{
			SourcePath: src,
			TargetPath: dst,
			Success:    true,
		})
	}

	return results, nil
}
