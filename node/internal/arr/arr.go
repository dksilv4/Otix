package arr

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
)

type ConnectionTestResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
	Version string `json:"version,omitempty"`
}

type RootFolder struct {
	ID        int    `json:"id"`
	Path      string `json:"path"`
	FreeSpace *int64 `json:"free_space,omitempty"`
}

type QualityProfile struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type QueueResponse struct {
	Page         int           `json:"page"`
	PageSize     int           `json:"pageSize"`
	TotalRecords int           `json:"totalRecords"`
	Records      []interface{} `json:"records"`
}

func BuildBaseURL(host string, port int, useSSL bool, urlBase string) string {
	rawHost := strings.TrimSpace(host)
	cleanSubpath := strings.Trim(strings.TrimSpace(urlBase), "/")
	pathSuffix := ""
	if cleanSubpath != "" {
		pathSuffix = "/" + cleanSubpath
	}

	if strings.HasPrefix(rawHost, "http://") || strings.HasPrefix(rawHost, "https://") {
		u, err := url.Parse(rawHost)
		if err == nil {
			scheme := u.Scheme
			netloc := u.Host
			existingPath := strings.TrimRight(u.Path, "/")
			if cleanSubpath != "" && !strings.HasSuffix(existingPath, cleanSubpath) {
				existingPath = strings.TrimRight(existingPath+"/"+cleanSubpath, "/")
			}
			return fmt.Sprintf("%s://%s%s", scheme, netloc, existingPath)
		}
	}

	cleanedHost := strings.TrimRight(strings.ReplaceAll(rawHost, ",", "."), "/")
	if strings.Contains(cleanedHost, "/") {
		parts := strings.SplitN(cleanedHost, "/", 2)
		hostDomain := parts[0]
		extraPath := "/" + strings.Trim(parts[1], "/")
		if cleanSubpath != "" && !strings.HasSuffix(extraPath, cleanSubpath) {
			extraPath = strings.TrimRight(extraPath+"/"+cleanSubpath, "/")
		}
		scheme := "http"
		if useSSL {
			scheme = "https"
		}
		return fmt.Sprintf("%s://%s%s", scheme, hostDomain, extraPath)
	}

	scheme := "http"
	if useSSL {
		scheme = "https"
	}
	if strings.Contains(cleanedHost, ":") {
		return fmt.Sprintf("%s://%s%s", scheme, cleanedHost, pathSuffix)
	}
	return fmt.Sprintf("%s://%s:%d%s", scheme, cleanedHost, port, pathSuffix)
}

func newHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // ignore self-signed certificates on local NAS
		},
	}
}

// ── Radarr ─────────────────────────────────────────────────────────────

type RadarrClient struct {
	BaseURL string
	APIKey  string
	client  *http.Client
}

func NewRadarrClient(inst config.RadarrInstance) *RadarrClient {
	return &RadarrClient{
		BaseURL: BuildBaseURL(inst.Host, inst.Port, inst.UseSSL, inst.URLBase),
		APIKey:  inst.APIKey,
		client:  newHTTPClient(),
	}
}

func (c *RadarrClient) do(method, path string, body interface{}, out interface{}) error {
	reqURL := fmt.Sprintf("%s%s", c.BaseURL, path)
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, reqURL, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("X-Api-Key", c.APIKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBytes))
	}

	if out != nil {
		respBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		return json.Unmarshal(respBytes, out)
	}
	return nil
}

func (c *RadarrClient) TestConnection() ConnectionTestResult {
	if c.APIKey == "" {
		return ConnectionTestResult{OK: false, Message: "Radarr API key is missing"}
	}
	var res struct {
		Version string `json:"version"`
	}
	err := c.do("GET", "/api/v3/system/status", nil, &res)
	if err != nil {
		return ConnectionTestResult{OK: false, Message: err.Error()}
	}
	return ConnectionTestResult{OK: true, Message: "Connection successful", Version: res.Version}
}

func (c *RadarrClient) GetRootFolders() ([]RootFolder, error) {
	var folders []RootFolder
	err := c.do("GET", "/api/v3/rootfolder", nil, &folders)
	return folders, err
}

func (c *RadarrClient) GetQualityProfiles() ([]QualityProfile, error) {
	var profiles []QualityProfile
	err := c.do("GET", "/api/v3/qualityprofile", nil, &profiles)
	return profiles, err
}

func (c *RadarrClient) GetMovies() ([]interface{}, error) {
	var movies []interface{}
	err := c.do("GET", "/api/v3/movie", nil, &movies)
	return movies, err
}

