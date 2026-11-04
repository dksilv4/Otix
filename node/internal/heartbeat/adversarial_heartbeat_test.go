package heartbeat_test

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/heartbeat"
	"github.com/google/uuid"
)

// =============================================================================
// ADVERSARIAL TEST SUITE 1: Tailscale 100.64.0.0/10 CIDR Boundary & VPN Probing
// =============================================================================

func TestAdversarial_TailscaleCIDRBoundaries(t *testing.T) {
	// RFC 6598 defines the Shared Address Space: 100.64.0.0/10 (100.64.0.0 - 100.127.255.255)
	probes := []struct {
		desc        string
		ip          string
		ifaceName   string
		isLoopback  bool
		wantType    string
	}{
		// Boundary testing: immediately below 100.64.0.0/10
		{"Below boundary: 100.63.255.255", "100.63.255.255", "eth0", false, "other"},
		{"Below boundary: 100.63.0.1", "100.63.0.1", "eth0", false, "other"},

		// Network boundary exact match
		{"Network edge: 100.64.0.0", "100.64.0.0", "eth0", false, "tailscale"},
		{"Lowest usable IP: 100.64.0.1", "100.64.0.1", "eth0", false, "tailscale"},

		// Mid-range sample points
		{"Mid-range IP: 100.80.50.25", "100.80.50.25", "eth0", false, "tailscale"},
		{"Mid-range IP: 100.100.100.100", "100.100.100.100", "eth0", false, "tailscale"},
		{"Mid-range IP: 100.115.0.1", "100.115.0.1", "eth0", false, "tailscale"},

		// Upper boundary
		{"Highest usable IP: 100.127.255.254", "100.127.255.254", "eth0", false, "tailscale"},
		{"Broadcast edge: 100.127.255.255", "100.127.255.255", "eth0", false, "tailscale"},

		// Boundary testing: immediately above 100.64.0.0/10
		{"Above boundary: 100.128.0.0", "100.128.0.0", "eth0", false, "other"},
		{"Above boundary: 100.128.0.1", "100.128.0.1", "eth0", false, "other"},

		// Name heuristics for Tailscale / VPN even with non-CGNAT IPs
		{"Tailscale name uppercase", "192.168.1.50", "TAILSCALE0", false, "tailscale"},
		{"Tailscale mixed case", "10.0.0.5", "Tailscale", false, "tailscale"},
		{"Tailscale with suffix", "8.8.8.8", "tailscale-tun", false, "tailscale"},
		{"Utun prefix (macOS VPN)", "192.168.1.1", "utun0", false, "tailscale"},
		{"Utun mixed case", "10.10.10.10", "Utun3", false, "tailscale"},
		{"Wireguard wg0", "192.168.2.1", "wg0", false, "tailscale"},
		{"Wireguard custom", "10.200.0.1", "wg-home", false, "tailscale"},
		{"Tun interface", "172.16.0.1", "tun0", false, "tailscale"},
		{"Tap interface", "192.168.5.1", "tap0", false, "tailscale"},
	}

	for _, p := range probes {
		t.Run(p.desc, func(t *testing.T) {
			parsed := net.ParseIP(p.ip)
			got := heartbeat.ClassifyInterface(p.ifaceName, parsed, p.isLoopback)
			if got != p.wantType {
				t.Errorf("FAILED [%s]: ClassifyInterface(%q, %s, %v) = %q; want %q",
					p.desc, p.ifaceName, p.ip, p.isLoopback, got, p.wantType)
			}
		})
	}
}

// =============================================================================
// ADVERSARIAL TEST SUITE 2: LAN & Docker Subnet Boundary Probing
// =============================================================================

func TestAdversarial_LANDockerBoundaries(t *testing.T) {
	probes := []struct {
		desc       string
		ip         string
		ifaceName  string
		isLoopback bool
		wantType   string
	}{
		// RFC 1918 10.0.0.0/8
		{"10.0.0.0 network edge", "10.0.0.0", "Ethernet", false, "lan"},
		{"10.255.255.255 broadcast edge", "10.255.255.255", "Ethernet", false, "lan"},
		{"Below 10.0.0.0/8", "9.255.255.255", "Ethernet", false, "other"},
		{"Above 10.0.0.0/8", "11.0.0.0", "Ethernet", false, "other"},

		// RFC 1918 172.16.0.0/12
		{"172.16.0.0 network edge", "172.16.0.0", "en0", false, "lan"},
		{"172.31.255.255 broadcast edge", "172.31.255.255", "en0", false, "lan"},
		{"Below 172.16.0.0/12", "172.15.255.255", "en0", false, "other"},
		{"Above 172.16.0.0/12", "172.32.0.0", "en0", false, "other"},

		// RFC 1918 192.168.0.0/16
		{"192.168.0.0 network edge", "192.168.0.0", "Wi-Fi", false, "lan"},
		{"192.168.255.255 broadcast edge", "192.168.255.255", "Wi-Fi", false, "lan"},
		{"Below 192.168.0.0/16", "192.167.255.255", "Wi-Fi", false, "other"},
		{"Above 192.168.0.0/16", "192.169.0.0", "Wi-Fi", false, "other"},

		// Docker interface naming
		{"docker0", "172.17.0.1", "docker0", false, "docker"},
		{"docker custom bridge", "172.18.0.1", "docker_gwbridge", false, "docker"},
		{"br- prefix (Docker custom network)", "172.20.0.1", "br-e54f3e69188a", false, "docker"},
		{"veth- prefix (container peer interface)", "172.17.0.2", "veth48ac91f", false, "docker"},
		{"cni- prefix (Kubernetes / Podman)", "10.244.0.1", "cni0", false, "docker"},

		// Loopback checks
		{"Loopback flag true with LAN IP", "192.168.1.1", "lo", true, "loopback"},
		{"Loopback flag false with 127.0.0.1", "127.0.0.1", "eth0", false, "loopback"},
		{"Loopback flag false with 127.0.0.50", "127.0.0.50", "eth0", false, "loopback"},
		{"Loopback flag false with ::1", "::1", "lo", false, "loopback"},
	}

	for _, p := range probes {
		t.Run(p.desc, func(t *testing.T) {
			parsed := net.ParseIP(p.ip)
			got := heartbeat.ClassifyInterface(p.ifaceName, parsed, p.isLoopback)
			if got != p.wantType {
				t.Errorf("FAILED [%s]: ClassifyInterface(%q, %s, %v) = %q; want %q",
					p.desc, p.ifaceName, p.ip, p.isLoopback, got, p.wantType)
			}
		})
	}
}

