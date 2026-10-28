package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
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

func setupTestServer(t ...*testing.T) (*server.Server, *config.AppConfig, *claim.ClaimManager) {
	tmpDir, _ := os.MkdirTemp("", "otix_server_test")
	cfg := config.DefaultConfig()
	cfg.SetConfigPath(filepath.Join(tmpDir, "config.yaml"))
	cfg.Server.AuthToken = ""
	cfg.Server.Claimed = false
	cm := claim.NewClaimManager(cfg)
	srv := server.NewServer(cfg, cm)
	if len(t) > 0 && t[0] != nil {
		t[0].Cleanup(func() {
			srv.Stop()
			_ = os.RemoveAll(tmpDir)
		})
	}
	return srv, cfg, cm
}

func TestPingEndpoint(t *testing.T) {
	srv, _, _ := setupTestServer(t)

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
	srv, cfg, cm := setupTestServer(t)

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

func TestClaimDirectLoopbackRestriction(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	payload, _ := json.Marshal(map[string]string{
		"auth_token":  "token_secret_123",
		"server_name": "Remote Node",
		"username":    "bob",
	})

	// 1. External IPv4 client (e.g. 192.168.1.100) must be rejected with 403
	reqExternal := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader(payload))
	reqExternal.RemoteAddr = "192.168.1.100:45678"
	reqExternal.Header.Set("Content-Type", "application/json")
	wExternal := httptest.NewRecorder()
	srv.Router().ServeHTTP(wExternal, reqExternal)

	if wExternal.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 Forbidden for non-loopback IP, got %d (body: %s)", wExternal.Code, wExternal.Body.String())
	}
	if !bytes.Contains(wExternal.Body.Bytes(), []byte("loopback")) {
		t.Errorf("expected error message to mention loopback, got: %s", wExternal.Body.String())
	}

	// 2. Default httptest.NewRequest RemoteAddr (192.0.2.1:1234) must also be rejected
	reqDefault := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader(payload))
	reqDefault.Header.Set("Content-Type", "application/json")
	wDefault := httptest.NewRecorder()
	srv.Router().ServeHTTP(wDefault, reqDefault)

	if wDefault.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 Forbidden for default RemoteAddr, got %d", wDefault.Code)
	}
}

func TestClaimDirectEndpointSuccessAndPersistence(t *testing.T) {
	srv, cfg, cm := setupTestServer(t)

	configDir := t.TempDir()
	configPath := filepath.Join(configDir, "config.yaml")
	cfg.SetConfigPath(configPath)

	payload, _ := json.Marshal(map[string]string{
		"auth_token":  "direct_auth_secret_999",
		"server_name": "Companion Node Mac",
		"username":    "dksilv4",
	})

	req := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader(payload))
	req.RemoteAddr = "127.0.0.1:58432"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.Router().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from direct claim, got %d (body: %s)", w.Code, w.Body.String())
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode json response: %v", err)
	}

	if res["status"] != "claimed" {
		t.Errorf("expected status 'claimed', got %v", res["status"])
	}
	if res["server_name"] != "Companion Node Mac" {
		t.Errorf("expected server_name 'Companion Node Mac', got %v", res["server_name"])
	}
	if res["username"] != "dksilv4" {
		t.Errorf("expected username 'dksilv4', got %v", res["username"])
	}

	// Verify ClaimManager state
	if !cm.IsClaimed() {
		t.Fatal("expected ClaimManager.IsClaimed() to be true")
	}
	if !cm.ValidateToken("direct_auth_secret_999") {
		t.Fatal("expected cm.ValidateToken('direct_auth_secret_999') to be true")
	}

	// Verify status endpoint reflects claimed state
	reqStatus := httptest.NewRequest("GET", "/api/v1/claim/status", nil)
	wStatus := httptest.NewRecorder()
	srv.Router().ServeHTTP(wStatus, reqStatus)
	var statusRes claim.ClaimStatus
	_ = json.Unmarshal(wStatus.Body.Bytes(), &statusRes)
	if !statusRes.Claimed {
		t.Fatal("expected /api/v1/claim/status to report claimed=true")
	}
	if statusRes.Username != "dksilv4" {
		t.Fatalf("expected status username 'dksilv4', got %s", statusRes.Username)
	}

	// Verify disk persistence via config load
	diskCfg := config.LoadConfig(configPath)
	if !diskCfg.Server.Claimed {
		t.Fatal("expected disk configuration to have Claimed=true")
	}
	if diskCfg.Server.AuthToken != "direct_auth_secret_999" {
		t.Fatalf("expected persisted token 'direct_auth_secret_999', got %s", diskCfg.Server.AuthToken)
	}
	if diskCfg.Server.ClaimedBy != "dksilv4" {
		t.Fatalf("expected persisted ClaimedBy 'dksilv4', got %s", diskCfg.Server.ClaimedBy)
	}
	if diskCfg.Server.Name != "Companion Node Mac" {
		t.Fatalf("expected persisted Name 'Companion Node Mac', got %s", diskCfg.Server.Name)
	}
}

