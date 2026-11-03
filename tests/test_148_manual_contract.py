"""Regression tests for manual appliance storage, source names and display-only update."""
import ast
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / 'custom_components' / 'ha_auto_device_phase_mapping'

class Release148Tests(unittest.TestCase):
    def test_backend_keeps_old_storage_key_and_schema(self):
        engine = (COMPONENT/'engine.py').read_text()
        const = (COMPONENT/'const.py').read_text()
        self.assertIn('Store(hass, 1, "ha_auto_device_phase_mapping.learning")', engine)
        self.assertIn('"manual_devices" in payload', engine)
        self.assertIn('"display_names" in payload', engine)
        self.assertRegex(const, r'VERSION = "1\.[0-9]+\.[0-9]+"')

    def test_backend_manual_normalizer_handles_multiple_devices(self):
        tree=ast.parse((COMPONENT/'engine.py').read_text())
        klass=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='PhaseEngine')
        func=next(n for n in klass.body if isinstance(n,ast.FunctionDef) and n.name=='_normalize_manual_devices')
        func.decorator_list=[]
        scope={'PHASES':('L1','L2','L3')}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[func],type_ignores=[])),str(COMPONENT/'engine.py'),'exec'),scope)
        normalize=scope['_normalize_manual_devices']
        devices=[{'id':'manual_1','name':'Coffee maker','room':'Kitchen','phase':'L1'},{'id':'manual_2','name':'Heater','phase':'L2'}]
        self.assertEqual(len(normalize(devices)),2)
        devices[0]['phase']='L3'
        result=normalize(devices)
        self.assertEqual(result[0]['phase'],'L3')
        self.assertEqual(result[1]['name'],'Heater')
        self.assertEqual(len(normalize(result[1:])),1)

if __name__=='__main__': unittest.main()
