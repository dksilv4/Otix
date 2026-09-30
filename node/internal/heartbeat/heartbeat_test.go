package heartbeat

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
)

func TestGetLocalIP(t *testing.T) {
	ip := GetLocalIP()
	if ip == "" {
		t.Errorf("expected non-empty IP")
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		t.Errorf("GetLocalIP returned invalid IP string: %q", ip)
	}
}

func TestResolveRegistryURL(t *testing.T) {
	cfg := config.DefaultConfig()

	// Env override
	t.Setenv("OTIX_REGISTRY_URL", "https://custom-registry.com/api/")
	resolved := ResolveRegistryURL(cfg)
	if resolved != "https://custom-registry.com/api" {
		t.Errorf("expected env override, got %q", resolved)
	}

	// Unset env
	t.Setenv("OTIX_REGISTRY_URL", "")
	cfg.Server.RegistryURL = ""
	if got := ResolveRegistryURL(cfg); got != "" {
		t.Errorf("expected empty string when RegistryURL is empty, got %q", got)
	}

	cfg.Server.RegistryURL = "https://app.otix.cloud/api/"
	if got := ResolveRegistryURL(cfg); got != "https://app.otix.cloud/api" {
		t.Errorf("expected trimmed registry url, got %q", got)
	}
}

func TestHeartbeatRunner(t *testing.T) {
	var receivedPayload HeartbeatPayload
	var statusToReturn int = http.StatusOK

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/servers/heartbeat" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.WriteHeader(statusToReturn)
	}))
	defer srv.Close()

	cfg := config.DefaultConfig()
	cfg.Server.Name = "Test-Node"
	cfg.Server.Port = 8090
	cfg.Server.AuthToken = "test-token"
	cfg.Server.RegistryURL = srv.URL
	cfg.Server.EnableHeartbeat = true

	claimMgr := claim.NewClaimManager(cfg)
	runner := NewHeartbeatRunner(cfg, claimMgr)

	// Heartbeat disabled
	cfg.Server.EnableHeartbeat = false
	delay, err := runner.SendOnce()
	if err != nil || delay != 30*time.Second {
		t.Errorf("expected 30s delay when disabled, got %v, err=%v", delay, err)
	}

	// Registry empty
	cfg.Server.EnableHeartbeat = true
	cfg.Server.RegistryURL = ""
	t.Setenv("OTIX_REGISTRY_URL", "")
	delay, err = runner.SendOnce()
	if err != nil || delay != 30*time.Second {
		t.Errorf("expected 30s delay when registry empty, got %v, err=%v", delay, err)
	}

	// Set OTIX_REGISTRY_URL so docker container doesn't rewrite loopback to http://api:8000
	t.Setenv("OTIX_REGISTRY_URL", srv.URL)

	// Successful heartbeat
	statusToReturn = http.StatusOK
	delay, err = runner.SendOnce()
	if err != nil || delay != 5*time.Minute {
		t.Errorf("expected 5m delay on success, got %v, err=%v", delay, err)
	}
	if receivedPayload.ServerName != "Test-Node" || receivedPayload.Port != 8090 || receivedPayload.AuthToken != "test-token" {
		t.Errorf("payload mismatch: %+v", receivedPayload)
	}

	// Server error
	statusToReturn = http.StatusInternalServerError
	delay, err = runner.SendOnce()
	if err == nil || delay != 15*time.Second {
		t.Errorf("expected 15s delay on error, got %v, err=%v", delay, err)
	}

	// Start & Stop lifecycle
	runner.Start()
	time.Sleep(10 * time.Millisecond)
	runner.Stop()
}