func TestClaimDirectIPv6AndValidationErrors(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	// 1. IPv6 Loopback should succeed
	payloadIPv6, _ := json.Marshal(map[string]string{
		"auth_token":  "ipv6_secret_tok",
		"server_name": "IPv6 Node",
		"username":    "charlie",
	})
	reqIPv6 := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader(payloadIPv6))
	reqIPv6.RemoteAddr = "[::1]:52341"
	reqIPv6.Header.Set("Content-Type", "application/json")
	wIPv6 := httptest.NewRecorder()
	srv.Router().ServeHTTP(wIPv6, reqIPv6)

	if wIPv6.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for IPv6 loopback, got %d (body: %s)", wIPv6.Code, wIPv6.Body.String())
	}

	// 2. Bad request: invalid JSON
	reqBadJSON := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader([]byte("{invalid-json")))
	reqBadJSON.RemoteAddr = "127.0.0.1:52341"
	reqBadJSON.Header.Set("Content-Type", "application/json")
	wBadJSON := httptest.NewRecorder()
	srv.Router().ServeHTTP(wBadJSON, reqBadJSON)

	if wBadJSON.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for malformed JSON, got %d", wBadJSON.Code)
	}

	// 3. Bad request: empty auth token
	emptyPayload, _ := json.Marshal(map[string]string{
		"auth_token":  "",
		"server_name": "Empty Node",
		"username":    "charlie",
	})
	reqEmptyTok := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader(emptyPayload))
	reqEmptyTok.RemoteAddr = "127.0.0.1:52341"
	reqEmptyTok.Header.Set("Content-Type", "application/json")
	wEmptyTok := httptest.NewRecorder()
	srv.Router().ServeHTTP(wEmptyTok, reqEmptyTok)

	if wEmptyTok.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for empty auth token, got %d", wEmptyTok.Code)
	}
}

func TestClaimLoginDirect(t *testing.T) {
	// Mock Otix backend server
	mockBackend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/auth/login":
			var loginReq struct {
				Identity string `json:"identity"`
				Password string `json:"password"`
			}
			_ = json.NewDecoder(r.Body).Decode(&loginReq)
			if loginReq.Identity == "alice" && loginReq.Password == "password123" {
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]any{
					"access_token":        "jwt_access_token_abc",
					"two_factor_required": false,
				})
				return
			}
			http.Error(w, `{"detail":"Invalid email or password"}`, http.StatusUnauthorized)
		case "/api/v1/library/servers/claim-direct":
			authHeader := r.Header.Get("Authorization")
			if authHeader != "Bearer jwt_access_token_abc" {
				http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
				return
			}
			var claimReq map[string]any
			_ = json.NewDecoder(r.Body).Decode(&claimReq)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"name":       claimReq["server_name"],
				"auth_token": claimReq["auth_token"],
				"is_online":  true,
				"created":    true,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer mockBackend.Close()

	srv, cfg, cm := setupTestServer(t)

	// 1. Invalid credentials should fail
	badBody, _ := json.Marshal(map[string]string{
		"username":     "alice",
		"password":     "wrongpass",
		"registry_url": mockBackend.URL + "/api",
	})
	reqBad := httptest.NewRequest("POST", "/api/v1/claim/login", bytes.NewReader(badBody))
	wBad := httptest.NewRecorder()
	srv.Router().ServeHTTP(wBad, reqBad)
	if wBad.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for bad pass, got %d", wBad.Code)
	}

	// 2. Valid credentials should succeed and claim the server
	goodBody, _ := json.Marshal(map[string]string{
		"username":     "alice",
		"password":     "password123",
		"registry_url": mockBackend.URL + "/api",
	})
	reqGood := httptest.NewRequest("POST", "/api/v1/claim/login", bytes.NewReader(goodBody))
	wGood := httptest.NewRecorder()
	srv.Router().ServeHTTP(wGood, reqGood)
	if wGood.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d (body: %s)", wGood.Code, wGood.Body.String())
	}

	if !cm.IsClaimed() {
		t.Fatal("expected server to be claimed after login")
	}
	if cfg.Server.ClaimedBy != "alice" {
		t.Fatalf("expected claimed_by 'alice', got %s", cfg.Server.ClaimedBy)
	}
	if cfg.Server.AuthToken == "" {
		t.Fatal("expected auth token to be generated and saved")
	}
}


