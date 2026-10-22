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

## Remote publication

- Public source: https://github.com/GpsLypy/openenv
- Published preview release: https://github.com/GpsLypy/openenv/releases/tag/v0.1.0
- Released source commit: `b72d1f8a922076945e24ed330692bab0c9d38ca8`.
- Final GitHub metadata confirms `draft=false`, `prerelease=true` and the correct versioned download URLs.
- The public Git tree matches all 41 intended initial source files; local evidence and build directories are absent.
- All three remote asset sizes and GitHub SHA-256 digests match local artifacts. Verification used remote metadata and did not re-download installer binaries.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `OpenEnv-0.1.0-mac-arm64.dmg` | 114491178 | `1c95015ac8c952f825a6eac7ff61268a83e36f3836117678a462368e44ac53a9` |
| `OpenEnv-0.1.0-mac-arm64.zip` | 111849292 | `098c5bf4f6f6a6ebf30dedfd7f48b8b206b9e488deb8e782f21b5d33f96cabb5` |
| `SHA256SUMS` | 188 | `8467cc45a4819333e1d358f365d5b6f65c9224bdf9230530da60a8ac311fbe9c` |
