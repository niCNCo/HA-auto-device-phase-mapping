"""Static contract tests for instrumentation in the HA-dependent learning engine."""
from pathlib import Path
import ast
import unittest

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / 'custom_components/ha_auto_device_phase_mapping/engine.py'
FRONTEND = ROOT / 'custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js'

class LearningDiagnosticsContractTests(unittest.TestCase):
    def test_engine_has_rejection_paths_and_export(self):
        code = ENGINE.read_text()
        ast.parse(code)
        for key in ('transitions_detected', 'fast_timeline_match', 'fast_timeline_no_match',
                    'fast_timeline_duplicate', 'fast_timeline', 'poor_correlation',
                    'history_interrupted', 'accepted', 'learning_diagnostics'):
            self.assertIn(key, code)

    def test_frontend_displays_overall_and_per_device_results(self):
        code = FRONTEND.read_text()
        for key in ('_learningDiagnostics(d)', 'learningDiagnostics',
                    'last_reason', 'history.reason', 'transitions_detected'):
            self.assertIn(key, code)

if __name__ == '__main__':
    unittest.main()
