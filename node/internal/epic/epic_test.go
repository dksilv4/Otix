package epic

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type mockRoundTripper struct {
	roundTripFunc func(req *http.Request) (*http.Response, error)
}

func (m *mockRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return m.roundTripFunc(req)
}

func jsonResponse(status int, body interface{}) *http.Response {
	data, _ := json.Marshal(body)
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(bytes.NewReader(data)),
		Header:     make(http.Header),
	}
}

func TestParseAuthorizationCode(t *testing.T) {
	// Empty code
	if _, err := ParseAuthorizationCode(""); err == nil {
		t.Errorf("expected error on empty code")
	}

	// Plain code
	code, err := ParseAuthorizationCode("plain-auth-code")
	if err != nil || code != "plain-auth-code" {
		t.Errorf("expected plain-auth-code, got %q, err=%v", code, err)
	}

	// JSON payload
	code, err = ParseAuthorizationCode(`{"authorizationCode": "json-code-123"}`)
	if err != nil || code != "json-code-123" {
		t.Errorf("expected json-code-123, got %q, err=%v", code, err)
	}

	// Invalid JSON payload without authorizationCode
	if _, err := ParseAuthorizationCode(`{"foo": "bar"}`); err == nil {
		t.Errorf("expected error for json without authorizationCode")
	}
}

func TestSecretsLifecycle(t *testing.T) {
	tmpDir := t.TempDir()
	client := NewEpicClient(tmpDir)

	// Status when unlinked
	st := client.Status()
	if st.Connected || st.AccountID != nil || st.DisplayName != nil {
		t.Errorf("expected unlinked status, got %+v", st)
	}

	// Write secrets
	sec := &Secrets{
		AccountID:    "acc-123",
		DisplayName:  "GamerTag",
		RefreshToken: "ref-456",
	}
	err := client.WriteSecrets(sec)
	if err != nil {
		t.Fatalf("WriteSecrets failed: %v", err)
	}

	// Read secrets
	readSec, err := client.ReadSecrets()
	if err != nil || readSec.AccountID != "acc-123" || readSec.DisplayName != "GamerTag" || readSec.RefreshToken != "ref-456" {
		t.Fatalf("ReadSecrets mismatch: %+v", readSec)
	}

	// Status when linked
	st = client.Status()
	if !st.Connected || *st.AccountID != "acc-123" || *st.DisplayName != "GamerTag" {
		t.Errorf("expected linked status, got %+v", st)
	}

	// Delete secrets
	err = client.DeleteSecrets()
	if err != nil {
		t.Fatalf("DeleteSecrets failed: %v", err)
	}

	// Delete when file already doesn't exist
	if err := client.DeleteSecrets(); err != nil {
		t.Errorf("DeleteSecrets on non-existent file should succeed, got %v", err)
	}

	// Corrupt file
	_ = os.WriteFile(filepath.Join(tmpDir, "epic.json"), []byte("{invalid json"), 0644)
	if _, err := client.ReadSecrets(); err == nil {
		t.Errorf("expected error reading corrupt json")
	}
}

func TestIsGenericTitle(t *testing.T) {
	cases := []struct {
		title    string
		expected bool
	}{
		{"", true},
		{"live", true},
		{"production", true},
		{"MyGame Production", true},
		{"Game Staging", true},
		{"The Witcher 3", false},
		{"Cyberpunk 2077", false},
	}

	for _, c := range cases {
		got := isGenericTitle(c.title)
		if got != c.expected {
			t.Errorf("isGenericTitle(%q) = %v, want %v", c.title, got, c.expected)
		}
	}
}

