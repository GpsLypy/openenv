## Context

The repository is empty. The first target is an Apple Silicon Mac. Use Electron for one cross-platform shell, Node for bounded filesystem/process inspection, React/TypeScript for a compact interface. No remote services or database are needed.

## Goals / Non-Goals

Goals: installed environment inventory, active version and source explanation, PATH diagnostics, local export, native tray, macOS startup setting.

Non-goals: installing/removing/upgrading runtimes, editing shell profiles, automatically resolving conflicts, recursive disk indexing, claiming untested Windows/Linux support.

## Decisions

- Capture the configured login/interactive shell with a timeout and fall back explicitly to app environment. Version probes use fixed executable arguments and the captured environment; no user-provided command execution.
- Inspect PATH and bounded version-manager roots. Resolve symlinks for deduplication but retain invocation paths and precedence. A second installation is informational unless it shadows a different executable in PATH.
- Never send sensitive variable values to the renderer. Export contains inventory and PATH diagnostics, not environment variable values.
- Serialize scans, limit process concurrency, time out subprocess groups and distinguish found-but-unverified executables from missing tools.
- Use isolated Electron renderer, a small typed preload API, allowlisted IPC inputs, blocked external navigation and local-only resources.
- Match the reference with navy panels, restrained blue edges and colored tool identities. The signature is an ordered PATH route explaining the executable selected by the shell.
- Startup is off by default. A user toggle changes the OS login setting. Closing hides the app while the tray exists; Quit exits.

## Risks / Trade-offs

Login shell startup code may be slow or output text; delimit and bound environment capture and expose fallback state. Known-location discovery cannot find every custom installation. Electron produces a larger app than a native implementation. Local ad-hoc signing does not provide notarization.

## Validation Strategy

Unit tests exercise real temporary filesystem fixtures, executable precedence, symlink deduplication, manager discovery, timeouts, masking and report redaction. Validate real host scanning, TypeScript/build, OpenSpec strict checks, packaged app IPC and tray/settings UI. Windows/Linux packaging and native startup need their own OS acceptance.
