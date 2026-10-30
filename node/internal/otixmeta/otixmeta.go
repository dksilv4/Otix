// Package otixmeta reads and writes invisible `.otix` sidecars next to game roots.
package otixmeta

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const Filename = ".otix"
const Version = 1

// ImageRef holds a remote URL and optional local relative filename.
type ImageRef struct {
	URL   string  `json:"url,omitempty"`
	Local *string `json:"local"`
}

// Sidecar is the v1 `.otix` JSON schema.
type Sidecar struct {
	Version      int                  `json:"version"`
	MediaID      string               `json:"mediaId,omitempty"`
	IgdbID       string               `json:"igdbId,omitempty"`
	TitleID      string               `json:"titleId,omitempty"`
	Title        string               `json:"title,omitempty"`
	Slug         string               `json:"slug,omitempty"`
	ReleaseGroup string               `json:"releaseGroup,omitempty"`
	GameVersion  string               `json:"gameVersion,omitempty"`
	Edition      string               `json:"edition,omitempty"`
	OriginalName string               `json:"originalName,omitempty"`
	Confidence   float64              `json:"confidence,omitempty"`
	MatchSource  string               `json:"matchSource,omitempty"`
	MatchedAt    string               `json:"matchedAt,omitempty"`
	Overview     string               `json:"overview,omitempty"`
	Genres       []map[string]any     `json:"genres,omitempty"`
	Companies    []map[string]any     `json:"companies,omitempty"`
	Platforms    []map[string]any     `json:"platforms,omitempty"`
	Images       map[string]*ImageRef `json:"images,omitempty"`
	ExeRelative  string               `json:"exeRelative,omitempty"`
}

// Path returns the absolute `.otix` path for a game root.
func Path(gameRoot string) string {
	return filepath.Join(gameRoot, Filename)
}

// Read loads a sidecar from gameRoot. Returns (nil, nil) when missing.
func Read(gameRoot string) (*Sidecar, error) {
	path := Path(gameRoot)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var sc Sidecar
	if err := json.Unmarshal(data, &sc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &sc, nil
}

// Write persists a sidecar to gameRoot/.otix.
func Write(gameRoot string, sc *Sidecar) error {
	if sc == nil {
		return fmt.Errorf("nil sidecar")
	}
	if sc.Version == 0 {
		sc.Version = Version
	}
	if sc.MatchedAt == "" {
		sc.MatchedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if err := os.MkdirAll(gameRoot, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(sc, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(Path(gameRoot), data, 0o644)
}

var imageRoles = []string{"poster", "backdrop", "logo", "textlessPoster", "icon"}

// DownloadImages fetches remote image URLs into `.otix-{role}.{ext}` siblings and sets local paths.
func DownloadImages(gameRoot string, sc *Sidecar, client *http.Client) error {
	if sc == nil {
		return fmt.Errorf("nil sidecar")
	}
	if client == nil {
		client = &http.Client{Timeout: 45 * time.Second}
	}
	if sc.Images == nil {
		sc.Images = map[string]*ImageRef{}
	}
	var firstErr error
	for _, role := range imageRoles {
		ref := sc.Images[role]
		if ref == nil || strings.TrimSpace(ref.URL) == "" {
			continue
		}
		localName, err := downloadOne(client, gameRoot, role, ref.URL)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		ref.Local = &localName
	}
	return firstErr
}

func downloadOne(client *http.Client, gameRoot, role, rawURL string) (string, error) {
	resp, err := client.Get(rawURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("download %s: HTTP %d", role, resp.StatusCode)
	}
	ext := extensionFromURLOrContentType(rawURL, resp.Header.Get("Content-Type"))
	localName := fmt.Sprintf(".otix-%s%s", role, ext)
	outPath := filepath.Join(gameRoot, localName)
	tmpPath := outPath + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(f, resp.Body)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return "", copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return "", closeErr
	}
	if err := os.Rename(tmpPath, outPath); err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}
	return localName, nil
}

func extensionFromURLOrContentType(rawURL, contentType string) string {
	path := rawURL
	if i := strings.Index(path, "?"); i >= 0 {
		path = path[:i]
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif":
		if ext == ".jpeg" {
			return ".jpg"
		}
		return ext
	}
	ct := strings.ToLower(strings.Split(contentType, ";")[0])
	switch strings.TrimSpace(ct) {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "image/avif":
		return ".avif"
	default:
		return ".jpg"
	}
}

// ResolveLocalAsset returns the absolute path for a local image role, if present on disk.
func ResolveLocalAsset(gameRoot string, sc *Sidecar, role string) (string, bool) {
	if sc == nil || sc.Images == nil {
		return "", false
	}
	ref := sc.Images[role]
	if ref == nil || ref.Local == nil || strings.TrimSpace(*ref.Local) == "" {
		return "", false
	}
	name := filepath.Base(*ref.Local)
	if !strings.HasPrefix(name, ".otix-") {
		return "", false
	}
	full := filepath.Join(gameRoot, name)
	if _, err := os.Stat(full); err != nil {
		return "", false
	}
	return full, true
}

// PreferredImageURL returns local relative path when available, else remote URL.
func PreferredImageURL(ref *ImageRef) string {
	if ref == nil {
		return ""
	}
	if ref.Local != nil && strings.TrimSpace(*ref.Local) != "" {
		return *ref.Local
	}
	return ref.URL
}
