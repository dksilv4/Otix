//go:build windows

package games

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCaptureServerEndpoints(t *testing.T) {
	server := NewCaptureServer()

	// 1. Health endpoint test
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	server.handleHealth(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK from health, got %d", resp.StatusCode)
	}

	var data map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("failed to parse health JSON: %v", err)
	}
	if data["status"] != "ok" {
		t.Errorf("expected status 'ok', got %v", data["status"])
	}
	if data["service"] != CaptureServiceName {
		t.Errorf("expected service '%s', got %v", CaptureServiceName, data["service"])
	}

	// 2. Stop endpoint test
	reqStop := httptest.NewRequest("POST", "/stop", nil)
	wStop := httptest.NewRecorder()
	server.handleStop(wStop, reqStop)

	respStop := wStop.Result()
	if respStop.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK from stop, got %d", respStop.StatusCode)
	}

	// 3. Stream endpoint test with invalid PID
	reqStreamBad := httptest.NewRequest("GET", "/stream?pid=not_a_number", nil)
	wStreamBad := httptest.NewRecorder()
	server.handleStream(wStreamBad, reqStreamBad)

	respStreamBad := wStreamBad.Result()
	if respStreamBad.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for invalid pid, got %d", respStreamBad.StatusCode)
	}
}
