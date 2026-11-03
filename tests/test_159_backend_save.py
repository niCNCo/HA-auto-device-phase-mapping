"""Ensure the server explicitly acknowledges only after .storage has committed.

Also exercises real legacy stored settings including a manual coffee maker and many
custom names. The synthetic Store collects snapshots, not any external data.
"""
import ast
import asyncio
from copy import deepcopy
import json
from pathlib import Path
import unittest

BASE=Path(__file__).resolve().parents[1] / 'custom_components/ha_auto_device_phase_mapping'
engine_mod=ast.parse((BASE/'engine.py').read_text())
cls=next(n for n in engine_mod.body if isinstance(n,ast.ClassDef) and n.name=='PhaseEngine')
methods=[n for n in cls.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))
         and n.name in ('_normalize_manual_devices','update_settings','save')]
# Rather than duplicate the entire engine, extend the existing isolated test setup.
import sys
sys.path.insert(0,str(Path(__file__).parent))
from test_157_reset_and_persistence import TestEngine, constants
# AST function definitions are compiled as a module for the isolated engine.
ns={'PHASES':('L1','L2','L3')}
exec(compile(ast.fix_missing_locations(ast.Module(body=[next(n for n in methods if n.name=='_normalize_manual_devices')],type_ignores=[])),str(BASE/'engine.py'),'exec'),ns)
TestEngine._normalize_manual_devices=staticmethod(ns['_normalize_manual_devices'])

init_ast=ast.parse((BASE/'__init__.py').read_text())
ws_set=next(n for n in init_ast.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='ws_set')
# Strip decorators (which need the full HA runtime) to exercise the real handler body.
ws_set.decorator_list=[]
class Connection:
    def __init__(self):self.results=[];self.errors=[]
    def send_error(self,*args):self.errors.append(args)
    def send_result(self,*args):self.results.append(args)

class PersistedSettings(unittest.TestCase):
    def test_coffee_machine_and_names_survive_round_trip(self):
        async def run():
            with (Path(__file__).parent/'fixtures/save_settings.json').open() as source:
                settings=json.load(source)
            engine=TestEngine()
            engine.settings=deepcopy(settings)
            engine.export=lambda: {'settings': deepcopy(engine.settings), 'version': '1.5.9'}
            conn=Connection()
            ns={'get_engine':lambda _hass:engine}
            exec(compile(ast.fix_missing_locations(ast.Module(body=[ws_set],type_ignores=[])),str(BASE/'__init__.py'),'exec'),ns)
            handler=ns['ws_set']
            await handler(None,conn,{'id':1,'type':'ha_auto_device_phase_mapping/set','manual_devices':[]})
            self.assertFalse(conn.errors)
            self.assertEqual(conn.results[-1][1]['save_ack'],{'committed':True,'fields':['manual_devices']})
            self.assertEqual(engine._store.snapshots[-1]['settings']['manual_devices'],[])
            self.assertEqual(engine.settings['display_names'],settings['display_names'])
            name=deepcopy(settings['display_names'])
            name['sensor.example_device_007']='Renamed TV'
            await handler(None,conn,{'id':2,'type':'ha_auto_device_phase_mapping/set','display_names':name})
            self.assertFalse(conn.errors)
            self.assertEqual(engine._store.snapshots[-1]['settings']['display_names']['sensor.example_device_007'],'Renamed TV')
            self.assertEqual(conn.results[-1][1]['save_ack'],{'committed':True,'fields':['display_names']})
            self.assertEqual(engine._store.snapshots[-1]['settings']['manual_devices'],[])
            reloaded = TestEngine()
            reloaded.settings=deepcopy(engine._store.snapshots[-1]['settings'])
            self.assertEqual(reloaded.settings['manual_devices'],[])
            self.assertEqual(reloaded.settings['display_names']['sensor.example_device_007'],'Renamed TV')
            # A failed disk write must never produce a successful commit ack.
            async def failed_save(_payload):
                raise OSError('Disk not writable')
            engine._store.async_save=failed_save
            before=len(conn.results)
            with self.assertRaises(OSError):
                await handler(None,conn,{'id':3,'type':'ha_auto_device_phase_mapping/set','manual_devices':[{'id':'manual_test','name':'Other','phase':'L1','room':''}]})
            self.assertEqual(len(conn.results),before)
        asyncio.run(run())

if __name__=='__main__':unittest.main()
