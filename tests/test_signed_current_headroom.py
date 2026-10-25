"""Regression coverage for signed import/export current and voltage validation."""
import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'custom_components/ha_auto_device_phase_mapping/engine.py'
module = ast.parse(SOURCE.read_text())
engine = next(n for n in module.body if isinstance(n, ast.ClassDef) and n.name == 'PhaseEngine')
method = next(n for n in engine.body if isinstance(n, ast.FunctionDef) and n.name == '_fresh_measurement')
import math
namespace = {'math': math}
exec(compile(ast.Module(body=[method], type_ignores=[]), str(SOURCE), 'exec'), namespace)
fresh = namespace['_fresh_measurement']

class SignedCurrentTests(unittest.TestCase):
    def read(self, value, device_class='current', age=1):
        now = datetime.now(timezone.utc)
        state = SimpleNamespace(domain='sensor',state=str(value),last_reported=now-timedelta(seconds=age),last_updated=now,
                                attributes={'device_class':device_class,'unit_of_measurement':'A' if device_class=='current' else 'V'})
        obj = SimpleNamespace(hass=SimpleNamespace(states={'sensor.test':state}))
        return fresh(obj,'sensor.test',now,device_class,'A' if device_class=='current' else 'V')

    def test_negative_current_is_valid(self):
        self.assertEqual(self.read(-2.90), -2.90)
        self.assertAlmostEqual(25-abs(self.read(-2.90)), 22.10)
    def test_positive_current_is_valid(self):
        self.assertEqual(self.read(2.90),2.90)
    def test_negative_voltage_is_invalid(self):
        self.assertIsNone(self.read(-233, 'voltage'))
    def test_stale_current_remains_unavailable(self):
        self.assertIsNone(self.read(-2.90, age=30))
    def test_nan_is_invalid(self):
        self.assertIsNone(self.read('nan'))

if __name__=='__main__':unittest.main()
