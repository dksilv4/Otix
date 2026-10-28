package usenet

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
)

type ProwlarrRelease struct {
	GUID        string  `json:"guid"`
	Title       string  `json:"title"`
	Size        int64   `json:"size"`
	DownloadURL string  `json:"download_url"`
	InfoURL     *string `json:"info_url,omitempty"`
	PublishDate *string `json:"publish_date,omitempty"`
	Indexer     string  `json:"indexer"`
	Protocol    string  `json:"protocol"`
	AgeDays     *int    `json:"age_days,omitempty"`
	Seeders     *int    `json:"seeders,omitempty"`
}

type QueueItem struct {
	NzoID      string  `json:"nzo_id"`
	Filename   string  `json:"filename"`
	Percentage float64 `json:"percentage"`
	SizeMB     float64 `json:"size_mb"`
	SizeLeftMB float64 `json:"size_left_mb"`
	Speed      string  `json:"speed"`
	TimeLeft   string  `json:"time_left"`
	Status     string  `json:"status"`
}

type ServerDownloadQueue struct {
	Status   string      `json:"status"`
	Speed    string      `json:"speed"`
	TimeLeft string      `json:"time_left"`
	Items    []QueueItem `json:"items"`
}

type HistoryItem struct {
	NzoID       string  `json:"nzo_id"`
	Filename    string  `json:"filename"`
	Status      string  `json:"status"`
	SizeBytes   int64   `json:"size_bytes"`
	FailMessage string  `json:"fail_message"`
	CompletedAt *string `json:"completed_at,omitempty"`
	Category    string  `json:"category"`
	Storage     *string `json:"storage,omitempty"`
}

type ServerDownloadHistory struct {
	Items []HistoryItem `json:"items"`
}

func ResolveServiceURL(host string, port int, useSSL bool, urlBase string) (rootURL string, subpath string) {
	raw := strings.TrimSpace(host)
	if raw == "" {
		scheme := "http"
		if useSSL {
			scheme = "https"
		}
		portSuffix := ""
		if port > 0 && port != 80 && port != 443 {
			portSuffix = fmt.Sprintf(":%d", port)
		}
		sp := ""
		if strings.Trim(urlBase, "/") != "" {
			sp = "/" + strings.Trim(urlBase, "/")
		}
		return fmt.Sprintf("%s://localhost%s", scheme, portSuffix), sp
	}

	// 1. Clean typo commas: "server,example.com" -> "server.example.com"
	re := regexp.MustCompile(`(?i)([a-z0-9_-]),([a-z0-9_-])`)
	raw = re.ReplaceAllString(raw, "$1.$2")

	scheme := "http"
	if useSSL {
		scheme = "https"
	}
	if strings.Contains(raw, "://") {
		parts := strings.SplitN(raw, "://", 2)
		scheme = strings.ToLower(parts[0])
		raw = parts[1]
	}

	hostPort := raw
	pathFromHost := ""
	if strings.Contains(raw, "/") {
		parts := strings.SplitN(raw, "/", 2)
		hostPort = parts[0]
		pathFromHost = strings.Trim(parts[1], "/")
	}

	hostname := hostPort
	effectivePort := port
	if strings.Contains(hostPort, ":") {
		parts := strings.SplitN(hostPort, ":", 2)
		hostname = parts[0]
		if p, err := strconv.Atoi(parts[1]); err == nil {
			effectivePort = p
		}
	} else {
		if scheme == "https" && (effectivePort == 8080 || effectivePort == 9696 || effectivePort == 0) {
			effectivePort = 443
		}
	}

	portSuffix := ""
	if effectivePort > 0 && effectivePort != 80 && effectivePort != 443 {
		portSuffix = fmt.Sprintf(":%d", effectivePort)
	}

	rootURL = fmt.Sprintf("%s://%s%s", scheme, hostname, portSuffix)

	var pathParts []string
	if pathFromHost != "" {
		pathParts = append(pathParts, pathFromHost)
	}
	extra := strings.Trim(urlBase, "/")
	if extra != "" && !strings.Contains(pathFromHost, extra) {
		pathParts = append(pathParts, extra)
	}
	if len(pathParts) > 0 {
		subpath = "/" + strings.Join(pathParts, "/")
	}
	return rootURL, subpath
}

func newHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 60 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
}

// ── SABnzbd Client ───────────────────────────────────────────────────────

type SabnzbdClient struct {
	cfg    config.SabnzbdConfig
	client *http.Client
}

func NewSabnzbdClient(cfg config.SabnzbdConfig) *SabnzbdClient {
	return &SabnzbdClient{
		cfg:    cfg,
		client: newHTTPClient(),
	}
}

