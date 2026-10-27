package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestClaimDirectAdversarialLoopbackSecurity thoroughly attacks the loopback security check
// on /api/v1/claim/direct with spoofed headers, external IPs, LAN IPs, IPv6 variants, and malformed strings.
func TestClaimDirectAdversarialLoopbackSecurity(t *testing.T) {
	srv, _, _ := setupTestServer()

	payload, err := json.Marshal(map[string]string{
		"auth_token":  "adversarial_token_12345",
		"server_name": "Hacked Node",
		"username":    "attacker",
	})
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	// 1. Spoofed Forwarding Headers from Remote IPs
	spoofedHeaderCases := []struct {
		name       string
		remoteAddr string
		headers    map[string]string
	}{
		{
			name:       "X-Forwarded-For spoofed to 127.0.0.1",
			remoteAddr: "203.0.113.195:45678",
			headers:    map[string]string{"X-Forwarded-For": "127.0.0.1"},
		},
		{
			name:       "X-Forwarded-For spoofed to localhost",
			remoteAddr: "192.168.1.50:45678",
			headers:    map[string]string{"X-Forwarded-For": "localhost"},
		},
		{
			name:       "X-Real-IP spoofed to 127.0.0.1",
			remoteAddr: "10.0.0.99:32145",
			headers:    map[string]string{"X-Real-IP": "127.0.0.1"},
		},
		{
			name:       "Forwarded header RFC 7239 spoofed to 127.0.0.1",
			remoteAddr: "8.8.8.8:12345",
			headers:    map[string]string{"Forwarded": "for=127.0.0.1;proto=http;by=127.0.0.1"},
		},
		{
			name:       "Host header set to 127.0.0.1:8090",
			remoteAddr: "172.16.1.1:54321",
			headers:    map[string]string{"Host": "127.0.0.1:8090"},
		},
		{
			name:       "Client-IP header spoofed to 127.0.0.1",
			remoteAddr: "198.51.100.12:80",
			headers:    map[string]string{"Client-IP": "127.0.0.1"},
		},
		{
			name:       "CF-Connecting-IP header spoofed to 127.0.0.1",
			remoteAddr: "198.51.100.12:80",
			headers:    map[string]string{"CF-Connecting-IP": "127.0.0.1"},
		},
		{
			name:       "Multiple spoofed headers combined",
			remoteAddr: "192.168.0.2:9999",
			headers: map[string]string{
				"X-Forwarded-For": "127.0.0.1, 10.0.0.1",
				"X-Real-IP":       "127.0.0.1",
				"Forwarded":       "for=127.0.0.1",
				"Host":            "localhost:8090",
			},
		},
	}

	for _, tc := range spoofedHeaderCases {
		t.Run("SpoofedHeader_"+tc.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader(payload))
			req.RemoteAddr = tc.remoteAddr
			req.Header.Set("Content-Type", "application/json")
			for k, v := range tc.headers {
				req.Header.Set(k, v)
			}

			w := httptest.NewRecorder()
			srv.Router().ServeHTTP(w, req)

			if w.Code != http.StatusForbidden {
				t.Fatalf("[%s] expected 403 Forbidden, but received %d (body: %s)", tc.name, w.Code, w.Body.String())
			}
		})
	}

	// 2. Non-loopback remote IP variations
	nonLoopbackIPCases := []struct {
		name       string
		remoteAddr string
	}{
		{"Public IPv4 (Cloudflare DNS)", "1.1.1.1:45678"},
		{"Public IPv4 (Google DNS)", "8.8.8.8:53"},
		{"Private Class C LAN", "192.168.1.200:1234"},
		{"Private Class A LAN", "10.254.0.1:4000"},
		{"Private Class B LAN", "172.16.5.9:8080"},
		{"Link-Local IPv4", "169.254.1.1:9090"},
		{"Multicast IPv4", "224.0.0.1:1234"},
		{"Broadcast IPv4", "255.255.255.255:1234"},
		{"IPv4-mapped non-loopback IPv6", "[::ffff:192.168.1.1]:54321"},
		{"Public IPv6", "[2606:4700:4700::1111]:443"},
		{"Link-Local IPv6", "[fe80::1]:80"},
		{"Unique Local IPv6 (fc00::/7)", "[fd00::1]:8080"},
		{"Subnet boundary non-loopback (128.0.0.1)", "128.0.0.1:8090"},
		{"Zero network (0.0.0.0)", "0.0.0.0:8090"},
		{"Domain suffix spoof attempt", "127.0.0.1.evil.com:8090"},
		{"Malformed IP", "999.999.999.999:8090"},
		{"Empty string RemoteAddr", ""},
	}

	for _, tc := range nonLoopbackIPCases {
		t.Run("NonLoopbackIP_"+tc.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader(payload))
			req.RemoteAddr = tc.remoteAddr
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			srv.Router().ServeHTTP(w, req)

			if w.Code != http.StatusForbidden {
				t.Fatalf("[%s] RemoteAddr %q was not blocked! Expected 403 Forbidden, got %d (body: %s)", tc.name, tc.remoteAddr, w.Code, w.Body.String())
			}
		})
	}

	// 3. Genuine Loopback Addresses (Must Pass Loopback Check)
	loopbackCases := []struct {
		name       string
		remoteAddr string
	}{
		{"IPv4 Standard Loopback", "127.0.0.1:45678"},
		{"IPv4 Loopback Subnet (127.0.0.2)", "127.0.0.2:45678"},
		{"IPv4 Loopback Subnet (127.10.20.30)", "127.10.20.30:54321"},
		{"IPv6 Loopback ([::1])", "[::1]:45678"},
		{"Host localhost with port", "localhost:45678"},
	}

	for _, tc := range loopbackCases {
		t.Run("GenuineLoopback_"+tc.name, func(t *testing.T) {
			testSrv, _, _ := setupTestServer()
			req := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader(payload))
			req.RemoteAddr = tc.remoteAddr
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			testSrv.Router().ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("[%s] Loopback RemoteAddr %q was rejected! Expected 200 OK, got %d (body: %s)", tc.name, tc.remoteAddr, w.Code, w.Body.String())
			}
		})
	}

	// 4. HTTP Method Protection (Non-POST methods must be rejected)
	methods := []string{"GET", "PUT", "DELETE", "PATCH"}
	for _, m := range methods {
		t.Run("Method_"+m, func(t *testing.T) {
			req := httptest.NewRequest(m, "/api/v1/claim/direct", bytes.NewReader(payload))
			req.RemoteAddr = "127.0.0.1:45678"
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			srv.Router().ServeHTTP(w, req)

			if w.Code != http.StatusMethodNotAllowed {
				t.Fatalf("[%s] Expected 405 Method Not Allowed, got %d", m, w.Code)
			}
		})
	}
}

