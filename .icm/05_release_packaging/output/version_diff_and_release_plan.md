# Version Differences & Release Plan (v2.0.4 ➔ v2.0.5)

## 1. Version State Summary

| Dimension | Committed Locally (`HEAD`) | Committed on Remote (`origin/main`) | Target Release (`v2.0.5`) |
| :--- | :--- | :--- | :--- |
| **Git Commit** | `1e427bb` | `7bcd5ef` (1 commit ahead) | `7bcd5ef` |
| **Git Tag** | `v2.0.4` | `v2.0.4` | `v2.0.5` (Pending tag) |
| **`package.json`** | `2.0.4` | `2.0.5` | `2.0.5` |
| **`package-lock.json`** | `2.0.4` | `2.0.5` | `2.0.5` |
| **`src-tauri/Cargo.toml`** | `2.0.4` | `2.0.5` | `2.0.5` |
| **`src-tauri/Cargo.lock`** | `2.0.2` (in tree) / `2.0.4` (working copy) | `2.0.5` | `2.0.5` |
| **`src-tauri/tauri.conf.json`**| `2.0.4` | `2.0.5` | `2.0.5` |
| **`CHANGELOG.md`** | Ends at `[2.0.4]` | Includes `[2.0.5] - 2026-08-24` | `[2.0.5] - 2026-08-24` |
| **`.cargo/audit.toml`** | Does not exist | Exists with `RUSTSEC-2024-0429` exception | Maintained with exception |
| **`SECURITY.md`** | Baseline | Documented Linux GTK advisory exception | Maintained |

---

## 2. Key Differences in v2.0.5 vs v2.0.4

1. **Dependency Pinning & Stability:**
   - All NPM `@tauri-apps/*` packages pinned to exact versions:
     - `@tauri-apps/api: 2.11.1`
     - `@tauri-apps/plugin-dialog: 2.7.0`
     - `@tauri-apps/cli: 2.11.4`
   - All Cargo crate dependencies in `src-tauri/Cargo.toml` pinned with exact `=` versions to prevent drift during compilation.
2. **RustSec Advisory Resolution (`RUSTSEC-2024-0374`):**
   - Upgraded `event-listener` crate from `5.4.1` to `5.4.2` to resolve the thread-safety vulnerability.
3. **Linux Dependency Audit Exception:**
   - Added `.cargo/audit.toml` specifying `ignore = ["RUSTSEC-2024-0429"]` with `deny = ["unsound"]`.
   - Documented rationale in `SECURITY.md` noting that Linux builds are not distributed.

---

## 3. Pending Release Actions
1. Reconcile local working directory (`git restore src-tauri/Cargo.lock src-tauri/Cargo.toml`).
2. Fast-forward local `main` branch to match `origin/main`:
   ```powershell
   git pull origin main
   ```
3. Tag the release commit `7bcd5ef`:
   ```powershell
   git tag v2.0.5 7bcd5ef
   ```
4. Push the new tag to GitHub:
   ```powershell
   git push origin v2.0.5
   ```
5. Trigger Tauri production build:
   ```powershell
   npm run tauri build
   ```
