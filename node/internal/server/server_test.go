package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/indexer"
	"github.com/dksilv4/otix/node/internal/server"
)

func setupTestServer() (*server.Server, *config.AppConfig, *claim.ClaimManager) {
	tmpDir, _ := os.MkdirTemp("", "otix_server_test")
	cfg := config.DefaultConfig()
	cfg.SetConfigPath(filepath.Join(tmpDir, "config.yaml"))
	cfg.Server.AuthToken = ""
	cfg.Server.Claimed = false
	cm := claim.NewClaimManager(cfg)
	srv := server.NewServer(cfg, cm)
	return srv, cfg, cm
}

func TestPingEndpoint(t *testing.T) {
	srv, _, _ := setupTestServer()

	req := httptest.NewRequest("GET", "/api/v1/ping", nil)
	w := httptest.NewRecorder()
	srv.Router().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}

	if res["status"] != "online" {
		t.Errorf("expected status 'online', got %v", res["status"])
	}
}

func TestClaimFlowEndpoints(t *testing.T) {
	srv, cfg, cm := setupTestServer()

	// 1. Get Claim Status
	reqStatus := httptest.NewRequest("GET", "/api/v1/claim/status", nil)
	wStatus := httptest.NewRecorder()
	srv.Router().ServeHTTP(wStatus, reqStatus)

	if wStatus.Code != http.StatusOK {
		t.Fatalf("status code %d", wStatus.Code)
	}

	var statusRes claim.ClaimStatus
	_ = json.Unmarshal(wStatus.Body.Bytes(), &statusRes)
	if statusRes.Claimed {
		t.Fatal("expected unclaimed initial status")
	}

	code := statusRes.ClaimCode

	// 2. Confirm Claim
	confirmPayload := map[string]string{
		"claim_code":  code,
		"auth_token":  "test_secret_tok_4829",
		"server_name": "Unraid Media Box",
		"username":    "dk",
	}
	body, _ := json.Marshal(confirmPayload)
	reqConfirm := httptest.NewRequest("POST", "/api/v1/claim/confirm", bytes.NewReader(body))
	reqConfirm.Header.Set("Content-Type", "application/json")
	wConfirm := httptest.NewRecorder()
	srv.Router().ServeHTTP(wConfirm, reqConfirm)

	if wConfirm.Code != http.StatusOK {
		t.Fatalf("confirm failed: code %d, body: %s", wConfirm.Code, wConfirm.Body.String())
	}

	if !cm.IsClaimed() {
		t.Fatal("expected server to be claimed")
	}
	if cfg.Server.AuthToken != "test_secret_tok_4829" {
		t.Fatalf("expected auth token 'test_secret_tok_4829', got %s", cfg.Server.AuthToken)
	}

	// 3. Verify Claimed Status
	wStatus2 := httptest.NewRecorder()
	srv.Router().ServeHTTP(wStatus2, reqStatus)
	var statusRes2 claim.ClaimStatus
	_ = json.Unmarshal(wStatus2.Body.Bytes(), &statusRes2)
	if !statusRes2.Claimed {
		t.Fatal("expected status claimed=true")
	}
}

func TestWebUIOnboardingRender(t *testing.T) {
	srv, _, _ := setupTestServer()

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	srv.Router().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	body := w.Body.String()
	if !bytes.Contains([]byte(body), []byte("Unclaimed Server")) {
		t.Error("expected onboarding wizard to mention 'Unclaimed Server'")
	}
	if !bytes.Contains([]byte(body), []byte("OTX-")) {
		t.Error("expected onboarding wizard to show OTX- PIN")
	}
}

func TestOtixWriteAndSettings(t *testing.T) {
	srv, cfg, _ := setupTestServer()
	gameRoot := t.TempDir()
	exePath := filepath.Join(gameRoot, "Game.exe")
	if err := os.WriteFile(exePath, []byte("MZ"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg.GameLibraries = []config.LibraryConfig{{
		Name: "Games",
		Path: gameRoot,
		Kind: "game",
	}}
	srv.Indexer().SetLibraries(cfg.GameLibraries)
	fileID := "file_testotix01"
	srv.Indexer().UpsertFile(indexer.HostedFile{
		ID:       fileID,
		Filename: "Game.exe",
		Filepath: exePath,
	})

	settingsBody, _ := json.Marshal(map[string]any{
		"write_otix_after_scan": true,
		"download_otix_images":  false,
	})
	reqSettings := httptest.NewRequest("POST", "/api/v1/otix/settings", bytes.NewReader(settingsBody))
	reqSettings.Header.Set("Content-Type", "application/json")
	wSettings := httptest.NewRecorder()
	srv.Router().ServeHTTP(wSettings, reqSettings)
	if wSettings.Code != http.StatusOK {
		t.Fatalf("settings status %d: %s", wSettings.Code, wSettings.Body.String())
	}

	writeBody, _ := json.Marshal(map[string]any{
		"download_images": false,
		"items": []map[string]any{{
			"file_id":  fileID,
			"filepath": exePath,
			"sidecar": map[string]any{
				"version":     1,
				"mediaId":     "99",
				"title":       "Game",
				"slug":        "game",
				"confidence":  0.9,
				"matchSource": "catalog",
				"overview":    "Overview",
				"images": map[string]any{
					"poster": map[string]any{"url": "https://example.com/p.jpg", "local": nil},
				},
			},
		}},
	})
	reqWrite := httptest.NewRequest("POST", "/api/v1/otix/write", bytes.NewReader(writeBody))
	reqWrite.Header.Set("Content-Type", "application/json")
	wWrite := httptest.NewRecorder()
	srv.Router().ServeHTTP(wWrite, reqWrite)
	if wWrite.Code != http.StatusOK {
		t.Fatalf("write status %d: %s", wWrite.Code, wWrite.Body.String())
	}
	var writeRes map[string]any
	_ = json.Unmarshal(wWrite.Body.Bytes(), &writeRes)
	if writeRes["written"] != float64(1) {
		t.Fatalf("expected written=1, got %v", writeRes)
	}
	if _, err := os.Stat(filepath.Join(gameRoot, ".otix")); err != nil {
		t.Fatalf("expected .otix file: %v", err)
	}

	reqGet := httptest.NewRequest("GET", "/api/v1/files/"+fileID+"/otix", nil)
	wGet := httptest.NewRecorder()
	srv.Router().ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("get otix status %d: %s", wGet.Code, wGet.Body.String())
	}
}
