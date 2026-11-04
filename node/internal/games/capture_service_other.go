//go:build !windows

package games

import (
	"fmt"
	"io"
)

// RunCaptureServiceMode is a no-op on non-Windows platforms.
func RunCaptureServiceMode(debug bool) error {
	return fmt.Errorf("capture service is only supported on Windows")
}

// IsCaptureServiceAvailable always returns false on non-Windows platforms.
func IsCaptureServiceAvailable() bool {
	return false
}

// StartServiceStream is unsupported on non-Windows platforms.
func StartServiceStream(pid int, processName string) (io.ReadCloser, error) {
	return nil, fmt.Errorf("capture service is only supported on Windows")
}

// StopServiceCapture is a no-op on non-Windows platforms.
func StopServiceCapture() {
}
