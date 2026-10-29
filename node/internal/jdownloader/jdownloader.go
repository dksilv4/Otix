package jdownloader

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/usenet"
)

const (
	MyJDownloaderAPIBase = "https://api.jdownloader.org"
	DefaultAppKey        = "Otix"
)

type Client struct {
	cfg        config.JDownloaderConfig
	httpClient *http.Client
	mu         sync.Mutex

	// MyJDownloader session state
	sessionToken string
	regKey       string
	loginSecret  []byte
	deviceSecret []byte
	sessionExpiry time.Time
	resolvedDeviceID string
}

func NewClient(cfg config.JDownloaderConfig) *Client {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   15 * time.Second,
		},
	}
}

// SetHTTPClient overrides the HTTP client (useful for unit testing).
func (c *Client) SetHTTPClient(client *http.Client) {
	c.httpClient = client
}

// computeSecrets derives loginSecret and deviceSecret from email and password according to MyJDownloader specification.
func computeSecrets(email, password string) ([]byte, []byte) {
	lowerEmail := strings.ToLower(strings.TrimSpace(email))
	serverInput := fmt.Sprintf("%s%s%s", lowerEmail, password, "server")
	deviceInput := fmt.Sprintf("%s%s%s", lowerEmail, password, "device")

	loginHash := sha256.Sum256([]byte(serverInput))
	deviceHash := sha256.Sum256([]byte(deviceInput))

	loginSecret := make([]byte, len(loginHash))
	copy(loginSecret, loginHash[:])

	deviceSecret := make([]byte, len(deviceHash))
	copy(deviceSecret, deviceHash[:])

	return loginSecret, deviceSecret
}

// calculateSignature generates HMAC-SHA256 signature for MyJDownloader requests.
func calculateSignature(key []byte, data string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

type DeviceInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type ConnectResponse struct {
	SessionToken string `json:"sessiontoken"`
	RegKey       string `json:"regkey"`
	RID          int64  `json:"rid"`
}

type ListDevicesResponse struct {
	List []DeviceInfo `json:"list"`
	RID  int64        `json:"rid"`
}

// AuthenticateCloud connects to MyJDownloader cloud service if email and password are provided.
func (c *Client) AuthenticateCloud() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.cfg.Email == "" || c.cfg.Password == "" {
		return fmt.Errorf("email and password required for MyJDownloader connection")
	}

	if c.sessionToken != "" && time.Now().Before(c.sessionExpiry) {
		return nil
	}

	loginSecret, deviceSecret := computeSecrets(c.cfg.Email, c.cfg.Password)
	c.loginSecret = loginSecret
	c.deviceSecret = deviceSecret

	rid := time.Now().UnixMilli()
	connectPath := fmt.Sprintf("/my/connect?email=%s&appkey=%s&rid=%d",
		url.QueryEscape(c.cfg.Email),
		url.QueryEscape(DefaultAppKey),
		rid,
	)

	sig := calculateSignature(loginSecret, connectPath)
	reqURL := fmt.Sprintf("%s%s&signature=%s", MyJDownloaderAPIBase, connectPath, sig)

	resp, err := c.httpClient.Post(reqURL, "application/json", nil)
	if err != nil {
		return fmt.Errorf("failed to reach MyJDownloader API: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("MyJDownloader auth failed (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var connRes ConnectResponse
	if err := json.Unmarshal(bodyBytes, &connRes); err != nil {
		return fmt.Errorf("invalid MyJDownloader auth response: %w", err)
	}

	c.sessionToken = connRes.SessionToken
	c.regKey = connRes.RegKey
	c.sessionExpiry = time.Now().Add(1 * time.Hour)

	// Enumerate devices
	devList, err := c.listDevicesLocked()
	if err != nil {
		return err
	}

	// Match target device
	var matched DeviceInfo
	for _, dev := range devList {
		if c.cfg.DeviceID != "" && dev.ID == c.cfg.DeviceID {
			matched = dev
			break
		}
		if c.cfg.DeviceName != "" && strings.EqualFold(dev.Name, c.cfg.DeviceName) {
			matched = dev
			break
		}
	}

	if matched.ID == "" && len(devList) > 0 {
		matched = devList[0]
	}

	if matched.ID == "" {
		return fmt.Errorf("no connected JDownloader devices found for account %s", c.cfg.Email)
	}

	c.resolvedDeviceID = matched.ID
	return nil
}

func (c *Client) listDevicesLocked() ([]DeviceInfo, error) {
	rid := time.Now().UnixMilli()
	path := fmt.Sprintf("/my/listdevices?sessiontoken=%s&rid=%d",
		url.QueryEscape(c.sessionToken),
		rid,
	)

	sigKey := sha256.Sum256(append(c.loginSecret, []byte(c.sessionToken)...))
	sig := calculateSignature(sigKey[:], path)
	reqURL := fmt.Sprintf("%s%s&signature=%s", MyJDownloaderAPIBase, path, sig)

	resp, err := c.httpClient.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("listdevices returned HTTP %d", resp.StatusCode)
	}

	var res ListDevicesResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	return res.List, nil
}

// TestConnection verifies connectivity to JDownloader (Direct HTTP or MyJDownloader cloud).
func (c *Client) TestConnection() (bool, string) {
	// 1. Try Direct HTTP first if host is set
	if c.cfg.DirectHost != "" && c.cfg.DirectPort > 0 {
		directURL := fmt.Sprintf("http://%s:%d/system/getStorageInfos", c.cfg.DirectHost, c.cfg.DirectPort)
		resp, err := c.httpClient.Get(directURL)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return true, fmt.Sprintf("Connected to JDownloader directly at %s:%d", c.cfg.DirectHost, c.cfg.DirectPort)
			}
		}
		// Also check root/ping
		pingURL := fmt.Sprintf("http://%s:%d/", c.cfg.DirectHost, c.cfg.DirectPort)
		if pingResp, pingErr := c.httpClient.Get(pingURL); pingErr == nil {
			defer pingResp.Body.Close()
			if pingResp.StatusCode < 500 {
				return true, fmt.Sprintf("Connected to JDownloader at %s:%d", c.cfg.DirectHost, c.cfg.DirectPort)
			}
		}
	}

	// 2. Try MyJDownloader Cloud
	if c.cfg.Email != "" && c.cfg.Password != "" {
		if err := c.AuthenticateCloud(); err != nil {
			return false, err.Error()
		}
		target := c.cfg.DeviceName
		if target == "" {
			target = c.resolvedDeviceID
		}
		return true, fmt.Sprintf("Connected to MyJDownloader (device: %s)", target)
	}

	return false, "JDownloader is not configured (requires MyJDownloader credentials or Direct Host)"
}

