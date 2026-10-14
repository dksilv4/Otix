package claim

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
)

type ClaimStatus struct {
	Claimed    bool   `json:"claimed"`
	ClaimCode  string `json:"claim_code"`
	ExpiresIn  int    `json:"expires_in"` // Seconds remaining
	ServerName string `json:"server_name"`
	Username   string `json:"username,omitempty"`
}

type ClaimManager struct {
	mu        sync.RWMutex
	cfg       *config.AppConfig
	claimCode string
	expiresAt time.Time
	claimed   bool
	claimedBy string
}

func NewClaimManager(cfg *config.AppConfig) *ClaimManager {
	// A server is considered claimed if server.auth_token is non-empty
	// and not a generic default like "otix_secret_token", or if claimed boolean is true, or claimed_by is set
	isClaimed := cfg.Server.Claimed || (cfg.Server.AuthToken != "" && cfg.Server.AuthToken != "otix_secret_token") || (cfg.Server.ClaimedBy != "")
	if isClaimed {
		cfg.Server.Claimed = true
	}
	cm := &ClaimManager{
		cfg:       cfg,
		claimed:   isClaimed,
		claimedBy: cfg.Server.ClaimedBy,
	}
	if !isClaimed {
		cm.generateCode()
	}
	return cm
}

func (cm *ClaimManager) generateCode() {
	// Generate code like OTX-4892
	const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	code := make([]byte, 4)
	for i := range code {
		num, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		code[i] = chars[num.Int64()]
	}
	cm.claimCode = fmt.Sprintf("OTX-%s", string(code))
	cm.expiresAt = time.Now().Add(15 * time.Minute)
}

func (cm *ClaimManager) IsClaimed() bool {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.claimed
}

func (cm *ClaimManager) Status() ClaimStatus {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if cm.claimed {
		return ClaimStatus{
			Claimed:    true,
			ClaimCode:  "",
			ExpiresIn:  0,
			ServerName: cm.cfg.Server.Name,
			Username:   cm.claimedBy,
		}
	}

	// If code expired, generate a new one
	if time.Now().After(cm.expiresAt) {
		cm.generateCode()
	}

	remaining := int(time.Until(cm.expiresAt).Seconds())
	if remaining < 0 {
		remaining = 0
	}

	return ClaimStatus{
		Claimed:    false,
		ClaimCode:  cm.claimCode,
		ExpiresIn:  remaining,
		ServerName: cm.cfg.Server.Name,
	}
}

func (cm *ClaimManager) CurrentCode() string {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	if cm.claimed {
		return ""
	}
	if time.Now().After(cm.expiresAt) {
		cm.generateCode()
	}
	return cm.claimCode
}

func (cm *ClaimManager) Confirm(code string, authToken string, serverName string, username string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	cleanedCode := strings.ToUpper(strings.TrimSpace(code))
	if cleanedCode == "" {
		return fmt.Errorf("claim code is required")
	}

	if cm.claimed {
		return fmt.Errorf("server is already claimed")
	}

	if time.Now().After(cm.expiresAt) {
		cm.generateCode()
		return fmt.Errorf("claim code has expired, please use the new code: %s", cm.claimCode)
	}

	if cleanedCode != cm.claimCode {
		return fmt.Errorf("invalid claim code")
	}

	if strings.TrimSpace(authToken) == "" {
		return fmt.Errorf("valid auth token is required")
	}

	// Backup current config state in case save fails
	prevToken := cm.cfg.Server.AuthToken
	prevName := cm.cfg.Server.Name
	prevClaimed := cm.cfg.Server.Claimed
	prevClaimedBy := cm.cfg.Server.ClaimedBy

	// Update config
	cm.cfg.Server.AuthToken = strings.TrimSpace(authToken)
	if strings.TrimSpace(serverName) != "" {
		cm.cfg.Server.Name = strings.TrimSpace(serverName)
	}
	cm.cfg.Server.Claimed = true
	cm.cfg.Server.ClaimedBy = strings.TrimSpace(username)

	// Persist
	if err := cm.cfg.Save(""); err != nil {
		// Roll back config to avoid leaving server in corrupted/unclaimable state
		cm.cfg.Server.AuthToken = prevToken
		cm.cfg.Server.Name = prevName
		cm.cfg.Server.Claimed = prevClaimed
		cm.cfg.Server.ClaimedBy = prevClaimedBy
		return fmt.Errorf("failed to save claimed configuration: %w", err)
	}

	cm.claimed = true
	cm.claimedBy = strings.TrimSpace(username)
	return nil
}

func (cm *ClaimManager) ConfirmDirect(authToken string, serverName string, username string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if strings.TrimSpace(authToken) == "" {
		return fmt.Errorf("valid auth token is required")
	}

	prevToken := cm.cfg.Server.AuthToken
	prevName := cm.cfg.Server.Name
	prevClaimed := cm.cfg.Server.Claimed
	prevClaimedBy := cm.cfg.Server.ClaimedBy

	cm.cfg.Server.AuthToken = strings.TrimSpace(authToken)
	if strings.TrimSpace(serverName) != "" {
		cm.cfg.Server.Name = strings.TrimSpace(serverName)
	}
	cm.cfg.Server.Claimed = true
	cm.cfg.Server.ClaimedBy = strings.TrimSpace(username)

	if err := cm.cfg.Save(""); err != nil {
		cm.cfg.Server.AuthToken = prevToken
		cm.cfg.Server.Name = prevName
		cm.cfg.Server.Claimed = prevClaimed
		cm.cfg.Server.ClaimedBy = prevClaimedBy
		return fmt.Errorf("failed to save claimed configuration: %w", err)
	}

	cm.claimed = true
	cm.claimedBy = strings.TrimSpace(username)
	return nil
}

func (cm *ClaimManager) Unclaim() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	cm.cfg.Server.AuthToken = ""
	cm.cfg.Server.Claimed = false
	cm.cfg.Server.ClaimedBy = ""
	cm.claimed = false
	cm.claimedBy = ""
	cm.generateCode()

	if err := cm.cfg.Save(""); err != nil {
		return fmt.Errorf("failed to save unclaimed configuration: %w", err)
	}

	return nil
}