func TestWebUIOnboardingRender(t *testing.T) {
	srv, _, _ := setupTestServer(t)

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
	if !bytes.Contains([]byte(body), []byte("Account Login")) {
		t.Error("expected onboarding wizard to include Account Login tab")
	}
}

func TestWebUIClaimedDashboardRender(t *testing.T) {
	srv, _, cm := setupTestServer(t)

	code := cm.CurrentCode()
	if err := cm.Confirm(code, "test_secret_tok_9999", "Home Gaming Box", "dksilv4"); err != nil {
		t.Fatalf("failed to confirm claim: %v", err)
	}

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	srv.Router().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	body := w.Body.String()
	if !bytes.Contains([]byte(body), []byte("dksilv4")) {
		t.Error("expected dashboard to show claiming username")
	}
	if !bytes.Contains([]byte(body), []byte("Unclaim")) {
		t.Error("expected dashboard to show Unclaim button")
	}
	if !bytes.Contains([]byte(body), []byte("btn-copy-token")) {
		t.Error("expected dashboard to show copy token action")
	}
}

func TestOtixWriteAndSettings(t *testing.T) {
	srv, cfg, _ := setupTestServer(t)
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

func TestProwlarrUsenetConfigAndTestConnection(t *testing.T) {
	srv, cfg, _ := setupTestServer(t)

	// 1. Test test-prowlarr with empty API key
	reqTestEmpty := httptest.NewRequest("POST", "/api/v1/usenet/test-prowlarr", bytes.NewReader([]byte(`{"host":"127.0.0.1","port":9696,"api_key":""}`)))
	reqTestEmpty.Header.Set("Content-Type", "application/json")
	wTestEmpty := httptest.NewRecorder()
	srv.Router().ServeHTTP(wTestEmpty, reqTestEmpty)
	if wTestEmpty.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", wTestEmpty.Code)
	}
	var resEmpty map[string]interface{}
	_ = json.Unmarshal(wTestEmpty.Body.Bytes(), &resEmpty)
	if resEmpty["ok"] == true || resEmpty["message"] != "Prowlarr API key is required" {
		t.Fatalf("expected failure with required key, got %v", resEmpty)
	}

	// 2. Test saving Prowlarr config with apiKey (camelCase) and categories
	savePayload := map[string]any{
		"prowlarr": map[string]any{
			"host":       "prowlarr.local",
			"port":       9696,
			"apiKey":     "my_secret_prowlarr_key",
			"useSsl":     true,
			"urlBase":    "/prowlarr",
			"categories": []int{1000, 4000},
		},
	}
	body, _ := json.Marshal(savePayload)
	reqSave := httptest.NewRequest("POST", "/api/v1/usenet/config", bytes.NewReader(body))
	reqSave.Header.Set("Content-Type", "application/json")
	wSave := httptest.NewRecorder()
	srv.Router().ServeHTTP(wSave, reqSave)
	if wSave.Code != http.StatusOK {
		t.Fatalf("save failed with %d: %s", wSave.Code, wSave.Body.String())
	}

	if cfg.Usenet.Prowlarr.Host != "prowlarr.local" {
		t.Fatalf("expected host prowlarr.local, got %s", cfg.Usenet.Prowlarr.Host)
	}
	if cfg.Usenet.Prowlarr.APIKey != "my_secret_prowlarr_key" {
		t.Fatalf("expected apiKey my_secret_prowlarr_key, got %s", cfg.Usenet.Prowlarr.APIKey)
	}
	if !cfg.Usenet.Prowlarr.UseSSL {
		t.Fatalf("expected use_ssl=true")
	}

	// 3. Test test-prowlarr with camelCase payload overrides
	reqTestCamel := httptest.NewRequest("POST", "/api/v1/usenet/test-prowlarr", bytes.NewReader([]byte(`{"host":"127.0.0.1","port":9696,"apiKey":"","api_key":""}`)))
	reqTestCamel.Header.Set("Content-Type", "application/json")
	wTestCamel := httptest.NewRecorder()
	srv.Router().ServeHTTP(wTestCamel, reqTestCamel)
	var resCamel map[string]interface{}
	_ = json.Unmarshal(wTestCamel.Body.Bytes(), &resCamel)
	// Because saved config has API key, omitting API key in test request falls back to saved config key!
	if resCamel["message"] == "Prowlarr API key is required" {
		t.Fatalf("should have used saved API key, but got %v", resCamel)
	}

	// 4. Test GET /api/v1/usenet/config returns configured, has_api_key, and provider_type
	reqGet := httptest.NewRequest("GET", "/api/v1/usenet/config", nil)
	wGet := httptest.NewRecorder()
	srv.Router().ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", wGet.Code)
	}
	var resGet map[string]interface{}
	_ = json.Unmarshal(wGet.Body.Bytes(), &resGet)
	prowMap, ok := resGet["prowlarr"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected prowlarr map in response, got %v", resGet)
	}
	if prowMap["configured"] != true {
		t.Fatalf("expected prowlarr configured=true, got %v", prowMap["configured"])
	}
	if prowMap["has_api_key"] != true {
		t.Fatalf("expected prowlarr has_api_key=true, got %v", prowMap["has_api_key"])
	}
	if prowMap["provider_type"] != "indexer-provider" {
		t.Fatalf("expected prowlarr provider_type=indexer-provider, got %v", prowMap["provider_type"])
	}
}

