package usenet

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
)

type G4UClient struct {
	cfg    config.G4UConfig
	client *http.Client
}

func NewG4UClient(cfg config.G4UConfig) *G4UClient {
	return &G4UClient{
		cfg:    cfg,
		client: newHTTPClient(),
	}
}

// BaseURL returns the normalized g4u API endpoint ending with a slash, e.g. "https://g4u.to/api/".
func (c *G4UClient) BaseURL() string {
	raw := strings.TrimSpace(c.cfg.URL)
	if raw == "" {
		return "https://g4u.to/api/"
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	raw = strings.TrimRight(raw, "/")
	if !strings.HasSuffix(raw, "/api") {
		raw += "/api"
	}
	return raw + "/"
}

func (c *G4UClient) TestConnection() (bool, string) {
	apiKey := strings.TrimSpace(c.cfg.APIKey)
	if apiKey == "" {
		return false, "g4u API key is required"
	}

	reqURL := fmt.Sprintf("%s?t=search&limit=1&apikey=%s&o=json", c.BaseURL(), url.QueryEscape(apiKey))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return false, err.Error()
	}
	req.Header.Set("User-Agent", "Otix/1.0 (Node)")

	resp, err := c.client.Do(req)
	if err != nil {
		return false, fmt.Sprintf("Failed to connect: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, fmt.Sprintf("Failed to read response: %v", err)
	}

	// 1. JSON Error: {"error":{"code":100,"description":"Incorrect user credentials"}}
	var errResp struct {
		Error struct {
			Code        int    `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &errResp) == nil && errResp.Error.Description != "" {
		return false, errResp.Error.Description
	}

	// 2. XML Error: <error code="100" description="..."/>
	if strings.Contains(string(body), "<error") {
		var xmlErr struct {
			Code        string `xml:"code,attr"`
			Description string `xml:"description,attr"`
		}
		if xml.Unmarshal(body, &xmlErr) == nil && xmlErr.Description != "" {
			return false, xmlErr.Description
		}
	}

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Sprintf("HTTP %d", resp.StatusCode)
	}

	return true, "Connected to g4u successfully"
}

func (c *G4UClient) Search(query string, limit int) ([]ProwlarrRelease, error) {
	apiKey := strings.TrimSpace(c.cfg.APIKey)
	if apiKey == "" {
		return nil, fmt.Errorf("g4u API key is required")
	}

	if limit <= 0 {
		limit = 50
	} else if limit > 100 {
		limit = 100
	}

	params := url.Values{}
	params.Set("t", "search")
	params.Set("apikey", apiKey)
	params.Set("cat", "4050")
	params.Set("limit", strconv.Itoa(limit))
	params.Set("o", "json")
	if strings.TrimSpace(query) != "" {
		params.Set("q", strings.TrimSpace(query))
	}

	reqURL := fmt.Sprintf("%s?%s", c.BaseURL(), params.Encode())
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Otix/1.0 (Node)")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Check error payloads
	var errResp struct {
		Error struct {
			Code        int    `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &errResp) == nil && errResp.Error.Description != "" {
		return nil, fmt.Errorf("g4u error: %s", errResp.Error.Description)
	}

	if strings.Contains(string(body), "<error") {
		var xmlErr struct {
			Code        string `xml:"code,attr"`
			Description string `xml:"description,attr"`
		}
		if xml.Unmarshal(body, &xmlErr) == nil && xmlErr.Description != "" {
			return nil, fmt.Errorf("g4u error: %s", xmlErr.Description)
		}
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("g4u search returned HTTP %d", resp.StatusCode)
	}

	return ParseG4UResponse(body, c.BaseURL(), apiKey)
}

func (c *G4UClient) GetNZB(id string) ([]byte, error) {
	apiKey := strings.TrimSpace(c.cfg.APIKey)
	if apiKey == "" {
		return nil, fmt.Errorf("g4u API key is required")
	}
	reqURL := fmt.Sprintf("%s?t=get&id=%s&apikey=%s", c.BaseURL(), url.QueryEscape(id), url.QueryEscape(apiKey))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Otix/1.0 (Node)")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("g4u get NZB returned HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── XML & JSON Response Parsing ──────────────────────────────────────────

type g4uXMLRSS struct {
	XMLName xml.Name `xml:"rss"`
	Channel struct {
		Title string       `xml:"title"`
		Items []g4uXMLItem `xml:"item"`
	} `xml:"channel"`
}

type g4uXMLItem struct {
	Title     string `xml:"title"`
	GUID      string `xml:"guid"`
	Link      string `xml:"link"`
	PubDate   string `xml:"pubDate"`
	Enclosure struct {
		URL    string `xml:"url,attr"`
		Length int64  `xml:"length,attr"`
		Type   string `xml:"type,attr"`
	} `xml:"enclosure"`
	Attrs []struct {
		Name  string `xml:"name,attr"`
		Value string `xml:"value,attr"`
	} `xml:"attr"`
}

var pubDateLayouts = []string{
	time.RFC1123Z,
	time.RFC1123,
	time.RFC822Z,
	time.RFC822,
	time.RFC3339,
	"2006-01-02 15:04:05 -0700",
	"2006-01-02 15:04:05",
	"2006-01-02",
}

func parseDate(raw string) (string, *int) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", nil
	}
	for _, layout := range pubDateLayouts {
		if t, err := time.Parse(layout, s); err == nil {
			formatted := t.UTC().Format(time.RFC3339)
			days := int(time.Since(t).Hours() / 24)
			if days < 0 {
				days = 0
			}
			return formatted, &days
		}
	}
	return s, nil
}

// ParseG4UResponse parses Newznab JSON or XML returned by g4u.to.
func ParseG4UResponse(body []byte, baseURL, apiKey string) ([]ProwlarrRelease, error) {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return []ProwlarrRelease{}, nil
	}

	// 1. Try JSON parsing
	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		releases, err := parseG4UJSON(body, baseURL, apiKey)
		if err == nil && len(releases) > 0 {
			return releases, nil
		}
	}

	// 2. Try XML parsing
	return parseG4UXML(body, baseURL, apiKey)
}

