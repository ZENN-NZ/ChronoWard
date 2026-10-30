# Stage 05: Release Packaging

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 3 (Reference) | `../_config/security_policy.md` | Security and audit rules |
| Layer 4 (Working)   | `../04_verification_and_testing/output/test_verification_report.md` | Verified test suite green light |

## Process
1. Inspect the version difference between what is committed locally (`v2.0.4` at `1e427bb`), what is committed on `origin/main` (`7bcd5ef`), and the pending `v2.0.5` release.
2. Verify version number consistency across:
   - `package.json`
   - `package-lock.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
   - `src-tauri/tauri.conf.json`
3. Audit `CHANGELOG.md` to ensure all fixes, security updates, and dependency locks are documented.
4. Document pending tasks required to cut the official `v2.0.5` release:
   - Fast-forward local branch to `origin/main` (`7bcd5ef`).
   - Create official git tag: `git tag v2.0.5`.
   - Push tag to remote: `git push origin v2.0.5`.

## Outputs
- `output/version_diff_and_release_plan.md`: Comprehensive breakdown of committed vs release version differences and release execution steps.
- **Review Gate**: Maintainer approval to tag and release ChronoWard v2.0.5.
