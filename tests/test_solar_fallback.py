import importlib.util
from pathlib import Path
import unittest

p = Path(__file__).resolve().parents[1]/'custom_components'/'ha_auto_device_phase_mapping'/'correlation.py'
spec = importlib.util.spec_from_file_location('correlation_fallback', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class SolarFallbackTests(unittest.TestCase):
    def test_zero_total_never_requires_v_i(self):
        shares, status, learning = m.solar_allocation_decision(0, True, None)
        self.assertEqual(status, 'zero_generation')
        self.assertTrue(learning)
        self.assertEqual(sum(shares.values()), 1)

    def test_stale_v_i_does_not_train(self):
        shares, status, learning = m.solar_allocation_decision(2500, True, None)
        self.assertEqual(status, 'fallback_equal')
        self.assertFalse(learning)
        self.assertAlmostEqual(shares['L2'], 1/3)

    def test_valid_phase_weights(self):
        shares, status, learning = m.solar_allocation_decision(1700, True, {'L1':2,'L2':3,'L3':5})
        self.assertEqual(status, 'estimated')
        self.assertTrue(learning)
        self.assertAlmostEqual(shares['L3'], .5)

    def test_equal_split_disabled_is_learnable(self):
        _, status, learning = m.solar_allocation_decision(1200, False, None)
        self.assertEqual(status, 'equal_split')
        self.assertTrue(learning)

    def test_missing_total_is_not_learnable(self):
        _, status, learning = m.solar_allocation_decision(None, True, None)
        self.assertEqual(status, 'solar_source_unavailable')
        self.assertFalse(learning)
