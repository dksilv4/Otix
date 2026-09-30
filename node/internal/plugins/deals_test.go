package plugins

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"
)

type mockTransport struct {
	roundTripFunc func(req *http.Request) (*http.Response, error)
}

func (m *mockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return m.roundTripFunc(req)
}

func TestDealsMonitor(t *testing.T) {
	dm := &DealsMonitor{
		httpClient: &http.Client{Timeout: 5 * time.Second},
		stopChan:   make(chan struct{}),
	}

	sampleData := []map[string]interface{}{
		{
			"dealID":          "deal1",
			"title":           "Game A",
			"salePrice":       "0.00",
			"normalPrice":     "19.99",
			"savings":         "100.000000",
			"metacriticScore": "85",
			"steamRatingText": "Very Positive",
			"thumb":           "https://thumb1.jpg",
			"storeID":         "1", // Steam
		},
		{
			"dealID":          "deal2",
			"title":           "Game B",
			"salePrice":       "0.00",
			"normalPrice":     "29.99",
			"savings":         "100.000000",
			"metacriticScore": "70",
			"steamRatingText": "",
			"thumb":           "https://thumb2.jpg",
			"storeID":         "25", // Epic Games
		},
		{
			"dealID":          "deal3",
			"title":           "Game C",
			"salePrice":       "0.00",
			"normalPrice":     "9.99",
			"savings":         "100.000000",
			"metacriticScore": "",
			"steamRatingText": "",
			"thumb":           "",
			"storeID":         "7", // GOG
		},
		{
			"dealID":          "deal4",
			"title":           "Game D",
			"salePrice":       "0.00",
			"normalPrice":     "4.99",
			"savings":         "100.000000",
			"metacriticScore": "",
			"steamRatingText": "",
			"thumb":           "",
			"storeID":         "11", // Humble
		},
		{
			"dealID":          "deal5",
			"title":           "Game E",
			"salePrice":       "0.00",
			"normalPrice":     "14.99",
			"savings":         "100.000000",
			"metacriticScore": "",
			"steamRatingText": "",
			"thumb":           "",
			"storeID":         "99", // Other
		},
	}

	statusCode := http.StatusOK
	var respBody []byte
	respBody, _ = json.Marshal(sampleData)

	dm.httpClient.Transport = &mockTransport{
		roundTripFunc: func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: statusCode,
				Body:       io.NopCloser(bytes.NewReader(respBody)),
				Header:     make(http.Header),
			}, nil
		},
	}

	// Successful Refresh
	err := dm.Refresh()
	if err != nil {
		t.Fatalf("Refresh failed: %v", err)
	}

	deals := dm.GetDeals()
	if len(deals) != 5 {
		t.Fatalf("expected 5 deals, got %d", len(deals))
	}

	storeNames := map[string]string{
		"deal1": "Steam",
		"deal2": "Epic Games",
		"deal3": "GOG",
		"deal4": "Humble Store",
		"deal5": "Store",
	}

	for _, d := range deals {
		expectedStore, ok := storeNames[d.DealID]
		if !ok || d.StoreName != expectedStore {
			t.Errorf("for deal %s expected store %s, got %s", d.DealID, expectedStore, d.StoreName)
		}
	}

	if dm.LastChecked().IsZero() {
		t.Errorf("expected LastChecked to be non-zero")
	}

	// Server error
	statusCode = http.StatusInternalServerError
	respBody = []byte("error")
	if err := dm.Refresh(); err == nil {
		t.Errorf("expected error on HTTP 500")
	}

	// Corrupt JSON
	statusCode = http.StatusOK
	respBody = []byte("{bad json")
	if err := dm.Refresh(); err == nil {
		t.Errorf("expected error on corrupt JSON")
	}

	// Test NewDealsMonitor and Stop
	monitor := NewDealsMonitor()
	time.Sleep(10 * time.Millisecond)
	monitor.Stop()
}