func TestServerStatusAndUnclaim(t *testing.T) {
	srv, cfg, cm := setupTestServer(t)
	code := cm.CurrentCode()
	_ = cm.Confirm(code, "my-auth-token", "My Box", "alice")

	// 1. GET /api/v1/status unauthenticated (omits disk sizes)
	reqStatus := httptest.NewRequest("GET", "/api/v1/status", nil)
	wStatus := httptest.NewRecorder()
	srv.Router().ServeHTTP(wStatus, reqStatus)
	if wStatus.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", wStatus.Code)
	}
	var res map[string]interface{}
	_ = json.Unmarshal(wStatus.Body.Bytes(), &res)
	if res["claimed"] != true || res["claimed_by"] != "alice" {
		t.Errorf("status mismatch: %+v", res)
	}

	// 2. GET /api/v1/status authenticated with Bearer token
	reqAuthed := httptest.NewRequest("GET", "/api/v1/status", nil)
	reqAuthed.Header.Set("Authorization", "Bearer my-auth-token")
	wAuthed := httptest.NewRecorder()
	srv.Router().ServeHTTP(wAuthed, reqAuthed)
	if wAuthed.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", wAuthed.Code)
	}
	var resAuthed map[string]interface{}
	_ = json.Unmarshal(wAuthed.Body.Bytes(), &resAuthed)
	if _, ok := resAuthed["disk_free_bytes"]; !ok {
		t.Errorf("expected disk_free_bytes in authed status response")
	}

	// 3. POST /api/v1/claim/unclaim
	reqUnclaim := httptest.NewRequest("POST", "/api/v1/claim/unclaim", nil)
	reqUnclaim.Header.Set("Authorization", "Bearer my-auth-token")
	wUnclaim := httptest.NewRecorder()
	srv.Router().ServeHTTP(wUnclaim, reqUnclaim)
	if wUnclaim.Code != http.StatusOK {
		t.Fatalf("expected 200 on unclaim, got %d", wUnclaim.Code)
	}
	if cm.IsClaimed() || cfg.Server.Claimed {
		t.Errorf("expected server to be unclaimed")
	}
}

