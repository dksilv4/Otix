package organize

import (
	"encoding/json"
	"os"
	"strings"
)

func parsePS5ParamJSON(paramJsonPath string) (string, string) {
	data, err := os.ReadFile(paramJsonPath)
	if err != nil {
		return "", ""
	}
	var raw struct {
		TitleID             string                 `json:"titleId"`
		LocalizedParameters map[string]interface{} `json:"localizedParameters"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return "", ""
	}
	titleId := strings.TrimSpace(raw.TitleID)
	titleName := ""

	if raw.LocalizedParameters != nil {
		defaultLang := "en-GB"
		if dl, ok := raw.LocalizedParameters["defaultLanguage"].(string); ok && dl != "" {
			defaultLang = dl
		}
		candidates := []string{defaultLang, "en-GB", "en-US", "en", "default"}
		for _, lang := range candidates {
			if entry, ok := raw.LocalizedParameters[lang].(map[string]interface{}); ok {
				if tn, ok := entry["titleName"].(string); ok && strings.TrimSpace(tn) != "" {
					titleName = strings.TrimSpace(tn)
					break
				}
			}
		}
		if titleName == "" {
			for _, v := range raw.LocalizedParameters {
				if entry, ok := v.(map[string]interface{}); ok {
					if tn, ok := entry["titleName"].(string); ok && strings.TrimSpace(tn) != "" {
						titleName = strings.TrimSpace(tn)
						break
					}
				}
			}
		}
	}
	return titleId, titleName
}
