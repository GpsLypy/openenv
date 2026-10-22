## ADDED Requirements

### Requirement: Drag-to-install DMG
The system SHALL produce a versioned macOS arm64 DMG containing the signed OpenEnv app, an Applications shortcut and installation instructions describing the signing status.

#### Scenario: Install from image
- **WHEN** the user mounts the DMG
- **THEN** the app is available for copying into Applications and its signature remains valid after copying

### Requirement: Verify published assets
The system SHALL verify DMG integrity, image contents, application equivalence and SHA-256 checksums before publication, and compare the final GitHub release metadata against local artifacts.

#### Scenario: Release download assets
- **WHEN** v0.1.0 is published to the authorized repository
- **THEN** the release contains the DMG, ZIP and checksum file with expected names, sizes and SHA-256 digests

### Requirement: Publish only intended project content
The system SHALL exclude local environment inventories, reports, screenshots, dependency directories and build outputs from Git source commits. Installer binaries SHALL be uploaded as release assets.

#### Scenario: Initial public source publication
- **WHEN** the source tree is committed and pushed
- **THEN** only reviewed project sources and public documentation appear in the repository and local evidence remains ignored
