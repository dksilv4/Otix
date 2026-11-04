package organize

// Package organize provides modular planning, execution, cleanup, UNC resolution,
// and platform classification subsystems for high-reliability game organization.
//
// Subsystems:
//   - planning.go:  PreviewOrganization, sample previews, folder templates
//   - execution.go: ExecuteOrganization, atomic moves, collision checks, CopyFileAndVerify
//   - cleanup.go:   cleanEmptyDirsUp, healRepackDir, protected volume guards
//   - unc.go:       dynamic UNC resolution (zero hardcoded IPs), machine mappings
//   - classify.go:  noise detection, platform classification, update chain verification
//   - parser.go:    cross-platform game title and release name parsing