// AddDownload queues a link or container in JDownloader.
func (c *Client) AddDownload(downloadURL, title, category string) (string, error) {
	// If direct mode is available
	if c.cfg.DirectHost != "" && c.cfg.DirectPort > 0 {
		addURL := fmt.Sprintf("http://%s:%d/linkgrabberv2/addLinks", c.cfg.DirectHost, c.cfg.DirectPort)
		payload := map[string]interface{}{
			"links":               downloadURL,
			"packageName":         title,
			"autostart":           true,
			"autoExtract":         true,
			"destinationFolder":   c.cfg.DownloadPath,
		}
		jsonBytes, _ := json.Marshal(payload)
		resp, err := c.httpClient.Post(addURL, "application/json", bytes.NewReader(jsonBytes))
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return "queued-direct", nil
			}
		}
	}

	// Cloud MyJDownloader mode
	if err := c.AuthenticateCloud(); err != nil {
		return "", err
	}

	devID := c.resolvedDeviceID
	actionPath := fmt.Sprintf("/t_%s_%s/linkgrabberv2/addLinks", c.sessionToken, devID)
	reqURL := fmt.Sprintf("%s%s", MyJDownloaderAPIBase, actionPath)

	payload := map[string]interface{}{
		"links":             downloadURL,
		"packageName":       title,
		"autostart":         true,
		"autoExtract":       true,
		"destinationFolder": c.cfg.DownloadPath,
	}
	jsonBytes, _ := json.Marshal(payload)

	resp, err := c.httpClient.Post(reqURL, "application/json", bytes.NewReader(jsonBytes))
	if err != nil {
		return "", fmt.Errorf("failed to send addLinks to MyJDownloader: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("addLinks failed with HTTP %d", resp.StatusCode)
	}

	return "queued-cloud", nil
}

type JDPackage struct {
	UUID        int64  `json:"uuid"`
	Name        string `json:"name"`
	BytesLoaded int64  `json:"bytesLoaded"`
	BytesTotal  int64  `json:"bytesTotal"`
	Speed       int64  `json:"speed"`
	ETA         int64  `json:"eta"`
	Status      string `json:"status"`
	Finished    bool   `json:"finished"`
	Active      bool   `json:"active"`
}

type JDPackagesResponse struct {
	Data []JDPackage `json:"data"`
}

// GetQueue retrieves the active and queued packages from JDownloader.
func (c *Client) GetQueue() (*usenet.ServerDownloadQueue, error) {
	packages, err := c.queryPackages()
	if err != nil {
		return nil, err
	}

	q := &usenet.ServerDownloadQueue{
		Status:   "Idle",
		Speed:    "0 B/s",
		TimeLeft: "0:00:00",
		Items:    []usenet.QueueItem{},
	}

	var totalSpeed int64
	var activeCount int

	for _, pkg := range packages {
		if pkg.Finished {
			continue
		}

		pct := 0.0
		if pkg.BytesTotal > 0 {
			pct = float64(pkg.BytesLoaded) / float64(pkg.BytesTotal) * 100.0
			if pct > 100.0 {
				pct = 100.0
			}
		}

		mb := float64(pkg.BytesTotal) / (1024 * 1024)
		mbLeft := float64(pkg.BytesTotal-pkg.BytesLoaded) / (1024 * 1024)
		if mbLeft < 0 {
			mbLeft = 0
		}

		status := "Queued"
		if pkg.Active && pkg.Speed > 0 {
			status = "Downloading"
			activeCount++
		} else if pkg.Status != "" {
			status = pkg.Status
		}

		totalSpeed += pkg.Speed

		etaStr := "0:00:00"
		if pkg.ETA > 0 {
			d := time.Duration(pkg.ETA) * time.Second
			etaStr = fmt.Sprintf("%02d:%02d:%02d", int(d.Hours()), int(d.Minutes())%60, int(d.Seconds())%60)
		}

		q.Items = append(q.Items, usenet.QueueItem{
			NzoID:      strconv.FormatInt(pkg.UUID, 10),
			Filename:   pkg.Name,
			Percentage: pct,
			SizeMB:     mb,
			SizeLeftMB: mbLeft,
			Speed:      formatSpeed(pkg.Speed),
			TimeLeft:   etaStr,
			Status:     status,
		})
	}

	if activeCount > 0 {
		q.Status = "Downloading"
	}
	q.Speed = formatSpeed(totalSpeed)

	return q, nil
}

