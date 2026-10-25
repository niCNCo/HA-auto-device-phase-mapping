"""Regression: stale/unavailable current and voltage values must not block setup."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'custom_components/ha_auto_device_phase_mapping/engine.py'
module = ast.parse(SOURCE.read_text())
engine = next(node for node in module.body if isinstance(node, ast.ClassDef) and node.name == 'PhaseEngine')
method = next(node for node in engine.body if isinstance(node, ast.FunctionDef) and node.name == '_valid_measurement_source')
namespace = {}
exec(compile(ast.Module(body=[method], type_ignores=[]), str(SOURCE), 'exec'), namespace)
validate = namespace['_valid_measurement_source']

class SourceValidationTests(unittest.TestCase):
    def check(self, state):
        obj = SimpleNamespace(hass=SimpleNamespace(states={'sensor.p1':state}))
        return validate(obj, 'sensor.p1', 'current', 'A')

    def test_stale_valid_current_is_selectable(self):
        state = SimpleNamespace(domain='sensor', state='unavailable', attributes={'device_class':'current','unit_of_measurement':'A'})
        self.assertTrue(self.check(state))

    def test_wrong_unit_rejected(self):
        state = SimpleNamespace(domain='sensor', state='25', attributes={'device_class':'current','unit_of_measurement':'mA'})
        self.assertFalse(self.check(state))

    def test_missing_sensor_rejected(self):
        self.assertFalse(self.check(None))

    def test_wrong_device_class_rejected(self):
        state = SimpleNamespace(domain='sensor', state='230', attributes={'device_class':'voltage','unit_of_measurement':'A'})
        self.assertFalse(self.check(state))

if __name__ == '__main__': unittest.main()
