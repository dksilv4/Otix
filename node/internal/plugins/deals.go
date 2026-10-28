package plugins

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

type FreeDeal struct {
	DealID       string  `json:"dealID"`
	Title        string  `json:"title"`
	SalePrice    string  `json:"salePrice"`
	NormalPrice  string  `json:"normalPrice"`
	Savings      string  `json:"savings"`
	Metacritic   string  `json:"metacriticScore"`
	SteamRating  string  `json:"steamRatingText"`
	Thumb        string  `json:"thumb"`
	StoreID      string  `json:"storeID"`
	StoreName    string  `json:"storeName,omitempty"`
	URL          string  `json:"url"`
	DiscoveredAt string  `json:"discovered_at"`
}

type DealsMonitor struct {
	mu           sync.RWMutex
	deals        []FreeDeal
	lastChecked  time.Time
	httpClient   *http.Client
	stopChan     chan struct{}
	stopOnce     sync.Once
}

func NewDealsMonitor() *DealsMonitor {
	dm := &DealsMonitor{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		stopChan:   make(chan struct{}),
	}
	// Initial fetch in background
	go func() {
		_ = dm.Refresh()
		dm.startLoop()
	}()
	return dm
}

func (dm *DealsMonitor) Stop() {
	dm.stopOnce.Do(func() {
		close(dm.stopChan)
	})
}

func (dm *DealsMonitor) startLoop() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			_ = dm.Refresh()
		case <-dm.stopChan:
			return
		}
	}
}

func (dm *DealsMonitor) Refresh() error {
	// CheapShark: upperPrice=0 gets 100% off / free games
	url := "https://www.cheapshark.com/api/1.0/deals?upperPrice=0"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Otix-Node/0.0.1")

	resp, err := dm.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to fetch deals: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("deals API returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var raw []struct {
		DealID          string `json:"dealID"`
		Title           string `json:"title"`
		SalePrice       string `json:"salePrice"`
		NormalPrice     string `json:"normalPrice"`
		Savings         string `json:"savings"`
		MetacriticScore string `json:"metacriticScore"`
		SteamRatingText string `json:"steamRatingText"`
		Thumb           string `json:"thumb"`
		StoreID         string `json:"storeID"`
	}

	if err := json.Unmarshal(body, &raw); err != nil {
		return err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	var deals []FreeDeal
	for _, r := range raw {
		storeName := "Store"
		switch r.StoreID {
		case "1":
			storeName = "Steam"
		case "25":
			storeName = "Epic Games"
		case "7":
			storeName = "GOG"
		case "11":
			storeName = "Humble Store"
		}

		deals = append(deals, FreeDeal{
			DealID:       r.DealID,
			Title:        r.Title,
			SalePrice:    r.SalePrice,
			NormalPrice:  r.NormalPrice,
			Savings:      r.Savings,
			Metacritic:   r.MetacriticScore,
			SteamRating:  r.SteamRatingText,
			Thumb:        r.Thumb,
			StoreID:      r.StoreID,
			StoreName:    storeName,
			URL:          fmt.Sprintf("https://www.cheapshark.com/redirect?dealID=%s", r.DealID),
			DiscoveredAt: now,
		})
	}

	dm.mu.Lock()
	dm.deals = deals
	dm.lastChecked = time.Now()
	dm.mu.Unlock()

	return nil
}

func (dm *DealsMonitor) GetDeals() []FreeDeal {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	res := make([]FreeDeal, len(dm.deals))
	copy(res, dm.deals)
	return res
}

func (dm *DealsMonitor) LastChecked() time.Time {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	return dm.lastChecked
}
