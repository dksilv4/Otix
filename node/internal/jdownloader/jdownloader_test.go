package jdownloader

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
)

func TestSecretsComputation(t *testing.T) {
	loginSecret, deviceSecret := computeSecrets("test@example.com", "secret123")
	if len(loginSecret) != 32 {
		t.Fatalf("expected 32 byte loginSecret, got %d", len(loginSecret))
	}
	if len(deviceSecret) != 32 {
		t.Fatalf("expected 32 byte deviceSecret, got %d", len(deviceSecret))
	}

	sig := calculateSignature(loginSecret, "/test/path")
	if sig == "" {
		t.Fatalf("expected non-empty signature")
	}
}

func TestCryptoPadding(t *testing.T) {
	cases := [][]byte{
		[]byte(""),
		[]byte("hello"),
		[]byte("1234567890123456"), // exact block size
		[]byte("12345678901234567"),
	}

	for _, original := range cases {
		padded := pkcs7Pad(original, 16)
		if len(padded)%16 != 0 {
			t.Errorf("padded length %d is not multiple of 16", len(padded))
		}
		unpadded, err := pkcs7Unpad(padded)
		if err != nil {
			t.Fatalf("unpad error: %v", err)
		}
		if string(unpadded) != string(original) {
			t.Errorf("expected %q, got %q", string(original), string(unpadded))
		}
	}
}

func TestCryptoPayloadEncryption(t *testing.T) {
	token := sha256.Sum256([]byte("dummy-token-for-test"))
	plaintext := []byte(`{"message":"hello world","count":42}`)

	enc, err := encryptPayload(token[:], plaintext)
	if err != nil {
		t.Fatalf("encrypt error: %v", err)
	}

	dec, err := decryptPayload(token[:], enc)
	if err != nil {
		t.Fatalf("decrypt error: %v", err)
	}

	if string(dec) != string(plaintext) {
		t.Errorf("expected %s, got %s", string(plaintext), string(dec))
	}
}

func TestDirectHTTPMode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/system/getStorageInfos":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"free": 100000000}`))
		case "/linkgrabberv2/addLinks", "/linkcollector/addLinks":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"id": 1234}`))
		case "/downloadsV2/queryPackages":
			w.WriteHeader(http.StatusOK)
			resp := JDPackagesResponse{
				Data: []JDPackage{
					{
						UUID:        1001,
						Name:        "Test.Game.Repack.part1.rar",
						BytesLoaded: 500 * 1024 * 1024,
						BytesTotal:  1000 * 1024 * 1024,
						Speed:       15 * 1024 * 1024,
						ETA:         33,
						Active:      true,
						Finished:    false,
					},
					{
						UUID:        1002,
						Name:        "Finished.Game.iso",
						BytesLoaded: 2000 * 1024 * 1024,
						BytesTotal:  2000 * 1024 * 1024,
						Speed:       0,
						ETA:         0,
						Active:      false,
						Finished:    true,
					},
				},
			}
			json.NewEncoder(w).Encode(resp)
		case "/downloadsV2/removeLinks":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{}`))
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer server.Close()

	urlParts := strings.TrimPrefix(server.URL, "http://")
	hostParts := strings.Split(urlParts, ":")
	port, _ := strconv.Atoi(hostParts[1])

	cfg := config.JDownloaderConfig{
		Enabled:    true,
		DirectHost: hostParts[0],
		DirectPort: port,
	}

	client := NewClient(cfg)
	client.SetHTTPClient(server.Client())

	// 1. TestConnection
	ok, msg := client.TestConnection()
	if !ok {
		t.Fatalf("expected direct connection ok, got msg: %s", msg)
	}

	// 2. AddDownload
	status, err := client.AddDownload("https://example.com/game.rar", "Test Game", "games")
	if err != nil {
		t.Fatalf("AddDownload failed: %v", err)
	}
	if status != "queued-direct" {
		t.Fatalf("unexpected add status: %s", status)
	}

	// 3. GetQueue
	queue, err := client.GetQueue()
	if err != nil {
		t.Fatalf("GetQueue failed: %v", err)
	}
	if len(queue.Items) != 1 {
		t.Fatalf("expected 1 active queue item, got %d", len(queue.Items))
	}
	item := queue.Items[0]
	if item.Filename != "Test.Game.Repack.part1.rar" {
		t.Errorf("expected filename Test.Game.Repack.part1.rar, got %s", item.Filename)
	}
	if item.Percentage < 49 || item.Percentage > 51 {
		t.Errorf("expected ~50%% progress, got %.2f", item.Percentage)
	}

	// 4. GetHistory
	history, err := client.GetHistory(10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(history.Items) != 1 {
		t.Fatalf("expected 1 history item, got %d", len(history.Items))
	}
	if history.Items[0].Filename != "Finished.Game.iso" {
		t.Errorf("expected Finished.Game.iso, got %s", history.Items[0].Filename)
	}

	// 5. DeleteSlot
	if err := client.DeleteSlot("1001"); err != nil {
		t.Fatalf("DeleteSlot failed: %v", err)
	}
}

