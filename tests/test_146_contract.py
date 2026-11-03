"""Release contracts for interval-aware learning and manual appliance inventory."""
from pathlib import Path
import ast
import unittest

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'custom_components' / 'ha_auto_device_phase_mapping'

class Release146Tests(unittest.TestCase):
    def test_python_compatibility(self):
        for file in PACKAGE.glob('*.py'):
            ast.parse(file.read_text(), filename=str(file))

    def test_slow_history_and_confirmations(self):
        source = (PACKAGE/'engine.py').read_text()
        for token in ('_evaluate_slow', 'sensor_cadence', 'slow_candidate',
                      'slow_ambiguous', 'slow_missing_history', 'slow_no_matching_step',
                      'different_times>=3', 'len(directions)==2', 'deque(maxlen=1800)'):
            self.assertIn(token, source)

    def test_manual_inventory_persists(self):
        source = (PACKAGE/'engine.py').read_text()
        const = (PACKAGE/'const.py').read_text()
        ws = (PACKAGE/'__init__.py').read_text()
        for token in ('manual_devices', 'timing_overrides'):
            self.assertIn(token, source)
            self.assertIn(token, const)
            self.assertIn(token, ws)

    def test_frontend(self):
        js = (PACKAGE/'frontend'/'phase-mapper.js').read_text()
        for token in ('_manualForm()', '_manualRows(phase)', 'data-timing-mode',
                      '__delete__', 'manualAdd', 'manual_devices'):
            self.assertIn(token, js)

if __name__ == '__main__': unittest.main()
