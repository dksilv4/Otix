package organize

import (
	"strings"

	"github.com/dksilv4/otix/node/internal/parser"
)

// ParsedRelease is an alias to the canonical ParsedRelease type in parser package.
type ParsedRelease = parser.ParsedRelease

// ParseReleaseName delegates to the central parser package with organize conventions.
func ParseReleaseName(rawName string) ParsedRelease {
	res := parser.ParseReleaseName(rawName, "", "")
	if res == nil {
		return ParsedRelease{RawName: rawName, Title: rawName}
	}
	out := *res
	if strings.EqualFold(out.ReleaseGroup, "elamigos") && strings.Contains(strings.ToUpper(rawName), "ELAMIGOS") {
		out.ReleaseGroup = "ELAMIGOS"
	}
	clean := CleanGameTitle(rawName)
	if clean != "" {
		out.Title = clean
		out.CleanTitle = clean
	}
	return out
}

// CleanGameTitle delegates to the central parser package.
func CleanGameTitle(filename string) string {
	return parser.CleanGameTitle(filename)
}
