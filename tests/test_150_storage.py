"""Ensure icon preferences preserve v1.4.10 saved evidence and validate MDI names."""
import ast
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]/'custom_components/ha_auto_device_phase_mapping'
ENGINE=ast.parse((ROOT/'engine.py').read_text())
CLS=next(n for n in ENGINE.body if isinstance(n,ast.ClassDef) and n.name=='PhaseEngine')
NORMALIZER=next(n for n in CLS.body if isinstance(n,ast.FunctionDef) and n.name=='_normalize_manual_devices')
NORMALIZER.decorator_list=[]
NS={'PHASES':('L1','L2','L3')}
exec(compile(ast.fix_missing_locations(ast.Module(body=[NORMALIZER],type_ignores=[])), '<normalizer>','exec'),NS)

class Storage150Tests(unittest.TestCase):
    def test_normalizer_migrates_legacy_manual_entries(self):
        value=NS['_normalize_manual_devices']([{'id':'manual_old','name':'Coffee','room':'Kitchen','phase':'L2'}])
        self.assertEqual(value[0]['icon'],'mdi:power-plug')
        self.assertEqual(value[0]['phase'],'L2')
    def test_normalizer_keeps_valid_icon_and_defaults_invalid(self):
        norm=NS['_normalize_manual_devices']
        self.assertEqual(norm([{'id':'manual_one','name':'Heater','phase':'L3','icon':'mdi:radiator'}])[0]['icon'],'mdi:radiator')
        self.assertEqual(norm([{'id':'manual_one','name':'Heater','phase':'L3','icon':'javascript:bad'}])[0]['icon'],'mdi:power-plug')
    def test_display_only_settings_do_not_reset_evidence(self):
        source=(ROOT/'engine.py').read_text()
        self.assertIn('"display_icons" in payload',source)
        self.assertIn('"display_name": self.settings["display_names"]',source)
        self.assertIn('"display_icon": self.settings["display_icons"]',source)
        self.assertNotIn('"display_icons", "phase_sensors"',source)
        self.assertIn('Store(hass, 1, "ha_auto_device_phase_mapping.learning")',source)
    def test_api_accepts_icons(self):
        self.assertIn('vol.Optional("display_icons")', (ROOT/'__init__.py').read_text())
        self.assertIn('"display_icons": {}',(ROOT/'const.py').read_text())

if __name__=='__main__':unittest.main()
