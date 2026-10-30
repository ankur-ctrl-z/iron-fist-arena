"""Packs the slimmed glTF models into dist/models.js so the page can load them as a plain script."""
import base64, json, os
root = os.path.join(os.path.dirname(__file__), '..')
models = {'xbot': 'xbot_s.glb', 'michelle': 'michelle_s.glb', 'rpm': 'rpm_s.glb'}
data = {k: base64.b64encode(open(os.path.join(root, 'assets/models', f), 'rb').read()).decode() for k, f in models.items()}
open(os.path.join(root, 'dist/models.js'), 'w').write('window.IFA_MODELS=' + json.dumps(data) + ';')
