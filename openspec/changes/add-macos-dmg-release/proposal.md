## Why

The user requested publishing OpenEnv source and an installable DMG to a new public GitHub repository. The existing delivery only includes a local app and ZIP.

## What Changes

- Add reproducible DMG creation with an Applications shortcut and installation instructions.
- Verify image integrity, mounted contents, source equivalence and copied-app signature.
- Publish the source and a v0.1.0 preview release with DMG, ZIP and SHA-256 assets to GpsLypy/openenv.
- Keep local environment snapshots, private reports and screenshots outside the public source tree.

## Capabilities

### New Capabilities
- `macos-release`: verifiable macOS installer and GitHub release artifacts.

## Impact

Packaging scripts, repository metadata, public documentation, initial source commit and a public GitHub repository/release. Runtime functionality remains unchanged.