func TestCloudSimulation(t *testing.T) {
	email := "user@example.com"
	pass := "secret123"
	loginSecret, deviceSecret := computeSecrets(email, pass)

	sessionTokenHex := "0102030405060708090a0b0c0d0e0f10"
	sessionBytes, _ := hex.DecodeString(sessionTokenHex)
	serverTokenHash := sha256.Sum256(append(loginSecret, sessionBytes...))
	serverToken := serverTokenHash[:]
	deviceTokenHash := sha256.Sum256(append(deviceSecret, sessionBytes...))
	deviceToken := deviceTokenHash[:]

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/my/connect"):
			connRes := ConnectResponse{
				SessionToken: sessionTokenHex,
				RegKey:       "reg123",
				RID:          1,
			}
			jsonBytes, _ := json.Marshal(connRes)
			enc, _ := encryptPayload(loginSecret, jsonBytes)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(enc))

		case strings.HasPrefix(r.URL.Path, "/my/listdevices"):
			devRes := ListDevicesResponse{
				List: []DeviceInfo{
					{ID: "dev1", Name: "SERVER", Type: "jd"},
				},
				RID: 2,
			}
			jsonBytes, _ := json.Marshal(devRes)
			enc, _ := encryptPayload(serverToken, jsonBytes)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(enc))

		case strings.Contains(r.URL.Path, "/linkcollector/addLinks"):
			bodyBytes, _ := io.ReadAll(r.Body)
			decrypted, err := decryptPayload(deviceToken, string(bodyBytes))
			if err != nil {
				t.Errorf("device request decrypt failed: %v", err)
			}
			if !strings.Contains(string(decrypted), "/linkcollector/addLinks") {
				t.Errorf("expected addLinks in decrypted body, got %s", string(decrypted))
			}
			respPayload := []byte(`{"data": true}`)
			enc, _ := encryptPayload(deviceToken, respPayload)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(enc))

		case strings.Contains(r.URL.Path, "/downloadsV2/queryPackages"):
			respPayload := []byte(`{"data": [{"uuid": 9999, "name": "Cloud.Game.zip"}]}`)
			enc, _ := encryptPayload(deviceToken, respPayload)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(enc))

		default:
			respPayload := []byte(`{"data": true}`)
			enc, _ := encryptPayload(deviceToken, respPayload)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(enc))
		}
	}))
	defer server.Close()

	cfg := config.JDownloaderConfig{
		Enabled:  true,
		Email:    email,
		Password: pass,
	}

	client := NewClient(cfg)
	client.SetHTTPClient(server.Client())

	// Override base URL in request by intercepting Transport
	origTransport := server.Client().Transport
	client.SetHTTPClient(&http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if strings.HasPrefix(req.URL.String(), MyJDownloaderAPIBase) {
				newURL := server.URL + strings.TrimPrefix(req.URL.String(), MyJDownloaderAPIBase)
				req.URL, _ = req.URL.Parse(newURL)
			}
			return origTransport.RoundTrip(req)
		}),
	})

	// 1. TestConnection
	ok, msg := client.TestConnection()
	if !ok {
		t.Fatalf("expected cloud connection ok, got: %s", msg)
	}
	if !strings.Contains(msg, "SERVER") {
		t.Errorf("expected device name SERVER in message, got: %s", msg)
	}

	// 2. AddDownload
	status, err := client.AddDownload("https://example.com/cloud.zip", "Cloud Game", "games")
	if err != nil {
		t.Fatalf("AddDownload failed: %v", err)
	}
	if status != "queued-cloud" {
		t.Errorf("expected queued-cloud status, got: %s", status)
	}

	// 3. GetQueue
	q, err := client.GetQueue()
	if err != nil {
		t.Fatalf("GetQueue failed: %v", err)
	}
	if len(q.Items) != 1 {
		t.Fatalf("expected 1 item in queue, got %d", len(q.Items))
	}
	if q.Items[0].Filename != "Cloud.Game.zip" {
		t.Errorf("expected Cloud.Game.zip, got %s", q.Items[0].Filename)
	}
}

type roundTripFunc func(req *http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestCaptchaCheck(t *testing.T) {
	_ = time.Second
	email := os.Getenv("OTIX_TEST_JD_EMAIL")
	pass := os.Getenv("OTIX_TEST_JD_PASS")
	if email == "" || pass == "" {
		t.Skip("skipping")
	}
	cfg := config.JDownloaderConfig{
		Enabled:    true,
		Email:      email,
		Password:   pass,
		DeviceName: "SERVER",
	}
	client := NewClient(cfg)

	resCaptcha, errC := client.CallDeviceCloud("/captcha/list")
	t.Logf("captcha list -> err: %v, res: %s", errC, string(resCaptcha))

	resGet, errGet := client.CallDeviceCloud("/captcha/get", 1793391417779)
	t.Logf("captcha get -> err: %v, res: %s", errGet, string(resGet))
}

func TestUnconfiguredConnection(t *testing.T) {
	cfg := config.JDownloaderConfig{}
	client := NewClient(cfg)
	ok, msg := client.TestConnection()
	if ok {
		t.Fatalf("expected unconfigured connection to fail")
	}
	if !strings.Contains(msg, "not configured") {
		t.Errorf("expected message to mention not configured, got: %s", msg)
	}
}


func TestFormatSpeed(t *testing.T) {
	tests := []struct {
		input    int64
		expected string
	}{
		{0, "0 B/s"},
		{500, "500 B/s"},
		{1024, "1.0 KB/s"},
		{10 * 1024 * 1024, "10.0 MB/s"},
		{2 * 1024 * 1024 * 1024, "2.0 GB/s"},
	}

	for _, tt := range tests {
		got := formatSpeed(tt.input)
		if got != tt.expected {
			t.Errorf("formatSpeed(%d) = %s, expected %s", tt.input, got, tt.expected)
		}
	}
}
