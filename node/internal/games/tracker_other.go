//go:build !windows

package games

import (
	"bytes"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// listProcessesOS enumerates active processes on Unix-like operating systems.
func listProcessesOS() ([]ProcessInfo, error) {
	cmd := exec.Command("ps", "-eo", "pid,comm")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil, err
	}

	lines := strings.Split(out.String(), "\n")
	result := make([]ProcessInfo, 0, len(lines))

	for _, line := range lines {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) < 2 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil || pid <= 0 {
			continue
		}
		name := filepath.Base(fields[1])
		result = append(result, ProcessInfo{
			PID:  pid,
			Name: name,
			Path: fields[1],
		})
	}

	return result, nil
}
