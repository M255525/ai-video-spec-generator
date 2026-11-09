'use strict';
/* Gemini 已下架／不存在的模型 ID 自動換成現役模型（2026-11 體檢）：新申請的 AI Studio 金鑰呼叫 2.5／2.0 系列會被拒；也順便去掉多打的空白與 models/ 前綴 */
function geminiModelFix(m){var r={'gemini-2.5-flash': 'gemini-3.6-flash', 'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite', 'gemini-2.5-pro': 'gemini-3.8-flash', 'gemini-2.0-flash': 'gemini-3.6-flash', 'gemini-2.0-flash-001': 'gemini-3.6-flash', 'gemini-2.0-flash-lite': 'gemini-3.1-flash-lite', 'gemini-1.5-flash': 'gemini-3.6-flash', 'gemini-1.5-pro': 'gemini-3.1-pro-preview', 'gemini-3-pro': 'gemini-3.1-pro-preview', 'gemini-3-pro-preview': 'gemini-3.1-pro-preview', 'gemini-3.5-pro': 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite'};m=String(m||'').trim().replace(/^models\//,'');return r[m]||m;}
/* AI 影片規格產生器：介面。資料只存在這個瀏覽器（localStorage，鍵前綴 vsg.）。
   AI 金鑰（選用）只存本機，由瀏覽器直接呼叫供應商，不經過任何伺服器。 */

var $ = function (id) { return document.getElementById(id); };
var E = window.ENGINE;
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
function lsGet(k) { try { return localStorage.getItem('vsg.' + k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem('vsg.' + k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem('vsg.' + k); } catch (e) {} }
function lsJson(k, d) { try { var v = JSON.parse(lsGet(k)); return v == null ? d : v; } catch (e) { return d; } }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

var SITE = 'https://m255525.github.io/ai-video-spec-generator/';
var STEPS = [
  {id: 'content', n: '01', name: '內容', sub: '講什麼', color: 'var(--c1)'},
  {id: 'structure', n: '02', name: '結構', sub: '怎麼排', color: 'var(--c2)'},
  {id: 'style', n: '03', name: '風格', sub: '什麼感覺', color: 'var(--c3)'},
  {id: 'shots', n: '04', name: '分鏡', sub: '鏡頭骨架', color: 'var(--c4)'},
  {id: 'output', n: '05', name: '輸出', sub: '指令與配方', color: 'var(--rec)'}
];
var SEG_COLORS = ['#B4540A', '#0F7468', '#5B3FA8', '#1F4E9C', '#A8326B', '#4D7A12', '#8A5A00', '#2F6B8F', '#7A3FA0', '#9A2F2F'];

var prefs = Object.assign({defTpl: 'policy', defRatio: '16:9', defSpeed: '正常', fs: 'n', aiProvider: 'gemini', aiKey: '', aiModel: '', aiModelCustom: '', aiBase: ''}, lsJson('prefs', {}));
var myTpls = lsJson('tpls', []);
var state = normalize(lsJson('state', null));
var tab = 'content';
var openExcerpt = {};
var hlShot = -1;

function allTpls() { return SPEC.TEMPLATES.concat(myTpls); }
function normalize(s) {
  var b = E.blankState();
  if (!s || typeof s !== 'object') { b.tpl = prefs.defTpl; b.adv.ratio = prefs.defRatio; b.adv.speed = prefs.defSpeed; return b; }
  var o = Object.assign(b, s);
  o.adv = Object.assign(E.blankState().adv, s.adv || {});
  o.ov = Object.assign(E.blankState().ov, s.ov || {});
  o.tools = Object.assign(E.blankState().tools, s.tools || {});
  o.opt = Object.assign(E.blankState().opt, s.opt || {});
  o.mats = Array.isArray(s.mats) ? s.mats : [];
  o.shots = Array.isArray(s.shots) ? s.shots : [];
  if (!allTpls().some(function (t) { return t.id === o.tpl; })) o.tpl = SPEC.TEMPLATES[0].id;
  return o;
}
var saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(function () { lsSet('state', JSON.stringify(state)); }, 250); }
function saveNow() { clearTimeout(saveT); lsSet('state', JSON.stringify(state)); }
function savePrefs() { lsSet('prefs', JSON.stringify(prefs)); }
function saveTpls() { lsSet('tpls', JSON.stringify(myTpls)); }

/* ---------- 共用小元件 ---------- */
var toastT = null;
function toast(m) {
  var o = document.querySelector('.toast'); if (o) o.remove();
  var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = m;
  document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, 3200);
}
function openModal(h) { $('modalBox').innerHTML = h; $('modal').classList.add('show'); var f = $('modalBox').querySelector('input,textarea,select'); if (f) setTimeout(function () { f.focus(); }, 30); }
function closeModal() { $('modal').classList.remove('show'); $('modalBox').innerHTML = ''; modalCb = null; }
var modalCb = null;
function confirmBox(title, msg, okLabel, cb) {
  modalCb = cb;
  openModal('<h2>' + esc(title) + '</h2><p>' + msg + '</p><div class="mfoot"><button class="btn ghost" data-act="close">取消</button><button class="btn rec" data-act="modalOk">' + esc(okLabel) + '</button></div>');
}
function askText(title, label, def, cb) {
  modalCb = function () { var v = $('askIn').value.trim(); if (!v) { toast('請輸入名稱'); return false; } cb(v); };
  openModal('<h2>' + esc(title) + '</h2><label class="fld">' + esc(label) + '<input id="askIn" value="' + esc(def || '') + '" maxlength="40"></label><div class="mfoot"><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="modalOk">確定</button></div>');
}
function download(name, text, type) {
  var blob = new Blob([text], {type: type || 'text/plain;charset=utf-8'}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function copy(text, msg) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(msg || '已複製'); }, fallback);
  else fallback();
  function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast(msg || '已複製'); } catch (e) { toast('複製失敗，請手動選取'); } t.remove(); }
}
function fileBase() { return (state.name || state.topic || '影片規格').replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || '影片規格'; }
function opts(list, cur) { return list.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? (typeof o[1] === 'string' ? o[1] : o[0]) : o; return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join(''); }
function roleOf(name) { var r = null; SPEC.ROLES.forEach(function (x) { if (x.name === name) r = x; }); return r; }
function segColor(seg) { seg = seg || ''; var segs = E.segments(state, allTpls()), i = segs.indexOf(seg); if (i < 0) i = segs.length + (seg.length % 3); return SEG_COLORS[i % SEG_COLORS.length]; }

/* ---------- 步驟列 ---------- */
function renderSteps() {
  $('steps').innerHTML = STEPS.map(function (s) {
    return '<li><button role="tab" style="--sc:' + s.color + '" aria-selected="' + (tab === s.id) + '" data-tab="' + s.id + '"><b>' + s.n + '</b><span>' + s.name + '</span><em>' + s.sub + '</em></button></li>';
  }).join('');
  var sel = document.querySelector('.steps [aria-selected="true"]'); if (sel && sel.scrollIntoView) sel.scrollIntoView({block: 'nearest', inline: 'center'});
}
function go(id, keepScroll) {
  tab = id; if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  renderSteps(); render(); if (!keepScroll) window.scrollTo({top: 0});
}
function nextBtns() {
  var i = STEPS.findIndex(function (s) { return s.id === tab; });
  return '<div class="next no-print">' + (i > 0 ? '<button class="btn ghost" data-tab="' + STEPS[i - 1].id + '">← ' + STEPS[i - 1].name + '</button>' : '<span></span>') +
    (i < STEPS.length - 1 ? '<button class="btn" data-tab="' + STEPS[i + 1].id + '">下一步：' + STEPS[i + 1].name + ' →</button>' : '') + '</div>';
}
function layerHead(n, tag, title, color, desc) {
  return '<div class="layer-head" style="--lc:' + color + '"><div><div class="tag">STEP ' + n + ' · ' + tag + '</div><h2>' + title + '</h2></div><p>' + desc + '</p></div>';
}
function render() {
  var f = {content: renderContent, structure: renderStructure, style: renderStyle, shots: renderShots, output: renderOutput}[tab] || renderContent;
  $('main').innerHTML = f() + warnLine();
  if (tab === 'output') fillOutputs();
  renderAside();
}
function warnLine() { return '<p class="warnline no-print">本工具只產生影片規格、分鏡與給 AI 的指令，不會實際生成影片。AI 寫出的內容請自行查核事實，素材請確認有使用權。<button data-act="warn">⚠ 使用警語</button>　<a href="manual.html">📖 操作手冊</a></p>'; }

