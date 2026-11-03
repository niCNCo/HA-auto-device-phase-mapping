"""Exercise the actual delayed-matching method with synthetic phase history."""
import ast
import asyncio
from collections import deque
from pathlib import Path
import unittest

ENGINE=Path(__file__).resolve().parents[1]/'custom_components/ha_auto_device_phase_mapping/engine.py'
module=ast.parse(ENGINE.read_text())
cls=next(node for node in module.body if isinstance(node,ast.ClassDef) and node.name=='PhaseEngine')
method=next(node for node in cls.body if isinstance(node,ast.AsyncFunctionDef) and node.name=='_evaluate_slow')
# Compile method independently; its behavior is kept identical to the integration.
source=ast.Module(body=[method],type_ignores=[])
ast.fix_missing_locations(source)
namespace={'PHASES':('L1','L2','L3'),'deque':deque, 'math':__import__('math'), '_LOGGER':None, 'asyncio':asyncio}
exec(compile(source,str(ENGINE),'exec'),namespace)

class EngineStub:
    def __init__(self,steps):
        self.settings={'excluded':[], 'learning_enabled':True}
        self.history={p:deque(((t, (steps.get(p) or {}).get(t,0)) for t in range(0,141)),maxlen=1800) for p in ('L1','L2','L3')}
        self.pending={}
        self.slow_votes={}
        self.logs=[]
        self.accepted=[]
    def _diag(self,*args):self.logs.append(args)
    def _record_slow_vote(self, entity_id, phase, direction, stamp, quality):
        # The matching test isolates correlation; persistence is tested in
        # test_149_slow_vote_persistence.py against the production helpers.
        votes = self.slow_votes.setdefault(entity_id, deque(maxlen=12))
        votes.append((phase, direction, stamp, quality))
        return votes
    def _accept_match(self,*args):self.accepted.append(args)
    _evaluate_slow=namespace['_evaluate_slow']

class SlowMatchingTests(unittest.TestCase):
    def test_looks_back_before_sensor_update(self):
        # L2 appliance changed at t=100; delayed integration reports at t=130.
        self_power={t:(900 if t>=100 else 0) for t in range(141)}
        engine=EngineStub({'L2':self_power})
        asyncio.run(engine._evaluate_slow('sensor.livingroom',900,130,80))
        self.assertTrue(any(x[0]=='slow_candidate' for x in engine.logs), engine.logs)
        self.assertFalse(engine.accepted, 'A single retrospective match cannot create evidence')

    def test_no_historical_match(self):
        engine=EngineStub({})
        asyncio.run(engine._evaluate_slow('sensor.livingroom',900,130,80))
        self.assertTrue(any(x[0]=='slow_no_matching_step' for x in engine.logs))
        self.assertFalse(engine.accepted)

if __name__=='__main__':unittest.main()
