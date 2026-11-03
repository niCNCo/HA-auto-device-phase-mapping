"""Regression tests for tentative delayed-sensor matches surviving HA restarts.

Compile the production methods with lightweight HA-independent dependencies so
these tests can run in GitHub Actions without installing Home Assistant.
"""
import ast
import asyncio
from collections import Counter, deque
from copy import deepcopy
import math
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / 'custom_components/ha_auto_device_phase_mapping/engine.py'
SOURCE = PATH.read_text()
TREE = ast.parse(SOURCE)
ENGINE = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == 'PhaseEngine')

class Clock:
    now = 1_700_000_000.0
    mono = 140.0
    def time(self): return self.now
    def monotonic(self): return self.mono

clock = Clock()
METHODS = {'_deserialize_slow_votes', '_serialize_slow_votes', '_prune_slow_votes', '_record_slow_vote',
           '_evaluate_slow', 'save', '_on_hass_stopping',
           '_deserialize_level_hints', '_serialize_level_hints'}
method_nodes = [node for node in ENGINE.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                and node.name in METHODS]
klass = ast.ClassDef(name='ProductionMethods', bases=[], keywords=[], body=method_nodes, decorator_list=[])
ns = {'time': clock, 'asyncio': asyncio, 'deque': deque, 'math': math, 'deepcopy': deepcopy, 'PHASES': ('L1','L2','L3'),
      'SLOW_VOTE_MAX_AGE_SECONDS': 14*86400, 'SLOW_VOTE_MAX_DEVICES': 500,
      'SLOW_VOTE_MAX_PER_DEVICE': 12, 'LEVEL_HINT_MAX_PER_DEVICE': 12, '_LOGGER': None}
exec(compile(ast.fix_missing_locations(ast.Module(body=[klass], type_ignores=[])), str(PATH), 'exec'), ns)

class InMemoryStore:
    def __init__(self): self.saved = None
    async def async_save(self, data): self.saved = deepcopy(data)

class Engine(ns['ProductionMethods']):
    def __init__(self, store=None):
        self._store = store or InMemoryStore()
        self.slow_votes = {}
        self.level_hints = {}
        self._dirty = False
        self._last_save = 0
        self.settings = {'learning_enabled':True,'excluded':[]}
        self.results = {}
        self.pending = {}
        self.history = {p: deque(maxlen=1800) for p in ('L1','L2','L3')}
        self.logs = []
        self.accepted = []
        self.notifications = 0
    def _diag(self, *args): self.logs.append(args)
    def _accept_match(self, *args):
        self.accepted.append(args)
        entity_id, phase, weight, _change, _mode = args
        self.results.setdefault(entity_id, {'events':0})['events'] += 1
        self._dirty = True
    def _notify(self): self.notifications += 1

async def step(engine, timestamp, direction):
    """L2 transitions; airco reports 30 seconds after each electrical step."""
    before = 0 if direction > 0 else 900
    after = 900 if direction > 0 else 0
    engine.history = {
        'L1': deque(((t, 0) for t in range(timestamp-40, timestamp+41)), maxlen=1800),
        'L2': deque(((t, before if t < timestamp else after)
                     for t in range(timestamp-40, timestamp+41)), maxlen=1800),
        'L3': deque(((t, 0) for t in range(timestamp-40, timestamp+41)), maxlen=1800),
    }
    clock.mono = timestamp + 40.0
    clock.now = 1_700_000_000.0 + timestamp
    await engine._evaluate_slow('sensor.livingroom', 900 * direction,
                                timestamp + 30, timestamp - 20)