func parseG4UJSON(body []byte, baseURL, apiKey string) ([]ProwlarrRelease, error) {
	// Standard Newznab JSON shape: {"channel": {"item": [...]}}
	var wrapper struct {
		Channel struct {
			Item json.RawMessage `json:"item"`
		} `json:"channel"`
		Items json.RawMessage `json:"items"`
	}

	if err := json.Unmarshal(body, &wrapper); err != nil {
		return nil, err
	}

	itemBytes := wrapper.Channel.Item
	if len(itemBytes) == 0 {
		itemBytes = wrapper.Items
	}
	if len(itemBytes) == 0 {
		// Could the body itself be an array?
		if strings.HasPrefix(strings.TrimSpace(string(body)), "[") {
			itemBytes = body
		}
	}

	if len(itemBytes) == 0 {
		return nil, fmt.Errorf("no items found in JSON")
	}

	var rawItems []map[string]interface{}
	// Check if item is array or single object
	if strings.HasPrefix(strings.TrimSpace(string(itemBytes)), "[") {
		if err := json.Unmarshal(itemBytes, &rawItems); err != nil {
			return nil, err
		}
	} else if strings.HasPrefix(strings.TrimSpace(string(itemBytes)), "{") {
		var single map[string]interface{}
		if err := json.Unmarshal(itemBytes, &single); err == nil {
			rawItems = []map[string]interface{}{single}
		}
	}

	var releases []ProwlarrRelease
	for _, raw := range rawItems {
		title, _ := raw["title"].(string)
		title = strings.TrimSpace(title)
		if title == "" {
			continue
		}

		guid := extractJSONString(raw, "guid")
		link, _ := raw["link"].(string)
		pubDateStr := extractJSONString(raw, "pubDate")
		if pubDateStr == "" {
			pubDateStr = extractJSONString(raw, "date")
		}

		var size int64
		// Check attributes array / object: [{"@attributes": {"name": "size", "value": "123"}}]
		attrs := extractAttributes(raw)
		if g, ok := attrs["guid"]; ok && g != "" {
			guid = g
		}
		if s, ok := attrs["size"]; ok && s != "" {
			if parsedSize, err := strconv.ParseInt(s, 10, 64); err == nil {
				size = parsedSize
			}
		}

		// Check enclosure
		if size == 0 {
			if enc, ok := raw["enclosure"].(map[string]interface{}); ok {
				if lenVal, exists := enc["@attributes"]; exists {
					if encAttrs, ok := lenVal.(map[string]interface{}); ok {
						if l, ok := encAttrs["length"]; ok {
							size = toInt64(l)
						}
					}
				} else if l, ok := enc["length"]; ok {
					size = toInt64(l)
				}
			}
		}

		downloadURL := ""
		if guid != "" {
			downloadURL = fmt.Sprintf("%s?t=get&id=%s&apikey=%s", baseURL, guid, apiKey)
		} else if enc, ok := raw["enclosure"].(map[string]interface{}); ok {
			if urlVal, ok := enc["url"].(string); ok {
				downloadURL = urlVal
			}
		}
		if downloadURL == "" {
			downloadURL = link
		}

		var publishDatePtr *string
		var ageDaysPtr *int
		if pubDateStr != "" {
			pDate, days := parseDate(pubDateStr)
			if pDate != "" {
				publishDatePtr = &pDate
			}
			ageDaysPtr = days
		}

		var infoURLPtr *string
		if link != "" {
			infoURLPtr = &link
		}

		releases = append(releases, ProwlarrRelease{
			GUID:        guid,
			Title:       title,
			Size:        size,
			DownloadURL: downloadURL,
			InfoURL:     infoURLPtr,
			PublishDate: publishDatePtr,
			Indexer:     "g4u.to",
			Protocol:    "usenet",
			AgeDays:     ageDaysPtr,
		})
	}

	return releases, nil
}

