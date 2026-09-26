package providers

import (
	"fmt"
	"strings"
	"sync"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/usenet"
)

type ProviderInfo struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Protocol    string `json:"protocol"`
	Configured  bool   `json:"configured"`
	Connected   bool   `json:"connected"`
	StatusText  string `json:"status_text"`
}

type ProviderManager struct {
	mu  sync.RWMutex
	cfg *config.AppConfig
}

func NewProviderManager(cfg *config.AppConfig) *ProviderManager {
	return &ProviderManager{cfg: cfg}
}

func InferDownloadProtocol(downloadURL string) string {
	lower := strings.ToLower(strings.TrimSpace(downloadURL))
	if strings.HasPrefix(lower, "magnet:") || strings.HasSuffix(lower, ".torrent") || strings.Contains(lower, ".torrent?") {
		return "torrent"
	}
	return "usenet"
}

func (pm *ProviderManager) ListProviders() map[string]interface{} {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	sabClient := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
	sabConfigured := pm.cfg.Usenet.Sabnzbd.Host != "" && pm.cfg.Usenet.Sabnzbd.APIKey != ""
	sabConnected, sabMsg := false, "Not configured"
	if sabConfigured {
		sabConnected, sabMsg = sabClient.TestConnection()
	}

	prowClient := usenet.NewProwlarrClient(pm.cfg.Usenet.Prowlarr)
	prowConfigured := pm.cfg.Usenet.Prowlarr.Host != "" && pm.cfg.Usenet.Prowlarr.APIKey != ""
	prowConnected, prowMsg := false, "Not configured"
	if prowConfigured {
		prowConnected, prowMsg = prowClient.TestConnection()
	}

	downloaders := []ProviderInfo{
		{
			Name:       "sabnzbd",
			Type:       "downloader",
			Protocol:   "usenet",
			Configured: sabConfigured,
			Connected:  sabConnected,
			StatusText: sabMsg,
		},
	}

	searchProviders := []ProviderInfo{
		{
			Name:       "prowlarr",
			Type:       "search_provider",
			Protocol:   "multi",
			Configured: prowConfigured,
			Connected:  prowConnected,
			StatusText: prowMsg,
		},
	}

	return map[string]interface{}{
		"downloaders":            downloaders,
		"search_providers":       searchProviders,
		"active_downloader":      "sabnzbd",
		"active_search_provider": "prowlarr",
	}
}

func (pm *ProviderManager) TestProvider(providerType, name string) (map[string]interface{}, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	ptype := strings.ToLower(providerType)
	pname := strings.ToLower(name)

	if ptype == "downloader" || ptype == "downloaders" {
		if pname == "sabnzbd" {
			client := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
			ok, msg := client.TestConnection()
			return map[string]interface{}{"ok": ok, "message": msg}, nil
		}
		return nil, fmt.Errorf("downloader '%s' not supported", name)
	}

	if ptype == "search_provider" || ptype == "search" || ptype == "indexer" || ptype == "indexers" {
		if pname == "prowlarr" {
			client := usenet.NewProwlarrClient(pm.cfg.Usenet.Prowlarr)
			ok, msg := client.TestConnection()
			return map[string]interface{}{"ok": ok, "message": msg}, nil
		}
		return nil, fmt.Errorf("search provider '%s' not supported", name)
	}

	return nil, fmt.Errorf("unknown provider type '%s'", providerType)
}

func (pm *ProviderManager) Search(query string, categories []int) ([]usenet.ProwlarrRelease, error) {
	pm.mu.RLock()
	client := usenet.NewProwlarrClient(pm.cfg.Usenet.Prowlarr)
	pm.mu.RUnlock()
	return client.Search(query, categories)
}

func (pm *ProviderManager) AddDownload(downloadURL, title, category, protocol string) (string, error) {
	proto := strings.ToLower(protocol)
	if proto == "" {
		proto = InferDownloadProtocol(downloadURL)
	}
	if proto == "torrent" {
		return "", fmt.Errorf("no torrent download client configured on this node")
	}

	pm.mu.RLock()
	client := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
	pm.mu.RUnlock()
	return client.AddDownload(downloadURL, title, category)
}

func (pm *ProviderManager) GetQueue() (*usenet.ServerDownloadQueue, error) {
	pm.mu.RLock()
	client := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
	pm.mu.RUnlock()
	return client.GetQueue()
}

func (pm *ProviderManager) GetHistory(limit int) (*usenet.ServerDownloadHistory, error) {
	pm.mu.RLock()
	client := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
	pm.mu.RUnlock()
	return client.GetHistory(limit)
}

func (pm *ProviderManager) DeleteDownload(id string) error {
	pm.mu.RLock()
	client := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
	pm.mu.RUnlock()
	return client.DeleteSlot(id)
}
