package heartbeat

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
)

var LoopbackHosts = map[string]bool{
	"127.0.0.1": true,
	"localhost": true,
	"::1":       true,
}

const DockerRegistry = "http://api:8000/api"

func GetLocalIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

func ResolveRegistryURL(cfg *config.AppConfig) string {
	override := strings.TrimSpace(os.Getenv("OTIX_REGISTRY_URL"))
	if override != "" {
		return strings.TrimRight(override, "/")
	}

	registry := strings.TrimRight(strings.TrimSpace(cfg.Server.RegistryURL), "/")
	if registry == "" {
		return ""
	}

	u, err := url.Parse(registry)
	if err == nil {
		host := strings.ToLower(u.Hostname())
		_, errDocker := os.Stat("/.dockerenv")
		inDocker := errDocker == nil
		if inDocker && LoopbackHosts[host] {
			return DockerRegistry
		}
	}

	return registry
}

type HeartbeatPayload struct {
	ServerName     string      `json:"server_name"`
	LocalEndpoints []string    `json:"local_endpoints"`
	Port           int         `json:"port"`
	AuthToken      string      `json:"auth_token"`
	ClaimCode      string      `json:"claim_code,omitempty"`
	Claimed        bool        `json:"claimed"`
	RunningGame    interface{} `json:"running_game,omitempty"`
}

type HeartbeatRunner struct {
	cfg                 *config.AppConfig
	claimMgr            *claim.ClaimManager
	client              *http.Client
	stopChan            chan struct{}
	runningGameProvider func() interface{}
}

func NewHeartbeatRunner(cfg *config.AppConfig, claimMgr *claim.ClaimManager) *HeartbeatRunner {
	return &HeartbeatRunner{
		cfg:      cfg,
		claimMgr: claimMgr,
		client:   &http.Client{Timeout: 10 * time.Second},
		stopChan: make(chan struct{}),
	}
}

// SetRunningGameProvider registers a callback that provides the currently active game.
func (h *HeartbeatRunner) SetRunningGameProvider(provider func() interface{}) {
	h.runningGameProvider = provider
}

func (h *HeartbeatRunner) Start() {
	go h.loop()
}

func (h *HeartbeatRunner) Stop() {
	close(h.stopChan)
}

func (h *HeartbeatRunner) SendOnce() (time.Duration, error) {
	if !h.cfg.Server.EnableHeartbeat {
		return 30 * time.Second, nil
	}

	registryURL := ResolveRegistryURL(h.cfg)
	if registryURL == "" {
		return 30 * time.Second, nil
	}

	localIP := GetLocalIP()
	port := h.cfg.Server.Port

	payload := HeartbeatPayload{
		ServerName: h.cfg.Server.Name,
		LocalEndpoints: []string{
			fmt.Sprintf("http://%s:%d", localIP, port),
			fmt.Sprintf("http://127.0.0.1:%d", port),
		},
		Port:      port,
		AuthToken: h.cfg.Server.AuthToken,
		ClaimCode: h.claimMgr.CurrentCode(),
		Claimed:   h.claimMgr.IsClaimed(),
	}
	if h.runningGameProvider != nil {
		payload.RunningGame = h.runningGameProvider()
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return 15 * time.Second, err
	}

	targetURL := fmt.Sprintf("%s/v1/servers/heartbeat", registryURL)
	resp, err := h.client.Post(targetURL, "application/json", bytes.NewReader(data))
	if err != nil {
		fmt.Printf("[Heartbeat] Failed to reach %s: %v\n", targetURL, err)
		return 15 * time.Second, err
	}
	resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		fmt.Printf("[Heartbeat] Server heartbeat announced to %s (claimed=%t)\n", targetURL, payload.Claimed)
		return 5 * time.Minute, nil
	}
	fmt.Printf("[Heartbeat] %s returned HTTP %d\n", targetURL, resp.StatusCode)
	return 15 * time.Second, fmt.Errorf("HTTP %d", resp.StatusCode)
}

func (h *HeartbeatRunner) loop() {
	delay := 5 * time.Second

	for {
		select {
		case <-time.After(delay):
			nextDelay, _ := h.SendOnce()
			delay = nextDelay
		case <-h.stopChan:
			return
		}
	}
}

