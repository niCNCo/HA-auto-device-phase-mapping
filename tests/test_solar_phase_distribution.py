"""Run standalone: python -m unittest discover -s tests"""
import importlib.util
from pathlib import Path
import math
import unittest

file = Path(__file__).resolve().parents[1] / 'custom_components' / 'ha_auto_device_phase_mapping' / 'correlation.py'
spec = importlib.util.spec_from_file_location('phase_correlation', file)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class SolarDistributionTests(unittest.TestCase):
    def test_equal_phase_shares(self):
        values = mod.estimated_phase_solar_watts(1200, {'L1': 230, 'L2': 230, 'L3': 230})
        self.assertEqual(values, {'L1': 400, 'L2': 400, 'L3': 400})

    def test_unbalanced_shares_preserve_total(self):
        values = mod.estimated_phase_solar_watts(1700, {'L1': 200, 'L2': 300, 'L3': 500})
        self.assertAlmostEqual(values['L1'], 340)
        self.assertAlmostEqual(values['L2'], 510)
        self.assertAlmostEqual(values['L3'], 850)
        self.assertAlmostEqual(sum(values.values()), 1700)

    def test_zero_current_phase(self):
        values = mod.estimated_phase_solar_watts(800, {'L1': 0, 'L2': 200, 'L3': 200})
        self.assertEqual(values['L1'], 0)
        self.assertEqual(sum(values.values()), 800)

    def test_invalid(self):
        self.assertIsNone(mod.estimated_phase_solar_watts(1000, {'L1': 0, 'L2': 0, 'L3': 0}))
        self.assertIsNone(mod.estimated_phase_solar_watts(1000, {'L1': -4, 'L2': 5, 'L3': 5}))
        self.assertIsNone(mod.estimated_phase_solar_watts(math.nan, {'L1': 3, 'L2': 5, 'L3': 5}))

if __name__ == '__main__':
    unittest.main()
