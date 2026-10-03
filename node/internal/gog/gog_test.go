package gog

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
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
	if _, err := ParseAuthorizationCode(""); err == nil {
		t.Errorf("expected error on empty code")
	}

	code, err := ParseAuthorizationCode("plain-auth-code")
	if err != nil || code != "plain-auth-code" {
		t.Errorf("expected plain-auth-code, got %q, err=%v", code, err)
	}

	// URL format
	code, err = ParseAuthorizationCode("https://embed.gog.com/on_login_success?code=url-code-123&origin=client")
	if err != nil || code != "url-code-123" {
		t.Errorf("expected url-code-123, got %q, err=%v", code, err)
	}

	// JSON format
	code, err = ParseAuthorizationCode(`{"code": "json-code-456"}`)
	if err != nil || code != "json-code-456" {
		t.Errorf("expected json-code-456, got %q, err=%v", code, err)
	}
}

func TestSecretsLifecycle(t *testing.T) {
	tmpDir := t.TempDir()
	client := NewGOGClient(tmpDir)

	st := client.Status()
	if st.Connected {
		t.Errorf("expected disconnected status")
	}

	s := &Secrets{
		AccountID:    "12345",
		DisplayName:  "GOGGamer",
		RefreshToken: "refresh-token-xyz",
	}
	if err := client.WriteSecrets(s); err != nil {
		t.Fatalf("failed to write secrets: %v", err)
	}

	st = client.Status()
	if !st.Connected || *st.AccountID != "12345" || *st.DisplayName != "GOGGamer" {
		t.Errorf("unexpected status: %+v", st)
	}

	if err := client.DeleteSecrets(); err != nil {
		t.Fatalf("failed to delete secrets: %v", err)
	}

	st = client.Status()
	if st.Connected {
		t.Errorf("expected disconnected status after delete")
	}
}

func TestExchangeCodeAndScan(t *testing.T) {
	tmpDir := t.TempDir()
	client := NewGOGClient(tmpDir)

	client.httpClient.Transport = &mockRoundTripper{
		roundTripFunc: func(req *http.Request) (*http.Response, error) {
			if strings.Contains(req.URL.String(), "/token") {
				return jsonResponse(http.StatusOK, map[string]interface{}{
					"access_token":  "mock-access-token",
					"refresh_token": "mock-refresh-token",
					"user_id":       "123456",
					"expires_in":    3600,
				}), nil
			}
			if strings.Contains(req.URL.String(), "/userData.json") {
				return jsonResponse(http.StatusOK, map[string]interface{}{
					"username": "TestGOGUser",
					"userId":   "123456",
				}), nil
			}
			if strings.Contains(req.URL.String(), "/getFilteredProducts") {
				return jsonResponse(http.StatusOK, map[string]interface{}{
					"page":       1,
					"totalPages": 1,
					"products": []map[string]interface{}{
						{
							"id":    1455194922,
							"title": "Bounty Train",
							"slug":  "bounty_train",
						},
						{
							"id":    1944143058,
							"title": "Love and Sex",
							"slug":  "love_and_sex",
						},
					},
				}), nil
			}
			return jsonResponse(http.StatusNotFound, nil), nil
		},
	}

	secrets, err := client.ExchangeCode("test-code")
	if err != nil {
		t.Fatalf("ExchangeCode failed: %v", err)
	}
	if secrets.AccountID != "123456" || secrets.DisplayName != "TestGOGUser" {
		t.Errorf("unexpected secrets: %+v", secrets)
	}

	res, err := client.CompleteScan()
	if err != nil {
		t.Fatalf("CompleteScan failed: %v", err)
	}
	games := res["games"].([]GOGGame)
	if len(games) != 2 {
		t.Errorf("expected 2 games, got %d", len(games))
	}
	if games[0].GameID != "1455194922" || games[0].Title != "Bounty Train" {
		t.Errorf("unexpected game 0: %+v", games[0])
	}
}
