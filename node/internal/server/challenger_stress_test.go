package server_test

import (
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/heartbeat"
	"github.com/dksilv4/otix/node/internal/server"
)

func getInterestingGoroutines() map[string]string {
	buf := make([]byte, 1<<20)
	n := runtime.Stack(buf, true)
	stacks := string(buf[:n])

	result := make(map[string]string)
	for _, stack := range strings.Split(stacks, "\n\n") {
		trimmed := strings.TrimSpace(stack)
		if trimmed == "" {
			continue
		}
		if strings.Contains(trimmed, "testing.(*T).Run") ||
			strings.Contains(trimmed, "testing.tRunner") ||
			strings.Contains(trimmed, "getInterestingGoroutines") {
			continue
		}
		if strings.Contains(trimmed, "otix/node") {
			// Extract header line as key (e.g. "goroutine 123 [select]:")
			lines := strings.Split(trimmed, "\n")
			if len(lines) > 0 {
				result[lines[0]] = trimmed
			}
		}
	}
	return result
}

func TestServerStopIdempotencyConcurrentStress(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.SetConfigPath(filepath.Join(tmpDir, "config.yaml"))
	cfg.Server.Claimed = false

	cm := claim.NewClaimManager(cfg)
	srv := server.NewServer(cfg, cm)
	hb := heartbeat.NewHeartbeatRunner(cfg, cm)
	srv.SetHeartbeatRunner(hb)

	const concurrency = 100
	var wg sync.WaitGroup
	wg.Add(concurrency)

	for i := 0; i < concurrency; i++ {
		go func(id int) {
			defer wg.Done()
			if id%2 == 0 {
				srv.Stop()
			} else {
				_ = srv.Close()
			}
		}(i)
	}

	wg.Wait()

	// Subsequent sequential stops should also be completely safe
	srv.Stop()
	_ = srv.Close()
	srv.Stop()
}

func TestServerStopGoroutineLeaks(t *testing.T) {
	baseline := getInterestingGoroutines()

	tmpDir := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.SetConfigPath(filepath.Join(tmpDir, "config.yaml"))
	cfg.Server.Claimed = false

	cm := claim.NewClaimManager(cfg)
	srv := server.NewServer(cfg, cm)
	hb := heartbeat.NewHeartbeatRunner(cfg, cm)
	srv.SetHeartbeatRunner(hb)

	// Allow server subsystems to spin up
	time.Sleep(300 * time.Millisecond)

	// Stop server
	srv.Stop()

	// Wait up to 3 seconds for all subsystems to cleanly terminate
	var leaked []string
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		current := getInterestingGoroutines()
		leaked = nil
		for k, v := range current {
			if _, exists := baseline[k]; !exists {
				leaked = append(leaked, v)
			}
		}
		if len(leaked) == 0 {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	if len(leaked) > 0 {
		for i, stack := range leaked {
			t.Logf("Leaked goroutine #%d:\n%s\n", i+1, stack)
		}
		t.Fatalf("Found %d leaked goroutines after Server.Stop()", len(leaked))
	}
}

func TestServer_AdversarialGoroutineTeardownZeroLeak(t *testing.T) {
	TestServerStopGoroutineLeaks(t)
}

func TestServerStopRapidCycle(t *testing.T) {
	for i := 0; i < 5; i++ {
		t.Run(fmt.Sprintf("Cycle_%d", i), func(t *testing.T) {
			tmpDir := t.TempDir()
			cfg := config.DefaultConfig()
			cfg.SetConfigPath(filepath.Join(tmpDir, "config.yaml"))
			cfg.Server.Claimed = false

			cm := claim.NewClaimManager(cfg)
			srv := server.NewServer(cfg, cm)
			srv.Stop()
		})
	}
}
