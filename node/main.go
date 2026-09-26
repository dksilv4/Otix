package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/heartbeat"
	"github.com/dksilv4/otix/node/internal/server"
)

var (
	Version   = "0.0.1"
	BuildTime = "2026-09-26"
)

func openBrowser(targetURL string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", targetURL)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", targetURL)
	case "linux":
		cmd = exec.Command("xdg-open", targetURL)
	default:
		return
	}
	_ = cmd.Start()
}

func main() {
	configPathFlag := flag.String("config", "", "Path to config.yaml")
	portFlag := flag.Int("port", 0, "Server port (overrides config)")
	versionFlag := flag.Bool("version", false, "Print version and exit")
	openBrowserFlag := flag.Bool("open", true, "Open setup WebUI in default browser on launch")
	headlessFlag := flag.Bool("headless", false, "Run in headless daemon mode (do not open browser)")
	flag.Parse()

	if *versionFlag {
		fmt.Printf("Otix Node v%s (%s)\n", Version, BuildTime)
		os.Exit(0)
	}

	cfg := config.LoadConfig(*configPathFlag)

	// Check environment variable for port
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			cfg.Server.Port = p
		}
	}
	if *portFlag > 0 {
		cfg.Server.Port = *portFlag
	}
	if cfg.Server.Port <= 0 {
		cfg.Server.Port = 8090
	}

	claimMgr := claim.NewClaimManager(cfg)
	hbRunner := heartbeat.NewHeartbeatRunner(cfg, claimMgr)
	hbRunner.Start()
	defer hbRunner.Stop()

	srv := server.NewServer(cfg, claimMgr)

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	httpServer := &http.Server{
		Addr:         addr,
		Handler:      srv.Router(),
		ReadTimeout:  30 * time.Minute, // Long timeout for large ISO range streaming
		WriteTimeout: 30 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown handling
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		fmt.Printf("====================================================\n")
		fmt.Printf("  Otix Node v%s (Go Daemon)\n", Version)
		fmt.Printf("  Server Name: %s\n", cfg.Server.Name)
		fmt.Printf("  Listening:   http://%s\n", addr)
		if claimMgr.IsClaimed() {
			fmt.Printf("  Status:      🟢 Claimed & Linked\n")
		} else {
			fmt.Printf("  Status:      🟡 Unclaimed\n")
			fmt.Printf("  Claim PIN:   %s\n", claimMgr.CurrentCode())
			fmt.Printf("  Setup WebUI: http://%s/\n", addr)
		}
		fmt.Printf("====================================================\n")

		if *openBrowserFlag && !*headlessFlag && os.Getenv("OTIX_HEADLESS") != "1" {
			go func() {
				time.Sleep(250 * time.Millisecond)
				openBrowser(fmt.Sprintf("http://127.0.0.1:%d/", cfg.Server.Port))
			}()
		}

		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "Server failed: %v\n", err)
			os.Exit(1)
		}
	}()

	<-stopChan
	fmt.Println("\nShutting down Otix Node gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "Server shutdown error: %v\n", err)
	}

	fmt.Println("Otix Node stopped.")
}
