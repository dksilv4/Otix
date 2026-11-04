package jdownloader

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
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

	// MyJDownloader Cloud session state
	sessionToken          string
	regKey                string
	loginSecret           []byte
	deviceSecret          []byte
	serverEncryptionToken []byte
	deviceEncryptionToken []byte
	sessionExpiry         time.Time
	resolvedDeviceID      string
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

func pkcs7Pad(data []byte, blockSize int) []byte {
	padding := blockSize - len(data)%blockSize
	padtext := bytes.Repeat([]byte{byte(padding)}, padding)
	return append(data, padtext...)
}

func pkcs7Unpad(data []byte) ([]byte, error) {
	length := len(data)
	if length == 0 {
		return nil, fmt.Errorf("empty data")
	}
	padding := int(data[length-1])
	if padding == 0 || padding > length {
		return nil, fmt.Errorf("invalid padding length: %d (data len %d)", padding, length)
	}
	for i := length - padding; i < length; i++ {
		if data[i] != byte(padding) {
			return nil, fmt.Errorf("invalid padding byte")
		}
	}
	return data[:length-padding], nil
}

func decryptPayload(token []byte, base64Text string) ([]byte, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(strings.TrimSpace(base64Text))
	if err != nil {
		return nil, fmt.Errorf("base64 decode error: %w", err)
	}

	if len(ciphertext) == 0 || len(ciphertext)%aes.BlockSize != 0 {
		return nil, fmt.Errorf("invalid ciphertext length: %d", len(ciphertext))
	}

	iv := token[:16]
	key := token[16:]

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes cipher error: %w", err)
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(ciphertext))
	mode.CryptBlocks(plaintext, ciphertext)

	unpadded, err := pkcs7Unpad(plaintext)
	if err != nil {
		return nil, fmt.Errorf("pkcs7 unpad error: %w", err)
	}

	return unpadded, nil
}

func encryptPayload(token []byte, plaintext []byte) (string, error) {
	iv := token[:16]
	key := token[16:]

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes cipher error: %w", err)
	}

	padded := pkcs7Pad(plaintext, aes.BlockSize)
	ciphertext := make([]byte, len(padded))
	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(ciphertext, padded)

	return base64.StdEncoding.EncodeToString(ciphertext), nil
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

// AuthenticateCloud connects to MyJDownloader cloud service and discovers devices.
func (c *Client) AuthenticateCloud() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.authenticateCloudLocked()
}

