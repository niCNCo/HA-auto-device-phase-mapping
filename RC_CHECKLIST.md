# v1.6.3 RC1 validation checklist

- [x] Real current screenshots added for Lovelace, cockpit and expanded devices
- [x] README and release notes updated for actual UI behavior
- [x] Integration manifest still identifies v1.6.3
- [x] Python test suite passes (162 tests)
- [ ] Resolve / document remaining frontend JavaScript test failures
- [ ] Verify all 4 tiles fit at typical desktop dashboard widths
- [ ] Verify intermediate-width percentage-hiding behavior and narrower stacking
- [ ] Verify expanded mapping uses saved aliases and MDI icons
- [ ] Verify mapped offline power sensors remain present and render red non-bold Offline
- [ ] Verify refresh remains stable on desktop and Home Assistant iOS Companion
- [ ] Verify HACS and Hassfest validation on GitHub Actions
- [ ] After approval: merge candidate branch and publish final v1.6.3 release
