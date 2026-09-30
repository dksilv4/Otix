package usenet

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

func TestResolveServiceURL(t *testing.T) {
	tests := []struct {
		name        string
		host        string
		port        int
		useSSL      bool
		urlBase     string
		wantRoot    string
		wantSubpath string
	}{
		{
			name:        "full https URL with port and subpath",
			host:        "https://server.example.com/prowlarr",
			port:        443,
			useSSL:      true,
			urlBase:     "",
			wantRoot:    "https://server.example.com",
			wantSubpath: "/prowlarr",
		},
		{
			name:        "plain host and port",
			host:        "127.0.0.1",
			port:        8080,
			useSSL:      false,
			urlBase:     "",
			wantRoot:    "http://127.0.0.1:8080",
			wantSubpath: "",
		},
		{
			name:        "host with urlBase and default https port mapping",
			host:        "192.168.1.10",
			port:        9696,
			useSSL:      true,
			urlBase:     "/custom/path",
			wantRoot:    "https://192.168.1.10",
			wantSubpath: "/custom/path",
		},
		{
			name:        "https standard port 443 omits port suffix",
			host:        "nas.local",
			port:        443,
			useSSL:      true,
			urlBase:     "",
			wantRoot:    "https://nas.local",
			wantSubpath: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root, sub := ResolveServiceURL(tt.host, tt.port, tt.useSSL, tt.urlBase)
			if root != tt.wantRoot {
				t.Errorf("root = %q, want %q", root, tt.wantRoot)
			}
			if sub != tt.wantSubpath {
				t.Errorf("subpath = %q, want %q", sub, tt.wantSubpath)
			}
		})
	}
}

func parseTestServerHostPort(ts *httptest.Server) (string, int) {
	u, _ := url.Parse(ts.URL)
	host := u.Hostname()
	port, _ := strconv.Atoi(u.Port())
	return host, port
}