func (c *Client) authenticateCloudLocked() error {
	if c.cfg.Email == "" || c.cfg.Password == "" {
		return fmt.Errorf("email and password required for MyJDownloader connection")
	}

	if c.sessionToken != "" && time.Now().Before(c.sessionExpiry) && c.resolvedDeviceID != "" && len(c.deviceEncryptionToken) > 0 {
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
		return fmt.Errorf("failed to read auth response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("MyJDownloader auth failed (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
	}

	decryptedConn, err := decryptPayload(loginSecret, string(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to decrypt MyJDownloader auth response: %w", err)
	}

	var connRes ConnectResponse
	if err := json.Unmarshal(decryptedConn, &connRes); err != nil {
		return fmt.Errorf("invalid MyJDownloader auth response: %w", err)
	}

	c.sessionToken = connRes.SessionToken
	c.regKey = connRes.RegKey
	c.sessionExpiry = time.Now().Add(1 * time.Hour)

	// Derive serverEncryptionToken and deviceEncryptionToken
	sessionBytes, err := hex.DecodeString(connRes.SessionToken)
	if err != nil {
		sessionBytes = []byte(connRes.SessionToken)
	}
	serverTokenHash := sha256.Sum256(append(loginSecret, sessionBytes...))
	deviceTokenHash := sha256.Sum256(append(deviceSecret, sessionBytes...))
	c.serverEncryptionToken = serverTokenHash[:]
	c.deviceEncryptionToken = deviceTokenHash[:]

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
	if c.cfg.DeviceName == "" {
		c.cfg.DeviceName = matched.Name
	}
	return nil
}

func (c *Client) listDevicesLocked() ([]DeviceInfo, error) {
	rid := time.Now().UnixMilli()
	path := fmt.Sprintf("/my/listdevices?sessiontoken=%s&rid=%d",
		url.QueryEscape(c.sessionToken),
		rid,
	)

	sig := calculateSignature(c.serverEncryptionToken, path)
	reqURL := fmt.Sprintf("%s%s&signature=%s", MyJDownloaderAPIBase, path, sig)

	resp, err := c.httpClient.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("listdevices returned HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}

	decrypted, err := decryptPayload(c.serverEncryptionToken, string(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt listdevices response: %w", err)
	}

	var res ListDevicesResponse
	if err := json.Unmarshal(decrypted, &res); err != nil {
		return nil, err
	}

	return res.List, nil
}

// CallDeviceCloud invokes an action on the resolved JDownloader device via MyJDownloader cloud.
func (c *Client) CallDeviceCloud(action string, params ...interface{}) ([]byte, error) {
	if err := c.AuthenticateCloud(); err != nil {
		return nil, err
	}

	c.mu.Lock()
	sessionToken := c.sessionToken
	deviceID := c.resolvedDeviceID
	deviceToken := c.deviceEncryptionToken
	c.mu.Unlock()

	if params == nil {
		params = []interface{}{}
	}

	rid := time.Now().UnixMilli()
	actionPath := fmt.Sprintf("/t_%s_%s%s", sessionToken, deviceID, action)
	reqActionURL := fmt.Sprintf("%s%s", MyJDownloaderAPIBase, actionPath)

	actionBody := map[string]interface{}{
		"url":    action,
		"params": params,
		"rid":    rid,
		"apiVer": 1,
	}

	actionBodyJSON, err := json.Marshal(actionBody)
	if err != nil {
		return nil, fmt.Errorf("failed to encode request body: %w", err)
	}

	encryptedAction, err := encryptPayload(deviceToken, actionBodyJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt request: %w", err)
	}

	req, err := http.NewRequest("POST", reqActionURL, strings.NewReader(encryptedAction))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/aesjson-jd; charset=utf-8")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request to device: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read device response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		// Attempt decryption of error response
		if decErr, errD := decryptPayload(deviceToken, string(respBytes)); errD == nil {
			return nil, fmt.Errorf("device error (HTTP %d): %s", resp.StatusCode, string(decErr))
		}
		return nil, fmt.Errorf("device HTTP %d: %s", resp.StatusCode, string(respBytes))
	}

	decryptedResp, err := decryptPayload(deviceToken, string(respBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt device response: %w", err)
	}

	return decryptedResp, nil
}

// TestConnection verifies connectivity to JDownloader (MyJDownloader cloud or Direct HTTP).
func (c *Client) TestConnection() (bool, string) {
	// 1. Try MyJDownloader Cloud first if credentials are provided
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

	// 2. Try Direct HTTP if host is set
	if c.cfg.DirectHost != "" && c.cfg.DirectPort > 0 {
		directURL := fmt.Sprintf("http://%s:%d/system/getStorageInfos", c.cfg.DirectHost, c.cfg.DirectPort)
		resp, err := c.httpClient.Get(directURL)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return true, fmt.Sprintf("Connected to JDownloader directly at %s:%d", c.cfg.DirectHost, c.cfg.DirectPort)
			}
		}
		// Also check root/ping or downloadcontroller
		pingURL := fmt.Sprintf("http://%s:%d/", c.cfg.DirectHost, c.cfg.DirectPort)
		if pingResp, pingErr := c.httpClient.Get(pingURL); pingErr == nil {
			defer pingResp.Body.Close()
			if pingResp.StatusCode < 500 {
				return true, fmt.Sprintf("Connected to JDownloader directly at %s:%d", c.cfg.DirectHost, c.cfg.DirectPort)
			}
		}
		return false, fmt.Sprintf("Could not connect to JDownloader directly at %s:%d", c.cfg.DirectHost, c.cfg.DirectPort)
	}

	return false, "JDownloader is not configured (requires MyJDownloader credentials or Direct Host)"
}

// AddDownload queues a link in JDownloader and instructs it to start.
func (c *Client) AddDownload(downloadURL, title, category string) (string, error) {
	destFolder := c.cfg.DownloadPath

	// 1. MyJDownloader Cloud mode
	if c.cfg.Email != "" && c.cfg.Password != "" {
		addQ, _ := json.Marshal(map[string]interface{}{
			"links":             downloadURL,
			"packageName":       title,
			"destinationFolder": destFolder,
			"autostart":         true,
			"autoExtract":       true,
		})
		_, err := c.CallDeviceCloud("/linkgrabberv2/addLinks", string(addQ))
		if err != nil {
			// Fallback to legacy linkcollector/addLinks
			_, err = c.CallDeviceCloud("/linkcollector/addLinks", downloadURL, title, destFolder, "")
			if err != nil {
				return "", fmt.Errorf("failed to add links to MyJDownloader: %w", err)
			}
		}

		// Ensure download controller is running
		_, _ = c.CallDeviceCloud("/downloadcontroller/start")

		return "queued-cloud", nil
	}

	// 2. Direct HTTP mode
	if c.cfg.DirectHost != "" && c.cfg.DirectPort > 0 {
		// Try linkcollector/addLinks
		addURL := fmt.Sprintf("http://%s:%d/linkcollector/addLinks", c.cfg.DirectHost, c.cfg.DirectPort)
		payload := map[string]interface{}{
			"links":             downloadURL,
			"packageName":       title,
			"autostart":         true,
			"autoExtract":       true,
			"destinationFolder": destFolder,
		}
		jsonBytes, _ := json.Marshal(payload)
		resp, err := c.httpClient.Post(addURL, "application/json", bytes.NewReader(jsonBytes))
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				_, _ = c.httpClient.Post(fmt.Sprintf("http://%s:%d/downloadcontroller/start", c.cfg.DirectHost, c.cfg.DirectPort), "application/json", nil)
				return "queued-direct", nil
			}
		}

		// Fallback to linkgrabberv2/addLinks
		altURL := fmt.Sprintf("http://%s:%d/linkgrabberv2/addLinks", c.cfg.DirectHost, c.cfg.DirectPort)
		respAlt, errAlt := c.httpClient.Post(altURL, "application/json", bytes.NewReader(jsonBytes))
		if errAlt == nil {
			defer respAlt.Body.Close()
			if respAlt.StatusCode == http.StatusOK {
				return "queued-direct", nil
			}
		}
		if err != nil {
			return "", fmt.Errorf("failed to queue download to direct JDownloader: %w", err)
		}
		return "", fmt.Errorf("direct JDownloader returned HTTP error")
	}

	return "", fmt.Errorf("no JDownloader connection configured")
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
	packages, speedBps, state, err := c.queryPackagesAndState()
	if err != nil {
		return nil, err
	}

	q := &usenet.ServerDownloadQueue{
		Status:   "Idle",
		Speed:    "0 B/s",
		TimeLeft: "0:00:00",
		Items:    []usenet.QueueItem{},
	}

	var totalSpeed int64 = speedBps
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
		if (pkg.Active && pkg.Speed > 0) || (state == "RUNNING" && totalSpeed > 0 && activeCount == 0) {
			status = "Downloading"
			activeCount++
		} else if pkg.Status != "" {
			status = pkg.Status
		}

		if pkg.Speed > 0 {
			totalSpeed += pkg.Speed
		}

		etaStr := "0:00:00"
		if pkg.ETA > 0 {
			d := time.Duration(pkg.ETA) * time.Second
			etaStr = fmt.Sprintf("%02d:%02d:%02d", int(d.Hours()), int(d.Minutes())%60, int(d.Seconds())%60)
		}

		pkgSpeed := pkg.Speed
		if pkgSpeed == 0 && status == "Downloading" && totalSpeed > 0 {
			pkgSpeed = totalSpeed
		}

		q.Items = append(q.Items, usenet.QueueItem{
			NzoID:      strconv.FormatInt(pkg.UUID, 10),
			Filename:   pkg.Name,
			Percentage: pct,
			SizeMB:     mb,
			SizeLeftMB: mbLeft,
			Speed:      formatSpeed(pkgSpeed),
			TimeLeft:   etaStr,
			Status:     status,
		})
	}

	if activeCount > 0 || (state == "RUNNING" && len(q.Items) > 0) {
		q.Status = "Downloading"
	}
	q.Speed = formatSpeed(totalSpeed)

	return q, nil
}

