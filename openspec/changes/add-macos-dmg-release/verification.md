# macOS DMG release verification

## Local artifacts

- `OpenEnv-0.1.0-mac-arm64.dmg`: disk-image integrity verified with `hdiutil verify`.
- The image contains `OpenEnv.app`, an Applications shortcut pointing to `/Applications`, and installation instructions.
- Mounted and copied applications both pass `codesign --verify --deep --strict`.
- All 282 file/symlink manifest records match the source app, including file content SHA-256, executable permissions and symlink targets. Framework symlinks are compared without following cycles.
- ZIP integrity and both artifact SHA-256 values match `SHA256SUMS`.
- The bundled ASAR contains no local reports, environment snapshots or verification directories.
- Existing runtime validation: 12 scanner regression tests, TypeScript/Vite build and 16 packaged desktop checks passed. No runtime behavior changed for the DMG release.
- Both OpenSpec changes pass strict validation.

## Publication scope

The user explicitly authorized creating the public `GpsLypy/openenv` repository with source code and installer assets. Public sources were reviewed; `.local/`, environment files, private key files, dependencies and build outputs are excluded from Git source commits. No license grant is inferred from source visibility.

The release is a v0.1.0 preview for macOS Apple Silicon. It is ad-hoc signed and not notarized. Windows/Linux, Intel macOS and actual login-after-reboot behavior remain outside this release's verified scope.

Remote publication results are recorded after repository/release verification.
