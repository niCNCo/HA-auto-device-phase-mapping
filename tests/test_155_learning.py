"""v1.5.5: averaged delayed power patterns, faster scores and ambiguity veto."""
import ast
from collections import deque
import math
from pathlib import Path
import time
import unittest

from test_154_learning import Base, ns, PATH, ENGINE

for method in ENGINE.body:
    if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)) and method.name in {
        '_match_statistical_profile', '_apply_statistical_profile', '_recalculate_result',
        '_promote_slow_votes', '_accept_match',
    }:
        code = compile(ast.fix_missing_locations(ast.Module(body=[method], type_ignores=[])), str(PATH), 'exec')
        exec(code, ns)
        setattr(Base, method.name, ns[method.name])


class TestLearning155(unittest.TestCase):
    def build(self, mirrored=False, stationary=False):
        engine = Base()
        engine.settings['minimum_change_w'] = 50
        engine.settings['tolerance_ratio'] = 0.30
        base = time.monotonic() - 600
        # Two or three full, slow, gentle ramping cycles (no sudden >50 W step).
        # Reports arrive ~25 s after each ramp has completed.
        transitions = [(55,110),(165,-110),(275,120),(385,-120)]
        def level(t):
            result=0.0
            for when,diff in transitions:
                if t > when:
                    result += diff * min(1.0, (t-when)/25)
            return result
        for phase in ('L1','L2','L3'):
            values=[]
            for t in range(510):
                if phase == 'L3':
                    watts = 35+level(t)
                elif phase == 'L1' and mirrored:
                    watts = 110+level(t)
                elif phase == 'L2' and stationary:
                    watts = 110
                else:
                    watts = 110 if phase == 'L2' else 35
                values.append((base+t, watts))
            engine.history[phase] = deque(values,maxlen=1800)
        levels = [(0,0),(100,110),(210,0),(320,120),(430,0)]
        engine.device_reports['sensor.bed'] = deque([(base+t,w) for t,w in levels],maxlen=100)
        return engine

    def test_averaged_ramps_map_after_two_opposite_events(self):
        engine = self.build()
        match = engine._match_statistical_profile('sensor.bed')
        self.assertIsNotNone(match)
        self.assertEqual(match[0], 'L3')
        self.assertGreaterEqual(len(match[1]), 2)
        self.assertTrue(engine._apply_statistical_profile('sensor.bed',-120))
        self.assertEqual(engine.results['sensor.bed']['phase'], 'L3')
        self.assertGreaterEqual(engine.results['sensor.bed']['confidence'], 55)
        self.assertGreaterEqual(engine.results['sensor.bed']['events'], 2)
        count=engine.results['sensor.bed']['events']
        self.assertFalse(engine._apply_statistical_profile('sensor.bed',-120))
        self.assertEqual(engine.results['sensor.bed']['events'],count)

    def test_matching_static_average_is_not_correlation(self):
        engine = self.build(stationary=True)
        match = engine._match_statistical_profile('sensor.bed')
        self.assertEqual(match[0], 'L3')

    def test_ambiguous_competing_phase_is_rejected(self):
        engine = self.build(mirrored=True)
        self.assertIsNone(engine._match_statistical_profile('sensor.bed'))
        self.assertFalse(engine._apply_statistical_profile('sensor.bed',100))
        self.assertEqual(engine.results,{})

    def test_recalculate_existing_peblar_score_on_upgrade(self):
        engine = self.build()
        old={'events':5,'scores':{'L1':2.045,'L2':0,'L3':0,'3-phase':0},
             'phase':'Unknown','confidence':40.0}
        engine._recalculate_result(old)
        self.assertEqual(old['phase'],'L1')
        self.assertGreaterEqual(old['confidence'],60)

    def test_conflicting_old_bed_votes_remain_unmapped(self):
        engine = self.build()
        old={'events':3,'scores':{'L1':.455,'L2':.793,'L3':.807,'3-phase':0},
             'phase':'Unknown','confidence':7.2}
        engine._recalculate_result(old)
        self.assertEqual(old['phase'],'Unknown')
        self.assertLess(old['confidence'],55)

    def test_two_fast_small_opposite_edges_can_map(self):
        engine = self.build()
        t=time.time()
        engine._accept_match('sensor.bed','L3',.93,95,'fast',t-80)
        self.assertEqual(engine.results['sensor.bed']['phase'],'Unknown')
        engine._accept_match('sensor.bed','L3',.92,-95,'fast',t)
        self.assertEqual(engine.results['sensor.bed']['phase'],'L3')

if __name__ == '__main__':
    unittest.main()
