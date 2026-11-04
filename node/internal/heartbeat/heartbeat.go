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
	"github.com/google/uuid"
)

var LoopbackHosts = map[string]bool{
	"127.0.0.1": true,
	"localhost": true,
	"::1":       true,
}

const DockerRegistry = "http://api:8000/api"

var (
	tailscaleCIDR = mustParseCIDR("100.64.0.0/10")
	lan10CIDR     = mustParseCIDR("10.0.0.0/8")
	lan172CIDR    = mustParseCIDR("172.16.0.0/12")
	lan192CIDR    = mustParseCIDR("192.168.0.0/16")
	docker172CIDR = mustParseCIDR("172.17.0.0/16")
)

func mustParseCIDR(s string) *net.IPNet {
	_, ipnet, err := net.ParseCIDR(s)
	if err != nil {
		panic(err)
	}
	return ipnet
}

type NetworkInterface struct {
	Name string   `json:"name"`
	Type string   `json:"type"` // "lan", "tailscale", "docker", "loopback", "other"
	IPs  []string `json:"ips"`
}

func ClassifyInterface(name string, ip net.IP, isLoopback bool) string {
	if isLoopback || (ip != nil && ip.IsLoopback()) {
		return "loopback"
	}
	lowerName := strings.ToLower(name)

	// Tailscale / VPN: 100.64.0.0/10 or interface names tailscale*, utun*, wg*, tun*, tap*
	if (ip != nil && tailscaleCIDR.Contains(ip)) ||
		strings.HasPrefix(lowerName, "tailscale") ||
		strings.HasPrefix(lowerName, "utun") ||
		strings.HasPrefix(lowerName, "wg") ||
		strings.HasPrefix(lowerName, "tun") ||
		strings.HasPrefix(lowerName, "tap") {
		return "tailscale"
	}

	// Docker / bridge: docker0, br-*, veth*, cni*, 172.17.0.0/16
	if strings.HasPrefix(lowerName, "docker") ||
		strings.HasPrefix(lowerName, "br-") ||
		strings.HasPrefix(lowerName, "veth") ||
		strings.HasPrefix(lowerName, "cni") ||
		(ip != nil && docker172CIDR.Contains(ip) && strings.Contains(lowerName, "docker")) {
		return "docker"
	}

	// LAN: 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12
	if ip != nil && (lan10CIDR.Contains(ip) || lan172CIDR.Contains(ip) || lan192CIDR.Contains(ip)) {
		return "lan"
	}

	return "other"
}

func EnumerateInterfaces() []NetworkInterface {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}

	var results []NetworkInterface
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil || len(addrs) == 0 {
			continue
		}

		var ips []string
		primaryType := ""
		isLoopback := (iface.Flags & net.FlagLoopback) != 0

		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil {
				continue
			}

			ipv4 := ip.To4()
			if ipv4 != nil {
				ips = append(ips, ipv4.String())
				if primaryType == "" {
					primaryType = ClassifyInterface(iface.Name, ipv4, isLoopback)
				}
			} else if !ip.IsLinkLocalUnicast() {
				ips = append(ips, ip.String())
				if primaryType == "" {
					primaryType = ClassifyInterface(iface.Name, ip, isLoopback)
				}
			}
		}

		if len(ips) > 0 {
			if primaryType == "" {
				primaryType = "other"
			}
			results = append(results, NetworkInterface{
				Name: iface.Name,
				Type: primaryType,
				IPs:  ips,
			})
		}
	}
	return results
}

func GetRoutableEndpoints(port int) []string {
	interfaces := EnumerateInterfaces()
	var lanEndpoints []string
	var tailscaleEndpoints []string
	var dockerEndpoints []string

	for _, iface := range interfaces {
		for _, ipStr := range iface.IPs {
			ip := net.ParseIP(ipStr)
			if ip == nil || ip.IsLoopback() {
				continue
			}
			endpoint := fmt.Sprintf("http://%s", net.JoinHostPort(ipStr, fmt.Sprintf("%d", port)))
			switch iface.Type {
			case "lan":
				lanEndpoints = append(lanEndpoints, endpoint)
			case "tailscale":
				tailscaleEndpoints = append(tailscaleEndpoints, endpoint)
			case "docker":
				dockerEndpoints = append(dockerEndpoints, endpoint)
			}
		}
	}

	var endpoints []string
	endpoints = append(endpoints, lanEndpoints...)
	endpoints = append(endpoints, tailscaleEndpoints...)

	if len(endpoints) == 0 && len(dockerEndpoints) > 0 {
		endpoints = append(endpoints, dockerEndpoints...)
	}

	if len(endpoints) == 0 {
		endpoints = append(endpoints, fmt.Sprintf("http://127.0.0.1:%d", port))
	}

	return endpoints
}