// GetHistory returns completed download packages.
func (c *Client) GetHistory(limit int) (*usenet.ServerDownloadHistory, error) {
	packages, err := c.queryPackages()
	if err != nil {
		return nil, err
	}

	h := &usenet.ServerDownloadHistory{
		Items: []usenet.HistoryItem{},
	}

	count := 0
	for _, pkg := range packages {
		if !pkg.Finished && (pkg.BytesTotal == 0 || pkg.BytesLoaded < pkg.BytesTotal) {
			continue
		}

		nowStr := time.Now().UTC().Format(time.RFC3339)
		h.Items = append(h.Items, usenet.HistoryItem{
			NzoID:       strconv.FormatInt(pkg.UUID, 10),
			Filename:    pkg.Name,
			Status:      "Completed",
			SizeBytes:   pkg.BytesTotal,
			CompletedAt: &nowStr,
			Category:    "games",
		})

		count++
		if limit > 0 && count >= limit {
			break
		}
	}

	return h, nil
}

// DeleteSlot removes a package from JDownloader.
func (c *Client) DeleteSlot(id string) error {
	numID, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid package id: %s", id)
	}

	// Try direct mode
	if c.cfg.DirectHost != "" && c.cfg.DirectPort > 0 {
		delURL := fmt.Sprintf("http://%s:%d/downloadsV2/removeLinks", c.cfg.DirectHost, c.cfg.DirectPort)
		payload := map[string]interface{}{
			"packageIds": []int64{numID},
		}
		jsonBytes, _ := json.Marshal(payload)
		resp, err := c.httpClient.Post(delURL, "application/json", bytes.NewReader(jsonBytes))
		if err == nil {
			defer resp.Body.Close()
			return nil
		}
	}

	// Cloud mode
	if err := c.AuthenticateCloud(); err != nil {
		return err
	}

	actionPath := fmt.Sprintf("/t_%s_%s/downloadsV2/removeLinks", c.sessionToken, c.resolvedDeviceID)
	reqURL := fmt.Sprintf("%s%s", MyJDownloaderAPIBase, actionPath)

	payload := map[string]interface{}{
		"packageIds": []int64{numID},
	}
	jsonBytes, _ := json.Marshal(payload)

	resp, err := c.httpClient.Post(reqURL, "application/json", bytes.NewReader(jsonBytes))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

func (c *Client) queryPackages() ([]JDPackage, error) {
	// Try direct mode first
	if c.cfg.DirectHost != "" && c.cfg.DirectPort > 0 {
		reqURL := fmt.Sprintf("http://%s:%d/downloadsV2/queryPackages", c.cfg.DirectHost, c.cfg.DirectPort)
		resp, err := c.httpClient.Post(reqURL, "application/json", strings.NewReader("{}"))
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var res JDPackagesResponse
				if err := json.NewDecoder(resp.Body).Decode(&res); err == nil {
					return res.Data, nil
				}
			}
		}
	}

	// Cloud mode
	if c.cfg.Email != "" && c.cfg.Password != "" {
		if err := c.AuthenticateCloud(); err != nil {
			return nil, err
		}

		actionPath := fmt.Sprintf("/t_%s_%s/downloadsV2/queryPackages", c.sessionToken, c.resolvedDeviceID)
		reqURL := fmt.Sprintf("%s%s", MyJDownloaderAPIBase, actionPath)

		resp, err := c.httpClient.Post(reqURL, "application/json", strings.NewReader("{}"))
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("queryPackages failed with HTTP %d", resp.StatusCode)
		}

		var res JDPackagesResponse
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			return nil, err
		}
		return res.Data, nil
	}

	return nil, fmt.Errorf("no JDownloader connection configured")
}

func formatSpeed(bytesPerSec int64) string {
	if bytesPerSec <= 0 {
		return "0 B/s"
	}
	const unit = 1024
	if bytesPerSec < unit {
		return fmt.Sprintf("%d B/s", bytesPerSec)
	}
	div, exp := int64(unit), 0
	for n := bytesPerSec / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	units := []string{"KB/s", "MB/s", "GB/s"}
	return fmt.Sprintf("%.1f %s", float64(bytesPerSec)/float64(div), units[exp])
}