// TestClaimUnclaimAdversarialLoopbackSecurity tests whether an external attacker can spoof loopback headers
// to unclaim the server without an auth token.
func TestClaimUnclaimAdversarialLoopbackSecurity(t *testing.T) {
	spoofedHeaders := []struct {
		name    string
		headers map[string]string
	}{
		{"X-Forwarded-For to 127.0.0.1", map[string]string{"X-Forwarded-For": "127.0.0.1"}},
		{"X-Real-IP to 127.0.0.1", map[string]string{"X-Real-IP": "127.0.0.1"}},
		{"Forwarded RFC7239 to 127.0.0.1", map[string]string{"Forwarded": "for=127.0.0.1"}},
		{"Client-IP to 127.0.0.1", map[string]string{"Client-IP": "127.0.0.1"}},
		{"CF-Connecting-IP to 127.0.0.1", map[string]string{"CF-Connecting-IP": "127.0.0.1"}},
		{"Multiple spoofed headers", map[string]string{
			"X-Forwarded-For": "127.0.0.1",
			"X-Real-IP":       "127.0.0.1",
			"Forwarded":       "for=127.0.0.1",
		}},
	}

	for _, tc := range spoofedHeaders {
		t.Run(tc.name, func(t *testing.T) {
			srv, cfg, cm := setupTestServer()
			cfg.Server.AuthToken = "super_secret_auth_token"
			cfg.Server.Claimed = true
			_ = cm.ConfirmDirect("super_secret_auth_token", "My Node", "owner")

			req := httptest.NewRequest("POST", "/api/v1/claim/unclaim", nil)
			req.RemoteAddr = "203.0.113.50:54321"
			for k, v := range tc.headers {
				req.Header.Set(k, v)
			}

			w := httptest.NewRecorder()
			srv.Router().ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Fatalf("CRITICAL [%s]: Unclaim endpoint allowed remote unclaim via spoofed headers! Status: %d, Body: %s", tc.name, w.Code, w.Body.String())
			}
		})
	}
}