func GetLocalIP() string {
	interfaces := EnumerateInterfaces()
	for _, iface := range interfaces {
		if iface.Type == "lan" {
			for _, ip := range iface.IPs {
				if parsed := net.ParseIP(ip); parsed != nil && parsed.To4() != nil {
					return ip
				}
			}
		}
	}
	for _, iface := range interfaces {
		if iface.Type == "tailscale" {
			for _, ip := range iface.IPs {
				if parsed := net.ParseIP(ip); parsed != nil && parsed.To4() != nil {
					return ip
				}
			}
		}
	}

	conn, err := net.DialTimeout("udp", "8.8.8.8:80", 500*time.Millisecond)
	if err == nil {
		defer conn.Close()
		localAddr, ok := conn.LocalAddr().(*net.UDPAddr)
		if ok && localAddr != nil && !localAddr.IP.IsLoopback() {
			return localAddr.IP.String()
		}
	}
	return "127.0.0.1"
}

func NormalizeBaseAPI(rawURL string) string {
	u := strings.TrimRight(strings.TrimSpace(rawURL), "/")
	if strings.HasSuffix(u, "/api/v1") {
		return strings.TrimSuffix(u, "/v1")
	}
	if strings.HasSuffix(u, "/api") {
		return u
	}
	return u + "/api"
}

var DefaultRegistryURL = "https://otix.app/api"

func ResolveRegistryURL(cfg *config.AppConfig) string {
	override := strings.TrimSpace(os.Getenv("OTIX_REGISTRY_URL"))
	if override != "" {
		return strings.TrimRight(override, "/")
	}

	registry := strings.TrimRight(strings.TrimSpace(cfg.Server.RegistryURL), "/")
	if registry == "" {
		registry = DefaultRegistryURL
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
	NodeID            string             `json:"node_id"`
	ServerName        string             `json:"server_name"`
	LocalEndpoints    []string           `json:"local_endpoints"`
	NetworkInterfaces []NetworkInterface `json:"network_interfaces"`
	Port              int                `json:"port"`
	AuthToken         string             `json:"auth_token"`
	ClaimCode         string             `json:"claim_code,omitempty"`
	Claimed           bool               `json:"claimed"`
	ClaimedBy         string             `json:"claimed_by,omitempty"`
	RunningGame       interface{}        `json:"running_game,omitempty"`
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

// TriggerNow forces an immediate heartbeat dispatch in a background goroutine.
func (h *HeartbeatRunner) TriggerNow() {
	go func() {
		_, _ = h.SendOnce()
	}()
}

func (h *HeartbeatRunner) SendOnce() (time.Duration, error) {
	if !h.cfg.Server.EnableHeartbeat {
		return 30 * time.Second, nil
	}

	registryURL := ResolveRegistryURL(h.cfg)
	if registryURL == "" {
		return 30 * time.Second, nil
	}

	port := h.cfg.Server.Port
	nodeID := strings.TrimSpace(h.cfg.Server.NodeID)
	if nodeID == "" {
		nodeID = uuid.New().String()
		h.cfg.Server.NodeID = nodeID
		_ = h.cfg.Save("")
	}

	payload := HeartbeatPayload{
		NodeID:            nodeID,
		ServerName:        h.cfg.Server.Name,
		LocalEndpoints:    GetRoutableEndpoints(port),
		NetworkInterfaces: EnumerateInterfaces(),
		Port:              port,
		AuthToken:         h.cfg.Server.AuthToken,
		ClaimCode:         h.claimMgr.CurrentCode(),
		Claimed:           h.claimMgr.IsClaimed(),
		ClaimedBy:         h.cfg.Server.ClaimedBy,
	}
	if h.runningGameProvider != nil {
		payload.RunningGame = h.runningGameProvider()
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return 15 * time.Second, err
	}

	baseAPI := NormalizeBaseAPI(registryURL)
	targetURL := fmt.Sprintf("%s/v1/nodes/%s/heartbeat/", baseAPI, nodeID)
	resp, err := h.client.Post(targetURL, "application/json", bytes.NewReader(data))
	if err != nil {
		fmt.Printf("[Heartbeat] Failed to reach %s: %v\n", targetURL, err)
		return 15 * time.Second, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		var hbResp struct {
			Status     string `json:"status"`
			Claimed    bool   `json:"claimed"`
			AuthToken  string `json:"auth_token"`
			ServerName string `json:"server_name"`
			Username   string `json:"username"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&hbResp); err == nil {
			if !payload.Claimed && payload.AuthToken == "" && hbResp.Claimed && hbResp.AuthToken != "" && !h.claimMgr.IsClaimed() {
				fmt.Printf("[Heartbeat] Node recognized by backend as claimed by %s (%s). Synchronizing local state...\n", hbResp.Username, hbResp.ServerName)
				_ = h.claimMgr.ConfirmDirect(hbResp.AuthToken, hbResp.ServerName, hbResp.Username)
			}
		}
		fmt.Printf("[Heartbeat] Server heartbeat announced to %s (claimed=%t)\n", targetURL, h.claimMgr.IsClaimed())
		if !h.claimMgr.IsClaimed() {
			return 5 * time.Second, nil
		}
		return 30 * time.Second, nil
	}
	fmt.Printf("[Heartbeat] %s returned HTTP %d\n", targetURL, resp.StatusCode)
	return 10 * time.Second, fmt.Errorf("HTTP %d", resp.StatusCode)
}

func (h *HeartbeatRunner) loop() {
	delay := 2 * time.Second

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

