package gog

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	GOGClientID     = "46899977096215655"
	GOGClientSecret = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9"
	GOGRedirectURI  = "https://embed.gog.com/on_login_success?origin=client"
	GOGAuthHost     = "auth.gog.com"
	GOGEmbedHost    = "embed.gog.com"
	GOGUserAgent    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Otix/1.0"
)

type Secrets struct {
	AccountID    string `json:"account_id"`
	DisplayName  string `json:"display_name"`
	RefreshToken string `json:"refresh_token"`
}

type StatusPayload struct {
	Connected   bool    `json:"connected"`
	AccountID   *string `json:"account_id"`
	DisplayName *string `json:"display_name"`
}

type GOGGame struct {
	GameID string `json:"game_id"`
	Title  string `json:"title"`
	Slug   string `json:"slug"`
	Image  string `json:"image,omitempty"`
}

type GOGClient struct {
	storageDir string
	httpClient *http.Client
}

func NewGOGClient(storageDir string) *GOGClient {
	return &GOGClient{
		storageDir: storageDir,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *GOGClient) secretsPath() string {
	return filepath.Join(c.storageDir, "gog.json")
}

func (c *GOGClient) ReadSecrets() (*Secrets, error) {
	path := c.secretsPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var s Secrets
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (c *GOGClient) WriteSecrets(s *Secrets) error {
	if err := os.MkdirAll(c.storageDir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.secretsPath(), data, 0600)
}

func (c *GOGClient) DeleteSecrets() error {
	err := os.Remove(c.secretsPath())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (c *GOGClient) Status() StatusPayload {
	s, err := c.ReadSecrets()
	if err != nil || s == nil || strings.TrimSpace(s.RefreshToken) == "" {
		return StatusPayload{Connected: false, AccountID: nil, DisplayName: nil}
	}
	return StatusPayload{
		Connected:   true,
		AccountID:   &s.AccountID,
		DisplayName: &s.DisplayName,
	}
}

func ParseAuthorizationCode(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("no authorization code provided")
	}
	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		u, err := url.Parse(trimmed)
		if err == nil {
			code := u.Query().Get("code")
			if code != "" {
				return code, nil
			}
		}
	}
	if strings.HasPrefix(trimmed, "{") {
		var payload struct {
			Code              string `json:"code"`
			AuthorizationCode string `json:"authorizationCode"`
		}
		if err := json.Unmarshal([]byte(trimmed), &payload); err == nil {
			if strings.TrimSpace(payload.Code) != "" {
				return strings.TrimSpace(payload.Code), nil
			}
			if strings.TrimSpace(payload.AuthorizationCode) != "" {
				return strings.TrimSpace(payload.AuthorizationCode), nil
			}
		}
		return "", fmt.Errorf("no authorization code found in json")
	}
	return trimmed, nil
}

func (c *GOGClient) ExchangeCode(code string) (*Secrets, error) {
	q := url.Values{}
	q.Set("client_id", GOGClientID)
	q.Set("client_secret", GOGClientSecret)
	q.Set("grant_type", "authorization_code")
	q.Set("code", code)
	q.Set("redirect_uri", GOGRedirectURI)

	reqURL := fmt.Sprintf("https://%s/token?%s", GOGAuthHost, q.Encode())
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", GOGUserAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to contact GOG auth: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("code expired or invalid. Sign in again")
	}

	var res struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		UserID       string `json:"user_id"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return nil, fmt.Errorf("failed to parse auth response: %w", err)
	}

	if res.RefreshToken == "" {
		return nil, fmt.Errorf("code expired or invalid. Sign in again")
	}

	accountID := res.UserID
	displayName := ""

	// Fetch username via userData.json
	userReq, err := http.NewRequest("GET", fmt.Sprintf("https://%s/userData.json", GOGEmbedHost), nil)
	if err == nil {
		userReq.Header.Set("Authorization", "Bearer "+res.AccessToken)
		userReq.Header.Set("User-Agent", GOGUserAgent)
		if userResp, err := c.httpClient.Do(userReq); err == nil {
			defer userResp.Body.Close()
			if uBytes, err := io.ReadAll(userResp.Body); err == nil {
				var uData struct {
					Username string `json:"username"`
					UserID   string `json:"userId"`
				}
				if err := json.Unmarshal(uBytes, &uData); err == nil {
					if uData.Username != "" {
						displayName = uData.Username
					}
					if accountID == "" && uData.UserID != "" {
						accountID = uData.UserID
					}
				}
			}
		}
	}

	if accountID == "" {
		accountID = displayName
	}

	s := &Secrets{
		AccountID:    accountID,
		DisplayName:  displayName,
		RefreshToken: res.RefreshToken,
	}
	_ = c.WriteSecrets(s)
	return s, nil
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
}

func (c *GOGClient) RefreshAccess(refreshToken string) (*TokenPair, error) {
	q := url.Values{}
	q.Set("client_id", GOGClientID)
	q.Set("client_secret", GOGClientSecret)
	q.Set("grant_type", "refresh_token")
	q.Set("refresh_token", refreshToken)

	reqURL := fmt.Sprintf("https://%s/token?%s", GOGAuthHost, q.Encode())
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", GOGUserAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to refresh GOG token: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	var res struct {
		Error        string `json:"error"`
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	_ = json.Unmarshal(bodyBytes, &res)

	if res.Error == "invalid_grant" {
		_ = c.DeleteSecrets()
		return nil, fmt.Errorf("Reconnect GOG")
	}
	if resp.StatusCode != http.StatusOK || res.AccessToken == "" {
		return nil, fmt.Errorf("failed to refresh GOG token. Please try again")
	}

	newRefresh := res.RefreshToken
	if newRefresh == "" {
		newRefresh = refreshToken
	}

	return &TokenPair{
		AccessToken:  res.AccessToken,
		RefreshToken: newRefresh,
	}, nil
}

func (c *GOGClient) FetchLibraryProducts(accessToken string) ([]GOGGame, error) {
	var allGames []GOGGame
	page := 1

	for {
		reqURL := fmt.Sprintf("https://%s/account/getFilteredProducts?mediaType=1&page=%d", GOGEmbedHost, page)
		req, err := http.NewRequest("GET", reqURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("User-Agent", GOGUserAgent)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch GOG library: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GOG library responded with status %d", resp.StatusCode)
		}

		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}

		var pageData struct {
			Page       int `json:"page"`
			TotalPages int `json:"totalPages"`
			Products   []struct {
				ID    json.RawMessage `json:"id"`
				Title string          `json:"title"`
				Slug  string          `json:"slug"`
				Image string          `json:"image"`
			} `json:"products"`
		}

		if err := json.Unmarshal(bodyBytes, &pageData); err != nil {
			return nil, fmt.Errorf("failed to parse GOG library page: %w", err)
		}

		for _, p := range pageData.Products {
			rawID := strings.Trim(string(p.ID), "\" ")
			if rawID == "" || p.Title == "" {
				continue
			}
			allGames = append(allGames, GOGGame{
				GameID: rawID,
				Title:  p.Title,
				Slug:   p.Slug,
				Image:  p.Image,
			})
		}

		if pageData.TotalPages == 0 || page >= pageData.TotalPages {
			break
		}
		page++
	}

	return allGames, nil
}

func (c *GOGClient) CompleteScan() (map[string]interface{}, error) {
	secrets, err := c.ReadSecrets()
	if err != nil || secrets == nil || strings.TrimSpace(secrets.RefreshToken) == "" {
		return nil, fmt.Errorf("GOG is not connected")
	}

	tokenPair, err := c.RefreshAccess(secrets.RefreshToken)
	if err != nil {
		return nil, err
	}

	// Update refresh token if rotated
	if tokenPair.RefreshToken != secrets.RefreshToken {
		secrets.RefreshToken = tokenPair.RefreshToken
		_ = c.WriteSecrets(secrets)
	}

	games, err := c.FetchLibraryProducts(tokenPair.AccessToken)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]bool)
	var deduped []GOGGame
	for _, g := range games {
		if !seen[g.GameID] {
			seen[g.GameID] = true
			deduped = append(deduped, g)
		}
	}

	return map[string]interface{}{
		"games": deduped,
		"total": len(deduped),
	}, nil
}