func TestLibrariesAndFilesEndpoints(t *testing.T) {
	srv, cfg, _ := setupTestServer(t)
	cfg.Server.AuthToken = "token123"

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "TestGame.iso")
	_ = os.WriteFile(filePath, []byte("fake iso data 1234567890"), 0644)

	// 1. POST /api/v1/libraries
	libPayload := config.LibraryConfig{
		Name: "Main ISOs",
		Path: tmpDir,
		Kind: "iso",
	}
	body, _ := json.Marshal(libPayload)
	reqLib := httptest.NewRequest("POST", "/api/v1/libraries?token=token123", bytes.NewReader(body))
	wLib := httptest.NewRecorder()
	srv.Router().ServeHTTP(wLib, reqLib)
	if wLib.Code != http.StatusOK {
		t.Fatalf("add library failed: %d, body: %s", wLib.Code, wLib.Body.String())
	}

	// 2. GET /api/v1/libraries
	reqGetLib := httptest.NewRequest("GET", "/api/v1/libraries?token=token123", nil)
	wGetLib := httptest.NewRecorder()
	srv.Router().ServeHTTP(wGetLib, reqGetLib)
	if wGetLib.Code != http.StatusOK {
		t.Fatalf("get libraries failed: %d", wGetLib.Code)
	}

	// 3. POST /api/v1/scan?wait=true
	reqScan := httptest.NewRequest("POST", "/api/v1/scan?wait=true&token=token123", nil)
	wScan := httptest.NewRecorder()
	srv.Router().ServeHTTP(wScan, reqScan)
	if wScan.Code != http.StatusOK {
		t.Fatalf("scan failed: %d", wScan.Code)
	}

	// 4. GET /api/v1/files
	reqFiles := httptest.NewRequest("GET", "/api/v1/files?token=token123", nil)
	wFiles := httptest.NewRecorder()
	srv.Router().ServeHTTP(wFiles, reqFiles)
	if wFiles.Code != http.StatusOK {
		t.Fatalf("get files failed: %d", wFiles.Code)
	}
	var files []indexer.HostedFile
	_ = json.Unmarshal(wFiles.Body.Bytes(), &files)
	if len(files) == 0 {
		t.Fatalf("expected at least 1 indexed file, got 0")
	}

	fileID := files[0].ID

	// 5. GET /api/v1/files/{file_id}
	reqFile := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/files/%s?token=token123", fileID), nil)
	wFile := httptest.NewRecorder()
	srv.Router().ServeHTTP(wFile, reqFile)
	if wFile.Code != http.StatusOK {
		t.Fatalf("get file failed: %d", wFile.Code)
	}

	// 6. GET /api/v1/files/{file_id}/download
	reqDL := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/files/%s/download?token=token123", fileID), nil)
	wDL := httptest.NewRecorder()
	srv.Router().ServeHTTP(wDL, reqDL)
	if wDL.Code != http.StatusOK {
		t.Fatalf("download file failed: %d", wDL.Code)
	}
	if wDL.Body.String() != "fake iso data 1234567890" {
		t.Errorf("download content mismatch: %q", wDL.Body.String())
	}

	// 7. Clear files
	reqClear := httptest.NewRequest("DELETE", "/api/v1/files?token=token123", nil)
	wClear := httptest.NewRecorder()
	srv.Router().ServeHTTP(wClear, reqClear)
	if wClear.Code != http.StatusOK {
		t.Fatalf("clear files failed: %d", wClear.Code)
	}
}

func TestExplorerEndpoints(t *testing.T) {
	srv, cfg, _ := setupTestServer(t)
	cfg.Server.AuthToken = "token123"

	tmpDir := t.TempDir()

	// 1. Browse
	reqBrowse := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/explorer/browse?path=%s&token=token123", tmpDir), nil)
	wBrowse := httptest.NewRecorder()
	srv.Router().ServeHTTP(wBrowse, reqBrowse)
	if wBrowse.Code != http.StatusOK {
		t.Fatalf("browse failed: %d, body: %s", wBrowse.Code, wBrowse.Body.String())
	}

	// 2. Create Folder
	createBody, _ := json.Marshal(map[string]string{
		"parent_path": tmpDir,
		"folder_name": "NewDownloads",
	})
	reqCreate := httptest.NewRequest("POST", "/api/v1/explorer/create-folder?token=token123", bytes.NewReader(createBody))
	reqCreate.Header.Set("Content-Type", "application/json")
	wCreate := httptest.NewRecorder()
	srv.Router().ServeHTTP(wCreate, reqCreate)
	if wCreate.Code != http.StatusOK {
		t.Fatalf("create folder failed: %d, body: %s", wCreate.Code, wCreate.Body.String())
	}

	// 3. Set Download Path
	setDLBody, _ := json.Marshal(map[string]any{
		"path":              filepath.Join(tmpDir, "NewDownloads"),
		"create_if_missing": false,
		"add_as_library":    true,
	})
	reqSetDL := httptest.NewRequest("POST", "/api/v1/explorer/set-download-path?token=token123", bytes.NewReader(setDLBody))
	reqSetDL.Header.Set("Content-Type", "application/json")
	wSetDL := httptest.NewRecorder()
	srv.Router().ServeHTTP(wSetDL, reqSetDL)
	if wSetDL.Code != http.StatusOK {
		t.Fatalf("set download path failed: %d, body: %s", wSetDL.Code, wSetDL.Body.String())
	}

	// 4. Request Permission
	permBody, _ := json.Marshal(map[string]string{"path": tmpDir})
	reqPerm := httptest.NewRequest("POST", "/api/v1/explorer/request-permission?token=token123", bytes.NewReader(permBody))
	reqPerm.Header.Set("Content-Type", "application/json")
	wPerm := httptest.NewRecorder()
	srv.Router().ServeHTTP(wPerm, reqPerm)
	if wPerm.Code != http.StatusOK {
		t.Fatalf("request permission failed: %d", wPerm.Code)
	}
}