func TestEpicAuthExchangeAndRefresh(t *testing.T) {
	tmpDir := t.TempDir()
	client := NewEpicClient(tmpDir)

	client.httpClient.Transport = &mockRoundTripper{
		roundTripFunc: func(req *http.Request) (*http.Response, error) {
			_ = req.ParseForm()
			grantType := req.Form.Get("grant_type")
			if grantType == "authorization_code" {
				if req.Form.Get("code") == "valid-code" {
					return jsonResponse(http.StatusOK, map[string]interface{}{
						"account_id":    "epic-acc-1",
						"displayName":   "PlayerOne",
						"refresh_token": "refresh-111",
					}), nil
				}
				return jsonResponse(http.StatusBadRequest, map[string]interface{}{"error": "invalid_grant"}), nil
			}

			if grantType == "refresh_token" {
				rf := req.Form.Get("refresh_token")
				if rf == "refresh-111" {
					return jsonResponse(http.StatusOK, map[string]interface{}{
						"access_token":  "access-222",
						"refresh_token": "refresh-222",
					}), nil
				}
				if rf == "expired-refresh" {
					return jsonResponse(http.StatusBadRequest, map[string]interface{}{
						"error": "invalid_grant",
					}), nil
				}
				return jsonResponse(http.StatusInternalServerError, map[string]interface{}{}), nil
			}

			return jsonResponse(http.StatusNotFound, nil), nil
		},
	}

	// Exchange invalid code
	if _, err := client.ExchangeCode("bad-code"); err == nil {
		t.Errorf("expected error on bad auth code")
	}

	// Exchange valid code
	sec, err := client.ExchangeCode("valid-code")
	if err != nil || sec.AccountID != "epic-acc-1" || sec.RefreshToken != "refresh-111" {
		t.Fatalf("ExchangeCode failed: %+v, err=%v", sec, err)
	}

	// Refresh access token
	tokens, err := client.RefreshAccess("refresh-111")
	if err != nil || tokens.AccessToken != "access-222" || tokens.RefreshToken != "refresh-222" {
		t.Fatalf("RefreshAccess failed: %+v, err=%v", tokens, err)
	}

	// Refresh expired token
	_, err = client.RefreshAccess("expired-refresh")
	if err == nil || !strings.Contains(err.Error(), "Reconnect Epic") {
		t.Errorf("expected Reconnect Epic error, got %v", err)
	}
}

func TestCompleteScan(t *testing.T) {
	tmpDir := t.TempDir()
	client := NewEpicClient(tmpDir)

	// Scan without secrets
	if _, err := client.CompleteScan(); err == nil {
		t.Errorf("expected error when no secrets stored")
	}

	// Write valid secrets
	_ = client.WriteSecrets(&Secrets{
		AccountID:    "acc-test",
		DisplayName:  "Tester",
		RefreshToken: "ref-test",
	})

	catID := "cat-42"
	ns := "test-namespace"
	appTitle := "live" // generic title, should be enriched by catalog
	recOffer := "offer-1"

	client.httpClient.Transport = &mockRoundTripper{
		roundTripFunc: func(req *http.Request) (*http.Response, error) {
			if strings.Contains(req.URL.Host, EpicOAuthHost) {
				return jsonResponse(http.StatusOK, map[string]interface{}{
					"access_token":  "acc-tok-123",
					"refresh_token": "ref-test-new",
				}), nil
			}

			if strings.Contains(req.URL.Host, EpicLibraryHost) {
				// Cursor pagination simulation
				cursor := req.URL.Query().Get("cursor")
				if cursor == "" {
					return jsonResponse(http.StatusOK, map[string]interface{}{
						"records": []LibraryRecord{
							{
								AppName:       "AppOne",
								SandboxID:     "sb1",
								ID:            "id1",
								CatalogItemID: &catID,
								Namespace:     &ns,
								AppTitle:      &appTitle,
								OfferID:       &recOffer,
							},
							{
								AppName: "UE_EnginePlugin", // Should be skipped due to SkipPrefixes
								ID:      "id2",
							},
						},
						"responseMetadata": map[string]string{
							"nextCursor": "page-2",
						},
					}), nil
				}
				// Page 2
				return jsonResponse(http.StatusOK, map[string]interface{}{
					"records": []LibraryRecord{
						{
							AppName: "AppTwo",
							ID:      "id3",
							Title:   &[]string{"Second Game"}[0],
						},
					},
					"responseMetadata": map[string]string{
						"nextCursor": "",
					},
				}), nil
			}

			if strings.Contains(req.URL.Host, EpicCatalogHost) {
				return jsonResponse(http.StatusOK, map[string]interface{}{
					"cat-42": map[string]string{
						"title": "Enriched Game Title",
					},
				}), nil
			}

			return jsonResponse(http.StatusNotFound, nil), nil
		},
	}

	games, err := client.CompleteScan()
	if err != nil {
		t.Fatalf("CompleteScan failed: %v", err)
	}

	if len(games) != 2 {
		t.Fatalf("expected 2 games (excluding UE_ prefix), got %d: %+v", len(games), games)
	}

	if games[0].Title != "Enriched Game Title" {
		t.Errorf("expected enriched title 'Enriched Game Title', got %q", games[0].Title)
	}

	if games[1].Title != "Second Game" {
		t.Errorf("expected title 'Second Game', got %q", games[1].Title)
	}
}
