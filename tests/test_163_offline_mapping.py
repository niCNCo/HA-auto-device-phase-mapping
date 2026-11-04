"""Offline phase mappings remain visible and do not retain stale power values."""
import ast
from collections import Counter
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
import unittest

BASE = Path(__file__).resolve().parents[1] / 'custom_components/ha_auto_device_phase_mapping'
tree = ast.parse((BASE / 'engine.py').read_text())
cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'PhaseEngine')
methods = [node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name in ('_refresh_candidates',)]

def valid_power(state):
    return float(state.state) if state and state.state not in ('unavailable', 'unknown') and state.attributes.get('unit_of_measurement') == 'W' and state.attributes.get('device_class') == 'power' else None

namespace = {'valid_power': valid_power, 'PHASES': ('L1','L2','L3')}
exec(compile(ast.fix_missing_locations(ast.Module(body=methods,type_ignores=[])), str(BASE/'engine.py'), 'exec'), namespace)

class FakeStates:
    def __init__(self, records): self.records = records
    def async_all(self, domain): return [v for v in self.records.values() if v.domain == domain]
    def get(self, entity_id): return self.records.get(entity_id)

def state(entity_id, reading, name='Garage fridge'):
    return SimpleNamespace(entity_id=entity_id, domain='sensor', state=reading, name=name, attributes={'device_class':'power','unit_of_measurement':'W'})

class TestOffline(unittest.TestCase):
    def engine(self, records):
        eng=SimpleNamespace(hass=SimpleNamespace(states=FakeStates(records)),
            settings={'manual_assignments':{}},
            results={'sensor.garage_fridge_power':{'phase':'L1','confidence':92,'events':8}},
            candidates={'sensor.garage_fridge_power':{'entity_id':'sensor.garage_fridge_power','name':'Garage fridge'}},
            snapshots={'sensor.garage_fridge_power':(90,42)},_dirty=False)
        eng._source_ids=lambda:set()
        return eng
    def test_unavailable_sensor_still_candidate(self):
        eng=self.engine({'sensor.garage_fridge_power':state('sensor.garage_fridge_power','unavailable')})
        namespace['_refresh_candidates'](eng)
        self.assertIn('sensor.garage_fridge_power',eng.candidates)
        self.assertFalse(eng._dirty)
        self.assertIsNone(valid_power(eng.hass.states.get('sensor.garage_fridge_power')))
    def test_missing_sensor_still_candidate(self):
        eng=self.engine({})
        namespace['_refresh_candidates'](eng)
        self.assertEqual(eng.candidates['sensor.garage_fridge_power']['name'],'Garage fridge')
    def test_unknown_unmapped_sensor_not_added(self):
        eng=self.engine({'sensor.other_power':state('sensor.other_power','unavailable')})
        namespace['_refresh_candidates'](eng)
        self.assertNotIn('sensor.other_power',eng.candidates)
    def test_reconnected_sensor_is_regular_candidate(self):
        eng=self.engine({'sensor.garage_fridge_power':state('sensor.garage_fridge_power','91')})
        namespace['_refresh_candidates'](eng)
        self.assertIn('sensor.garage_fridge_power',eng.candidates)

if __name__=='__main__':unittest.main()
