# How to publish this as a public HACS integration on GitHub

The package is a ready-to-upload **GitHub repository**, not a live repository. A GitHub repository must be created by the maintainer before HACS can install it.

## Create the repository (one time)

1. Sign in to GitHub and open **https://github.com/new**.
2. Repository owner: your GitHub account; **Repository name:** `ha-automatic-ha-auto-device-phase-mapping`.
3. Visibility: **Public** (required for straightforward sharing).
4. **Do not pre-create a README, .gitignore or license** — the supplied folder contains them.
5. Click **Create repository**.

## Upload with GitHub Desktop (recommended)

1. Install / open **GitHub Desktop** and sign in.
2. Select **File → Clone repository → URL**, entering the new repository URL, e.g. `https://github.com/<your-user>/ha-automatic-ha-auto-device-phase-mapping`.
3. Extract the provided ZIP onto your computer. Copy its **contents**, including the hidden `.github` folder, into the new local clone. Do not copy the ZIP itself as the only repository file.
4. In GitHub Desktop, enter commit summary `Initial HA_auto_device_phase_mapping beta`, click **Commit to main**, then **Push origin**.
5. Open the public repository on GitHub and verify that `hacs.json`, `README.md`, and `custom_components/ha_auto_device_phase_mapping/manifest.json` appear at the correct paths.
6. In the repository's **Releases** section, choose **Draft a new release**, create tag `v1.1.0` (or the version in `manifest.json`), mark as **Pre-release** for the untested beta, and publish it.
7. Review the **Actions → Validate integration** workflow. A green workflow checks compilation/syntax and a small set of unit tests; it is **not** evidence of in-HA compatibility.

## Install in Home Assistant (HACS)

1. In HACS, select three-dot menu → **Custom repositories**.
2. Use the new public GitHub URL and choose type **Integration**.
3. Download **HA_auto_device_phase_mapping**.
4. Restart Home Assistant fully.
5. Go to **Settings → Devices & services → Add integration → HA_auto_device_phase_mapping**.
6. Open the **Phase Mapper** sidebar dashboard, select the L1/L2/L3 power sensors and exclude irrelevant devices in its **Settings** tab.
7. Optionally add `type: custom:ha-auto-device-phase-mapping-card` to an existing dashboard.

## Future updates

Edit the source, increase `version` in `custom_components/ha_auto_device_phase_mapping/manifest.json` and `const.py` (and JS `VERSION`), commit + push, create a matching GitHub Release tag, then update through HACS. Always test after HA restarts.

## Public release checklist

- [ ] Test installation on your own Home Assistant version and browser first.
- [ ] Verify the sidebar dashboard loads and the card is present in the card picker.
- [ ] Verify selected P1 sensors report individual signed **W** readings.
- [ ] Exclude duplicates and confirm the exclusions persist across a restart.
- [ ] Ensure the evidence result does not control devices and is labeled experimental.
- [ ] Share anonymous logs only; do not publish IPs or sensitive state snapshots.
- [ ] Confirm the README/documentation URL refers to your repository (adjust if using a different repository name).
