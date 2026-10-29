package usenet

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/dksilv4/otix/node/internal/config"
)

func TestG4UBaseURL(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"", "https://g4u.to/api/"},
		{"https://g4u.to", "https://g4u.to/api/"},
		{"https://g4u.to/", "https://g4u.to/api/"},
		{"https://g4u.to/api", "https://g4u.to/api/"},
		{"https://g4u.to/api/", "https://g4u.to/api/"},
		{"g4u.to", "https://g4u.to/api/"},
		{"http://proxy.local:8080/api", "http://proxy.local:8080/api/"},
	}

	for _, c := range cases {
		client := NewG4UClient(config.G4UConfig{URL: c.input})
		if client.BaseURL() != c.expected {
			t.Errorf("input %q: expected %q, got %q", c.input, c.expected, client.BaseURL())
		}
	}
}

func TestG4UTestConnection(t *testing.T) {
	// 1. Missing API key
	emptyClient := NewG4UClient(config.G4UConfig{APIKey: ""})
	ok, msg := emptyClient.TestConnection()
	if ok || msg != "g4u API key is required" {
		t.Fatalf("expected required api key error, got ok=%v, msg=%q", ok, msg)
	}

	// 2. Mock server for invalid credentials vs valid credentials
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Query().Get("apikey")
		if key == "bad-key" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"error":{"code":100,"description":"Incorrect user credentials"}}`))
			return
		}
		if key == "valid-key" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>g4u</title></channel></rss>`))
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer ts.Close()

	badClient := NewG4UClient(config.G4UConfig{URL: ts.URL + "/api/", APIKey: "bad-key"})
	ok, msg = badClient.TestConnection()
	if ok || msg != "Incorrect user credentials" {
		t.Fatalf("expected 'Incorrect user credentials', got ok=%v, msg=%q", ok, msg)
	}

	validClient := NewG4UClient(config.G4UConfig{URL: ts.URL + "/api/", APIKey: "valid-key"})
	ok, msg = validClient.TestConnection()
	if !ok || msg != "Connected to g4u successfully" {
		t.Fatalf("expected success, got ok=%v, msg=%q", ok, msg)
	}
}

func TestG4USearchXML(t *testing.T) {
	mockXML := `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">
<channel>
  <title>g4u</title>
  <item>
    <title>Cyberpunk.2077.v2.13-GOG</title>
    <guid isPermaLink="false">r12345</guid>
    <link>https://g4u.to/game/cyberpunk</link>
    <pubDate>Mon, 28 Oct 2026 12:00:00 +0000</pubDate>
    <enclosure url="https://g4u.to/api/?t=get&amp;id=r12345&amp;apikey=test-key" length="58923490234" type="application/x-nzb" />
    <newznab:attr name="category" value="4050" />
    <newznab:attr name="size" value="58923490234" />
    <newznab:attr name="guid" value="r12345" />
  </item>
  <item>
    <title>Cyberpunk.2077.Update.v2.13-ANOMALY</title>
    <guid isPermaLink="false">e67890</guid>
    <link>https://g4u.to/game/cyberpunk-update</link>
    <pubDate>Tue, 29 Oct 2026 08:30:00 +0000</pubDate>
    <enclosure url="https://g4u.to/api/?t=get&amp;id=e67890&amp;apikey=test-key" length="12345678" type="application/x-nzb" />
    <newznab:attr name="category" value="4050" />
    <newznab:attr name="size" value="12345678" />
    <newznab:attr name="guid" value="e67890" />
  </item>
</channel>
</rss>`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		cat := r.URL.Query().Get("cat")
		if cat != "4050" {
			t.Errorf("expected cat 4050, got %s", cat)
		}
		if q != "cyberpunk" && q != "" {
			t.Errorf("unexpected query %s", q)
		}
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(mockXML))
	}))
	defer ts.Close()

	client := NewG4UClient(config.G4UConfig{URL: ts.URL + "/api/", APIKey: "test-key"})
	releases, err := client.Search("cyberpunk", 25)
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}

	if len(releases) != 2 {
		t.Fatalf("expected 2 releases, got %d", len(releases))
	}

	rel1 := releases[0]
	if rel1.GUID != "r12345" {
		t.Errorf("expected GUID r12345, got %s", rel1.GUID)
	}
	if rel1.Title != "Cyberpunk.2077.v2.13-GOG" {
		t.Errorf("expected title Cyberpunk.2077.v2.13-GOG, got %s", rel1.Title)
	}
	if rel1.Size != 58923490234 {
		t.Errorf("expected size 58923490234, got %d", rel1.Size)
	}
	if rel1.Protocol != "usenet" {
		t.Errorf("expected protocol usenet, got %s", rel1.Protocol)
	}
	if rel1.Indexer != "g4u.to" {
		t.Errorf("expected indexer g4u.to, got %s", rel1.Indexer)
	}
	expectedDl1 := fmt.Sprintf("%s/api/?t=get&id=r12345&apikey=test-key", ts.URL)
	if rel1.DownloadURL != expectedDl1 {
		t.Errorf("expected download url %s, got %s", expectedDl1, rel1.DownloadURL)
	}

	rel2 := releases[1]
	if rel2.GUID != "e67890" {
		t.Errorf("expected GUID e67890, got %s", rel2.GUID)
	}
	if rel2.Size != 12345678 {
		t.Errorf("expected size 12345678, got %d", rel2.Size)
	}
}

