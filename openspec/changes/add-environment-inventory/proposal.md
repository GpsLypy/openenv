## Why

Development machines accumulate runtimes, package managers and shell configuration. Users cannot easily see what is installed, which executable wins in PATH, or why a second version exists. OpenEnv makes this local state readable in one focused desktop utility.

## What Changes

- Build a dark desktop environment inventory with language, toolchain, shell, environment and PATH views.
- Detect real executable versions and installation locations from the user's login shell and bounded known manager locations.
- Explain active versus shadowed versions, missing PATH directories and duplicate entries without modifying them.
- Provide a macOS menu bar app, close-to-tray behavior, an explicit login-startup preference and a local application package.
- Keep environment secrets outside the renderer and exported reports; keep scanning and reports local.

## Capabilities

### New Capabilities
- `environment-inventory`: scan and inspect installed development environments.
- `desktop-lifecycle`: desktop window, menu bar/tray and explicit login startup.

## Impact

New Electron/React project, scanner tests, packaging scripts and local macOS build. Windows and Linux use platform adapters but require acceptance on their own operating systems.
