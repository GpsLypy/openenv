## ADDED Requirements

### Requirement: Real local inventory
The system SHALL inspect the user's shell PATH and bounded known installation directories and report installed executable paths, resolved paths, probe status, versions and installation sources.

#### Scenario: Multiple installations
- **WHEN** distinct Node.js executables exist in PATH and a known version-manager root
- **THEN** the inventory lists the discovered installations, marks only the first PATH match active, and distinguishes inactive installations from missing tools

#### Scenario: Symbolic link aliases
- **WHEN** multiple paths resolve to the same executable
- **THEN** the inventory retains their invocation locations without counting them as independent installations

#### Scenario: Version probe fails
- **WHEN** an executable exists but its version process fails or times out
- **THEN** the UI reports it as found with an unverified version and preserves the reason

### Requirement: Explain shell and PATH
The system SHALL show environment provenance, ordered PATH entries, duplicate entries and missing directories. The system SHALL explicitly indicate login-shell capture fallback.

#### Scenario: Shell startup is unavailable
- **WHEN** shell environment capture fails or exceeds its time budget
- **THEN** scanning continues from the app environment and shows a fallback notice

### Requirement: Protect local secrets
The system SHALL keep sensitive environment values out of renderer IPC, error messages and exported reports. Environment report exports SHALL omit all environment variable values.

#### Scenario: Token in environment
- **WHEN** a variable name indicates a token, credential, password or private key
- **THEN** the renderer receives only a redaction marker and cannot reveal the original value

### Requirement: Focused inspection
The system SHALL provide searchable categorized inventory, installation details, shell and environment views, and an explicit local report export. Uninstalled tools SHALL be hidden by default.

#### Scenario: No matching tools
- **WHEN** a search or category filter matches nothing
- **THEN** the UI explains the empty result and allows resetting the filter
