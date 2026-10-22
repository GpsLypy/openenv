# Verification — 2026-10-22

## Verified target

Apple Silicon Mac, macOS 27.0.1 (`sw_vers`; Darwin release 27.0.0), Node 22.23.0, Electron 38.8.6. The app is a macOS arm64 `.app`, ad-hoc signed and not notarized. The v0.1.0 release also provides DMG, ZIP and SHA-256 assets.

## Passed

- `npm test`: 12 regression tests. Real temporary executable files and symlinks verify PATH precedence, independent version discovery, alias deduplication, failed-active behavior and versioned compiler aliases. Other tests cover shell parsing/fallback, standard macOS PATH initialization, secret masking, Windows PATH semantics, bounded processes, report privacy and concurrency.
- `npm run build`: TypeScript and Vite production build passed.
- `openspec validate --all --strict --no-interactive`: 1 change passed.
- `npm run package:mac`: local Electron distribution packaging, pure Node PNG/ICNS assets, ad-hoc signing and ZIP generation passed.
- `codesign --verify --deep --strict release/mac-arm64/OpenEnv.app`: passed. The executable is Mach-O arm64.
- `OPENENV_EXECUTABLE="$PWD/release/mac-arm64/OpenEnv.app/Contents/MacOS/OpenEnv" npm run test:desktop`: **16 checks passed against the packaged app**, not a browser fixture.

The desktop checks verify real scanner results, native tray availability, packaged login-item settings availability, Node.js path/details, system clipboard copy with original text restored, search/reset, category/missing filters, shell profiles, variable masking, PATH diagnostics, settings controls, rejected unscanned paths, real report writing through export IPC, renderer isolation, close-to-tray/reactivation, no horizontal overflow at 1024px, no renderer errors, and shared concurrent scans.

The native save dialog is replaced only within the test process to select a workspace report path; actual export IPC and disk contents are verified. The real login startup setting is read, not toggled. Screenshots and detailed test results are under `.local/verification/` (ignored, local only).

## Real-host validation

Real-host validation confirmed multiple nvm and Python installations, active-path precedence, Homebrew provenance, versioned Python commands, Apple Clang compatibility detection and unverified system-launcher handling. Local inventory snapshots and screenshots remain excluded from the public source tree.

macOS shell capture starts from standard system PATH, so IDE-injected runtime directories do not become the machine's default environment. Overlapping missing/duplicate PATH issues are counted once per entry.

## Remaining native acceptance

- No real logout/reboot was performed. Startup API wiring, availability and state are verified; actual post-login launch remains pending.
- Windows/Linux native scanner, tray, startup/packaging behavior has not been verified on those operating systems. Linux login startup is not implemented.
- Intel macOS and older supported macOS versions have not been exercised. Only arm64 is packaged here.
- Not a full-disk inventory: arbitrary custom directories, shell aliases/functions, project virtual environments and containers may be outside scope.
- Login profiles and version commands execute existing local user code. The scanner itself does not rewrite profiles or invoke installers.
