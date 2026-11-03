"""v1.4.10 regression: queued events, slow ON/OFF patterns, and provisional hints.

Run the production methods without requiring a Home Assistant installation.
"""
import ast
import asyncio
from bisect import bisect_left
from collections import Counter, deque
from copy import deepcopy
import math
from pathlib import Path
import time
import unittest

PATH = Path(__file__).resolve().parents[1] / 'custom_components/ha_auto_device_phase_mapping/engine.py'
SOURCE = PATH.read_text()
TREE = ast.parse(SOURCE)
ENGINE = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == 'PhaseEngine')
METHODS = {
    '_deserialize_level_hints', '_serialize_level_hints', '_record_level_hint', '_one_direction_votes', '_promote_saved_one_direction_votes',
    '_consider_level_hint', '_phase_hint', '_on_state', '_drain_next',
    '_start_transition', '_queue_transition', '_evaluate_slow', '_match_slow_profile', '_record_slow_vote', '_serialize_slow_votes',
    '_deserialize_slow_votes', 'save',
}
nodes = [n for n in ENGINE.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in METHODS]
klass = ast.ClassDef(name='EngineMethods', bases=[], keywords=[], body=nodes, decorator_list=[])
ns = {
    'deque': deque, 'Counter': Counter, 'deepcopy': deepcopy, 'math': math,
    'time': time, 'asyncio': asyncio, 'bisect_left': bisect_left, 'PHASES': ('L1','L2','L3'),
    'SLOW_VOTE_MAX_AGE_SECONDS': 14*86400, 'SLOW_VOTE_MAX_PER_DEVICE': 12,
    'SLOW_VOTE_MAX_DEVICES': 500, 'LEVEL_HINT_MAX_PER_DEVICE': 12,
    'PENDING_TRANSITIONS_MAX_PER_DEVICE': 256,
    'callback': lambda fn: fn, '_LOGGER': None,
}
exec(compile(ast.fix_missing_locations(ast.Module(body=[klass], type_ignores=[])), str(PATH), 'exec'), ns)

class Stub(ns['EngineMethods']):
    def __init__(self):
        self.slow_votes = {}
        self.level_hints = {}
        self.pending = {}
        self.pending_since = {}
        self.pending_last_progress = {}
        self._worker_inflight = {}
        self._worker_recoveries = Counter()
        self._worker_recovery_due = {}
        self.queued_transitions = {}
        self.device_reports = {}
        self.settings = {'excluded': [], 'learning_enabled': True, 'minimum_change_w': 100,
                         'timing_overrides': {}, 'phase_sensors': {p:'sensor.p1_'+p.lower() for p in ('L1','L2','L3')},
                         'window_seconds': 4.0}
        self.results = {}
        self.diagnostics = Counter()
        self.device_diagnostics = {}
        self.history_status = {'ready': True}
        self.history = {p: deque(maxlen=1800) for p in ('L1','L2','L3')}
        self.snapshots = {}
        self.sensor_cadence = {}
        self.candidates = {}
        self.recent_changes = deque(maxlen=200)
        self._dirty = False
        self._last_save = time.monotonic()
        self._store = None
        self._sent = []
        self._notifications = 0
    def _notify(self): self._notifications += 1
    def _diag(self, reason, eid=None, detail=None): self.diagnostics[reason] += 1
    def _source_ids(self): return set(self.settings['phase_sensors'].values())

class FakeState:
    def __init__(self, power):
        self.domain = 'sensor'; self.state = str(power); self.name = 'Airco Livingroom Power'
        self.attributes = {'device_class':'power','unit_of_measurement':'W'}

ns['_valid_power_dummy'] = FakeState
# Pure function copied from production by AST, so its state validation is real.
valid_fn = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'valid_power')
valid_module = ast.Module(body=[valid_fn], type_ignores=[])
exec(compile(ast.fix_missing_locations(valid_module), str(PATH), 'exec'), ns)
ns['valid_power'] = ns['valid_power']

class Event:
    def __init__(self, entity, power): self.data = {'entity_id':entity, 'new_state':FakeState(power)}

