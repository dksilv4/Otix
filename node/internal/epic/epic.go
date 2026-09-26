package epic

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	EpicClientID     = "34a02cf8f4414e29b15921876da36f9a"
	EpicClientSecret = "daafbccc737745039dffe53d94fc76cf"
	EpicOAuthHost    = "account-public-service-prod03.ol.epicgames.com"
	EpicLibraryHost  = "library-service.live.use1a.on.epicgames.com"
	EpicCatalogHost  = "catalog-public-service-prod06.ol.epicgames.com"
	EpicUserAgent    = "UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit"
)

var SkipPrefixes = []string{"UE_", "QuixelBridge_", "MetaHumanSample_", "Lyra_", "FabPlugin_"}

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

type EpicGame struct {
	AppName       string  `json:"app_name"`
	Namespace     *string `json:"namespace"`
	CatalogItemID *string `json:"catalog_item_id"`
	OfferID       *string `json:"offer_id"`
	Title         string  `json:"title"`
}

type EpicClient struct {
	storageDir string
	httpClient *http.Client
}

func NewEpicClient(storageDir string) *EpicClient {
	return &EpicClient{
		storageDir: storageDir,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *EpicClient) secretsPath() string {
	return filepath.Join(c.storageDir, "epic.json")
}

func (c *EpicClient) ReadSecrets() (*Secrets, error) {
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

func (c *EpicClient) WriteSecrets(s *Secrets) error {
	if err := os.MkdirAll(c.storageDir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.secretsPath(), data, 0600)
}

func (c *EpicClient) DeleteSecrets() error {
	err := os.Remove(c.secretsPath())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (c *EpicClient) Status() StatusPayload {
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

func basicAuthHeader() string {
	auth := fmt.Sprintf("%s:%s", EpicClientID, EpicClientSecret)
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(auth))
}

func ParseAuthorizationCode(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("no authorization code provided")
	}
	if strings.HasPrefix(trimmed, "{") {
		var payload struct {
			AuthorizationCode string `json:"authorizationCode"`
		}
		if err := json.Unmarshal([]byte(trimmed), &payload); err == nil && strings.TrimSpace(payload.AuthorizationCode) != "" {
			return strings.TrimSpace(payload.AuthorizationCode), nil
		}
		return "", fmt.Errorf("no authorization code provided")
	}
	return trimmed, nil
}

func (c *EpicClient) ExchangeCode(code string) (*Secrets, error) {
	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", code)
	data.Set("token_type", "eg1")

	reqURL := fmt.Sprintf("https://%s/account/api/oauth/token", EpicOAuthHost)
	req, err := http.NewRequest("POST", reqURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", basicAuthHeader())
	req.Header.Set("User-Agent", EpicUserAgent)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to contact Epic auth: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("code expired or invalid. Sign in again")
	}

	var res struct {
		AccountID    string `json:"account_id"`
		DisplayName  string `json:"displayName"`
		DisplayName2 string `json:"display_name"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return nil, fmt.Errorf("failed to parse auth response: %w", err)
	}

	displayName := res.DisplayName
	if displayName == "" {
		displayName = res.DisplayName2
	}
	if res.AccountID == "" || res.RefreshToken == "" {
		return nil, fmt.Errorf("code expired or invalid. Sign in again")
	}

	s := &Secrets{
		AccountID:    res.AccountID,
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

func (c *EpicClient) RefreshAccess(refreshToken string) (*TokenPair, error) {
	data := url.Values{}
	data.Set("grant_type", "refresh_token")
	data.Set("refresh_token", refreshToken)
	data.Set("token_type", "eg1")

	reqURL := fmt.Sprintf("https://%s/account/api/oauth/token", EpicOAuthHost)
	req, err := http.NewRequest("POST", reqURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", basicAuthHeader())
	req.Header.Set("User-Agent", EpicUserAgent)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to refresh Epic token: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	var res struct {
		Error        string `json:"error"`
		ErrorCode    string `json:"errorCode"`
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	_ = json.Unmarshal(bodyBytes, &res)

	if res.Error == "invalid_grant" || res.ErrorCode == "invalid_refresh_token" {
		return nil, fmt.Errorf("Reconnect Epic")
	}
	if resp.StatusCode != http.StatusOK || res.AccessToken == "" || res.RefreshToken == "" {
		return nil, fmt.Errorf("failed to scan Epic library. Please try again")
	}

	return &TokenPair{
		AccessToken:  res.AccessToken,
		RefreshToken: res.RefreshToken,
	}, nil
}

type LibraryRecord struct {
	AppName       string  `json:"appName"`
	SandboxID     string  `json:"sandboxId"`
	ID            string  `json:"id"`
	CatalogItemID *string `json:"catalogItemId"`
	Namespace     *string `json:"namespace"`
	AppTitle      *string `json:"appTitle"`
	Title         *string `json:"title"`
	SandboxName   *string `json:"sandboxName"`
	OfferID       *string `json:"offerId"`
}

func (c *EpicClient) FetchLibraryItems(accessToken string) ([]LibraryRecord, error) {
	var items []LibraryRecord
	cursor := ""

	for {
		reqURL := fmt.Sprintf("https://%s/library/api/public/items?includeMetadata=true", EpicLibraryHost)
		if cursor != "" {
			reqURL += "&cursor=" + url.QueryEscape(cursor)
		}

		req, err := http.NewRequest("GET", reqURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "bearer "+accessToken)
		req.Header.Set("User-Agent", EpicUserAgent)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to scan Epic library: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("failed to scan Epic library: HTTP %d", resp.StatusCode)
		}

		var body struct {
			Records          []LibraryRecord `json:"records"`
			ResponseMetadata struct {
				NextCursor string `json:"nextCursor"`
			} `json:"responseMetadata"`
		}

		bodyBytes, _ := io.ReadAll(resp.Body)
		if err := json.Unmarshal(bodyBytes, &body); err != nil {
			return nil, fmt.Errorf("failed to parse library items: %w", err)
		}

		items = append(items, body.Records...)
		if body.ResponseMetadata.NextCursor == "" {
			break
		}
		cursor = body.ResponseMetadata.NextCursor
	}

	return items, nil
}

func isGenericTitle(title string) bool {
	s := strings.ToLower(strings.TrimSpace(title))
	if s == "" || s == "live" || s == "production" || s == "staging" || s == "test" || s == "dev" || s == "development" {
		return true
	}
	if strings.HasSuffix(s, " production") || strings.HasSuffix(s, " staging") {
		return true
	}
	return false
}

func (c *EpicClient) EnrichCatalogTitles(accessToken string, records []LibraryRecord) map[string]string {
	byNamespace := make(map[string][]string)
	for _, rec := range records {
		appName := rec.AppName
		if appName == "" {
			appName = rec.SandboxID
		}
		if appName == "" {
			appName = rec.ID
		}
		skip := false
		for _, prefix := range SkipPrefixes {
			if strings.HasPrefix(appName, prefix) {
				skip = true
				break
			}
		}
		if skip || rec.CatalogItemID == nil || rec.Namespace == nil {
			continue
		}
		catalogID := *rec.CatalogItemID
		namespace := *rec.Namespace

		title := ""
		if rec.AppTitle != nil {
			title = *rec.AppTitle
		} else if rec.Title != nil {
			title = *rec.Title
		} else if rec.SandboxName != nil {
			title = *rec.SandboxName
		}

		if isGenericTitle(title) || title == appName {
			byNamespace[namespace] = append(byNamespace[namespace], catalogID)
		}
	}

	if len(byNamespace) == 0 {
		return map[string]string{}
	}

	catalogTitles := make(map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 15) // max 15 concurrent requests

	for ns, ids := range byNamespace {
		for i := 0; i < len(ids); i += 50 {
			end := i + 50
			if end > len(ids) {
				end = len(ids)
			}
			batch := ids[i:end]
			namespace := ns

			wg.Add(1)
			go func(batchIDs []string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				var queryParts []string
				for _, cid := range batchIDs {
					queryParts = append(queryParts, "id="+url.QueryEscape(cid))
				}
				urlStr := fmt.Sprintf("https://%s/catalog/api/shared/namespace/%s/bulk/items?%s&country=US&locale=en-US",
					EpicCatalogHost, namespace, strings.Join(queryParts, "&"))

				req, err := http.NewRequest("GET", urlStr, nil)
				if err != nil {
					return
				}
				req.Header.Set("Authorization", "bearer "+accessToken)
				req.Header.Set("User-Agent", EpicUserAgent)

				resp, err := c.httpClient.Do(req)
				if err != nil || resp.StatusCode != http.StatusOK {
					return
				}
				defer resp.Body.Close()

				bodyBytes, _ := io.ReadAll(resp.Body)
				var data map[string]struct {
					Title string `json:"title"`
				}
				if err := json.Unmarshal(bodyBytes, &data); err != nil {
					return
				}

				mu.Lock()
				for cid, item := range data {
					if item.Title != "" {
						catalogTitles[cid] = item.Title
					}
				}
				mu.Unlock()
			}(batch)
		}
	}

	wg.Wait()
	return catalogTitles
}

func (c *EpicClient) CompleteScan() ([]EpicGame, error) {
	secrets, err := c.ReadSecrets()
	if err != nil || secrets == nil || strings.TrimSpace(secrets.RefreshToken) == "" {
		return nil, fmt.Errorf("No Epic account linked")
	}

	tokens, err := c.RefreshAccess(secrets.RefreshToken)
	if err != nil {
		if err.Error() == "Reconnect Epic" {
			_ = c.DeleteSecrets()
		}
		return nil, err
	}

	if tokens.RefreshToken != secrets.RefreshToken {
		secrets.RefreshToken = tokens.RefreshToken
		_ = c.WriteSecrets(secrets)
	}

	records, err := c.FetchLibraryItems(tokens.AccessToken)
	if err != nil {
		return nil, err
	}

	catalogTitles := c.EnrichCatalogTitles(tokens.AccessToken, records)

	seen := make(map[string]bool)
	var games []EpicGame

	for _, rec := range records {
		appName := rec.AppName
		if appName == "" {
			appName = rec.SandboxID
		}
		if appName == "" {
			appName = rec.ID
		}
		if appName == "" {
			continue
		}

		skip := false
		for _, prefix := range SkipPrefixes {
			if strings.HasPrefix(appName, prefix) {
				skip = true
				break
			}
		}
		if skip || seen[appName] {
			continue
		}
		seen[appName] = true

		var catalogID *string = rec.CatalogItemID
		title := ""
		if rec.AppTitle != nil && !isGenericTitle(*rec.AppTitle) {
			title = *rec.AppTitle
		} else if rec.Title != nil && !isGenericTitle(*rec.Title) {
			title = *rec.Title
		} else if catalogID != nil && catalogTitles[*catalogID] != "" {
			title = catalogTitles[*catalogID]
		} else if rec.SandboxName != nil && !isGenericTitle(*rec.SandboxName) {
			title = *rec.SandboxName
		} else if catalogID != nil && catalogTitles[*catalogID] != "" {
			title = catalogTitles[*catalogID]
		} else if rec.SandboxName != nil {
			title = *rec.SandboxName
		} else {
			title = appName
		}

		games = append(games, EpicGame{
			AppName:       appName,
			Namespace:     rec.Namespace,
			CatalogItemID: catalogID,
			OfferID:       rec.OfferID,
			Title:         title,
		})
	}

	return games, nil
}
