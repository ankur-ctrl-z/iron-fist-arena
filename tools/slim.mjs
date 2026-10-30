// Run from tools/ after downloading the source models into tools/source/ (see README).
import os from 'os';
const TMP = os.tmpdir();
import { NodeIO } from '@gltf-transform/core';
import { execFileSync } from 'child_process';
import fs from 'fs';
const io = new NodeIO();
for (const [src, out, maxTex] of [['source/Xbot.glb', '../assets/models/xbot_s.glb', 0], ['source/Michelle.glb', '../assets/models/michelle_s.glb', 1024], ['source/Soldier.glb', '../assets/models/soldier_s.glb', 1024]]) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose();
  // drop accessors left unused by removed animations
  for (const acc of root.listAccessors()) if (acc.listParents().length <= 1) acc.dispose();
  for (const t of root.listTextures()) {
    const img = t.getImage(); const mime = t.getMimeType(); const name = t.getName() || t.getURI() || 'tex';
    fs.writeFileSync(TMP + '/tin.bin', Buffer.from(img));
    const isNormal = /normal/i.test(name); const isGloss = /gloss/i.test(name);
    const fmt = (isNormal || mime === 'image/png' && /Image$/.test(name)) ? 'PNG' : 'JPEG';
    execFileSync('python3', ['-I', '-c', `
from PIL import Image
im=Image.open('${TMP}/tin.bin')
m=${maxTex}
if m and max(im.size)>m: im=im.resize((m,m), Image.LANCZOS)
fmt='${fmt}'
if fmt=='JPEG': im=im.convert('RGB'); im.save('${TMP}/tout.bin','JPEG',quality=86)
else: im.save('${TMP}/tout.bin','PNG',optimize=True)
`]);
    t.setImage(fs.readFileSync(TMP + '/tout.bin')); t.setMimeType(fmt === 'PNG' ? 'image/png' : 'image/jpeg');
    console.log('  tex', name, mime, '->', fmt);
  }
  await io.write(out, doc);
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(2) + 'MB');
}
