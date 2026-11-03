"""v1.5.4: real engine methods, synthetic delayed Zigbee and high-power signals."""
import ast
import asyncio
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
import time
import unittest

from test_1410_learning import Stub as Base, ns, PATH, TREE, ENGINE, Event

METHODS = {'_match_delayed_step', '_promote_slow_votes', '_accept_match'}
for method in ENGINE.body:
    if isinstance(method, ast.FunctionDef) and method.name in METHODS:
        code = compile(ast.fix_missing_locations(ast.Module(body=[method], type_ignores=[])), str(PATH), 'exec')
        exec(code, ns)
        setattr(Base, method.name, ns[method.name])

class Clock:
    @staticmethod
    def utcnow():
        return datetime.now(timezone.utc)
ns['dt_util'] = Clock()

class TestLearning154(unittest.TestCase):
    def new(self, events, base=None):
        engine = Base()
        engine.sensor_refresh_intervals = {'sensor.bed':deque([60, 60, 60])}
        engine.settings['tolerance_ratio']=.30
        base=time.monotonic()-900 if base is None else base
        states={'L1':[], 'L2':[], 'L3':[]}
        for t in range(0,820):
            power=sum(delta for when,delta in events if when <= t)
            for p in ('L1','L2','L3'):
                states[p].append((base+t, power if p=='L3' else 25.0))
        engine.history = {p:deque(samples,maxlen=1800) for p,samples in states.items()}
        return engine,base

    def test_100w_delayed_zigbee_on_and_off_in_correct_phase(self):
        engine,base=self.new([(30,110),(140,-110),(250,110),(360,-110),(470,110)])
        for t,change in [(30,110),(140,-110),(250,110),(360,-110),(470,110)]:
            asyncio.run(engine._evaluate_slow('sensor.bed',change,base+t+50,base+t-14))
        self.assertGreaterEqual(len(engine.slow_votes.get('sensor.bed', ())),5)
        outcome=engine.results['sensor.bed']
        self.assertEqual(outcome['phase'],'L3')
        self.assertGreaterEqual(outcome['events'],5)
        self.assertGreaterEqual(outcome['confidence'],60)
        self.assertEqual(outcome['scores']['L1'],0)

    def test_duplicate_delayed_vote_cannot_add_more_accepted_evidence(self):
        engine,base=self.new([(30,105),(140,-105),(250,105),(360,-105),(470,105)])
        for t,change in [(30,105),(140,-105),(250,105),(360,-105),(470,105)]:
            asyncio.run(engine._evaluate_slow('sensor.bed',change,base+t+50,base+t-14))
        events=engine.results['sensor.bed']['events']
        # Two separate HA changes accidentally matched to the same P1 step.
        asyncio.run(engine._evaluate_slow('sensor.bed',105,base+520,base+455))
        self.assertEqual(engine.results['sensor.bed']['events'],events)

    def test_small_phase_step_competing_other_phase_is_rejected(self):
        engine,base=self.new([(30,110)])
        for t in range(len(engine.history['L1'])):
            stamp,_=engine.history['L1'][t]
            engine.history['L1'][t]=(stamp,110 if t>=30 else 0)
        self.assertIsNone(engine._match_delayed_step(110,base+10,base+80))

    def test_multiple_matching_steps_one_reporting_interval_is_ambiguous(self):
        engine,base=self.new([(30,110),(90,-110),(150,110)])
        self.assertIsNone(engine._match_delayed_step(110,base+10,base+180))

    def test_high_power_two_distinct_clean_on_off_can_map(self):
        engine,_=self.new([])
        t=time.time()
        engine._accept_match('sensor.peblar','L1',.93,3600,'fast',t-90)
        self.assertEqual(engine.results['sensor.peblar']['phase'],'Unknown')
        engine._accept_match('sensor.peblar','L1',.95,-3600,'fast',t)
        self.assertEqual(engine.results['sensor.peblar']['phase'],'L1')
        self.assertGreaterEqual(engine.results['sensor.peblar']['confidence'],60)

    def test_large_ev_charger_moderate_quality_opposite_edges(self):
        # Even if a 3.6 kW charging step is imperfectly matched because of
        # concurrent house loads, two accepted unique phase correlations
        # with opposite directions provide strong independent evidence.
        engine,_=self.new([])
        now=time.time()
        engine._accept_match('sensor.peblar','L1',.41,3600,'fast',now-150)
        self.assertEqual(engine.results['sensor.peblar']['phase'],'Unknown')
        engine._accept_match('sensor.peblar','L1',.39,-3600,'fast',now)
        self.assertEqual(engine.results['sensor.peblar']['phase'],'L1')
        self.assertGreaterEqual(engine.results['sensor.peblar']['confidence'],60)

    def test_high_power_one_sided_or_conflicting_stays_unconfirmed(self):
        engine,_=self.new([])
        now=time.time()
        for i in range(4):
            engine._accept_match('sensor.peblar','L1',.90,3600,'fast',now-200+40*i)
        self.assertEqual(engine.results['sensor.peblar']['phase'],'Unknown')
        engine._accept_match('sensor.peblar','L2',.90,-3600,'fast',now)
        self.assertEqual(engine.results['sensor.peblar']['phase'],'Unknown')

    def test_low_power_standby_toggle_is_detected_below_min_setting(self):
        engine,_=self.new([])
        engine.snapshots['sensor.bed']=(5, time.monotonic()-61)
        engine._consider_level_hint=lambda *a: None
        seen=[]
        engine._start_transition=lambda eid,transition: seen.append(transition) or True
        engine._on_state(Event('sensor.bed',92))
        self.assertEqual(len(seen),1)
        self.assertEqual(seen[0][0],87)
        # Rounding fluctuations near standby should never start a transition.
        engine._on_state(Event('sensor.bed',97))
        self.assertEqual(len(seen),1)

    def test_sparse_low_power_wakes_do_not_count_as_mapping(self):
        engine,_=self.new([])
        engine._accept_match('sensor.small','L1',.98,110,'fast')
        self.assertEqual(engine.results['sensor.small']['phase'],'Unknown')

if __name__=='__main__':unittest.main()
