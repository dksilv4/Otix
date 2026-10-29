package jdownloader

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/dksilv4/otix/node/internal/config"
)

func TestSecretsComputation(t *testing.T) {
	loginSecret, deviceSecret := computeSecrets("test@example.com", "secret123")
	if len(loginSecret) != 32 {
		t.Fatalf("expected 32 byte loginSecret, got %d", len(loginSecret))
	}
	if len(deviceSecret) != 32 {
		t.Fatalf("expected 32 byte deviceSecret, got %d", len(deviceSecret))
	}

	sig := calculateSignature(loginSecret, "/test/path")
	if sig == "" {
		t.Fatalf("expected non-empty signature")
	}
}

func TestDirectHTTPMode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/system/getStorageInfos":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"free": 100000000}`))
		case "/linkgrabberv2/addLinks":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"id": 1234}`))
		case "/downloadsV2/queryPackages":
			w.WriteHeader(http.StatusOK)
			resp := JDPackagesResponse{
				Data: []JDPackage{
					{
						UUID:        1001,
						Name:        "Test.Game.Repack.part1.rar",
						BytesLoaded: 500 * 1024 * 1024,
						BytesTotal:  1000 * 1024 * 1024,
						Speed:       15 * 1024 * 1024,
						ETA:         33,
						Active:      true,
						Finished:    false,
					},
					{
						UUID:        1002,
						Name:        "Finished.Game.iso",
						BytesLoaded: 2000 * 1024 * 1024,
						BytesTotal:  2000 * 1024 * 1024,
						Speed:       0,
						ETA:         0,
						Active:      false,
						Finished:    true,
					},
				},
			}
			json.NewEncoder(w).Encode(resp)
		case "/downloadsV2/removeLinks":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{}`))
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer server.Close()

	// Parse host and port from test server URL
	urlParts := strings.TrimPrefix(server.URL, "http://")
	hostParts := strings.Split(urlParts, ":")
	port, _ := strconv.Atoi(hostParts[1])

	cfg := config.JDownloaderConfig{
		Enabled:    true,
		DirectHost: hostParts[0],
		DirectPort: port,
	}

	client := NewClient(cfg)
	client.SetHTTPClient(server.Client())

	// 1. TestConnection
	ok, msg := client.TestConnection()
	if !ok {
		t.Fatalf("expected direct connection ok, got msg: %s", msg)
	}

	// 2. AddDownload
	status, err := client.AddDownload("https://example.com/game.rar", "Test Game", "games")
	if err != nil {
		t.Fatalf("AddDownload failed: %v", err)
	}
	if status != "queued-direct" {
		t.Fatalf("unexpected add status: %s", status)
	}

	// 3. GetQueue
	queue, err := client.GetQueue()
	if err != nil {
		t.Fatalf("GetQueue failed: %v", err)
	}
	if len(queue.Items) != 1 {
		t.Fatalf("expected 1 active queue item, got %d", len(queue.Items))
	}
	item := queue.Items[0]
	if item.Filename != "Test.Game.Repack.part1.rar" {
		t.Errorf("expected filename Test.Game.Repack.part1.rar, got %s", item.Filename)
	}
	if item.Percentage < 49 || item.Percentage > 51 {
		t.Errorf("expected ~50%% progress, got %.2f", item.Percentage)
	}

	// 4. GetHistory
	history, err := client.GetHistory(10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(history.Items) != 1 {
		t.Fatalf("expected 1 history item, got %d", len(history.Items))
	}
	if history.Items[0].Filename != "Finished.Game.iso" {
		t.Errorf("expected Finished.Game.iso, got %s", history.Items[0].Filename)
	}

	// 5. DeleteSlot
	if err := client.DeleteSlot("1001"); err != nil {
		t.Fatalf("DeleteSlot failed: %v", err)
	}
}

func TestUnconfiguredConnection(t *testing.T) {
	cfg := config.JDownloaderConfig{}
	client := NewClient(cfg)
	ok, msg := client.TestConnection()
	if ok {
		t.Fatalf("expected unconfigured connection to fail")
	}
	if !strings.Contains(msg, "not configured") {
		t.Errorf("expected message to mention not configured, got: %s", msg)
	}
}

func TestFormatSpeed(t *testing.T) {
	tests := []struct {
		input    int64
		expected string
	}{
		{0, "0 B/s"},
		{500, "500 B/s"},
		{1024, "1.0 KB/s"},
		{10 * 1024 * 1024, "10.0 MB/s"},
		{2 * 1024 * 1024 * 1024, "2.0 GB/s"},
	}

	for _, tt := range tests {
		got := formatSpeed(tt.input)
		if got != tt.expected {
			t.Errorf("formatSpeed(%d) = %s, expected %s", tt.input, got, tt.expected)
		}
	}
}
