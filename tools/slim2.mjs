// Run from tools/ after downloading readyplayer.me.glb into tools/source/ (see README).
import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const io = new NodeIO();
const doc = await io.read('source/readyplayer.me.glb'); const root = doc.getRoot();
for (const n of root.listNodes()) { const m = n.getMesh(); if (m && /Outfit|Headwear|Body/.test(n.getName() + ' ' + m.getName())) { n.setMesh(null); n.setSkin(null); } }
for (const m of root.listMeshes()) if (m.listParents().filter(p => p.propertyType === 'Node').length === 0) m.dispose();
// remove morph targets (not used) to save space
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) for (const t of p.listTargets()) t.dispose();
for (const mat of root.listMaterials()) if (mat.listParents().filter(p => p.propertyType === 'Primitive').length === 0) mat.dispose();
for (const t of root.listTextures()) if (t.listParents().filter(p => p.propertyType === 'Material').length === 0) t.dispose();
for (const a of root.listAccessors()) if (a.listParents().length <= 1) a.dispose();
const { prune } = await import('@gltf-transform/functions'); await doc.transform(prune());
await io.write('../assets/models/rpm_s.glb', doc);
console.log('rpm_s', (fs.statSync('../assets/models/rpm_s.glb').size / 1e6).toFixed(2) + 'MB', root.listMeshes().map(m => m.getName()).join(','));