/* ---------- 01 內容 ---------- */
function renderContent() {
  var h = layerHead('01', 'CONTENT', '內容層：講什麼', 'var(--c1)', '主題＋事實依據＋素材。每份素材都要標「角色」和「權重」，同一份素材換角色，AI 的用法就完全不同。');
  h += '<div class="layers">' + SPEC.LAYERS.map(function (l, i) { return '<div style="--lc:' + ['var(--c1)', 'var(--c2)', 'var(--c3)'][i] + '"><span class="eq">' + l.name + ' ＝ ' + l.metaphor + '</span><br><b>' + l.ask + '</b>　<span class="muted">' + l.has + '</span></div>'; }).join('') + '</div>';
  h += '<div class="card"><h3>🎯 影片主題</h3><label class="fld">主題一句話<input data-bind="topic" value="' + esc(state.topic) + '" placeholder="例如：中小企業訓練補助怎麼申請"></label>' +
    '<label class="fld" style="margin-top:.55rem">補充說明 <span class="h">（選填：目標觀眾、一定要講到的重點、要避免的說法）</span><textarea data-bind="brief" rows="2" placeholder="例如：觀眾是 30 人以下公司的老闆，沒時間看公文；要講到申請截止日">' + esc(state.brief) + '</textarea></label></div>';
  h += '<div class="card" id="matCard"><h3>📎 素材登記表<span class="r"><button class="btn sm" data-act="matPick">📁 選擇檔案</button> <button class="btn sm ghost" data-act="addMat">＋ 填網址／手動新增</button></span></h3>' +
    '<p class="small muted" style="margin:0 0 .5rem">按「📁 選擇檔案」或把檔案拖進這張卡片（可一次選多個）；網址請按「＋ 填網址」貼上。檔案只在你的瀏覽器裡讀取，<b>不會上傳</b>。文字檔（TXT／MD／CSV／SRT／HTML）與 PDF 會自動讀出文字放進 📝 內容摘錄，讓 AI 讀得到。</p>';
  if (!state.mats.length) h += '<div class="dropz" data-act="matPick">📁 點這裡選擇檔案，或把檔案拖進來<br><span class="small muted" style="font-weight:400">沒有素材也可以做，只是「真實感」低時畫面會用文字卡。</span></div>';
  else {
    h += '<div class="tw"><table class="t"><thead><tr><th>編號</th><th>檔名或網址</th><th>類型</th><th>角色</th><th>權重</th><th>備註</th><th>權重檢查</th><th></th></tr></thead><tbody>';
    state.mats.forEach(function (m, i) {
      var c = E.weightCheck(m), r = roleOf(m.role);
      h += '<tr><td class="num">#' + (i + 1) + '</td><td><div class="srcrow"><input class="in" data-bind="mats.' + i + '.src" value="' + esc(m.src) + '" placeholder="檔名或 https:// 網址" style="min-width:11rem"><button class="icon-btn" data-act="matPick" data-i="' + i + '" title="選擇檔案">📁</button></div>' + (m.size ? '<span class="small muted">' + esc(m.size) + '・只存檔名</span>' : '') + '</td>' +
        '<td><select class="in" data-bind="mats.' + i + '.type">' + opts(SPEC.MAT_TYPES, m.type) + '</select></td>' +
        '<td><select class="in" data-bind="mats.' + i + '.role" style="border-left:4px solid ' + (r ? r.color : '#999') + '">' + opts(SPEC.ROLES.map(function (x) { return x.name; }), m.role) + '</select></td>' +
        '<td><input class="in" type="number" min="0" max="100" data-bind="mats.' + i + '.weight" value="' + esc(m.weight) + '" style="width:4.5rem" title="建議 ' + (r ? r.range.join('–') : '') + '"></td>' +
        '<td><input class="in" data-bind="mats.' + i + '.note" value="' + esc(m.note) + '" placeholder="例如：金額只能照這份" style="min-width:10rem"></td>' +
        '<td><span class="chk ' + c.cls + '" id="wc' + i + '">' + c.text + '</span><br><span class="small muted">建議 ' + (r ? r.range.join('–') : '—') + '</span></td>' +
        '<td style="white-space:nowrap"><button class="icon-btn" data-act="toggleEx" data-i="' + i + '" title="內容摘錄">📝' + ((m.excerpt || '').trim() ? '•' : '') + '</button> <button class="icon-btn" data-act="matUp" data-i="' + i + '" title="上移">↑</button> <button class="icon-btn" data-act="delMat" data-i="' + i + '" title="刪除">✕</button></td></tr>';
      if (openExcerpt[i]) h += '<tr><td></td><td colspan="7"><label class="fld">#' + (i + 1) + ' 內容摘錄 <span class="h">（貼上 PDF／網頁的重點文字；角色是「事實依據」時，AI 只能用這裡的事實）</span><textarea class="in" data-bind="mats.' + i + '.excerpt" rows="4">' + esc(m.excerpt || '') + '</textarea></label></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '</div>';
  h += '<details class="card adv"' + (state.mats.length ? '' : ' open') + '><summary>🏷 素材角色怎麼選？<span class="muted">四種角色決定 AI 怎麼使用它</span></summary><div class="roles" style="margin-top:.6rem">' +
    SPEC.ROLES.map(function (r) { return '<div class="role" style="--rc:' + r.color + '"><b>' + r.name + '</b>　' + r.def + '<dl><dt>AI 可以</dt><dd>' + r.can + '</dd><dt>AI 不可以</dt><dd>' + r.cannot + '</dd><dt>建議權重</dt><dd class="mono">' + r.range.join('–') + '</dd><dt>常見例子</dt><dd>' + r.eg + '</dd></dl></div>'; }).join('') + '</div></details>';
  return h + nextBtns();
}

/* ---------- 02 結構 ---------- */
function renderStructure() {
  var tpls = allTpls(), cur = E.findTpl(tpls, state.tpl), segs = E.segments(state, tpls), L = E.length(state, tpls);
  var h = layerHead('02', 'STRUCTURE', '結構層：怎麼排', 'var(--c2)', '每種影片類型＝一組段落順序＋預設滑桿值。選一個模板，再依需要調整段落與長度；調好的可以存成「我的模板」。');
  h += '<div class="card"><h3>🧩 結構模板庫<span class="r"><button class="btn sm ghost" data-act="saveTpl">＋ 把目前設定存成我的模板</button></span></h3><div class="tpls">';
  tpls.forEach(function (t) {
    h += '<button class="tpl" aria-pressed="' + (t.id === state.tpl) + '" data-tpl="' + esc(t.id) + '">' + (t.mine ? '<span class="mine">我的</span>' : '') +
      '<b>' + esc(t.name) + '</b><span class="use">' + esc(t.use) + '</span><span class="flow">' + esc(t.segs.join(' → ')) + '</span>' +
      '<span class="meta"><span>' + t.len + ' 秒・' + t.segs.length + ' 段</span><span class="spark" title="S1–S6 預設值">' + t.s.map(function (v) { return '<i style="height:' + Math.max(2, v * .18) + 'px"></i>'; }).join('') + '</span></span></button>';
  });
  h += '</div>';
  if (myTpls.length) h += '<p class="small muted" style="margin:.5rem 0 0">管理我的模板：' + myTpls.map(function (t, i) { return esc(t.name) + ' <button class="icon-btn" data-act="delTpl" data-i="' + i + '" title="刪除">✕</button>'; }).join('　') + '</p>';
  h += '</div>';
  var modified = state.segs && state.segs.join('|') !== cur.segs.join('|');
  h += '<div class="card"><h3>🔀 段落順序' + (modified ? ' <span class="chk warn">已修改</span>' : '') + '<span class="r">' + (modified ? '<button class="btn sm ghost" data-act="resetSegs">還原模板段落</button>' : '') + '</span></h3><div class="segs">';
  segs.forEach(function (g, i) {
    if (i) h += '<span class="arrow">→</span>';
    h += '<span class="seg" style="border-left-color:' + SEG_COLORS[i % SEG_COLORS.length] + '"><input data-seg="' + i + '" value="' + esc(g) + '" style="--w:' + Math.max(2, g.length) + '" aria-label="段落 ' + (i + 1) + '">' +
      '<button data-act="segL" data-i="' + i + '" title="往前">‹</button><button data-act="segR" data-i="' + i + '" title="往後">›</button><button data-act="segDel" data-i="' + i + '" title="刪除">✕</button></span>';
  });
  h += '</div><div class="row" style="margin-top:.6rem"><input class="in" id="newSeg" placeholder="新增段落，例如：常見問題" style="max-width:16rem;margin:0"><button class="btn sm" data-act="segAdd">＋ 加在最後</button></div></div>';
  var pace = E.sliders(state, tpls)[2].value, est = Math.max(segs.length, Math.round(L / E.paceSec(pace)));
  h += '<div class="card"><h3>⏱ 影片長度</h3><div class="grid2">' +
    '<div class="stat"><small>模板建議長度（秒）</small><b>' + cur.len + '</b></div>' +
    '<label class="fld">自訂長度（秒）<span class="h">　留白就沿用建議長度</span><input type="number" min="5" max="3600" data-bind="lenCustom" value="' + esc(state.lenCustom) + '" placeholder="' + cur.len + '"></label>' +
    '<div class="stat"><small>採用長度</small><b id="lenUse">' + L + ' 秒</b><small id="lenEst">依目前節奏（' + pace + '）約 ' + est + ' 鏡，每鏡約 ' + E.round05(E.paceSec(pace)) + ' 秒</small></div></div></div>';
  return h + nextBtns();
}

/* ---------- 03 風格 ---------- */
function sliderRow(x, s) {
  var custom = x.custom != null;
  return '<div class="sl" id="sl-' + x.code + '"><div class="nm"><span class="mono">' + x.code + '</span><b>' + x.name + '</b><small>影響：' + s.mods + '</small></div>' +
    '<div class="track"><div class="ends"><span>0 ' + s.lo + '</span><span>' + s.hi + ' 100</span></div><input type="range" min="0" max="100" value="' + x.value + '" data-sl="' + x.code + '" aria-label="' + x.name + '"><div class="tick" title="模板預設值 ' + x.def + '"><i style="left:' + x.def + '%"></i></div></div>' +
    '<div class="val"><input type="number" min="0" max="100" data-sln="' + x.code + '" value="' + (custom ? x.value : '') + '" placeholder="' + x.def + '" aria-label="' + x.name + '自訂值"><span class="lvl l' + x.level + '">' + x.levelName + '</span></div>' +
    '<div class="ins">' + esc(x.ins) + '<span class="src">' + (custom ? '已自訂（模板預設 ' + x.def + '）　<button class="link rst" data-act="slReset" data-c="' + x.code + '" style="background:none;border:0;color:var(--c4);text-decoration:underline;padding:0">還原</button>' : '沿用模板預設') + '</span></div></div>';
}
function renderStyle() {
  var tpls = allTpls(), sl = E.sliders(state, tpls), a = state.adv, cur = E.findTpl(tpls, state.tpl);
  var h = layerHead('03', 'STYLE', '風格層：什麼感覺', 'var(--c3)', '6 個跨類型通用的滑桿（0–33 低、34–66 中、67–100 高），每一級都對應一句送給 AI 或剪輯模組的指令。數字留白＝沿用「' + esc(cur.name) + '」的預設值。');
  h += '<div class="card"><h3>🎛 6 個核心滑桿<span class="r"><button class="btn sm ghost" data-act="slResetAll">全部還原模板預設</button></span></h3>';
  sl.forEach(function (x, i) { h += sliderRow(x, SPEC.SLIDERS[i]); });
  h += '</div>';
  h += '<details class="card adv"><summary>⚙ 進階設定<span class="muted">字幕、配樂、配音聲線、畫面比例、品牌元素</span></summary><div class="grid2" style="margin-top:.7rem">' +
    '<label class="fld">畫面比例<select data-bind="adv.ratio">' + opts(SPEC.ADV.ratio, a.ratio) + '</select></label>' +
    '<label class="fld">字幕樣式<select data-bind="adv.subStyle">' + opts(SPEC.ADV.subStyle, a.subStyle) + '</select></label>' +
    '<label class="fld">配音性別<select data-bind="adv.gender">' + opts(SPEC.ADV.gender, a.gender) + '</select></label>' +
    '<label class="fld">年齡感<select data-bind="adv.age">' + opts(SPEC.ADV.age, a.age) + '</select></label>' +
    '<label class="fld">語速 <span class="h">（影響每鏡旁白字數上限）</span><select data-bind="adv.speed">' + opts(SPEC.ADV.speed.map(function (x) { return [x[0], x[0] + '（每秒約 ' + x[1] + ' 字）']; }), a.speed) + '</select></label>' +
    '<label class="fld">配樂音量 <span class="h" id="mvv">' + a.musicVol + '</span><input type="range" min="0" max="100" data-bind="adv.musicVol" value="' + esc(a.musicVol) + '"><span class="h">旁白出現時自動降低</span></label>' +
    '<label class="fld">配樂風格<input data-bind="adv.music" value="' + esc(a.music) + '" placeholder="例如：輕快木吉他、低沉懸疑鋼琴"></label>' +
    '<label class="fld">視覺風格<input data-bind="adv.visualStyle" value="' + esc(a.visualStyle) + '" placeholder="例如：扁平插畫、暖色調、乾淨白底"></label>' +
    '<label class="fld">Logo 位置<select data-bind="adv.logoPos">' + opts(SPEC.ADV.logoPos, a.logoPos) + '</select></label>' +
    '<label class="fld">品牌色<span class="row" style="margin-top:.2rem"><input type="color" data-bind="adv.brandColor" value="' + esc(/^#[0-9a-f]{6}$/i.test(a.brandColor) ? a.brandColor : '#d7392b') + '" style="width:3rem;padding:0;height:2.1rem;margin:0"><input data-bind="adv.brandColor" value="' + esc(a.brandColor) + '" placeholder="留白＝不指定" style="flex:1;margin:0"></span></label>' +
    '<label class="fld">片頭片尾<select data-bind="adv.introOutro">' + opts(SPEC.ADV.introOutro, a.introOutro) + '</select></label>' +
    '</div></details>';
  return h + nextBtns();
}
function refreshSlider(code) {
  var tpls = allTpls(), sl = E.sliders(state, tpls), i = SPEC.SLIDERS.findIndex(function (s) { return s.code === code; });
  var row = $('sl-' + code); if (!row) return;
  var tmp = document.createElement('div'); tmp.innerHTML = sliderRow(sl[i], SPEC.SLIDERS[i]);
  var nw = tmp.firstChild;
  row.querySelector('.lvl').outerHTML = nw.querySelector('.lvl').outerHTML;
  row.querySelector('.ins').outerHTML = nw.querySelector('.ins').outerHTML;
}

/* ---------- 04 分鏡 ---------- */
function renderShots() {
  var tpls = allTpls();
  var h = layerHead('04', 'SHOTS', '鏡頭骨架：一連串鏡頭', 'var(--c4)', '任何影片都寫成一連串鏡頭，每個鏡頭欄位相同，後面的配音、畫面、合成模組都不用改。先用配方排出草稿，再自己改或交給 AI 寫旁白。');
  h += '<div class="card"><h3>🎬 分鏡表<span class="r no-print"><button class="btn sm rec" data-act="draft">⚡ 依配方排出分鏡草稿</button><button class="btn sm ghost" data-act="addShot">＋ 新增一鏡</button><button class="btn sm ghost" data-act="toImport">⇩ 匯入 AI 回覆</button>' + (state.shots.length ? '<button class="btn sm ghost" data-act="clearShots">清空</button>' : '') + '</span></h3>';
  h += '<div id="shotMeta"></div>';
  if (!state.shots.length) h += '<p class="muted">還沒有鏡頭。按「⚡ 依配方排出分鏡草稿」，會依模板段落、長度與 6 個滑桿自動算出鏡頭數、每鏡秒數、畫面來源、轉場和畫面文字。</p>';
  else {
    var segs = E.segments(state, tpls), segOpts = segs.slice();
    state.shots.forEach(function (x) { if (x.seg && segOpts.indexOf(x.seg) < 0) segOpts.push(x.seg); });
    h += '<div class="tw"><table class="t shots"><thead><tr><th>鏡號</th><th>段落</th><th>旁白</th><th>畫面來源</th><th>畫面描述</th><th>秒數</th><th>轉場</th><th>畫面文字</th><th>時間</th><th></th></tr></thead><tbody>';
    state.shots.forEach(function (x, i) {
      h += '<tr id="shot' + i + '"' + (i === hlShot ? ' class="hl"' : '') + '><td><span class="segdot" style="background:' + segColor(x.seg) + '"></span>' + (i + 1) + '</td>' +
        '<td><select class="in" data-bind="shots.' + i + '.seg">' + opts(segOpts, x.seg) + '</select></td>' +
        '<td class="narr"><textarea class="in' + (E.isDraft(x.narr) ? ' draft' : '') + '" data-bind="shots.' + i + '.narr" rows="2">' + esc(x.narr) + '</textarea><span class="cc" id="cc' + i + '"></span></td>' +
        '<td><select class="in" data-bind="shots.' + i + '.src">' + opts(SPEC.SOURCES, x.src) + '</select></td>' +
        '<td class="desc"><textarea class="in" data-bind="shots.' + i + '.desc" rows="2">' + esc(x.desc) + '</textarea></td>' +
        '<td><input class="in sec" type="number" min="0.5" step="0.5" data-bind="shots.' + i + '.sec" value="' + esc(x.sec) + '"></td>' +
        '<td><select class="in" data-bind="shots.' + i + '.trans">' + opts(SPEC.TRANSITIONS, x.trans) + '</select></td>' +
        '<td class="txt"><input class="in" data-bind="shots.' + i + '.text" value="' + esc(x.text) + '"></td>' +
        '<td class="tc" id="tc' + i + '"></td>' +
        '<td style="white-space:nowrap"><button class="icon-btn" data-act="shotUp" data-i="' + i + '" title="上移">↑</button> <button class="icon-btn" data-act="shotDup" data-i="' + i + '" title="複製一鏡">⧉</button> <button class="icon-btn" data-act="shotDel" data-i="' + i + '" title="刪除">✕</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '<h3 style="font-size:.95rem;margin:.9rem 0 .2rem">🔎 檢查清單</h3><ul class="issues" id="issues"></ul></div>';
  h += '<details class="card adv"><summary>📐 鏡頭骨架欄位規格<span class="muted">所有影片共用的 7 個欄位</span></summary><div class="tw" style="margin-top:.6rem"><table class="t"><thead><tr><th>欄位</th><th>格式</th><th>說明</th><th>範例</th></tr></thead><tbody>' +
    SPEC.SHOT_FIELDS.map(function (f) { return '<tr><td><b>' + f.name + '</b></td><td>' + f.fmt + '</td><td>' + f.note + '</td><td>' + esc(f.eg) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
  setTimeout(refreshShotsMeta, 0);
  return h + nextBtns();
}
function refreshShotsMeta() {
  var tpls = allTpls(), meta = $('shotMeta'); if (!meta) return;
  var tot = E.totals(state.shots), L = E.length(state, tpls), tm = E.timing(state.shots), cps = E.charsPerSec(state);
  var h = '<div class="stats"><div class="stat"><small>分鏡總長／採用長度</small><b>' + tot.total + '</b><small> / ' + L + ' 秒</small></div><div class="stat"><small>鏡頭數</small><b>' + tot.count + '</b></div><div class="stat"><small>平均每鏡秒數</small><b>' + tot.avg + '</b></div><div class="stat"><small>旁白字數上限（語速' + esc(state.adv.speed) + '）</small><b>' + Math.round(tot.total * cps) + '</b><small> 字</small></div></div>';
  if (state.shots.length) {
    var span = Math.max(tot.total, L) || 1;
    h += '<div class="timeline" aria-label="時間軸">' + state.shots.map(function (x, i) { var s = Math.max(0, +x.sec || 0); return '<div data-jump="' + i + '" style="flex:0 0 ' + (s / span * 100) + '%;background:' + segColor(x.seg) + '" title="#' + (i + 1) + ' ' + esc(x.seg) + '　' + s + ' 秒">' + (i + 1) + '</div>'; }).join('') + '</div>' +
      '<div class="target-line"><div class="mk" style="left:' + (L / span * 100) + '%"><span>目標 ' + L + 's</span></div></div>' +
      '<div class="ruler"><span>00:00</span><span>' + E.fmtTime(span / 2) + '</span><span>' + E.fmtTime(span) + '</span></div><div style="height:.6rem"></div>';
  }
  meta.innerHTML = h;
  state.shots.forEach(function (x, i) {
    var tc = $('tc' + i); if (tc) tc.innerHTML = E.fmtTime(tm[i].start) + '<br>' + E.fmtTime(tm[i].end);
    var cc = $('cc' + i); if (cc) { var n = E.isDraft(x.narr) ? 0 : x.narr.replace(/\s/g, '').length, lim = Math.round((+x.sec || 0) * cps); cc.textContent = E.isDraft(x.narr) ? '草稿・建議 ≤ ' + lim + ' 字' : n + ' / ' + lim + ' 字'; cc.className = 'cc' + (n > lim * 1.25 ? ' over' : ''); }
  });
  var is = $('issues'); if (is) is.innerHTML = E.checks(state, tpls).map(function (c) { return '<li class="' + c[0] + '">' + esc(c[1]) + '</li>'; }).join('');
}

/* ---------- 05 輸出 ---------- */
function renderOutput() {
  var o = state.opt;
  var h = layerHead('05', 'OUTPUT', '輸出：指令、配方與檔案', 'var(--rec)', '組合好的 AI 指令可以直接貼給 ChatGPT／Gemini／Claude；AI 回覆的分鏡可以貼回來。配方 JSON 給後面的配音、畫面、字幕、合成模組使用。');
  h += '<div class="flowline no-print"><span>配方</span><i>→</i>' + SPEC.MODULES.map(function (m) { return '<span>' + m.icon + ' ' + m.name + '</span>'; }).join('<i>→</i>') + '</div>';
  h += '<div class="card"><h3>🤖 組合好的 AI 指令<span class="r no-print"><button class="btn sm" data-act="copyPrompt">複製指令</button></span></h3>' +
    '<div class="opts no-print"><label><input type="checkbox" data-opt="jsonOut"' + (o.jsonOut ? ' checked' : '') + '> 要求 AI 用 JSON 回傳（方便貼回來）</label><label><input type="checkbox" data-opt="withMats"' + (o.withMats ? ' checked' : '') + '> 附上素材清單與角色規則</label><label><input type="checkbox" data-opt="withAdv"' + (o.withAdv ? ' checked' : '') + '> 附上進階設定</label></div>' +
    '<textarea class="out prompt" id="outPrompt" readonly rows="12"></textarea>' +
    '<div class="row no-print" style="margin-top:.5rem"><span class="small muted">複製並開啟：</span>' + SPEC.AI_SITES.map(function (s, i) { return '<button class="btn sm ghost" data-act="openAi" data-i="' + i + '">' + s[0] + ' ↗</button>'; }).join('') +
    '<span style="flex:1"></span><button class="btn sm rec" data-act="runAi">✨ 用我的 AI 金鑰直接排分鏡</button></div><p class="small muted" id="aiStatus" style="margin:.4rem 0 0"></p>' +
    '<p class="small muted" style="margin:.3rem 0 0">素材檔案不會自動附上；若素材是 PDF 或圖片，請在 AI 對話裡一起上傳，或先貼「內容摘錄」。</p></div>';
  h += '<div class="card no-print" id="importCard"><h3>⇩ 貼回 AI 的分鏡</h3><p class="small muted" style="margin:0 0 .4rem">支援 JSON 陣列、Markdown 表格，或從 Excel 複製（第一列要有「段落」「旁白」）。</p><textarea class="in" id="importTxt" rows="5" placeholder=\'[{"段落":"鉤子","旁白":"…","畫面來源":"AI 生成","畫面描述":"…","秒數":4,"轉場":"硬切","畫面文字":"…"}]\'></textarea>' +
    '<div class="row" style="margin-top:.5rem"><button class="btn" data-act="importReplace">取代目前分鏡</button><button class="btn ghost" data-act="importAppend">接在後面</button></div></div>';
  h += '<div class="card no-print"><h3>⬇ 下載</h3><div class="row">' +
    '<button class="btn ghost" data-act="dlRecipe">🧾 配方 JSON</button><button class="btn ghost" data-act="dlCsv">📊 分鏡 CSV（Excel）</button><button class="btn ghost" data-act="dlSrt">💬 字幕 SRT（估算）</button><button class="btn ghost" data-act="dlMd">📄 規格書 Markdown</button><button class="btn ghost" data-act="printSpec">🖨 列印／存 PDF</button><button class="btn ghost" data-act="dlProject">💾 專案檔（可再開啟）</button></div>' +
    '<p class="small muted" style="margin:.5rem 0 0">SRT 時間是依每鏡秒數估算；配好音後，請用實際音檔長度回寫秒數再匯出。草稿旁白不會放進 SRT。</p></div>';
  h += '<div class="card"><h3>🔌 生成模組（可替換的插座）</h3><p class="small muted" style="margin:0 0 .5rem">每個模組只認配方 JSON 的固定欄位；換更好的 AI 工具時，只換那一個模組。</p><div class="mods">';
  SPEC.MODULES.forEach(function (m) {
    h += '<div class="mod"><b>' + m.icon + ' ' + m.name + '</b><div class="io"><span>IN</span><span>' + m.in + '</span><span>OUT</span><span>' + m.out + '</span></div>' +
      '<label class="fld" style="font-weight:400">使用工具<select data-bind="tools.' + m.id + '">' + opts(m.tools, state.tools[m.id]) + '</select></label>' +
      '<div class="feed">' + esc(moduleFeed(m.id)) + '</div><span class="small muted">註：' + m.note + '</span></div>';
  });
  h += '</div></div>';
  h += '<details class="card adv"><summary>🧾 配方 JSON 預覽<span class="muted">schema ai-video-recipe/1</span></summary><div class="row no-print" style="margin:.5rem 0"><button class="btn sm" data-act="copyRecipe">複製 JSON</button></div><textarea class="out" id="outRecipe" readonly rows="16"></textarea></details>';
  return h + nextBtns();
}
function moduleFeed(id) {
  var sh = state.shots, a = state.adv, written = sh.filter(function (x) { return !E.isDraft(x.narr); }).length;
  var sl = E.sliders(state, allTpls());
  if (id === 'script') return '這份配方給它：主題、' + state.mats.filter(function (m) { return m.role === '事實依據'; }).length + ' 份事實依據、' + E.segments(state, allTpls()).length + ' 個段落、6 句滑桿指令';
  if (id === 'voice') return written + ' 句旁白（共 ' + sh.length + ' 鏡）；' + a.gender + '・' + a.age + '・語速' + a.speed;
  if (id === 'visual') { var c = {}; sh.forEach(function (x) { c[x.src] = (c[x.src] || 0) + 1; }); return SPEC.SOURCES.map(function (s) { return s + ' ' + (c[s] || 0); }).join('、') + '；真實感 ' + sl[4].value; }
  if (id === 'subtitle') return a.subStyle + '；' + written + ' 段字幕';
  return a.ratio + '；' + sh.length + ' 鏡、' + E.totals(sh).total + ' 秒' + (a.music ? '；配樂：' + a.music : '');
}
function fillOutputs() {
  var p = $('outPrompt'); if (p) p.value = E.prompt(state, allTpls());
  var r = $('outRecipe'); if (r) r.value = JSON.stringify(E.recipe(state, allTpls()), null, 2);
}

/* ---------- 側欄配方卡 ---------- */
function renderAside() {
  var tpls = allTpls(), t = E.findTpl(tpls, state.tpl), sl = E.sliders(state, tpls), L = E.length(state, tpls), tot = E.totals(state.shots);
  var roles = {}; state.mats.forEach(function (m) { roles[m.role] = (roles[m.role] || 0) + 1; });
  var issues = state.shots.length || state.topic ? E.checks(state, tpls).filter(function (c) { return c[0] !== 'ok'; }) : [];
  var pct = L ? Math.min(100, tot.total / L * 100) : 0;
  var h = '<div class="recipe"><div class="stripes"></div><div class="in-r"><h3>配方卡<small>RECIPE</small></h3><div class="kv">' +
    '<span>主題</span><b>' + esc(state.topic || '（未填）') + '</b><span>模板</span><b>' + esc(t.name) + '</b><span>段落</span><b>' + E.segments(state, tpls).length + ' 段</b>' +
    '<span>素材</span><b>' + (state.mats.length ? Object.keys(roles).map(function (k) { return k + ' ' + roles[k]; }).join('、') : '無') + '</b><span>比例</span><b>' + esc(state.adv.ratio) + '</b></div>' +
    '<div class="small" style="display:flex;justify-content:space-between"><span>分鏡 ' + tot.count + ' 鏡</span><span class="mono">' + tot.total + ' / ' + L + 's</span></div><div class="lenbar"><i class="' + (tot.total > L * 1.15 ? 'over' : '') + '" style="width:' + pct + '%"></i></div>' +
    '<div class="meters">' + sl.map(function (x) { return '<div class="meter"><span>' + x.code + ' ' + esc(x.name.replace(/（CTA）/, '')) + '</span><span class="b"><i class="' + (x.custom != null ? 'ov' : '') + '" style="width:' + x.value + '%"></i></span><span class="v">' + x.value + x.levelName + '</span></div>'; }).join('') + '</div>' +
    '<div class="small" style="color:#8D9097">橘色＝已自訂，紫色＝沿用模板</div>' +
    (issues.length ? '<ul class="warns">' + issues.slice(0, 4).map(function (c) { return '<li>' + esc(c[1]) + '</li>'; }).join('') + (issues.length > 4 ? '<li>…還有 ' + (issues.length - 4) + ' 項，見分鏡頁</li>' : '') + '</ul>' : '') +
    '<button class="btn" data-act="copyPrompt">📋 複製 AI 指令</button></div></div>' +
    '<div class="side-foot"><a href="manual.html">📖 操作手冊</a><button data-act="warn">⚠ 使用警語</button><button data-act="settings">⚙ 常用設定</button><a href="manual.html#creator">👤 創作者</a></div>';
  $('aside').innerHTML = h;
}

/* ---------- 綁定與更新 ---------- */
function setPath(path, val) {
  var ks = path.split('.'), o = state;
  for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = val;
}
document.addEventListener('input', function (e) {
  var t = e.target;
  if (t.id === 'projName') { state.name = t.value; save(); return; }
  if (t.dataset.bind) {
    var v = t.value, p = t.dataset.bind;
    if (t.type === 'number' || t.type === 'range') v = t.value === '' ? '' : +t.value;
    if (/\.sec$/.test(p) && v === '') v = 0;
    setPath(p, v); save();
    if (p === 'adv.musicVol' && $('mvv')) $('mvv').textContent = v;
    if (p === 'adv.brandColor') document.querySelectorAll('[data-bind="adv.brandColor"]').forEach(function (x) { if (x !== t && (x.type !== 'color' || /^#[0-9a-f]{6}$/i.test(v))) x.value = v; });
    var m = p.match(/^mats\.(\d+)\.(weight|role)$/);
    if (m) { var c = E.weightCheck(state.mats[+m[1]]), el = $('wc' + m[1]); if (el) { el.className = 'chk ' + c.cls; el.textContent = c.text; } }
    if (p === 'lenCustom' && $('lenUse')) $('lenUse').textContent = E.length(state, allTpls()) + ' 秒';
    if (/^shots\./.test(p)) { if (/\.narr$/.test(p)) t.classList.toggle('draft', E.isDraft(t.value)); refreshShotsMeta(); }
    renderAside();
    return;
  }
  if (t.dataset.sl || t.dataset.sln) {
    var code = t.dataset.sl || t.dataset.sln;
    state.ov[code] = t.value === '' ? null : Math.max(0, Math.min(100, Math.round(+t.value)));
    var row = $('sl-' + code), x = E.sliders(state, allTpls()).filter(function (s) { return s.code === code; })[0];
    if (t.dataset.sl) row.querySelector('[data-sln]').value = x.value; else row.querySelector('[data-sl]').value = x.value;
    refreshSlider(code); save(); renderAside(); return;
  }
  if (t.dataset.seg != null) {
    var segs = E.segments(state, allTpls()).slice(), old = segs[+t.dataset.seg], nv = t.value.trim();
    if (!nv) return;
    segs[+t.dataset.seg] = nv; state.segs = segs;
    state.shots.forEach(function (s) { if (s.seg === old) s.seg = nv; });
    t.style.setProperty('--w', Math.max(2, nv.length)); save(); renderAside();
  }
});
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.dataset.opt) { state.opt[t.dataset.opt] = t.checked; save(); fillOutputs(); return; }
  if (t.dataset.bind && /^(mats\.\d+\.role|shots\.\d+\.seg|tools\.)/.test(t.dataset.bind)) render();
  if (t.dataset.bind && /^shots\./.test(t.dataset.bind) && tab === 'output') fillOutputs();
});

function selectTpl(id) {
  if (id === state.tpl) return;
  var had = Object.keys(state.ov).some(function (k) { return state.ov[k] != null; }) || state.segs || state.lenCustom !== '';
  state.tpl = id; state.segs = null; state.lenCustom = ''; Object.keys(state.ov).forEach(function (k) { state.ov[k] = null; });
  save(); render();
  toast('已套用「' + E.findTpl(allTpls(), id).name + '」' + (had ? '，滑桿、段落與長度改回模板預設' : ''));
}
function moveIn(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return; var x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
function doDraft() { state.shots = E.draftShots(state, allTpls()); hlShot = -1; saveNow(); render(); toast('已排出 ' + state.shots.length + ' 鏡草稿'); }
function importShots(append) {
  var txt = $('importTxt').value, list;
  try { list = E.parseShots(txt); } catch (err) { toast(err.message); return; }
  state.shots = append ? state.shots.concat(list) : list; saveNow(); $('importTxt').value = '';
  toast('匯入 ' + list.length + ' 鏡'); go('shots');
}
function loadExample(i) {
  var x = SPEC.EXAMPLES[i];
  state = E.fromExample(x, prefs.defSpeed);
  if (!state.shots.length) state.shots = E.draftShots(state, allTpls());
  openExcerpt = {}; hlShot = -1; saveNow(); $('projName').value = state.name; closeModal(); go('content');
  toast('已載入完整範例「' + x.name + '」：五個步驟都填好了，按上方步驟逐一看，或直接到「05 輸出」');
}

/* ---------- 我的專案 ---------- */
function projects() { return lsJson('projects', []); }
function saveProject(name) {
  var list = projects().filter(function (p) { return p.name !== name; });
  state.name = name; $('projName').value = name;
  list.unshift({name: name, at: new Date().toISOString(), data: clone(state)});
  if (!lsSet('projects', JSON.stringify(list.slice(0, 50)))) { toast('儲存空間不足，請先刪除舊專案或下載專案檔'); return; }
  saveNow(); toast('已儲存「' + name + '」');
}
function openProjects() {
  var list = projects();
  var h = '<h2>🗂 我的專案</h2><p class="small muted">專案存在這個瀏覽器裡（最多 50 個）。換電腦或清除瀏覽器資料前，請下載專案檔備份。</p>';
  h += list.length ? '<ul class="list">' + list.map(function (p, i) { return '<li><div class="grow"><b>' + esc(p.name) + '</b><br><span class="small muted">' + esc(new Date(p.at).toLocaleString('zh-TW')) + '・' + esc(E.findTpl(allTpls(), p.data.tpl).name) + '・' + (p.data.shots || []).length + ' 鏡</span></div><button class="btn sm" data-act="projOpen" data-i="' + i + '">開啟</button><button class="btn sm ghost" data-act="projDel" data-i="' + i + '">刪除</button></li>'; }).join('') + '</ul>' : '<p class="muted">還沒有儲存的專案。按上方「💾 儲存」就會出現在這裡。</p>';
  h += '<div class="mfoot"><button class="btn ghost" data-act="openFile">📂 開啟專案檔（.json）</button><button class="btn ghost" data-act="dlProject">💾 下載目前專案檔</button><button class="btn" data-act="close">關閉</button></div>';
  openModal(h);
}
function sampleLinks(x) {
  var l = (x.mats || []).filter(function (m) { return m.excerpt; });
  return l.length ? '<br><span class="small">📎 範例素材檔：' + l.map(function (m) { var f = SPEC.sampleName(m); return '<a href="samples/' + encodeURIComponent(f) + '" download="' + esc(f) + '">' + esc(f) + '</a>'; }).join('、') + '</span>' : '';
}
function openExamples() {
  openModal('<h2>📂 範例</h2><p class="small muted">每個範例都把五個步驟填好了：主題與補充說明、素材（含內容摘錄）、結構、滑桿、進階設定、寫好旁白的完整分鏡，檢查清單全部通過。內容都是虛構示範。載入會取代目前畫面上的專案（已儲存的專案不受影響）。想練習上傳，可以先下載「範例素材檔」，再到「01 內容」按 📁 選擇檔案。</p><ul class="list">' + SPEC.EXAMPLES.map(function (x, i) {
    return '<li><div class="grow"><b>' + esc(x.name) + '</b>　<span class="small muted">' + esc(E.findTpl(allTpls(), x.tpl).name) + '・' + esc((x.adv && x.adv.ratio) || x.ratio || '16:9') + '・' + (x.len || E.findTpl(allTpls(), x.tpl).len) + ' 秒・' + (x.shots || []).length + ' 鏡</span><br><span class="small muted">' + esc(x.note) + '</span>' + sampleLinks(x) + '</div><button class="btn sm" data-act="loadEx" data-i="' + i + '">載入</button></li>';
  }).join('') + '</ul><div class="mfoot"><button class="btn" data-act="close">關閉</button></div>');
}

/* ---------- 使用警語、設定 ---------- */
var WARN_HTML = '<h2>⚠ 使用警語</h2><ul>' +
  '<li><b>本工具只產生影片規格、分鏡與給 AI 的指令，不會實際生成或合成影片。</b>配音、畫面、合成需要另外的工具。</li>' +
  '<li>AI 依指令寫出的腳本可能有錯誤或捏造的內容。<b>事實、數字、法規、補助金額請以官方或原始資料為準</b>，發布前務必人工查核。</li>' +
  '<li>素材請確認有使用權：別人的影片、圖片、音樂只能當「風格參考」學感覺，不可直接放進影片或照抄；人物照片要取得當事人同意。</li>' +
  '<li>專案資料只存在你的瀏覽器（localStorage），不會上傳到本工具的任何伺服器；清除瀏覽器資料就會消失，請自行下載專案檔備份。</li>' +
  '<li>選用的 AI 金鑰只存在這個瀏覽器，由瀏覽器直接呼叫你選的 AI 供應商，費用由你的帳號計算；共用電腦請勿儲存金鑰。</li>' +
  '<li>範例內容皆為虛構示範，不代表任何真實機構或產品。</li></ul>';
function showWarn() { openModal(WARN_HTML + '<div class="mfoot"><button class="btn" data-act="close">我知道了</button></div>'); }
var PROVIDERS = {
  gemini: {label: 'Gemini（Google AI Studio）', models: [['gemini-3.5-flash', 'Gemini 3.5 Flash（均衡，推薦）'], ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro 預覽版（最強）'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite（快速省錢）']]},
  openai: {label: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', models: [['gpt-5-mini', 'GPT-5 mini（均衡，推薦）'], ['gpt-5', 'GPT-5（最強）'], ['gpt-4o-mini', 'GPT-4o mini（快速省錢）']]},
  claude: {label: 'Claude（Anthropic）', models: [['claude-sonnet-5-5', 'Claude Sonnet 5.5（均衡，推薦）'], ['claude-opus-5-5', 'Claude Opus 5.5（最強）'], ['claude-haiku-5-5', 'Claude Haiku 5.5（快速省錢）']]},
  openrouter: {label: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', models: [['openai/gpt-4o-mini', 'OpenAI GPT-4o mini（推薦）'], ['google/gemini-2.5-flash', 'Google Gemini 2.5 Flash'], ['anthropic/claude-sonnet-4.5', 'Anthropic Claude Sonnet 4.5']]},
  custom: {label: '自訂（OpenAI 相容端點，例如 Ollama、LM Studio）', models: []}
};
function sec(id, title, val, body) { return '<details class="set-sec" data-sec="' + id + '"><summary><span class="sst">' + title + '</span><span class="ssv">' + esc(val) + '</span></summary><div class="set-body">' + body + '</div></details>'; }
function openSettings() {
  var pv = PROVIDERS[prefs.aiProvider] || PROVIDERS.gemini, standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var h = '<div class="row" style="margin-bottom:.5rem"><h2 style="flex:1;margin:0">⚙ 常用設定</h2><button class="btn sm ghost" data-act="foldall">全部展開／收合</button></div>' +
    sec('def', '新專案預設值', E.findTpl(allTpls(), prefs.defTpl).name + '・' + prefs.defRatio + '・語速' + prefs.defSpeed,
      '<label class="fld">預設模板<select id="pTpl">' + opts(allTpls().map(function (t) { return [t.id, t.name]; }), prefs.defTpl) + '</select></label>' +
      '<label class="fld">預設畫面比例<select id="pRatio">' + opts(SPEC.ADV.ratio, prefs.defRatio) + '</select></label>' +
      '<label class="fld">預設語速<select id="pSpeed">' + opts(SPEC.ADV.speed.map(function (x) { return x[0]; }), prefs.defSpeed) + '</select></label><div><button class="btn sm" data-act="savePrefs">儲存預設值</button></div>') +
    sec('ai', 'AI 金鑰（選用）', prefs.aiKey || prefs.aiProvider === 'custom' ? pv.label.replace(/（.*/, '') + '・已設定' : '未設定',
      '<p class="small muted" style="margin:0">不填也能用：複製指令貼到 ChatGPT／Gemini／Claude 網頁版即可。填了之後，「輸出」頁可以一鍵直接排分鏡。金鑰只存在這個瀏覽器。</p>' +
      '<label class="fld">供應商<select id="pProv">' + opts(Object.keys(PROVIDERS).map(function (k) { return [k, PROVIDERS[k].label]; }), prefs.aiProvider) + '</select></label>' +
      '<label class="fld">API 金鑰<input id="pKey" type="password" autocomplete="off" value="' + esc(prefs.aiKey) + '" placeholder="貼上金鑰"></label>' +
      '<label class="fld">模型<select id="pModel">' + (pv.models.length ? opts(pv.models, prefs.aiModel) : '<option value="">（請在下方填模型名稱）</option>') + '</select></label>' +
      '<label class="fld">自訂模型名稱 <span class="h">（選填，會優先使用）</span><input id="pModelC" value="' + esc(prefs.aiModelCustom) + '"></label>' +
      '<label class="fld">自訂端點網址 <span class="h">（只有「自訂」要填，例如 http://localhost:11434/v1）</span><input id="pBase" value="' + esc(prefs.aiBase) + '"></label>' +
      '<div class="row"><button class="btn sm" data-act="saveAi">儲存</button><button class="btn sm ghost" data-act="clearAi">清除金鑰</button></div>') +
    sec('ui', '介面', prefs.fs === 'l' ? '字體大' : '字體標準', '<div class="row"><button class="btn sm' + (prefs.fs === 'l' ? ' ghost' : '') + '" data-fs="n">標準字體</button><button class="btn sm' + (prefs.fs === 'l' ? '' : ' ghost') + '" data-fs="l">大字體</button></div>') +
    sec('data', '資料與備份', projects().length + ' 個專案・' + myTpls.length + ' 個我的模板',
      '<div class="row"><button class="btn sm ghost" data-act="backup">⬇ 下載全部備份</button><button class="btn sm ghost" data-act="restore">⬆ 還原備份</button><button class="btn sm ghost" data-act="wipe" style="color:var(--bad)">清除全部資料</button></div>') +
    sec('about', '關於本工具', '', '<p style="margin:0">👤 創作者 Mark Tsai（蔡豐全）<br><a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a></p><div class="row"><a class="btn sm ghost" href="manual.html">📖 操作手冊</a><a class="btn sm ghost" href="manual.html#creator">👤 關於創作者</a><button class="btn sm ghost" data-act="warn">⚠ 使用警語</button>' + (standalone ? '' : '<button class="btn sm ghost" data-act="install">📲 加入主畫面</button>') + '</div><p class="small muted" style="margin:0">訪客數 <img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.aivideospecgenerator" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle"></p>') +
    '<div class="mfoot"><button class="btn" data-act="close">關閉</button></div>';
  openModal(h);
  var open = lsJson('fold', []);
  document.querySelectorAll('.set-sec').forEach(function (d) { d.open = open.indexOf(d.dataset.sec) >= 0; d.addEventListener('toggle', saveFold); });
  $('pProv').addEventListener('change', function () { var p = PROVIDERS[this.value]; $('pModel').innerHTML = p.models.length ? opts(p.models, '') : '<option value="">（請在下方填模型名稱）</option>'; });
}
function saveFold() { var o = []; document.querySelectorAll('.set-sec').forEach(function (d) { if (d.open) o.push(d.dataset.sec); }); lsSet('fold', JSON.stringify(o)); }
function applyView() { document.documentElement.dataset.fs = prefs.fs === 'l' ? 'l' : 'n'; }

/* ---------- BYOK AI ---------- */
function aiModel() { return (prefs.aiModelCustom || '').trim() || prefs.aiModel || ((PROVIDERS[prefs.aiProvider] || PROVIDERS.gemini).models[0] || [''])[0]; }
function aiReady() { return prefs.aiProvider === 'custom' ? !!(prefs.aiBase || '').trim() && !!aiModel() : !!prefs.aiKey; }
function customUrl(base) { base = (base || '').trim().replace(/\/+$/, ''); return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions'; }
async function callLLM(prompt) {
  var provider = prefs.aiProvider, model = aiModel(), key = prefs.aiKey, url, headers, body, extract;
  if (provider === 'claude') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = {'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'};
    body = {model: model, max_tokens: 8000, messages: [{role: 'user', content: prompt}]};
    extract = function (d) { return (d.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join(''); };
  } else if (provider === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(geminiModelFix(model)) + ':generateContent';
    headers = {'content-type': 'application/json', 'x-goog-api-key': key};
    body = {contents: [{parts: [{text: prompt}]}], generationConfig: {responseMimeType: 'application/json'}};
    extract = function (d) { var parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []; return parts.map(function (p) { return p.text || ''; }).join(''); };
  } else {
    url = provider === 'custom' ? customUrl(prefs.aiBase) : PROVIDERS[provider].url;
    headers = {'content-type': 'application/json'}; if (key) headers.authorization = 'Bearer ' + key;
    body = {model: model, messages: [{role: 'user', content: prompt}]};
    extract = function (d) { return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content; };
  }
  for (var attempt = 1; attempt <= 3; attempt++) {
    var resp = await fetch(url, {method: 'POST', headers: headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180000)});
    var raw = await resp.text();
    if (resp.ok) { var t = extract(JSON.parse(raw)); if (!t) throw new Error('回應中沒有文字內容'); return t; }
    var msg = raw.slice(0, 200); try { var e = JSON.parse(raw); msg = (e.error && e.error.message) || e.message || msg; } catch (x) {}
    if ({429: 1, 500: 1, 503: 1, 529: 1}[resp.status] && attempt < 3) { setAi('服務忙碌（' + resp.status + '），' + attempt * 6 + ' 秒後重試…'); await new Promise(function (r) { setTimeout(r, attempt * 6000); }); continue; }
    throw new Error('HTTP ' + resp.status + '：' + msg);
  }
}
function setAi(m) { var s = $('aiStatus'); if (s) s.textContent = m; }
var aiBusy = false;
async function runAi() {
  if (!aiReady()) { openSettings(); setTimeout(function () { var d = document.querySelector('[data-sec="ai"]'); if (d) d.open = true; }, 30); toast('請先設定 AI 金鑰，或改用「複製指令」貼到 AI 網頁版'); return; }
  if (aiBusy) return;
  if (!(state.topic || '').trim()) { toast('請先在「內容」填影片主題'); return; }
  aiBusy = true; setAi('⏳ 正在請 ' + aiModel() + ' 排分鏡，長片可能要 1 分鐘…');
  var st = clone(state); st.opt.jsonOut = true;
  try {
    var txt = await callLLM(E.prompt(st, allTpls()));
    var list = E.parseShots(txt);
    state.shots = list; saveNow(); setAi('✓ AI 排好 ' + list.length + ' 鏡（' + aiModel() + '）。請到「分鏡」頁檢查並查核事實。');
    toast('AI 排好 ' + list.length + ' 鏡'); fillOutputs(); renderAside();
  } catch (err) { setAi('✕ 失敗：' + (err.name === 'TimeoutError' ? '等太久沒回應，請再試一次或換快一點的模型' : err.message) + '。也可以改用「複製指令」貼到 AI 網頁版。'); }
  aiBusy = false;
}

/* ---------- 列印規格書 ---------- */
function printSpec() {
  var md = E.markdown(state, allTpls()).split('\n'), html = '', inTable = false, inCode = false, code = [];
  md.forEach(function (l) {
    if (/^```/.test(l)) { if (inCode) { html += '<pre style="white-space:pre-wrap;font-size:11px;border:1px solid #999;padding:8px">' + esc(code.join('\n')) + '</pre>'; code = []; } inCode = !inCode; return; }
    if (inCode) { code.push(l); return; }
    if (/^\|/.test(l)) {
      if (/^\|---/.test(l)) return;
      var cells = l.replace(/^\|\s?|\s?\|$/g, '').split(' | ');
      if (!inTable) { html += '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:11px;margin:6px 0"><tr>' + cells.map(function (c) { return '<th style="background:#eee">' + esc(c) + '</th>'; }).join('') + '</tr>'; inTable = true; }
      else html += '<tr>' + cells.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
      return;
    }
    if (inTable) { html += '</table>'; inTable = false; }
    if (/^# /.test(l)) html += '<h1 style="font-size:20px">' + esc(l.slice(2)) + '</h1>';
    else if (/^## /.test(l)) html += '<h2 style="font-size:15px;margin-top:14px;border-bottom:2px solid #000">' + esc(l.slice(3)) + '</h2>';
    else if (/^- /.test(l)) html += '<div style="font-size:12px">・' + esc(l.slice(2)) + '</div>';
  });
  if (inTable) html += '</table>';
  var w = window.open('', '_blank');
  if (!w) { toast('瀏覽器擋住了新視窗，請改下載 Markdown'); return; }
  w.document.write('<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><title>' + esc(fileBase()) + '｜影片規格書</title><style>body{font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;margin:24px;color:#111}@page{size:A4 landscape;margin:12mm}</style></head><body>' + html + '<p style="font-size:10px;color:#666;margin-top:16px">由 AI 影片規格產生器產生 ' + new Date().toLocaleString('zh-TW') + '</p><script>setTimeout(function(){print()},300)<\/script></body></html>');
  w.document.close();
}

/* ---------- 動作 ---------- */
var acts = {
  close: closeModal, warn: showWarn, settings: openSettings, examples: openExamples, projects: openProjects,
  modalOk: function () { var cb = modalCb; if (cb && cb() === false) return; closeModal(); },
  saveProj: function () { askText('💾 儲存專案', '專案名稱（同名會覆蓋）', state.name || state.topic, saveProject); },
  newProj: function () { confirmBox('＋ 新專案', '目前畫面上的內容會清空（已儲存的專案不受影響）。確定要開新專案嗎？', '開新專案', function () { state = normalize(null); openExcerpt = {}; saveNow(); $('projName').value = ''; go('content'); }); },
  addMat: function () { if (state.mats.length >= 30) { toast('最多 30 份素材'); return; } state.mats.push({src: '', type: 'PDF', role: '事實依據', weight: 90, note: '', excerpt: ''}); save(); render(); var l = document.querySelectorAll('[data-bind$=".src"]'); if (l.length) l[l.length - 1].focus(); },
  delMat: function (i) { var m = state.mats[i]; var go_ = function () { state.mats.splice(i, 1); openExcerpt = {}; save(); render(); toast('已刪除素材，後面的編號往前遞補；分鏡裡的「素材 #編號」請自行確認'); }; if ((m.src || m.excerpt || '').trim()) confirmBox('刪除素材', '要刪除素材 #' + (i + 1) + '「' + esc(m.src) + '」嗎？', '刪除', go_); else go_(); },
  matUp: function (i) { moveIn(state.mats, i, -1); openExcerpt = {}; save(); render(); },
  matPick: function (i) { matTarget = (typeof i === 'number' && !isNaN(i)) ? i : -1; var f = $('matIn'); f.multiple = matTarget < 0; f.value = ''; f.click(); },
  toggleEx: function (i) { openExcerpt[i] = !openExcerpt[i]; render(); },
  resetSegs: function () { state.segs = null; save(); render(); },
  segL: function (i) { var s = E.segments(state, allTpls()).slice(); moveIn(s, i, -1); state.segs = s; save(); render(); },
  segR: function (i) { var s = E.segments(state, allTpls()).slice(); moveIn(s, i, 1); state.segs = s; save(); render(); },
  segDel: function (i) { var s = E.segments(state, allTpls()).slice(); if (s.length <= 1) { toast('至少要有一個段落'); return; } s.splice(i, 1); state.segs = s; save(); render(); },
  segAdd: function () { var v = $('newSeg').value.trim(); if (!v) { toast('請輸入段落名稱'); return; } var s = E.segments(state, allTpls()).slice(); s.push(v.slice(0, 20)); state.segs = s; save(); render(); },
  saveTpl: function () {
    askText('＋ 存成我的模板', '模板名稱', E.findTpl(allTpls(), state.tpl).name + '（我的版本）', function (name) {
      var sl = E.sliders(state, allTpls()), id = 'my-' + Date.now().toString(36);
      myTpls.push({id: id, name: name, use: '我的模板', segs: E.segments(state, allTpls()).slice(), s: sl.map(function (x) { return x.value; }), len: E.length(state, allTpls()), mine: true});
      saveTpls(); state.tpl = id; state.segs = null; state.lenCustom = ''; Object.keys(state.ov).forEach(function (k) { state.ov[k] = null; }); save(); render(); toast('已存成我的模板「' + name + '」');
    });
  },
  delTpl: function (i) { var t = myTpls[i]; confirmBox('刪除我的模板', '要刪除「' + esc(t.name) + '」嗎？使用中的專案會改回第一個內建模板。', '刪除', function () { myTpls.splice(i, 1); saveTpls(); if (state.tpl === t.id) { state.tpl = SPEC.TEMPLATES[0].id; } save(); render(); }); },
  slReset: function (c) { state.ov[c] = null; save(); render(); },
  slResetAll: function () { Object.keys(state.ov).forEach(function (k) { state.ov[k] = null; }); save(); render(); toast('已還原模板預設值'); },
  draft: function () {
    var written = state.shots.filter(function (x) { return !E.isDraft(x.narr); }).length;
    if (written) confirmBox('重排分鏡草稿', '目前有 ' + written + ' 鏡已經寫好旁白，重排會全部取代。確定嗎？（可以先到「輸出」下載分鏡 CSV 備份）', '重排', doDraft); else doDraft();
  },
  addShot: function () { var last = state.shots[state.shots.length - 1], segs = E.segments(state, allTpls()); state.shots.push({seg: last ? last.seg : segs[0], narr: '', src: 'AI 生成', desc: '', sec: E.round05(E.paceSec(E.sliders(state, allTpls())[2].value)), trans: '硬切', text: ''}); save(); render(); },
  shotUp: function (i) { moveIn(state.shots, i, -1); save(); render(); },
  shotDup: function (i) { state.shots.splice(i + 1, 0, clone(state.shots[i])); save(); render(); },
  shotDel: function (i) { state.shots.splice(i, 1); save(); render(); },
  clearShots: function () { confirmBox('清空分鏡', '要刪除全部 ' + state.shots.length + ' 鏡嗎？', '清空', function () { state.shots = []; save(); render(); }); },
  toImport: function () { go('output'); setTimeout(function () { var c = $('importCard'); if (c) { c.scrollIntoView({behavior: 'smooth'}); $('importTxt').focus(); } }, 50); },
  importReplace: function () { if (state.shots.length) confirmBox('取代分鏡', '會用貼上的內容取代目前 ' + state.shots.length + ' 鏡。確定嗎？', '取代', function () { importShots(false); }); else importShots(false); },
  importAppend: function () { importShots(true); },
  copyPrompt: function () { copy(E.prompt(state, allTpls()), '已複製 AI 指令'); },
  copyRecipe: function () { copy(JSON.stringify(E.recipe(state, allTpls()), null, 2), '已複製配方 JSON'); },
  openAi: function (i) { var s = SPEC.AI_SITES[i]; copy(E.prompt(state, allTpls()), '已複製指令，請在 ' + s[0] + ' 貼上'); window.open(s[1], '_blank', 'noopener'); },
  runAi: runAi,
  dlRecipe: function () { download(fileBase() + '_配方.json', JSON.stringify(E.recipe(state, allTpls()), null, 2), 'application/json'); },
  dlCsv: function () { if (!state.shots.length) { toast('還沒有分鏡'); return; } download(fileBase() + '_分鏡.csv', E.csv(state), 'text/csv;charset=utf-8'); },
  dlSrt: function () { var s = E.srt(state); if (!s) { toast('還沒有寫好的旁白（草稿不會放進字幕）'); return; } download(fileBase() + '.srt', s); },
  dlMd: function () { download(fileBase() + '_規格書.md', E.markdown(state, allTpls()), 'text/markdown;charset=utf-8'); },
  dlProject: function () { download(fileBase() + '_專案.json', JSON.stringify({app: 'ai-video-spec-generator', v: 1, state: state, templates: myTpls.filter(function (t) { return t.id === state.tpl; })}, null, 2), 'application/json'); },
  printSpec: printSpec,
  openFile: function () { fileMode = 'project'; $('fileIn').value = ''; $('fileIn').click(); },
  restore: function () { fileMode = 'backup'; $('fileIn').value = ''; $('fileIn').click(); },
  projOpen: function (i) { var p = projects()[i]; state = normalize(clone(p.data)); openExcerpt = {}; saveNow(); $('projName').value = state.name; closeModal(); go('content'); toast('已開啟「' + p.name + '」'); },
  projDel: function (i) { var list = projects(), p = list[i]; confirmBox('刪除專案', '要刪除「' + esc(p.name) + '」嗎？', '刪除', function () { list.splice(i, 1); lsSet('projects', JSON.stringify(list)); setTimeout(openProjects, 0); }); },
  loadEx: function (i) { loadExample(i); },
  foldall: function () { var l = document.querySelectorAll('.set-sec'), any = Array.prototype.some.call(l, function (d) { return d.open; }); l.forEach(function (d) { d.open = !any; }); saveFold(); },
  savePrefs: function () { prefs.defTpl = $('pTpl').value; prefs.defRatio = $('pRatio').value; prefs.defSpeed = $('pSpeed').value; savePrefs(); toast('已儲存預設值（新專案生效）'); openSettings(); },
  saveAi: function () { prefs.aiProvider = $('pProv').value; prefs.aiKey = $('pKey').value.trim(); prefs.aiModel = $('pModel').value; prefs.aiModelCustom = $('pModelC').value.trim(); prefs.aiBase = $('pBase').value.trim(); savePrefs(); toast('AI 設定已儲存'); openSettings(); },
  clearAi: function () { prefs.aiKey = ''; savePrefs(); toast('已清除金鑰'); openSettings(); },
  backup: function () { download('影片規格產生器_備份_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({app: 'ai-video-spec-generator', backup: 1, state: state, projects: projects(), templates: myTpls, prefs: Object.assign({}, prefs, {aiKey: ''})}, null, 2), 'application/json'); },
  wipe: function () { confirmBox('清除全部資料', '會刪除目前專案、我的專案、我的模板、設定與 AI 金鑰，無法復原。建議先下載全部備份。', '全部清除', function () { ['state', 'projects', 'tpls', 'prefs', 'fold'].forEach(lsDel); location.reload(); }); },
  install: function () {
    if (window._dp) { window._dp.prompt(); window._dp.userChoice.finally(function () { window._dp = null; }); return; }
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    openModal('<h2>📲 加入主畫面</h2>' + (ios ? '<p>iPhone／iPad：用 Safari 打開，按下方「分享」圖示，選「加入主畫面」。</p>' : '<p>電腦版 Chrome／Edge：按網址列右邊的「安裝」圖示；手機：按瀏覽器「⋮」選「加到主畫面」。</p>') + '<div class="mfoot"><button class="btn" data-act="close">知道了</button></div>');
  }
};
var fileMode = 'project', matTarget = -1, EX_MAX = 6000;
function matTypeOf(f) {
  var n = f.name.toLowerCase(), t = f.type || '';
  if (/\.pdf$/.test(n) || t === 'application/pdf') return 'PDF';
  if (/^image\//.test(t) || /\.(png|jpe?g|gif|webp|svg|heic|bmp)$/.test(n)) return '圖片';
  if (/^video\//.test(t) || /\.(mp4|mov|webm|mkv|avi|m4v)$/.test(n)) return '影片';
  if (/^audio\//.test(t) || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(n)) return '音檔';
  if (/\.(txt|md|markdown|csv|tsv|srt|vtt|json|html?|docx?)$/.test(n) || /^text\//.test(t)) return '文字筆記';
  return '其他';
}
function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
var pdfLib = null;
function loadPdfJs() {
  if (pdfLib) return pdfLib;
  pdfLib = new Promise(function (ok, no) {
    var sc = document.createElement('script'), base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    sc.src = base + 'pdf.min.js';
    sc.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    sc.onerror = function () { pdfLib = null; no(new Error('PDF 讀取元件載入失敗')); };
    document.head.appendChild(sc);
  });
  return pdfLib;
}
function readExcerpt(f) {
  var n = f.name.toLowerCase();
  if (/\.(txt|md|markdown|csv|tsv|srt|vtt|json)$/.test(n) || /^text\/(plain|markdown|csv)/.test(f.type)) return f.text();
  if (/\.html?$/.test(n)) return f.text().then(function (t) { var d = new DOMParser().parseFromString(t, 'text/html'); return (d.body ? d.body.textContent : t).replace(/\n\s*\n+/g, '\n\n'); });
  if (matTypeOf(f) === 'PDF') return loadPdfJs().then(function (lib) { return f.arrayBuffer().then(function (buf) { return lib.getDocument({data: buf, cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/', cMapPacked: true, standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/'}).promise; }); }).then(function (doc) {
    var out = [], p = Promise.resolve();
    for (var k = 1; k <= Math.min(doc.numPages, 30); k++) (function (k) { p = p.then(function () { return doc.getPage(k).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { out.push(tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ''); }).join('')); }); }); })(k);
    return p.then(function () { return out.join('\n\n'); });
  });
  return Promise.resolve('');
}
function addMatFiles(files, target) {
  files = Array.prototype.slice.call(files || []); if (!files.length) return;
  if (target < 0 && state.mats.length + files.length > 30) { toast('最多 30 份素材'); files = files.slice(0, Math.max(0, 30 - state.mats.length)); if (!files.length) return; }
  var pending = 0, got = 0, fail = 0;
  files.forEach(function (f, k) {
    var ty = matTypeOf(f), txt = ty === 'PDF' || ty === '文字筆記', m;
    if (target >= 0 && k === 0 && state.mats[target]) { m = state.mats[target]; m.src = f.name; m.type = ty; }
    else { m = {src: f.name, type: ty, role: txt ? '事實依據' : '必用素材', weight: txt ? 90 : 85, note: '', excerpt: ''}; state.mats.push(m); }
    m.size = fmtSize(f.size);
    if (/\.docx?$/i.test(f.name)) return;
    if (txt) {
      pending++;
      readExcerpt(f).then(function (t) {
        t = (t || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
        if (t && !(m.excerpt || '').trim()) { m.excerpt = t.length > EX_MAX ? t.slice(0, EX_MAX) + '\n…（以下省略，原文共 ' + t.length + ' 字）' : t; got++; }
        else if (!t) fail++;
      }).catch(function () { fail++; }).then(function () {
        if (--pending === 0) { save(); render(); toast('已讀出 ' + got + ' 份文字放進 📝 內容摘錄' + (fail ? '；' + fail + ' 份讀不到文字（掃描檔請自行貼上重點）' : '')); }
      });
    }
  });
  save(); render();
  toast(pending ? '已登記 ' + files.length + ' 份素材，正在讀取文字…' : '已登記 ' + files.length + ' 份素材（檔案不會上傳）');
}
document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-act],[data-tab],[data-tpl],[data-jump],button[data-fs]'); if (!t) return;
  if (t.dataset.tab) { go(t.dataset.tab); return; }
  if (t.dataset.tpl) { selectTpl(t.dataset.tpl); return; }
  if (t.dataset.jump != null) { hlShot = +t.dataset.jump; var r = $('shot' + hlShot); document.querySelectorAll('tr.hl').forEach(function (x) { x.classList.remove('hl'); }); if (r) { r.classList.add('hl'); r.scrollIntoView({behavior: 'smooth', block: 'center'}); } return; }
  if (t.dataset.fs) { prefs.fs = t.dataset.fs; savePrefs(); applyView(); openSettings(); return; }
  var a = acts[t.dataset.act]; if (a) { e.preventDefault(); a(t.dataset.i != null ? +t.dataset.i : t.dataset.c); }
});
$('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && $('modal').classList.contains('show')) closeModal();
  if (e.key === 'Enter' && e.target.id === 'askIn') acts.modalOk();
  if (e.key === 'Enter' && e.target.id === 'newSeg') acts.segAdd();
});
$('matIn').addEventListener('change', function (e) { addMatFiles(e.target.files, matTarget); });
['dragover', 'dragleave', 'drop'].forEach(function (ev) {
  document.addEventListener(ev, function (e) {
    var c = e.target.closest && e.target.closest('#matCard'); if (!c) return;
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
    e.preventDefault();
    if (ev === 'dragover') c.classList.add('drag'); else c.classList.remove('drag');
    if (ev === 'drop') addMatFiles(e.dataTransfer.files, -1);
  });
});
$('fileIn').addEventListener('change', function (e) {
  var f = e.target.files[0]; if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    var d; try { d = JSON.parse(rd.result); } catch (err) { toast('不是有效的 JSON 檔'); return; }
    if (d.backup && fileMode === 'backup') {
      confirmBox('還原備份', '會用備份取代目前專案、我的專案與我的模板（金鑰不在備份裡）。確定嗎？', '還原', function () {
        lsSet('projects', JSON.stringify(d.projects || [])); myTpls = d.templates || []; saveTpls();
        if (d.prefs) { prefs = Object.assign(prefs, d.prefs, {aiKey: prefs.aiKey}); savePrefs(); }
        state = normalize(d.state); saveNow(); $('projName').value = state.name; go('content'); toast('已還原備份');
      });
      return;
    }
    var s = d.state || (d.schema ? null : d);
    if (!s || !s.tpl) { toast(d.schema ? '這是配方 JSON（給生成模組用），請開啟「專案檔」' : '看不懂這個檔案'); return; }
    (d.templates || []).forEach(function (t) { if (!allTpls().some(function (x) { return x.id === t.id; })) myTpls.push(t); }); saveTpls();
    state = normalize(s); openExcerpt = {}; saveNow(); $('projName').value = state.name; closeModal(); go('content'); toast('已開啟專案檔');
  };
  rd.readAsText(f);
});

/* ---------- 跑馬燈（工作區共用公告，不可關） ---------- */
function initMarquee() {
  var URL_ = 'https://script.google.com/macros/s/AKfycbwKX0DNNbY8y4nf90BFTHtxgfqJcHHcZasRrgycl4QAe52_hkjMWSkYk4xOsqU-JPCROw/exec';
  var REFRESH = 20 * 60 * 1000, bar = $('marqueeBar'), track = $('marqueeTrack'), lastKey = null;
  function appendText(c, text) { var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, li = 0, m; while ((m = re.exec(text))) { if (m.index > li) c.appendChild(document.createTextNode(text.slice(li, m.index))); var a = document.createElement('a'); a.href = m[2]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'inherit'; a.style.textDecoration = 'underline'; c.appendChild(a); li = re.lastIndex; } if (li < text.length) c.appendChild(document.createTextNode(text.slice(li))); }
  function renderM(items) {
    if (!items || !items.length) return;
    var k = JSON.stringify(items); if (k === lastKey) return; lastKey = k; track.innerHTML = '';
    var fr = document.createDocumentFragment();
    function pass() { items.forEach(function (it, i) { if (i > 0) fr.appendChild(document.createTextNode('　★　')); appendText(fr, String(it)); }); }
    pass(); fr.appendChild(document.createTextNode('　★　')); pass(); track.appendChild(fr);
    bar.classList.add('show'); document.body.classList.add('has-marquee');
    track.style.animationDuration = Math.max(track.scrollWidth / 2 / 60, 12) + 's';
  }
  function fetchM() { fetch(URL_, {method: 'POST', body: JSON.stringify({serial: ''})}).then(function (r) { return r.json(); }).then(function (d) { if (d && Array.isArray(d.marquee) && d.marquee.length) { lsSet('marquee', JSON.stringify(d.marquee)); renderM(d.marquee); } }).catch(function () {}); }
  renderM(lsJson('marquee', [])); fetchM(); setInterval(fetchM, REFRESH);
}

window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window._dp = e; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('service-worker.js').catch(function () {});
applyView(); initMarquee();
$('projName').value = state.name || '';
var h0 = location.hash.slice(1); if (STEPS.some(function (s) { return s.id === h0; })) tab = h0;
renderSteps(); render();
if (!lsGet('warnSeen')) { lsSet('warnSeen', '1'); showWarn(); }
window._vsg = {get state() { return state; }, go: go, E: E, loadExample: loadExample};
