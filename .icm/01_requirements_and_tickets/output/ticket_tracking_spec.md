# Dual 12/12 Enterprise Ticket Tracking Specification

## Status: Approved & Implemented

### 1. Format Constraints
- **Pattern:** `^([A-Za-z0-9_-]{1,12})-(\d{1,12})$`
- **Prefix:** Up to 12 alphanumeric/dash/underscore characters (e.g., `PROJ`, `DEV_OPS`, `CW-2026`).
- **Ticket ID:** Up to 12 numeric digits (e.g., `1042`, `999999999999`).
- **Delimiter:** Single hyphen `-`.
- **Parser implementation:** `parseTicketNum(str)` in `src/utils.js`.

### 2. Integration Points
- **Main Sheet Row:** Optional `# Ticket` column toggled via `Ctrl+Shift+D` or settings.
- **Quick Log HUD:** Optional `Ticket #` input field; focus jumps naturally through keyboard tabs.
- **CSV Export:** Safely exported with leading formula sanitization.
