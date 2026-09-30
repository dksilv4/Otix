package arr

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dksilv4/otix/node/internal/config"
)

func TestBuildBaseURL(t *testing.T) {
	tests := []struct {
		host     string
		port     int
		useSSL   bool
		urlBase  string
		expected string
	}{
		{"http://192.168.1.5:7878", 7878, false, "", "http://192.168.1.5:7878"},
		{"https://radarr.local", 443, true, "", "https://radarr.local"},
		{"192.168.1.10", 7878, false, "/radarr", "http://192.168.1.10:7878/radarr"},
		{"nas.lan:7878", 7878, false, "", "http://nas.lan:7878"},
		{"nas.lan/radarr", 7878, true, "", "https://nas.lan/radarr"},
		{"https://server.com/sub", 443, true, "sub", "https://server.com/sub"},
	}

	for _, tt := range tests {
		got := BuildBaseURL(tt.host, tt.port, tt.useSSL, tt.urlBase)
		if got != tt.expected {
			t.Errorf("BuildBaseURL(%q, %d, %v, %q) = %q, want %q", tt.host, tt.port, tt.useSSL, tt.urlBase, got, tt.expected)
		}
	}
}

func TestRadarrClient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("X-Api-Key")
		if apiKey != "radarr-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		switch r.URL.Path {
		case "/api/v3/system/status":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"version": "5.2.0"})
		case "/api/v3/rootfolder":
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"id": 1, "path": "/movies", "freeSpace": 100000000},
			})
		case "/api/v3/qualityprofile":
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"id": 1, "name": "HD-1080p"},
			})
		case "/api/v3/movie":
			if r.Method == "POST" {
				var movie map[string]interface{}
				_ = json.NewDecoder(r.Body).Decode(&movie)
				movie["id"] = 42
				w.WriteHeader(http.StatusCreated)
				_ = json.NewEncoder(w).Encode(movie)
				return
			}
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"id": 42, "title": "The Matrix", "year": 1999},
			})
		case "/api/v3/movie/lookup":
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"title": "The Matrix", "tmdbId": 603, "year": 1999},
			})
		case "/api/v3/queue":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"page":         1,
				"pageSize":     10,
				"totalRecords": 1,
				"records": []map[string]interface{}{
					{"id": 99, "title": "The Matrix"},
				},
			})
		case "/api/v3/queue/99":
			if r.Method == "DELETE" {
				w.WriteHeader(http.StatusOK)
				return
			}
		case "/api/v3/history":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"page":         1,
				"pageSize":     10,
				"totalRecords": 0,
				"records":      []interface{}{},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	// Missing API key test
	emptyClient := NewRadarrClient(config.RadarrInstance{})
	if res := emptyClient.TestConnection(); res.OK {
		t.Fatalf("expected empty api key to fail connection")
	}

	client := NewRadarrClient(config.RadarrInstance{
		Host:   srv.URL,
		APIKey: "radarr-key",
	})

	// TestConnection
	res := client.TestConnection()
	if !res.OK || res.Version != "5.2.0" {
		t.Fatalf("TestConnection failed: %+v", res)
	}

	// GetRootFolders
	rf, err := client.GetRootFolders()
	if err != nil || len(rf) != 1 || rf[0].Path != "/movies" {
		t.Fatalf("GetRootFolders failed: err=%v, rf=%v", err, rf)
	}

	// GetQualityProfiles
	qp, err := client.GetQualityProfiles()
	if err != nil || len(qp) != 1 || qp[0].Name != "HD-1080p" {
		t.Fatalf("GetQualityProfiles failed: err=%v, qp=%v", err, qp)
	}

	// GetMovies
	movies, err := client.GetMovies()
	if err != nil || len(movies) != 1 {
		t.Fatalf("GetMovies failed: err=%v, movies=%v", err, movies)
	}

	// Lookup
	lookupRes, err := client.Lookup("The Matrix")
	if err != nil || len(lookupRes) != 1 {
		t.Fatalf("Lookup failed: err=%v, lookupRes=%v", err, lookupRes)
	}

	// AddMovie
	added, err := client.AddMovie(map[string]interface{}{"title": "The Matrix", "tmdbId": 603})
	addedMap, ok := added.(map[string]interface{})
	if err != nil || !ok || addedMap["id"] != float64(42) {
		t.Fatalf("AddMovie failed: err=%v, added=%v", err, added)
	}

	// GetQueue
	q, err := client.GetQueue(1, 10)
	if err != nil || q.TotalRecords != 1 {
		t.Fatalf("GetQueue failed: err=%v, q=%v", err, q)
	}

	// DeleteQueue
	err = client.DeleteQueue(99, true, false)
	if err != nil {
		t.Fatalf("DeleteQueue failed: %v", err)
	}

	// GetHistory
	_, err = client.GetHistory(1, 10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
}

