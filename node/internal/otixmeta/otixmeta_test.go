package otixmeta_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/dksilv4/otix/node/internal/otixmeta"
)

func TestReadWriteRoundTrip(t *testing.T) {
	root := t.TempDir()
	local := ".otix-poster.jpg"
	sc := &otixmeta.Sidecar{
		Version:     1,
		MediaID:     "42",
		Title:       "Test Game",
		Slug:        "test-game",
		Confidence:  0.95,
		MatchSource: "catalog",
		Overview:    "A game",
		Images: map[string]*otixmeta.ImageRef{
			"poster": {URL: "https://cdn.example/poster.jpg", Local: &local},
		},
		ExeRelative: "game.exe",
	}
	if err := otixmeta.Write(root, sc); err != nil {
		t.Fatalf("Write: %v", err)
	}
	got, err := otixmeta.Read(root)
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if got == nil {
		t.Fatal("expected sidecar")
	}
	if got.MediaID != "42" || got.Title != "Test Game" || got.Slug != "test-game" {
		t.Fatalf("unexpected sidecar: %+v", got)
	}
	if got.Images["poster"] == nil || got.Images["poster"].URL == "" {
		t.Fatal("expected poster url")
	}
	if got.Images["poster"].Local == nil || *got.Images["poster"].Local != local {
		t.Fatalf("expected local poster, got %+v", got.Images["poster"])
	}
}

func TestReadMissing(t *testing.T) {
	got, err := otixmeta.Read(t.TempDir())
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil, got %+v", got)
	}
}

func TestDownloadImages(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})
	}))
	defer srv.Close()

	root := t.TempDir()
	sc := &otixmeta.Sidecar{
		MediaID: "1",
		Title:   "Img",
		Images: map[string]*otixmeta.ImageRef{
			"poster": {URL: srv.URL + "/poster.png"},
		},
	}
	if err := otixmeta.DownloadImages(root, sc, srv.Client()); err != nil {
		t.Fatalf("DownloadImages: %v", err)
	}
	if sc.Images["poster"].Local == nil || *sc.Images["poster"].Local != ".otix-poster.png" {
		t.Fatalf("expected local name, got %+v", sc.Images["poster"])
	}
	path := filepath.Join(root, ".otix-poster.png")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected image file: %v", err)
	}
	full, ok := otixmeta.ResolveLocalAsset(root, sc, "poster")
	if !ok || full != path {
		t.Fatalf("ResolveLocalAsset = %q %v", full, ok)
	}
}
