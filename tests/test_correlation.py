"""No Home Assistant dependency: algorithm checks for obvious and ambiguous steps."""
import importlib.util
from pathlib import Path
import unittest

file = Path(__file__).resolve().parents[1] / "custom_components" / "ha_auto_device_phase_mapping" / "correlation.py"
spec = importlib.util.spec_from_file_location("phase_correlation", file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
classify = module.classify
corrected_phase_power = module.corrected_phase_power


class TestCorrelation(unittest.TestCase):
    def test_solar_and_battery_correction(self):
        # Heater L2 adds 900 W while PV and battery outputs obscure P1 changes.
        # Grid readings: household [100,1000,100] - PV [300,300,300] - battery [0,700,0].
        grid = {"L1": -200, "L2": 0, "L3": -200}
        batteries = {"L1": 0, "L2": 700, "L3": 0}
        out = corrected_phase_power(grid, batteries, 900)
        self.assertEqual(out, {"L1": 100, "L2": 1000, "L3": 100})

    def test_battery_charging_negative(self):
        grid = {"L1": 1400, "L2": 0, "L3": 0}
        batteries = {"L1": -1000, "L2": 0, "L3": 0}
        self.assertEqual(corrected_phase_power(grid, batteries, 0)["L1"], 400)

    def test_battery_reverse_polarity(self):
        grid = {"L1": -300, "L2": 0, "L3": 0}
        batteries = {"L1": -500, "L2": 0, "L3": 0}
        self.assertEqual(corrected_phase_power(grid, batteries, 0, battery_discharge_positive=False)["L1"], 200)

    def test_l1_device_switches_on(self):
        self.assertEqual(classify(860, {"L1": 845, "L2": -4, "L3": 6})[0], "L1")

    def test_l2_device_switches_off(self):
        self.assertEqual(classify(-820, {"L1": 5, "L2": -815, "L3": -8})[0], "L2")

    def test_l3(self):
        self.assertEqual(classify(400, {"L1": -1, "L2": 0, "L3": 421})[0], "L3")

    def test_balanced_three_phase(self):
        self.assertEqual(classify(2400, {"L1": 797, "L2": 803, "L3": 795})[0], "3-phase")

    def test_rejects_simultaneous_changes(self):
        self.assertIsNone(classify(900, {"L1": 910, "L2": 450, "L3": 10}))

    def test_rejects_mismatch(self):
        self.assertIsNone(classify(800, {"L1": 5, "L2": -6, "L3": 15}))

    def test_rejects_missing_phase(self):
        self.assertIsNone(classify(800, {"L1": 800, "L2": 0}))

    def test_rejects_not_enough_signal(self):
        self.assertIsNone(classify(7, {"L1": 7, "L2": 0, "L3": 0}))

    def test_confidence_is_weight_not_probability(self):
        phase, quality = classify(500, {"L1": 505, "L2": 0, "L3": 0})
        self.assertEqual(phase, "L1")
        self.assertTrue(0 < quality <= 1)


if __name__ == "__main__":
    unittest.main()
