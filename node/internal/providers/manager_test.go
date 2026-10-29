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
		{"https://1fichier.com/?abcdef12345", "direct"},
		{"https://rapidgator.net/file/123456/game.part1.rar", "direct"},
		{"https://example.com/container.dlc", "direct"},
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
	// Mock server for SABnzbd, Prowlarr, and JDownloader
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "linkgrabberv2") || strings.Contains(r.URL.Path, "getStorageInfos") {
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": 555, "status": "ok"})
			return
		}

		apiKey := r.Header.Get("X-Api-Key")
		if apiKey == "" {
			apiKey = r.URL.Query().Get("apikey")
		}

		if apiKey != "test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		if strings.Contains(r.URL.Path, "status") || r.URL.Query().Get("mode") == "version" || strings.Contains(r.URL.Path, "getStorageInfos") {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok", "version": "1.0"})
			return
		}

		if strings.Contains(r.URL.Path, "linkgrabberv2/addLinks") {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": 555})
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

	cfg.Usenet.G4U.URL = srv.URL + "/api/"
	cfg.Usenet.G4U.APIKey = "test-key"

	cfg.JDownloader.Enabled = true
	cfg.JDownloader.DirectHost = host
	cfg.JDownloader.DirectPort = port

	pm := NewProviderManager(cfg)

	// 1. ListProviders
	providers := pm.ListProviders()
	downloaders, ok := providers["downloaders"].([]ProviderInfo)
	if !ok || len(downloaders) < 2 {
		t.Fatalf("expected at least 2 downloaders, got %v", providers["downloaders"])
	}
	if !downloaders[0].Configured || !downloaders[0].Connected {
		t.Errorf("expected sabnzbd configured and connected, got %+v", downloaders[0])
	}
	if !downloaders[1].Configured || !downloaders[1].Connected {
		t.Errorf("expected jdownloader configured and connected, got %+v", downloaders[1])
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

	resJD, err := pm.TestProvider("downloader", "jdownloader")
	if err != nil || resJD["ok"] != true {
		t.Fatalf("TestProvider jdownloader failed: err=%v, res=%v", err, resJD)
	}

	resProw, err := pm.TestProvider("indexer", "prowlarr")
	if err != nil || resProw["ok"] != true {
		t.Fatalf("TestProvider prowlarr failed: err=%v, res=%v", err, resProw)
	}

	resG4U, err := pm.TestProvider("indexer", "g4u")
	if err != nil || resG4U["ok"] != true {
		t.Fatalf("TestProvider g4u failed: err=%v, res=%v", err, resG4U)
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

	// Direct download via JDownloader
	jdID, err := pm.AddDownload("https://1fichier.com/?123456", "Direct Game", "games", "direct")
	if err != nil || jdID != "queued-direct" {
		t.Fatalf("AddDownload direct failed: err=%v, jdID=%s", err, jdID)
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