class Learning1410Tests(unittest.TestCase):
    def test_specific_l1_load_only_a_provisional_hint(self):
        engine = Stub()
        now = time.monotonic()
        engine.history = {
            'L1':deque([(now-i, 1454) for i in range(10)], maxlen=1800),
            'L2':deque([(now-i, 30) for i in range(10)], maxlen=1800),
            'L3':deque([(now-i, 203) for i in range(10)], maxlen=1800),
        }
        engine._consider_level_hint('sensor.airco',954)
        self.assertEqual(len(engine.level_hints['sensor.airco']),1)
        self.assertIsNone(engine._phase_hint('sensor.airco'), 'One level sample is never enough')
        self.assertEqual(engine.results,{})
        engine._record_level_hint('sensor.airco','L1',time.time()+76)
        hint = engine._phase_hint('sensor.airco')
        self.assertEqual(hint['phase'],'L1')
        self.assertFalse(hint['confirmed'])
        self.assertEqual(engine.results, {}, 'A hint must never create learning evidence')

    def test_power_increase_while_already_on_is_not_new_hint(self):
        engine=Stub(); now=time.monotonic()
        engine.history={
            'L1':deque(((now-i,1454) for i in range(10)),maxlen=1800),
            'L2':deque(((now-i,30) for i in range(10)),maxlen=1800),
            'L3':deque(((now-i,203) for i in range(10)),maxlen=1800),
        }
        engine._consider_level_hint('sensor.airco',954,850)
        self.assertEqual(engine.level_hints,{})
        engine._consider_level_hint('sensor.airco',954,57)
        self.assertEqual(len(engine.level_hints['sensor.airco']),1)

    def test_competing_phases_do_not_get_load_hint(self):
        engine = Stub(); now = time.monotonic()
        engine.history = {
            'L1':deque([(now-i, 1454) for i in range(9)], maxlen=1800),
            'L2':deque([(now-i, 1200) for i in range(9)], maxlen=1800),
            'L3':deque([(now-i, 203) for i in range(9)], maxlen=1800),
        }
        engine._consider_level_hint('sensor.airco',954)
        self.assertEqual(engine.level_hints, {})

    def test_conflicting_tentative_phases_show_no_hint(self):
        engine = Stub(); now=time.time()
        engine.slow_votes['sensor.airco'] = deque([
            ('L1',1,now-200,.9), ('L1',-1,now-100,.9), ('L2',1,now-30,.9)], maxlen=12)
        self.assertIsNone(engine._phase_hint('sensor.airco'))

    def test_provisional_hint_does_not_override_conflicting_accepted_evidence(self):
        engine = Stub(); now=time.time()
        engine.slow_votes['sensor.airco'] = deque([
            ('L1',1,now-200,.9), ('L1',-1,now-100,.9)], maxlen=12)
        engine.results['sensor.airco'] = {'events':3,'scores':{'L1':.2,'L2':2.1,'L3':0,'3-phase':0}}
        self.assertIsNone(engine._phase_hint('sensor.airco'))

    def test_on_off_votes_provide_candidate_without_assignment(self):
        engine=Stub(); now=time.time()
        engine.slow_votes['sensor.airco'] = deque([
            ('L1',1,now-200,.9), ('L1',-1,now-100,.9)], maxlen=12)
        hint=engine._phase_hint('sensor.airco')
        self.assertEqual(hint['phase'],'L1')
        self.assertEqual(hint['step_matches'],2)
        self.assertEqual(engine.results,{})

    def test_queue_an_event_instead_of_discarding_it(self):
        engine=Stub(); now=time.monotonic()
        engine.snapshots['sensor.airco']=(50,now-120)
        engine.pending['sensor.airco'] = object()
        engine._consider_level_hint=lambda *args: None
        # _on_state's global valid_power uses the production function.
        ns['valid_power'] = ns['valid_power']
        engine._on_state(Event('sensor.airco',1000))
        engine.snapshots['sensor.airco']=(1000,now-120)
        engine._on_state(Event('sensor.airco',50))
        self.assertEqual(len(engine.queued_transitions['sensor.airco']),2)
        self.assertEqual(engine.diagnostics['queued_transition'],2)
        self.assertEqual(engine.diagnostics['already_pending'],0)
        engine.pending.clear()
        consumed=[]
        engine._start_transition=lambda entity, trans, queued=False: consumed.append((entity,trans,queued)) or True
        engine._drain_next('sensor.airco')
        self.assertEqual(len(consumed),1)
        self.assertEqual(len(engine.queued_transitions['sensor.airco']),1)
        self.assertTrue(consumed[0][2])

    def test_queued_transition_drain_preserves_order(self):
        engine=Stub()
        now=time.monotonic()
        engine.queued_transitions['sensor.test']=deque([(900,now-5,now-10,0),(-900,now-2,now-5,900)],maxlen=96)
        popped=[]
        engine._start_transition=lambda eid, trans, queued=False: popped.append((eid, trans[0])) or True
        engine._drain_next('sensor.test')
        engine._drain_next('sensor.test')
        self.assertEqual(popped, [('sensor.test',900),('sensor.test',-900)])
        self.assertFalse(engine.queued_transitions)

    def test_load_hints_persist_and_old_stores_work(self):
        engine=Stub(); now=time.time()
        engine._record_level_hint('sensor.airco','L1',now-90)
        saved=engine._serialize_level_hints()
        fresh=Stub()
        fresh.level_hints=fresh._deserialize_level_hints(saved)
        self.assertEqual(list(fresh.level_hints['sensor.airco'])[0][0],'L1')
        self.assertEqual(fresh._deserialize_level_hints(None),{})
        self.assertEqual(fresh._deserialize_level_hints({'bad':[{'phase':'L1','timestamp':now}]}),{})

    def test_old_step_does_not_get_counted_twice(self):
        engine=Stub(); now=time.monotonic()
        first=engine._record_slow_vote('sensor.airco','L1',1,now-50,.8)
        second=engine._record_slow_vote('sensor.airco','L1',1,now-50,.8)
        self.assertIsNone(second)
        self.assertEqual(len(first),1)
        self.assertEqual(engine.diagnostics['slow_duplicate_step'],1)

    def test_lagged_repeated_on_off_pattern_l1_only(self):
        """Slow LG-style reports lag real measured phase transitions by ~2m."""
        engine=Stub()
        end=1760
        on_periods=((240,480),(840,1080),(1440,1620))
        def is_on(t): return any(a<=t<=b for a,b in on_periods)
        engine.history={
            'L1':deque(((t,200 + (950 if is_on(t) else 0)) for t in range(end+1)),maxlen=1800),
            'L2':deque(((t,30) for t in range(end+1)),maxlen=1800),
            'L3':deque(((t,203) for t in range(end+1)),maxlen=1800),
        }
        reports = [(physical+120, (1000 if is_on(physical) else 50)) for physical in
                   (330,420,580,680,930,1020,1190,1290,1530)]
        engine.device_reports['sensor.airco']=deque(reports,maxlen=100)
        result=engine._match_slow_profile('sensor.airco')
        self.assertIsNotNone(result)
        self.assertEqual(result[0],'L1')
        self.assertGreaterEqual(result[2],0)
        self.assertLessEqual(result[2],210)
        self.assertEqual(engine.results,{})

    def test_profile_never_accepts_static_unrelated_high_load(self):
        engine=Stub()
        engine.history={
            'L1':deque(((t,1400) for t in range(1750)),maxlen=1800),
            'L2':deque(((t,30) for t in range(1750)),maxlen=1800),
            'L3':deque(((t,203) for t in range(1750)),maxlen=1800),
        }
        engine.device_reports['sensor.airco']=deque(
            [(300,50),(500,1000),(700,1000),(900,50),(1100,50),(1300,1000),(1500,50)],maxlen=100)
        self.assertIsNone(engine._match_slow_profile('sensor.airco'))

    def test_slow_ramp_can_match_net_on_off_profile(self):
        engine=Stub(); report=240
        engine.history={p:deque(maxlen=1800) for p in ('L1','L2','L3')}
        for t in range(0,report+1):
            ramp=max(0,min(900,(t-130)*15))
            engine.history['L1'].append((t,ramp))
            engine.history['L2'].append((t,30))
            engine.history['L3'].append((t,100))
        now=time.time()
        # The real matcher calls _record_slow_vote with monotonic event times.
        # For this test use a stub that records the phase selected.
        picked=[]
        engine._record_slow_vote=lambda entity,phase,direction,stamp,weight: picked.append((phase,direction)) or deque([(phase,direction,now,.8)])
        engine._accept_match=lambda *args: self.fail('One transition must never confirm')
        asyncio.run(engine._evaluate_slow('sensor.airco',900,report,110))
        self.assertEqual(picked,[('L1',1)])
        self.assertEqual(engine.diagnostics['slow_on_off_pattern'],1)

if __name__ == '__main__': unittest.main()