class SlowVotePersistenceTests(unittest.TestCase):
    def setUp(self):
        clock.now, clock.mono = 1_700_000_000., 140.

    def test_two_tentative_votes_survive_restart_and_confirm_on_third(self):
        store = InMemoryStore()
        first = Engine(store)
        asyncio.run(step(first, 100, +1))
        asyncio.run(step(first, 200, -1))
        self.assertEqual(len(first.slow_votes['sensor.livingroom']), 2)
        self.assertFalse(first.accepted)
        asyncio.run(first.save())
        saved = store.saved
        self.assertEqual(len(saved['slow_votes']['sensor.livingroom']), 2)
        self.assertEqual(saved['results'], {})
        self.assertEqual(len(saved['slow_votes']['sensor.livingroom'][0]), 4)

        # A new Python process has a different monotonic clock origin. A
        # production vote's Unix timestamp remains valid across this reboot.
        restarted = Engine(store)
        restarted.slow_votes = restarted._deserialize_slow_votes(saved['slow_votes'], now_epoch=clock.now)
        self.assertEqual(len(restarted.slow_votes['sensor.livingroom']), 2)
        asyncio.run(step(restarted, 300, +1))
        self.assertEqual(len(restarted.accepted), 1, restarted.logs)
        self.assertEqual(restarted.accepted[0][1], 'L2')
        self.assertEqual(restarted.results['sensor.livingroom']['events'], 1)
        asyncio.run(restarted.save())
        self.assertEqual(len(store.saved['slow_votes']['sensor.livingroom']), 3)

    def test_clean_shutdown_forces_checkpoint(self):
        engine = Engine()
        clock.mono = 120
        engine._record_slow_vote('sensor.airco', 'L2', +1, 100, .9)
        self.assertTrue(engine._dirty)
        asyncio.run(engine._on_hass_stopping(None))
        self.assertEqual(len(engine._store.saved['slow_votes']['sensor.airco']), 1)

    def test_vote_added_during_async_save_is_not_lost(self):
        engine = Engine()
        class YieldingStore:
            async def async_save(self, data):
                self.saved = deepcopy(data)
                engine._record_slow_vote('sensor.new', 'L1', 1, clock.mono - 1, .8)
        engine._store = YieldingStore()
        asyncio.run(engine.save())
        self.assertTrue(engine._dirty, 'A new tentative vote during storage I/O must remain pending')
        self.assertNotIn('sensor.new', engine._store.saved['slow_votes'])

    def test_legacy_storage_is_backward_compatible(self):
        engine = Engine()
        self.assertEqual(engine._deserialize_slow_votes(None), {})
        self.assertEqual(engine._deserialize_slow_votes({}), {})

    def test_corrupt_future_expired_and_invalid_votes_are_rejected(self):
        engine=Engine()
        clock.now = 1_700_000_000.
        bad = {
            'sensor.valid': [
                {'phase':'L1','direction':1,'timestamp':clock.now-100,'weight':.6},
                {'phase':'L3','direction':1,'timestamp':clock.now-15*86400,'weight':.6},
                {'phase':'L2','direction':1,'timestamp':clock.now+1000,'weight':.6},
                {'phase':'L4','direction':1,'timestamp':clock.now-100,'weight':.6},
                {'phase':'L2','direction':0,'timestamp':clock.now-100,'weight':.6},
                {'phase':'L2','direction':1,'timestamp':12.5,'weight':.6},
                {'phase':'L2','direction':1,'timestamp':clock.now-100,'weight':float('nan')},
            ],
            'not_an_entity': [{'phase':'L1','direction':1,'timestamp':clock.now-10,'weight':.5}],
        }
        restored=engine._deserialize_slow_votes(bad)
        self.assertEqual(len(restored['sensor.valid']), 1)
        self.assertNotIn('not_an_entity', restored)

    def test_expired_votes_are_pruned_during_operation(self):
        engine = Engine()
        engine.slow_votes['sensor.old'] = deque([('L2', 1, clock.now - 15*86400, .8)], maxlen=12)
        self.assertTrue(engine._prune_slow_votes())
        self.assertEqual(engine.slow_votes, {})
        self.assertTrue(engine._dirty)
        self.assertFalse(engine._prune_slow_votes())

    def test_votes_are_bounded_and_expire_before_save(self):
        engine = Engine()
        clock.mono = 140
        for index in range(18):
            clock.now += 30
            clock.mono += 30
            engine._record_slow_vote('sensor.airco','L1', 1 if index%2 else -1,clock.mono-3,.5)
        self.assertEqual(len(engine.slow_votes['sensor.airco']), 12)
        saved = engine._serialize_slow_votes()
        self.assertEqual(len(saved['sensor.airco']), 12)
        clock.now += 15*86400
        self.assertEqual(engine._serialize_slow_votes(), {})

    def test_measurement_model_change_and_reset_clear_tentative_votes(self):
        self.assertIn('if measurement_changed:', SOURCE)
        self.assertIn('self.slow_votes.clear()', SOURCE)
        self.assertIn('"slow_votes": self._serialize_slow_votes()', SOURCE)
        self.assertIn('deque(maxlen=1800)', SOURCE)
        self.assertIn('EVENT_HOMEASSISTANT_STOP', SOURCE)

if __name__ == '__main__': unittest.main()
