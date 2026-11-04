package parser

// ParsedRelease encapsulates normalized metadata extracted from release strings and paths.
type ParsedRelease struct {
	Title        string `json:"title"`
	CleanTitle   string `json:"clean_title"`
	Year         string `json:"year,omitempty"`
	Edition      string `json:"edition,omitempty"`
	Platform     string `json:"platform,omitempty"`
	ReleaseGroup string `json:"release_group,omitempty"`
	Version      string `json:"version,omitempty"`
	Region       string `json:"region,omitempty"`
	TitleId      string `json:"title_id,omitempty"`
	RawName      string `json:"raw_name,omitempty"`
	IsScene      bool   `json:"is_scene"`
}

// ParseOptions provides contextual hints for parsing release strings.
type ParseOptions struct {
	ExtHint   string
	ParentDir string
}
