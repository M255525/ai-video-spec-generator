'use strict';
/* 規則式引擎：不碰 DOM，Node 也能跑（tools/test_engine.mjs）。
   輸入都是 state（專案資料）＋ tpls（內建＋我的模板），輸出純資料或字串。 */
(function (root) {
  var SPEC = root.SPEC || (typeof require !== 'undefined' ? require('./data.js') : null);
  var E = {};

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function round05(v) { return Math.round(v * 2) / 2; }
  E.round05 = round05;

  E.blankState = function () {
    return {
      v: 1, name: '', topic: '', brief: '', mats: [], tpl: 'policy', segs: null, lenCustom: '',
      ov: {S1: null, S2: null, S3: null, S4: null, S5: null, S6: null},
      adv: {subStyle: '一般字幕', musicVol: 30, gender: '女聲', age: '壯年', speed: '正常', ratio: '16:9', logoPos: '不放', brandColor: '', introOutro: '都不要', visualStyle: '', music: ''},
      shots: [],
      tools: {script: 'Claude', voice: '各家 TTS（文字轉語音）服務', visual: 'AI 生圖', subtitle: '本工具估算的 SRT', compose: 'FFmpeg'},
      opt: {jsonOut: true, withMats: true, withAdv: true}
    };
  };

  E.findTpl = function (tpls, id) {
    for (var i = 0; i < tpls.length; i++) if (tpls[i].id === id) return tpls[i];
    return tpls[0];
  };
  E.segments = function (st, tpls) { return (st.segs && st.segs.length) ? st.segs : E.findTpl(tpls, st.tpl).segs.slice(); };
  E.length = function (st, tpls) { var c = num(st.lenCustom); return c && c > 0 ? c : E.findTpl(tpls, st.tpl).len; };

  /* 滑桿：模板預設值、自訂值、採用值、等級、指令 */
  E.sliders = function (st, tpls) {
    var t = E.findTpl(tpls, st.tpl);
    return SPEC.SLIDERS.map(function (s, i) {
      var o = st.ov && st.ov[s.code], has = o !== null && o !== undefined && o !== '' && isFinite(+o);
      var v = has ? clamp(Math.round(+o), 0, 100) : t.s[i];
      var lv = SPEC.level(v);
      return {code: s.code, name: s.name, def: t.s[i], custom: has ? v : null, value: v, level: lv, levelName: SPEC.LEVELS[lv], ins: s.ins[lv]};
    });
  };
  function sv(st, tpls, code) { var l = E.sliders(st, tpls); for (var i = 0; i < l.length; i++) if (l[i].code === code) return l[i].value; return 50; }

  /* 節奏 → 每鏡秒數（在該等級的秒數區間內線性內插） */
  E.paceSec = function (v) {
    if (v <= 33) return 8 - (v / 33) * 2;
    if (v <= 66) return 5 - ((v - 34) / 32) * 2;
    return 3 - ((v - 67) / 33) * 1.5;
  };
  E.paceRange = function (v) { var l = SPEC.level(v); return [[6, 8], [3, 5], [1.5, 3]][l]; };
  E.charsPerSec = function (st) {
    var sp = SPEC.ADV.speed; for (var i = 0; i < sp.length; i++) if (sp[i][0] === (st.adv && st.adv.speed)) return sp[i][1];
    return 4;
  };

  E.matLabel = function (m, i) { return '素材 #' + (i + 1) + (m.src ? '（' + m.src + '）' : ''); };
  E.weightCheck = function (m) {
    var r = null; SPEC.ROLES.forEach(function (x) { if (x.name === m.role) r = x; });
    var w = num(m.weight);
    if (!r) return {cls: 'warn', text: '請選角色'};
    if (w === null) return {cls: 'warn', text: '請填權重'};
    if (w < 0 || w > 100) return {cls: 'bad', text: '權重要在 0–100'};
    if (w < r.range[0]) return {cls: 'warn', text: '低於建議範圍'};
    if (w > r.range[1]) return {cls: 'warn', text: '高於建議範圍'};
    return {cls: 'ok', text: '在建議範圍內'};
  };

  function hintFor(seg) {
    for (var i = 0; i < SPEC.SEG_HINTS.length; i++) if (SPEC.SEG_HINTS[i][0].test(seg)) return SPEC.SEG_HINTS[i][1];
    return '說明「' + seg + '」的重點';
  }
  E.hintFor = hintFor;
  E.isDraft = function (narr) { return !narr || /^【草稿】/.test(narr); };

  /* 依配方排出分鏡草稿：鏡頭數、秒數、畫面來源、轉場、畫面文字都由滑桿決定 */
  E.draftShots = function (st, tpls) {
    var segs = E.segments(st, tpls).slice(), L = E.length(st, tpls);
    var s = {}; E.sliders(st, tpls).forEach(function (x) { s[x.code] = x.value; });
    var lv = function (c) { return SPEC.level(s[c]); };
    if (lv('S6') === 2 && !segs.some(function (g) { return /行動呼籲|去哪/.test(g); })) segs.push('行動呼籲');

    var per = E.paceSec(s.S3);
    var n = clamp(Math.round(L / per), segs.length, 90);
    // 段落分配：頭尾段落權重 0.6，中間 1；每段至少 1 鏡（最大餘數法）
    var w = segs.map(function (g, i) { return (i === 0 || i === segs.length - 1) && segs.length > 2 ? 0.6 : 1; });
    var wsum = w.reduce(function (a, b) { return a + b; }, 0);
    var extra = n - segs.length, raw = w.map(function (x) { return extra * x / wsum; });
    var cnt = raw.map(function (x) { return 1 + Math.floor(x); });
    var left = n - cnt.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (x, i) { return [x - Math.floor(x), i]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, left).forEach(function (p) { cnt[p[1]]++; });

    var mats = st.mats || [];
    var must = [], usable = [];
    mats.forEach(function (m, i) {
      if (m.role === '必用素材') must.push(i);
      if ((m.role === '必用素材' || m.role === '事實依據') && /PDF|圖片|影片/.test(m.type || '') && !/logo|標誌|商標/i.test(m.src || '')) usable.push(i);
    });
    var cps = E.charsPerSec(st), dens = [0.75, 0.9, 1][lv('S2')];
    var shots = [], ui = 0, topic = (st.topic || '').trim() || '主題';
    var base = round05(L / n);
    segs.forEach(function (g, gi) {
      for (var k = 0; k < cnt[gi]; k++) {
        var first = k === 0, isHook = gi === 0 && first, isLast = gi === segs.length - 1;
        var src, desc, trans, text = '';
        var r = lv('S5');
        if (r === 0) src = usable.length ? '素材' : '文字卡';
        else if (r === 1) src = usable.length && (shots.length % 2 === 0) ? '素材' : 'AI 生成';
        else src = 'AI 生成';
        if (isLast && /行動呼籲|去哪/.test(g)) src = '文字卡';
        if (src === '素材') { var mi = usable[ui % usable.length]; ui++; desc = E.matLabel(mats[mi], mi) + '：' + g + '相關畫面'; }
        else if (src === '文字卡') desc = '文字卡：' + g + '重點條列';
        else desc = '與「' + topic + '」相關的畫面：' + hintFor(g);
        // 轉場
        var p = lv('S3');
        if (p === 2) trans = first && gi > 0 ? '縮放' : '硬切';
        else if (p === 1) trans = first && gi > 0 ? '推移' : '硬切';
        else trans = '淡入淡出';
        if (isHook) trans = lv('S1') === 2 ? '縮放' : '硬切';
        // 畫面文字
        var d = lv('S2');
        if (d === 2) text = g + '｜重點';
        else if (d === 1) text = first ? g : '';
        else text = isHook || (isLast && lv('S6') > 0) ? g : '';
        if (isLast && lv('S6') === 2) text = '👉 立即行動（按鈕／倒數）';
        if (isHook && lv('S1') === 2) text = '你也遇過嗎？';
        var chars = Math.max(6, Math.round(base * cps * dens));
        shots.push({seg: g, narr: '【草稿】' + hintFor(g) + '（約 ' + chars + ' 字）', src: src, desc: desc, sec: base, trans: trans, text: text});
      }
    });
    // 必用素材至少出現一次：平均分散到各鏡
    must.forEach(function (mi, j) {
      var used = shots.some(function (x) { return x.src === '素材' && x.desc.indexOf('素材 #' + (mi + 1)) >= 0; });
      if (used) return;
      var pos = Math.min(shots.length - 1, Math.round((j + 0.5) * shots.length / must.length));
      if (/logo/i.test(mats[mi].src || '') || /片尾/.test(mats[mi].note || '')) pos = shots.length - 1;
      shots[pos].src = '素材'; shots[pos].desc = E.matLabel(mats[mi], mi) + '（必用素材）';
    });
    // 秒數微調讓總長接近目標
    var diff = round05(L - base * shots.length), guard = 0;
    while (Math.abs(diff) >= 0.5 && guard < 2000) {
      var idx = guard % shots.length, step = diff > 0 ? 0.5 : -0.5;
      if (shots[idx].sec + step >= 1) { shots[idx].sec = round05(shots[idx].sec + step); diff = round05(diff - step); }
      guard++;
    }
    return shots;
  };

  /* 時間碼 */
  E.timing = function (shots) {
    var t = 0;
    return shots.map(function (x) { var a = t, s = Math.max(0, num(x.sec) || 0); t = round05x(t + s); return {start: a, end: t}; });
  };
  function round05x(v) { return Math.round(v * 100) / 100; }
  E.totals = function (shots) {
    var tot = 0; shots.forEach(function (x) { tot += Math.max(0, num(x.sec) || 0); });
    tot = round05x(tot);
    return {total: tot, count: shots.length, avg: shots.length ? Math.round(tot / shots.length * 10) / 10 : 0};
  };
  E.fmtTime = function (sec, srt) {
    var ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
    var p = function (v, n) { return String(v).padStart(n || 2, '0'); };
    return srt ? p(h) + ':' + p(m) + ':' + p(s) + ',' + p(r, 3) : (h ? h + ':' : '') + p(m) + ':' + p(s);
  };

  /* 檢查清單 */
  E.checks = function (st, tpls) {
    var out = [], shots = st.shots || [], mats = st.mats || [];
    var L = E.length(st, tpls), tot = E.totals(shots).total, segs = E.segments(st, tpls);
    var sl = {}; E.sliders(st, tpls).forEach(function (x) { sl[x.code] = x.value; });
    if (!(st.topic || '').trim()) out.push(['bad', '還沒填影片主題（內容層）']);
    if (!shots.length) { out.push(['warn', '還沒有分鏡，可按「依配方排出分鏡草稿」']); return out; }
    var dev = L ? (tot - L) / L : 0;
    if (Math.abs(dev) > 0.15) out.push(['warn', '分鏡總長 ' + tot + ' 秒，和採用長度 ' + L + ' 秒差 ' + Math.round(dev * 100) + '%']);
    else out.push(['ok', '總長 ' + tot + ' 秒，接近採用長度 ' + L + ' 秒']);
    var miss = segs.filter(function (g) { return !shots.some(function (x) { return x.seg === g; }); });
    if (miss.length) out.push(['warn', '這些段落還沒有鏡頭：' + miss.join('、')]);
    var rg = E.paceRange(sl.S3), off = shots.filter(function (x) { var s = num(x.sec) || 0; return s < rg[0] - 0.5 || s > rg[1] + 1; }).length;
    if (off) out.push(['warn', off + ' 鏡的秒數不在「節奏」建議的 ' + rg[0] + '–' + rg[1] + ' 秒內']);
    var cps = E.charsPerSec(st), over = [];
    shots.forEach(function (x, i) { if (!E.isDraft(x.narr) && x.narr.replace(/\s/g, '').length > (num(x.sec) || 0) * cps * 1.25) over.push(i + 1); });
    if (over.length) out.push(['bad', '第 ' + over.join('、') + ' 鏡旁白太長，唸不完（語速每秒約 ' + cps + ' 字）']);
    var drafts = shots.filter(function (x) { return E.isDraft(x.narr); }).length;
    if (drafts) out.push(['warn', drafts + ' 鏡旁白還是草稿，可交給 AI 腳本模組或自己寫']);
    mats.forEach(function (m, i) {
      if (m.role !== '必用素材') return;
      if (!shots.some(function (x) { return (x.desc || '').indexOf('素材 #' + (i + 1)) >= 0 || (x.desc || '').indexOf('#' + (i + 1)) >= 0; }))
        out.push(['bad', '必用素材 #' + (i + 1) + (m.src ? '（' + m.src + '）' : '') + ' 還沒出現在任何鏡頭']);
    });
    var badRef = [];
    shots.forEach(function (x, i) { var re = /#(\d+)/g, mm; while ((mm = re.exec(x.desc || ''))) if (+mm[1] < 1 || +mm[1] > mats.length) badRef.push(i + 1); });
    if (badRef.length) out.push(['bad', '第 ' + badRef.join('、') + ' 鏡引用了不存在的素材編號']);
    var noRef = shots.map(function (x, i) { return x.src === '素材' && !/#\d+/.test(x.desc || '') ? i + 1 : 0; }).filter(Boolean);
    if (noRef.length) out.push(['warn', '第 ' + noRef.join('、') + ' 鏡畫面來源是「素材」，但畫面描述沒寫素材編號']);
    if (SPEC.level(sl.S5) === 0) {
      var ai = shots.filter(function (x) { return x.src === 'AI 生成'; }).length;
      if (ai) out.push(['warn', '真實感是「低」（只用素材），但有 ' + ai + ' 鏡用 AI 生成']);
    }
    mats.forEach(function (m, i) { if (m.role === '風格參考' && shots.some(function (x) { return (x.desc || '').indexOf('素材 #' + (i + 1)) >= 0; })) out.push(['bad', '素材 #' + (i + 1) + ' 是「風格參考」，不可以直接放進影片']); });
    mats.forEach(function (m, i) { var c = E.weightCheck(m); if (c.cls !== 'ok') out.push(['warn', '素材 #' + (i + 1) + '：' + c.text]); });
    if (!out.some(function (o) { return o[0] !== 'ok'; })) out.push(['ok', '檢查都通過了']);
    return out;
  };

  /* 組合好的 AI 指令：第一段與規格表「配方試算」的格式一致，後面依選項附加 */
  E.prompt = function (st, tpls) {
    var segs = E.segments(st, tpls), L = E.length(st, tpls), sl = E.sliders(st, tpls), opt = st.opt || {};
    var topic = (st.topic || '').trim() || '（請填主題）';
    var p = '請為主題「' + topic + '」撰寫一支約 ' + L + ' 秒的影片腳本與分鏡。結構依序為：' + segs.join(' → ') + '。風格要求：' +
      sl.map(function (x) { return x.name + '（' + x.levelName + '）：' + x.ins; }).join('；') +
      '。請依「鏡頭骨架」欄位輸出每一鏡（段落、旁白、畫面來源、畫面描述、秒數、轉場、畫面文字）。';
    var add = [];
    if ((st.brief || '').trim()) add.push('補充說明：' + st.brief.trim());
    var mats = (st.mats || []).filter(function (m) { return (m.src || '').trim() || (m.excerpt || '').trim(); });
    if (opt.withMats !== false && mats.length) {
      var lines = ['素材清單（每份素材都有角色與權重，請照規則使用）：'];
      (st.mats || []).forEach(function (m, i) {
        if (!((m.src || '').trim() || (m.excerpt || '').trim())) return;
        var r = null; SPEC.ROLES.forEach(function (x) { if (x.name === m.role) r = x; });
        lines.push('#' + (i + 1) + ' ' + (m.src || '（未命名）') + '（' + (m.type || '其他') + '）— ' + (m.role || '未指定角色') + '，權重 ' + (m.weight === '' || m.weight == null ? '未填' : m.weight) +
          (r ? '：' + r.def + '；可以' + r.can + '；不可以' + r.cannot.replace(/^（|）$/g, '') : '') + (m.note ? '。備註：' + m.note : ''));
        if ((m.excerpt || '').trim()) lines.push('　#' + (i + 1) + ' 內容摘錄：\n"""\n' + m.excerpt.trim() + '\n"""');
      });
      var fact = (st.mats || []).some(function (m) { return m.role === '事實依據' && (num(m.weight) || 0) >= 70; });
      if (fact) lines.push('事實依據權重高：每句旁白的事實都要來自事實依據素材，並在畫面描述後面用［來源 #編號］標出出處；素材裡沒有的事實不要寫。');
      var must = []; (st.mats || []).forEach(function (m, i) { if (m.role === '必用素材') must.push('#' + (i + 1)); });
      if (must.length) lines.push('必用素材 ' + must.join('、') + ' 一定要出現在至少一鏡：畫面來源填「素材」，畫面描述寫出素材編號。');
      lines.push('畫面描述若使用素材，請寫「素材 #編號」。');
      add.push(lines.join('\n'));
    }
    if (opt.withAdv !== false) {
      var a = st.adv || {}, x = [];
      x.push('畫面比例：' + (a.ratio || '16:9'));
      x.push('配音聲線：' + [a.gender, a.age, '語速' + (a.speed || '正常')].filter(Boolean).join('、') + '（每秒約 ' + E.charsPerSec(st) + ' 個字，每鏡旁白字數不要超過「秒數 × ' + E.charsPerSec(st) + '」）');
      x.push('字幕樣式：' + (a.subStyle || '一般字幕'));
      if ((a.visualStyle || '').trim()) x.push('視覺風格：' + a.visualStyle.trim());
      if ((a.music || '').trim()) x.push('配樂：' + a.music.trim() + '（音量 ' + (a.musicVol == null ? 30 : a.musicVol) + '，旁白出現時自動降低）');
      var brand = [];
      if (a.logoPos && a.logoPos !== '不放') brand.push('Logo 放' + a.logoPos);
      if ((a.brandColor || '').trim()) brand.push('品牌色 ' + a.brandColor.trim());
      if (a.introOutro && a.introOutro !== '都不要') brand.push(a.introOutro);
      if (brand.length) x.push('品牌元素：' + brand.join('、'));
      add.push('進階設定：\n' + x.map(function (s) { return '・' + s; }).join('\n'));
    }
    add.push('畫面來源只能填：' + SPEC.SOURCES.join('／') + '；轉場只能填：' + SPEC.TRANSITIONS.join('／') + '；秒數加總約 ' + L + ' 秒。');
    if (opt.jsonOut !== false) add.push('請只輸出 JSON 陣列，不要 Markdown、不要其他說明。每個元素格式：{"段落":"","旁白":"","畫面來源":"' + SPEC.SOURCES.join('|') + '","畫面描述":"","秒數":4,"轉場":"' + SPEC.TRANSITIONS.join('|') + '","畫面文字":""}');
    else add.push('請用 Markdown 表格輸出，欄位依序為：鏡號、段落、旁白、畫面來源、畫面描述、秒數、轉場、畫面文字。');
    return p + '\n\n' + add.join('\n\n');
  };

  /* 配方 JSON：各生成模組只讀自己需要的固定欄位 */
  E.recipe = function (st, tpls) {
    var t = E.findTpl(tpls, st.tpl), sl = E.sliders(st, tpls), shots = st.shots || [], tm = E.timing(shots), a = st.adv || {};
    var sh = shots.map(function (x, i) {
      return {shot: i + 1, segment: x.seg, narration: E.isDraft(x.narr) ? '' : x.narr, source: x.src, visual: x.desc, seconds: num(x.sec) || 0, transition: x.trans, overlay_text: x.text, start: tm[i].start, end: tm[i].end};
    });
    var mats = (st.mats || []).map(function (m, i) { return {id: i + 1, file: m.src, type: m.type, role: m.role, weight: num(m.weight), note: m.note || '', excerpt: m.excerpt || ''}; });
    var slObj = {}; sl.forEach(function (x) { slObj[x.code] = {name: x.name, template_default: x.def, custom: x.custom, value: x.value, level: x.levelName, instruction: x.ins}; });
    var tools = st.tools || {};
    return {
      schema: 'ai-video-recipe/1',
      generated_at: new Date().toISOString(),
      project: st.name || '',
      content: {topic: st.topic || '', brief: st.brief || '', materials: mats},
      structure: {template: t.name, segments: E.segments(st, tpls), target_seconds: E.length(st, tpls), shot_count: shots.length, total_seconds: E.totals(shots).total},
      style: {sliders: slObj, advanced: {aspect_ratio: a.ratio, subtitle_style: a.subStyle, music: a.music || '', music_volume: num(a.musicVol), voice: {gender: a.gender, age: a.age, speed: a.speed, chars_per_second: E.charsPerSec(st)}, visual_style: a.visualStyle || '', brand: {logo_position: a.logoPos, color: a.brandColor || '', intro_outro: a.introOutro}}},
      shots: sh,
      modules: {
        script: {tool: tools.script, input: ['content.topic', 'content.materials[role=事實依據]', 'structure', 'style.sliders.*.instruction'], cite_sources: mats.some(function (m) { return m.role === '事實依據' && (m.weight || 0) >= 70; }), prompt: E.prompt(st, tpls)},
        voice: {tool: tools.voice, input: ['shots[].narration', 'style.advanced.voice'], writeback: 'shots[].seconds 依實際音檔長度回寫'},
        visual: {tool: tools.visual, input: ['shots[].source', 'shots[].visual', 'content.materials[role=必用素材]'], realism: slObj.S5.value},
        subtitle: {tool: tools.subtitle, input: ['shots[].narration', 'shots[].start', 'shots[].end'], style: a.subStyle},
        compose: {tool: tools.compose, input: ['shots[]', 'voice', 'subtitle', 'shots[].transition', 'style.advanced.music'], aspect_ratio: a.ratio}
      }
    };
  };

  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  E.csv = function (st) {
    var tm = E.timing(st.shots || []);
    var rows = [['鏡號', '段落', '旁白', '畫面來源', '畫面描述', '秒數', '轉場', '畫面文字', '開始時間（秒）', '結束時間（秒）']];
    (st.shots || []).forEach(function (x, i) { rows.push([i + 1, x.seg, x.narr, x.src, x.desc, x.sec, x.trans, x.text, tm[i].start, tm[i].end]); });
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  };
  E.srt = function (st) {
    var tm = E.timing(st.shots || []), out = [], n = 0;
    (st.shots || []).forEach(function (x, i) {
      if (E.isDraft(x.narr)) return;
      n++; out.push(n + '\n' + E.fmtTime(tm[i].start, true) + ' --> ' + E.fmtTime(tm[i].end, true) + '\n' + x.narr.trim() + '\n');
    });
    return out.join('\n');
  };
  function mdCell(v) { return String(v == null ? '' : v).replace(/\|/g, '｜').replace(/\n/g, ' '); }
  E.markdown = function (st, tpls) {
    var t = E.findTpl(tpls, st.tpl), sl = E.sliders(st, tpls), tot = E.totals(st.shots || []), tm = E.timing(st.shots || []), a = st.adv || {};
    var L = [];
    L.push('# ' + (st.name || st.topic || '影片規格'));
    L.push('');
    L.push('## 內容層（講什麼）');
    L.push('- 主題：' + (st.topic || '（未填）'));
    if (st.brief) L.push('- 補充說明：' + st.brief.replace(/\n/g, ' '));
    if ((st.mats || []).length) {
      L.push(''); L.push('| 編號 | 檔名或網址 | 類型 | 角色 | 權重 | 備註 |'); L.push('|---|---|---|---|---|---|');
      st.mats.forEach(function (m, i) { L.push('| ' + (i + 1) + ' | ' + [m.src, m.type, m.role, m.weight, m.note].map(mdCell).join(' | ') + ' |'); });
    }
    L.push(''); L.push('## 結構層（怎麼排）');
    L.push('- 模板：' + t.name);
    L.push('- 段落順序：' + E.segments(st, tpls).join(' → '));
    L.push('- 採用長度：' + E.length(st, tpls) + ' 秒（分鏡總長 ' + tot.total + ' 秒／' + tot.count + ' 鏡／平均每鏡 ' + tot.avg + ' 秒）');
    L.push(''); L.push('## 風格層（什麼感覺）');
    L.push('| 代碼 | 滑桿 | 模板預設 | 自訂 | 採用 | 等級 | 指令 |'); L.push('|---|---|---|---|---|---|---|');
    sl.forEach(function (x) { L.push('| ' + [x.code, x.name, x.def, x.custom == null ? '' : x.custom, x.value, x.levelName, x.ins].map(mdCell).join(' | ') + ' |'); });
    L.push('');
    L.push('- 畫面比例：' + a.ratio + '；字幕：' + a.subStyle + '；配音：' + [a.gender, a.age, '語速' + a.speed].join('、') + (a.visualStyle ? '；視覺風格：' + a.visualStyle : '') + (a.music ? '；配樂：' + a.music + '（音量 ' + a.musicVol + '）' : ''));
    L.push(''); L.push('## 分鏡');
    L.push('| 鏡號 | 時間 | 段落 | 旁白 | 畫面來源 | 畫面描述 | 秒數 | 轉場 | 畫面文字 |'); L.push('|---|---|---|---|---|---|---|---|---|');
    (st.shots || []).forEach(function (x, i) { L.push('| ' + (i + 1) + ' | ' + E.fmtTime(tm[i].start) + '–' + E.fmtTime(tm[i].end) + ' | ' + [x.seg, x.narr, x.src, x.desc, x.sec, x.trans, x.text].map(mdCell).join(' | ') + ' |'); });
    L.push(''); L.push('## 組合好的 AI 指令'); L.push(''); L.push('```'); L.push(E.prompt(st, tpls)); L.push('```');
    return L.join('\n');
  };

  /* 匯入 AI 回覆：JSON 陣列／物件、Markdown 表格、從 Excel 貼上的 Tab 分隔表格 */
  var KEYMAP = {
    seg: ['段落', 'segment', 'section', 'part'], narr: ['旁白', 'narration', 'voiceover', 'script', '台詞'], src: ['畫面來源', 'source', 'visual_source'],
    desc: ['畫面描述', 'visual', 'description', 'scene', '畫面'], sec: ['秒數', 'seconds', 'duration', 'sec', '時長'], trans: ['轉場', 'transition'], text: ['畫面文字', 'overlay_text', 'text', 'caption', '字卡']
  };
  function normSrc(v) { v = String(v || '').trim(); if (/素材|footage|asset|upload/i.test(v)) return '素材'; if (/文字卡|字卡|text/i.test(v)) return '文字卡'; if (/AI|生成|generat/i.test(v)) return 'AI 生成'; return v ? 'AI 生成' : '文字卡'; }
  function normTrans(v) { v = String(v || '').trim(); if (/淡|fade|dissolve/i.test(v)) return '淡入淡出'; if (/推|push|slide|wipe/i.test(v)) return '推移'; if (/縮放|zoom|scale/i.test(v)) return '縮放'; return '硬切'; }
  function pick(o, k) { var ks = KEYMAP[k]; for (var i = 0; i < ks.length; i++) { if (o[ks[i]] != null) return o[ks[i]]; } var lower = {}; Object.keys(o).forEach(function (x) { lower[x.toLowerCase()] = o[x]; }); for (i = 0; i < ks.length; i++) if (lower[ks[i].toLowerCase()] != null) return lower[ks[i].toLowerCase()]; return ''; }
  function toShot(o) {
    return {seg: String(pick(o, 'seg') || '').trim(), narr: String(pick(o, 'narr') || '').trim(), src: normSrc(pick(o, 'src')), desc: String(pick(o, 'desc') || '').trim(),
      sec: round05(clamp(num(String(pick(o, 'sec')).replace(/[^\d.]/g, '')) || 4, 0.5, 600)), trans: normTrans(pick(o, 'trans')), text: String(pick(o, 'text') || '').trim()};
  }
  E.parseShots = function (txt) {
    txt = String(txt || '').trim();
    if (!txt) throw new Error('沒有貼上內容');
    var fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) txt = fence[1].trim();
    var j = null;
    var a1 = txt.indexOf('['), a2 = txt.lastIndexOf(']'), o1 = txt.indexOf('{');
    try { j = JSON.parse(txt); } catch (e) {
      if (a1 >= 0 && a2 > a1) { try { j = JSON.parse(txt.slice(a1, a2 + 1)); } catch (e2) {} }
    }
    if (j && !Array.isArray(j) && typeof j === 'object') j = j.shots || j['分鏡'] || j['鏡頭'] || j.scenes || null;
    if (Array.isArray(j)) {
      var list = j.filter(function (x) { return x && typeof x === 'object'; }).map(toShot);
      if (!list.length) throw new Error('JSON 裡沒有鏡頭資料');
      return list;
    }
    // 表格（Markdown 或 Tab 分隔）
    var lines = txt.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^\|?\s*:?-{2,}/.test(l); });
    var split = function (l) { if (l.indexOf('\t') >= 0) return l.split('\t').map(function (c) { return c.trim(); }); return l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); };
    var hi = -1; for (var i = 0; i < lines.length; i++) if (/段落|segment/i.test(lines[i]) && /旁白|narration/i.test(lines[i])) { hi = i; break; }
    if (hi < 0) throw new Error(o1 >= 0 || a1 >= 0 ? 'JSON 格式有誤，請確認是完整的 JSON 陣列' : '看不懂這段內容：請貼 JSON 陣列，或第一列含「段落」「旁白」的表格');
    var head = split(lines[hi]);
    var rows = lines.slice(hi + 1).map(split).filter(function (r) { return r.length >= 3; }).map(function (r) { var o = {}; head.forEach(function (h, k) { o[h] = r[k] == null ? '' : r[k]; }); return toShot(o); });
    if (!rows.length) throw new Error('表格沒有資料列');
    return rows;
  };

  root.ENGINE = E;
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