func (c *RadarrClient) Lookup(term string) ([]interface{}, error) {
	var movies []interface{}
	path := fmt.Sprintf("/api/v3/movie/lookup?term=%s", url.QueryEscape(term))
	err := c.do("GET", path, nil, &movies)
	return movies, err
}

func (c *RadarrClient) AddMovie(payload interface{}) (interface{}, error) {
	var res interface{}
	err := c.do("POST", "/api/v3/movie", payload, &res)
	return res, err
}

func (c *RadarrClient) GetQueue(page, pageSize int) (*QueueResponse, error) {
	path := fmt.Sprintf("/api/v3/queue?page=%d&pageSize=%d&includeUnknownMovieItems=true", page, pageSize)
	var res QueueResponse
	err := c.do("GET", path, nil, &res)
	return &res, err
}

func (c *RadarrClient) DeleteQueue(id int, removeFromClient, blocklist bool) error {
	path := fmt.Sprintf("/api/v3/queue/%d?removeFromClient=%t&blocklist=%t", id, removeFromClient, blocklist)
	return c.do("DELETE", path, nil, nil)
}

func (c *RadarrClient) GetHistory(page, pageSize int) (interface{}, error) {
	path := fmt.Sprintf("/api/v3/history?page=%d&pageSize=%d", page, pageSize)
	var res interface{}
	err := c.do("GET", path, nil, &res)
	return res, err
}

// ── Sonarr ─────────────────────────────────────────────────────────────

type SonarrClient struct {
	BaseURL string
	APIKey  string
	client  *http.Client
}

func NewSonarrClient(inst config.SonarrInstance) *SonarrClient {
	return &SonarrClient{
		BaseURL: BuildBaseURL(inst.Host, inst.Port, inst.UseSSL, inst.URLBase),
		APIKey:  inst.APIKey,
		client:  newHTTPClient(),
	}
}

func (c *SonarrClient) do(method, path string, body interface{}, out interface{}) error {
	reqURL := fmt.Sprintf("%s%s", c.BaseURL, path)
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, reqURL, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("X-Api-Key", c.APIKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBytes))
	}

	if out != nil {
		respBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		return json.Unmarshal(respBytes, out)
	}
	return nil
}

func (c *SonarrClient) TestConnection() ConnectionTestResult {
	if c.APIKey == "" {
		return ConnectionTestResult{OK: false, Message: "Sonarr API key is missing"}
	}
	var res struct {
		Version string `json:"version"`
	}
	err := c.do("GET", "/api/v3/system/status", nil, &res)
	if err != nil {
		return ConnectionTestResult{OK: false, Message: err.Error()}
	}
	return ConnectionTestResult{OK: true, Message: "Connection successful", Version: res.Version}
}

func (c *SonarrClient) GetRootFolders() ([]RootFolder, error) {
	var folders []RootFolder
	err := c.do("GET", "/api/v3/rootfolder", nil, &folders)
	return folders, err
}

func (c *SonarrClient) GetQualityProfiles() ([]QualityProfile, error) {
	var profiles []QualityProfile
	err := c.do("GET", "/api/v3/qualityprofile", nil, &profiles)
	return profiles, err
}

func (c *SonarrClient) GetSeries() ([]interface{}, error) {
	var series []interface{}
	err := c.do("GET", "/api/v3/series", nil, &series)
	return series, err
}

func (c *SonarrClient) Lookup(term string) ([]interface{}, error) {
	var series []interface{}
	path := fmt.Sprintf("/api/v3/series/lookup?term=%s", url.QueryEscape(term))
	err := c.do("GET", path, nil, &series)
	return series, err
}

func (c *SonarrClient) AddSeries(payload interface{}) (interface{}, error) {
	var res interface{}
	err := c.do("POST", "/api/v3/series", payload, &res)
	return res, err
}

func (c *SonarrClient) GetQueue(page, pageSize int) (*QueueResponse, error) {
	path := fmt.Sprintf("/api/v3/queue?page=%d&pageSize=%d&includeUnknownSeriesItems=true", page, pageSize)
	var res QueueResponse
	err := c.do("GET", path, nil, &res)
	return &res, err
}

func (c *SonarrClient) DeleteQueue(id int, removeFromClient, blocklist bool) error {
	path := fmt.Sprintf("/api/v3/queue/%d?removeFromClient=%t&blocklist=%t", id, removeFromClient, blocklist)
	return c.do("DELETE", path, nil, nil)
}

func (c *SonarrClient) GetHistory(page, pageSize int) (interface{}, error) {
	path := fmt.Sprintf("/api/v3/history?page=%d&pageSize=%d", page, pageSize)
	var res interface{}
	err := c.do("GET", path, nil, &res)
	return res, err
}