// =============================================================================
// ADVERSARIAL TEST SUITE 3: Loopback Suppression & Endpoint Priority Oracles
// =============================================================================

func TestAdversarial_RoutableEndpointsSuppressionAndPriority(t *testing.T) {
	// Call GetRoutableEndpoints and evaluate behavior against actual system interfaces
	endpoints := heartbeat.GetRoutableEndpoints(8090)
	if len(endpoints) == 0 {
		t.Fatal("GetRoutableEndpoints returned zero endpoints, expected at least loopback fallback")
	}

	ifaces := heartbeat.EnumerateInterfaces()
	hasLAN := false
	hasTailscale := false
	hasDocker := false

	for _, iface := range ifaces {
		switch iface.Type {
		case "lan":
			hasLAN = true
		case "tailscale":
			hasTailscale = true
		case "docker":
			hasDocker = true
		}
	}

	for _, ep := range endpoints {
		u, err := url.Parse(ep)
		if err != nil {
			t.Errorf("GetRoutableEndpoints produced invalid URL %q: %v", ep, err)
			continue
		}

		host := u.Hostname()
		isLoopbackHost := (host == "127.0.0.1" || host == "localhost" || host == "::1")

		// Oracle 1: If LAN or Tailscale exists, loopback MUST NOT be present
		if (hasLAN || hasTailscale) && isLoopbackHost {
			t.Errorf("ORACLE VIOLATION: Loopback leaked in endpoints despite active routable interfaces: %q", ep)
		}

		// Oracle 2: If only Docker exists (no LAN/Tailscale), loopback MUST NOT be present
		if !hasLAN && !hasTailscale && hasDocker && isLoopbackHost {
			t.Errorf("ORACLE VIOLATION: Loopback leaked when Docker interfaces exist: %q", ep)
		}

		// Oracle 3: Endpoint port must match input port
		if u.Port() != "8090" {
			t.Errorf("ORACLE VIOLATION: Endpoint port %s != 8090 in %q", u.Port(), ep)
		}
	}
}

// =============================================================================
// ADVERSARIAL TEST SUITE 4: IPv6 URL Parsing Safety in Endpoints
// =============================================================================

func TestAdversarial_IPv6EndpointURLSafety(t *testing.T) {
	// When IPv6 addresses are classified and formatted as endpoints:
	// A naive format fmt.Sprintf("http://%s:%d", ipStr, port) for IPv6 results in:
	// "http://2001:db8::1:8090", which is INVALID per RFC 3986 and fails url.Parse!
	ipv6Addresses := []string{
		"2001:db8::1",
		"fd7a:115c:a1e0:ab12:4843:cd96:6245:7a1b", // Tailscale IPv6
		"fe80::1",
		"::1",
	}

	port := 8090
	for _, rawIP := range ipv6Addresses {
		parsedIP := net.ParseIP(rawIP)
		if parsedIP == nil {
			continue
		}

		// Test net.JoinHostPort behavior
		validHostPort := net.JoinHostPort(rawIP, fmt.Sprintf("%d", port))
		validURLStr := fmt.Sprintf("http://%s", validHostPort)
		parsedURL, err := url.Parse(validURLStr)
		if err != nil {
			t.Errorf("Valid IPv6 host-port format failed: %v", err)
		} else if parsedURL.Hostname() != rawIP {
			t.Errorf("Hostname mismatch: got %q, want %q", parsedURL.Hostname(), rawIP)
		}

		// Test naive format to detect if current code would produce invalid URLs if rawIP is IPv6
		naiveEndpoint := fmt.Sprintf("http://%s:%d", rawIP, port)
		_, errNaive := url.Parse(naiveEndpoint)
		if errNaive != nil {
			t.Logf("FINDING (CONFIRMED): Naive endpoint formatting %q fails RFC 3986 URL parsing: %v", naiveEndpoint, errNaive)
		}
	}
}

