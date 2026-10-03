package hardware

import (
	"encoding/json"
	"testing"
)

func TestGetMachineHardware(t *testing.T) {
	ResetCache()
	hw := GetMachineHardware(true)
	if hw == nil {
		t.Fatal("expected non-nil MachineHardware")
	}

	if hw.CPU.Threads <= 0 {
		t.Errorf("expected positive threads, got %d", hw.CPU.Threads)
	}

	data, err := json.Marshal(hw)
	if err != nil {
		t.Fatalf("failed to marshal hardware to JSON: %v", err)
	}

	var decoded MachineHardware
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal hardware JSON: %v", err)
	}

	if decoded.CPU.Threads != hw.CPU.Threads {
		t.Errorf("expected %d threads, got %d", hw.CPU.Threads, decoded.CPU.Threads)
	}

	// Verify caching
	hw2 := GetMachineHardware(false)
	if hw2 != hw {
		t.Error("expected cached instance to be returned")
	}

	ResetCache()
}
