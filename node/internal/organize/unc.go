package organize

import (
	"strings"
	"sync"
)

var (
	machineMappingsMu sync.RWMutex
	machineToIPMap    = make(map[string]string)
	ipToMachineMap    = make(map[string]string)
)

// RegisterMachineMapping maps machine hostnames to IP addresses dynamically (zero hardcoded IPs).
func RegisterMachineMapping(name, ip string) {
	if name == "" || ip == "" {
		return
	}
	machineMappingsMu.Lock()
	defer machineMappingsMu.Unlock()
	machineToIPMap[strings.ToLower(strings.TrimSpace(name))] = strings.TrimSpace(ip)
	ipToMachineMap[strings.ToLower(strings.TrimSpace(ip))] = strings.TrimSpace(name)
}

// ResolveUNCPath converts hostname-based UNC paths (e.g. \\server\share) to IP-based UNC paths.
func ResolveUNCPath(p string) string {
	if len(p) < 3 {
		return p
	}
	prefix := ""
	if strings.HasPrefix(p, "\\\\") {
		prefix = "\\\\"
	} else if strings.HasPrefix(p, "//") {
		prefix = "//"
	} else {
		return p
	}
	trimmed := p[2:]
	slashIdx := strings.IndexAny(trimmed, "\\/")
	host := trimmed
	rest := ""
	if slashIdx != -1 {
		host = trimmed[:slashIdx]
		rest = trimmed[slashIdx:]
	}
	machineMappingsMu.RLock()
	mappedIP, ok := machineToIPMap[strings.ToLower(host)]
	machineMappingsMu.RUnlock()
	if ok && mappedIP != "" {
		return prefix + mappedIP + rest
	}
	return p
}

// UnresolveUNCPath converts IP-based UNC paths back to friendly machine hostnames for UI display.
func UnresolveUNCPath(p string) string {
	if len(p) < 3 {
		return p
	}
	prefix := ""
	if strings.HasPrefix(p, "\\\\") {
		prefix = "\\\\"
	} else if strings.HasPrefix(p, "//") {
		prefix = "//"
	} else {
		return p
	}
	trimmed := p[2:]
	slashIdx := strings.IndexAny(trimmed, "\\/")
	host := trimmed
	rest := ""
	if slashIdx != -1 {
		host = trimmed[:slashIdx]
		rest = trimmed[slashIdx:]
	}
	machineMappingsMu.RLock()
	displayMachine, ok := ipToMachineMap[strings.ToLower(host)]
	machineMappingsMu.RUnlock()
	if ok && displayMachine != "" {
		return prefix + displayMachine + rest
	}
	return p
}