func (c *SabnzbdClient) buildURL(mode string, extraParams url.Values) string {
	root, subpath := ResolveServiceURL(c.cfg.Host, c.cfg.Port, c.cfg.UseSSL, c.cfg.URLBase)
	base := fmt.Sprintf("%s%s/api", root, subpath)
	params := url.Values{}
	params.Set("mode", mode)
	params.Set("output", "json")
	if c.cfg.APIKey != "" {
		params.Set("apikey", c.cfg.APIKey)
	}
	for k, vs := range extraParams {
		for _, v := range vs {
			params.Add(k, v)
		}
	}
	return fmt.Sprintf("%s?%s", base, params.Encode())
}

func (c *SabnzbdClient) TestConnection() (bool, string) {
	if c.cfg.APIKey == "" {
		return false, "SABnzbd API key is required"
	}
	reqURL := c.buildURL("version", nil)
	resp, err := c.client.Get(reqURL)
	if err != nil {
		return false, fmt.Sprintf("Failed to connect: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Sprintf("HTTP %d", resp.StatusCode)
	}

	var res struct {
		Version string `json:"version"`
		Status  bool   `json:"status"`
		Error   string `json:"error"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&res)
	if res.Error != "" {
		return false, res.Error
	}
	if res.Version != "" {
		return true, fmt.Sprintf("Connected (version %s)", res.Version)
	}
	return true, "Connected successfully"
}

func (c *SabnzbdClient) AddDownload(downloadURL, title, category string) (string, error) {
	params := url.Values{}
	params.Set("name", downloadURL)
	if title != "" {
		params.Set("nzbname", title)
	}
	cat := category
	if cat == "" {
		cat = c.cfg.Category
	}
	if cat != "" {
		params.Set("cat", cat)
	}

	reqURL := c.buildURL("addurl", params)
	resp, err := c.client.Get(reqURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var res struct {
		Status bool     `json:"status"`
		NzoIDs []string `json:"nzo_ids"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&res)
	if len(res.NzoIDs) > 0 {
		return res.NzoIDs[0], nil
	}
	return "queued", nil
}

func (c *SabnzbdClient) GetQueue() (*ServerDownloadQueue, error) {
	reqURL := c.buildURL("queue", nil)
	resp, err := c.client.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var raw struct {
		Queue struct {
			Status   string `json:"status"`
			Speed    string `json:"speed"`
			TimeLeft string `json:"timeleft"`
			Slots    []struct {
				NzoID      string `json:"nzo_id"`
				Filename   string `json:"filename"`
				Percentage string `json:"percentage"`
				MB         string `json:"mb"`
				MBLeft     string `json:"mbleft"`
				TimeLeft   string `json:"timeleft"`
				Status     string `json:"status"`
			} `json:"slots"`
		} `json:"queue"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	q := &ServerDownloadQueue{
		Status:   raw.Queue.Status,
		Speed:    raw.Queue.Speed,
		TimeLeft: raw.Queue.TimeLeft,
		Items:    []QueueItem{},
	}
	if q.Status == "" {
		q.Status = "Idle"
	}

	for _, slot := range raw.Queue.Slots {
		pct, _ := strconv.ParseFloat(slot.Percentage, 64)
		mb, _ := strconv.ParseFloat(slot.MB, 64)
		mbLeft, _ := strconv.ParseFloat(slot.MBLeft, 64)

		q.Items = append(q.Items, QueueItem{
			NzoID:      slot.NzoID,
			Filename:   slot.Filename,
			Percentage: pct,
			SizeMB:     mb,
			SizeLeftMB: mbLeft,
			Speed:      raw.Queue.Speed,
			TimeLeft:   slot.TimeLeft,
			Status:     slot.Status,
		})
	}

	return q, nil
}

func (c *SabnzbdClient) GetHistory(limit int) (*ServerDownloadHistory, error) {
	params := url.Values{}
	params.Set("limit", strconv.Itoa(limit))
	reqURL := c.buildURL("history", params)
	resp, err := c.client.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var raw struct {
		History struct {
			Slots []struct {
				NzoID       string `json:"nzo_id"`
				Name        string `json:"name"`
				Status      string `json:"status"`
				Bytes       int64  `json:"bytes"`
				FailMessage string `json:"fail_message"`
				Category    string `json:"category"`
				Storage     string `json:"storage"`
				Completed   int64  `json:"completed"`
			} `json:"slots"`
		} `json:"history"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	h := &ServerDownloadHistory{Items: []HistoryItem{}}
	for _, slot := range raw.History.Slots {
		var completedStr *string
		if slot.Completed > 0 {
			t := time.Unix(slot.Completed, 0).UTC().Format(time.RFC3339)
			completedStr = &t
		}
		var storagePtr *string
		if slot.Storage != "" {
			storagePtr = &slot.Storage
		}

		h.Items = append(h.Items, HistoryItem{
			NzoID:       slot.NzoID,
			Filename:    slot.Name,
			Status:      slot.Status,
			SizeBytes:   slot.Bytes,
			FailMessage: slot.FailMessage,
			CompletedAt: completedStr,
			Category:    slot.Category,
			Storage:     storagePtr,
		})
	}
	return h, nil
}

func (c *SabnzbdClient) DeleteSlot(nzoID string) error {
	params := url.Values{}
	params.Set("name", "delete")
	params.Set("value", nzoID)
	reqURL := c.buildURL("queue", params)
	resp, err := c.client.Get(reqURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (c *SabnzbdClient) PauseQueue() error {
	reqURL := c.buildURL("pause", nil)
	resp, err := c.client.Get(reqURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (c *SabnzbdClient) ResumeQueue() error {
	reqURL := c.buildURL("resume", nil)
	resp, err := c.client.Get(reqURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// ── Prowlarr Client ──────────────────────────────────────────────────────

type ProwlarrClient struct {
	cfg    config.ProwlarrConfig
	client *http.Client
}

func NewProwlarrClient(cfg config.ProwlarrConfig) *ProwlarrClient {
	return &ProwlarrClient{
		cfg:    cfg,
		client: newHTTPClient(),
	}
}

func (c *ProwlarrClient) baseURL() string {
	root, subpath := ResolveServiceURL(c.cfg.Host, c.cfg.Port, c.cfg.UseSSL, c.cfg.URLBase)
	return fmt.Sprintf("%s%s", root, subpath)
}

func (c *ProwlarrClient) TestConnection() (bool, string) {
	if c.cfg.APIKey == "" {
		return false, "Prowlarr API key is required"
	}
	reqURL := fmt.Sprintf("%s/api/v1/system/status", c.baseURL())
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return false, err.Error()
	}
	req.Header.Set("X-Api-Key", c.cfg.APIKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return false, fmt.Sprintf("Failed to connect: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return true, "Connected successfully"
}

func (c *ProwlarrClient) Search(query string, categories []int) ([]ProwlarrRelease, error) {
	if c.cfg.APIKey == "" {
		return nil, fmt.Errorf("Prowlarr API key is required")
	}

	cats := categories
	if len(cats) == 0 {
		cats = c.cfg.Categories
	}
	if len(cats) == 0 {
		cats = []int{1000, 4000}
	}

	params := url.Values{}
	params.Set("query", query)
	params.Set("limit", "100")
	params.Set("type", "search")
	for _, cat := range cats {
		params.Add("categories", strconv.Itoa(cat))
	}

	reqURL := fmt.Sprintf("%s/api/v1/search?%s", c.baseURL(), params.Encode())
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Api-Key", c.cfg.APIKey)
	req.Header.Set("User-Agent", "Otix/1.0 (Node)")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Prowlarr search returned HTTP %d", resp.StatusCode)
	}

	var raw []struct {
		GUID        string  `json:"guid"`
		Title       string  `json:"title"`
		Size        int64   `json:"size"`
		DownloadURL string  `json:"downloadUrl"`
		MagnetURL   string  `json:"magnetUrl"`
		InfoURL     *string `json:"infoUrl"`
		PublishDate *string `json:"publishDate"`
		Indexer     string  `json:"indexer"`
		Protocol    string  `json:"protocol"`
		AgeDays     *int    `json:"ageDays"`
		Seeders     *int    `json:"seeders"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	var releases []ProwlarrRelease
	for _, item := range raw {
		proto := strings.ToLower(item.Protocol)
		if proto == "" {
			proto = "usenet"
		}
		dl := item.DownloadURL
		if dl == "" {
			if item.MagnetURL != "" {
				dl = item.MagnetURL
			} else if strings.HasPrefix(item.GUID, "magnet:") {
				dl = item.GUID
			}
		}
		releases = append(releases, ProwlarrRelease{
			GUID:        item.GUID,
			Title:       item.Title,
			Size:        item.Size,
			DownloadURL: dl,
			InfoURL:     item.InfoURL,
			PublishDate: item.PublishDate,
			Indexer:     item.Indexer,
			Protocol:    proto,
			AgeDays:     item.AgeDays,
			Seeders:     item.Seeders,
		})
	}
	return releases, nil
}

func (c *ProwlarrClient) GetIndexers() ([]interface{}, error) {
	reqURL := fmt.Sprintf("%s/api/v1/indexer", c.baseURL())
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Api-Key", c.cfg.APIKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var res []interface{}
	err = json.NewDecoder(resp.Body).Decode(&res)
	return res, err
}

func (c *ProwlarrClient) SyncIndexers() (interface{}, error) {
	reqURL := fmt.Sprintf("%s/api/v1/command", c.baseURL())
	body := bytes.NewReader([]byte(`{"name":"AppSync"}`))
	req, err := http.NewRequest("POST", reqURL, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Api-Key", c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var res interface{}
	err = json.NewDecoder(resp.Body).Decode(&res)
	return res, err
}