// GetHistory returns completed download packages.
func (c *Client) GetHistory(limit int) (*usenet.ServerDownloadHistory, error) {
	packages, _, _, err := c.queryPackagesAndState()
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

	// 1. MyJDownloader Cloud mode
	if c.cfg.Email != "" && c.cfg.Password != "" {
		// Remove from download list: params: [[linkUUIDs], [packageUUIDs]]
		_, _ = c.CallDeviceCloud("/downloadsV2/removeLinks", []int64{}, []int64{numID})
		// Also remove from linkcollector in case it's in the linkgrabber
		_, _ = c.CallDeviceCloud("/linkcollector/removeLinks", []int64{}, []int64{numID})
		return nil
	}

	// 2. Direct HTTP mode
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
		return err
	}

	return fmt.Errorf("no JDownloader connection configured")
}

func (c *Client) queryPackagesAndState() ([]JDPackage, int64, string, error) {
	// 1. MyJDownloader Cloud mode
	if c.cfg.Email != "" && c.cfg.Password != "" {
		var packages []JDPackage
		queryJSON := `{"bytesLoaded":true,"bytesTotal":true,"speed":true,"eta":true,"finished":true,"status":true,"running":true}`
		dlBytes, err := c.CallDeviceCloud("/downloadsV2/queryPackages", queryJSON)
		if err == nil {
			var res JDPackagesResponse
			if json.Unmarshal(dlBytes, &res) == nil {
				packages = append(packages, res.Data...)
			}
		}

		// Also query linkcollector to include gathered packages
		collectJSON := `{"bytesTotal":true,"status":true}`
		collectBytes, errC := c.CallDeviceCloud("/linkcollector/queryPackages", collectJSON)
		if errC == nil {
			var resCollect JDPackagesResponse
			if json.Unmarshal(collectBytes, &resCollect) == nil {
				for _, p := range resCollect.Data {
					// Don't duplicate if already in download list
					exists := false
					for _, existing := range packages {
						if existing.UUID == p.UUID {
							exists = true
							break
						}
					}
					if !exists {
						if p.Status == "" {
							p.Status = "Gathering"
						}
						packages = append(packages, p)
					}
				}
			}
		}

		var speed int64
		if spBytes, spErr := c.CallDeviceCloud("/downloadcontroller/getSpeedInBps"); spErr == nil {
			var spRes struct {
				Data int64 `json:"data"`
			}
			if json.Unmarshal(spBytes, &spRes) == nil {
				speed = spRes.Data
			}
		}

		var state string
		if stBytes, stErr := c.CallDeviceCloud("/downloadcontroller/getCurrentState"); stErr == nil {
			var stRes struct {
				Data string `json:"data"`
			}
			if json.Unmarshal(stBytes, &stRes) == nil {
				state = stRes.Data
			}
		}

		return packages, speed, state, nil
	}

	// 2. Direct HTTP mode
	if c.cfg.DirectHost != "" && c.cfg.DirectPort > 0 {
		reqURL := fmt.Sprintf("http://%s:%d/downloadsV2/queryPackages", c.cfg.DirectHost, c.cfg.DirectPort)
		resp, err := c.httpClient.Post(reqURL, "application/json", strings.NewReader("{}"))
		if err != nil {
			return nil, 0, "", err
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, 0, "", fmt.Errorf("queryPackages failed with HTTP %d", resp.StatusCode)
		}

		var res JDPackagesResponse
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			return nil, 0, "", err
		}

		return res.Data, 0, "", nil
	}

	return nil, 0, "", fmt.Errorf("no JDownloader connection configured")
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