func TestG4USearchJSON(t *testing.T) {
	mockJSON := `{
  "channel": {
    "title": "g4u",
    "item": [
      {
        "title": "Baldurs.Gate.3-RUNE",
        "guid": "r99999",
        "link": "https://g4u.to/game/bg3",
        "pubDate": "Wed, 29 Oct 2026 10:00:00 +0000",
        "enclosure": {
          "@attributes": {
            "url": "https://g4u.to/api/?t=get&id=r99999&apikey=test-key",
            "length": "120000000000",
            "type": "application/x-nzb"
          }
        },
        "attr": [
          {"@attributes": {"name": "guid", "value": "r99999"}},
          {"@attributes": {"name": "size", "value": "120000000000"}}
        ]
      }
    ]
  }
}`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(mockJSON))
	}))
	defer ts.Close()

	client := NewG4UClient(config.G4UConfig{URL: ts.URL + "/api/", APIKey: "test-key"})
	releases, err := client.Search("", 50)
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}

	if len(releases) != 1 {
		t.Fatalf("expected 1 release, got %d", len(releases))
	}
	if releases[0].GUID != "r99999" {
		t.Errorf("expected guid r99999, got %s", releases[0].GUID)
	}
	if releases[0].Title != "Baldurs.Gate.3-RUNE" {
		t.Errorf("expected title Baldurs.Gate.3-RUNE, got %s", releases[0].Title)
	}
	if releases[0].Size != 120000000000 {
		t.Errorf("expected size 120000000000, got %d", releases[0].Size)
	}
}

func TestG4UGetNZB(t *testing.T) {
	nzbContent := `<?xml version="1.0" encoding="utf-8" ?><!DOCTYPE nzb PUBLIC "-//newzBin//DTD NZB 1.1//EN" "http://www.newzbin.com/DTD/nzb/nzb-1.1.dtd"><nzb></nzb>`
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("t") != "get" {
			t.Errorf("expected t=get, got %s", r.URL.Query().Get("t"))
		}
		if r.URL.Query().Get("id") != "r12345" {
			t.Errorf("expected id=r12345, got %s", r.URL.Query().Get("id"))
		}
		w.Header().Set("Content-Type", "application/x-nzb")
		_, _ = w.Write([]byte(nzbContent))
	}))
	defer ts.Close()

	client := NewG4UClient(config.G4UConfig{URL: ts.URL + "/api/", APIKey: "key"})
	bytes, err := client.GetNZB("r12345")
	if err != nil {
		t.Fatalf("GetNZB failed: %v", err)
	}
	if string(bytes) != nzbContent {
		t.Errorf("unexpected content: %s", string(bytes))
	}
}

func TestLiveG4UAPI(t *testing.T) {
	apiKey := os.Getenv("G4U_API_KEY")
	if apiKey == "" {
		t.Skip("skipping live test; set G4U_API_KEY to run")
	}

	client := NewG4UClient(config.G4UConfig{
		Enabled: true,
		URL:     "https://g4u.to/api/",
		APIKey:  apiKey,
	})

	// 1. Test Connection
	ok, msg := client.TestConnection()
	if !ok {
		t.Fatalf("TestConnection failed: %s", msg)
	}
	t.Logf("TestConnection passed: %s", msg)

	// 2. Test Empty Search (newest releases)
	newest, err := client.Search("", 5)
	if err != nil {
		t.Fatalf("Search (newest) failed: %v", err)
	}
	if len(newest) == 0 {
		t.Fatalf("expected at least 1 release from newest query, got 0")
	}
	t.Logf("Search (newest) retrieved %d items:", len(newest))
	for i, r := range newest {
		t.Logf(" [%d] %s (GUID: %s, Size: %d)", i+1, r.Title, r.GUID, r.Size)
	}

	// 3. Test Keyword Search
	keywordResults, err := client.Search("cyberpunk", 3)
	if err != nil {
		t.Fatalf("Search ('cyberpunk') failed: %v", err)
	}
	t.Logf("Search ('cyberpunk') retrieved %d items:", len(keywordResults))
	for i, r := range keywordResults {
		t.Logf(" [%d] %s (GUID: %s)", i+1, r.Title, r.GUID)
	}

	// 4. Test GetNZB
	if len(newest) > 0 {
		nzbBytes, err := client.GetNZB(newest[0].GUID)
		if err != nil {
			t.Fatalf("GetNZB failed for %s: %v", newest[0].GUID, err)
		}
		if len(nzbBytes) == 0 || !strings.Contains(string(nzbBytes), "<nzb") {
			t.Fatalf("retrieved NZB content does not contain valid XML: %s", string(nzbBytes[:min(len(nzbBytes), 200)]))
		}
		t.Logf("GetNZB passed: successfully retrieved %d bytes of valid NZB XML for %s", len(nzbBytes), newest[0].GUID)
	}
}
