// node tools/test_engine.mjs：引擎回歸測試
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SPEC = require('../data.js'); globalThis.SPEC = SPEC;
const E = require('../engine.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const T = SPEC.TEMPLATES;
// 規格表「配方試算」示範：政策型＋節奏自訂 60
const st = E.blankState(); st.topic = '中小企業訓練補助怎麼申請'; st.tpl = 'policy'; st.ov.S3 = 60;
const sl = E.sliders(st, T);
ok(sl.map(x => x.value).join() === '20,80,60,50,20,60', 'slider values');
ok(sl.map(x => x.levelName).join('') === '低高中中低中', 'levels');
ok(E.prompt(st, T).startsWith('請為主題「中小企業訓練補助怎麼申請」撰寫一支約 180 秒的影片腳本與分鏡。結構依序為：誰適用 → 能拿到什麼 → 申請條件 → 流程 → 常見錯誤 → 去哪申請。風格要求：情緒張力（低）：語氣平穩客觀，不誇飾，配樂輕柔；'), 'prompt base');
// 等級邊界
ok(SPEC.level(33) === 0 && SPEC.level(34) === 1 && SPEC.level(66) === 1 && SPEC.level(67) === 2, 'level bounds');
// 每個模板草稿總長要接近長度、每段都有鏡頭
for (const t of T) for (const pace of [0, 50, 100]) {
  const s = E.blankState(); s.tpl = t.id; s.ov.S3 = pace; s.topic = 'x';
  const sh = E.draftShots(s, T), tot = E.totals(sh).total;
  ok(Math.abs(tot - t.len) <= 0.5, `${t.name} pace ${pace} total ${tot}`);
  ok(t.segs.every(g => sh.some(x => x.seg === g)), `${t.name} segs covered`);
  ok(sh.every(x => x.sec >= 1), `${t.name} sec >= 1`);
}
// CTA 高且沒有行動呼籲段落 → 自動補
{ const s = E.blankState(); s.tpl = 'story'; s.ov.S6 = 90; const sh = E.draftShots(s, T); ok(sh[sh.length - 1].seg === '行動呼籲', 'cta appended'); }
// 必用素材一定出現
{ const s = E.blankState(); s.tpl = 'short'; s.ov.S5 = 100; s.mats = [{src: 'logo.png', type: '圖片', role: '必用素材', weight: 90}];
  const sh = E.draftShots(s, T); ok(sh.some(x => x.desc.includes('素材 #1')), 'must-use placed'); ok(sh[sh.length - 1].desc.includes('素材 #1'), 'logo at end'); }
// 權重檢查
ok(E.weightCheck({role: '事實依據', weight: 50}).cls === 'warn' && E.weightCheck({role: '事實依據', weight: 90}).cls === 'ok', 'weight check');
// 匯入
ok(E.parseShots('[{"段落":"a","旁白":"b","畫面來源":"素材","秒數":3}]')[0].sec === 3, 'parse json');
ok(E.parseShots('| 鏡號 | 段落 | 旁白 | 畫面來源 | 秒數 |\n|---|---|---|---|---|\n| 1 | 鉤子 | 你好 | AI 生成 | 4 |')[0].narr === '你好', 'parse md');
ok(E.parseShots('段落\t旁白\t秒數\n鉤子\t嗨\t2.5')[0].sec === 2.5, 'parse tsv');
let threw = false; try { E.parseShots('hello'); } catch (e) { threw = true; } ok(threw, 'parse garbage throws');
// SRT 略過草稿
{ const s = E.blankState(); s.shots = [{seg: 'a', narr: '【草稿】x', sec: 2}, {seg: 'b', narr: '真的', sec: 3}]; ok(E.srt(s).includes('00:00:02,000 --> 00:00:05,000'), 'srt timing'); }
console.log(fail ? fail + ' failed' : 'all passed');
process.exit(fail ? 1 : 0);
