"""v1.5.8: a non-reporting 0W SolarEdge sensor cannot block learning all night."""
import ast
import asyncio
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import importlib.util
import math
import time
import unittest

BASE = Path(__file__).resolve().parents[1] / 'custom_components/ha_auto_device_phase_mapping'
mod_ast = ast.parse((BASE / 'engine.py').read_text())
cls = next(x for x in mod_ast.body if isinstance(x, ast.ClassDef) and x.name == 'PhaseEngine')
methods = [x for x in cls.body if isinstance(x, (ast.FunctionDef, ast.AsyncFunctionDef))
           and x.name in ('_tick', '_fresh_watts', '_night_zero_solar_power')]
spec=importlib.util.spec_from_file_location('phase_158_corr',BASE/'correlation.py')
corr=importlib.util.module_from_spec(spec);spec.loader.exec_module(corr)
class Clock:
    @staticmethod
    def utcnow():return datetime.now(timezone.utc)
namespace={'PHASES':('L1','L2','L3'), 'math':math,'time':time,'deque':deque,
           'dt_util':Clock,'valid_power':lambda st: (float(st.state) if st is not None and
                st.domain=='sensor' and st.attributes.get('device_class')=='power' and
                st.attributes.get('unit_of_measurement')=='W' and
                st.state not in ('unknown','unavailable') else None),
           'solar_allocation_decision':corr.solar_allocation_decision,
           'estimated_phase_solar_watts':corr.estimated_phase_solar_watts}
exec(compile(ast.fix_missing_locations(ast.Module(body=methods,type_ignores=[])),str(BASE/'engine.py'),'exec'),namespace)

class State:
    def __init__(self, value, age=0, *, kind='power', unit='W', elevation=None):
        self.domain='sensor' if elevation is None else 'sun'
        self.state=str(value)
        self.attributes={'device_class':kind,'unit_of_measurement':unit}
        if elevation is not None:self.attributes['elevation']=elevation
        self.last_reported=datetime.now(timezone.utc)-timedelta(seconds=age)
        self.last_updated=self.last_reported

class FakeEngine:
    _fresh_watts=namespace['_fresh_watts']
    _night_zero_solar_power=namespace['_night_zero_solar_power']
    _tick=namespace['_tick']
    def __init__(self,sun='below_horizon',elevation=-20,solar_value=0,solar_age=1900):
        self.values={}
        for i in range(1,4):
            self.values[f'sensor.p1_{i}']=State(150)
            self.values[f'sensor.battery_{i}']=State(0)
        self.values['sensor.solar']=State(solar_value,solar_age)
        if sun is not None:self.values['sun.sun']=State(sun,elevation=elevation)
        self.hass=SimpleNamespace(states=SimpleNamespace(get=self.values.get))
        self.settings={
            'phase_sensors':{f'L{i}':f'sensor.p1_{i}' for i in range(1,4)},
            'battery_sources':{f'L{i}':[{'entity_id':f'sensor.battery_{i}','positive':True}] for i in range(1,4)},
            'solar_sources':{**{f'L{i}':[] for i in range(1,4)},'TOTAL':[{'entity_id':'sensor.solar','positive':True}]},
            'solar_phase_estimation':{'enabled':False}}
        self.history={p:deque(maxlen=1800) for p in ('L1','L2','L3')}
        self.history_status={'ready':False}
        self._last_unready_reason=None
        self._night_solar_fallback_active=False
        self._solar_estimation_status='disabled'
        self.diags=[]
    def _watchdog_workers(self):pass  # This harness tests only the solar fallback.
    def _observe_sensor_reports(self):pass
    def _diag(self,*args,**kwargs):self.diags.append(args[0])
    def _solar_phase_shares(self,utc_now):raise AssertionError('Should not need V*I at zero PV')

class NightZeroTests(unittest.TestCase):
    def test_stale_zero_at_night_keeps_corrected_history_available(self):
        e=FakeEngine()
        asyncio.run(e._tick(None))
        self.assertTrue(e.history_status['ready'])
        self.assertEqual([e._display_breakdown[f'L{i}']['cleaned'] for i in range(1,4)],[150,150,150])
        self.assertTrue(e._night_solar_fallback_active)
        self.assertIn('solar_night_zero_fallback',e.diags)
        asyncio.run(e._tick(None))
        self.assertEqual(e.diags.count('solar_night_zero_fallback'),1)
        self.assertEqual(len(e.history['L1']),2)

    def test_daylight_stale_zero_must_not_be_assumed_zero(self):
        for sun, elev in [('above_horizon',10),('below_horizon',-1),(None,-20)]:
            with self.subTest(sun=sun,elev=elev):
                e=FakeEngine(sun=sun,elevation=elev)
                asyncio.run(e._tick(None))
                self.assertFalse(e.history_status['ready'])
                self.assertFalse(e._night_solar_fallback_active)

    def test_stale_nonzero_solar_never_falls_back(self):
        e=FakeEngine(solar_value=1000)
        asyncio.run(e._tick(None))
        self.assertFalse(e.history_status['ready'])

    def test_watchdog_exception_does_not_stop_p1_sampling(self):
        e=FakeEngine()
        def broken_watchdog():
            raise RuntimeError('test-only simulated watchdog crash')
        e._watchdog_workers=broken_watchdog
        # Simulate the real module's logger used when the watchdog fails.
        namespace['_LOGGER']=SimpleNamespace(exception=lambda *args:None)
        asyncio.run(e._tick(None))
        self.assertTrue(e.history_status['ready'])
        self.assertEqual(len(e.history['L1']),1)
        self.assertIn('watchdog_error',e.diags)

    def test_fresh_solar_still_works_during_daylight(self):
        e=FakeEngine(sun='above_horizon',elevation=18,solar_value=600,solar_age=1)
        asyncio.run(e._tick(None))
        self.assertTrue(e.history_status['ready'])
        self.assertEqual(e._display_breakdown['L1']['cleaned'],350)
        self.assertFalse(e._night_solar_fallback_active)

if __name__=='__main__':unittest.main()
