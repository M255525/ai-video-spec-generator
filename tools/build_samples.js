// node tools/build_samples.js：把範例裡有「內容摘錄」的素材輸出成 samples/*.txt，供練習「📁 選擇檔案」
const fs = require('fs'), path = require('path');
const SPEC = require('../data.js');
const dir = path.join(__dirname, '..', 'samples');
fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir);
for (const x of SPEC.EXAMPLES) for (const m of x.mats) {
  if (!m.excerpt) continue;
  const f = SPEC.sampleName(m);
  fs.writeFileSync(path.join(dir, f), '﻿' + m.excerpt.replace(/\n/g, '\r\n') + '\r\n');
  console.log(f);
}
