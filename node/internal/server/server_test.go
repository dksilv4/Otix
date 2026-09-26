package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/server"
)

func setupTestServer() (*server.Server, *config.AppConfig, *claim.ClaimManager) {
	cfg := config.DefaultConfig()
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