func TestSabnzbdClient(t *testing.T) {
	// Mock SABnzbd server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mode := r.URL.Query().Get("mode")
		apiKey := r.URL.Query().Get("apikey")

		if apiKey != "test-api-key" {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"status": false, "error": "API Key Incorrect"}`))
			return
		}

		switch mode {
		case "version":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"version": "4.1.0"})
		case "addurl":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"status": true,
				"nzo_ids": []string{"SABnzbd_nzo_test123"},
			})
		case "queue":
			action := r.URL.Query().Get("name")
			if action == "delete" {
				_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": true})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"queue": map[string]interface{}{
					"status":   "Downloading",
					"speed":    "15.4 MB/s",
					"timeleft": "0:05:30",
					"slots": []map[string]interface{}{
						{
							"nzo_id":     "SABnzbd_nzo_test123",
							"filename":   "Transport.Fever.2.MULTi10",
							"percentage": "45",
							"mb":         "10000.0",
							"mbleft":     "5500.0",
							"timeleft":   "0:05:30",
							"status":     "Downloading",
						},
					},
				},
			})
		case "history":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"history": map[string]interface{}{
					"slots": []map[string]interface{}{
						{
							"nzo_id":       "SABnzbd_nzo_completed",
							"name":         "Hades.II-RUNE",
							"status":       "Completed",
							"bytes":        15000000000,
							"fail_message": "",
							"category":     "games",
							"storage":      "/storage/games",
							"completed":    1710000000,
						},
					},
				},
			})
		case "pause":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": true})
		case "resume":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": true})
		default:
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer srv.Close()

	host, port := parseTestServerHostPort(srv)

	// 1. Missing API Key
	clientEmpty := NewSabnzbdClient(config.SabnzbdConfig{Host: host, Port: port, APIKey: ""})
	ok, msg := clientEmpty.TestConnection()
	if ok || msg != "SABnzbd API key is required" {
		t.Fatalf("expected missing key error, got ok=%v, msg=%q", ok, msg)
	}

	// 2. Successful client operations
	client := NewSabnzbdClient(config.SabnzbdConfig{
		Host:     host,
		Port:     port,
		APIKey:   "test-api-key",
		Category: "games",
	})

	// TestConnection
	ok, msg = client.TestConnection()
	if !ok || !strings.HasPrefix(msg, "Connected") {
		t.Fatalf("TestConnection failed: ok=%v, msg=%q", ok, msg)
	}

	// AddDownload
	nzoID, err := client.AddDownload("https://nzb.example/123", "Transport.Fever.2", "games")
	if err != nil {
		t.Fatalf("AddDownload failed: %v", err)
	}
	if nzoID != "SABnzbd_nzo_test123" {
		t.Errorf("expected nzo_id SABnzbd_nzo_test123, got %s", nzoID)
	}

	// GetQueue
	q, err := client.GetQueue()
	if err != nil {
		t.Fatalf("GetQueue failed: %v", err)
	}
	if q.Status != "Downloading" || q.Speed != "15.4 MB/s" || len(q.Items) != 1 {
		t.Errorf("unexpected queue payload: %+v", q)
	}
	if q.Items[0].Percentage != 45 || q.Items[0].NzoID != "SABnzbd_nzo_test123" {
		t.Errorf("unexpected queue item: %+v", q.Items[0])
	}

	// GetHistory
	hist, err := client.GetHistory(10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(hist.Items) != 1 || hist.Items[0].Filename != "Hades.II-RUNE" {
		t.Errorf("unexpected history items: %+v", hist)
	}

	// DeleteSlot, PauseQueue, ResumeQueue
	if err := client.DeleteSlot("SABnzbd_nzo_test123"); err != nil {
		t.Fatalf("DeleteSlot failed: %v", err)
	}
	if err := client.PauseQueue(); err != nil {
		t.Fatalf("PauseQueue failed: %v", err)
	}
	if err := client.ResumeQueue(); err != nil {
		t.Fatalf("ResumeQueue failed: %v", err)
	}
}

func TestProwlarrClient(t *testing.T) {
	var capturedUserAgent string
	var capturedLimit string
	var capturedType string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("X-Api-Key")
		if apiKey != "prowlarr-test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		capturedUserAgent = r.Header.Get("User-Agent")

		switch r.URL.Path {
		case "/api/v1/system/status":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"version": "1.12.0"}`))
		case "/api/v1/search":
			capturedLimit = r.URL.Query().Get("limit")
			capturedType = r.URL.Query().Get("type")
			releases := []map[string]interface{}{
				{
					"guid":        "prowlarr-guid-1",
					"title":       "Transport Fever 2 Deluxe",
					"size":        12000000000,
					"downloadUrl": "https://nzbplanet.net/get/123",
					"indexer":     "NzbPlanet",
					"protocol":    "usenet",
					"ageDays":     10,
				},
			}
			_ = json.NewEncoder(w).Encode(releases)
		case "/api/v1/indexer":
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"id": 1, "name": "NzbPlanet", "enable": true},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	host, port := parseTestServerHostPort(srv)

	// 1. Missing API Key
	clientEmpty := NewProwlarrClient(config.ProwlarrConfig{Host: host, Port: port, APIKey: ""})
	ok, msg := clientEmpty.TestConnection()
	if ok || msg != "Prowlarr API key is required" {
		t.Fatalf("expected missing key error, got ok=%v, msg=%q", ok, msg)
	}

	// 2. Successful client operations
	client := NewProwlarrClient(config.ProwlarrConfig{
		Host:       host,
		Port:       port,
		APIKey:     "prowlarr-test-key",
		Categories: []int{1000, 4000},
	})

	// TestConnection
	ok, msg = client.TestConnection()
	if !ok || msg != "Connected successfully" {
		t.Fatalf("TestConnection failed: ok=%v, msg=%q", ok, msg)
	}

	// Search
	releases, err := client.Search("Transport Fever", nil)
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}
	if len(releases) != 1 || releases[0].Title != "Transport Fever 2 Deluxe" {
		t.Fatalf("unexpected releases: %+v", releases)
	}

	// Verify limit=100, type=search, and User-Agent
	if capturedLimit != "100" {
		t.Errorf("expected limit=100, got %s", capturedLimit)
	}
	if capturedType != "search" {
		t.Errorf("expected type=search, got %s", capturedType)
	}
	if !strings.Contains(capturedUserAgent, "Otix") {
		t.Errorf("expected User-Agent containing Otix, got %s", capturedUserAgent)
	}

	// GetIndexers
	indexers, err := client.GetIndexers()
	if err != nil {
		t.Fatalf("GetIndexers failed: %v", err)
	}
	if len(indexers) != 1 {
		t.Errorf("expected 1 indexer, got %d", len(indexers))
	}
}
