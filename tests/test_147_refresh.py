"""Regression checks for v1.4.7 measured report cadence and safe alias persistence."""
import ast
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'custom_components' / 'ha_auto_device_phase_mapping'
source = PACKAGE / 'engine.py'
module = ast.parse(source.read_text())
engine_cls = next(n for n in module.body if isinstance(n, ast.ClassDef) and n.name == 'PhaseEngine')
method = next(n for n in engine_cls.body if isinstance(n, ast.FunctionDef) and n.name == '_observe_sensor_reports')
ns = {'deque': deque}
exec(compile(ast.Module(body=[method], type_ignores=[]), str(source), 'exec'), ns)
observe = ns['_observe_sensor_reports']

class RefreshCadenceTests(unittest.TestCase):
    def setUp(self):
        self.report = SimpleNamespace(last_reported=datetime.fromtimestamp(900, timezone.utc))
        self.eng = SimpleNamespace(candidates={'sensor.test': {}}, sensor_report_seen={},
                                   sensor_refresh_intervals={}, _report_monitor_since=1000,
                                   hass=SimpleNamespace(states=SimpleNamespace(get=lambda _: self.report)))

    def test_no_guess_until_two_new_reports(self):
        observe(self.eng)
        self.assertEqual(self.eng.sensor_refresh_intervals, {})
        self.report.last_reported = datetime.fromtimestamp(1020, timezone.utc)
        observe(self.eng)
        self.assertEqual(self.eng.sensor_refresh_intervals, {})
        self.report.last_reported = datetime.fromtimestamp(1140, timezone.utc)
        observe(self.eng)
        self.assertEqual(list(self.eng.sensor_refresh_intervals['sensor.test']), [120])

    def test_unchanged_report_does_not_count_twice(self):
        self.report.last_reported = datetime.fromtimestamp(1050, timezone.utc)
        observe(self.eng); observe(self.eng)
        self.assertEqual(self.eng.sensor_refresh_intervals, {})
        self.report.last_reported = datetime.fromtimestamp(1350, timezone.utc)
        observe(self.eng)
        self.assertEqual(list(self.eng.sensor_refresh_intervals['sensor.test']), [300])

    def test_persistence_contains_new_names_without_evidence_reset(self):
        text = source.read_text()
        self.assertIn('"display_names" in payload', text)
        self.assertIn('"display_name": self.settings["display_names"].get(entity_id', text)
        self.assertIn('"measured_refresh_seconds"', text)
        self.assertIn('self._report_monitor_since', text)
        self.assertNotIn('"display_names", "battery_sources"', text)

if __name__ == '__main__': unittest.main()