func TestSonarrClient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("X-Api-Key")
		if apiKey != "sonarr-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		switch r.URL.Path {
		case "/api/v3/system/status":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"version": "4.0.0"})
		case "/api/v3/rootfolder":
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"id": 1, "path": "/tv", "freeSpace": 200000000},
			})
		case "/api/v3/qualityprofile":
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"id": 2, "name": "Any"},
			})
		case "/api/v3/series":
			if r.Method == "POST" {
				var series map[string]interface{}
				_ = json.NewDecoder(r.Body).Decode(&series)
				series["id"] = 101
				w.WriteHeader(http.StatusCreated)
				_ = json.NewEncoder(w).Encode(series)
				return
			}
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"id": 101, "title": "Breaking Bad"},
			})
		case "/api/v3/series/lookup":
			_ = json.NewEncoder(w).Encode([]map[string]interface{}{
				{"title": "Breaking Bad", "tvdbId": 81189, "year": 2008},
			})
		case "/api/v3/queue":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"page":         1,
				"pageSize":     10,
				"totalRecords": 1,
				"records": []map[string]interface{}{
					{"id": 55, "title": "Breaking Bad S01E01"},
				},
			})
		case "/api/v3/queue/55":
			if r.Method == "DELETE" {
				w.WriteHeader(http.StatusOK)
				return
			}
		case "/api/v3/history":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"page":         1,
				"pageSize":     10,
				"totalRecords": 0,
				"records":      []interface{}{},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	// Missing API key test
	emptyClient := NewSonarrClient(config.SonarrInstance{})
	if res := emptyClient.TestConnection(); res.OK {
		t.Fatalf("expected empty api key to fail connection")
	}

	client := NewSonarrClient(config.SonarrInstance{
		Host:   srv.URL,
		APIKey: "sonarr-key",
	})

	// TestConnection
	res := client.TestConnection()
	if !res.OK || res.Version != "4.0.0" {
		t.Fatalf("TestConnection failed: %+v", res)
	}

	// GetRootFolders
	rf, err := client.GetRootFolders()
	if err != nil || len(rf) != 1 || rf[0].Path != "/tv" {
		t.Fatalf("GetRootFolders failed: err=%v, rf=%v", err, rf)
	}

	// GetQualityProfiles
	qp, err := client.GetQualityProfiles()
	if err != nil || len(qp) != 1 || qp[0].Name != "Any" {
		t.Fatalf("GetQualityProfiles failed: err=%v, qp=%v", err, qp)
	}

	// GetSeries
	series, err := client.GetSeries()
	if err != nil || len(series) != 1 {
		t.Fatalf("GetSeries failed: err=%v, series=%v", err, series)
	}

	// Lookup
	lookupRes, err := client.Lookup("Breaking Bad")
	if err != nil || len(lookupRes) != 1 {
		t.Fatalf("Lookup failed: err=%v, lookupRes=%v", err, lookupRes)
	}

	// AddSeries
	added, err := client.AddSeries(map[string]interface{}{"title": "Breaking Bad", "tvdbId": 81189})
	addedMap, ok := added.(map[string]interface{})
	if err != nil || !ok || addedMap["id"] != float64(101) {
		t.Fatalf("AddSeries failed: err=%v, added=%v", err, added)
	}

	// GetQueue
	q, err := client.GetQueue(1, 10)
	if err != nil || q.TotalRecords != 1 {
		t.Fatalf("GetQueue failed: err=%v, q=%v", err, q)
	}

	// DeleteQueue
	err = client.DeleteQueue(55, false, false)
	if err != nil {
		t.Fatalf("DeleteQueue failed: %v", err)
	}

	// GetHistory
	_, err = client.GetHistory(1, 10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
}