func parseG4UXML(body []byte, baseURL, apiKey string) ([]ProwlarrRelease, error) {
	var rss g4uXMLRSS
	if err := xml.Unmarshal(body, &rss); err != nil {
		return nil, fmt.Errorf("failed to parse g4u XML: %w", err)
	}

	var releases []ProwlarrRelease
	for _, item := range rss.Channel.Items {
		title := strings.TrimSpace(item.Title)
		if title == "" {
			continue
		}

		guid := strings.TrimSpace(item.GUID)
		var size int64 = item.Enclosure.Length

		for _, a := range item.Attrs {
			switch strings.ToLower(a.Name) {
			case "guid":
				if a.Value != "" {
					guid = strings.TrimSpace(a.Value)
				}
			case "size":
				if s, err := strconv.ParseInt(a.Value, 10, 64); err == nil && s > 0 {
					size = s
				}
			}
		}

		downloadURL := ""
		if guid != "" {
			downloadURL = fmt.Sprintf("%s?t=get&id=%s&apikey=%s", baseURL, guid, apiKey)
		} else if item.Enclosure.URL != "" {
			downloadURL = item.Enclosure.URL
		} else {
			downloadURL = item.Link
		}

		var publishDatePtr *string
		var ageDaysPtr *int
		if item.PubDate != "" {
			pDate, days := parseDate(item.PubDate)
			if pDate != "" {
				publishDatePtr = &pDate
			}
			ageDaysPtr = days
		}

		var infoURLPtr *string
		if item.Link != "" {
			infoURLPtr = &item.Link
		}

		releases = append(releases, ProwlarrRelease{
			GUID:        guid,
			Title:       title,
			Size:        size,
			DownloadURL: downloadURL,
			InfoURL:     infoURLPtr,
			PublishDate: publishDatePtr,
			Indexer:     "g4u.to",
			Protocol:    "usenet",
			AgeDays:     ageDaysPtr,
		})
	}

	return releases, nil
}

func extractJSONString(m map[string]interface{}, key string) string {
	val, ok := m[key]
	if !ok || val == nil {
		return ""
	}
	if s, ok := val.(string); ok {
		return strings.TrimSpace(s)
	}
	if obj, ok := val.(map[string]interface{}); ok {
		if text, ok := obj["#text"].(string); ok {
			return strings.TrimSpace(text)
		}
		if text, ok := obj["text"].(string); ok {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func extractAttributes(raw map[string]interface{}) map[string]string {
	result := make(map[string]string)
	candidates := []string{"attr", "newznab:attr", "attributes"}
	for _, cand := range candidates {
		val, ok := raw[cand]
		if !ok || val == nil {
			continue
		}
		if list, ok := val.([]interface{}); ok {
			for _, item := range list {
				parseAttrEntry(item, result)
			}
		} else {
			parseAttrEntry(val, result)
		}
	}
	return result
}

func parseAttrEntry(item interface{}, out map[string]string) {
	m, ok := item.(map[string]interface{})
	if !ok {
		return
	}
	if attrs, ok := m["@attributes"].(map[string]interface{}); ok {
		m = attrs
	}
	name, _ := m["name"].(string)
	value, _ := m["value"].(string)
	if name == "" {
		if n, ok := m["_name"].(string); ok {
			name = n
		}
	}
	if value == "" {
		if v, ok := m["_value"].(string); ok {
			value = v
		}
	}
	if name != "" && value != "" {
		out[strings.ToLower(name)] = value
	}
}

func toInt64(v interface{}) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case float64:
		return int64(n)
	case string:
		p, _ := strconv.ParseInt(n, 10, 64)
		return p
	default:
		return 0
	}
}
