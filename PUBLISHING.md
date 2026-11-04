# GitHub publication workflow — v1.6.3 RC1

Repository: https://github.com/niCNCo/HA-auto-device-phase-mapping

The branch `release/v1.6.3-rc1` was created from `main` (currently v1.6.2). Prepare and review the candidate there; **do not overwrite main** until accepted. Note: the repository currently reports **public** visibility.

## Update the release-candidate branch using GitHub Desktop

1. Open the existing local repository in GitHub Desktop. Fetch origin, and check there are no uncommitted changes (commit/stash them first if needed).
2. Switch to `release/v1.6.3-rc1` using **Current branch**; choose **Fetch origin** if it is not listed yet. If prompted to track the remote branch, accept.
3. Extract the `HA_auto_device_phase_mapping_v1.6.3_RC1_repository_ready.zip` archive. Copy the **contents** (not the enclosing folder or zip file) into the local repository's root, replacing the matching files. Preserve the hidden `.github` folder.
4. Confirm the working tree contains `custom_components/ha_auto_device_phase_mapping/manifest.json` at the expected path and the three new screenshots inside `docs/images`.
5. Review GitHub Desktop changes, commit as `Prepare v1.6.3 RC1 — responsive card, offline mappings, docs/screenshots`, and select **Push origin**.
6. Open a pull request from `release/v1.6.3-rc1` into `main` **without merging** until final approval. Run GitHub Actions/Hassfest/HACS checks and test the actual Home Assistant deployment.

## Prerelease after validation

Create a GitHub prerelease with **tag `v1.6.3-rc1`** pointing to the tested release-candidate commit. Be aware that historical `v1.6.3`/`v1.6.4`/`v1.6.5` tags may still exist even if their releases were deleted; do not reuse or move those tags without reviewing downstream update behavior.

The manifest and frontend currently identify as `1.6.3` because this is a candidate for that version. For final v1.6.3 promotion, re-run tests and verify consistent version reporting. **Do not advertise this candidate as HACS-stable while tests are outstanding.**

## Install/update the integration

Back up Home Assistant including `.storage`. Replace `custom_components/ha_auto_device_phase_mapping`, restart Home Assistant, and fully reload the browser/Companion app. Verify both UI and backend versions and persistent learning data. HACS default catalog inclusion is a separate application/review process.
