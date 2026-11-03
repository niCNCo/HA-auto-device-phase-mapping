"""v1.6.0: protect queue ownership and recognize staged high-power pulses.

These tests exercise the production AST methods with synthetic power readings.
No personal HA export, secrets or private household snapshots are included.
"""
import asyncio
from collections import deque
from types import SimpleNamespace
import time
import unittest

from test_1511_fast_timeline import TestFastTimeline1511 as TimelineBaseTests

COFFEE = 'sensor.coffee'


class WorkerAndEpisode160(unittest.TestCase):
    def build(self, phases=None):
        # Synthetic 3 -> 664 -> 1421 W coffee pulse; 3 independent L1 rises.
        # L2/L3 remain stable; no device name enters the algorithm.
        edges = [(42, 1450), (56,-1450), (67,1450), (83,-1450), (106,1450), (125,-1450)]
        competing = [(42,1450), (56,-1450), (67,1450), (83,-1450), (106,1450), (125,-1450)] if phases == 'ambiguous' else None
        engine, origin = TimelineBaseTests.build(edges, competing=competing)
        engine.sensor_refresh_intervals = {}
        engine.sensor_refresh_intervals[COFFEE] = deque([5,5,5,5])
        engine.settings['timing_overrides'] = {}
        engine.settings['tolerance_ratio'] = .30
        reports = [(35, 3), (40,664),(45,1421),(56,4),
                   (65,3),(66,1092),(71,1388),(83,3),
                   (104,3),(106,1400),(125,3)]
        engine.device_reports[COFFEE] = deque([(origin+t,v) for t,v in reports],maxlen=100)
        engine.hass = SimpleNamespace(async_create_task=asyncio.create_task)
        return engine, origin

    def test_coffee_staged_on_net_rise_matches_only_l1(self):
        engine, origin = self.build()
        self.assertEqual(engine._fast_episode_change(COFFEE,661,origin+40,3),1418)
        # Only the first 664-W report is a partial device rise, but the P1
        # sees the full heating element. The engine may credit the net pulse.
        async def run():
            await engine._evaluate_fast_timeline(COFFEE,661,origin+40,3)
        asyncio.run(run())
        self.assertEqual(engine.results[COFFEE]['events'],1)
        self.assertEqual(engine.results[COFFEE]['phase'],'Unknown')
        self.assertGreaterEqual(engine.diagnostics['fast_episode_match'],1)
        self.assertEqual(engine.results[COFFEE]['accepted_edges'][0]['phase'],'L1')
        self.assertGreaterEqual(engine.results[COFFEE]['accepted_edges'][0]['power_w'],1300)

    def test_composite_preferred_to_weak_partial_raw_match(self):
        engine, origin = self.build()
        # P1 sees +1450 W; a sensor first reports +1088 W, later +1384 W.
        # The partial value might loosely match but should NOT be credited
        # at low confidence when the full episode matches tightly.
        reports=engine.device_reports[COFFEE]
        reports.extend([(origin+65,4), (origin+66,1092), (origin+71,1388)])
        asyncio.run(engine._evaluate_fast_timeline(COFFEE,1088,origin+66,4))
        self.assertEqual(engine.results[COFFEE]['events'],1)
        edge=engine.results[COFFEE]['accepted_edges'][0]
        self.assertEqual(edge['phase'],'L1')
        self.assertAlmostEqual(edge['power_w'],1384,delta=1)
        self.assertGreater(engine.results[COFFEE]['scores']['L1'],.7)

    def test_ambiguous_phase_never_credits_aggregate(self):
        engine, origin = self.build('ambiguous')
        asyncio.run(engine._evaluate_fast_timeline(COFFEE,661,origin+40,3))
        self.assertNotIn(COFFEE,engine.results)

    def test_worker_drains_44_transitions_without_overflow_or_stuck_pending(self):
        async def run():
            engine, origin = self.build()
            # Starts processing a real first transition; enqueue 43 updates
            # while it is pending. They must all be evaluated and cleared.
            self.assertTrue(engine._start_transition(COFFEE,(661,origin+40,origin+35,3)))
            waiting=engine.queued_transitions.setdefault(COFFEE,deque(maxlen=64))
            for i in range(43):
                waiting.append((70 if i%2 else -70,origin+46+i*.12,origin+45+i*.12,100))
            await asyncio.sleep(.15)
            self.assertEqual(engine.diagnostics['evaluations_started'],44)
            self.assertEqual(engine.diagnostics['evaluations_completed'],44)
            self.assertEqual(engine.diagnostics['queue_full'],0)
            self.assertEqual(engine.queued_transitions, {})
            self.assertEqual(engine.pending,{})
            self.assertEqual(engine.pending_since,{})
        asyncio.run(run())

    def test_eager_start_simulation_does_not_strand_queue(self):
        async def run():
            engine, origin = self.build()
            def eager(coro):
                # Simulate Home Assistant running the coroutine to its first
                # suspension before returning the task to the caller.
                coro.send(None)
                return asyncio.create_task(coro)
            engine.hass = SimpleNamespace(async_create_task=eager)
            self.assertTrue(engine._start_transition(COFFEE,(661,origin+40,origin+35,3)))
            engine.queued_transitions[COFFEE] = deque([(757,origin+45,origin+40,664)],maxlen=64)
            await asyncio.sleep(.06)
            self.assertEqual(engine.diagnostics['evaluations_started'],2)
            self.assertFalse(engine.pending)
            self.assertFalse(engine.queued_transitions)
        asyncio.run(run())

    def test_two_on_off_heating_cycles_can_auto_map(self):
        async def run():
            engine, origin = self.build()
            self.assertTrue(engine._start_transition(COFFEE,(661,origin+40,origin+35,3)))
            events=[(757,45,40,664),(-1417,56,45,1421),
                    (1089,66,65,3),(296,71,66,1092),(-1385,83,71,1388),
                    (1397,106,104,3),(-1397,125,106,1400)]
            engine.queued_transitions[COFFEE] = deque(
                [(change,origin+t,origin+prev,old) for change,t,prev,old in events],maxlen=64)
            await asyncio.sleep(.12)
            result=engine.results[COFFEE]
            self.assertEqual(result['phase'],'L1')
            self.assertGreaterEqual(result['events'],3)
            self.assertFalse(engine.pending)
            self.assertFalse(engine.queued_transitions)
        asyncio.run(run())

    def test_cancelling_a_worker_does_not_erase_other_devices(self):
        async def run():
            engine, origin = self.build()
            engine.results['sensor.other']={'events':4,'phase':'L2','confidence':90}
            # A future report intentionally leaves the worker sleeping.
            timestamp=time.monotonic()+5
            self.assertTrue(engine._start_transition(COFFEE,(1000,timestamp,timestamp-5,0)))
            owner=engine.pending.pop(COFFEE)
            engine.queued_transitions.pop(COFFEE, None)
            engine.pending_since.pop(COFFEE, None)
            engine.pending_last_progress.pop(COFFEE, None)
            owner.cancel()
            await asyncio.gather(owner,return_exceptions=True)
            self.assertFalse(engine.pending)
            self.assertEqual(engine.results['sensor.other']['events'],4)
        asyncio.run(run())

    def test_completed_worker_backstop_can_recover_abandoned_queue(self):
        async def run():
            engine, origin = self.build()
            async def done(): return None
            finished = asyncio.create_task(done());await finished
            engine.pending[COFFEE] = finished
            engine.queued_transitions[COFFEE] = deque([(661,origin+40,origin+35,3)],maxlen=64)
            engine._worker_finished(COFFEE, finished)
            await asyncio.sleep(.07)
            self.assertGreaterEqual(engine.diagnostics['evaluations_started'],1)
            self.assertFalse(engine.pending)
            self.assertFalse(engine.queued_transitions)
        asyncio.run(run())

if __name__=='__main__':unittest.main()
