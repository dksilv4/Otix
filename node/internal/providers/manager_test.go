package providers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/dksilv4/otix/node/internal/config"
)

func TestInferDownloadProtocol(t *testing.T) {
	tests := []struct {
		url      string
		expected string
	}{
		{"magnet:?xt=urn:btih:12345", "torrent"},
		{"https://tracker.example/download.torrent", "torrent"},
		{"https://tracker.example/download.torrent?key=abc", "torrent"},
		{"https://nzbplanet.net/getnzb/123.nzb", "usenet"},
		{"https://indexer.example/api?t=get", "usenet"},
		{"", "usenet"},
	}

	for _, tt := range tests {
		got := InferDownloadProtocol(tt.url)
		if got != tt.expected {
			t.Errorf("InferDownloadProtocol(%q) = %q, want %q", tt.url, got, tt.expected)
		}
	}
}

func TestProviderManager(t *testing.T) {
	// Mock server for SABnzbd and Prowlarr
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("X-Api-Key")
		if apiKey == "" {
			apiKey = r.URL.Query().Get("apikey")
		}

		if apiKey != "test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		if strings.Contains(r.URL.Path, "status") || r.URL.Query().Get("mode") == "version" {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok", "version": "1.0"})
			return
		}

		if r.URL.Query().Get("mode") == "addurl" {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"status":  true,
				"nzo_ids": []string{"nzo-prov-1"},
			})
			return
		}

		if strings.Contains(r.URL.Path, "search") {
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"guid": "search-1", "title": "Game A", "size": 1000},
			})
			return
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	u, _ := url.Parse(srv.URL)
	host := u.Hostname()
	port, _ := strconv.Atoi(u.Port())

	cfg := config.DefaultConfig()
	cfg.Usenet.Sabnzbd.Host = host
	cfg.Usenet.Sabnzbd.Port = port
	cfg.Usenet.Sabnzbd.APIKey = "test-key"

	cfg.Usenet.Prowlarr.Host = host
	cfg.Usenet.Prowlarr.Port = port
	cfg.Usenet.Prowlarr.APIKey = "test-key"

	pm := NewProviderManager(cfg)

	// 1. ListProviders
	providers := pm.ListProviders()
	downloaders, ok := providers["downloaders"].([]ProviderInfo)
	if !ok || len(downloaders) == 0 {
		t.Fatalf("expected downloaders list, got %v", providers["downloaders"])
	}
	if !downloaders[0].Configured || !downloaders[0].Connected {
		t.Errorf("expected sabnzbd configured and connected, got %+v", downloaders[0])
	}

	searchProviders, ok := providers["search_providers"].([]ProviderInfo)
	if !ok || len(searchProviders) == 0 {
		t.Fatalf("expected search_providers list, got %v", providers["search_providers"])
	}
	if !searchProviders[0].Configured || !searchProviders[0].Connected {
		t.Errorf("expected prowlarr configured and connected, got %+v", searchProviders[0])
	}

	// 2. TestProvider
	res, err := pm.TestProvider("downloader", "sabnzbd")
	if err != nil || res["ok"] != true {
		t.Fatalf("TestProvider sabnzbd failed: err=%v, res=%v", err, res)
	}

	resProw, err := pm.TestProvider("indexer", "prowlarr")
	if err != nil || resProw["ok"] != true {
		t.Fatalf("TestProvider prowlarr failed: err=%v, res=%v", err, resProw)
	}

	// Unknown provider
	_, err = pm.TestProvider("unknown", "none")
	if err == nil {
		t.Error("expected error for unknown provider type")
	}

	_, err = pm.TestProvider("downloader", "unknown_dl")
	if err == nil {
		t.Error("expected error for unknown downloader name")
	}

	// 3. AddDownload
	// Usenet download
	nzoID, err := pm.AddDownload("https://nzb.example/file.nzb", "My Game", "games", "usenet")
	if err != nil || nzoID != "nzo-prov-1" {
		t.Fatalf("AddDownload usenet failed: err=%v, nzoID=%s", err, nzoID)
	}

	// Torrent download (not supported on node)
	_, err = pm.AddDownload("magnet:?xt=urn:btih:123", "Torrent Game", "games", "torrent")
	if err == nil || !strings.Contains(err.Error(), "no torrent download client configured") {
		t.Fatalf("expected no torrent client error, got %v", err)
	}

	// 4. Search
	releases, err := pm.Search("Game", nil)
	if err != nil || len(releases) != 1 {
		t.Fatalf("Search failed: err=%v, releases=%v", err, releases)
	}
}
