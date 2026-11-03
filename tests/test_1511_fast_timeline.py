"""v1.5.11: 5-second fast-device power changes align to P1 on either side.

Production methods are exercised with actual phase history (not mocked match
results). This catches the former baseline/queue timing failures.
"""
import ast
import asyncio
from collections import deque
from datetime import datetime, timezone
import importlib.util
import time
import unittest

from test_155_learning import Base, ns, PATH, ENGINE

spec = importlib.util.spec_from_file_location('pure_correlation1511', PATH.with_name('correlation.py'))
cor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cor)
ns['classify'] = cor.classify
ns['WORKER_STALL_SECONDS'] = 45
ns['dt_util'] = type('Clock', (), {'utcnow': staticmethod(lambda: datetime.now(timezone.utc))})()
ns['_LOGGER'] = type('Logger', (), {'exception': staticmethod(lambda *args: None)})()
for method in ENGINE.body:
    if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)) and method.name in {
        '_match_fast_timeline', '_fast_edge_seen', '_evaluate_fast_timeline',
        '_start_transition', '_queue_transition', '_drain_next', '_watchdog_workers', '_cancel_pending', '_accept_match',
        '_transition_is_slow', '_run_transition_worker', '_worker_finished', '_fast_episode_change',
    }:
        exec(compile(ast.fix_missing_locations(ast.Module(body=[method], type_ignores=[])), str(PATH), 'exec'), ns)
        setattr(Base, method.name, ns[method.name])


class TestFastTimeline1511(unittest.TestCase):
    @staticmethod
    def build(edges, competing=None, phase='L1'):
        engine = Base()
        engine.settings['minimum_change_w'] = 50
        engine.settings['tolerance_ratio'] = .30
        engine.settings['window_seconds'] = 4.0
        origin = time.monotonic() - 260
        phases = {p: deque(maxlen=1800) for p in ('L1', 'L2', 'L3')}
        def level(t, steps):
            return sum(diff for when, diff in steps if t >= when)
        for t in range(0, 240):
            for p in phases:
                watts = {'L1':530.0,'L2':100.0,'L3':70.0}[p]
                if p == phase:
                    watts += level(t, edges)
                if competing and p == 'L2':
                    watts += level(t, competing)
                phases[p].append((origin+t, watts))
        engine.history = phases
        return engine, origin

    def test_p1_edge_five_seconds_before_coffee_sensor_report(self):
        engine, origin = self.build([(50,1080)])
        result = engine._match_fast_timeline(1080, origin+55, origin+67)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'L1')
        self.assertGreater(result[1], .7)
        self.assertAlmostEqual(result[3], 1080, delta=50)

    def test_p1_edge_five_seconds_after_coffee_sensor_report(self):
        engine, origin = self.build([(60,1050)])
        result = engine._match_fast_timeline(1050, origin+55, origin+67)
        self.assertEqual(result[0], 'L1')

    def test_short_eight_second_coffee_heating_pulse(self):
        engine, origin = self.build([(50,1100), (58,-1100)])
        result = engine._match_fast_timeline(1100, origin+53, origin+65)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'L1')
        self.assertGreaterEqual(result[1], .75)

    def test_two_independent_coffee_pulses_map_automatically(self):
        engine, origin = self.build([(35,1050), (75,-1050), (115,1080), (155,-1080)])
        for t,change in [(40,1050),(80,-1050),(120,1080),(160,-1080)]:
            asyncio.run(engine._evaluate_fast_timeline('sensor.coffee', change, origin+t))
        result = engine.results.get('sensor.coffee')
        self.assertIsNotNone(result)
        self.assertEqual(result['phase'],'L1')
        self.assertGreaterEqual(result['events'],2)
        self.assertGreaterEqual(engine.diagnostics['fast_timeline_match'],2)
        self.assertEqual(result['scores']['L2'],0)
        self.assertEqual(result['scores']['L3'],0)

    def test_replayed_same_p1_edge_cannot_inflate_confidence(self):
        engine, origin = self.build([(50,1000)])
        asyncio.run(engine._evaluate_fast_timeline('sensor.coffee',1000,origin+55))
        self.assertEqual(engine.results['sensor.coffee']['events'],1)
        asyncio.run(engine._evaluate_fast_timeline('sensor.coffee',1000,origin+57))
        self.assertEqual(engine.results['sensor.coffee']['events'],1)
        self.assertEqual(engine.diagnostics['fast_timeline_duplicate'],1)

    def test_competing_phase_has_same_electrical_step(self):
        engine, origin = self.build([(50,1000)], competing=[(50,1000)])
        self.assertIsNone(engine._match_fast_timeline(1000, origin+55, origin+67))

    def test_unrelated_static_phase_is_not_evidence(self):
        engine, origin = self.build([])
        self.assertIsNone(engine._match_fast_timeline(1000, origin+55, origin+67))

    def test_queued_fast_does_not_redirect_to_slow_matcher(self):
        engine, origin = self.build([(50,1050)])
        engine.sensor_cadence['sensor.coffee'] = deque([5.,5.,5.])
        engine.sensor_refresh_intervals = {'sensor.coffee':deque([5.,5.,5.])}
        created = []
        class FakeHass:
            def async_create_task(self, task):
                created.append(task)
                return task
        engine.hass = FakeHass()
        self.assertTrue(engine._start_transition('sensor.coffee',(1050,origin+55,origin+50,0),queued=True))
        self.assertEqual(engine.device_diagnostics.get('sensor.coffee'),None) if hasattr(engine,'device_diagnostics') else None
        self.assertEqual(len(created),1)
        self.assertEqual(created[0].cr_code.co_name,'_run_transition_worker')
        self.assertFalse(engine._transition_is_slow('sensor.coffee'))
        created[0].close()

    def test_five_second_reports_override_hours_between_device_changes(self):
        engine, origin = self.build([(50,1050)])
        # Long time between physical ON/OFF events is NOT a slow sensor.
        engine.sensor_cadence['sensor.coffee'] = deque([600., 900., 1200.])
        engine.sensor_refresh_intervals = {'sensor.coffee':deque([5.,5.,5.])}
        created = []
        class FakeHass:
            def async_create_task(self, task):
                created.append(task)
                return task
        engine.hass = FakeHass()
        self.assertTrue(engine._start_transition('sensor.coffee',(1050,origin+55,origin+50,0)))
        self.assertEqual(created[0].cr_code.co_name,'_run_transition_worker')
        self.assertFalse(engine._transition_is_slow('sensor.coffee'))
        created[0].close()

    def test_manual_slow_override_still_takes_precedence(self):
        engine, origin = self.build([(50,1050)])
        engine.sensor_refresh_intervals = {'sensor.coffee':deque([5.,5.,5.])}
        engine.sensor_cadence['sensor.coffee'] = deque([600.,900.])
        engine.settings['timing_overrides']['sensor.coffee']='slow'
        created=[]
        class FakeHass:
            def async_create_task(self, task):
                created.append(task)
                return task
        engine.hass=FakeHass()
        self.assertTrue(engine._start_transition('sensor.coffee',(1050,origin+55,origin+50,0)))
        self.assertEqual(created[0].cr_code.co_name,'_run_transition_worker')
        self.assertTrue(engine._transition_is_slow('sensor.coffee'))
        created[0].close()

    def test_moderate_120w_fast_transition_matches(self):
        engine,origin=self.build([(50,118)])
        match=engine._match_fast_timeline(115,origin+55,origin+67)
        self.assertIsNotNone(match)
        self.assertEqual(match[0],'L1')

if __name__ == '__main__':
    unittest.main()