// TestLoopbackWithReverseProxyHeadersRejected verifies that even if the physical socket
// is on loopback (e.g. an attacker connecting through a local reverse proxy on 127.0.0.1),
// proxy forwarding headers indicating external origin cause direct claim and unclaim to be rejected.
func TestLoopbackWithReverseProxyHeadersRejected(t *testing.T) {
	srv, _, _ := setupTestServer()

	payload, err := json.Marshal(map[string]string{
		"auth_token":  "direct_auth_token_proxy_test",
		"server_name": "Proxy Attack",
		"username":    "attacker",
	})
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	proxyHeaders := []struct {
		name    string
		headers map[string]string
	}{
		{"X-Forwarded-For external client", map[string]string{"X-Forwarded-For": "203.0.113.195"}},
		{"X-Real-IP external client", map[string]string{"X-Real-IP": "198.51.100.22"}},
		{"Forwarded RFC7239 external client", map[string]string{"Forwarded": "for=192.0.2.1"}},
		{"Client-IP external client", map[string]string{"Client-IP": "203.0.113.99"}},
		{"CF-Connecting-IP external client", map[string]string{"CF-Connecting-IP": "198.51.100.1"}},
	}

	for _, tc := range proxyHeaders {
		t.Run("DirectClaim_"+tc.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/claim/direct", bytes.NewReader(payload))
			req.RemoteAddr = "127.0.0.1:54321" // Physical socket is local loopback (e.g. proxy)
			req.Header.Set("Content-Type", "application/json")
			for k, v := range tc.headers {
				req.Header.Set(k, v)
			}

			w := httptest.NewRecorder()
			srv.Router().ServeHTTP(w, req)

			if w.Code != http.StatusForbidden {
				t.Fatalf("[%s] Expected 403 Forbidden when proxy headers are present on loopback socket, got %d (body: %s)", tc.name, w.Code, w.Body.String())
			}
		})
	}
}

// TestClaimBackendLoopbackSecurity verifies that /api/v1/claim/backend cannot be invoked
// from remote IPs using spoofed loopback headers without a valid auth token.
func TestClaimBackendLoopbackSecurity(t *testing.T) {
	srv, cfg, cm := setupTestServer()
	cfg.Server.AuthToken = "backend_test_auth_token"
	cfg.Server.Claimed = true
	_ = cm.ConfirmDirect("backend_test_auth_token", "My Node", "owner")

	payload, _ := json.Marshal(map[string]string{
		"registry_url": "http://evil-registry.attacker.com",
	})

	req := httptest.NewRequest("POST", "/api/v1/claim/backend", bytes.NewReader(payload))
	req.RemoteAddr = "203.0.113.77:43210"
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "127.0.0.1")

	w := httptest.NewRecorder()
	srv.Router().ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized for remote /api/v1/claim/backend with spoofed header, got %d", w.Code)
	}
}
