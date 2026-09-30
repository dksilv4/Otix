package main

import (
	"testing"
)

func TestOpenBrowser(t *testing.T) {
	// Should not panic on any platform
	openBrowser("")
}