// =============================================================================
// ADVERSARIAL TEST SUITE 5: Base API Normalization Stress Testing
// =============================================================================

func TestAdversarial_NormalizeBaseAPIStress(t *testing.T) {
	stressCases := []struct {
		input    string
		expected string
	}{
		{"https://otix.app", "https://otix.app/api"},
		{"https://otix.app/", "https://otix.app/api"},
		{"https://otix.app/api", "https://otix.app/api"},
		{"https://otix.app/api/", "https://otix.app/api"},
		{"https://otix.app/api/v1", "https://otix.app/api"},
		{"https://otix.app/api/v1/", "https://otix.app/api"},
		{"http://localhost:8000", "http://localhost:8000/api"},
		{"http://127.0.0.1:8000/api", "http://127.0.0.1:8000/api"},
		{"http://10.0.0.1:8000/api/v1", "http://10.0.0.1:8000/api"},
		{"  https://otix.app/api/v1/  ", "https://otix.app/api"},
		{"https://otix.app////", "https://otix.app/api"},
	}

	for _, sc := range stressCases {
		got := heartbeat.NormalizeBaseAPI(sc.input)
		if got != sc.expected {
			t.Errorf("NormalizeBaseAPI(%q) = %q; want %q", sc.input, got, sc.expected)
		}
	}
}

// =============================================================================
// ADVERSARIAL TEST SUITE 6: Heartbeat Endpoint & Route Verification
// =============================================================================

func TestAdversarial_HeartbeatRouteAndPayloadContract(t *testing.T) {
	nodeUUID := uuid.New().String()
	var interceptedPath string
	var interceptedMethod string
	var interceptedPayload heartbeat.HeartbeatPayload

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		interceptedPath = r.URL.Path
		interceptedMethod = r.Method
		_ = json.NewDecoder(r.Body).Decode(&interceptedPayload)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":  "ok",
			"claimed": true,
		})
	}))
	defer mockServer.Close()

	cfg := config.DefaultConfig()
	cfg.Server.NodeID = nodeUUID
	cfg.Server.RegistryURL = mockServer.URL
	cfg.Server.EnableHeartbeat = true
	t.Setenv("OTIX_REGISTRY_URL", mockServer.URL)

	claimMgr := claim.NewClaimManager(cfg)
	runner := heartbeat.NewHeartbeatRunner(cfg, claimMgr)

	_, err := runner.SendOnce()
	if err != nil {
		t.Fatalf("SendOnce failed: %v", err)
	}

	// 1. Target URL must be exactly /api/v1/nodes/<node_id>/heartbeat/
	expectedPath := fmt.Sprintf("/api/v1/nodes/%s/heartbeat/", nodeUUID)
	if interceptedPath != expectedPath {
		t.Fatalf("ROUTE CONTRACT BREACH: Heartbeat dispatched to %q, expected %q", interceptedPath, expectedPath)
	}

	// 2. HTTP method must be POST
	if interceptedMethod != http.MethodPost {
		t.Fatalf("METHOD CONTRACT BREACH: Heartbeat used %q, expected POST", interceptedMethod)
	}

	// 3. Payload must contain valid NodeID UUID
	if interceptedPayload.NodeID != nodeUUID {
		t.Fatalf("PAYLOAD BREACH: node_id %q != %q", interceptedPayload.NodeID, nodeUUID)
	}

	// 4. Payload LocalEndpoints must not contain 127.0.0.1 if network interfaces exist
	hasNetwork := false
	for _, iface := range interceptedPayload.NetworkInterfaces {
		if iface.Type == "lan" || iface.Type == "tailscale" {
			hasNetwork = true
			break
		}
	}
	if hasNetwork {
		for _, ep := range interceptedPayload.LocalEndpoints {
			if strings.Contains(ep, "127.0.0.1") || strings.Contains(ep, "localhost") {
				t.Errorf("LOOPBACK LEAK: local_endpoints contains loopback: %s", ep)
			}
		}
	}
}

// =============================================================================
// ADVERSARIAL TEST SUITE 7: Concurrent Heartbeat Trigger Stress Harness
// =============================================================================

func TestAdversarial_ConcurrentHeartbeatTriggers(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":  "ok",
			"claimed": false,
		})
	}))
	defer mockServer.Close()

	cfg := config.DefaultConfig()
	cfg.Server.NodeID = uuid.New().String()
	cfg.Server.RegistryURL = mockServer.URL
	cfg.Server.EnableHeartbeat = true
	t.Setenv("OTIX_REGISTRY_URL", mockServer.URL)

	claimMgr := claim.NewClaimManager(cfg)
	runner := heartbeat.NewHeartbeatRunner(cfg, claimMgr)

	const concurrency = 20
	var wg sync.WaitGroup
	errCh := make(chan error, concurrency)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := runner.SendOnce()
			if err != nil {
				errCh <- err
			}
		}()
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Errorf("Concurrent SendOnce failed: %v", err)
	}
}
