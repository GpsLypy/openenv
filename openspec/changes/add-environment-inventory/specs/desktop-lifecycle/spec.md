## ADDED Requirements

### Requirement: Menu bar and tray lifecycle
The system SHALL provide a native tray/menu bar entry to open the window, rescan, and quit. Closing the main window SHALL hide it while the tray is available.

#### Scenario: Reopen hidden window
- **WHEN** the user closes the main window and selects OpenEnv in the tray
- **THEN** the existing window is shown and focused without creating a second app instance

### Requirement: Explicit login startup
The system SHALL default login startup to disabled and change the OS preference only through an explicit user toggle. Unsupported or failed registration SHALL be reported accurately.

#### Scenario: Change macOS login setting
- **WHEN** the user enables or disables login startup in a packaged macOS app
- **THEN** the app applies the setting through the native login-item API and displays the resulting OS state

### Requirement: Platform verification scope
The system SHALL provide platform adapters for macOS, Windows and Linux and document which platform packages and native integrations have actually been verified.

#### Scenario: First macOS delivery
- **WHEN** a macOS app is delivered from this project
- **THEN** documentation distinguishes verified local macOS behavior from pending Windows/Linux native acceptance
