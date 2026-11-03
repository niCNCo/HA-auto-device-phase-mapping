"""v1.5.7: single-device reset and ordered .storage persistence."""
import ast
import asyncio
from collections import deque, Counter
from copy import deepcopy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import time
import unittest

BASE = Path(__file__).resolve().parents[1] / "custom_components/ha_auto_device_phase_mapping"
engine_ast = ast.parse((BASE / "engine.py").read_text())
cls = next(n for n in engine_ast.body if isinstance(n, ast.ClassDef) and n.name == "PhaseEngine")
methods = [n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
           and n.name in {"update_settings", "save"}]
namespace = {"deepcopy": deepcopy, "deque":deque, "time":time, "asyncio":asyncio,
             "PHASES":("L1","L2","L3")}
exec(compile(ast.fix_missing_locations(ast.Module(body=methods, type_ignores=[])),str(BASE / "engine.py"),"exec"),namespace)
spec=importlib.util.spec_from_file_location("pm_const_157", BASE / "const.py")
constants=importlib.util.module_from_spec(spec);spec.loader.exec_module(constants)

class Stored:
    def __init__(self):self.snapshots=[];self.delay=0
    async def async_save(self, payload):
        if self.delay:await asyncio.sleep(self.delay)
        self.snapshots.append(deepcopy(payload))

class PendingTask:
    def __init__(self):self.cancelled=False
    def cancel(self):self.cancelled=True

class TestEngine:
    update_settings=namespace['update_settings']
    save=namespace['save']
    def __init__(self):
        self.settings=constants.default_settings()
        self.settings['display_names']={'sensor.bed':'Bed heating left','sensor.other':'Kettle'}
        self.settings['display_icons']={'sensor.bed':'mdi:radiator','sensor.other':'mdi:kettle'}
        self.settings['timing_overrides']={'sensor.bed':'slow'}
        self.settings['manual_assignments']={'sensor.bed':'L3','sensor.other':'L1'}
        self.settings['excluded']=['sensor.another']
        self.results={'sensor.bed':{'phase':'L3','events':4},'sensor.other':{'phase':'L1','events':6}}
        self.slow_votes={'sensor.bed':deque([('L3',1,time.time(),.9)]),'sensor.other':deque([('L1',1,time.time(),.9)])}
        self.level_hints={'sensor.bed':deque([('L3',time.time())]),'sensor.other':deque([('L1',time.time())])}
        self.pending={'sensor.bed':PendingTask(),'sensor.other':PendingTask()}
        self._worker_inflight = {}
        self._worker_recoveries = Counter()
        self._worker_recovery_due = {}
        self.queued_transitions={'sensor.bed':deque([('old',)]),'sensor.other':deque([('other',)])}
        self.snapshots={'sensor.bed':(110,time.monotonic()),'sensor.other':(500,time.monotonic())}
        self.device_reports={'sensor.bed':deque([(1,110)]),'sensor.other':deque([(2,500)])}
        self.sensor_cadence={'sensor.bed':deque([60]),'sensor.other':deque([5])}
        self.sensor_report_seen={'sensor.bed':1,'sensor.other':2}
        self.sensor_refresh_intervals={'sensor.bed':deque([60]),'sensor.other':deque([5])}
        self.device_diagnostics={'sensor.bed':{'counts':{'poor':2}},'sensor.other':{'counts':{'ok':2}}}
        self.recent_changes=deque([(1,'sensor.bed',110),(2,'sensor.other',500)],maxlen=200)
        self.candidates={'sensor.bed':{},'sensor.other':{}}
        self._dirty=False;self._store=Stored();self._last_save=time.monotonic();self._save_lock=asyncio.Lock();self.last_observation='2026-10-30'
        self.history={p:deque() for p in ('L1','L2','L3')}
        self._notify_count=0
    def _source_ids(self):return set()
    def _refresh_candidates(self):pass
    def _serialize_slow_votes(self):return deepcopy({k:list(v) for k,v in self.slow_votes.items()})
    def _serialize_level_hints(self):return deepcopy({k:list(v) for k,v in self.level_hints.items()})
    def _notify(self):self._notify_count+=1

class TestSingleDeviceReset(unittest.TestCase):
    def test_reset_removes_one_sensor_evidence_only_and_is_persisted(self):
        async def scenario():
            engine=TestEngine();pending=engine.pending['sensor.bed']
            await engine.update_settings({'reset_device':'sensor.bed'})
            self.assertTrue(pending.cancelled)
            self.assertNotIn('sensor.bed',engine.results)
            self.assertNotIn('sensor.bed',engine.slow_votes)
            self.assertNotIn('sensor.bed',engine.level_hints)
            self.assertNotIn('sensor.bed',engine.pending)
            self.assertNotIn('sensor.bed',engine.queued_transitions)
            self.assertNotIn('sensor.bed',engine.device_reports)
            self.assertNotIn('sensor.bed',engine.sensor_cadence)
            self.assertNotIn('sensor.bed',engine.settings['manual_assignments'])
            self.assertEqual(engine.snapshots['sensor.bed'][0],110)  # don't invent ON edge
            self.assertEqual(engine.last_observation,'2026-10-30')
            self.assertEqual(engine.settings['display_names']['sensor.bed'],'Bed heating left')
            self.assertEqual(engine.settings['display_icons']['sensor.bed'],'mdi:radiator')
            self.assertEqual(engine.settings['timing_overrides']['sensor.bed'],'slow')
            self.assertEqual(engine.settings['excluded'],['sensor.another'])
            self.assertEqual(engine.settings['manual_assignments']['sensor.other'],'L1')
            self.assertEqual(engine.results['sensor.other']['events'],6)
            self.assertEqual(len(engine.slow_votes['sensor.other']),1)
            self.assertIn('sensor.other',engine.pending)
            self.assertEqual(engine._notify_count,1)
            self.assertNotIn('sensor.bed',engine._store.snapshots[-1]['results'])
            self.assertIn('sensor.other',engine._store.snapshots[-1]['results'])
        asyncio.run(scenario())

    def test_bad_or_combined_reset_is_rejected_without_any_changes(self):
        async def scenario():
            engine=TestEngine();previous=deepcopy(engine.results)
            for payload in [{'reset_device':'sensor.not_present'},
                            {'reset_device':'switch.bed'},
                            {'reset_device':'sensor.bed','display_names':{}},
                            {'reset_device':'sensor.bed','reset':True}]:
                with self.assertRaises(ValueError):
                    await engine.update_settings(payload)
                self.assertEqual(engine.results,previous)
                self.assertEqual(engine._store.snapshots,[])
        asyncio.run(scenario())

    def test_periodic_save_cannot_overwrite_newer_appearance(self):
        async def scenario():
            engine=TestEngine();engine._store.delay=.025
            # First checkpoint begins with old alias, newer UI edit follows.
            prior=asyncio.create_task(engine.save());await asyncio.sleep(.003)
            engine.settings['display_names']['sensor.bed']='Bedroom heater NEW'
            updated=asyncio.create_task(engine.save());await asyncio.gather(prior,updated)
            self.assertEqual(engine._store.snapshots[-1]['settings']['display_names']['sensor.bed'],'Bedroom heater NEW')
        asyncio.run(scenario())

if __name__=='__main__':unittest.main()
