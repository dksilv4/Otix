//go:build !windows

package explorer

import "syscall"

func GetDiskUsage(path string) (freeBytes uint64, totalBytes uint64, err error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, err
	}
	// Blocks * bsize
	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bavail * uint64(stat.Bsize)
	return free, total, nil
}
