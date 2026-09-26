package explorer

import (
	"os"
	"testing"
)

func TestGetDiskUsage(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Failed to get working directory: %v", err)
	}

	free, total, err := GetDiskUsage(wd)
	if err != nil {
		t.Fatalf("GetDiskUsage failed on %s: %v", wd, err)
	}

	if total == 0 {
		t.Errorf("Expected total disk bytes > 0, got %d", total)
	}
	if free == 0 {
		t.Errorf("Expected free disk bytes > 0, got %d", free)
	}
	if free > total {
		t.Errorf("Free bytes (%d) cannot exceed total bytes (%d)", free, total)
	}
}