func TestCloudSavesEndpoints(t *testing.T) {
	srv, cfg, _ := setupTestServer(t)
	cfg.Server.AuthToken = "token123"

	// 1. Upload save file via multipart form
	var b bytes.Buffer
	w := multipart.NewWriter(&b)
	_ = w.WriteField("game_id", "witcher3")
	_ = w.WriteField("game_title", "The Witcher 3")
	fw, _ := w.CreateFormFile("file", "slot001.sav")
	_, _ = io.WriteString(fw, "savegame-data-binary")
	_ = w.Close()

	reqUpload := httptest.NewRequest("POST", "/api/v1/saves/upload?token=token123", &b)
	reqUpload.Header.Set("Content-Type", w.FormDataContentType())
	wUpload := httptest.NewRecorder()
	srv.Router().ServeHTTP(wUpload, reqUpload)
	if wUpload.Code != http.StatusOK {
		t.Fatalf("upload save failed: %d, body: %s", wUpload.Code, wUpload.Body.String())
	}

	var snapRes map[string]interface{}
	_ = json.Unmarshal(wUpload.Body.Bytes(), &snapRes)
	snapID := snapRes["snapshot_id"].(string)

	// 2. List snapshots
	reqList := httptest.NewRequest("GET", "/api/v1/saves/witcher3?token=token123", nil)
	wList := httptest.NewRecorder()
	srv.Router().ServeHTTP(wList, reqList)
	if wList.Code != http.StatusOK {
		t.Fatalf("list saves failed: %d", wList.Code)
	}

	// 3. Download snapshot
	reqDL := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/saves/witcher3/%s/download?token=token123", snapID), nil)
	wDL := httptest.NewRecorder()
	srv.Router().ServeHTTP(wDL, reqDL)
	if wDL.Code != http.StatusOK {
		t.Fatalf("download save failed: %d", wDL.Code)
	}
	if wDL.Body.String() != "savegame-data-binary" {
		t.Errorf("save download mismatch: %q", wDL.Body.String())
	}
}

func TestDesktopAndOrganizeEndpoints(t *testing.T) {
	srv, cfg, _ := setupTestServer(t)
	cfg.Server.AuthToken = "token123"

	// 1. GET /api/v1/desktop/settings
	reqDesktop := httptest.NewRequest("GET", "/api/v1/desktop/settings?token=token123", nil)
	wDesktop := httptest.NewRecorder()
	srv.Router().ServeHTTP(wDesktop, reqDesktop)
	if wDesktop.Code != http.StatusOK {
		t.Fatalf("get desktop settings failed: %d", wDesktop.Code)
	}

	// 2. POST /api/v1/desktop/settings
	postBody, _ := json.Marshal(map[string]any{"minimizeToTray": true})
	reqPostDesktop := httptest.NewRequest("POST", "/api/v1/desktop/settings?token=token123", bytes.NewReader(postBody))
	reqPostDesktop.Header.Set("Content-Type", "application/json")
	wPostDesktop := httptest.NewRecorder()
	srv.Router().ServeHTTP(wPostDesktop, reqPostDesktop)
	if wPostDesktop.Code != http.StatusOK {
		t.Fatalf("post desktop settings failed: %d", wPostDesktop.Code)
	}

	// 3. GET /api/v1/organize
	reqOrg := httptest.NewRequest("GET", "/api/v1/organize?token=token123", nil)
	wOrg := httptest.NewRecorder()
	srv.Router().ServeHTTP(wOrg, reqOrg)
	if wOrg.Code != http.StatusOK {
		t.Fatalf("get organize settings failed: %d", wOrg.Code)
	}

	// 4. POST /api/v1/organize
	postOrgBody, _ := json.Marshal(map[string]any{"autoSearchWishlist": true})
	reqPostOrg := httptest.NewRequest("POST", "/api/v1/organize?token=token123", bytes.NewReader(postOrgBody))
	reqPostOrg.Header.Set("Content-Type", "application/json")
	wPostOrg := httptest.NewRecorder()
	srv.Router().ServeHTTP(wPostOrg, reqPostOrg)
	if wPostOrg.Code != http.StatusOK {
		t.Fatalf("post organize settings failed: %d", wPostOrg.Code)
	}
}

