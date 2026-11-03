"""v1.6.1: reproduce and recover live queue-without-worker failures.

These test production engine methods using the existing offline harness; there is
no dependency on anyone's private HA diagnostic export or its timestamps.
"""
import asyncio
from collections import deque
from types import SimpleNamespace
import time
import unittest

from test_160_worker_and_episodes import WorkerAndEpisode160, COFFEE
from test_1511_fast_timeline import TestFastTimeline1511


class Watchdog161(unittest.TestCase):
    def new(self):
        e, origin = WorkerAndEpisode160().build()
        return e, origin

    def test_orphan_queue_without_worker_is_processed_by_watchdog(self):
        async def run():
            e, origin = self.new()
            # Exact failure in the dashboard: waiting transitions but zero active workers.
            e.queued_transitions[COFFEE] = deque([
                (661,origin+40,origin+35,3),
                (757,origin+45,origin+40,664),
                (-1417,origin+56,origin+45,1421),
            ], maxlen=96)
            self.assertEqual(len(e.pending),0)
            e._watchdog_workers()
            await asyncio.sleep(.12)
            self.assertEqual(e.diagnostics['evaluations_completed'],3)
            self.assertEqual(e.diagnostics['queue_full'],0)
            self.assertGreaterEqual(e.diagnostics['watchdog_orphan_queue'],1)
            self.assertFalse(e.queued_transitions)
            self.assertFalse(e.pending)
        asyncio.run(run())

    def test_cancelled_worker_recovers_its_inflight_step_and_fifo(self):
        async def run():
            e, origin=self.new()
            now=time.monotonic()
            # Future timestamp means the real fast timeline matcher is waiting.
            e._start_transition(COFFEE,(661,now+9,now+4,3))
            e.queued_transitions[COFFEE]=deque([(757,origin+45,origin+40,664)],maxlen=96)
            owner=e.pending[COFFEE]
            await asyncio.sleep(.01)
            self.assertEqual(e.diagnostics['evaluations_started'],1)
            owner.cancel()
            await asyncio.sleep(.04)
            # Awaiting cancelled task requeued itself; it is not lost.
            self.assertGreaterEqual(e.diagnostics['worker_transition_requeued'],1)
            self.assertTrue(COFFEE in e.pending or COFFEE in e.queued_transitions)
            e._cancel_pending()
            await asyncio.sleep(.01)
        asyncio.run(run())

    def test_stalled_owner_is_cancelled_and_watchdog_starts_replacement(self):
        async def run():
            e, origin = self.new()
            e._start_transition(COFFEE,(661,origin+40,origin+35,3))
            old=e.pending[COFFEE]
            # Freeze progress older than the 45-second deadline while a task exists.
            e.pending_last_progress[COFFEE]=time.monotonic()-90
            e.queued_transitions[COFFEE]=deque([(757,origin+45,origin+40,664)],maxlen=96)
            e._watchdog_workers()
            self.assertGreaterEqual(e.diagnostics['watchdog_stalled_worker'],1)
            self.assertTrue(old.cancelling())
            self.assertTrue(e.queued_transitions[COFFEE])
            # Recovery has a short backoff to avoid a rapid exception loop.
            e._worker_recovery_due[COFFEE]=time.monotonic()-1
            e._watchdog_workers()
            await asyncio.sleep(.12)
            self.assertEqual(e.diagnostics['evaluations_completed'],2)
            self.assertFalse(e.pending)
            self.assertFalse(e.queued_transitions)
        asyncio.run(run())

    def test_failed_task_start_does_not_discard_fifo(self):
        async def run():
            e, origin = self.new()
            def failed_task(coroutine):
                coroutine.close()
                raise RuntimeError('Home Assistant rejected task')
            e.hass=SimpleNamespace(async_create_task=failed_task)
            e.queued_transitions[COFFEE]=deque([(661,origin+40,origin+35,3)],maxlen=96)
            e._watchdog_workers()
            self.assertEqual(len(e.queued_transitions[COFFEE]),1)
            self.assertFalse(e.pending)
            self.assertEqual(e.diagnostics['worker_start_error'],1)
            e.hass=SimpleNamespace(async_create_task=asyncio.create_task)
            e._worker_recovery_due[COFFEE]=time.monotonic()-1
            e._watchdog_workers()
            await asyncio.sleep(.09)
            self.assertEqual(e.diagnostics['evaluations_completed'],1)
            self.assertFalse(e.queued_transitions)
        asyncio.run(run())

    def test_queued_staged_updates_are_compacted_without_losing_off_edge(self):
        e, origin = self.new()
        e._queue_transition(COFFEE,(661,origin+40,origin+35,3))
        e._queue_transition(COFFEE,(757,origin+45,origin+40,664))
        e._queue_transition(COFFEE,(-1417,origin+56,origin+45,1421))
        q=list(e.queued_transitions[COFFEE])
        self.assertEqual(len(q),2)
        self.assertEqual(q[0][0],1418)
        self.assertEqual(q[0][3],3)
        self.assertEqual(q[1][0],-1417)
        self.assertEqual(e.diagnostics['queued_steps_combined'],1)

    def test_shutdown_does_not_resurrect_queue(self):
        async def run():
            e, origin=self.new()
            e._start_transition(COFFEE,(661,time.monotonic()+4,time.monotonic()-1,3))
            e.queued_transitions[COFFEE]=deque([(757,origin+45,origin+40,664)],maxlen=96)
            e._cancel_pending()
            await asyncio.sleep(0)
            self.assertFalse(e.queued_transitions)
            self.assertFalse(e.pending)
            self.assertFalse(e._worker_inflight)
        asyncio.run(run())

    def test_successful_stress_matches_preserve_per_device_independence(self):
        async def run():
            e,origin=self.new()
            e._start_transition(COFFEE,(661,origin+40,origin+35,3))
            # Both the coffee maker and a second device run independently.
            e._start_transition('sensor.other',(88,origin+43,origin+38,0))
            for i in range(150):
                # Saturated but realistic feed: the event loop gets time to run.
                e._queue_transition(COFFEE, ((90 if i%2 else -90),origin+45+i*.12,origin+40+i*.12,100))
                if i%12 == 0:
                    e._watchdog_workers()
                    await asyncio.sleep(.002)
            for _ in range(100):
                if not e.pending and not e.queued_transitions: break
                e._watchdog_workers()
                await asyncio.sleep(.025)
            self.assertEqual(e.diagnostics['queue_full'],0)
            self.assertFalse(e.pending)
            self.assertFalse(e.queued_transitions)
            self.assertGreaterEqual(e.diagnostics['evaluations_completed'],100)
        asyncio.run(run())

if __name__ == '__main__': unittest.main()
