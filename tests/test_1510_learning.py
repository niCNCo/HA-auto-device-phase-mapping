"""v1.5.10: independent one-direction slow votes, restart recovery and confidence."""
import ast
from collections import deque
import time
import unittest

from test_155_learning import Base, ns, PATH, ENGINE

# Ensure the isolated AST test harness also uses the new methods.
for method in ENGINE.body:
    if isinstance(method, ast.FunctionDef) and method.name in {
        '_one_direction_votes', '_promote_saved_one_direction_votes',
        '_promote_slow_votes', '_accept_match', '_recalculate_result',
    }:
        module = ast.Module(body=[method], type_ignores=[])
        exec(compile(ast.fix_missing_locations(module), str(PATH), 'exec'), ns)
        setattr(Base, method.name, ns[method.name])

class TestLearning1510(unittest.TestCase):
    def make(self, quality=(.99,.981,.993), direction=-1, phase='L3'):
        engine=Base()
        now=time.time()
        engine.slow_votes['sensor.bed']=deque([
            (phase,direction,now-8000+i*3500,q) for i,q in enumerate(quality)
        ],maxlen=12)
        engine.settings['manual_assignments']={}
        engine.settings['learning_enabled']=True
        return engine

    def test_left_bed_saved_off_only_promotes_and_maps_red(self):
        e=self.make()
        e.results['sensor.bed']={'entity_id':'sensor.bed',
          'scores':{'L1':.455,'L2':.793,'L3':.807,'3-phase':0.0},
          'events':3,'confidence':15.9,'phase':'Unknown'}
        e._promote_saved_one_direction_votes()
        r=e.results['sensor.bed']
        self.assertEqual(r['phase'],'L3')
        self.assertEqual(r['events'],6)
        self.assertGreaterEqual(r['confidence'],55)
        self.assertLess(r['confidence'],70,'provisional should use RED indicator')
        self.assertEqual(r['one_direction_phase'],'L3')
        self.assertEqual(len(r['slow_promoted_steps']),3)
        e._promote_saved_one_direction_votes()
        self.assertEqual(e.results['sensor.bed']['events'],6,'must never replay saved events')
        self.assertEqual(e.diagnostics['slow_one_direction_confirmed'],1)

    def test_right_bed_promotes_only_three_strong_off_votes(self):
        e=self.make(quality=(.608,.913,.955,.867))
        e._promote_saved_one_direction_votes()
        r=e.results['sensor.bed']
        self.assertEqual(r['phase'],'L3')
        self.assertEqual(r['events'],3,'weak .608 vote must not become confirmed')
        self.assertEqual(r['one_direction_phase'],'L3')
        self.assertLessEqual(r['confidence'],64)

    def test_two_high_quality_votes_not_enough(self):
        e=self.make(quality=(.99,.98))
        e._promote_saved_one_direction_votes()
        self.assertEqual(e.results,{})

    def test_several_reads_of_same_transition_do_not_map(self):
        e=self.make()
        t=time.time()
        e.slow_votes['sensor.bed']=deque([('L3',-1,t-22,.99),('L3',-1,t-17,.98),('L3',-1,t-9,.99)],maxlen=12)
        e._promote_saved_one_direction_votes()
        self.assertEqual(e.results,{})

    def test_competing_high_quality_phase_vetoes(self):
        e=self.make(quality=(.99,.98,.99,.98))
        e.slow_votes['sensor.bed'].append(('L1',-1,time.time()-120,.94))
        e._promote_saved_one_direction_votes()
        self.assertEqual(e.results,{})

    def test_three_weak_votes_do_not_map(self):
        e=self.make(quality=(.61,.78,.84))
        e._promote_saved_one_direction_votes()
        self.assertEqual(e.results,{})

    def test_opposite_strong_edge_later_lifts_provisional_cap(self):
        e=self.make()
        e._promote_saved_one_direction_votes()
        self.assertLessEqual(e.results['sensor.bed']['confidence'],64)
        e._accept_match('sensor.bed','L3',.99,110,'fast',time.time())
        r=e.results['sensor.bed']
        self.assertEqual(r['phase'],'L3')
        self.assertNotIn('one_direction_phase',r)
        self.assertGreater(r['confidence'],64)

    def test_provisional_flag_and_color_survive_restart_recalculate(self):
        e=self.make()
        e._promote_saved_one_direction_votes()
        r=e.results['sensor.bed']
        e._recalculate_result(r)
        self.assertEqual(r['phase'],'L3')
        self.assertLessEqual(r['confidence'],64)
        self.assertEqual(r['one_direction_phase'],'L3')

    def test_excluded_and_manual_overrides_are_never_backfilled(self):
        e=self.make();e.settings['excluded']=['sensor.bed']
        e._promote_saved_one_direction_votes();self.assertEqual(e.results,{})
        e.settings['excluded']=[];e.settings['manual_assignments']={'sensor.bed':'L1'}
        e._promote_saved_one_direction_votes();self.assertEqual(e.results,{})

    def test_existing_mapped_phase_not_overwritten(self):
        e=self.make()
        e.results['sensor.bed']={'entity_id':'sensor.bed','scores':{'L1':2.8,'L2':0,'L3':0,'3-phase':0},'events':4,'confidence':87,'phase':'L1'}
        e._promote_saved_one_direction_votes()
        self.assertEqual(e.results['sensor.bed']['phase'],'L1')
        self.assertEqual(e.results['sensor.bed']['events'],4)

if __name__=='__main__':unittest.main()