func TestPluginsAndProvidersEndpoints(t *testing.T) {
	srv, cfg, _ := setupTestServer(t)
	cfg.Server.AuthToken = "token123"

	// 1. GET /api/v1/plugins/deals
	reqDeals := httptest.NewRequest("GET", "/api/v1/plugins/deals?token=token123", nil)
	wDeals := httptest.NewRecorder()
	srv.Router().ServeHTTP(wDeals, reqDeals)
	if wDeals.Code != http.StatusOK {
		t.Fatalf("get deals failed: %d", wDeals.Code)
	}

	// 2. GET /api/v1/providers
	reqProv := httptest.NewRequest("GET", "/api/v1/providers?token=token123", nil)
	wProv := httptest.NewRecorder()
	srv.Router().ServeHTTP(wProv, reqProv)
	if wProv.Code != http.StatusOK {
		t.Fatalf("get providers failed: %d", wProv.Code)
	}

	// 3. GET /api/v1/epic/status
	reqEpic := httptest.NewRequest("GET", "/api/v1/epic/status?token=token123", nil)
	wEpic := httptest.NewRecorder()
	srv.Router().ServeHTTP(wEpic, reqEpic)
	if wEpic.Code != http.StatusOK {
		t.Fatalf("get epic status failed: %d", wEpic.Code)
	}

	// 4. DELETE /api/v1/epic/auth
	reqEpicDel := httptest.NewRequest("DELETE", "/api/v1/epic/auth?token=token123", nil)
	wEpicDel := httptest.NewRecorder()
	srv.Router().ServeHTTP(wEpicDel, reqEpicDel)
	if wEpicDel.Code != http.StatusOK {
		t.Fatalf("delete epic auth failed: %d", wEpicDel.Code)
	}

	// 4b. GET /api/v1/gog/status & DELETE /api/v1/gog/auth
	reqGOG := httptest.NewRequest("GET", "/api/v1/gog/status?token=token123", nil)
	wGOG := httptest.NewRecorder()
	srv.Router().ServeHTTP(wGOG, reqGOG)
	if wGOG.Code != http.StatusOK {
		t.Fatalf("get gog status failed: %d", wGOG.Code)
	}

	reqGOGDel := httptest.NewRequest("DELETE", "/api/v1/gog/auth?token=token123", nil)
	wGOGDel := httptest.NewRecorder()
	srv.Router().ServeHTTP(wGOGDel, reqGOGDel)
	if wGOGDel.Code != http.StatusOK {
		t.Fatalf("delete gog auth failed: %d", wGOGDel.Code)
	}

	// 5. GET & POST Radarr / Sonarr configs
	reqRadarr := httptest.NewRequest("GET", "/api/v1/radarr/config?token=token123", nil)
	wRadarr := httptest.NewRecorder()
	srv.Router().ServeHTTP(wRadarr, reqRadarr)
	if wRadarr.Code != http.StatusOK {
		t.Fatalf("get radarr config failed: %d", wRadarr.Code)
	}

	reqSonarr := httptest.NewRequest("GET", "/api/v1/sonarr/config?token=token123", nil)
	wSonarr := httptest.NewRecorder()
	srv.Router().ServeHTTP(wSonarr, reqSonarr)
	if wSonarr.Code != http.StatusOK {
		t.Fatalf("get sonarr config failed: %d", wSonarr.Code)
	}
}

