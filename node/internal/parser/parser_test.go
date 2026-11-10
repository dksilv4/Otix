package parser_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/dksilv4/otix/node/internal/parser"
)

type fixtureCase struct {
	Input     string               `json:"input"`
	ExtHint   string               `json:"ext_hint"`
	ParentDir string               `json:"parent_dir"`
	Expected  parser.ParsedRelease `json:"expected"`
}

type fixtureFile struct {
	Cases []fixtureCase `json:"cases"`
}

func TestParserParity_AllFixtures(t *testing.T) {
	fixturePath := filepath.Join("..", "..", "..", "fixtures", "parser_fixtures.json")
	data, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("failed reading fixtures file at %s: %v", fixturePath, err)
	}

	var ff fixtureFile
	if err := json.Unmarshal(data, &ff); err != nil {
		t.Fatalf("failed unmarshaling fixture json: %v", err)
	}

	if len(ff.Cases) < 105 {
		t.Fatalf("expected at least 105 cases, got %d", len(ff.Cases))
	}

	mismatches := 0
	for i, tc := range ff.Cases {
		res := parser.ParseReleaseName(tc.Input, tc.ExtHint, tc.ParentDir)
		if res == nil {
			t.Fatalf("[%d] ParseReleaseName returned nil for input %q", i, tc.Input)
		}

		exp := tc.Expected
		diff := false
		if res.Title != exp.Title {
			t.Errorf("[%d: %s] Title mismatch: got %q, want %q", i, tc.Input, res.Title, exp.Title)
			diff = true
		}
		if res.CleanTitle != exp.CleanTitle {
			t.Errorf("[%d: %s] CleanTitle mismatch: got %q, want %q", i, tc.Input, res.CleanTitle, exp.CleanTitle)
			diff = true
		}
		if res.Platform != exp.Platform {
			t.Errorf("[%d: %s] Platform mismatch: got %q, want %q", i, tc.Input, res.Platform, exp.Platform)
			diff = true
		}
		if res.ReleaseGroup != exp.ReleaseGroup {
			t.Errorf("[%d: %s] ReleaseGroup mismatch: got %q, want %q", i, tc.Input, res.ReleaseGroup, exp.ReleaseGroup)
			diff = true
		}
		if res.Year != exp.Year {
			t.Errorf("[%d: %s] Year mismatch: got %q, want %q", i, tc.Input, res.Year, exp.Year)
			diff = true
		}
		if res.Edition != exp.Edition {
			t.Errorf("[%d: %s] Edition mismatch: got %q, want %q", i, tc.Input, res.Edition, exp.Edition)
			diff = true
		}
		if res.Version != exp.Version {
			t.Errorf("[%d: %s] Version mismatch: got %q, want %q", i, tc.Input, res.Version, exp.Version)
			diff = true
		}
		if res.Region != exp.Region {
			t.Errorf("[%d: %s] Region mismatch: got %q, want %q", i, tc.Input, res.Region, exp.Region)
			diff = true
		}
		if res.TitleId != exp.TitleId {
			t.Errorf("[%d: %s] TitleId mismatch: got %q, want %q", i, tc.Input, res.TitleId, exp.TitleId)
			diff = true
		}
		if res.IsScene != exp.IsScene {
			t.Errorf("[%d: %s] IsScene mismatch: got %v, want %v", i, tc.Input, res.IsScene, exp.IsScene)
			diff = true
		}

		if diff {
			mismatches++
		}
	}

	if mismatches > 0 {
		t.Fatalf("%d out of %d fixture cases failed parity verification", mismatches, len(ff.Cases))
	}
}

func BenchmarkParseReleaseName(b *testing.B) {
	fixturePath := filepath.Join("..", "..", "..", "fixtures", "parser_fixtures.json")
	data, err := os.ReadFile(fixturePath)
	if err != nil {
		b.Fatalf("failed reading fixtures file: %v", err)
	}
	var ff fixtureFile
	if err := json.Unmarshal(data, &ff); err != nil {
		b.Fatalf("failed unmarshaling fixture json: %v", err)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		for _, tc := range ff.Cases {
			_ = parser.ParseReleaseName(tc.Input, tc.ExtHint, tc.ParentDir)
		}
	}
}
