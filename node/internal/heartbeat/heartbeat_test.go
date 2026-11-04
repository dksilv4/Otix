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
	if got := ResolveRegistryURL(cfg); got != DefaultRegistryURL {
		t.Errorf("expected default registry when RegistryURL is empty, got %q", got)
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
		expectedPath := "/api/v1/nodes/test-node-uuid/heartbeat/"
		if r.URL.Path != expectedPath && r.URL.Path != "/v1/servers/heartbeat" && r.URL.Path != "/api/v1/nodes/test-node-uuid/heartbeat" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.WriteHeader(statusToReturn)
	}))
	defer srv.Close()

	cfg := config.DefaultConfig()
	cfg.Server.NodeID = "test-node-uuid"
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
	oldDefault := DefaultRegistryURL
	DefaultRegistryURL = ""
	defer func() { DefaultRegistryURL = oldDefault }()

	cfg.Server.EnableHeartbeat = true
	cfg.Server.RegistryURL = ""
	t.Setenv("OTIX_REGISTRY_URL", "")
	delay, err = runner.SendOnce()
	if err != nil || delay != 30*time.Second {
		t.Errorf("expected 30s delay when registry empty, got %v, err=%v", delay, err)
	}
	DefaultRegistryURL = oldDefault

	// Set OTIX_REGISTRY_URL so docker container doesn't rewrite loopback to http://api:8000
	t.Setenv("OTIX_REGISTRY_URL", srv.URL)

	// Successful heartbeat (claimed)
	statusToReturn = http.StatusOK
	delay, err = runner.SendOnce()
	if err != nil || delay != 30*time.Second {
		t.Errorf("expected 30s delay on success, got %v, err=%v", delay, err)
	}
	if receivedPayload.ServerName != "Test-Node" || receivedPayload.Port != 8090 || receivedPayload.AuthToken != "test-token" || receivedPayload.NodeID != "test-node-uuid" {
		t.Errorf("payload mismatch: %+v", receivedPayload)
	}
	if len(receivedPayload.LocalEndpoints) == 0 {
		t.Errorf("expected non-empty LocalEndpoints in payload")
	}

	// Server error
	statusToReturn = http.StatusInternalServerError
	delay, err = runner.SendOnce()
	if err == nil || delay != 10*time.Second {
		t.Errorf("expected 10s delay on error, got %v, err=%v", delay, err)
	}

	// Start & Stop lifecycle
	runner.Start()
	time.Sleep(10 * time.Millisecond)
	runner.Stop()
}

func TestClassifyInterface(t *testing.T) {
	tests := []struct {
		name       string
		ifaceName  string
		ip         string
		isLoopback bool
		expected   string
	}{
		{"loopback flag", "lo", "127.0.0.1", true, "loopback"},
		{"loopback ip", "eth0", "127.0.0.1", false, "loopback"},
		{"lan 192.168", "Ethernet", "192.168.1.100", false, "lan"},
		{"lan 10", "eth0", "10.0.10.5", false, "lan"},
		{"lan 172.16", "en0", "172.16.50.2", false, "lan"},
		{"tailscale cgnat", "tailscale0", "100.64.0.1", false, "tailscale"},
		{"tailscale name", "utun4", "10.200.0.1", false, "tailscale"},
		{"wireguard", "wg0", "10.0.0.1", false, "tailscale"},
		{"docker bridge name", "docker0", "172.17.0.1", false, "docker"},
		{"docker veth", "vethabc123", "172.17.0.5", false, "docker"},
		{"public wan", "eth0", "8.8.8.8", false, "other"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			parsed := net.ParseIP(tc.ip)
			got := ClassifyInterface(tc.ifaceName, parsed, tc.isLoopback)
			if got != tc.expected {
				t.Errorf("ClassifyInterface(%s, %s, %t) = %s; want %s", tc.ifaceName, tc.ip, tc.isLoopback, got, tc.expected)
			}
		})
	}
}

func TestNormalizeBaseAPI(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"https://otix.app", "https://otix.app/api"},
		{"https://otix.app/", "https://otix.app/api"},
		{"https://otix.app/api", "https://otix.app/api"},
		{"https://otix.app/api/", "https://otix.app/api"},
		{"https://otix.app/api/v1", "https://otix.app/api"},
		{"https://otix.app/api/v1/", "https://otix.app/api"},
		{"http://127.0.0.1:8000/api", "http://127.0.0.1:8000/api"},
	}

	for _, c := range cases {
		got := NormalizeBaseAPI(c.input)
		if got != c.expected {
			t.Errorf("NormalizeBaseAPI(%q) = %q; want %q", c.input, got, c.expected)
		}
	}
}

func TestGetRoutableEndpointsNoLoopback(t *testing.T) {
	endpoints := GetRoutableEndpoints(8090)
	if len(endpoints) == 0 {
		t.Fatal("expected at least one endpoint")
	}

	hasLANorTailscale := false
	for _, iface := range EnumerateInterfaces() {
		if iface.Type == "lan" || iface.Type == "tailscale" {
			hasLANorTailscale = true
			break
		}
	}

	if hasLANorTailscale {
		for _, ep := range endpoints {
			if ep == "http://127.0.0.1:8090" || ep == "http://localhost:8090" {
				t.Errorf("detected loopback leak in GetRoutableEndpoints: %s", ep)
			}
		}
	}
}