func TestGamesAndOverlayEndpoints(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	// 1. GET /api/v1/games/running
	reqRunning := httptest.NewRequest("GET", "/api/v1/games/running", nil)
	wRunning := httptest.NewRecorder()
	srv.Router().ServeHTTP(wRunning, reqRunning)
	if wRunning.Code != http.StatusOK {
		t.Fatalf("expected 200 from running, got %d", wRunning.Code)
	}

	var runningRes map[string]interface{}
	if err := json.Unmarshal(wRunning.Body.Bytes(), &runningRes); err != nil {
		t.Fatal(err)
	}
	if runningRes["running"] != false {
		t.Fatalf("expected running=false initially, got %v", runningRes["running"])
	}

	// 2. GET /api/v1/games/sessions
	reqSess := httptest.NewRequest("GET", "/api/v1/games/sessions", nil)
	wSess := httptest.NewRecorder()
	srv.Router().ServeHTTP(wSess, reqSess)
	if wSess.Code != http.StatusOK {
		t.Fatalf("expected 200 from sessions, got %d", wSess.Code)
	}

	// 3. POST & GET /api/v1/games/mappings
	mapBody := bytes.NewBufferString(`{"process_name":"witcher3.exe","game_id":"w3","game_title":"The Witcher 3"}`)
	reqMap := httptest.NewRequest("POST", "/api/v1/games/mappings", mapBody)
	reqMap.Header.Set("Content-Type", "application/json")
	wMap := httptest.NewRecorder()
	srv.Router().ServeHTTP(wMap, reqMap)
	if wMap.Code != http.StatusOK {
		t.Fatalf("expected 200 from post mappings, got %d", wMap.Code)
	}

	reqGetMap := httptest.NewRequest("GET", "/api/v1/games/mappings", nil)
	wGetMap := httptest.NewRecorder()
	srv.Router().ServeHTTP(wGetMap, reqGetMap)
	if wGetMap.Code != http.StatusOK {
		t.Fatalf("expected 200 from get mappings, got %d", wGetMap.Code)
	}

	// 4. GET /api/v1/games/overlay (Web HUD)
	reqOverlay := httptest.NewRequest("GET", "/api/v1/games/overlay", nil)
	wOverlay := httptest.NewRecorder()
	srv.Router().ServeHTTP(wOverlay, reqOverlay)
	if wOverlay.Code != http.StatusOK {
		t.Fatalf("expected 200 from overlay, got %d", wOverlay.Code)
	}
	if !bytes.Contains(wOverlay.Body.Bytes(), []byte("Otix In-Game Overlay")) {
		t.Fatalf("expected overlay HTML to contain 'Otix In-Game Overlay'")
	}

	// 5. GET & POST /api/v1/games/overlay/settings
	reqGetSettings := httptest.NewRequest("GET", "/api/v1/games/overlay/settings", nil)
	wGetSettings := httptest.NewRecorder()
	srv.Router().ServeHTTP(wGetSettings, reqGetSettings)
	if wGetSettings.Code != http.StatusOK {
		t.Fatalf("expected 200 from overlay settings, got %d", wGetSettings.Code)
	}

	setBody := bytes.NewBufferString(`{"enabled":true,"corner":"top-right","show_fps":true}`)
	reqPostSettings := httptest.NewRequest("POST", "/api/v1/games/overlay/settings", setBody)
	reqPostSettings.Header.Set("Content-Type", "application/json")
	wPostSettings := httptest.NewRecorder()
	srv.Router().ServeHTTP(wPostSettings, reqPostSettings)
	if wPostSettings.Code != http.StatusOK {
		t.Fatalf("expected 200 from post overlay settings, got %d", wPostSettings.Code)
	}
}



func TestScanStatusAndProgressSSE(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	// 1. GET /api/v1/scan/status
	reqStatus := httptest.NewRequest("GET", "/api/v1/scan/status", nil)
	wStatus := httptest.NewRecorder()
	srv.Router().ServeHTTP(wStatus, reqStatus)
	if wStatus.Code != http.StatusOK {
		t.Fatalf("expected 200 from /api/v1/scan/status, got %d", wStatus.Code)
	}

	var status map[string]interface{}
	if err := json.Unmarshal(wStatus.Body.Bytes(), &status); err != nil {
		t.Fatalf("failed to decode scan status: %v", err)
	}
	if status["phase"] == "" {
		t.Fatalf("expected non-empty phase in status: %+v", status)
	}

	// 2. Trigger scan
	reqScan := httptest.NewRequest("POST", "/api/v1/scan?wait=1&skip_sync=1", nil)
	wScan := httptest.NewRecorder()
	srv.Router().ServeHTTP(wScan, reqScan)
	if wScan.Code != http.StatusOK {
		t.Fatalf("expected 200 from /api/v1/scan, got %d", wScan.Code)
	}
}
