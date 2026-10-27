package claim_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
)

func TestTokenValidationAdversarial(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.SetConfigPath(filepath.Join(t.TempDir(), "config.yaml"))
	cfg.Server.AuthToken = ""
	cfg.Server.Claimed = false

	cm := claim.NewClaimManager(cfg)

	// 1. Unclaimed State Rejections
	unclaimedTokens := []string{
		"",
		"   ",
		"\t\n\r",
		"random_token",
		"Bearer abc",
		"null",
		"undefined",
		strings.Repeat("A", 10000),
	}
	for _, tok := range unclaimedTokens {
		if cm.ValidateToken(tok) {
			t.Errorf("ValidateToken(%q) returned true on unclaimed ClaimManager", tok)
		}
	}

	// 2. Claim with specific token
	secretToken := "SuperSecure_AuthToken-9876543210"
	if err := cm.ConfirmDirect(secretToken, "SecureNode", "secops"); err != nil {
		t.Fatalf("ConfirmDirect failed: %v", err)
	}

	// 3. Exact Match & Whitespace Trimming
	if !cm.ValidateToken(secretToken) {
		t.Fatalf("ValidateToken failed on exact match: %s", secretToken)
	}
	if !cm.ValidateToken("   " + secretToken + "   \t\n") {
		t.Fatalf("ValidateToken failed on whitespace-padded match")
	}

	// 4. Mismatch & Injection Attack Vectors
	mismatchCases := []struct {
		name  string
		token string
	}{
		{"Empty string", ""},
		{"Single space", " "},
		{"Multiple spaces", "       "},
		{"Whitespace tabs/newlines", "\t\r\n"},
		{"Prefix substring", secretToken[:10]},
		{"Suffix substring", secretToken[10:]},
		{"Extra suffix", secretToken + "_extra"},
		{"Extra prefix", "extra_" + secretToken},
		{"Case mismatch uppercase", strings.ToUpper(secretToken)},
		{"Case mismatch lowercase", strings.ToLower(secretToken)},
		{"Embedded null byte", secretToken + "\x00extra"},
		{"SQL injection probe", secretToken + "' OR '1'='1"},
		{"Bearer prefix present", "Bearer " + secretToken},
		{"Internal non-breaking space", secretToken[:5] + "\u00A0" + secretToken[5:]},
	}

	for _, tc := range mismatchCases {
		t.Run("Mismatch_"+tc.name, func(t *testing.T) {
			if cm.ValidateToken(tc.token) {
				t.Fatalf("[%s] ValidateToken(%q) should have returned false, but returned true", tc.name, tc.token)
			}
		})
	}

	// Verify that strings.TrimSpace also trims outer unicode non-breaking space
	if !cm.ValidateToken("\u00A0" + secretToken + "\u00A0") {
		t.Fatal("expected outer non-breaking space to be trimmed by strings.TrimSpace")
	}

	// 5. Unclaim Rollback: previously valid token must be invalidated
	if err := cm.Unclaim(); err != nil {
		t.Fatalf("Unclaim failed: %v", err)
	}

	if cm.IsClaimed() {
		t.Fatal("expected IsClaimed() to be false after Unclaim()")
	}
	if cm.ValidateToken(secretToken) {
		t.Fatal("expected ValidateToken to return false after Unclaim()")
	}
}

func TestConfirmDirectRollbackOnPreClaimedServer(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")

	cfg := config.DefaultConfig()
	cfg.SetConfigPath(configPath)
	cfg.Server.Name = "Station Alpha"
	cfg.Server.AuthToken = ""
	cfg.Server.Claimed = false

	cm := claim.NewClaimManager(cfg)

	// Successfully claim initially with Token A
	tokenA := "initial_token_A"
	if err := cm.ConfirmDirect(tokenA, "Station Alpha", "userA"); err != nil {
		t.Fatalf("initial claim failed: %v", err)
	}

	if !cm.ValidateToken(tokenA) {
		t.Fatal("Token A should be valid")
	}

	// Corrupt file path or make directory unwritable so subsequent save fails
	blockingFile := filepath.Join(tmpDir, "blocked_dir")
	if err := os.WriteFile(blockingFile, []byte("file"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg.SetConfigPath(filepath.Join(blockingFile, "config.yaml"))

	// Attempt second ConfirmDirect with Token B (which fails saving)
	tokenB := "second_token_B"
	err := cm.ConfirmDirect(tokenB, "Station Beta", "userB")
	if err == nil {
		t.Fatal("expected ConfirmDirect to fail due to unwritable path")
	}

	// Assert complete rollback:
	// 1. Token A must STILL be valid!
	// 2. Token B must NOT be valid!
	// 3. Claimed must still be true
	// 4. Server Name must still be Station Alpha
	// 5. ClaimedBy must still be userA
	if !cm.ValidateToken(tokenA) {
		t.Fatalf("expected Token A (%s) to remain valid after failed re-claim rollback", tokenA)
	}
	if cm.ValidateToken(tokenB) {
		t.Fatalf("expected Token B (%s) to NOT be valid after failed re-claim", tokenB)
	}
	if cfg.Server.Name != "Station Alpha" {
		t.Fatalf("expected Server Name to rollback to 'Station Alpha', got %s", cfg.Server.Name)
	}
	if cfg.Server.ClaimedBy != "userA" {
		t.Fatalf("expected ClaimedBy to rollback to 'userA', got %s", cfg.Server.ClaimedBy)
	}
	if !cm.IsClaimed() {
		t.Fatal("expected server to remain claimed with Token A after failed re-claim")
	}
}

func TestConfirmDirectEmptyAndWhitespaceTokens(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.SetConfigPath(filepath.Join(t.TempDir(), "config.yaml"))
	cm := claim.NewClaimManager(cfg)

	invalidTokens := []string{
		"",
		" ",
		"     ",
		"\t",
		"\n",
		"\r\n",
		" \t \n ",
	}

	for _, badToken := range invalidTokens {
		err := cm.ConfirmDirect(badToken, "Node", "user")
		if err == nil {
			t.Fatalf("expected error for ConfirmDirect with token %q, got nil", badToken)
		}
		if !strings.Contains(err.Error(), "valid auth token is required") {
			t.Fatalf("unexpected error message: %v", err)
		}
	}
}
