    var BASE = null, MODELS = null, TD2 = null, QUEUE = [], R = {}, ALLOC = null, OBRX = null, OOR = null;
    var OV = { stock: {}, q: {}, r: {}, model: {}, mo: {}, td2: {}, cm: {}, obs: {}, bom: {}, invp: {} }, OVMETA = {}, HIST = [], KT = {};
    var DB = null, USER = null, ME = null, NAMES = {}, CAN_WRITE = true, EDITING = false;
    var LS = 'oor_app_v2_' + (EMBEDDED.saveId || 'base');
    var $ = function (id) { return document.getElementById(id); };
    var fmt = function (n) { return (Math.round(n * 1000) / 1000).toLocaleString('ru-RU'); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    function lsGet(k, d) { try { var v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
    var LS_WARNED = false;
    function lsSet(k, v) {
      try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; }
      catch (e) {
        if (!LS_WARNED && typeof showMsg === 'function') { LS_WARNED = true; showMsg('Браузер не сохранил данные (' + esc(e.name || e.message || 'ошибка') + ': память браузера переполнена или запрещена). Чтобы ничего не потерять, нажмите «💾 Сохранить HTML» — файл хранит всё.', 'err'); }
        return false;
      }
    }
    function nowStr(ts) { var d = new Date(ts); return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; var h2 = 52711; for (var j = s.length - 1; j >= 0; j--) h2 = ((h2 << 5) + h2 + s.charCodeAt(j)) >>> 0; return h.toString(36) + h2.toString(36); }

    function effTd2Rows() {
      var ov = OV.td2 || {}, keys = Object.keys(ov); if (!keys.length) return BASE.td2.rows;
      var done = {}, out = [];
      BASE.td2.rows.forEach(function (x) {
        var k = x[0].toUpperCase();
        if (!(k in ov) || EXCL_WH.indexOf(String(x[3]).toUpperCase()) >= 0) { out.push(x); return; }
        if (!done[k]) { done[k] = 1; out.push([x[0], ov[k], x[2], x[3], x[4]]); }
      });
      keys.forEach(function (k) { if (!done[k]) out.push([k, ov[k], null, 'ОСНОВНОЙ СКЛАД', 0]); });
      return out;
    }
    var TD2SIG = null;
    function syncTd2() { var sig = JSON.stringify(OV.td2 || {}) + '§' + JSON.stringify(OV.bom || {}); if (sig === TD2SIG && TD2) return; TD2SIG = sig; TD2 = indexTD2({ period: BASE.td2.period, rows: effTd2Rows() }); buildEngine(); }
    function setBase(b) { BASE = b; TD2SIG = null; TD2 = null; syncTd2(); recalc(); setTimeout(function () { if (typeof invPendingApply === 'function') invPendingApply(); }, 300); }
    function setModels(m) { MODELS = m; render(); }
    function recalc() {
      if (!BASE) return;
      syncTd2(); STOCKPLAN = null;
      var osg = JSON.stringify(OV.obs || {}); if (osg !== OBSIG) { OBSIG = osg; BLKC = {}; }
      OOR = mergeManual(BASE.oor, OV.mo); fillClients();
      QUEUE = orderQueue(OOR.orders, $('queue').value);
      R = computeAll(OOR, TD2, QUEUE, OV);
      try { ALLOC = ENGINE ? allocateAll(OOR, QUEUE, TD2, OV, ENGINE, OBRX, ENGINE.kgPerPc, OBUILD) : null; } catch (e) { ALLOC = null; console.error(e); }
      render();
    }
    function P(id) { return OOR.positions.find(function (p) { return p.id === id; }); }
    function O(id) { return OOR.orders.find(function (o) { return o.id === id; }); }
    function modelOf(p) {
      var map = MODELS ? MODELS.map : {}, codes = modelCodes(p, map);
      var ent = codes.map(function (c) { return map[c]; });
      var edited = Object.prototype.hasOwnProperty.call(OV.model, p.key);
      return { codes: codes, ent: ent, auto: carShort(ent), text: edited ? OV.model[p.key] : carShort(ent), edited: edited };
    }
    function fillClients() {
      var s = $('cli'), cur = s.value, seen = {};
      s.innerHTML = '<option value="">Все клиенты</option>';
      OOR.orders.forEach(function (o) { if (o.client && !seen[o.client]) { seen[o.client] = 1; var op = document.createElement('option'); op.textContent = o.client; s.appendChild(op); } });
      s.value = seen[cur] ? cur : '';
    }
    function visibleOrders() { var c = $('cli').value; return QUEUE.filter(function (o) { return !c || o.client === c; }); }

    var WIDTHS = lsGet('w', (EMBEDDED.ui && EMBEDDED.ui.widths) || {});
    var DEFW = { cat: 100, no: 50, name: 270, mdl: 220, ord: 138, tq: 92, tr: 92, stk: 116, tn: 104, ts: 104, after: 104, st: 138 };
    var FIT = lsGet('fit', (EMBEDDED.ui && EMBEDDED.ui.fit === 0) ? 0 : 1) ? 1 : 0, FITW = null, FITZ = 1;
    var HIDE = lsGet('hide', (EMBEDDED.ui && EMBEDDED.ui.hide) || {});
    var HIDEK = { cat: 1, no: 1, name: 1, mdl: 1, tq: 1, tr: 1, stk: 1, tn: 1, ts: 1, after: 1, st: 1 };
    var COLS = ['cat', 'no', 'name', 'mdl', 'tq', 'tr', 'stk', 'tn', 'ts', 'ord', 'after', 'st'];
    function nameRest(nm, g) {
      var gk = String(g || '').replace(/\s+/g, '').toUpperCase(), j = 0, n = 0; if (!gk) return nm;
      while (j < nm.length && n < gk.length) { var ch = nm.charAt(j); if (/\s/.test(ch)) { j++; continue; } if (ch.toUpperCase() !== gk.charAt(n)) return nm; j++; n++; }
      if (n < gk.length) return nm; var r = nm.slice(j).trim(); return r && !/^[0-9]/.test(r) ? r : nm;
    }
    function colName(k) { return { cat: NSORT ? 'Код товара' : 'Группа OOR', no: '№', name: 'Название товара', mdl: 'Модель авто', tq: 'Заказ', tr: 'В резерве', stk: 'Остаток склада', tn: 'Нужно со склада', ts: 'Не хватает', after: 'Конечный остаток', st: 'Статус' }[k] || k; }
    function colHidden() { return COLS.filter(function (k) { return HIDEK[k] && HIDE[k]; }); }
    function colSet(ks, hide) { ks.forEach(function (k) { if (!HIDEK[k]) return; if (hide) HIDE[k] = 1; else delete HIDE[k]; }); lsSet('hide', HIDE); render(); }
    var FITWU = lsGet('fitw', (EMBEDDED.ui && EMBEDDED.ui.fitw) || {});
    function fixW(k) { return FITWU[k] || FIXW[k]; }
    var FIXW = { cat: 64, no: 32, name: 170, mdl: 100, tq: 60, tr: 60, stk: 66, tn: 60, ts: 62, after: 62, st: 62 };
    var FIT_MIN = 63, FIT_MAX = 150;
    function fitWidths(n) {
      var z = (typeof ZOOM === 'number' ? ZOOM : 100) / 100, wr = $('wrap');
      var cs = wr ? getComputedStyle(wr) : null, ml = cs ? (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0) : 44;
      var sb = wr ? Math.max(0, wr.offsetWidth - wr.clientWidth) : 19;
      var avail = Math.floor(document.documentElement.clientWidth / z - ml - sb) - 1;
      var w = {}, fixed = 0; Object.keys(FIXW).forEach(function (k) { w[k] = fixW(k); if (!(HIDEK[k] && HIDE[k])) fixed += w[k]; });
      n = Math.max(1, n); var per = Math.floor((avail - fixed) / n); FITZ = 1;
      if (per < FIT_MIN) { per = FIT_MIN; FITZ = Math.max(0.55, avail / (fixed + n * per)); }
      if (per > FIT_MAX) {
        var ex = avail - fixed - n * FIT_MAX; var tg = { name: .55, mdl: .45 }; if (HIDE.name) { delete tg.name; if (!HIDE.cat) tg.cat = .55; } if (HIDE.mdl) delete tg.mdl; Object.keys(tg).forEach(function (k) { if (FITWU[k]) delete tg[k]; });
        var tw = 0; Object.keys(tg).forEach(function (k) { tw += tg[k]; }); if (tw > 0) { per = FIT_MAX; Object.keys(tg).forEach(function (k) { w[k] += Math.floor(ex * tg[k] / tw); }); }
      }
      w.ord = per; return w;
    }
    function wOf(id, kind) { return FITW ? FITW[kind] : (WIDTHS[id] || DEFW[kind]); }
    /* «В одно окно»: размер шрифта в ячейке — по ширине колонки (меряется в текущем шрифте, жирный) */
    var FITM = null;
    function fitMeasurer() {
      /* жирность и шрифт берутся с настоящих ячеек (на Windows Arial 800 = Arial Black — шире обычного жирного) */
      var c = fitMeasurer.c || (fitMeasurer.c = document.createElement('canvas').getContext('2d')), cache = {};
      var pr = document.createElement('div'); pr.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
      pr.innerHTML = '<table class="grid"><tbody><tr><td class="cell cf"><b>0</b><span>0</span></td><td class="num">0<b>0</b></td></tr></tbody></table>';
      document.body.appendChild(pr);
      var st = function (q) { var cs = getComputedStyle(pr.querySelector(q)); return cs.fontWeight + ' 100px ' + cs.fontFamily; };
      var F = { b: st('td.cell b'), s: st('td.cell span'), n: st('td.num'), nb: st('td.num b') };
      pr.remove();
      return function (t, k) { var f = F[k] || F.b, key = f + '|' + t; if (!(key in cache)) { c.font = f; cache[key] = c.measureText(t).width / 100; } return cache[key]; };
    }
    function fpx(t, avail, max, min, k) { var w = FITM ? FITM(String(t), k) : 0; return w ? Math.max(min, Math.min(max, Math.floor(avail * 0.95 / w))) : max; }
    function fsz(t, kind, max, min, pad, k) { return FITW ? ' style="font-size:' + fpx(t, FITW[kind] - (pad || 10), max, min, k || 'n') + 'px"' : ''; }
    /* после отрисовки: если где-то текст всё же шире ячейки (особенности шрифта) — уменьшить по 1 px */
    function fitFix() {
      if (!FIT) return; var g = $('grid'), bad = [];
      g.querySelectorAll('tbody td.cell.cf b, tbody td.cell.cf span').forEach(function (e) { if (e.scrollWidth > e.clientWidth + 0.5) bad.push(e); });
      g.querySelectorAll('tbody td.num').forEach(function (td) { if (td.scrollWidth > td.clientWidth + 0.5) bad.push(td.querySelector('b') || td); });
      bad.forEach(function (e) {
        var box = e.tagName === 'B' && e.closest('td.num') ? e.closest('td.num') : e, fs = parseFloat(getComputedStyle(e).fontSize), n = 0;
        while (box.scrollWidth > box.clientWidth + 0.5 && fs > 10 && n++ < 14) { fs--; e.style.fontSize = fs + 'px'; }
      });
    }
    function setFit(v) { FIT = v ? 1 : 0; lsSet('fit', FIT); if ($('fitBtn')) $('fitBtn').classList.toggle('on', !!FIT); render(); }
    var fitT = 0; window.addEventListener('resize', function () { if (!FIT) return; clearTimeout(fitT); fitT = setTimeout(render, 150); });
    var LBK = { cat: 1, no: 1, name: 1, mdl: 1, tq: 1, tr: 1, stk: 1, tn: 1, ts: 1 };
    function th(id, kind, cls, html, attrs) { if (HIDEK[kind] && HIDE[kind]) return ''; return '<th class="' + (cls || '') + (LBK[kind] ? ' lb' : '') + '" data-w="' + esc(id) + '" data-k="' + kind + '" style="width:' + wOf(id, kind) + 'px;position:sticky" ' + (attrs || '') + '>' + html + '<div class="rz"></div></th>'; }
    function fitWrap() { var w = $('wrap'); if (!w) return; var z = (typeof ZOOM === 'number' ? ZOOM : 100) / 100, top = w.getBoundingClientRect().top + window.scrollY; var dk = $('cmdock'), dh = dk && dk.offsetParent !== null ? dk.getBoundingClientRect().height + 8 * z : 0; w.style.maxHeight = Math.max(260, (window.innerHeight - top - dh - 10 * z) / z) + 'px'; }
    window.addEventListener('resize', fitWrap);
    function applyTableWidth() {
      var t = $('grid'), sum = 0;
      t.querySelectorAll('thead th').forEach(function (h) { sum += parseFloat(h.style.width) || 0; });
      t.style.width = sum + 'px'; t.style.setProperty('--wc', (HIDE.cat ? 0 : wOf('cat', 'cat')) + 'px'); t.style.setProperty('--wn', (HIDE.no ? 0 : wOf('no', 'no')) + 'px');
    }
    $('grid').addEventListener('pointerdown', function (e) {
      var rz = e.target.closest('.rz'); if (!rz) return;
      e.preventDefault(); e.stopPropagation();
      var h = rz.parentNode, id = h.dataset.w, x0 = e.clientX, w0 = h.getBoundingClientRect().width;
      rz.classList.add('drag'); rz.setPointerCapture(e.pointerId);
      var zt = (FIT && FITZ < 1 ? FITZ : 1) * (FIT ? bodyZ() : 1), kd = h.dataset.k, fw = null;
      var mv = function (ev) { var w = Math.max(FIT ? 30 : 48, Math.round((w0 + ev.clientX - x0) / zt)); h.style.width = w + 'px'; if (FIT) fw = w; else WIDTHS[id] = w; applyTableWidth(); };
      var up = function () { rz.classList.remove('drag'); rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); if (FIT) { if (fw) { FITWU[kd] = fw; lsSet('fitw', FITWU); render(); } } else lsSet('w', WIDTHS); };
      rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up);
    });
    $('grid').addEventListener('dblclick', function (e) { var rz = e.target.closest('.rz'); if (!rz) return; var h = rz.parentNode; if (FIT) { delete FITWU[h.dataset.k]; lsSet('fitw', FITWU); render(); return; } delete WIDTHS[h.dataset.w]; lsSet('w', WIDTHS); h.style.width = DEFW[h.dataset.k] + 'px'; applyTableWidth(); });

    /* ================= таблица ================= */
    /* группировка по нажатию на «Название товара»: '' — стандарт (группы OOR), 'name' — по названию (код товара, А→Я) */
    var NSORT = lsGet('nsort', (EMBEDDED.ui && EMBEDDED.ui.nsort) || '') === 'name' ? 'name' : '';
    function nameGroup(n) { var s = cleanSp(n), m = s.match(/^([A-Za-zА-Яа-яЁё]+)\s*(\d+)/); return m ? m[1].toUpperCase() + ' ' + m[2] : (s.split(' ')[0] || s); }
    function gridList(ords) {
      var q = $('q').value.replace(/\s+/g, '').toUpperCase(), f = $('flt').value;
      var list = OOR.positions.filter(function (p) {
        var r = R[p.id];
        if (!ords.some(function (o) { return r.cells[o.id]; })) return false;
        if (q && (p.name + p.group + modelOf(p).text).replace(/\s+/g, '').toUpperCase().indexOf(q) < 0) return false;
        var sh = ords.some(function (o) { return r.cells[o.id] && finalShort(p, o) > 0; });
        if (f === 'short' && !sh) return false; if (f === 'ok' && sh) return false;
        if (f === 'nf' && r.stockFound) return false;
        if (f === 'ed' && !hasEdits(p)) return false;
        if (f === 'cm' && !ords.some(function (o) { return r.cells[o.id] && cmOf(p, o).length; })) return false;
        return true;
      });
      var groups = [], by = {}, gk = function (p) { return NSORT ? nameGroup(p.name) : p.group; };
      if (NSORT) list = list.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }); });
      list.forEach(function (p) { var g = gk(p); if (!by[g]) { by[g] = []; groups.push(g); } by[g].push(p); });
      return { list: list, groups: groups, by: by };
    }
    function render() {
      if (!BASE) return;
      var SPK = stockPlan();
      $('src').textContent = 'Книга: ' + BASE.file + ' (' + BASE.loadedAt + ') · склад на ' + (TD2.period || '—') + (BASE.stockUpd ? ' (обновлён: ' + BASE.stockUpd.file + ', ' + BASE.stockUpd.loadedAt + ')' : '') + ' · OOR: ' + BASE.oor.orders.length + ' заказов, ' + BASE.oor.positions.length + ' позиций' + (OOR.orders.length > BASE.oor.orders.length ? ' · добавлено вручную: ' + (OOR.orders.length - BASE.oor.orders.length) + ' заказ(а)' : '') + (MODELS ? ' · модели: ' + Object.keys(MODELS.map).length + ' кодов' : '');
      var ords = visibleOrders(), G = gridList(ords), list = G.list, groups = G.groups, by = G.by;
      var per = esc(TD2.period || '');
      FITW = FIT ? fitWidths(ords.length) : null; FITM = FIT ? fitMeasurer() : null; document.body.classList.toggle('fit', !!FIT); if ($('fitBtn')) $('fitBtn').classList.toggle('on', !!FIT);
      var sd = function (d) { return String(d || '—').replace(/\.(\d{2})(\d{2})$/, '.$2'); };
      var NO = 0, h = '<thead><tr>' + th('cat', 'cat', 'c-cat' + (HIDE.name ? ' clk nsort' : ''), (NSORT ? 'Код товара' : 'Группа OOR') + (HIDE.name ? '<small>' + (NSORT ? 'А→Я' : 'по стандарту') + ' ⇅</small>' : ''), HIDE.name ? 'title="Нажмите — группировка: по стандарту (группы OOR) / по названию"' : '') + th('no', 'no', 'c-no', '№') + th('name', 'name', 'c-name clk nsort', 'Название товара<small>' + (NSORT ? 'по названию А→Я' : 'по стандарту') + ' ⇅</small>', 'title="Нажмите — группировка: по стандарту (группы OOR) / по названию"') + th('mdl', 'mdl', '', 'Модель авто');
      h += th('tq', 'tq', '', 'Заказ') + th('tr', 'tr', '', FIT ? 'В<br>резерве' : 'В резерве') + th('stk', 'stk', 'clk stockh', (FIT ? 'Остаток<small>' + esc(sd(TD2.period)) + '</small>' : 'Остаток склада<small>на ' + per + '</small>')) + th('tn', 'tn', '', 'Нужно<br>со склада') + th('ts', 'ts', '', FIT ? 'Не<br>хватает' : 'Не хватает');
      var OCV = {}; ords.forEach(function (o) { OCV[o.id] = ordBar(o); });
      ords.forEach(function (o) { var cv = OCV[o.id]; h += th('o:' + o.key, 'ord', 'clk ord', '<span class="oh">' + (FIT ? '' : 'Заказ ') + esc(o.label) + cv.html + '</span>' + (o.manual ? '<span class="manual-tag">вручную</span>' : '') + '<small class="dt">' + (FIT ? esc(sd(o.created)) : 'от ' + esc(o.created || '—')) + '</small>', 'data-o="' + o.id + '"'); });
      h += th('after', 'after', '', FIT ? 'Конеч.<br>остаток' : 'Конечный<br>остаток') + th('st', 'st', '', 'Статус') + '</tr></thead><tbody>';
      /* (25.11) «Название товара» скрыто: одна строка на корень — заказы всех позиций корня в одной строке (кол-во складывается, цвет — худший статус) */
      if (HIDE.name) groups.forEach(function (g) {
        var ps = by[g], tq = 0, tr = 0, tn = 0, ts = 0, stk = 0, aft = 0, mdt = '', anyEd = false;
        ps.forEach(function (p) { var md = modelOf(p); if (!mdt && md.text) mdt = md.text; if (R[p.id].stockEdited) anyEd = true; stk += R[p.id].stock; aft += R[p.id].after; });
        h += '<tr' + (NO > 0 ? ' class="gs"' : '') + '>';
        if (!HIDE.cat) h += '<td class="c-cat lb" data-g="' + esc((NSORT ? 'code:' : '') + g) + '" title="' + esc(ps.map(function (p) { return p.name; }).join('\n')) + '\nНажмите — структура на 1 шт">' + esc(g) + (ps.length > 1 ? '<small class="gcnt">' + ps.length + ' поз.</small>' : '') + '</td>';
        ++NO; if (!HIDE.no) h += '<td class="c-no lb">' + NO + '</td>';
        if (!HIDE.mdl) h += '<td class="mdl lb' + (mdt ? '' : ' none') + '" data-m="' + ps[0].id + '" title="' + esc(mdt) + '"><div class="cl">' + (mdt ? esc(mdt) : '—') + '</div></td>';
        var oc = '';
        ords.forEach(function (o) {
          var A = { q: 0, rv: 0, need: 0, short: 0, fg: 0, semi: 0, prod: 0, ed: false, pp: [], allRes: true, cm: null };
          ps.forEach(function (p) {
            var c = R[p.id].cells[o.id]; if (!c) return;
            var ac = AC(p, o) || { short: c.short, fg: c.give, semi: 0, prod: 0 };
            A.q += c.q; A.rv += c.rv; A.need += c.need; A.short += ac.short; A.fg += ac.fg || 0; A.semi += ac.semi || 0; A.prod += ac.prod || 0; A.pp.push(p.id);
            if (c.need !== 0) A.allRes = false; if (c.qE || c.rE) A.ed = true; if (!A.cm && cmOf(p, o).length) A.cm = [p, ac.short];
          });
          var a = ' data-p="' + (A.pp[0] || ps[0].id) + '" data-o="' + o.id + '"' + (A.pp.length > 1 ? ' data-pp="' + A.pp.join(',') + '"' : '');
          if (!A.pp.length) { oc += '<td class="cell empty"' + a + '></td>'; return; }
          tq += A.q; tr += A.rv; tn += A.need; ts += A.short;
          var cmx = A.cm ? cmCell(A.cm[0], o, A.cm[1]) : { cls: '', st: '' }, cb = A.cm && !FIT ? cmBadge(A.cm[0], o) : '';
          var edc = (A.ed ? ' ed' : '') + cmx.cls + '"' + cmx.st + ' data-c="';
          var det = ((A.rv ? 'рез. ' + fmt(A.rv) + ' · ' : '') + (A.fg ? 'склад ' + fmt(A.fg) + ' · ' : '') + (A.semi ? 'п/ф ' + fmt(A.semi) + ' · ' : '') + (A.prod ? 'произв. ' + fmt(A.prod) + ' · ' : '')).replace(/ · $/, '');
          var who = A.pp.length > 1 ? ' · позиций ' + A.pp.length + ': ' + A.pp.map(function (id) { return P(id).name; }).join(', ') : ' · ' + P(A.pp[0]).name;
          var cls = A.short > 0 ? 'short' : A.allRes ? 'res' : (A.semi || A.prod) ? 'mk' : 'ok';
          var tl = (A.short > 0 ? 'не хватает ' + fmt(A.short) + ' шт · заказ ' + fmt(A.q) : fmt(A.q) + ' шт · ' + (cls === 'res' ? 'хватает · в резерве ' + fmt(A.rv) : cls === 'mk' ? (A.prod ? 'произвести' : 'из п/ф') : 'хватает')) + (det ? ' · ' + det : '') + who;
          if (FIT) {
            var CB = function (t) { return '<b' + fsz(t, 'ord', 24, 13, cb ? 27 : 7, 'b') + '>' + t + '</b>'; }, CS = function (t) { return '<span' + fsz(t, 'ord', 16, 11, 7, 's') + '>' + t + '</span>'; };
            oc += '<td class="cell ' + cls + ' cf' + edc + '"' + a + ' title="' + esc(tl) + '">' + (A.short > 0 ? CB('−' + fmt(A.short)) + CS('из ' + fmt(A.q)) : CB(fmt(A.q))) + (cmx.lab || '') + '</td>';
          } else {
            var qb = function (n) { return '<b>' + fmt(n) + '<u>шт</u></b>'; }, dt = A.short > 0 ? 'заказ ' + fmt(A.q) + (det ? ' · ' + det : '') : cls === 'res' ? 'в резерве ' + fmt(A.rv) : det;
            oc += '<td class="cell ' + cls + (dt ? (dt.length > 30 ? ' l3' : ' l2') : ' l1') + edc + '"' + a + ' title="' + esc(tl) + '">' + qb(A.short > 0 ? A.short : A.q) + '<span>' + (A.short > 0 ? 'не хватает' : cls === 'mk' ? (A.prod ? 'произвести' : 'из п/ф') : 'хватает') + '</span>' + (dt ? '<i>' + esc(dt) + '</i>' : '') + cb + '</td>';
          }
        });
        var all = !$('cli').value;
        if (!HIDE.tq) h += '<td class="num lb"' + fsz(fmt(tq), 'tq', 19, 12) + '>' + fmt(tq) + '</td>';
        if (!HIDE.tr) h += '<td class="num lb"' + fsz(fmt(tr), 'tr', 19, 12) + '>' + fmt(tr) + '</td>';
        if (!HIDE.stk) h += '<td class="num lb stk' + (anyEd ? ' ed' : '') + '" data-s="' + ps[0].id + '" data-sq="' + esc(g) + '" title="' + esc('Сумма остатков позиций корня: ' + ps.map(function (p) { return p.name + ' — ' + fmt(R[p.id].stock); }).join('; ')) + '"><b' + fsz(fmt(stk), 'stk', 19, 12, 10, 'nb') + '>' + fmt(stk) + '</b></td>';
        var tsz = FITW ? 'font-size:' + fpx(ts ? fmt(ts) : '—', FITW.ts - 10, 19, 12, 'n') + 'px;' : '';
        if (!HIDE.tn) h += '<td class="num lb"' + fsz(fmt(tn), 'tn', 19, 12) + '>' + fmt(tn) + '</td>';
        if (!HIDE.ts) h += '<td class="num lb" style="' + tsz + 'color:' + (ts ? 'var(--bad)' : 'inherit') + ';font-weight:' + (ts ? 600 : 400) + '">' + (ts ? fmt(ts) : '—') + '</td>';
        h += oc;
        if (!HIDE.after) h += '<td class="num"' + (all ? fsz(fmt(aft), 'after', 19, 12) : '') + '>' + (all ? fmt(aft) : '—') + '</td>';
        if (!HIDE.st) h += '<td class="st ' + (ts ? 'short' : 'ok') + '" data-p="' + ps[0].id + '">' + (ts ? (FIT ? 'не хватает' : 'не хватает ' + fmt(ts) + ' шт') : 'хватает') + '</td>';
        h += '</tr>';
      });
      else groups.forEach(function (g) {
        by[g].forEach(function (p, i) {
          var r = R[p.id], tq = 0, tr = 0, tn = 0, ts = 0, md = modelOf(p);
          h += '<tr' + (i === 0 && NO > 0 ? ' class="gs"' : '') + '>';
          if (i === 0 && !HIDE.cat) h += '<td class="c-cat lb" rowspan="' + by[g].length + '" data-g="' + esc((NSORT ? 'code:' : '') + g) + '" title="Нажмите — структура на 1 шт">' + esc(g) + '</td>';
          ++NO; h += (HIDE.no ? '' : '<td class="c-no lb">' + NO + '</td>') + (HIDE.name ? '' : '<td class="c-name lb" data-p="' + p.id + '">' + esc(p.name) + (p.manual ? '<span class="manual-tag">новая</span>' : '') + '</td>');
          if (!HIDE.mdl) h += '<td class="mdl lb' + (md.text ? '' : ' none') + (md.edited ? ' ed' : '') + '" data-m="' + p.id + '" title="' + esc(md.text) + '"><div class="cl">' + (md.text ? esc(md.text) : '—') + '</div></td>';
          var oc = '', hh = '';
          ords.forEach(function (o) {
            var c = r.cells[o.id], a = ' data-p="' + p.id + '" data-o="' + o.id + '"', h = '';
            if (!c) { oc += '<td class="cell empty"' + a + '></td>'; return; }
            var ac = AC(p, o) || { short: c.short, fg: c.give, semi: 0, prod: 0 };
            tq += c.q; tr += c.rv; tn += c.need; ts += ac.short;
            var cb = FIT ? '' : cmBadge(p, o), cmx = cmCell(p, o, ac.short), edc = ((c.qE || c.rE) ? ' ed' : '') + cmx.cls + '"' + cmx.st + ' data-c="', tt = (c.qE || c.rE) ? ' title="Изменено вручную. В книге: заказано ' + fmt(c.q0) + ', резерв ' + fmt(c.r0) + '"' : '';
            var det = (c.rv ? 'рез. ' + fmt(c.rv) + ' · ' : '') + (ac.fg ? 'склад ' + fmt(ac.fg) + ' · ' : '') + (ac.semi ? 'п/ф ' + fmt(ac.semi) + ' · ' : '') + (ac.prod ? 'произв. ' + fmt(ac.prod) + ' · ' : '');
            det = det.replace(/ · $/, '');
            /* размер текста по содержимому: 2 строки — крупно, 3 строки — меньше, длинная строка деталей — ещё меньше */
            var qb = function (n) { return '<b>' + fmt(n) + '<u>шт</u></b>'; }, ln = function (t) { return t ? (t.length > 30 ? ' l3' : ' l2') : ' l1'; };
            var dS = 'заказ ' + fmt(c.q) + (det ? ' · ' + det : ''), dR = 'в резерве ' + fmt(c.rv), dO = c.rv ? det : '';
            if (FIT) {
              var ft = (c.qE || c.rE) ? ' · изменено вручную, в книге: заказано ' + fmt(c.q0) + ', резерв ' + fmt(c.r0) : '';
              var CB = function (t) { return '<b' + fsz(t, 'ord', 24, 13, cb ? 27 : 7, 'b') + '>' + t + '</b>'; }, CS = function (t) { return '<span' + fsz(t, 'ord', 16, 11, cb ? 19 : 7, 's') + '>' + t + '</span>'; };
              var cl = cmx.lab || '';
              if (ac.short > 0) h += '<td class="cell short cf' + (cb ? ' cmc' : '') + edc + '"' + a + ' title="' + esc('не хватает ' + fmt(ac.short) + ' шт · ' + dS + ft) + '">' + CB('−' + fmt(ac.short)) + CS('из ' + fmt(c.q)) + cl + cb + '</td>';
              else if (c.need === 0) h += '<td class="cell res cf' + (cb ? ' cmc' : '') + edc + '"' + a + ' title="' + esc(fmt(c.q) + ' шт · хватает · ' + dR + ft) + '">' + CB(fmt(c.q)) + cl + cb + '</td>';
              else if (ac.semi || ac.prod) h += '<td class="cell mk cf' + (cb ? ' cmc' : '') + edc + '"' + a + ' title="' + esc(fmt(c.q) + ' шт · ' + (ac.prod ? 'произвести' : 'из п/ф') + ' · ' + det + ft) + '">' + CB(fmt(c.q)) + cl + cb + '</td>';
              else h += '<td class="cell ok cf' + (cb ? ' cmc' : '') + edc + '"' + a + ' title="' + esc(fmt(c.q) + ' шт · хватает' + (dO ? ' · ' + dO : '') + ft) + '">' + CB(fmt(c.q)) + cl + cb + '</td>';
              oc += h; return;
            }
            if (ac.short > 0) h += '<td class="cell short' + ln(dS) + edc + '"' + a + tt + '>' + qb(ac.short) + '<span>не хватает</span><i>' + dS + '</i>' + cb + '</td>';
            else if (c.need === 0) h += '<td class="cell res' + ln(dR) + edc + '"' + a + tt + '>' + qb(c.q) + '<span>хватает</span><i>' + dR + '</i>' + cb + '</td>';
            else if (ac.semi || ac.prod) h += '<td class="cell mk' + ln(det) + edc + '"' + a + tt + '>' + qb(c.q) + '<span>' + (ac.prod ? 'произвести' : 'из п/ф') + '</span><i>' + det + '</i>' + cb + '</td>';
            else h += '<td class="cell ok' + ln(dO) + edc + '"' + a + tt + '>' + qb(c.q) + '<span>хватает</span>' + (dO ? '<i>' + dO + '</i>' : '') + cb + '</td>';
            oc += h;
          });
          var all = !$('cli').value;
          if (!HIDE.tq) h += '<td class="num lb"' + fsz(fmt(tq), 'tq', 19, 12) + '>' + fmt(tq) + '</td>'; if (!HIDE.tr) h += '<td class="num lb"' + fsz(fmt(tr), 'tr', 19, 12) + '>' + fmt(tr) + '</td>';
          var spi = SPK.items[p.key], sps = spi && spi.st !== 'ok' && spi.st !== 'none' ? ' sm-' + spi.st : '';
          if (!HIDE.stk) h += '<td class="num lb stk' + sps + (r.stockEdited ? ' ed' : '') + '" data-s="' + p.id + '"' + (spi && spi.min ? ' data-min="' + spi.min + '"' : '') + (r.stockEdited ? ' title="Изменено вручную. По TDSheet2: ' + fmt(r.stock0) + '"' : '') + '><b' + fsz(fmt(r.stock), 'stk', 19, 12, 10, 'nb') + '>' + fmt(r.stock) + '</b>' + (r.stockFound || r.stockEdited ? '' : '<span class="nf">нет в складе</span>') + stkArrow(p.name) + '</td>';
          var tsz = FITW ? 'font-size:' + fpx(ts ? fmt(ts) : '—', FITW.ts - 10, 19, 12, 'n') + 'px;' : '';
          if (!HIDE.tn) h += '<td class="num lb"' + fsz(fmt(tn), 'tn', 19, 12) + '>' + fmt(tn) + '</td>'; if (!HIDE.ts) h += '<td class="num lb" style="' + tsz + 'color:' + (ts ? 'var(--bad)' : 'inherit') + ';font-weight:' + (ts ? 600 : 400) + '">' + (ts ? fmt(ts) : '—') + '</td>';
          h += oc; if (!HIDE.after) h += '<td class="num"' + (all ? fsz(fmt(r.after), 'after', 19, 12) : '') + '>' + (all ? fmt(r.after) : '<span title="При фильтре по клиенту смотрите «Все клиенты»">—</span>') + '</td>';
          if (!HIDE.st) h += '<td class="st ' + (ts ? 'short' : 'ok') + '" data-p="' + p.id + '">' + (ts ? (FIT ? 'не хватает' : 'не хватает ' + fmt(ts) + ' шт') : 'хватает') + '</td>'; h += '</tr>';
        });
      });
      if (!list.length) h += '<tr><td colspan="' + (11 + ords.length) + '" style="text-align:center;padding:30px;color:var(--mute)">Нет позиций по фильтру</td></tr>';
      $('grid').innerHTML = h + '</tbody>';
      $('grid').style.zoom = FIT && FITZ < 1 ? String(FITZ) : '';
      applyTableWidth(); colMarks(); vcolsFill();
      renderKpis(ords);
      renderHinfo();
      renderFltBar(list, ords);
      stkBang();
      fitWrap();
      if (FIT) fitFix();
    }
    /* в шапке при скрытом верхе: «Склад на: …» и «Обработка: дата последнего анализа» */
    function lastAnalysisTs() { var t = 0; HIST.forEach(function (h) { if ((h.kind === 'analysis' || h.kind === 'book') && h.ts > t) t = h.ts; }); return t; }
    function renderHinfo() {
      var el = $('hinfo'); if (!el || !BASE) return;
      var t = lastAnalysisTs(), d = t ? new Date(t) : null;
      var an = d ? d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : (BASE.loadedAt || '—');
      if ($('cmTopN')) $('cmTopN').textContent = cmCount();
      if ($('htOrd')) { var K = {}; kpiData(visibleOrders()).forEach(function (k) { K[k[3]] = k; }); if ($('htInv')) $('htInv').textContent = K.inv[1]; $('htOrd').textContent = K.ord[1]; $('htSp').textContent = K.sp[1]; $('htSp').classList.toggle('bad', !!K.sp[1]); $('htFull').textContent = K.full[1]; if (typeof fitHeader === 'function') fitHeader(); }
      el.innerHTML = '<span>Склад на: ' + esc((BASE.stockUpd && BASE.stockUpd.period) || TD2.period || '—') + '</span><span>Обработка: ' + esc(an) + '</span>';
    }
    function AC(p, o) { return ALLOC && ALLOC.pos[p.id] ? ALLOC.pos[p.id].cells[o.id] : null; }
    function finalShort(p, o) { var a = AC(p, o), c = R[p.id].cells[o.id]; return a ? a.short : (c ? c.short : 0); }
    function hasEdits(p) {
      if (Object.prototype.hasOwnProperty.call(OV.stock, p.key) || Object.prototype.hasOwnProperty.call(OV.model, p.key)) return true;
      var pre = p.key + '§';
      return Object.keys(OV.q).concat(Object.keys(OV.r)).some(function (k) { return k.indexOf(pre) === 0; });
    }
    function renderKpis(ords) {
      $('kpis').innerHTML = kpiData(ords).map(function (k) { return '<div class="kpi ' + k[2] + '" data-k="' + k[3] + '" title="Нажмите — показать список"><div class="v">' + k[1] + '</div><div class="l">' + k[0] + '</div></div>'; }).join('');
    }
    function kpiData(ords) {
      var cells = 0, sc = 0, sp = 0, sq = 0, nf = 0, pos = 0, mk = 0;
      OOR.positions.forEach(function (p) {
        var r = R[p.id], any = false, s = 0;
        ords.forEach(function (o) { var c = r.cells[o.id]; if (!c) return; any = true; cells++; var a = AC(p, o), sh = a ? a.short : c.short; if (a) mk += a.semi + a.prod; if (sh > 0) { sc++; s += sh; } });
        if (any) { pos++; if (s) { sp++; sq += s; } if (!r.stockFound && !r.stockEdited) nf++; }
      });
      var full = ords.filter(function (o) { return OOR.positions.every(function (p) { return !R[p.id].cells[o.id] || finalShort(p, o) === 0; }); }).length;
      var ne = Object.keys(OV.stock).length + Object.keys(OV.q).length + Object.keys(OV.r).length + Object.keys(OV.model).length + Object.keys(OV.td2 || {}).length + Object.keys(OV.obs || {}).length;
      var SPK = stockPlan();
      return [['Позиций', pos, '', 'pos'], ['Заказов', ords.length, '', 'ord'],
      ['Позиций с нехваткой', sp, sp ? 'bad' : 'ok', 'sp'], ['Нет в складе', nf, nf ? 'bad' : 'ok', 'nf'],
      ['Заказов закрыто полностью', full + ' из ' + ords.length, full === ords.length ? 'ok' : '', 'full'], ['Ручных правок', ne, '', 'ne'],
      ['Склад: критично / ниже мин.', SPK.red + ' / ' + SPK.yellow, SPK.red ? 'bad' : (SPK.yellow ? 'warn' : 'ok'), 'smin'], ['Комментарии', cmCount(), '', 'cm'], ['Инвойсы', invCount(), '', 'inv']];
    }

    /* ================= заказы, добавленные вручную ================= */
    function ruDate(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '.' + m[2] + '.' + m[1] : String(iso || ''); }
    function isoDate(ru) { var m = String(ru || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; }
    function todayRu() { return fmtDateRu(new Date()); }
    function guessGroup(nm, positions) {
      var bc = baseProductCode(nm).replace(/\s+/g, '').toUpperCase(), g = null;
      if (!bc) return 'Добавлено вручную';
      positions.some(function (p) { if (p.group.replace(/\s+/g, '').toUpperCase() === bc) { g = p.group; return true; } return false; });
      if (!g) positions.some(function (p) { if (!p.manual && baseProductCode(p.name).replace(/\s+/g, '').toUpperCase() === bc) { g = p.group; return true; } return false; });
      return g || 'Добавлено вручную';
    }
    function mergeManual(oor, mo) {
      var ids = Object.keys(mo || {}).filter(function (id) { return mo[id] && mo[id].items && mo[id].items.length; });
      if (!ids.length) return oor;
      var orders = oor.orders.slice(), positions = oor.positions.slice(), byKey = {}, cloned = {};
      positions.forEach(function (p, i) { byKey[p.key] = i; });
      var maxCol = 0; oor.orders.forEach(function (o) { if (o.col > maxCol) maxCol = o.col; });
      ids.sort(function (a, b) { return (mo[a].ts || 0) - (mo[b].ts || 0); }).forEach(function (id, j) {
        var m = mo[id];
        var o = { id: 'm_' + id, col: maxCol + 2 * (j + 1), colLetter: '', label: m.label, fullLabel: 'Заказ ' + (cleanSp(m.label).replace(/^[A-ZА-Я]{1,3}\s*(?=№)/i, '') || m.label), client: m.client || '', created: m.created || '', code: m.code || '', due: m.due || '', pct: '', key: 'РУЧН|' + id, manual: id };
        orders.push(o);
        m.items.forEach(function (it) {
          var nm = cleanSp(it.name), k = nm.toUpperCase(), q = +it.q || 0, rv = +it.r || 0;
          if (!nm || (!q && !rv)) return;
          var i = byKey[k], p;
          if (i === undefined) { p = { id: 'pm' + hash(k), key: k, name: nm, group: guessGroup(nm, positions), rows: [], q: {}, r: {}, manual: true }; byKey[k] = positions.length; positions.push(p); cloned[k] = 1; }
          else { p = positions[i]; if (!cloned[k]) { p = Object.assign({}, p, { q: Object.assign({}, p.q), r: Object.assign({}, p.r) }); positions[i] = p; cloned[k] = 1; } }
          p.q[o.id] = (p.q[o.id] || 0) + q; p.r[o.id] = (p.r[o.id] || 0) + rv;
        });
      });
      // новые позиции — внутрь своей группы (после последней позиции группы)
      var out = [], add = positions.filter(function (p) { return p.manual; }), base = positions.filter(function (p) { return !p.manual; });
      base.forEach(function (p, i) {
        out.push(p);
        var nx = base[i + 1];
        if (!nx || nx.group !== p.group) add.forEach(function (a) { if (!a._put && a.group === p.group) { out.push(a); a._put = 1; } });
      });
      add.forEach(function (a) { if (!a._put) out.push(a); delete a._put; });
      return { orders: orders, positions: out, headerRow: oor.headerRow };
    }
    function itemHint(nm) {
      nm = cleanSp(nm); if (!nm) return { cls: '', t: '' };
      var k = nm.toUpperCase(), inO = BASE.oor.positions.filter(function (p) { return p.key === k; })[0];
      var st = td2Stock(TD2, nm), b = OBUILD ? OBUILD.best(nm) : null, fnd = b && OBUILD.found(b);
      var semi = fnd ? b.rows.filter(function (r) { return r.cls === 'Y'; }).map(function (r) { return r.v[3]; }).join(', ') : '';
      var sk = 'склад ' + (st.found ? fmt(st.stock) + ' шт' : 'нет');
      if (inO) return { cls: 'ok', t: 'есть в OOR · группа ' + inO.group + ' · ' + sk + (fnd ? ' · полуфабрикат ' + semi : '') };
      if (fnd) return { cls: 'res', t: 'новая позиция · ' + sk + ' · состав найден: полуфабрикат ' + semi + ' — будет проанализирована как обычно' };
      if (st.found) return { cls: 'res', t: 'новая позиция · ' + sk + ' · состава нет — считается только склад' };
      return { cls: 'bad', t: 'не найдено ни на складе (TDSheet2), ни в TDSheet/NEP — проверьте название' };
    }
    function orderForm(editId) {
      var m = editId && OV.mo[editId] ? JSON.parse(JSON.stringify(OV.mo[editId])) : { label: '', client: '', created: todayRu(), due: '', code: '', items: [] };
      if (!m.items.length) m.items.push({ name: '', q: '', r: '' });
      var cl = {}; OOR.orders.forEach(function (o) { if (o.client) cl[o.client] = 1; });
      var h = head(editId ? 'Изменить заказ ' + esc(m.label) : 'Добавить заказ', 'Заказ встанет в очередь по дате заказа и сразу будет проанализирован (резерв → склад → полуфабрикат → производство)');
      h += '<datalist id="moCl">' + Object.keys(cl).sort().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>';
      h += '<datalist id="moNm">' + OOR.positions.map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('') + '</datalist>';
      h += '<div class="mo-f"><div><label>Номер заказа *</label><input id="moL" placeholder="напр. UZ №130" value="' + esc(m.label) + '"></div>' +
        '<div><label>Клиент</label><input id="moC" list="moCl" value="' + esc(m.client) + '"></div>' +
        '<div><label>Дата заказа (очередь)</label><input id="moD" type="date" value="' + isoDate(m.created) + '"></div>' +
        '<div><label>Срок</label><input id="moS" type="date" value="' + isoDate(m.due) + '"></div>' +
        '<div><label>Код заказа</label><input id="moK" value="' + esc(m.code) + '"></div></div>';
      h += '<div class="fbar"><button class="btn sm" id="moTpl">⬇ Скачать шаблон Excel</button><button class="btn sm" id="moUp">⬆ Загрузить заказ из файла</button><input type="file" id="moFile" accept=".xlsx,.xls,.xlsm,.csv" style="display:none"><span class="note" id="moFileMsg"></span></div>';
      h += '<div class="mo-row"><span class="mo-h">Название товара</span><span class="mo-h">Заказ, шт</span><span class="mo-h">В резерве, шт</span><span></span></div><div id="moRows"></div>';
      h += '<div class="fbar" style="margin-top:8px"><button class="btn sm" id="moAdd">＋ позиция</button><span class="sp"></span>' +
        (editId ? '<button class="btn" id="moDel" style="border-color:var(--bad);color:var(--bad)">Удалить заказ</button>' : '') +
        '<button class="btn" id="moNo">Отмена</button><button class="btn primary" id="moOk">' + (editId ? 'Сохранить изменения' : 'Добавить заказ') + '</button></div><p class="note" id="moErr" style="color:var(--bad)"></p></div>';
      openModal(h);
      var addRow = function (it) {
        var d = document.createElement('div'); d.className = 'mo-row';
        d.innerHTML = '<input class="moN" list="moNm" placeholder="начните вводить название…" value="' + esc(it.name || '') + '"><input class="moQ" type="number" min="0" step="1" value="' + esc(it.q === '' ? '' : it.q) + '"><input class="moR" type="number" min="0" step="1" value="' + esc(it.r === '' || it.r === undefined ? '' : it.r) + '"><button class="btn sm moX" title="Убрать строку">✕</button><div class="mo-hint"></div>';
        $('moRows').appendChild(d);
        var upd = function () { var x = itemHint(d.querySelector('.moN').value), e = d.querySelector('.mo-hint'); e.className = 'mo-hint ' + x.cls; e.textContent = x.t; };
        d.querySelector('.moN').addEventListener('change', upd); d.querySelector('.moN').addEventListener('blur', upd);
        d.querySelector('.moX').onclick = function () { d.remove(); if (!$('moRows').children.length) addRow({ name: '', q: '', r: '' }); };
        if (it.name) upd();
      };
      m.items.forEach(addRow);
      var curForm = function () { var it = []; $('moRows').querySelectorAll('.mo-row').forEach(function (d) { var nm = cleanSp(d.querySelector('.moN').value); if (nm) it.push({ name: nm, q: d.querySelector('.moQ').value, r: d.querySelector('.moR').value }); }); return { label: cleanSp($('moL').value), client: cleanSp($('moC').value), created: ruDate($('moD').value), due: ruDate($('moS').value), code: cleanSp($('moK').value), items: it }; };
      $('moTpl').onclick = function () {
        var buf = orderTemplate(curForm()), nm = 'Шаблон_заказа' + (cleanSp($('moL').value) ? '_' + cleanSp($('moL').value).replace(/[\\/:*?"<>|№ ]+/g, '_') : '') + '.xlsx';
        saveBinary(nm, buf).then(function () { $('moFileMsg').textContent = 'Шаблон сохранён: заполните колонку «Заказ, шт» и загрузите файл обратно.'; }, function (e) { $('moFileMsg').textContent = 'Не сохранён: ' + (e && (e.message || e.code) || e); });
      };
      $('moUp').onclick = function () { $('moFile').click(); };
      $('moFile').onchange = function () {
        var f = this.files[0]; if (!f) return; var rd = new FileReader();
        rd.onload = function () {
          try {
            var wb = XLSX.read(new Uint8Array(rd.result), { type: 'array', cellDates: true }), ws = wb.Sheets[wb.SheetNames[0]];
            var mm = parseOrderFile(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }));
            if (mm.label) $('moL').value = mm.label; if (mm.client) $('moC').value = mm.client;
            if (isoDate(mm.created)) $('moD').value = isoDate(mm.created); if (isoDate(mm.due)) $('moS').value = isoDate(mm.due); if (mm.code) $('moK').value = mm.code;
            if (!mm.items.length) { $('moFileMsg').textContent = 'В файле не найдено строк с количеством заказа.'; return; }
            $('moRows').innerHTML = ''; mm.items.forEach(addRow);
            var sum = mm.items.reduce(function (s2, x) { return s2 + x.q; }, 0);
            $('moFileMsg').textContent = 'Загружено из «' + f.name + '»: ' + mm.items.length + ' поз., ' + fmt(sum) + ' шт. Проверьте подсказки и нажмите «Добавить заказ».';
          } catch (e) { $('moFileMsg').textContent = 'Не удалось прочитать файл: ' + (e.message || e); }
        };
        rd.readAsArrayBuffer(f); this.value = '';
      };
      $('moAdd').onclick = function () { addRow({ name: '', q: '', r: '' }); var ins = $('moRows').querySelectorAll('.moN'); ins[ins.length - 1].focus(); };
      $('moNo').onclick = closeModal;
      if (editId) $('moDel').onclick = function () {
        var b = this; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Точно удалить? Нажмите ещё раз'; return; }
        var ts = Date.now(), old = OV.mo[editId]; delete OV.mo[editId];
        var hst = { ts: ts, by: ME, kind: 'order', text: 'Удалён заказ ' + old.label + (old.client ? ' (' + old.client + ')' : '') };
        HIST.unshift(hst);
        persistEdit('mo_' + editId, 'mo', editId, null, { name: 'Заказ ' + old.label }, null, ts).then(function () { return persistHist(hst); });
        closeModal(); recalc(); showMsg('Заказ ' + esc(old.label) + ' удалён.', 'good');
      };
      $('moOk').onclick = function () {
        var lab = cleanSp($('moL').value), items = [], err = [];
        if (!lab) err.push('укажите номер заказа');
        $('moRows').querySelectorAll('.mo-row').forEach(function (d) {
          var nm = cleanSp(d.querySelector('.moN').value), q = parseFloat(String(d.querySelector('.moQ').value).replace(',', '.')) || 0, rv = parseFloat(String(d.querySelector('.moR').value).replace(',', '.')) || 0;
          if (!nm && !q && !rv) return;
          if (!nm) { err.push('у строки с количеством ' + q + ' нет названия'); return; }
          if (q <= 0) { err.push('«' + nm + '»: количество заказа должно быть больше 0'); return; }
          if (rv > q) { err.push('«' + nm + '»: резерв больше заказа'); return; }
          items.push({ name: nm, q: q, r: rv });
        });
        if (!items.length && !err.length) err.push('добавьте хотя бы одну позицию');
        if (err.length) { $('moErr').textContent = 'Не сохранено: ' + err.join('; ') + '.'; return; }
        var ts = Date.now(), id = editId || ('m' + ts.toString(36));
        var obj = { label: lab, client: cleanSp($('moC').value), created: ruDate($('moD').value) || todayRu(), due: ruDate($('moS').value), code: cleanSp($('moK').value), items: items, ts: editId && OV.mo[editId] ? OV.mo[editId].ts : ts, by: ME || '' };
        OV.mo[id] = obj;
        var sum = items.reduce(function (s, x) { return s + x.q; }, 0);
        var hst = { ts: ts, by: ME, kind: 'order', text: (editId ? 'Изменён' : 'Добавлен') + ' заказ ' + lab + (obj.client ? ' (' + obj.client + ')' : '') + ' от ' + obj.created + ': ' + items.length + ' поз., ' + fmt(sum) + ' шт' };
        HIST.unshift(hst);
        persistEdit('mo_' + id, 'mo', id, obj, { name: 'Заказ ' + lab }, null, ts).then(function () { return persistHist(hst); });
        recalc(); ordModal('m_' + id);
        showMsg('Заказ ' + esc(lab) + ' ' + (editId ? 'изменён' : 'добавлен') + ' и проанализирован: место в очереди ' + (QUEUE.indexOf(O('m_' + id)) + 1) + ' из ' + QUEUE.length + '.', 'good');
      };
    }

    /* ================= списки по верхним блокам ================= */
    function kpiList(kind) {
      if (kind === 'ne') { histModal(); $('hk').value = 'edit'; drawHist(); return; }
      if (kind === 'smin') { minStockModal('', 'low'); return; }
      if (kind === 'cm') { cmListModal(''); return; }
      if (kind === 'inv') { invListModal(); return; }
      var ords = visibleOrders(), h = '', title = '', meta = '', n = 0;
      var acOf = function (p, o, c) { return AC(p, o) || { fg: c.give, semi: 0, prod: 0, short: c.short }; };
      var agg = function (p) { var r = R[p.id], t = { n: 0, q: 0, rv: 0, need: 0, fg: 0, semi: 0, prod: 0, sh: 0 }; ords.forEach(function (o) { var c = r.cells[o.id]; if (!c) return; var a = acOf(p, o, c); t.n++; t.q += c.q; t.rv += c.rv; t.need += c.need; t.fg += a.fg; t.semi += a.semi; t.prod += a.prod; t.sh += a.short; }); return t; };
      var N = function (v) { return v ? fmt(v) : '—'; };
      if (kind === 'pos' || kind === 'sp' || kind === 'nf') {
        var L = OOR.positions.map(function (p) { return { p: p, t: agg(p) }; }).filter(function (x) {
          if (!x.t.n) return false; if (kind === 'sp') return x.t.sh > 0; if (kind === 'nf') return !R[x.p.id].stockFound && !R[x.p.id].stockEdited; return true;
        });
        if (kind === 'sp') L.sort(function (a, b) { return b.t.sh - a.t.sh; });
        title = { pos: 'Позиции', sp: 'Позиции с нехваткой', nf: 'Нет в складе' }[kind];
        meta = { pos: 'Все позиции, по которым есть заказы', sp: 'Не хватает даже с полуфабрикатом и производством · по убыванию нехватки', nf: 'Точного названия нет в TDSheet2 — остаток склада 0' }[kind];
        var T = { q: 0, rv: 0, fg: 0, semi: 0, prod: 0, sh: 0 };
        h = '<table class="mini" id="kl"><tr><th>№</th><th>Группа</th><th>Название товара</th><th class="n">Заказов</th><th class="n">Заказ</th><th class="n">Резерв</th><th class="n">Склад</th><th class="n">Со склада</th><th class="n">П/ф</th><th class="n">Произв.</th><th class="n">Не хватает</th></tr>';
        L.forEach(function (x, i) {
          var t = x.t, r = R[x.p.id]; T.q += t.q; T.rv += t.rv; T.fg += t.fg; T.semi += t.semi; T.prod += t.prod; T.sh += t.sh;
          h += '<tr class="go" data-p="' + x.p.id + '" data-s="' + esc((x.p.group + x.p.name).replace(/\s+/g, '').toUpperCase()) + '"><td>' + (i + 1) + '</td><td>' + esc(x.p.group) + '</td><td><b>' + esc(x.p.name) + '</b></td><td class="n">' + t.n + '</td><td class="n">' + fmt(t.q) + '</td><td class="n">' + N(t.rv) + '</td><td class="n">' + fmt(r.stock) + '</td><td class="n">' + N(t.fg) + '</td><td class="n">' + N(t.semi) + '</td><td class="n">' + N(t.prod) + '</td><td class="n" style="color:' + (t.sh ? 'var(--bad)' : 'inherit') + '"><b>' + N(t.sh) + '</b></td></tr>';
        });
        h += '<tr class="tot"><td colspan="4"><b>Итого: ' + L.length + '</b></td><td class="n"><b>' + fmt(T.q) + '</b></td><td class="n"><b>' + N(T.rv) + '</b></td><td></td><td class="n"><b>' + N(T.fg) + '</b></td><td class="n"><b>' + N(T.semi) + '</b></td><td class="n"><b>' + N(T.prod) + '</b></td><td class="n" style="color:var(--bad)"><b>' + N(T.sh) + '</b></td></tr></table>';
        n = L.length;
      } else if (kind === 'ord' || kind === 'full') {
        var OL = ords.map(function (o, i) { var t = { n: 0, q: 0, rv: 0, sh: 0, ok: 0 }; OOR.positions.forEach(function (p) { var c = R[p.id].cells[o.id]; if (!c) return; var a = acOf(p, o, c); t.n++; t.q += c.q; t.rv += c.rv; t.sh += a.short; if (!a.short) t.ok++; }); return { o: o, i: i + 1, t: t }; });
        var tbl = function (L, cap) {
          var x = '<h3>' + cap + ' (' + L.length + ')</h3><table class="mini"><tr><th>Очередь</th><th>Заказ</th><th>Клиент</th><th>Дата заказа</th><th>Срок</th><th class="n">Позиций</th><th class="n">Хватает</th><th class="n">Заказ, шт</th><th class="n">Резерв</th><th class="n">Не хватает</th><th class="n">Обеспечено</th></tr>';
          L.forEach(function (y) { var t = y.t; x += '<tr class="goo" data-o="' + y.o.id + '" data-s="' + esc((y.o.label + y.o.client).replace(/\s+/g, '').toUpperCase()) + '"><td>' + y.i + '</td><td><b>' + esc(y.o.label) + '</b>' + (y.o.manual ? '<span class="manual-tag">вручную</span>' : '') + '</td><td>' + esc(y.o.client) + '</td><td>' + esc(y.o.created || '—') + '</td><td>' + esc(y.o.due || '—') + '</td><td class="n">' + t.n + '</td><td class="n">' + t.ok + '</td><td class="n">' + fmt(t.q) + '</td><td class="n">' + N(t.rv) + '</td><td class="n" style="color:' + (t.sh ? 'var(--bad)' : 'var(--ok)') + '"><b>' + (t.sh ? fmt(t.sh) : 'закрыт') + '</b></td><td class="n">' + (t.q ? Math.floor((t.q - t.sh) / t.q * 100) : 100) + '%</td></tr>'; });
          return x + '</table>';
        };
        var cl = OL.filter(function (y) { return !y.t.sh; }), op = OL.filter(function (y) { return y.t.sh; });
        if (kind === 'ord') { title = 'Заказы'; meta = 'В порядке очереди · нажмите на заказ — все его позиции'; h = tbl(OL, 'Все заказы'); n = OL.length; }
        else { title = 'Заказы закрыты полностью'; meta = 'Закрыт — по всем позициям хватает резерва, склада, полуфабриката и производства'; h = (cl.length ? tbl(cl, 'Закрыты полностью') : '<p class="note">Нет полностью закрытых заказов.</p>') + tbl(op, 'Не закрыты'); n = cl.length; }
      } else {
        var CL = [];
        QUEUE.forEach(function (o, qi) {
          if (ords.indexOf(o) < 0) return; OOR.positions.forEach(function (p) {
            var c = R[p.id].cells[o.id]; if (!c) return; var a = acOf(p, o, c);
            if (kind === 'mk' && !(a.semi + a.prod > 0)) return; if ((kind === 'sc' || kind === 'sq') && !(a.short > 0)) return; CL.push({ p: p, o: o, c: c, a: a, qi: qi + 1 });
          });
        });
        if (kind === 'sq') CL.sort(function (a, b) { return b.a.short - a.a.short; });
        title = { cells: 'Строки позиция × заказ', mk: 'Из полуфабриката и производства', sc: 'Строки с нехваткой', sq: 'Не хватает всего' }[kind];
        meta = { cells: 'Все ячейки таблицы по очереди заказов', mk: 'Где заказ закрывается полуфабрикатом со склада и/или производством из деталей', sc: 'По очереди заказов', sq: 'По убыванию нехватки' }[kind];
        var S = { q: 0, rv: 0, fg: 0, semi: 0, prod: 0, sh: 0 };
        h = '<table class="mini" id="kl"><tr><th>№</th><th>Заказ</th><th>Клиент</th><th>Группа</th><th>Название товара</th><th class="n">Заказ</th><th class="n">Резерв</th><th class="n">Склад</th><th class="n">П/ф</th><th class="n">Произв.</th><th class="n">Не хватает</th></tr>';
        CL.forEach(function (x, i) {
          S.q += x.c.q; S.rv += x.c.rv; S.fg += x.a.fg; S.semi += x.a.semi; S.prod += x.a.prod; S.sh += x.a.short;
          h += '<tr class="go" data-p="' + x.p.id + '" data-o="' + x.o.id + '" data-s="' + esc((x.o.label + x.o.client + x.p.group + x.p.name).replace(/\s+/g, '').toUpperCase()) + '"><td>' + (i + 1) + '</td><td>' + esc(x.o.label) + '</td><td>' + esc(x.o.client) + '</td><td>' + esc(x.p.group) + '</td><td><b>' + esc(x.p.name) + '</b></td><td class="n">' + fmt(x.c.q) + '</td><td class="n">' + N(x.c.rv) + '</td><td class="n">' + N(x.a.fg) + '</td><td class="n">' + N(x.a.semi) + '</td><td class="n">' + N(x.a.prod) + '</td><td class="n" style="color:' + (x.a.short ? 'var(--bad)' : 'inherit') + '"><b>' + N(x.a.short) + '</b></td></tr>';
        });
        h += '<tr class="tot"><td colspan="5"><b>Итого строк: ' + CL.length + '</b></td><td class="n"><b>' + fmt(S.q) + '</b></td><td class="n"><b>' + N(S.rv) + '</b></td><td class="n"><b>' + N(S.fg) + '</b></td><td class="n"><b>' + N(S.semi) + '</b></td><td class="n"><b>' + N(S.prod) + '</b></td><td class="n" style="color:var(--bad)"><b>' + N(S.sh) + '</b></td></tr></table>';
        n = CL.length;
      }
      var cf = $('cli').value;
      openModal(head(title + ' — ' + n, meta + (cf ? ' · клиент: ' + esc(cf) : '')) + '<div class="fbar"><input type="search" id="klq" placeholder="Поиск по списку…" style="min-width:280px"><span class="note">Нажмите на строку — подробный анализ</span></div><div class="scroll" style="max-height:66vh">' + h + '</div></div>', true);
      $('klq').addEventListener('input', function () { var q = this.value.replace(/\s+/g, '').toUpperCase(); modal.querySelectorAll('tr[data-s]').forEach(function (tr) { tr.style.display = !q || tr.dataset.s.indexOf(q) >= 0 ? '' : 'none'; }); });
      bindGo();
      modal.querySelectorAll('tr.goo').forEach(function (tr) { tr.onclick = function () { ordModal(tr.dataset.o); }; });
    }
    $('kpis').addEventListener('click', function (e) { var k = e.target.closest('.kpi'); if (k && k.dataset.k) kpiList(k.dataset.k); });
    $('addOrdBtn').onclick = function () { orderForm(''); };
    $('anBtn').onclick = function () {
      var b = this, bh = b.innerHTML; b.disabled = true; b.innerHTML = bh.replace('АНАЛИЗ', 'Анализ…');
      showMsg('Анализ: заново строю блоки Обработки для всех позиций и пересчитываю очередь заказов…', 'good');
      setTimeout(function () {
        try {
          var t0 = performance.now();
          buildEngine(); recalc();
          var found = 0, nf = 0, sh = 0, rows = 0;
          OOR.positions.forEach(function (p) { if (blockOf(p)) found++; else nf++; QUEUE.forEach(function (o) { if (R[p.id].cells[o.id]) { var s = finalShort(p, o); if (s > 0) { sh += s; rows++; } } }); });
          var txt = 'Позиций ' + OOR.positions.length + ', заказов ' + OOR.orders.length + '. Блоки Обработки построены для ' + found + ' позиций' + (nf ? ' (без состава: ' + nf + ')' : '') +
            (VERIFY && VERIFY.n ? '; сверка с листом Обработка: ' + VERIFY.ok + ' из ' + VERIFY.n + ' совпадают' : '') + '. Не хватает ' + fmt(sh) + ' шт в ' + rows + ' строках. Время ' + ((performance.now() - t0) / 1000).toFixed(1) + ' с.';
          if (BASE.stockUpd) txt = 'Склад: ' + BASE.stockUpd.file + ' на ' + (BASE.stockUpd.period || '—') + '. ' + txt;
          showMsg('Анализ выполнен заново. ' + esc(txt), 'good'); b.classList.remove('hot');
          var hst = { ts: Date.now(), by: ME, kind: 'analysis', text: txt }; HIST.unshift(hst); persistHist(hst);
          analysisModal(snapOrders(), SNAP, txt); invPendingApply();
        } catch (e) { showMsg('Ошибка анализа: ' + esc(e.message || e), 'err'); console.error(e); }
        b.disabled = false; b.innerHTML = bh; renderHinfo();
      }, 40);
    };

    /* ================= структура на 1 шт (по TDSheet: «Количество состав»; NEP — без норм) ================= */
    var BOMX = null, BOMEDIT = false;
    /* состав с добавлениями пользователя (OV.bom «A|…»): строки вставляются в TDSheet / NEP под родителя */
    var EFFS = null, EFFSIG = '';
    function effStruct() {
      if (!BASE || !BASE.struct || !BASE.struct.raw) return BASE ? BASE.struct : null;
      var adds = Object.keys(OV.bom || {}).filter(function (k) { return k.indexOf('A|') === 0 && OV.bom[k]; }), sig = JSON.stringify(adds.map(function (k) { return [k, OV.bom[k]]; }));
      if (EFFS && sig === EFFSIG && EFFS.src === BASE.struct) return EFFS.s;
      var raw = BASE.struct.raw, td = raw.td.slice(), nep = raw.nep.slice();
      var sv = function (n) { var x = TD2 ? td2Stock(TD2, n) : null; return x && x.found ? x.stock : 0; };
      adds.forEach(function (k) {
        var a = OV.bom[k], pu = cleanSp(a.parent).toUpperCase(), i, j;
        for (i = 0; i < td.length; i++) if (cleanSp(td[i][0]).toUpperCase() === pu) break;
        if (i < td.length) {
          var N = 0; td.forEach(function (r) { if (!cleanSp(r[0]) && cleanSp(r[1]).toUpperCase() === pu && typeof r[4] === 'number') N += r[4]; });
          for (j = i + 1; j < td.length && !cleanSp(td[j][0]); j++);
          td.splice(j, 0, [null, a.name, sv(a.name), null, a.qty * (N || 1)]); return;
        }
        for (i = 0; i < nep.length; i++) if (cleanSp(nep[i][0]).toUpperCase() === pu) break;
        if (i < nep.length) { for (j = i + 1; j < nep.length && !cleanSp(nep[j][0]); j++); nep.splice(j, 0, [null, a.name, sv(a.name)]); return; }
      });
      var out = Object.assign({}, BASE.struct, { raw: Object.assign({}, raw, { td: td, nep: nep }) });
      EFFS = { src: BASE.struct, s: out }; EFFSIG = sig; return out;
    }
    function bomIndex() {
      if (BOMX) return BOMX;
      var ES = effStruct(), S = ES && ES.raw; if (!S) return null;
      var td = S.td || [], nep = S.nep || [], hdr = {}, app = {}, hasQ = false, cur = null, nh = {};
      td.forEach(function (r, i) {
        var a = cleanSp(r[0]), b = cleanSp(r[1]);
        if (a) { cur = a.toUpperCase(); if (!(cur in hdr)) hdr[cur] = i; }
        else if (b && cur) { var k = b.toUpperCase(), d = r[4]; if (typeof d === 'number') { hasQ = true; app[k] = (app[k] || 0) + d; } }
      });
      nep.forEach(function (r, i) { var a = cleanSp(r[0]); if (a) { var k = a.toUpperCase(); if (!(k in nh)) nh[k] = i; } });
      var sp = {}, SP = EMBEDDED.kgdb.spec || {}; Object.keys(SP).forEach(function (k) { sp[cleanSp(k).toUpperCase()] = SP[k]; });
      BOMX = { td: td, nep: nep, hdr: hdr, app: app, nh: nh, hasQ: hasQ, sp: sp };
      return BOMX;
    }
    /* ключи правок структуры: N — деталь на 1 полуфабрикат, S — полуфабрикат на 1 товар, K — кг материала на 1 деталь, A — добавленная строка */
    function bomKey(kind, parent, name) {
      if (kind === 'mat' || kind === 'grease') return 'K|' + cleanSp(parent).toUpperCase() + '|' + cleanSp(name).toUpperCase();
      if (kind === 'semi') return 'S|' + kitNormKey(parent) + '|' + kitNormKey(name);
      return 'N|' + kitNormKey(parent) + '|' + detailNormKey(name);
    }
    function bomAddKey(parent, name) { return 'A|' + cleanSp(parent).toUpperCase() + '|' + cleanSp(name).toUpperCase(); }
    function bomOv(parent, K) {
      var B = OV.bom || {};
      K.kids.forEach(function (x) {
        var kd = bomKind(x.name), add = B[bomAddKey(parent, x.name)];
        if (add) { x.add = true; x.q = add.qty; if (add.unit) x.unit = add.unit; return; }
        var v = B[bomKey(kd, parent, x.name)];
        if (v > 0) { x.q = v; x.ed = true; }
        else if (kd === 'semi') { var kk = kitNormKey(parent) + '|' + kitNormKey(x.name); if (KNORM[kk] > 0 && x.q !== KNORM[kk]) { x.q = KNORM[kk]; x.mac = true; } }
        else if (kd !== 'mat' && kd !== 'grease') {
          /* норма детали на 1 полуфабрикат — как в макросе: таблица норм (GetDetailNormDbVTOV), стойка R/RS 4XXX; иначе из TDSheet */
          var dk = kitNormKey(parent) + '|' + detailNormKey(x.name), dn = detNorm(parent, x.name);
          if (DNORM[dk] > 0 || isStab4(parent)) { if (x.q !== dn) { x.q = dn; x.mac = true; } if (dn > 1) x.stab = true; }
          else if (dn > 1 && (x.q === null || x.q < dn)) { x.q = dn; x.stab = true; }
        }
      });
      return K;
    }
    function bomKids(name) {
      var X = bomIndex(); if (!X) return null;
      var k = cleanSp(name).toUpperCase(), i, out = [];
      if (k in X.hdr) {
        var N = X.app[k] || bomRootN(X, k), raw = [];
        for (i = X.hdr[k] + 1; i < X.td.length && !cleanSp(X.td[i][0]); i++) {
          var b = cleanSp(X.td[i][1]); if (!b) continue;
          raw.push({ name: b, d: typeof X.td[i][4] === 'number' ? X.td[i][4] : null });
        }
        /* проверка делителя: детали должны выйти целыми; иначе делитель = наименьшее целое D среди деталей */
        if (X.app[k]) {
          var fam = {}; raw.forEach(function (x) { var kd = bomKind(x.name); if ((kd === 'det' || kd === 'semi') && x.d > 0) { var vb = bomVarBase(x.name); fam[vb] = (fam[vb] || 0) + x.d; } });
          var fv = Object.keys(fam).map(function (f) { return fam[f]; });
          var bad = fv.some(function (v) { var q = v / N; return q < 0.98 || Math.abs(q - Math.round(q)) > 0.02; });
          if (bad && fv.length) { var mn = Math.min.apply(null, fv.filter(function (v) { return Math.abs(v - Math.round(v)) < 1e-6; }).concat([Infinity])); if (mn > 0 && mn < Infinity) N = mn; }
        }
        raw.forEach(function (x) { out.push({ name: x.name, q: x.d === null ? null : x.d / N }); });
        return bomOv(name, { src: 'TD', kids: out });
      }
      if (X.sp[k]) {
        var e = X.sp[k];
        return bomOv(name, { src: 'SPEC', analog: e.analog || '', kids: (e.kids || []).map(function (c) { return { name: c[0], q: c[1], unit: c[2], extra: c[3] === 'x' }; }) });
      }
      if (k in X.nh) {
        for (i = X.nh[k] + 1; i < X.nep.length && !cleanSp(X.nep[i][0]); i++) { var b2 = cleanSp(X.nep[i][1]); if (b2) out.push({ name: b2, q: null }); }
        return bomOv(name, { src: 'NEP', kids: out });
      }
      /* полуфабрикат без состава в TDSheet/NEP: детали 01–06 из листа «Анализ_разоб_виде» */
      var dm = k.match(/^(.+?)-50(\s|$)/), DA = OBUILD && OBUILD.disasm, dk = dm ? dm[1].replace(/\s+/g, '') : '', arr = dk && DA ? DA[dk] : null;
      if (arr) {
        arr.slice(0, 5).forEach(function (d) { d = cleanSp(d); if (d && d !== '-') out.push({ name: d, q: 1 }); });
        if (out.length) return bomOv(name, { src: 'DIS', kids: out });
      }
      return null;
    }
    /* товар верхнего уровня: в TDSheet его строки могут быть сложены по нескольким заказам — число повторов
       берём по большому коробу: «Стикер наружный 100*60» (или самый малый «Гофрокороб №») × вместимость из последних скобок названия */
    function bomRootN(X, k) {
      var i = X.hdr[k], nm = cleanSp(X.td[i][0]), ps = nm.match(/\(([^)]*)\)/g), cap = 0;
      if (ps) { var m = ps[ps.length - 1].match(/(\d+)\s*\)$/); if (m) cap = +m[1]; }
      if (!cap) return 1;
      var box = null, boxes = [], semiD = null;
      for (var j = i + 1; j < X.td.length && !cleanSp(X.td[j][0]); j++) {
        var b = cleanSp(X.td[j][1]), d = X.td[j][4]; if (!b || typeof d !== 'number') continue;
        if (/Стикер наружный 100\*60/i.test(b)) box = d; else if (/Гофрокороб\s*№/i.test(b)) boxes.push(d);
        if (semiD === null && /-50\s*S?(\s|$|\))/i.test(b)) semiD = d;
      }
      if (box === null && boxes.length) box = Math.min.apply(null, boxes);
      if (box === null) return 1;
      var N = Math.round(box * cap);
      if (N < 1 || (semiD !== null && semiD / N < 0.99)) return 1;
      return N;
    }
    function bomKind(n) {
      var s = cleanSp(n);
      if (/стикер|гофро|короб|пл[её]нк|скотч|руковод|пакет|этикет|инструкц|упаков|вкладыш/i.test(s)) return 'pack';
      if (/солидол|литол|смазк|хемосил|клей|герметик|краск|грунт/i.test(s)) return 'grease';
      if (/[-\/]50(\s*TRT)?\s*S?(\s|$|\))/i.test(s) || /-[123]0(\s|$)/.test(s)) return 'semi';
      if (isNRKgCode(s) || /^(NR|CR)\s?\d+-[AS]-?\d+$/i.test(s)) return 'mat';
      if (isRawName(s)) return /^SR\s?\d|прут|лист|труб|круг|проволок|лент[аы]?\b|полос|резин|каучук|TPU|термопласт|полиуретан|гранул|шестигран|квадрат|уголок|швеллер|ст\.\s?\d|сталь\s/i.test(s) ? 'mat' : 'buy';
      return 'det';
    }
    var BOM_KIND = { semi: 'полуфабрикат', det: 'деталь', buy: 'покупное', mat: 'материал', grease: 'смазка / химия', pack: 'упаковка' };
    var BOM_BG = { semi: '#FFFF00', det: '#9BC2E6', buy: '#DDEBF7', mat: '#F8CBAD', grease: '#E2EFDA', pack: '#EDEDED' };
    function bomVarBase(n) { var s = cleanSp(n).toUpperCase(), m = s.match(/^(.*?\S)\s+(M|S|P|D)$/); return m ? m[1] : s; }
    function fmtQ(q) { if (q === null || q === undefined) return '—'; var r = Math.round(q * 100000) / 100000; return r.toLocaleString('ru-RU', { maximumFractionDigits: 5 }); }
    /* как в макросе (IsValidSemiProduct): упаковку, смазку, метизы и прочее из списка исключений в структуре не показываем; TPU — материал пыльника — нужен */
    function bomKeep(n) { return isValidSemi(n) || /TPU|термопласт|полиуретан/i.test(n); }
    function bomTree(prod, startName, out, depth, seen, prevName) {
      var K = bomKids(startName); if (!K || depth > 14) return;
      var groups = [], by = {};
      K.kids.filter(function (x) { return bomKeep(x.name) || x.add; }).forEach(function (x) { var b = bomVarBase(x.name); if (!by[b]) { by[b] = { names: [], q: 0, qn: false, items: [] }; groups.push(by[b]); } var g = by[b]; g.names.push(x.name); g.items.push(x); if (x.q === null) g.qn = true; else if (x.ed || x.stab || x.mac) g.q = x.q; else g.q += x.q; });
      groups.forEach(function (g, gi) {
        var kind = bomKind(g.names[0]), q = g.qn ? null : g.q, note = K.src === 'DIS' && !gi ? 'детали — по листу «Анализ_разоб_виде»' : '';
        var edq = g.items.some(function (x) { return x.ed; });
        /* кг материала на 1 деталь — как в анализе: правка пользователя → проверенный состав → база кг/шт макроса и лист «кг_шт»; TDSheet — если в базе нет */
        if (kind === 'mat' && ENGINE && !edq) { var kp = ENGINE.kgPerPc(prod, prevName || startName, g.names[0]); if (kp && kp.v > 0 && (kp.exact || q === null)) { if (q !== null && Math.abs(q - kp.v) > 1e-6) note = 'база кг/шт (в TDSheet ' + fmtQ(q) + ')'; else if (q === null) note = 'база кг/шт' + (kp.exact ? '' : ' (среднее)'); q = kp.v; } }
        if (q === null && (kind === 'semi' || kind === 'det' || kind === 'buy')) q = 1;
        if (K.src === 'SPEC' && K.analog) note = 'по образцу ' + K.analog + ' — подтвердите';
        var ed = g.items.some(function (x) { return x.ed; }), ad = g.items.some(function (x) { return x.add; }), stb = g.items.some(function (x) { return x.stab; }), mac = g.items.some(function (x) { return x.mac; });
        if (mac && !ed && !stb && !note) note = kind === 'semi' ? 'норма в комплекте — по макросу' : 'норма — по макросу';
        if (stb && !ed && !K._stn) { K._stn = 1; note = (note ? note + ' · ' : '') + (isStab4(startName) ? 'стойка стабилизатора: 02, 03, 04, 06 — по 2 шт, 01-корпус — 1 шт' : 'по ' + fmtQ(q) + ' шт на 1 полуфабрикат'); }
        var row = { d: depth, names: g.names, q: q, kind: kind, note: note, src: K.src, ok: K.src === 'SPEC' && !K.analog, unit: g.items[0].unit || '', parent: startName, prev: prevName || startName, ed: ed, add: ad, shares: g.items.length > 1 && !g.qn ? g.items.map(function (x) { return x.name + ' ' + fmtQ(x.q); }) : null };
        out.push(row);
        var withKids = (kind === 'det' || kind === 'semi') ? g.names.filter(function (n) { var kk = cleanSp(n).toUpperCase(); return !seen[kk] && bomKids(n); }) : [];
        withKids.forEach(function (n) {
          var kk = cleanSp(n).toUpperCase(); seen[kk] = 1;
          if (withKids.length > 1) out.push({ d: depth + 1, label: 'вариант ' + n });
          bomTree(prod, n, out, depth + (withKids.length > 1 ? 2 : 1), seen, n);
          delete seen[kk];
        });
      });
    }
    function bomRows(p) {
      var X = bomIndex();
      if (!X) return { err: '<div class="box note">В базе нет TDSheet/NEP — нажмите «Обновить базу».</div>' };
      var out = [], note = '', seen = {}, top = cleanSp(p.name);
      seen[top.toUpperCase()] = 1;
      if (bomKids(top)) bomTree(top, top, out, 1, seen, '');
      else {
        var blk = blockOf(p), semis = blk ? blk.rows.filter(function (r) { return r.cls === 'Y'; }).map(function (r) { return cleanSp(r.v[3]); }) : [];
        if (!semis.length) return { err: '<div class="box note">Состава нет ни в TDSheet, ни в NEP' + (/^Рычаг/i.test(top) ? ' — готовый товар' : '') + '.</div>' };
        note = 'Товара нет в TDSheet — структура показана с полуфабриката' + (blk && blk.brand === 'RS' ? ' (RS — только коробка бренда RS, упаковка не показана)' : '') + '.';
        var pk = (top.match(/\([^)]*\)/) || [''])[0].toUpperCase(), bc = (blk && blk.alias ? blk.alias : baseProductCode(top)).toUpperCase(), sib = '';
        if (pk && bc) Object.keys(X.hdr).some(function (k) { if (k.indexOf(bc + ' ') === 0 && k.indexOf(pk) > 0 && k !== top.toUpperCase()) { sib = k; return true; } return false; });
        semis.forEach(function (sn) {
          var q = null, nt = '';
          if (sib) bomKids(sib).kids.forEach(function (x) { if (cleanSp(x.name).toUpperCase() === sn.toUpperCase() && x.q !== null) q = x.q; });
          if (q === null) q = 1;
          var ov = (OV.bom || {})[bomKey('semi', top, sn)]; if (ov > 0) q = ov;
          out.push({ d: 1, names: [sn], q: q, kind: 'semi', note: nt, src: '', parent: top, prev: top, ed: ov > 0 }); seen[sn.toUpperCase()] = 1; bomTree(top, sn, out, 2, seen, sn);
        });
        var ap = 'A|' + top.toUpperCase() + '|';
        Object.keys(OV.bom || {}).forEach(function (k) { var a = OV.bom[k]; if (k.indexOf(ap) === 0 && a) out.push({ d: 1, names: [a.name], q: a.qty, kind: bomKind(a.name), note: '', src: '', unit: a.unit || '', parent: top, prev: top, add: true }); });
      }
      return { rows: out, note: note, top: top };
    }
    function bomTable(p) {
      var B = bomRows(p); if (B.err) return B.err;
      var out = B.rows, note = B.note, top = B.top;
      var h = (note ? '<p class="note">' + esc(note) + '</p>' : '');
      h += '<table class="mini bom"><tr><th>Состав</th><th class="n">Кол-во на 1 шт</th><th>Ед.</th><th>Тип</th></tr>';
      var kids = function (i) { var d0 = i < 0 ? 0 : out[i].d; return i + 1 < out.length && out[i + 1].d > d0; };
      h += '<tr class="b0" data-d="0"' + (out.length ? ' data-k="1"' : '') + '><td>' + (out.length ? '<span class="tg">▾</span>' : '') + '<b>' + esc(top) + '</b>' + (BOMEDIT && CAN_WRITE ? ' <button class="bomb" data-ba="' + esc(top) + '" title="Добавить в состав товара">＋</button>' : '') + '</td><td class="n"><b>1</b></td><td>шт</td><td>товар</td></tr>';
      out.forEach(function (r, i) {
        var pad = 'padding-left:' + (8 + r.d * 20) + 'px', hk = kids(i), tg = hk ? '<span class="tg">▸</span>' : '<span class="tg0"></span>';
        var attr = ' data-d="' + r.d + '"' + (hk ? ' data-k="1" data-kind="' + (r.kind || '') + '"' : '');
        if (r.label) { h += '<tr' + attr + '><td colspan="4" class="note" style="' + pad + ';font-style:italic">' + tg + esc(r.label) + ':</td></tr>'; return; }
        var unit = r.unit ? r.unit : r.kind === 'det' || r.kind === 'semi' || r.kind === 'buy' ? 'шт' : (r.kind === 'mat' || r.kind === 'grease' ? 'кг' : (/пл[её]нк|скотч/i.test(r.names[0]) ? '' : 'шт'));
        var ek = r.parent ? bomKey(r.kind, r.parent, r.names[0]) : '', ak = r.parent ? bomAddKey(r.parent, r.names[0]) : '', bE = BOMEDIT && CAN_WRITE && r.kind !== 'pack' && !!r.parent;
        h += '<tr' + attr + (r.ed || r.add ? ' class="bed"' : '') + '><td style="' + pad + '">' + tg + '<span class="bmark" style="background:' + BOM_BG[r.kind] + '"></span>' + r.names.map(esc).join(' <span class="note">или</span> ') + (r.add ? ' <span class="pill ed">добавлено</span>' : '') +
          (bE && (r.kind === 'semi' || r.kind === 'det') ? ' <button class="bomb" data-ba="' + esc(r.names[0]) + '" title="Добавить деталь или материал в состав">＋</button>' : '') +
          '</td>' +
          '<td class="n">' + (bE ? '<input class="bomq" type="number" step="any" min="0" value="' + (r.q === null ? '' : Math.round(r.q * 100000) / 100000) + '" data-ek="' + esc(r.add ? ak : ek) + '" data-add="' + (r.add ? 1 : '') + '" data-nm="' + esc(r.names[0]) + '">' + (r.ed || r.add ? ' <button class="bomb" data-nm="' + esc(r.names[0]) + '" data-br="' + esc(r.add ? ak : ek) + '" title="' + (r.add ? 'Убрать добавленную строку' : 'Вернуть как в книге') + '">↺</button>' : '') : fmtQ(r.q)) + (r.ok ? ' <span style="color:var(--ok);font-weight:700" title="проверенный состав">✓</span>' : '') + (r.ed ? ' <span class="pill ed" title="изменено вручную">изм.</span>' : '') + (r.note ? '<div class="note" style="font-family:inherit">' + esc(r.note) + '</div>' : '') + '</td><td>' + unit + '</td><td>' + BOM_KIND[r.kind] + '</td></tr>';
      });
      return h + '</table>';
    }
    function groupModal(g) {
      var byCode = g.indexOf('code:') === 0; if (byCode) g = g.slice(5);
      var list = OOR.positions.filter(function (p) { return byCode ? nameGroup(p.name) === g : p.group === g; });
      if (byCode) list.sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }); });
      bomModal((byCode ? 'Код ' : 'Группа ') + esc(g) + ' — структура на 1 шт', list, null, function () { groupModal((byCode ? 'code:' : '') + g); });
    }
    function posBomModal(pid, back) {
      var p = OOR.positions.filter(function (x) { return String(x.id) === String(pid); })[0]; if (!p) return;
      bomModal(esc(p.name) + ' — структура на 1 шт', [p], back, function () { posBomModal(pid, back); });
    }
    function bomLegend() { return '<p class="note">Цвет: <span class="bmark" style="background:' + BOM_BG.semi + '"></span>полуфабрикат <span class="bmark" style="background:' + BOM_BG.det + '"></span>деталь <span class="bmark" style="background:' + BOM_BG.mat + '"></span>материал <span class="bmark" style="background:' + BOM_BG.grease + '"></span>смазка <span class="bmark" style="background:' + BOM_BG.buy + '"></span>покупное <span class="bmark" style="background:' + BOM_BG.pack + '"></span>упаковка · «или» — взаимозаменяемые варианты · <span style="color:var(--ok);font-weight:700">✓</span> — проверенный состав · <span class="pill ed">изм.</span> — расход изменён вручную, учитывается в анализе.</p>'; }
    function bomModal(title, list, back, again) {
      var sc = ov.scrollTop;
      var h = head(title, 'Состав на одну штуку · TDSheet («Количество состав»), где нет — NEP');
      h += '<div class="fbar">' + (back ? '<button class="btn sm" id="bomBack">← Назад</button>' : '') + '<button class="btn sm" id="bomOpen">Развернуть всё</button><button class="btn sm" id="bomClose">Свернуть детали</button>' +
        (CAN_WRITE ? '<button class="btn sm' + (BOMEDIT ? ' pri' : '') + '" id="bomEd">' + (BOMEDIT ? '✓ Готово' : '✎ Изменить расход') + '</button>' : '') + '</div>';
      list.forEach(function (p) { h += '<div class="bomd">' + bomTable(p) + '</div>'; });
      openModal(h + bomLegend() + '</div>', true);
      bomBind(BOMEDIT);
      $('bomOpen').onclick = function () { bomBind(true); };
      $('bomClose').onclick = function () { bomBind(false); };
      if (back) $('bomBack').onclick = function () { BOMEDIT = false; back(); };
      if ($('bomEd')) $('bomEd').onclick = function () { BOMEDIT = !BOMEDIT; again(); };
      if (BOMEDIT) ov.scrollTop = sc;
      var lbl = function (el) { var t = el.closest('table.bom'), b0 = t ? t.querySelector('tr.b0 b') : null; return (b0 ? b0.textContent + ' · ' : '') + (el.dataset.nm || el.dataset.ba || ''); };
      modal.querySelectorAll('input.bomq').forEach(function (inp) {
        inp.onclick = function (e) { e.stopPropagation(); };
        inp.onchange = function () {
          var v = parseFloat(String(inp.value).replace(',', '.')), k = inp.dataset.ek;
          if (!(v > 0)) { showMsg('Нужно число больше 0.', 'err'); return; }
          if (inp.dataset.add ? OV.bom[k] && OV.bom[k].qty === v : OV.bom[k] === v) return;
          var val = inp.dataset.add ? Object.assign({}, OV.bom[k], { qty: v }) : v;
          bomSet(k, val, lbl(inp)).then(again);
        };
      });
      modal.querySelectorAll('button.bomb[data-br]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); bomSet(b.dataset.br, null, lbl(b)).then(again); }; });
      modal.querySelectorAll('button.bomb[data-ba]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); bomAddForm(b, again); }; });
    }
    var DLNAMES = null;
    function bomAddForm(btn, again) {
      var old = modal.querySelector('tr.bomadd'); if (old) old.remove();
      var parent = btn.dataset.ba, tr = btn.closest('tr'), f = document.createElement('tr');
      if (!DLNAMES) { DLNAMES = {}; (BASE.td2.rows || []).forEach(function (r) { if (cleanSp(r[0])) DLNAMES[cleanSp(r[0])] = 1; }); var S = BASE.struct && BASE.struct.raw; if (S) S.td.concat(S.nep).forEach(function (r) { if (cleanSp(r[1])) DLNAMES[cleanSp(r[1])] = 1; }); }
      f.className = 'bomadd';
      f.innerHTML = '<td colspan="4"><div class="cmf" style="grid-template-columns:2fr 1fr 1fr auto auto;align-items:end"><label>Добавить в «' + esc(parent) + '»<input id="baN" list="baL" placeholder="Деталь или материал — как в TDSheet2"></label><label>Кол-во на 1 шт<input id="baQ" type="number" step="any" min="0" value="1"></label><label>Ед.<select id="baU"><option value="">шт</option><option value="кг">кг</option></select></label><button class="btn sm pri" id="baOk">Добавить</button><button class="btn sm" id="baNo">Отмена</button></div><datalist id="baL">' + Object.keys(DLNAMES).sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></td>';
      tr.parentNode.insertBefore(f, tr.nextSibling);
      f.onclick = function (e) { e.stopPropagation(); };
      $('baN').focus();
      $('baN').oninput = function () { $('baU').value = isRawName($('baN').value.trim()) || /^(прут|лист|труба|бесшов|холодно|горяч|термопл|резин|полиур|смазк|солидол|литол)/i.test($('baN').value.trim()) ? 'кг' : ''; };
      $('baNo').onclick = function () { f.remove(); };
      $('baOk').onclick = function () {
        var n = cleanSp($('baN').value), q = parseFloat(String($('baQ').value).replace(',', '.'));
        if (!n) { showMsg('Укажите название.', 'err'); return; }
        if (!(q > 0)) { showMsg('Кол-во должно быть больше 0.', 'err'); return; }
        bomSet(bomAddKey(parent, n), { parent: parent, name: n, qty: q, unit: $('baU').value }, parent + ' · ' + n).then(again);
      };
    }
    function bomSet(key, val, label) {
      var from = OV.bom[key], ts = Date.now(), id = 'b' + hash(key);
      if (val === null) { delete OV.bom[key]; delete OVMETA[id]; } else { OV.bom[key] = val; OVMETA[id] = { ts: ts, by: ME }; }
      var fv = function (v) { return v && typeof v === 'object' ? v.name + ' — ' + fmtQ(v.qty) + ' ' + (v.unit || 'шт') : (v === undefined || v === null ? 'как в книге' : fmtQ(v)); };
      var hst = { ts: ts, by: ME, kind: 'bom', text: label + ': ' + fv(from) + ' → ' + (val === null && from && typeof from === 'object' ? 'строка убрана' : fv(val)) };
      HIST.unshift(hst);
      BOMX = null; recalc();
      return persistEdit(id, 'bom', key, val, { name: label }, null, ts).then(function () { return persistHist(hst); });
    }
    function bomTouched(p) {
      var a = 'A|' + cleanSp(p.name).toUpperCase() + '|', sk = 'S|' + kitNormKey(p.name) + '|', nk = 'N|' + kitNormKey(p.name) + '|';
      return Object.keys(OV.bom || {}).some(function (k) { return k.indexOf(a) === 0 || k.indexOf(sk) === 0 || k.indexOf(nk) === 0; });
    }
    /* сворачивание: товар и полуфабрикат раскрыты, у деталей под-детали скрыты (по нажатию — показать) */
    function bomBind(all) {
      modal.querySelectorAll('table.bom').forEach(function (t) {
        var rows = Array.prototype.slice.call(t.querySelectorAll('tr[data-d]'));
        var stack = [];
        rows.forEach(function (tr) {
          var d = +tr.dataset.d; while (stack.length && +stack[stack.length - 1].dataset.d >= d) stack.pop();
          var par = stack[stack.length - 1], main = !par || par.dataset.d === '0' || par.dataset.kind === 'semi';
          if (tr.dataset.k) tr.dataset.c = (!all && tr.dataset.d !== '0' && tr.dataset.kind !== 'semi' && main) ? '1' : '';
          stack.push(tr);
        });
        var refresh = function () {
          var hideBelow = Infinity;
          rows.forEach(function (tr) {
            var d = +tr.dataset.d;
            if (d <= hideBelow) hideBelow = Infinity;
            tr.style.display = d > hideBelow ? 'none' : '';
            if (tr.style.display === '' && tr.dataset.k) { var g = tr.querySelector('.tg'); if (g) g.textContent = tr.dataset.c ? '▸' : '▾'; if (tr.dataset.c && d < hideBelow) hideBelow = d; }
          });
        };
        rows.forEach(function (tr) { if (tr.dataset.k) tr.onclick = function () { tr.dataset.c = tr.dataset.c ? '' : '1'; refresh(); }; });
        refresh();
      });
    }

    /* ================= минимальный остаток склада ================= */
    var STOCKPLAN = null, COVER_M = +lsGet('coverM', 1) || 1;
    function ruToDate(s) { var n = dateNum(s); return n ? new Date(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100) : null; }
    function orderSpanMonths() {
      var mn = null, mx = null;
      OOR.orders.forEach(function (o) { var a = ruToDate(o.created), b = ruToDate(o.due) || a; if (a && (!mn || a < mn)) mn = a; if (b && (!mx || b > mx)) mx = b; });
      if (!mn || !mx || mx <= mn) return 1;
      return Math.max(1, (mx - mn) / 86400000 / 30.4);
    }
    /* расход по заказам OOR: заказ товара × состав на 1 шт (TDSheet → проверенный состав → NEP), по всем уровням */
    function bomReqAll() {
      var REQ = {}, KC = {};
      var kidsC = function (n) { var k = cleanSp(n).toUpperCase(); if (!(k in KC)) KC[k] = bomKids(n); return KC[k]; };
      var add = function (n, v) { var k = cleanSp(n).toUpperCase(); REQ[k] = (REQ[k] || 0) + v; };
      var walk = function (prod, name, mult, depth, seen) {
        var K = kidsC(name); if (!K || depth > 14) return;
        K.kids.forEach(function (x) {
          var kind = bomKind(x.name), q = x.q;
          if (q === null) { if (kind === 'mat' || kind === 'grease') { var kp = ENGINE ? ENGINE.kgPerPc(prod, name, x.name) : null; q = kp && kp.v > 0 ? kp.v : 0; } else q = 1; }
          var m = mult * q; if (!(m > 0)) return;
          add(x.name, m);
          var kk = cleanSp(x.name).toUpperCase();
          if ((kind === 'det' || kind === 'semi') && !seen[kk]) { seen[kk] = 1; walk(prod, x.name, m, depth + 1, seen); delete seen[kk]; }
        });
      };
      OOR.positions.forEach(function (p) {
        var Q = R[p.id] ? R[p.id].tq : 0; if (!(Q > 0)) return;
        add(p.name, Q);
        var seen = {}; seen[p.key] = 1;
        if (kidsC(p.name)) walk(p.name, p.name, Q, 1, seen);
        else { var blk = blockOf(p); if (blk) blk.rows.forEach(function (r) { if (r.cls === 'Y') { var sn = cleanSp(r.v[3]); add(sn, Q); seen[sn.toUpperCase()] = 1; walk(p.name, sn, Q, 2, seen); } }); }
      });
      return REQ;
    }
    function stockPlan() {
      if (STOCKPLAN) return STOCKPLAN;
      var REQ = {}; try { REQ = bomReqAll(); } catch (e) { console.error(e); }
      var months = orderSpanMonths(), items = {}, list = [];
      TD2.rows.forEach(function (x) {
        var ex = EXCL_WH.indexOf(String(x[3]).toUpperCase()) >= 0, k = x[0].toUpperCase(), it = items[k];
        if (!it) { it = items[k] = { name: x[0], key: k, stock: 0, minX: 0, wh: [], has: false, ex: true }; list.push(it); }
        if (!ex) { it.ex = false; if (x[1] !== null) { it.stock += x[1]; it.has = true; } if (x[2] > it.minX) it.minX = x[2]; }
        if (!ex) it.wh.push(x[3] + ': ' + (x[1] === null ? '—' : fmt(x[1])));
      });
      var S = { list: list, items: items, months: months, red: 0, yellow: 0, ok: 0, none: 0 };
      list.forEach(function (it) {
        if (/НЕКОНДИЦ|ОТХОД|\bБРАК/i.test(it.name)) it.ex = true;
        it.orig = it.stock;
        if (OV.stock && (it.key in OV.stock)) { it.stock = OV.stock[it.key]; it.ed = true; } else it.ed = OV.td2 && (it.key in OV.td2);
        if (it.ed && OV.td2 && (it.key in OV.td2)) it.orig = td2Orig(it.key);
        it.req = REQ[it.key] || 0; it.rate = it.req / months;
        var mc = it.rate * COVER_M, kgU = mc > 0 && /^(mat|grease)$/.test(bomKind(it.name)); it.minC = mc <= 0 ? 0 : (kgU && mc < 10 ? Math.ceil(mc * 100) / 100 : Math.ceil(mc));
        it.min = it.minX > 0 ? it.minX : it.minC; it.minSrc = it.minX > 0 ? 'Excel' : (it.minC > 0 ? 'расчёт' : '');
        it.st = it.ex ? 'none' : (!it.min ? 'none' : (it.stock <= 0 || it.stock < it.min * 0.25 ? 'red' : (it.stock < it.min ? 'yellow' : 'ok')));
        S[it.st]++;
      });
      STOCKPLAN = S; return S;
    }
    function td2Orig(key) { var s = 0, any = false; BASE.td2.rows.forEach(function (x) { if (x[0].toUpperCase() === key && EXCL_WH.indexOf(String(x[3]).toUpperCase()) < 0 && x[1] !== null) { s += x[1]; any = true; } }); return any ? s : 0; }
    function setTd2Edit(key, name, raw) {
      var s0 = String(raw).trim().replace(/\s+/g, '').replace(',', '.'), orig = td2Orig(key), from = (key in OV.td2) ? OV.td2[key] : orig, val, del;
      if (s0 === '') { val = orig; del = true; } else { val = parseFloat(s0); if (!isFinite(val)) return Promise.reject(new Error('нужно число')); del = Math.abs(val - orig) < 1e-9; }
      if (val === from && del === !(key in OV.td2)) return Promise.resolve();
      var id = 'e' + hash('td2|' + key), ts = Date.now();
      if (del) { delete OV.td2[key]; delete OVMETA[id]; } else { OV.td2[key] = val; OVMETA[id] = { ts: ts, by: ME }; }
      var hst = { ts: ts, by: ME, kind: 'edit', t: 'td2', k: key, field: 'Склад TDSheet2', pos: name, ord: '', from: from, to: val };
      HIST.unshift(hst);
      return persistEdit(id, 'td2', key, del ? null : val, { name: name }, null, ts).then(function () { return persistHist(hst); });
    }

    /* ================= комментарии к ячейке (заказ × позиция) ================= */
    var CM_ST = { '': 'без статуса', process: 'в процессе', transit: 'в пути', customs: 'на растаможке', arrived: 'прибыл' };
    var CM_COL = { '': '#5d6b7c', process: '#7b5cc4', transit: '#2a6fb0', customs: '#e8890c', arrived: '#1f9a5b' };
    function cmKey(p, o) { return ovKey(p, o); }
    function cmOf(p, o) { return (OV.cm && OV.cm[cmKey(p, o)]) || []; }
    function cmCount() { var n = 0; Object.keys(OV.cm || {}).forEach(function (k) { n += (OV.cm[k] || []).length; }); return n; }
    function cmChip(st) { return '<span class="cmchip" style="background:' + CM_COL[st || ''] + '">' + esc(CM_ST[st || '']) + '</span>'; }
    function cmSave(p, o, list, text) {
      var k = cmKey(p, o), ts = Date.now();
      if (list.length) OV.cm[k] = list; else delete OV.cm[k];
      var hst = { ts: ts, by: ME, kind: 'comment', text: text }; HIST.unshift(hst);
      return persistEdit('c' + hash(k), 'cm', k, list.length ? list : null, p, o, ts).then(function () { return persistHist(hst); });
    }
    function cmQty(c, p) { var k = cmKgTxt(c, p); return c.qty > 0 || k ? '<span class="cmq">' + (c.qty > 0 ? fmt(c.qty) + ' шт' : '') + (k ? ' <small>(' + k + ')</small>' : '') + '</span>' : ''; }
    /* материал в кг: «(X кг · Y кг/шт)» */
    function cmKgu(c, p) { if (c.kgu > 0) return c.kgu; if (p && (c.mat || c.mkg > 0) && (c.mat || c.det)) return unitKgFor(p, c.mat || c.det) || 0; return 0; }
    function fmtKg(v) { return fmtQ(Math.round(v * 1000) / 1000); }
    function cmKgTxt(c, p) { if (!(c.mkg > 0)) return ''; var u = cmKgu(c, p); return fmtKg(c.mkg) + ' кг' + (u > 0 ? ' · ' + fmtQ(u) + ' кг/шт' : ''); }
    function cmDesc(c) { return (c.st ? CM_ST[c.st] + '. ' : '') + (c.qty > 0 ? fmt(c.qty) + ' шт. ' : '') + (c.mkg > 0 ? '(' + cmKgTxt(c) + ') ' : '') + (c.det ? 'деталь ' + c.det + '. ' : '') + (c.text || '') + (c.inv ? ' · инвойс ' + c.inv : '') + (c.cont ? ' · контейнер ' + c.cont : '') + (c.ship ? ' · отгрузка ' + ruDate(c.ship) : ''); }
    /* детали, под-детали и материалы позиции — подсказки для поля «Деталь» */
    function cmDetNames(pairs) {
      var seen = {}, out = [], ps = {};
      var add = function (n, k) { n = cleanSp(n); if (!n || n.length < 3 || /^\(|^справочник|^#|шт ✔/i.test(n) || seen[n.toUpperCase()]) return; seen[n.toUpperCase()] = 1; out.push([n, k]); };
      (pairs || []).forEach(function (x) { ps[x[0].id] = x[0]; });
      Object.keys(ps).slice(0, 25).forEach(function (id) {
        var p = ps[id];
        try { var res = cellTree(p); if (res) res.items.forEach(function (x) { if (x.nm && x.nm !== p.name) add(x.nm, x.kgpc ? 'материал' : bomKind(x.nm) === 'semi' ? 'полуфабрикат' : 'деталь'); }); } catch (e) { }
        try { var blk = blockOf(p); if (blk) blk.rows.forEach(function (r) { for (var i = 3; i < r.v.length; i += 2) { var v = r.v[i]; if (typeof v === 'string' && /[A-Za-zА-Яа-я]/.test(v)) add(v, BOM_KIND[bomKind(v)] || ''); } }); } catch (e) { }
      });
      return out;
    }
    function cmDetList(names, sfx) { return '<datalist id="cmEL' + sfx + '">' + (names || []).map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[1] ? ' label="' + esc(x[1]) + '"' : '') + '>'; }).join('') + '</datalist>'; }
    /* ранее введённые инвойсы и контейнеры — подсказки (последние сверху); выбор инвойса дописывает его контейнер, статус и дату отгрузки */
    function cmKnown() {
      var I = {}, C = {};
      Object.keys(OV.cm || {}).forEach(function (k) {
        (OV.cm[k] || []).forEach(function (c) {
          var t = c.ets || c.ts || 0;
          if (c.inv) { var a = I[c.inv] || (I[c.inv] = { t: 0, n: 0, cont: {}, st: '', ship: '', invd: '' }); a.n++; if (c.invd && c.invd > a.invd) a.invd = c.invd; if (t >= a.t) { a.t = t; a.st = c.st || a.st; a.ship = c.ship || a.ship; } if (c.cont) a.cont[c.cont] = Math.max(a.cont[c.cont] || 0, t); }
          if (c.cont) { var b = C[c.cont] || (C[c.cont] = { t: 0, n: 0, inv: '' }); b.n++; if (t >= b.t) { b.t = t; b.inv = c.inv || b.inv; } }
        });
      });
      return { I: I, C: C };
    }
    function cmKnownList(M, id, lbl) {
      return '<datalist id="' + id + '">' + Object.keys(M).sort(function (a, b) { return M[b].t - M[a].t; }).slice(0, 300).map(function (k) { return '<option value="' + esc(k) + '" label="' + esc(lbl(M[k])) + '">'; }).join('') + '</datalist>';
    }
    function cmClean(c) { if (!(c.mkg > 0)) { delete c.mkg; delete c.kgu; } ['_u', '_kg', '_k'].forEach(function (k) { delete c[k]; }); return c; }
    /* кг материала → шт позиции: кг на 1 шт берётся из структуры (материал в поле «Деталь»), можно указать вручную */
    function cmKgApply(c, p) {
      var u = c._u, kg = c._kg, k0 = c._k; delete c._u; delete c._kg; delete c._k;
      if (u !== 'kg') { if (!(c.mkg > 0)) { delete c.mkg; delete c.kgu; } return c; }
      var ku = k0 > 0 ? k0 : (p ? unitKgFor(p, c.det) : 0);
      c.mkg = kg > 0 ? Math.round(kg * 1e6) / 1e6 : 0; c.kgu = ku > 0 ? ku : 0; if (c.det) c.mat = c.det;
      c.qty = c.mkg > 0 && ku > 0 ? Math.floor(c.mkg / ku + 1e-4) : 0;
      return c;
    }
    function cmKgBind(sfx, getPs) {
      var U = $('cmU' + sfx), Q = $('cmQ' + sfx), KK = $('cmK' + sfx), N = $('cmKN' + sfx), E = $('cmE' + sfx); if (!U || !Q) return;
      var upd = function () {
        var kg = U.value === 'kg', q = parseFloat(String(Q.value).replace(',', '.')) || 0, man = parseFloat(String(KK.value).replace(',', '.')) || 0, det = E ? cleanSp(E.value) : '', ps = (getPs && getPs()) || [];
        $('cmKW' + sfx).hidden = !kg;
        var ks = []; ps.forEach(function (p) { var k = man > 0 ? man : unitKgFor(p, det); if (k > 0) ks.push([p, k]); });
        if (!kg) { N.innerHTML = ks.length === 1 && q > 0 && det ? '≈ ' + fmtQ(q * ks[0][1]) + ' кг (' + fmtQ(ks[0][1]) + ' кг/шт)' : ''; return; }
        if (!ks.length) { N.innerHTML = '<span style="color:var(--bad)">' + (det ? 'кг на 1 шт для «' + esc(det) + '» не найден — укажите вручную' : 'укажите материал в поле «Деталь / материал» или кг на 1 шт') + '</span>'; return; }
        var mn = Math.min.apply(null, ks.map(function (x) { return x[1]; })), mx = Math.max.apply(null, ks.map(function (x) { return x[1]; }));
        if (!KK.value || KK.dataset.auto) { if (ks.length === 1 || mn === mx) { KK.placeholder = fmtQ(mn).replace(/\s/g, ''); } else KK.placeholder = 'по позициям'; }
        N.innerHTML = q > 0 ? (ks.length === 1 || mn === mx ? '= <b>' + fmt(Math.floor(q / mn + 1e-4)) + ' шт</b> (' + fmtQ(q) + ' кг · ' + fmtQ(mn) + ' кг/шт)' : '= <b>' + fmt(Math.floor(q / mx + 1e-4)) + '–' + fmt(Math.floor(q / mn + 1e-4)) + ' шт</b> по позициям (' + fmtQ(mn) + '–' + fmtQ(mx) + ' кг/шт)') : (mn === mx ? fmtQ(mn) + ' кг/шт' : fmtQ(mn) + '–' + fmtQ(mx) + ' кг/шт');
      };
      [U, Q, KK].concat(E ? [E] : []).forEach(function (f) { f.addEventListener('input', upd); f.addEventListener('change', upd); });
      upd(); return upd;
    }
    function cmFieldsBind(sfx, getPs) {
      cmKgBind(sfx, getPs);
      var K = cmKnown(), iI = $('cmI' + sfx), iC = $('cmC' + sfx); if (!iI || !iC) return;
      var fill = function () {
        var a = K.I[cleanSp(iI.value)]; if (!a) return;
        var cs = Object.keys(a.cont).sort(function (x, y) { return a.cont[y] - a.cont[x]; });
        if (!cleanSp(iC.value) && cs.length) iC.value = cs[0];
        if ($('cmD' + sfx) && !$('cmD' + sfx).value && a.ship) $('cmD' + sfx).value = a.ship;
        if ($('cmS' + sfx) && !$('cmS' + sfx).value && a.st) $('cmS' + sfx).value = a.st;
      };
      iI.addEventListener('change', fill); iI.addEventListener('input', function () { if (K.I[cleanSp(iI.value)]) fill(); });
      iC.addEventListener('change', function () { var b = K.C[cleanSp(iC.value)]; if (b && b.inv && !cleanSp(iI.value)) { iI.value = b.inv; fill(); } });
    }
    function cmFields(c, sfx, names) {
      var K = cmKnown();
      c = c || {};
      return '<div class="cmf"><label>Статус<select id="cmS' + sfx + '">' + Object.keys(CM_ST).map(function (k) { return '<option value="' + k + '"' + ((c.st || '') === k ? ' selected' : '') + '>' + CM_ST[k] + '</option>'; }).join('') + '</select></label>' +
        '<label>Количество<span class="cmqu"><input id="cmQ' + sfx + '" type="number" min="0" step="any" value="' + (c.mkg > 0 ? c.mkg : (c.qty > 0 ? c.qty : '')) + '" placeholder="0"><select id="cmU' + sfx + '" title="Единица: шт или кг материала"><option value="pc">шт</option><option value="kg"' + (c.mkg > 0 ? ' selected' : '') + '>кг</option></select></span>' +
        '<span class="cmkw" id="cmKW' + sfx + '"' + (c.mkg > 0 ? '' : ' hidden') + '><input id="cmK' + sfx + '" type="number" min="0" step="any" value="' + (c.kgu > 0 ? c.kgu : '') + '" placeholder="авто"> кг на 1 шт</span><small class="cmkn" id="cmKN' + sfx + '"></small></label>' +
        '<label>Инвойс №<input id="cmI' + sfx + '" list="cmIL' + sfx + '" autocomplete="off" placeholder="выберите или введите" value="' + esc(c.inv || '') + '">' + cmKnownList(K.I, 'cmIL' + sfx, function (a) { return Object.keys(a.cont).join(', ') + (a.n > 1 ? ' · ' + a.n + ' коммент.' : ''); }) + '</label><label>Контейнер №<input id="cmC' + sfx + '" list="cmCL' + sfx + '" autocomplete="off" placeholder="выберите или введите" value="' + esc(c.cont || '') + '">' + cmKnownList(K.C, 'cmCL' + sfx, function (b) { return b.inv ? 'инв. ' + b.inv : ''; }) + '</label>' +
        '<label>Дата отгрузки<input id="cmD' + sfx + '" type="date" value="' + esc(c.ship || '') + '"></label>' +
        '<label class="wide2">Деталь / под-деталь / материал<input id="cmE' + sfx + '" list="cmEL' + sfx + '" autocomplete="off" value="' + esc(c.det || '') + '" placeholder="начните вводить — подсказки из состава позиции">' + cmDetList(names, sfx) + '</label>' +
        '<label class="wide">Комментарий<textarea id="cmT' + sfx + '" rows="2" placeholder="например: детали в пути, будут через неделю">' + esc(c.text || '') + '</textarea></label></div>';
    }
    function cmRead(sfx) { var q = parseFloat(String($('cmQ' + sfx).value).replace(/\s+/g, '').replace(',', '.')), kg = $('cmU' + sfx) && $('cmU' + sfx).value === 'kg', ku = kg ? parseFloat(String($('cmK' + sfx).value).replace(',', '.')) : 0; return { _u: kg ? 'kg' : 'pc', _kg: kg && q > 0 ? q : 0, _k: ku > 0 ? ku : 0, mkg: 0, kgu: 0, st: $('cmS' + sfx).value, qty: !kg && q > 0 ? q : 0, inv: cleanSp($('cmI' + sfx).value), cont: cleanSp($('cmC' + sfx).value), ship: $('cmD' + sfx) ? $('cmD' + sfx).value : '', det: $('cmE' + sfx) ? cleanSp($('cmE' + sfx).value) : '', text: String($('cmT' + sfx).value || '').trim() }; }
    function cmBox(p, o) {
      var L = cmOf(p, o), h = '<details class="sec s-cm" open><summary class="sec-h"><span class="ic">💬</span>Комментарии<span class="cnt">' + L.length + '</span><span class="sp"></span><span class="tw">▾</span></summary><div class="sec-b">';
      L.forEach(function (c, i) {
        h += '<div class="cmi" id="cmi' + i + '" style="border-left-color:' + CM_COL[c.st || ''] + '"><div class="cmh">' + cmChip(c.st) + cmQty(c) + (c.inv ? '<span class="cmk">инвойс ' + invLink(c.inv) + '</span>' : '') + (c.cont ? '<span class="cmk">контейнер <b>' + esc(c.cont) + '</b></span>' : '') + (c.ship ? '<span class="cmk">отгрузка <b>' + esc(ruDate(c.ship)) + '</b></span>' : '') +
          '<span class="sp"></span><span class="note">' + esc(nowStr(c.ts)) + ' · ' + esc(whoName(c.by)) + (c.ets ? ' · изменён ' + esc(nowStr(c.ets)) : '') + '</span>' +
          (CAN_WRITE ? '<button class="btn sm cmed" data-i="' + i + '" title="Изменить">✎ Изменить</button><button class="btn sm cmdel" data-i="' + i + '" title="Удалить">✕</button>' : '') + '</div>' + (c.text ? '<div class="cmt">' + esc(c.text) + '</div>' : '') + '</div>';
      });
      if (CAN_WRITE) h += '<button class="btn cmaddb" id="cmAdd">＋ Добавить комментарий</button>';
      return h + '</div></details>';
    }
    function cmBind(p, o) {
      if (!$('cmAdd')) return;
      var again = function () { render(); cellModal(p.id, o.id); };
      $('cmAdd').onclick = function () { cmForm([[p, o]], { back: function () { cellModal(p.id, o.id); } }); };
      modal.querySelectorAll('.cmed').forEach(function (b) {
        b.onclick = function () {
          var i = +b.dataset.i, c = cmOf(p, o)[i], box = $('cmi' + i); if (!c || !box) return;
          box.classList.add('edit');
          box.innerHTML = '<div class="cmnew-h">Изменить комментарий</div>' + cmFields(c, 'e', cmDetNames([[p, o]])) + '<div class="row" style="display:flex;gap:8px"><button class="btn primary" id="cmSv">Сохранить</button><button class="btn" id="cmCn">Отмена</button></div>';
          cmFieldsBind('e', function () { return [p]; }); $('cmTe').focus();
          $('cmCn').onclick = again;
          $('cmSv').onclick = function () {
            var n = cmKgApply(cmRead('e'), p), L = cmOf(p, o).slice(), old = L[i];
            L[i] = cmClean(Object.assign({}, old, n, { ets: Date.now(), eby: ME || '' }));
            cmSave(p, o, L, 'Изменён комментарий: ' + o.label + ' · ' + p.name + ' — было: ' + cmDesc(old) + ' → стало: ' + cmDesc(L[i])); again();
          };
        };
      });
      modal.querySelectorAll('.cmdel').forEach(function (b) {
        b.onclick = function () {
          if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'удалить?'; return; }
          var L = cmOf(p, o).slice(), d = L.splice(+b.dataset.i, 1)[0];
          cmSave(p, o, L, 'Удалён комментарий: ' + o.label + ' · ' + p.name + (d ? ' — ' + cmDesc(d) : '')); again();
        };
      });
    }
    /* ================= Инвойсы: список из комментариев, общий статус инвойса ================= */
    function invIndex() {
      var M = {};
      OOR.positions.forEach(function (p) {
        QUEUE.forEach(function (o) {
          if (!R[p.id].cells[o.id]) return;
          cmOf(p, o).forEach(function (c, i) {
            var k = cleanSp(c.inv); if (!k) return;
            var e = M[k] || (M[k] = { inv: k, items: [], st: {}, qty: 0, cont: {}, ship: {}, t: 0, ps: {}, os: {}, invd: {} });
            e.items.push({ p: p, o: o, i: i, c: c }); if (c.invd) e.invd[c.invd] = 1; e.st[c.st || ''] = (e.st[c.st || ''] || 0) + 1; e.qty += c.qty > 0 ? c.qty : 0;
            if (c.cont) e.cont[c.cont] = 1; if (c.ship) e.ship[c.ship] = 1; e.t = Math.max(e.t, c.ets || c.ts || 0); e.ps[p.id] = 1; e.os[o.id] = 1;
          });
        });
      });
      Object.keys(OV.invp || {}).forEach(function (id) {
        var L = OV.invp[id]; if (!L || !L.inv) return; var k = cleanSp(L.inv);
        var e = M[k] || (M[k] = { inv: k, items: [], st: {}, qty: 0, cont: {}, ship: {}, t: 0, ps: {}, os: {}, invd: {} });
        (e.pend = e.pend || []).push({ id: id, L: L }); if (L.invd) e.invd[L.invd] = 1; e.st[L.st || ''] = (e.st[L.st || ''] || 0) + 1; if (L.cont) e.cont[L.cont] = 1; if (L.ship) e.ship[L.ship] = 1; e.t = Math.max(e.t, L.ts || 0);
      });
      return invQtyFix(M);
    }
    function invQtyFix(M) { Object.keys(M).forEach(function (k) { var e = M[k]; if (!e.items.length) return; e.lines = invLines(e.items); e.qty = e.lines.reduce(function (s0, g) { return s0 + (g.q || 0); }, 0); }); return M; }
    function invDate(e) { return Object.keys(e.invd || {}).sort().pop() || ''; }
    function invSetDate(inv, d) {
      var e = invIndex()[inv]; if (!e || !CAN_WRITE) return Promise.resolve(0);
      var pj = (e.pend || []).filter(function (x) { return (x.L.invd || '') !== d; }).map(function (x) { return invpSet(x.id, Object.assign({}, x.L, { invd: d }), 'дата инвойса'); });
      var by = {}; e.items.forEach(function (x) { by[cmKey(x.p, x.o)] = [x.p, x.o]; });
      var pairs = Object.keys(by).map(function (k) { return by[k]; }), ts = Date.now(), n = 0;
      if (!pairs.length) return Promise.all(pj).then(function () { render(); return pj.length; });
      return cmSaveMany(pairs, function (L) { return L.map(function (c) { if (cleanSp(c.inv) !== inv || (c.invd || '') === d) return c; n++; var nc = Object.assign({}, c, { ets: ts, eby: ME || '' }); if (d) nc.invd = d; else delete nc.invd; return nc; }); }, 'Инвойс ' + inv + ': дата инвойса → ' + (d ? ruDate(d) : 'нет')).then(function () { return Promise.all(pj); }).then(function () { render(); return n; });
    }
    /* контейнер инвойса: один контейнер (или не было) — всем строкам; разные — только строкам без контейнера */
    function invSetCont(inv, v) {
      var e = invIndex()[inv]; if (!e || !CAN_WRITE) return Promise.resolve(0);
      var all = Object.keys(e.cont).length <= 1, ok = function (c) { return all ? (c.cont || '') !== v : !c.cont; };
      var pj = (e.pend || []).filter(function (x) { return ok(x.L); }).map(function (x) { return invpSet(x.id, Object.assign({}, x.L, { cont: v }), 'контейнер инвойса'); });
      var by = {}; e.items.forEach(function (x) { by[cmKey(x.p, x.o)] = [x.p, x.o]; });
      var pairs = Object.keys(by).map(function (k) { return by[k]; }), ts = Date.now(), n = pj.length;
      if (!pairs.length) return Promise.all(pj).then(function () { render(); return n; });
      return cmSaveMany(pairs, function (L) { return L.map(function (c) { if (cleanSp(c.inv) !== inv || !ok(c)) return c; n++; return Object.assign({}, c, { cont: v, ets: ts, eby: ME || '' }); }); }, 'Инвойс ' + inv + ': контейнер → ' + v + (all ? '' : ' (строки без контейнера)')).then(function () { return Promise.all(pj); }).then(function () { render(); return n; });
    }
    /* поле даты: браузер шлёт «change» уже на каждой набранной цифре (11.11.0002) — сохраняем только при выходе из поля или Enter, и только реальную дату */
    function dateSafe(f) {
      if (!f || f.type !== 'date' || f._ds) return; f._ds = 1;
      var h = f.onchange; f.onchange = null; f.dataset.v = f.value;
      var go = function () { if (f.value && !/^(19|20)\d\d-/.test(f.value)) { f.value = f.dataset.v || ''; return; } if (f.value === (f.dataset.v || '')) return; f.dataset.v = f.value; if (h) h.call(f); };
      f.addEventListener('blur', go); f.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); f.blur(); } });
    }
    function invBindDate(again) {
      modal.querySelectorAll('input.invdate').forEach(function (f) {
        f.onclick = function (ev) { ev.stopPropagation(); };
        f.onchange = function () { var inv = f.dataset.inv, d = f.value; invSetDate(inv, d).then(function () { showMsg('Инвойс <b>' + esc(inv) + '</b>: дата инвойса ' + (d ? esc(ruDate(d)) : 'убрана') + '.', 'good'); again(); }); }; dateSafe(f);
      });
    }
    function invStatus(e) { var ks = Object.keys(e.st); return ks.length === 1 ? ks[0] : null; }
    function invCount() { return Object.keys(invIndex()).length; }
    function invStSelect(id, cur) {
      var c = cur !== null && CM_COL[cur] ? CM_COL[cur] : '';
      return '<select class="invst" data-inv="' + esc(id) + '"' + (c ? ' style="background-color:' + hexA(c, .2) + ';border-color:' + c + '"' : '') + '>' + (cur === null ? '<option value="*" selected>разные статусы</option>' : '') + Object.keys(CM_ST).map(function (k) { return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + esc(CM_ST[k]) + '</option>'; }).join('') + '</select>';
    }
    function invSetStatus(inv, st) {
      var M = invIndex(), e = M[inv]; if (!e || !CAN_WRITE) return Promise.resolve(0);
      var pj = (e.pend || []).filter(function (x) { return (x.L.st || '') !== st; }).map(function (x) { return invpSet(x.id, Object.assign({}, x.L, { st: st }), 'статус инвойса'); });
      if (!e.items.length) return Promise.all(pj).then(function () { render(); return pj.length; });
      var by = {}; e.items.forEach(function (x) { var k = cmKey(x.p, x.o); (by[k] = by[k] || { p: x.p, o: x.o }); });
      var pairs = Object.keys(by).map(function (k) { return [by[k].p, by[k].o]; }), ts = Date.now(), n = 0;
      return cmSaveMany(pairs, function (L) { return L.map(function (c) { if (cleanSp(c.inv) !== inv || (c.st || '') === st) return c; n++; return Object.assign({}, c, { st: st, ets: ts, eby: ME || '' }); }); },
        'Инвойс ' + inv + ': общий статус → ' + CM_ST[st] + ' (' + e.items.length + ' коммент., ' + pairs.length + ' ячеек)').then(function () { render(); return n; });
    }
    function invBindSt(again) {
      modal.querySelectorAll('select.invst').forEach(function (s) {
        s.onclick = function (ev) { ev.stopPropagation(); };
        s.onchange = function () {
          if (s.value === '*') return;
          var inv = s.dataset.inv, st = s.value;
          invSetStatus(inv, st).then(function (n) { showMsg('Инвойс <b>' + esc(inv) + '</b>: статус «' + esc(CM_ST[st]) + '» — изменено комментариев: ' + n + '.', 'good'); again(); });
        };
      });
    }
    /* переименовать инвойс во всех комментариях; такое имя уже есть — инвойсы объединяются */
    function invRename(old, nw) {
      nw = cleanSp(nw); var M = invIndex(), e = M[old];
      if (!e || !nw || nw === old || !CAN_WRITE) return Promise.resolve(null);
      var merge = !!M[nw], by = {}; e.items.forEach(function (x) { by[cmKey(x.p, x.o)] = [x.p, x.o]; });
      (e.pend || []).forEach(function (x) { invpSet(x.id, Object.assign({}, x.L, { inv: nw }), 'переименование инвойса'); });
      if (!e.items.length) return Promise.resolve(merge).then(function (m) { render(); return m; });
      var pairs = Object.keys(by).map(function (k) { return by[k]; }), ts = Date.now();
      return cmSaveMany(pairs, function (L) { return L.map(function (c) { return cleanSp(c.inv) === old ? Object.assign({}, c, { inv: nw, ets: ts, eby: ME || '' }) : c; }); },
        'Инвойс ' + old + ' переименован в ' + nw + (merge ? ' (объединён с существующим)' : '') + ' — ' + e.items.length + ' коммент.').then(function () { render(); return merge; });
    }
    function invRenameUi(holder, inv, after) {
      holder.innerHTML = '<input class="ivren-i" value="' + esc(inv) + '" list="ivRenL"><datalist id="ivRenL">' + Object.keys(invIndex()).filter(function (k) { return k !== inv; }).map(function (k) { return '<option value="' + esc(k) + '">'; }).join('') + '</datalist> <button class="btn sm pri ivren-ok">OK</button> <button class="btn sm ivren-no">Отмена</button>';
      var i = holder.querySelector('input'); i.focus(); i.select();
      holder.onclick = function (ev) { ev.stopPropagation(); };
      var go = function () { var nw = cleanSp(i.value); if (!nw || nw === inv) { after(inv); return; } invRename(inv, nw).then(function (merge) { showMsg('Инвойс <b>' + esc(inv) + '</b> → <b>' + esc(nw) + '</b>' + (merge ? ' — объединён с существующим инвойсом.' : ' — переименован.'), 'good'); after(nw); }); };
      holder.querySelector('.ivren-ok').onclick = go; holder.querySelector('.ivren-no').onclick = function () { after(inv); };
      i.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); go(); } if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); after(inv); } };
    }
    /* ================= Новый инвойс вручную: строки (позиция или корень, кол-во, статус, контейнер, деталь, отгрузка, текст)
       → комментарии во все затронутые ячейки: во все заказы / только не хватающие / не хватающие и производимые ================= */
    function invRowPositions(v) {
      v = cleanSp(v); if (!v) return [];
      var u = v.toUpperCase(), ex = OOR.positions.filter(function (p) { return cleanSp(p.name).toUpperCase() === u; });
      if (ex.length) return ex;
      var cd = u.replace(/\s+/g, ''), byRoot = OOR.positions.filter(function (p) { return nameGroup(p.name).replace(/\s+/g, '').toUpperCase() === cd; });
      if (byRoot.length) return byRoot;
      return invMatch(v);
    }
    /* ===== материалы в инвойсе: где используется материал и сколько кг на 1 шт позиции ===== */
    var MATU = null;
    function matNorm(s) { return cleanSp(s).toLowerCase().replace(/ё/g, 'е').replace(/[хx×*]/g, 'x').replace(/,/g, '.').replace(/(^|\s)d\s*=?\s*/g, ' ').replace(/\s+/g, ''); }
    function matUse() {
      if (MATU) return MATU;
      var M = {};
      OOR.positions.forEach(function (p) {
        var B = null; try { B = bomRows(p); } catch (e) { B = null; } if (!B || !B.rows) return;
        var mul = [1], acc = {};
        B.rows.forEach(function (r) {
          var base = mul[r.d - 1] != null ? mul[r.d - 1] : 1;
          if (r.label) { mul[r.d] = base; mul.length = r.d + 1; return; }
          var m = base * (r.q > 0 ? r.q : 0); mul[r.d] = m; mul.length = r.d + 1;
          if (r.kind !== 'mat') return;
          r.names.forEach(function (nm) { var kk = cleanSp(nm).toUpperCase(), a = acc[kk] || (acc[kk] = { name: cleanSp(nm), kg: 0, det: {} }); a.kg += m; if (r.parent) a.det[cleanSp(r.parent)] = 1; });
        });
        Object.keys(acc).forEach(function (k) { var e = M[k] || (M[k] = { name: acc[k].name, n: matNorm(acc[k].name), use: [] }); e.use.push({ p: p, kg: acc[k].kg, det: Object.keys(acc[k].det) }); });
      });
      MATU = M; return M;
    }
    function matKgFor(p, name) {
      name = cleanSp(name); if (!p || !name) return 0;
      var M = matUse(), e = M[name.toUpperCase()] || matFind(name); if (!e) return 0;
      var u = e.use.filter(function (x) { return x.p.id === p.id; })[0]; return u && u.kg > 0 ? u.kg : 0;
    }
    /* кг материала по ячейкам: сначала нехватка (кг мало — пропорционально ей), остаток — пропорционально заказанному кол-ву; внутри позиции — сначала ячейки с нехваткой по очереди */
    function matDist(prs, KG, kq) {
      var mq = prs.map(function () { return 0; }), mk = prs.map(function () { return 0; });
      if (!(kq > 0) || !prs.length) return { mq: mq, mk: mk };
      var GP = {}, pids = [], needP = {}, ordP = {}, sumN = 0, sumO = 0;
      prs.forEach(function (x, i) { var id = x[0].id, k1 = KG[id] || 0, sh = finalShort(x[0], x[1]), cq = (R[id].cells[x[1].id] || {}).q || 0; if (!(k1 > 0)) return; if (!GP[id]) { GP[id] = []; pids.push(id); needP[id] = 0; ordP[id] = 0; } GP[id].push(i); needP[id] += sh * k1; ordP[id] += cq * k1; sumN += sh * k1; sumO += cq * k1; });
      var shareKg = {};
      if (sumN > 0 && kq <= sumN) pids.forEach(function (id) { shareKg[id] = kq * needP[id] / sumN; });
      else { var rest = kq - sumN; pids.forEach(function (id) { shareKg[id] = needP[id] + (sumO > 0 ? rest * ordP[id] / sumO : rest / pids.length); }); }
      pids.forEach(function (id) {
        var k1 = KG[id], left = Math.floor(shareKg[id] / k1 + 1e-9), I = GP[id];
        I.forEach(function (i) { var sh = finalShort(prs[i][0], prs[i][1]); if (left > 0 && sh > 0) { var t = Math.min(sh, left); mq[i] += t; left -= t; } });
        if (left > 0) { var sq = 0; I.forEach(function (i) { sq += (R[id].cells[prs[i][1].id] || {}).q || 0; }); var l0 = left; I.forEach(function (i) { var t = sq > 0 ? Math.floor(l0 * ((R[id].cells[prs[i][1].id] || {}).q || 0) / sq) : 0; mq[i] += t; left -= t; }); if (left > 0) mq[I[0]] += left; }
        var tq = 0; I.forEach(function (i) { mk[i] = mq[i] * k1; tq += mq[i]; });
        var r = shareKg[id] - tq * k1; if (r > 0 && r < k1) mk[I[I.length - 1]] += r; /* остаток меньше 1 шт — в последнюю ячейку позиции, итог кг = введённому */
      });
      return { mq: mq, mk: mk };
    }
    /* «Справочник Втулки состав»: код семьи детали NR 1010-A1/02 M → NR1010-A1 (как в макросе, C → S); записи пользователя — OV.bom «W|код» */
    function bushKey(det) { var m = cleanSp(det).replace(/\s+/g, '').toUpperCase().match(/^(NR|CR)(\d+)-([SACP])(\d+)/); return m ? m[1] + m[2] + '-' + (m[3] === 'C' ? 'S' : m[3]) + m[4] : ''; }
    /* дополнения к справочнику из макроса — из файла «Справочник Втулки состав» пользователя (25.11.2026, лист «Лист3»): коды, которых нет в макросе;
       кг/шт = масса заготовки, если указана, иначе масса детали (как в макросе); P — пластик. Только для перевода кг ↔ шт, блок Обработки строится как в макросе. */
    var BUSH_ADD = { "NR1006-A1": ["Заказ алюминий", 0.128], "NR1010-A1": ["Заказ алюминий", 0.104], "NR1019-A1": ["Заказ алюминий", 0.395], "NR1019-A2": ["Заказ алюминий", 0.075], "NR1022-S4": ["Лист т=2", 0.101], "NR1023-P1": ["Пластик", 0.096], "NR1031-S1": ["Бесшовная труба-55x51,4", 0.121], "NR1031-S2": ["Бесшовная труба-22x12,3", 0.13], "NR1031-S3": ["Бесшовная труба-60x53,6", 0.204], "NR1035-A1": ["Заказ алюминий", 0.375], "NR1035-A2": ["Заказ алюминий", 0.062], "NR1035-A3": ["Заказ алюминий", 0.06], "NR1040-A1": ["Заказ алюминий", 0.68], "NR1040-A2": ["Заказ алюминий", 0.196], "NR1058-S26": ["Лист т=3", 0.099], "NR1061-A1": ["Заказ алюминий", 0.113], "NR1063-A1": ["Заказ алюминий", 0.067], "NR1063-A2": ["Заказ алюминий", 0.045], "NR1065-P1": ["Заказ пластик", 0.556], "NR1085-A1": ["Заказ алюминий", 0.03], "NR1086-A2": ["Заказ алюминий", 0.03], "NR1092-P1": ["Заказ пластик", 0.036], "NR1096-A1": ["Заказ алюминий", 0.072], "NR1096-A2": ["Заказ алюминий", 0.149], "NR1097-A1": ["Заказ алюминий", 0.072], "NR1097-A2": ["Заказ алюминий", 0.156], "NR1097-P1": ["Заказ пластик", 0.005], "NR1097-P2": ["Заказ пластик", 0.009], "NR1202-A1": ["Заказ алюминий", 0.067], "NR1204-A1": ["Заказ", 0.015] };
    function bushAll() { var B = Object.assign({}, EMBEDDED.kgdb.bush || {}); Object.keys(BUSH_ADD).forEach(function (k) { if (!B[k]) B[k] = BUSH_ADD[k]; }); return B; }
    function bushGet(key) { if (!key) return null; var u = (OV.bom || {})['W|' + key]; if (u && u.qty > 0) return { mat: u.mat || '', kg: u.qty, user: true }; var b = bushAll()[key]; return b && b[1] > 0 ? { mat: b[0] || '', kg: b[1] } : null; }
    function unitKgFor(p, det) { return matKgFor(p, det) || detKgFor(p, det); }
    /* кг на 1 шт детали (или всей позиции, если детали нет): сумма материалов в её ветке структуры; нет материала — «Справочник Втулки состав» */
    function detKgFor(p, det) { var k = detKgTree(p, det); if (k > 0) return k; var b = det ? bushGet(bushKey(det)) : null; return b ? b.kg : 0; }
    function detKgSrc(p, det) { if (detKgTree(p, det) > 0) return 'из состава'; var key = det ? bushKey(det) : '', b = bushGet(key); return b ? 'справочник втулок ' + key + (b.user ? ' (добавлено)' : '') : ''; }
    function detKgTree(p, det) {
      var B = null; try { B = bomRows(p); } catch (e) { B = null; } if (!B || !B.rows) return 0;
      var nk = function (x) { return cleanSp(x).replace(/\s+/g, '').toUpperCase(); }, dn = det ? nk(det) : '', mul = [1], st = -1, sd = 0, md = 1, kg = 0, tot = 0;
      B.rows.forEach(function (r) {
        var base = mul[r.d - 1] != null ? mul[r.d - 1] : 1;
        if (r.label) { mul[r.d] = base; mul.length = r.d + 1; return; }
        var m = base * (r.q > 0 ? r.q : 0); mul[r.d] = m; mul.length = r.d + 1;
        if (st === 1 && r.d <= sd) st = 2;
        if (dn && st === -1 && r.names.some(function (x) { return nk(x) === dn; })) { st = 1; sd = r.d; md = m; return; }
        if (r.kind === 'mat') { tot += m; if (st === 1) kg += m; }
      });
      if (!dn) return tot; return st > 0 && md > 0 ? kg / md : 0;
    }
    function matPack(prs, D, KG) {
      var out = [], lost = 0, big = -1;
      prs.forEach(function (x, i) { if (D.mq[i] > 0) { out.push({ i: i, q: D.mq[i], kg: D.mk[i] }); if (big < 0 || D.mk[i] > out[big].kg) big = out.length - 1; } else lost += D.mk[i] || 0; });
      if (lost > 0 && big >= 0) { var b = out[big], k1 = KG[prs[b.i][0].id]; b.kg += lost; if (k1 > 0) b.q = Math.floor(b.kg / k1 + 1e-4); }
      return out;
    }
    function matFind(v) {
      var n = matNorm(v); if (n.length < 3) return null;
      var M = matUse(), hit = null, cand = [];
      Object.keys(M).forEach(function (k) { if (M[k].n === n) hit = M[k]; else if (M[k].n.indexOf(n) >= 0) cand.push(M[k]); });
      if (hit || cand.length === 1) return hit || cand[0];
      var T = matTok(v); if (T.length < 2) return null;
      var c2 = Object.keys(M).filter(function (k) { return T.every(function (t) { return M[k].n.indexOf(t) >= 0; }); });
      return c2.length === 1 ? M[c2[0]] : null;
    }
    function invNewModal(pre, editKey) {
      MATU = null; var MU = matUse();
      /* правка одной строки инвойса (товар / деталь / материал): та же форма, одна строка с введёнными данными; при сохранении старые комментарии строки заменяются */
      var ED = null;
      if (pre && editKey) {
        var e0 = invIndex()[pre], g0 = e0 ? invLines(e0.items).filter(function (x) { return x.k === editKey; })[0] : null;
        if (g0) {
          var com0 = function (f) { var v = null, d = false; g0.items.forEach(function (x) { var y = x.c[f] || ''; if (v === null) v = y; else if (v !== y) d = true; }); return d ? '' : (v || ''); };
          var ps0 = {}; g0.items.forEach(function (x) { ps0[x.p.id] = x.p; }); var pl0 = Object.keys(ps0).map(function (k) { return ps0[k]; });
          var realMat = g0.mat ? matFind(g0.mat) : null, kgPos = !!g0.mat && !realMat;
          var rt0 = pl0.map(function (q) { return nameGroup(q.name); }), pos0 = realMat ? g0.mat : pl0.length === 1 ? pl0[0].name : rt0.every(function (r) { return r === rt0[0]; }) ? rt0[0] : pl0[0].name;
          var os0 = {}; g0.items.forEach(function (x) { os0[x.o.id] = 1; }); var oid0 = Object.keys(os0).length === 1 && pl0.length ? Object.keys(os0)[0] : '';
          var has = {}; g0.items.forEach(function (x) { has[cmKey(x.p, x.o)] = 1; });
          var allC = [], shC = [], prC = []; QUEUE.forEach(function (o) { if (oid0 && o.id !== oid0) return; pl0.forEach(function (q) { if (R[q.id].cells[o.id]) allC.push([q, o]); }); });
          shC = pairsShort(allC); prC = pairsShortProd(allC);
          var same = function (A) { return A.length === Object.keys(has).length && A.every(function (x) { return has[cmKey(x[0], x[1])]; }); };
          var del0 = {}, pr0 = {}; g0.items.forEach(function (x) { var k = cmKey(x.p, x.o); pr0[k] = [x.p, x.o]; (del0[k] = del0[k] || {})[String(x.c.ts || 0)] = 1; });
          ED = {
            key: editKey, inv: pre, g: g0, pos: pos0, oid: realMat ? '' : oid0, has: has, mode: 'keep', dist: !g0.same,
            unit: kgPos ? 'kg' : '', kgu: kgPos ? com0('kgu') : '', qty: g0.mat ? Math.round(g0.kg * 1000) / 1000 : g0.q, st: com0('st'), cont: com0('cont'), det: kgPos ? g0.mat : g0.mat ? '' : (g0.isDet ? g0.name : com0('det')), ship: com0('ship'), text: com0('text'), del: del0, pairs: pr0
          };
        }
      }
      var K = cmKnown(), roots = {}, names = OOR.positions.map(function (p) { roots[nameGroup(p.name)] = 1; return p.name; });
      var h = head(ED ? '✎ Изменить строку инвойса ' + esc(pre) + ': ' + esc(ED.g.name) : pre ? 'Добавить позиции в инвойс ' + esc(pre) : 'Новый инвойс', ED ? 'одна строка: позиция, корень или материал (кол-во в кг) — при сохранении её комментарии (' + ED.g.items.length + ') заменяются новыми по выбранным «Куда добавить» и «распределить»' : 'строки — позиция, корень (например RS 7014) или материал (например Бесшовная труба 22x12,3 — кол-во в кг, переводится в шт каждой позиции, где он используется); комментарии добавятся во все затронутые ячейки');
      h += '<div class="cmf invh"><label>Инвойс №<input id="inN" list="inNL" value="' + esc(pre || '') + '" placeholder="например SGG-202627"></label>' + cmKnownList(K.I, 'inNL', function (a) { return Object.keys(a.cont).join(', '); }) +
        '<label>Дата инвойса<input id="inDI" type="date"></label>' +
        '<label>Статус<select id="inS">' + Object.keys(CM_ST).map(function (k) { return '<option value="' + k + '"' + (k === 'transit' ? ' selected' : '') + '>' + esc(CM_ST[k]) + '</option>'; }).join('') + '</select></label>' +
        '<label>Контейнер №<input id="inC" list="inCL"></label>' + cmKnownList(K.C, 'inCL', function (b) { return b.inv ? 'инв. ' + b.inv : ''; }) +
        '<label>Дата отгрузки<input id="inD" type="date"></label>' +
        '<label>Заказ<select id="inO"><option value="">все заказы</option>' + QUEUE.map(function (o) { return '<option value="' + o.id + '">' + esc(o.label + ' · ' + o.client) + '</option>'; }).join('') + '</select></label></div>';
      h += '<datalist id="inPL">' + Object.keys(roots).sort().map(function (r) { return '<option value="' + esc(r) + '" label="корень — все позиции">'; }).join('') + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + Object.keys(MU).sort().map(function (k) { return '<option value="' + esc(MU[k].name) + '" label="материал — позиций ' + MU[k].use.length + '">'; }).join('') + '</datalist>';
      h += '<table class="mini invt ive" id="inT"><tr><th class="n">№</th><th>Позиция, корень или материал</th><th class="n">Кол-во</th><th>Статус</th><th>Контейнер</th><th>Деталь</th><th>Отгрузка</th><th>Комментарий</th><th class="n">Ячеек</th><th></th></tr></table>';
      if (!ED) h += '<div class="fbar"><button class="btn sm" id="inAddRow">＋ Строка</button></div>';
      h += '<div class="invfoot"><div class="invmode"><b>Куда добавить:</b> ' + (ED ? '<label><input type="radio" name="inM" value="keep"> в те же ячейки, что сейчас (' + Object.keys(ED.has).length + ')</label>' : '') + '<label><input type="radio" name="inM" value="all" checked> во все заказы позиции</label><label><input type="radio" name="inM" value="short"> только где не хватает</label><label><input type="radio" name="inM" value="prod"> не хватающие и производимые (п/ф, произв.)</label></div>' +
        '<label class="invdist"><input type="checkbox" id="inDist" checked> Кол-во распределить по очереди заказов — сначала где не хватает (иначе каждой ячейке полное кол-во); материал — по всем позициям: сначала нехватка, остаток по заказанному кол-ву</label>' +
        '<div class="note" id="inPrev" style="font-size:14px;font-weight:700"></div>' +
        '<div class="row" style="display:flex;gap:8px;margin-top:6px"><button class="btn primary" id="inSave">Сохранить инвойс</button><button class="btn" id="inCancel">Отмена</button></div></div></div>';
      openModal(h, true); modal.classList.add('xw');
      var rowN = 0;
      var addRow = function (v) {
        var n = ++rowN, tr = document.createElement('tr'); tr.className = 'inr';
        tr.innerHTML = '<td class="n">' + n + '</td><td><input class="ive-f inp" list="inPL" placeholder="позиция, корень или материал" value="' + esc(v || '') + '"><div class="inmi"></div></td><td class="n"><span class="inqw"><input class="ive-f n inq" type="number" min="0" step="any"><select class="ive-f inu" title="Единица: шт или кг"><option value="pc">шт</option><option value="kg">кг</option></select></span><span class="inkw" hidden><input class="ive-f inku" type="number" min="0" step="any" placeholder="авто"> кг на 1 шт</span><div class="inkn"></div></td>' +
          '<td><select class="ive-f ins"><option value="">как у инвойса</option>' + Object.keys(CM_ST).filter(function (k) { return k; }).map(function (k) { return '<option value="' + k + '">' + esc(CM_ST[k]) + '</option>'; }).join('') + '</select></td>' +
          '<td><input class="ive-f inc" list="inCL" placeholder="как у инвойса"></td><td><input class="ive-f ind" list="inDL' + n + '"><datalist id="inDL' + n + '"></datalist></td><td><input class="ive-f inship" type="date"></td><td><input class="ive-f wide int"></td><td class="n inN"></td><td><button class="btn sm inx" title="Убрать строку">✕</button></td>';
        $('inT').appendChild(tr);
        tr.querySelector('.inx').onclick = function () { tr.remove(); prev(); };
        tr.querySelector('.inp').addEventListener('change', function () { var mt = invRowPositions(this.value).length ? null : matFind(this.value); if (mt) { this.value = mt.name; tr.querySelector('datalist').innerHTML = ''; return; } var ps = invRowPositions(this.value); tr.querySelector('datalist').innerHTML = cmDetNames(ps.slice(0, 10).map(function (p) { return [p, null]; })).map(function (x) { return '<option value="' + esc(x[0]) + '" label="' + esc(x[1]) + '">'; }).join(''); });
        tr.querySelectorAll('input,select').forEach(function (f) { f.addEventListener('input', prev); f.addEventListener('change', prev); });
        return tr;
      };
      var mode = function () { var r = modal.querySelector('input[name="inM"]:checked'); return r ? r.value : 'all'; };
      var plan = function () {
        var oid = $('inO').value, m = mode(), dist = $('inDist').checked, out = [], bad = 0, pend = [];
        modal.querySelectorAll('tr.inr').forEach(function (tr) {
          var v = tr.querySelector('.inp').value; if (!cleanSp(v)) { tr.querySelector('.inN').textContent = ''; return; }
          var ps = invRowPositions(v), det = cleanSp(tr.querySelector('.ind').value), prs = [], mi = tr.querySelector('.inmi'), qin = tr.querySelector('.inq');
          var mt = ps.length ? null : matFind(v);
          tr.classList.toggle('inmat', !!mt); qin.placeholder = mt ? 'кг' : '';
          var uS = tr.querySelector('.inu'), kgU = !mt && uS.value === 'kg'; if (mt) { uS.value = 'kg'; uS.disabled = true; } else uS.disabled = false;
          tr.querySelector('.inkw').hidden = !kgU; if (!kgU) { tr.querySelector('.inkn').innerHTML = ''; tr.querySelector('.inkn')._h = ''; }
          if (mt) {
            var KG = {}, nok = 0; mt.use.forEach(function (u) { if (u.kg > 0) KG[u.p.id] = u.kg; else nok++; });
            var mps = mt.use.filter(function (u) { return u.kg > 0; }).map(function (u) { return u.p; });
            QUEUE.forEach(function (o) { if (oid && o.id !== oid) return; mps.forEach(function (p) { if (R[p.id].cells[o.id]) prs.push([p, o]); }); });
            if (m === 'keep' && ED) prs = prs.filter(function (x) { return ED.has[cmKey(x[0], x[1])]; }); else if (m === 'short') prs = pairsShort(prs); else if (m === 'prod') prs = pairsShortProd(prs);
            var kq = parseFloat(String(qin.value).replace(',', '.')) || 0, mq = prs.map(function (x) { return dist ? 0 : Math.floor(kq / KG[x[0].id] + 1e-9); }), mk = prs.map(function () { return dist ? 0 : kq; });
            if (dist && kq > 0 && prs.length) { var DD = matDist(prs, KG, kq); mq = DD.mq; mk = DD.mk; }
            var kgs = mps.map(function (p) { return KG[p.id]; }), kmin = Math.min.apply(null, kgs.length ? kgs : [0]), kmax = Math.max.apply(null, kgs.length ? kgs : [0]), tot = mq.reduce(function (a, b) { return a + b; }, 0);
            var mh = '<b>материал</b> · позиций ' + mps.length + (nok ? ' (без кг/шт: ' + nok + ')' : '') + ' · на 1 шт ' + fmtQ(kmin) + (kmax > kmin ? '–' + fmtQ(kmax) : '') + ' кг' + (kq > 0 ? ' · ' + fmtQ(kq) + ' кг → <b>' + fmt(tot) + ' шт</b>' + (dist ? '' : ' (каждой ячейке)') : '') +
              '<details class="inmd"' + (tr.dataset.mopen === '1' ? ' open' : '') + '><summary>в шт по позициям</summary><table class="inmt">' + mps.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td class="n">' + fmtQ(KG[p.id]) + ' кг/шт</td><td class="n">' + (kq > 0 ? '<b>' + fmt(Math.floor(kq / KG[p.id] + 1e-9)) + ' шт</b>' : '') + '</td></tr>'; }).join('') + '</table></details>';
            if (mi._h !== mh) { mi.innerHTML = mh; mi._h = mh; var dd = mi.querySelector('details.inmd'); if (dd) dd.addEventListener('toggle', function () { tr.dataset.mopen = dd.open ? '1' : ''; }); }
            tr.querySelector('.inN').textContent = prs.length ? prs.length : '—'; tr.classList.toggle('inbad', !prs.length); tr.classList.remove('inwait');
            if (!prs.length) { bad++; return; }
            out.push({ tr: tr, prs: prs, qs: mq, mk: mk, KG: KG, c: { st: tr.querySelector('.ins').value || $('inS').value, cont: cleanSp(tr.querySelector('.inc').value) || cleanSp($('inC').value), det: det || mt.name, mat: mt.name, ship: tr.querySelector('.inship').value || $('inD').value, text: cleanSp(tr.querySelector('.int').value) } });
            return;
          }
          if (!kgU) { mi.innerHTML = ''; mi._h = ''; }
          QUEUE.forEach(function (o) { if (oid && o.id !== oid) return; ps.forEach(function (p) { if (R[p.id].cells[o.id]) prs.push([p, o]); }); });
          if (m === 'keep' && ED) prs = prs.filter(function (x) { return ED.has[cmKey(x[0], x[1])]; }); else if (m === 'short') prs = pairsShort(prs); else if (m === 'prod') prs = pairsShortProd(prs);
          prs = sidePairs(prs, det);
          var any0 = 0; QUEUE.forEach(function (o) { if (oid && o.id !== oid) return; ps.forEach(function (p) { if (R[p.id].cells[o.id]) any0++; }); });
          tr.querySelector('.inN').textContent = prs.length ? prs.length : (any0 ? '—' : 'ждёт'); tr.classList.toggle('inbad', !prs.length && !!any0); tr.classList.toggle('inwait', !any0);
          var kuMan = parseFloat(String(tr.querySelector('.inku').value).replace(',', '.')) || 0;
          if (!any0) { var pl = { pos: cleanSp(v), qty: parseFloat(String(tr.querySelector('.inq').value).replace(',', '.')) || 0, st: tr.querySelector('.ins').value || $('inS').value, cont: cleanSp(tr.querySelector('.inc').value) || cleanSp($('inC').value), det: det, ship: tr.querySelector('.inship').value || $('inD').value, text: cleanSp(tr.querySelector('.int').value), mode: m, oid: oid, dist: dist }; if (kgU) { pl.unit = 'kg'; if (kuMan > 0) pl.kgu = kuMan; } pend.push(pl); return; }
          if (!prs.length) { bad++; return; }
          if (kgU) {
            var KGp = {}, kq0 = parseFloat(String(tr.querySelector('.inq').value).replace(',', '.')) || 0;
            ps.forEach(function (p) { var k = kuMan > 0 ? kuMan : detKgFor(p, det); if (k > 0) KGp[p.id] = k; });
            var kn = tr.querySelector('.inkn'), kv = Object.keys(KGp).map(function (k) { return KGp[k]; });
            prs = prs.filter(function (x) { return KGp[x[0].id] > 0; });
            if (!kv.length || !prs.length) { mi.innerHTML = ''; mi._h = ''; var bk0 = det ? bushKey(det) : ''; kn._h = ''; kn.innerHTML = '<span style="color:var(--bad)">кг на 1 шт не найден' + (det ? ' для «' + esc(det) + '»' : '') + (bk0 ? ' — в составе нет материала, в справочнике втулок нет ' + esc(bk0) : '') + ' — укажите</span>'; tr.querySelector('.inN').textContent = '—'; tr.classList.add('inbad'); bad++; return; }
            var D2 = dist ? matDist(prs, KGp, kq0) : { mq: prs.map(function (x) { return Math.floor(kq0 / KGp[x[0].id] + 1e-9); }), mk: prs.map(function () { return kq0; }) };
            var k1 = Math.min.apply(null, kv), k2 = Math.max.apply(null, kv), tq = D2.mq.reduce(function (a, b) { return a + b; }, 0);
            var bk = det ? bushKey(det) : '', src = kuMan > 0 ? '' : detKgSrc(ps[0], det), sv = kn.querySelector('.inksv'), svOn = sv ? sv.checked : false;
            /* как у материала: под позицией — «в кг · позиций · на 1 шт · кг → шт» и свёрнутая таблица «в шт по позициям» */
            var PQ = {}; prs.forEach(function (x, i) { PQ[x[0].id] = (PQ[x[0].id] || 0) + (D2.mq[i] || 0); });
            var pl = ps.filter(function (p) { return KGp[p.id] > 0; });
            var mh = '<b>в кг</b> · позиций ' + pl.length + ' · на 1 шт ' + fmtQ(k1) + (k2 > k1 ? '–' + fmtQ(k2) : '') + ' кг' + (src ? ' (' + esc(src) + ')' : '') + (kq0 > 0 ? ' · ' + fmtQ(kq0) + ' кг → <b>' + fmt(tq) + ' шт</b>' + (dist ? '' : ' (каждой ячейке)') : '') +
              '<details class="inmd"' + (tr.dataset.mopen === '1' ? ' open' : '') + '><summary>в шт по позициям</summary><table class="inmt">' + pl.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td class="n">' + fmtQ(KGp[p.id]) + ' кг/шт</td><td class="n">' + (kq0 > 0 ? '<b>' + fmt(PQ[p.id] || 0) + ' шт</b>' : '') + '</td></tr>'; }).join('') + '</table></details>';
            if (mi._h !== mh) { mi.innerHTML = mh; mi._h = mh; var dd2 = mi.querySelector('details.inmd'); if (dd2) dd2.addEventListener('toggle', function () { tr.dataset.mopen = dd2.open ? '1' : ''; }); }
            var nh = kuMan > 0 && bk ? '<label class="inksl"><input type="checkbox" class="inksv"' + (svOn ? ' checked' : '') + '> запомнить в справочнике втулок как ' + esc(bk) + '</label>' : '';
            if (kn._h !== nh) { kn.innerHTML = nh; kn._h = nh; }
            tr.querySelector('.inN').textContent = prs.length;
            out.push({ tr: tr, prs: prs, qs: D2.mq, mk: D2.mk, KG: KGp, bush: kuMan > 0 && bk && kn.querySelector('.inksv') && kn.querySelector('.inksv').checked ? [bk, kuMan] : null, c: { st: tr.querySelector('.ins').value || $('inS').value, cont: cleanSp(tr.querySelector('.inc').value) || cleanSp($('inC').value), det: det, ship: tr.querySelector('.inship').value || $('inD').value, text: cleanSp(tr.querySelector('.int').value) } });
            return;
          }
          var q = parseFloat(String(tr.querySelector('.inq').value).replace(',', '.')) || 0, qs = prs.map(function () { return dist ? 0 : q; });
          if (dist && q > 0) { var left = q, last = -1; prs.forEach(function (x, i) { var s = finalShort(x[0], x[1]); if (left > 0 && s > 0) { var t = Math.min(left, s); qs[i] = t; left -= t; last = i; } }); if (left > 0) qs[last >= 0 ? last : 0] += left; }
          out.push({ tr: tr, prs: prs, qs: qs, c: { st: tr.querySelector('.ins').value || $('inS').value, cont: cleanSp(tr.querySelector('.inc').value) || cleanSp($('inC').value), det: det, ship: tr.querySelector('.inship').value || $('inD').value, text: cleanSp(tr.querySelector('.int').value) } });
        });
        return { rows: out, bad: bad, pend: pend };
      };
      var prev = function () {
        var P0 = plan(), n = 0, cells = {}; P0.rows.forEach(function (r) { r.prs.forEach(function (x) { n++; cells[cmKey(x[0], x[1])] = 1; }); });
        $('inPrev').innerHTML = 'Строк: ' + P0.rows.length + ' · комментариев: ' + n + ' · ячеек: ' + Object.keys(cells).length + (P0.bad ? ' · <span style="color:var(--bad)">нет подходящих ячеек: ' + P0.bad + '</span>' : '') + (P0.pend.length ? ' · <span style="color:#8a5a00">позиций нет в заказах: ' + P0.pend.length + ' — останутся в инвойсе и добавятся, когда появятся в заказах</span>' : '');
      };
      if (!ED) { for (var i = 0; i < 3; i++) addRow(''); $('inAddRow').onclick = function () { addRow('').querySelector('.inp').focus(); }; }
      ['inO', 'inDist', 'inS', 'inC', 'inD'].forEach(function (id) { $(id).addEventListener('change', prev); });
      modal.querySelectorAll('input[name="inM"]').forEach(function (r) { r.onchange = prev; });
      /* «как у инвойса»: статус, контейнер, даты берутся из шапки; у существующего инвойса шапка заполняется его данными */
      var updPh = function () {
        var cv = cleanSp($('inC').value), sv = CM_ST[$('inS').value] || '';
        modal.querySelectorAll('tr.inr .inc').forEach(function (f) { f.placeholder = 'как у инвойса' + (cv ? ' (' + cv + ')' : ' — не указан'); });
        modal.querySelectorAll('tr.inr .ins').forEach(function (f) { f.options[0].textContent = 'как у инвойса (' + sv + ')'; });
      };
      var fillInv = function () { var a = K.I[cleanSp($('inN').value)]; if (!a) { updPh(); return; } var cs = Object.keys(a.cont).sort(function (x, y) { return a.cont[y] - a.cont[x]; }); if (!$('inC').value && cs.length) $('inC').value = cs[0]; if (!$('inD').value && a.ship) $('inD').value = a.ship; if (!$('inDI').value && a.invd) $('inDI').value = a.invd; if (a.st) $('inS').value = a.st; updPh(); prev(); };
      $('inN').addEventListener('change', fillInv);
      ['inS', 'inC'].forEach(function (id) { $(id).addEventListener('input', updPh); $(id).addEventListener('change', updPh); });
      var addRow0 = addRow; addRow = function (v) { var tr = addRow0(v); updPh(); return tr; };
      if (pre) fillInv(); else updPh();
      if (ED) {
        var tr0 = addRow(ED.pos); tr0.querySelector('.inx').remove();
        tr0.querySelector('.inq').value = ED.qty || ''; tr0.querySelector('.ins').value = ED.st && ED.st !== $('inS').value ? ED.st : ''; tr0.querySelector('.inc').value = ED.cont && ED.cont !== cleanSp($('inC').value) ? ED.cont : '';
        tr0.querySelector('.inp').dispatchEvent(new Event('change')); tr0.querySelector('.ind').value = ED.det; if (ED.unit === 'kg') { tr0.querySelector('.inu').value = 'kg'; if (ED.kgu) tr0.querySelector('.inku').value = ED.kgu; } tr0.querySelector('.inship').value = ED.ship && ED.ship !== $('inD').value ? ED.ship : ''; tr0.querySelector('.int').value = ED.text;
        var rm = modal.querySelector('input[name="inM"][value="' + ED.mode + '"]'); if (rm) rm.checked = true; $('inDist').checked = ED.dist; if (ED.oid) $('inO').value = ED.oid;
        $('inSave').textContent = 'Сохранить изменения'; updPh();
      }
      $('inCancel').onclick = function () { if (pre) invItemsModal(pre); else invListModal(); };
      if (ED) $('inCancel').textContent = '← Назад в инвойс';
      $('inSave').onclick = function () {
        var inv = cleanSp($('inN').value); if (!inv) { showMsg('Укажите «Инвойс №».', 'err'); $('inN').focus(); return; }
        var P0 = plan(); if (!P0.rows.length && !P0.pend.length) { showMsg('Нет заполненных строк.', 'err'); return; }
        var add = {}, pairs = {}, ts = Date.now(), n = 0;
        var invd = $('inDI').value;
        P0.rows.forEach(function (r) { if (r.bush) bomSet('W|' + r.bush[0], { name: r.bush[0], mat: '', qty: r.bush[1], unit: 'кг/шт' }, 'Справочник втулок ' + r.bush[0]); });
        var pj = P0.pend.map(function (L, i) { var v = Object.assign({}, L, { inv: inv, ts: ts, by: ME || '' }); if (invd) v.invd = invd; return invpSet('p' + ts.toString(36) + i, v, inv + ' · ' + L.pos); });
        P0.rows.forEach(function (r, ri) { r.prs.forEach(function (x, i) { var k = cmKey(x[0], x[1]); pairs[k] = x; var cc = Object.assign({}, r.c, { inv: inv, qty: r.qs[i] > 0 ? r.qs[i] : 0, ts: ts + ri * 100 + i, by: ME || '' }); if (invd) cc.invd = invd; if (r.mk) { cc.mkg = Math.round(r.mk[i] * 1e6) / 1e6; cc.kgu = r.KG[x[0].id] || 0; } (add[k] = add[k] || []).push(cc); n++; }); });
        if (ED) Object.keys(ED.pairs).forEach(function (k) { if (!pairs[k]) pairs[k] = ED.pairs[k]; });
        var prs = Object.keys(pairs).map(function (k) { return pairs[k]; });
        if (!prs.length) { Promise.all(pj).then(function () { render(); showMsg('Инвойс <b>' + esc(inv) + '</b>: строк в ожидании ' + P0.pend.length + ' — добавятся, когда позиции появятся в заказах.', 'good'); invItemsModal(inv); }); return; }
        cmSaveMany(prs, function (L, p, o) { var d = ED ? ED.del[cmKey(p, o)] || {} : {}; return L.filter(function (c) { return !(ED && cleanSp(c.inv) === ED.inv && d[String(c.ts || 0)]); }).concat(add[cmKey(p, o)] || []); }, 'Инвойс ' + inv + ': ' + (ED ? 'изменена строка ' + ED.g.name + ' (было ' + ED.g.items.length + ' коммент.) — ' : '') + 'добавлено ' + n + ' коммент. в ' + prs.length + ' ячеек (' + { all: 'все заказы', short: 'где не хватает', prod: 'не хватающие и производимые' }[mode()] + ')').then(function () {
          return Promise.all(pj);
        }).then(function () {
          render(); showMsg('Инвойс <b>' + esc(inv) + '</b>: добавлено комментариев ' + n + ' в ' + prs.length + ' ячеек.' + (P0.pend.length ? ' В ожидании (позиций нет в заказах): ' + P0.pend.length + '.' : ''), 'good'); invItemsModal(inv);
        });
      };
      prev();
    }
    /* ===== строки инвойса без позиции в заказах: остаются в инвойсе (OV.invp) и добавляются сами, когда позиция появится в заказах ===== */
    function invPlanLine(L) {
      var ps = invRowPositions(L.pos), prs = [];
      if (!ps.length) {
        var mt = matFind(L.pos);
        if (mt) {
          var KG = {}; mt.use.forEach(function (u) { if (u.kg > 0) KG[u.p.id] = u.kg; });
          QUEUE.forEach(function (o) { if (L.oid && o.id !== L.oid) return; mt.use.forEach(function (u) { if (u.kg > 0 && R[u.p.id].cells[o.id]) prs.push([u.p, o]); }); });
          var any0 = prs.length; if (L.mode === 'short') prs = pairsShort(prs); else if (L.mode === 'prod') prs = pairsShortProd(prs);
          var kq = L.qty > 0 ? L.qty : 0, D = L.dist ? matDist(prs, KG, kq) : { mq: prs.map(function (x) { return Math.floor(kq / KG[x[0].id] + 1e-9); }), mk: prs.map(function () { return kq; }) };
          return { any: any0, prs: prs, qs: D.mq, mk: D.mk, KG: KG, mat: mt.name };
        }
      }
      QUEUE.forEach(function (o) { if (L.oid && o.id !== L.oid) return; ps.forEach(function (p) { if (R[p.id].cells[o.id]) prs.push([p, o]); }); });
      var any = prs.length;
      if (L.mode === 'short') prs = pairsShort(prs); else if (L.mode === 'prod') prs = pairsShortProd(prs);
      prs = sidePairs(prs, L.det);
      if (L.unit === 'kg') {
        var KGp = {}; ps.forEach(function (p) { var k = L.kgu > 0 ? L.kgu : detKgFor(p, L.det); if (k > 0) KGp[p.id] = k; });
        prs = prs.filter(function (x) { return KGp[x[0].id] > 0; }); var kq = L.qty > 0 ? L.qty : 0;
        var D3 = L.dist ? matDist(prs, KGp, kq) : { mq: prs.map(function (x) { return Math.floor(kq / KGp[x[0].id] + 1e-9); }), mk: prs.map(function () { return kq; }) };
        return { any: any, prs: prs, qs: D3.mq, mk: D3.mk, KG: KGp, kgOnly: true };
      }
      var q = L.qty > 0 ? L.qty : 0, qs = prs.map(function () { return L.dist ? 0 : q; });
      if (L.dist && q > 0 && prs.length) { var left = q, last = -1; prs.forEach(function (x, i) { var s = finalShort(x[0], x[1]); if (left > 0 && s > 0) { var t = Math.min(left, s); qs[i] = t; left -= t; last = i; } }); if (left > 0) qs[last >= 0 ? last : 0] += left; }
      return { any: any, prs: prs, qs: qs };
    }
    function invpSet(id, v, label) {
      var ts = Date.now(), mid = 'v' + hash(id);
      if (v === null) { delete OV.invp[id]; delete OVMETA[mid]; } else { OV.invp[id] = v; OVMETA[mid] = { ts: ts, by: ME }; }
      return persistEdit(mid, 'invp', id, v, { name: label || '' }, null, ts);
    }
    var INVP_BUSY = false;
    function invPendingApply(silent) {
      if (INVP_BUSY || !CAN_WRITE || !OV.invp || !OOR) return Promise.resolve(0);
      var ids = Object.keys(OV.invp); if (!ids.length) return Promise.resolve(0);
      INVP_BUSY = true;
      var add = {}, pairs = {}, done = [], n = 0, ts = Date.now();
      ids.forEach(function (id, li) {
        var L = OV.invp[id]; if (!L) return;
        var P0 = invPlanLine(L); if (!P0.any || !P0.prs.length) return;
        P0.prs.forEach(function (x, i) { var k = cmKey(x[0], x[1]); pairs[k] = x; var cc = { st: L.st || '', inv: L.inv, qty: P0.qs[i] > 0 ? P0.qs[i] : 0, cont: L.cont || '', det: L.det || '', ship: L.ship || '', text: L.text || '', ts: ts + li * 100 + i, by: L.by || ME || '' }; if (L.invd) cc.invd = L.invd; if (P0.mat || P0.kgOnly) { if (P0.mat) { cc.mat = P0.mat; if (!cc.det) cc.det = P0.mat; } cc.mkg = Math.round(P0.mk[i] * 1e6) / 1e6; cc.kgu = P0.KG[x[0].id] || 0; } (add[k] = add[k] || []).push(cc); n++; });
        done.push(id);
      });
      if (!done.length) { INVP_BUSY = false; return Promise.resolve(0); }
      var prs = Object.keys(pairs).map(function (k) { return pairs[k]; }), invs = {};
      done.forEach(function (id) { invs[OV.invp[id].inv] = 1; });
      return cmSaveMany(prs, function (L, p, o) { return L.concat(add[cmKey(p, o)] || []); }, 'Инвойс ' + Object.keys(invs).join(', ') + ': позиции появились в заказах — добавлено ' + n + ' коммент. в ' + prs.length + ' ячеек (строк из ожидания: ' + done.length + ')')
        .then(function () { return Promise.all(done.map(function (id) { return invpSet(id, null, 'добавлено в заказы'); })); })
        .then(function () { INVP_BUSY = false; render(); if (!silent) showMsg('Инвойс ' + esc(Object.keys(invs).join(', ')) + ': позиции появились в заказах — добавлено комментариев ' + n + ' (строк из ожидания: ' + done.length + ').', 'good'); return n; },
          function (e) { INVP_BUSY = false; throw e; });
    }
    var INV_SORT = { k: 'ship', d: -1 };
    function invListModal() {
      var shipMax = function (e) { return Object.keys(e.ship).sort().pop() || ''; };
      var npOf = function (e) { return Object.keys(e.ps).length + (e.pend ? e.pend.length : 0); };
      var KEY = {
        inv: function (e) { return e.inv; }, invd: invDate, st: function (e) { var c = invStatus(e); return c === null ? -1 : (CM_PRI[c] || 0); }, np: npOf, no: function (e) { return Object.keys(e.os).length; },
        qty: function (e) { return e.qty; }, cont: function (e) { return Object.keys(e.cont).join(', '); }, ship: shipMax, t: function (e) { return e.t; }
      };
      var S = INV_SORT, kf = KEY[S.k] || KEY.ship;
      var M = invIndex(), L = Object.keys(M).map(function (k) { return M[k]; }).sort(function (a, b) {
        var x = kf(a), y = kf(b), r;
        if (typeof x === 'number' && typeof y === 'number') r = x - y;
        else { x = String(x || ''); y = String(y || ''); if (!x !== !y) return x ? -1 : 1; r = x.localeCompare(y, 'ru', { numeric: true }); }
        return r * S.d || b.t - a.t;
      });
      var th = function (k, t, cls) { var on = S.k === k; return '<th class="ivsort' + (cls ? ' ' + cls : '') + (on ? ' on' : '') + '" data-k="' + k + '" title="Сортировать">' + t + '<i>' + (on ? (S.d > 0 ? '▲' : '▼') : '↕') + '</i></th>'; };
      var h = head('Инвойсы', 'из комментариев · ' + L.length + ' инвойсов · статус и дата инвойса меняются сразу у всех позиций инвойса · ✎ — переименовать (одинаковое имя — объединение) · нажатие на заголовок — сортировка');
      h += '<div class="fbar"><input type="search" id="ivq" placeholder="Поиск: инвойс, контейнер, позиция">' + (CAN_WRITE ? '<button class="btn sm pri" id="ivNew">＋ Новый инвойс</button><button class="btn sm" id="ivAdd">＋ Добавить инвойс из файла</button>' : '') + '<span class="sp"></span><button class="btn sm" id="ivLXls" title="Скачать список инвойсов и их строки в Excel"><svg class="ic" aria-hidden="true"><use href="#i-save"/></svg>Скачать Excel</button></div>';
      if (!L.length) h += '<p class="note" style="font-size:15px">Инвойсов пока нет — укажите «Инвойс №» в комментарии или добавьте инвойс из файла.</p>';
      else h += '<div class="scroll" style="max-height:70vh"><table class="mini invt" id="ivt"><tr><th class="n">№</th>' + th('inv', 'Инвойс') + th('invd', 'Дата инвойса') + th('st', 'Статус') + th('np', 'Позиций', 'n') + th('no', 'Заказов', 'n') + th('qty', 'Кол-во, шт', 'n') + th('cont', 'Контейнер') + th('ship', 'Отгрузка') + th('t', 'Изменён') + '</tr>' +
        L.map(function (e, ei) {
          var cur = invStatus(e), np = npOf(e), no = Object.keys(e.os).length, srch = (e.inv + ' ' + Object.keys(e.cont).join(' ') + ' ' + e.items.map(function (x) { return x.p.name + ' ' + x.o.label; }).join(' ')).replace(/\s+/g, '').toUpperCase();
          var stc = cur !== null ? CM_COL[cur] : '#8A94A6', dd = invDate(e);
          return '<tr class="go2 ivr" data-inv="' + esc(e.inv) + '" data-s="' + esc(srch) + '"' + (cur !== null ? ' style="background:' + hexA(stc, .08) + '"' : '') + '><td class="n">' + (ei + 1) + '</td><td style="border-left:5px solid ' + stc + '"><span class="ivnh"><b class="ivn">' + esc(e.inv) + '</b>' + (CAN_WRITE ? ' <button class="ivren" title="Переименовать инвойс">✎</button><button class="ivrm" title="Удалить инвойс (все его комментарии)">🗑</button>' : '') + '</span></td>' +
            '<td>' + (CAN_WRITE ? '<input type="date" class="invdate" data-inv="' + esc(e.inv) + '" value="' + esc(dd) + '">' : esc(dd ? ruDate(dd) : '')) + (Object.keys(e.invd || {}).length > 1 ? '<div class="note">разные даты</div>' : '') + '</td>' +
            '<td>' + (CAN_WRITE ? invStSelect(e.inv, cur) : (cur !== null ? cmChip(cur) : 'разные')) + (cur === null ? '<div class="note">' + Object.keys(e.st).map(function (k) { return esc(CM_ST[k]) + ' ' + e.st[k]; }).join(' · ') + '</div>' : '') + '</td><td class="n">' + np + (e.pend ? '<div class="note" title="позиций нет в заказах — добавятся, когда появятся">ожидают ' + e.pend.length + '</div>' : '') + '</td><td class="n">' + no + '</td><td class="n"><b>' + (e.qty ? fmt(e.qty) : '—') + '</b></td><td>' + esc(Object.keys(e.cont).join(', ')) + '</td><td>' + esc(Object.keys(e.ship).sort().map(ruDate).join(', ')) + '</td><td class="note">' + (e.t ? esc(nowStr(e.t)) : '') + '</td></tr>';
        }).join('') + '</table></div>';
      openModal(h + '</div>', true);
      if ($('ivAdd')) $('ivAdd').onclick = function () { invPick(); };
      if ($('ivNew')) $('ivNew').onclick = function () { invNewModal(''); };
      if ($('ivq')) $('ivq').oninput = function () { var q = $('ivq').value.replace(/\s+/g, '').toUpperCase(); modal.querySelectorAll('tr.ivr').forEach(function (tr) { tr.hidden = q && tr.dataset.s.indexOf(q) < 0; }); };
      modal.querySelectorAll('tr.ivr').forEach(function (tr) { tr.onclick = function (ev) { if (ev.target.closest('select,input,button')) return; invItemsModal(tr.dataset.inv); }; });
      modal.querySelectorAll('button.ivren').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); var tr = b.closest('tr'); invRenameUi(b.closest('.ivnh'), tr.dataset.inv, function () { invListModal(); }); }; });
      modal.querySelectorAll('button.ivrm').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); var inv = b.closest('tr').dataset.inv; if (!b.dataset.sure) { b.dataset.sure = 1; b.classList.add('sure'); b.textContent = 'удалить?'; return; } invDelete(inv).then(function (n) { showMsg('Инвойс <b>' + esc(inv) + '</b> удалён — комментариев: ' + n + '. Вернуть — ↶ Отменить.', 'good'); invListModal(); }); }; });
      invBindSt(invListModal); invBindDate(invListModal);
      if ($('ivLXls')) $('ivLXls').onclick = function () {
        var stTxt = function (e) { var c = invStatus(e); return c !== null ? CM_ST[c] : Object.keys(e.st).map(function (k) { return CM_ST[k] + ' ' + e.st[k]; }).join(', '); };
        var A = [['Инвойсы — ' + nowStr(Date.now())], [], ['№', 'Инвойс', 'Дата инвойса', 'Статус', 'Позиций', 'Заказов', 'Кол-во, шт', 'Контейнер', 'Отгрузка', 'Изменён']].concat(L.map(function (e, i) { var d = invDate(e); return [i + 1, e.inv, d ? ruDate(d) : '', stTxt(e), npOf(e), Object.keys(e.os).length, e.qty || 0, Object.keys(e.cont).join(', '), Object.keys(e.ship).sort().map(ruDate).join(', '), e.t ? nowStr(e.t) : '']; }));
        var B = [['Строки инвойсов (что приходит)'], [], ['Инвойс', 'Дата инвойса', '№', 'Тип', 'Деталь / позиция / материал', 'Кол-во, шт', 'Материал, кг', 'Статус', 'Контейнер', 'Отгрузка', 'Позиций', 'Ячеек', 'Позиции', 'Не хватает']];
        L.forEach(function (e) {
          var d = invDate(e), n = 0;
          (e.lines || invLines(e.items)).forEach(function (g) {
            var st = {}, cs = {}, sh = {}, ps = {}, sp = {}; g.items.forEach(function (x) { st[CM_ST[x.c.st || ''] || ''] = 1; if (x.c.cont) cs[x.c.cont] = 1; if (x.c.ship) sp[ruDate(x.c.ship)] = 1; ps[x.p.name] = 1; var ck = cmKey(x.p, x.o); if (!(ck in sh)) sh[ck] = finalShort(x.p, x.o); });
            var tsh = Object.keys(sh).reduce(function (a, k) { return a + sh[k]; }, 0);
            B.push([e.inv, d ? ruDate(d) : '', ++n, g.mat ? 'материал' : g.isDet ? 'деталь' : 'позиция', g.name, g.q || 0, g.mat ? Math.round(g.kg * 1000) / 1000 : '', Object.keys(st).join(', '), Object.keys(cs).join(', '), Object.keys(sp).join(', '), Object.keys(ps).length, g.items.length, Object.keys(ps).join(', '), tsh || '']);
          });
          (e.pend || []).forEach(function (x) { var P = x.L; B.push([e.inv, d ? ruDate(d) : '', ++n, 'ждёт (нет в заказах)', P.pos, P.qty || 0, '', CM_ST[P.st || ''] || '', P.cont || '', P.ship ? ruDate(P.ship) : '', '', '', '', '']); });
        });
        var buf = xlsxBuild([{ name: 'Инвойсы', rows: A, header: { 2: 1 }, freeze: 3, cols: [5, 18, 13, 22, 10, 10, 13, 26, 24, 18], border: function (r) { return r >= 2; } }, { name: 'Строки', rows: B, header: { 2: 1 }, freeze: 3, cols: [16, 13, 5, 18, 42, 12, 12, 18, 22, 16, 9, 8, 60, 12], border: function (r) { return r >= 2; } }]);
        saveBinary('Инвойсы_' + todayRu().replace(/\./g, '-') + '.xlsx', buf).then(function () { showMsg('Список инвойсов скачан в Excel (листы «Инвойсы» и «Строки»).', 'good'); }, function (er) { showMsg('Не скачалось: ' + esc(er.message || er), 'err'); });
      };
      modal.querySelectorAll('th.ivsort').forEach(function (t) { t.onclick = function () { var k = t.dataset.k; if (INV_SORT.k === k) INV_SORT.d = -INV_SORT.d; else INV_SORT = { k: k, d: /^(inv|cont)$/.test(k) ? 1 : -1 }; invListModal(); }; });
    }
    /* позиции инвойса: каждый комментарий правится прямо в строке (позиция, кол-во, статус, контейнер, деталь, отгрузка, текст) */
    var INV_OPEN = {};
    /* строки инвойса «что приходит»: одинаковая деталь (или позиция, если детали нет) — одна строка; материал — по материалу.
       Если у всех комментариев строки одно и то же кол-во — это одно кол-во, записанное в каждую ячейку (не сумма). */
    function invLineKey(x) { var c = x.c, m = cleanSp(c.mat || (c.mkg > 0 ? c.det : '') || ''); if (m) return 'M|' + m; return 'D|' + (cleanSp(c.det) || x.p.name).replace(/\s+/g, '').toUpperCase(); }
    function invLines(items) {
      var G = {}, go = [];
      items.forEach(function (x) { var k = invLineKey(x), g = G[k]; if (!g) { var m = k.charAt(0) === 'M'; g = G[k] = { k: k, mat: m ? k.slice(2) : '', name: m ? k.slice(2) : (cleanSp(x.c.det) || x.p.name), isDet: !m && !!cleanSp(x.c.det), items: [] }; go.push(k); } g.items.push(x); });
      /* одинаковое кол-во в нескольких ячейках (пустые не считаются) — это одно и то же кол-во, записанное в каждую ячейку: в итог идёт один раз */
      var nz = function (a) { return a.filter(function (v) { return v > 0; }); };
      var eq = function (a) { a = nz(a); return a.length > 1 && a.every(function (v) { return Math.abs(v - a[0]) < 1e-6; }); }, sum = function (a) { return a.reduce(function (s0, v) { return s0 + v; }, 0); };
      return go.map(function (k) {
        var g = G[k], qs = g.items.map(function (x) { return x.c.qty > 0 ? x.c.qty : 0; }), ks = g.items.map(function (x) { return x.c.mkg > 0 ? x.c.mkg : 0; });
        g.same = g.mat ? eq(ks) : eq(qs); g.nsame = nz(g.mat ? ks : qs).length;
        g.kg = g.mat ? (g.same ? nz(ks)[0] : sum(ks)) : 0; g.q = g.same ? (g.mat ? Math.max.apply(null, qs) : nz(qs)[0]) : sum(qs);
        return g;
      });
    }
    /* «Куда добавить» для готового инвойса: комментарии собираются по позиции (материал — по материалу), кол-во суммируется и заново раскладывается по заказам */
    function invWherePlan(inv, cfg, dist) {
      var e = invIndex()[inv]; if (!e) return [];
      var G = {}, go = [];
      e.items.forEach(function (x) {
        var c = x.c, m = cleanSp(c.mat || (c.mkg > 0 ? c.det : '') || '');
        var k = m ? 'M|' + m + '|' + (c.st || '') + '|' + (c.cont || '') : 'P|' + x.p.id + '|' + (c.det || '') + '|' + (c.st || '') + '|' + (c.cont || '') + '|' + (c.ship || '') + '|' + (c.text || '');
        var g = G[k]; if (!g) { g = G[k] = { k: k, mat: m, p: m ? null : x.p, c: c, items: [], q: 0, kg: 0 }; go.push(k); }
        g.items.push(x); g.q += c.qty > 0 ? c.qty : 0; g.kg += c.mkg > 0 ? c.mkg : 0;
      });
      return go.map(function (k) {
        var g = G[k], prs = [], cf = (cfg && cfg(k)) || { mode: 'keep', oid: '' }, mode = cf.mode, oid = cf.oid;
        g.mode = mode; g.oid = oid;
        if (mode === 'keep') { g.keep = ''; return g; }
        var flt = function (a) { return mode === 'short' ? pairsShort(a) : mode === 'prod' ? pairsShortProd(a) : a; };
        if (g.mat) {
          var mt = matFind(g.mat), KG = {}, ps = [];
          if (mt) mt.use.forEach(function (u) { if (u.kg > 0) { KG[u.p.id] = u.kg; ps.push(u.p); } });
          else g.items.forEach(function (x) { var ku = cmKgu(x.c, x.p); if (ku > 0 && !KG[x.p.id]) { KG[x.p.id] = ku; ps.push(x.p); } });
          QUEUE.forEach(function (o) { if (oid && o.id !== oid) return; ps.forEach(function (p) { if (R[p.id].cells[o.id]) prs.push([p, o]); }); });
          prs = flt(prs);
          if (!(g.kg > 0) || !prs.length) { g.keep = !(g.kg > 0) ? 'кг не указано' : 'нет подходящих ячеек'; return g; }
          var D = matDist(prs, KG, g.kg), PK = matPack(prs, D, KG), qs = prs.map(function () { return 0; }), mk = prs.map(function () { return 0; });
          PK.forEach(function (z) { qs[z.i] = z.q; mk[z.i] = z.kg; }); g.prs = prs; g.qs = qs; g.mk = mk; g.KG = KG; return g;
        }
        QUEUE.forEach(function (o) { if (oid && o.id !== oid) return; if (R[g.p.id].cells[o.id]) prs.push([g.p, o]); });
        prs = sidePairs(flt(prs), g.c.det);
        if (!prs.length) { g.keep = 'нет подходящих ячеек'; return g; }
        var q = g.q, qs = prs.map(function () { return dist ? 0 : q; });
        if (dist && q > 0) { var left = q, last = -1; prs.forEach(function (x, i) { var sh = finalShort(x[0], x[1]); if (left > 0 && sh > 0) { var t = Math.min(left, sh); qs[i] = t; left -= t; last = i; } }); if (left > 0) qs[last >= 0 ? last : 0] += left; }
        g.prs = prs; g.qs = qs; return g;
      });
    }
    var IW_MODES = [['keep', 'как сейчас'], ['all', 'во все заказы'], ['short', 'только где не хватает'], ['prod', 'не хватает + производимые']];
    function invWhereModal(inv, st0) {
      var S = st0 || { dist: true, rows: {}, gm: 'keep', go: '' };
      var cfg = function (k) { return S.rows[k] || { mode: S.gm, oid: S.go }; };
      var PL = invWherePlan(inv, cfg, S.dist);
      var cellTxt = function (L) { return L.map(function (z) { return '<span class="iwc">' + esc(z[0]) + ' <b>' + z[1] + '</b></span>'; }).join(''); };
      var nb = 0, na = 0, nch = 0;
      var rows = PL.map(function (g, gi) {
        var nm = g.mat ? '<span class="ivml">материал</span> <b>' + esc(g.mat) + '</b>' : '<b>' + esc(g.p.name) + '</b>' + (g.c.det ? '<div class="note">деталь ' + esc(g.c.det) + '</div>' : '');
        var before = g.items.map(function (x) { return [(g.mat ? x.p.name + ' · ' : '') + x.o.label, x.c.qty > 0 ? fmt(x.c.qty) : '—']; }); nb += g.items.length;
        var after;
        if (g.mode === 'keep') { after = '<span class="note">без изменений</span>'; na += g.items.length; }
        else if (g.keep) { after = '<span class="note">остаётся как есть — ' + esc(g.keep) + '</span>'; na += g.items.length; }
        else { nch++; var A = []; g.prs.forEach(function (x, i) { if ((g.mat ? g.kg > 0 : g.q > 0) && !(g.qs[i] > 0)) return; A.push([(g.mat ? x[0].name + ' · ' : '') + x[1].label, g.qs[i] > 0 ? fmt(g.qs[i]) : '—']); }); na += A.length; after = A.length ? cellTxt(A) : '<span class="note" style="color:var(--bad)">некуда добавить</span>'; }
        var ords = g.mat ? QUEUE : QUEUE.filter(function (o) { return R[g.p.id].cells[o.id]; });
        var sel = '<select class="iwm" data-g="' + gi + '">' + IW_MODES.map(function (m) { return '<option value="' + m[0] + '"' + (g.mode === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select>' +
          '<select class="iwo" data-g="' + gi + '"' + (g.mode === 'keep' ? ' disabled' : '') + '><option value="">все заказы</option>' + ords.map(function (o) { return '<option value="' + o.id + '"' + (g.oid === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>';
        return '<tr class="' + (g.mode !== 'keep' ? 'iwch' : '') + '"><td>' + nm + '</td><td class="n"><b>' + (g.mat ? fmtKg(g.kg) + ' кг' : (g.q ? fmt(g.q) + ' шт' : '—')) + '</b></td><td class="iwsel">' + sel + '</td><td>' + cellTxt(before) + '</td><td>' + after + '</td></tr>';
      }).join('');
      var sc = ov.classList.contains('on') && modal.querySelector('.iwt') ? (modal.querySelector('.scroll') || {}).scrollTop || 0 : 0;
      var h = head('Куда добавить — инвойс ' + esc(inv), 'для каждой позиции отдельно (колонка «Куда») или для всех сразу (верхняя строка); кол-во позиции суммируется и заново раскладывается по заказам; ячейки с 0 шт комментарий не получают');
      h += '<div class="invfoot" style="margin:0 0 8px"><div class="invmode"><b>Всем позициям:</b> ' + IW_MODES.map(function (m) { return '<label><input type="radio" name="iwM" value="' + m[0] + '"' + (S.gm === m[0] ? ' checked' : '') + '> ' + m[1] + '</label>'; }).join('') +
        '<label style="font-weight:700">заказ <select id="iwO"><option value="">все заказы</option>' + QUEUE.map(function (o) { return '<option value="' + o.id + '"' + (S.go === o.id ? ' selected' : '') + '>' + esc(o.label + ' · ' + o.client) + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="invdist" style="margin-top:6px"><input type="checkbox" id="iwD"' + (S.dist ? ' checked' : '') + '> Кол-во распределить по очереди заказов — сначала где не хватает (иначе каждой ячейке полное кол-во)</label></div>';
      h += '<div class="scroll" style="max-height:58vh"><table class="mini invt iwt"><tr><th>Позиция / материал</th><th class="n">Кол-во</th><th>Куда</th><th>Сейчас (заказ — шт)</th><th>Будет (заказ — шт)</th></tr>' + rows + '</table></div>';
      h += '<div class="row" style="display:flex;gap:8px;align-items:center;margin-top:8px"><button class="btn primary" id="iwGo"' + (nch ? '' : ' disabled') + '>Применить' + (nch ? ' (' + nch + ' поз.)' : '') + '</button><button class="btn" id="iwBack">← Назад в инвойс</button><span class="note" style="font-size:14px;font-weight:700">Меняется позиций: ' + nch + ' · ячеек сейчас: ' + nb + ' → будет: ' + na + '</span></div>';
      openModal(h + '</div>', true); modal.classList.add('xw');
      if (sc) modal.querySelector('.scroll').scrollTop = sc;
      var again = function () { invWhereModal(inv, S); };
      modal.querySelectorAll('input[name="iwM"]').forEach(function (r) { r.onchange = function () { S.gm = r.value; S.rows = {}; again(); }; });
      $('iwO').onchange = function () { S.go = $('iwO').value; Object.keys(S.rows).forEach(function (k) { S.rows[k].oid = S.go; }); again(); };
      $('iwD').onchange = function () { S.dist = $('iwD').checked; again(); };
      modal.querySelectorAll('select.iwm, select.iwo').forEach(function (f) { f.onchange = function () { var g = PL[+f.dataset.g], r = S.rows[g.k] || (S.rows[g.k] = { mode: g.mode, oid: g.oid }); if (f.classList.contains('iwm')) r.mode = f.value; else r.oid = f.value; again(); }; });
      $('iwBack').onclick = function () { invItemsModal(inv); };
      $('iwGo').onclick = function () {
        var P2 = invWherePlan(inv, cfg, S.dist), ts = Date.now(), del = {}, add = {}, pairs = {}, n = 0, ch = [];
        P2.forEach(function (g) {
          if (g.mode === 'keep' || g.keep) return; ch.push((g.mat || g.p.name) + ' → ' + { all: 'все заказы', short: 'где не хватает', prod: 'не хватает + произв.' }[g.mode] + (g.oid ? ' (' + O(g.oid).label + ')' : ''));
          g.items.forEach(function (x) { var k = cmKey(x.p, x.o); pairs[k] = [x.p, x.o]; (del[k] = del[k] || {})[String(x.c.ts || 0)] = 1; });
          g.prs.forEach(function (x, i) {
            if ((g.mat ? g.kg > 0 : g.q > 0) && !(g.qs[i] > 0)) return;
            var k = cmKey(x[0], x[1]); pairs[k] = x;
            var cc = Object.assign({}, g.c, { qty: g.qs[i] > 0 ? g.qs[i] : 0, ts: ts + n, ets: ts, eby: ME || '' });
            if (g.mat) { cc.mat = g.mat; cc.mkg = Math.round(g.mk[i] * 1e6) / 1e6; cc.kgu = g.KG[x[0].id] || 0; if (!cc.det) cc.det = g.mat; } else { delete cc.mkg; delete cc.kgu; }
            (add[k] = add[k] || []).push(cmClean(cc)); n++;
          });
        });
        var prs = Object.keys(pairs).map(function (k) { return pairs[k]; });
        if (!prs.length) { showMsg('Нечего менять.', 'err'); return; }
        cmSaveMany(prs, function (L, p, o) { var d = del[cmKey(p, o)] || {}; return L.filter(function (c) { return !(cleanSp(c.inv) === inv && d[String(c.ts || 0)]); }).concat(add[cmKey(p, o)] || []); },
          'Инвойс ' + inv + ': куда добавить — ' + ch.slice(0, 5).join('; ') + (ch.length > 5 ? ' и ещё ' + (ch.length - 5) : '') + ' (' + n + ' коммент.)').then(function () {
            render(); showMsg('Инвойс <b>' + esc(inv) + '</b>: изменено позиций ' + ch.length + ', комментариев ' + n + '. Вернуть — ↶ Отменить.', 'good'); invItemsModal(inv);
          });
      };
    }
    /* строка инвойса, позиции которой нет в заказах: сохранить и сразу попробовать добавить (позиция / материал могли найтись) */
    function invPendSave(inv, id, nl, back) {
      return invpSet(id, nl, 'Инвойс ' + inv + ': строка ' + nl.pos).then(function () { return invPendingApply(true); }).then(function (n) {
        render(); if (n) showMsg('Позиция <b>' + esc(nl.pos) + '</b> найдена в заказах — добавлено комментариев: ' + n + '.', 'good'); (back || function () { invItemsModal(inv); })(n);
      });
    }
    function matTok(v) { return cleanSp(v).toLowerCase().replace(/ё/g, 'е').replace(/[хx×*]/g, 'x').replace(/,/g, '.').split(/[\s()]+/).map(function (t) { return t.replace(/мм$/, ''); }).filter(function (t) { return t && t !== 'd' && t !== 'мм'; }); }
    function matSimilar(v, n) {
      var T = matTok(v), M = matUse(); if (!T.length) return [];
      return Object.keys(M).map(function (k) { var nn = M[k].n, sc = 0; T.forEach(function (t) { if (nn.indexOf(t) >= 0) sc++; }); return { m: M[k], sc: sc }; })
        .filter(function (x) { return x.sc >= Math.min(2, T.length); }).sort(function (a, b) { return b.sc - a.sc || b.m.use.length - a.m.use.length; }).slice(0, n || 6).map(function (x) { return x.m; });
    }
    /* окно строки в ожидании: «!» — позиции нет в заказах; данные строки, похожие материалы / позиции */
    function invPendModal(inv, id) {
      var L = OV.invp[id]; if (!L) { invItemsModal(inv); return; }
      var W = CAN_WRITE, mt = invRowPositions(L.pos).length ? null : matFind(L.pos), sim = mt ? [] : matSimilar(L.pos, 8), oo = L.oid ? O(L.oid) : null;
      var h = head('<b class="pbang">!</b> ' + esc(L.pos), 'инвойс ' + esc(inv) + ' · позиции нет в заказах');
      h += '<div class="fbar"><button class="btn sm" id="ipBack">← Назад в инвойс ' + esc(inv) + '</button><span class="sp"></span>' + (W ? '<button class="btn sm" id="ipDel">✕ Убрать из инвойса</button>' : '') + '</div>';
      h += '<div class="pwait"><b class="pbang">!</b><div>' + (mt ? 'Материал <b>' + esc(mt.name) + '</b> найден в составе, но позиций с ним сейчас нет в подходящих заказах.' : 'Позиции <b>' + esc(L.pos) + '</b> нет в заказах' + (sim.length ? ' и такого материала нет в составе позиций' : '') + '.') + ' Строка хранится в инвойсе и добавится в комментарии сама, когда позиция появится в заказах (после «Обновить базу» или «АНАЛИЗ»).</div></div>';
      var fI = function (f, v, t, ex) { return W ? '<input class="ipf" data-f="' + f + '"' + (t ? ' type="' + t + '"' : '') + ' value="' + esc(v || '') + '"' + (ex || '') + '>' : '<b>' + esc(t === 'date' && v ? ruDate(v) : (v || '—')) + '</b>'; };
      if (W) { var MU0 = matUse(), rts = {}; OOR.positions.forEach(function (q) { rts[nameGroup(q.name)] = 1; }); h += '<datalist id="ipPL">' + Object.keys(rts).sort().map(function (r) { return '<option value="' + esc(r) + '" label="корень">'; }).join('') + OOR.positions.map(function (q) { return '<option value="' + esc(q.name) + '">'; }).join('') + Object.keys(MU0).sort().map(function (k) { return '<option value="' + esc(MU0[k].name) + '" label="материал">'; }).join('') + '</datalist>' + cmKnownList(cmKnown().C, 'ipCL', function (b) { return b.inv ? 'инв. ' + b.inv : ''; }); }
      h += '<table class="mini invt ipt">' + (W ? '<tr><th>Позиция / материал</th><td>' + fI('pos', L.pos, '', ' list="ipPL" style="width:420px"') + '</td></tr>' : '') + '<tr><th>Кол-во' + (mt ? ', кг' : '') + '</th><td>' + (W ? fI('qty', L.qty > 0 ? L.qty : '', 'number', ' min="0" step="any"') : '<b>' + (L.qty > 0 ? fmt(L.qty) + (mt ? ' кг' : ' шт') : '—') + '</b>') + '</td></tr><tr><th>Статус</th><td>' + (W ? '<select class="ipf" data-f="st">' + Object.keys(CM_ST).map(function (k) { return '<option value="' + k + '"' + ((L.st || '') === k ? ' selected' : '') + '>' + esc(CM_ST[k]) + '</option>'; }).join('') + '</select>' : cmChip(L.st)) + '</td></tr><tr><th>Контейнер</th><td>' + fI('cont', L.cont, '', ' list="ipCL"') + '</td></tr><tr><th>Деталь</th><td>' + fI('det', L.det) + '</td></tr><tr><th>Отгрузка</th><td>' + fI('ship', L.ship, 'date') + '</td></tr><tr><th>Комментарий</th><td>' + fI('text', L.text, '', ' style="width:420px"') + '</td></tr><tr><th>Куда</th><td>' + ({ all: 'во все заказы позиции', short: 'только где не хватает', prod: 'не хватающие и производимые' }[L.mode] || '—') + (oo ? ' · заказ ' + esc(oo.label) : '') + (L.dist ? ' · распределить по очереди' : '') + '</td></tr><tr><th>Добавлено</th><td class="note">' + (L.ts ? esc(nowStr(L.ts)) + ' · ' + esc(whoName(L.by)) : '') + '</td></tr></table>';
      if (sim.length) h += '<h3 class="iph">Похожие материалы в составе позиций' + (W ? ' — выберите, если это он' : '') + '</h3><table class="mini invt"><tr><th>Материал</th><th class="n">позиций</th><th>где используется</th><th></th></tr>' + sim.map(function (m, i) { return '<tr><td><b>' + esc(m.name) + '</b></td><td class="n">' + m.use.length + '</td><td class="note">' + esc(m.use.slice(0, 4).map(function (u) { return u.p.name; }).join(', ') + (m.use.length > 4 ? ' …' : '')) + '</td><td>' + (W ? '<button class="btn sm pri ipPick" data-i="' + i + '">Это он</button>' : '') + '</td></tr>'; }).join('') + '</table>';
      openModal(h + '</div>', true);
      $('ipBack').onclick = function () { invItemsModal(inv); };
      if ($('ipDel')) $('ipDel').onclick = function () { var b = $('ipDel'); if (!b.dataset.sure) { b.dataset.sure = 1; b.classList.add('sure'); b.textContent = 'Точно убрать? — нажмите ещё раз'; return; } invpSet(id, null, 'строка убрана').then(function () { render(); invItemsModal(inv); }); };
      modal.querySelectorAll('.ipPick').forEach(function (b) { b.onclick = function () { var m = sim[+b.dataset.i]; invPendSave(inv, id, Object.assign({}, L, { pos: m.name, det: L.det || m.name })); }; });
      modal.querySelectorAll('.ipf').forEach(function (f) {
        if (f.tagName === 'INPUT') f.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); f.blur(); } };
        f.onchange = function () {
          var L0 = OV.invp[id]; if (!L0) return; var v = f.value, fl = f.dataset.f; if (fl === 'qty') { v = parseFloat(String(v).replace(',', '.')); v = v > 0 ? v : 0; } else if (fl !== 'st' && fl !== 'ship') v = cleanSp(v); if ((L0[fl] || (fl === 'qty' ? 0 : '')) === v) return; var nl = Object.assign({}, L0); nl[fl] = v;
          invPendSave(inv, id, nl, function (n) { if (n || !OV.invp[id]) invItemsModal(inv); else { invPendModal(inv, id); showMsg('Сохранено.', 'good'); } });
        };
        dateSafe(f);
      });
    }
    /* название инвойса — ссылка: нажатие открывает инвойс со списком позиций */
    function invLink(inv) { inv = cleanSp(inv); return inv ? '<b class="invlk" data-inv="' + esc(inv) + '" title="Открыть инвойс">' + esc(inv) + '</b>' : ''; }
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.invlk'); if (!a) return;
      e.preventDefault(); e.stopPropagation();
      cmPop.hidden = true; cmTip.hidden = true; if (typeof ordTipHide === 'function') ordTipHide();
      invItemsModal(a.dataset.inv);
    }, true);
    /* удалить строки инвойса (комментарии) */
    function invDelItems(inv, items, what) {
      if (!items.length || !CAN_WRITE) return Promise.resolve(0);
      var by = {}, del = {}; items.forEach(function (x) { var k = cmKey(x.p, x.o); by[k] = [x.p, x.o]; (del[k] = del[k] || {})[String(x.c.ts || 0)] = 1; });
      var n = 0, pairs = Object.keys(by).map(function (k) { return by[k]; });
      return cmSaveMany(pairs, function (L, p, o) { var d = del[cmKey(p, o)] || {}; return L.filter(function (c) { var hit = cleanSp(c.inv) === inv && d[String(c.ts || 0)]; if (hit) n++; return !hit; }); }, 'Инвойс ' + inv + ': удалено (' + what + ') — ' + items.length + ' коммент.').then(function () { render(); return n; });
    }
    /* строка инвойса: всего шт → по ячейкам строки (по очереди заказов, сначала где не хватает; остаток — в последнюю ячейку с нехваткой, иначе в первую) */
    function invLineDist(inv, items, q) {
      var I = items.slice().sort(function (a, b) { return QUEUE.indexOf(a.o) - QUEUE.indexOf(b.o); }), used = {}, qs = I.map(function () { return 0; }), left = q, last = -1;
      I.forEach(function (x, i) { var ck = cmKey(x.p, x.o), sh = Math.max(0, finalShort(x.p, x.o) - (used[ck] || 0)); if (left > 0 && sh > 0) { var t = Math.min(left, sh); qs[i] = t; left -= t; used[ck] = (used[ck] || 0) + t; last = i; } });
      if (left > 0 && I.length) qs[last >= 0 ? last : 0] += left;
      var set = {}, by = {}, ts = Date.now();
      I.forEach(function (x, i) { var ck = cmKey(x.p, x.o); by[ck] = [x.p, x.o]; (set[ck] = set[ck] || {})[String(x.c.ts || 0)] = qs[i]; });
      var n = 0;
      return cmSaveMany(Object.keys(by).map(function (k) { return by[k]; }), function (L, p, o) { var S = set[cmKey(p, o)] || {}; return L.map(function (c) { var v = cleanSp(c.inv) === inv ? S[String(c.ts || 0)] : undefined; if (v === undefined) return c; if (v > 0) n++; return Object.assign({}, c, { qty: v, ets: ts, eby: ME || '' }); }); }, 'Инвойс ' + inv + ': строка — ' + fmt(q) + ' шт разложено по ' + I.length + ' ячейкам').then(function () { render(); return n; });
    }
    /* ✎ строка / материал инвойса: изменить сразу во всех её комментариях */
    function invLineModal(inv, key) {
      var e = invIndex()[inv]; if (!e) { invListModal(); return; }
      var g = invLines(e.items).filter(function (x) { return x.k === key; })[0]; if (!g) { invItemsModal(inv); return; }
      var com = function (f) { var v = null, diff = false; g.items.forEach(function (x) { var y = x.c[f] || ''; if (v === null) v = y; else if (v !== y) diff = true; }); return diff ? null : (v || ''); };
      var F = { st: com('st'), cont: com('cont'), ship: com('ship'), text: com('text') };
      var nmList = g.mat ? Object.keys(matUse()).sort().map(function (k) { return [matUse()[k].name, 'материал — позиций ' + matUse()[k].use.length]; }) : cmDetNames(g.items.map(function (x) { return [x.p, x.o]; }).slice(0, 20));
      var dif = function (f) { return F[f] === null ? ' placeholder="разные — не менять"' : ''; };
      var h = head('✎ ' + (g.mat ? 'Материал' : g.isDet ? 'Деталь' : 'Позиция') + ': ' + esc(g.name), 'инвойс ' + esc(inv) + ' · комментариев ' + g.items.length + ' — изменения применяются ко всем комментариям этой строки');
      h += '<div class="cmf ilf"><label class="wide2">' + (g.mat ? 'Материал' : 'Деталь (что приходит)') + '<input id="ilN" list="ilNL" value="' + esc(g.mat || (g.isDet ? g.name : '')) + '"' + (g.isDet || g.mat ? '' : ' placeholder="деталь не указана — ' + esc(g.name) + '"') + '><datalist id="ilNL">' + nmList.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[1] ? ' label="' + esc(x[1]) + '"' : '') + '>'; }).join('') + '</datalist></label>' +
        (g.mat ? '<label>Всего, кг<input id="ilK" type="number" min="0" step="any" value="' + (g.kg > 0 ? Math.round(g.kg * 1000) / 1000 : '') + '"></label>' : '<label>Всего, шт<input id="ilQ" type="number" min="0" step="any" value="' + (g.q || '') + '">' + (g.same ? '<span class="note">сейчас в ' + g.nsame + ' ячейках по ' + fmt(g.q) + '</span><span class="note" style="display:flex;gap:4px;align-items:center;font-weight:700"><input type="checkbox" id="ilSp" style="width:auto"> разложить по ячейкам (сначала где не хватает)</span>' : '') + '</label>') +
        '<label>Статус<select id="ilS">' + (F.st === null ? '<option value="*" selected>разные — не менять</option>' : '') + Object.keys(CM_ST).map(function (k) { return '<option value="' + k + '"' + (F.st === k ? ' selected' : '') + '>' + esc(CM_ST[k]) + '</option>'; }).join('') + '</select></label>' +
        '<label>Контейнер<input id="ilC" list="ilCL" value="' + esc(F.cont || '') + '"' + dif('cont') + '>' + cmKnownList(cmKnown().C, 'ilCL', function (b) { return b.inv ? 'инв. ' + b.inv : ''; }) + '</label>' +
        '<label>Отгрузка<input id="ilD" type="date" value="' + esc(F.ship || '') + '"></label>' +
        '<label class="wide">Комментарий<input id="ilT" value="' + esc(F.text || '') + '"' + dif('text') + '></label></div>';
      h += '<p class="note" id="ilNote" style="font-size:13px;font-weight:700"></p>';
      h += '<div class="row" style="display:flex;gap:8px"><button class="btn primary" id="ilGo">Сохранить</button><button class="btn" id="ilBack">← Назад в инвойс</button></div>';
      openModal(h + '</div>', true);
      var note = function () {
        var nm = cleanSp($('ilN').value), t = '';
        if (g.mat) {
          var mt = nm && nm !== g.mat ? matFind(nm) : null, kg = parseFloat(String($('ilK').value).replace(',', '.')) || 0;
          if (nm && nm !== g.mat) t = mt ? 'Новый материал найден в составе: позиций ' + mt.use.length + ' — ' + fmtKg(kg) + ' кг будут разложены заново по его позициям (сначала где не хватает).' : '<span style="color:var(--bad)">Такого материала нет в составе — будет только переименован, кг/шт останутся прежними.</span>';
          else if (Math.abs(kg - g.kg) > 1e-6) t = fmtKg(kg) + ' кг будут разложены заново по ячейкам строки (сначала где не хватает).';
        }
        else { var q = parseFloat(String($('ilQ').value).replace(',', '.')) || 0; if (q !== (g.q || 0) || ($('ilSp') && $('ilSp').checked)) t = fmt(q) + ' шт будут разложены по ' + g.items.length + ' ячейкам строки (по очереди, сначала где не хватает).'; }
        $('ilNote').innerHTML = t;
      };
      ['ilN', g.mat ? 'ilK' : 'ilQ', 'ilSp'].forEach(function (id) { if (!$(id)) return; $(id).addEventListener('input', note); $(id).addEventListener('change', note); });
      $('ilBack').onclick = function () { invItemsModal(inv); };
      $('ilGo').onclick = function () {
        var nm = cleanSp($('ilN').value), st = $('ilS').value, cont = cleanSp($('ilC').value), ship = $('ilD').value, text = cleanSp($('ilT').value), ts = Date.now();
        var upd = {}; if (st !== '*') upd.st = st;
        if (F.cont !== null || cont) upd.cont = cont; if (F.ship !== null || ship) upd.ship = ship; if (F.text !== null || text) upd.text = text;
        var done = function (msg) { render(); showMsg(msg, 'good'); invItemsModal(inv); };
        if (g.mat) {
          var kg = parseFloat(String($('ilK').value).replace(',', '.')) || 0, chN = nm && nm !== g.mat, mt = chN ? matFind(nm) : null;
          if (mt && kg > 0) {
            var KG = {}, prs = []; mt.use.forEach(function (u) { if (u.kg > 0) KG[u.p.id] = u.kg; });
            QUEUE.forEach(function (o) { mt.use.forEach(function (u) { if (u.kg > 0 && R[u.p.id].cells[o.id]) prs.push([u.p, o]); }); });
            var D = matDist(prs, KG, kg), del = {}, add = {}, pairs = {}, n = 0, base = Object.assign({}, g.items[0].c, upd);
            g.items.forEach(function (x) { var k = cmKey(x.p, x.o); pairs[k] = [x.p, x.o]; (del[k] = del[k] || {})[String(x.c.ts || 0)] = 1; });
            matPack(prs, D, KG).forEach(function (z) { var x = prs[z.i], k = cmKey(x[0], x[1]); pairs[k] = x; var cc = Object.assign({}, base, { mat: mt.name, det: mt.name, qty: z.q, mkg: Math.round(z.kg * 1e6) / 1e6, kgu: KG[x[0].id], ts: ts + n, ets: ts, eby: ME || '' }); (add[k] = add[k] || []).push(cmClean(cc)); n++; });
            cmSaveMany(Object.keys(pairs).map(function (k) { return pairs[k]; }), function (L, p, o) { var d = del[cmKey(p, o)] || {}; return L.filter(function (c) { return !(cleanSp(c.inv) === inv && d[String(c.ts || 0)]); }).concat(add[cmKey(p, o)] || []); }, 'Инвойс ' + inv + ': материал ' + g.mat + ' → ' + mt.name + ', ' + fmtKg(kg) + ' кг').then(function () { done('Материал заменён на <b>' + esc(mt.name) + '</b>: ' + fmtKg(kg) + ' кг разложены по ' + n + ' ячейкам.'); });
            return;
          }
          var after = function () { if (!chN && Math.abs(kg - g.kg) > 1e-6 && kg > 0) return invMatDist(inv, g.mat, invLines(invIndex()[inv].items).filter(function (x) { return x.k === key; })[0].items, kg); return Promise.resolve(); };
          if (chN) { upd.mat = nm; }
          invLineSet(inv, g.items, function (c) { var nc = Object.assign({}, c, upd); if (chN && (!c.det || cleanSp(c.det) === g.mat)) nc.det = nm; return nc; }, 'материал ' + g.mat).then(after).then(function () { done('Материал <b>' + esc(nm || g.mat) + '</b> изменён.'); });
          return;
        }
        var q = parseFloat(String($('ilQ').value).replace(',', '.')) || 0, chD = nm !== (g.isDet ? g.name : ''), spread = !!($('ilSp') && $('ilSp').checked);
        invLineSet(inv, g.items, function (c) { var nc = Object.assign({}, c, upd); if (chD) nc.det = nm; return nc; }, 'строка ' + g.name).then(function () {
          if ((q !== (g.q || 0) || spread) && q > 0) { var e2 = invIndex()[inv], k2 = invLines(e2.items).map(function (x) { return x; }), ts0 = {}; g.items.forEach(function (x) { ts0[String(x.c.ts || 0)] = 1; }); var its = e2.items.filter(function (x) { return ts0[String(x.c.ts || 0)]; }); return invLineDist(inv, its, q); }
        }).then(function () { done('Строка <b>' + esc(nm || g.name) + '</b> изменена.'); });
      };
    }
    function invLineSet(inv, items, fn, what) {
      var by = {}, ts0 = {}, ts = Date.now(); items.forEach(function (x) { var k = cmKey(x.p, x.o); by[k] = [x.p, x.o]; (ts0[k] = ts0[k] || {})[String(x.c.ts || 0)] = 1; });
      return cmSaveMany(Object.keys(by).map(function (k) { return by[k]; }), function (L, p, o) { var d = ts0[cmKey(p, o)] || {}; return L.map(function (c) { if (cleanSp(c.inv) !== inv || !d[String(c.ts || 0)]) return c; return cmClean(Object.assign(fn(c), { ets: ts, eby: ME || '' })); }); }, 'Инвойс ' + inv + ': изменено — ' + what + ' (' + items.length + ' коммент.)').then(function () { render(); });
    }
    function invDelete(inv) {
      var e = invIndex()[inv]; if (!e || !CAN_WRITE) return Promise.resolve(0);
      var pj = (e.pend || []).map(function (x) { return invpSet(x.id, null, 'инвойс удалён'); });
      var by = {}; e.items.forEach(function (x) { by[cmKey(x.p, x.o)] = [x.p, x.o]; });
      var pairs = Object.keys(by).map(function (k) { return by[k]; }), n = 0;
      var pr = pairs.length ? cmSaveMany(pairs, function (L) { return L.filter(function (c) { var hit = cleanSp(c.inv) === inv; if (hit) n++; return !hit; }); }, 'Инвойс ' + inv + ' удалён — ' + e.items.length + ' коммент. в ' + pairs.length + ' ячейках') : Promise.resolve();
      return pr.then(function () { return Promise.all(pj); }).then(function () { render(); return n; });
    }
    /* материал инвойса: всего кг → шт по ячейкам (как при добавлении: сначала нехватка, остаток по заказанному кол-ву) */
    function invMatDist(inv, m, items, kq) {
      var KG = {}, nok = 0; items.forEach(function (x) { var k = cmKgu(x.c, x.p); if (k > 0) KG[x.p.id] = k; else nok++; });
      var prs = items.map(function (x) { return [x.p, x.o]; }), D = matDist(prs, KG, kq), set = {}, by = {}, q = 0;
      items.forEach(function (x, i) { var k = cmKey(x.p, x.o); by[k] = [x.p, x.o]; if (!KG[x.p.id]) return; (set[k] = set[k] || {})[String(x.c.ts || 0)] = { qty: D.mq[i], mkg: Math.round(D.mk[i] * 1e6) / 1e6, kgu: KG[x.p.id] }; q += D.mq[i]; });
      var ts = Date.now(), pairs = Object.keys(by).map(function (k) { return by[k]; }), n = 0;
      return cmSaveMany(pairs, function (L, p, o) { var S = set[cmKey(p, o)] || {}; return L.map(function (c) { var v = cleanSp(c.inv) === inv ? S[String(c.ts || 0)] : null; if (!v) return c; n++; return cmClean(Object.assign({}, c, v, { mat: c.mat || m, ets: ts, eby: ME || '' })); }); }, 'Инвойс ' + inv + ': материал ' + m + ' — ' + fmtQ(kq) + ' кг → ' + fmt(q) + ' шт (' + items.length + ' ячеек)').then(function () { render(); return { n: n, q: q, nok: nok }; });
    }
    function invItemsModal(inv) {
      var M = invIndex(), e = M[inv]; if (!e) { invListModal(); return; }
      var sc = ov.classList.contains('on') && modal.dataset.inv === inv ? (modal.querySelector('.scroll') || {}).scrollTop || 0 : 0;
      var cur = invStatus(e), it = e.items.slice().sort(function (a, b) { return QUEUE.indexOf(a.o) - QUEUE.indexOf(b.o) || a.p.name.localeCompare(b.p.name, 'ru', { numeric: true }); });
      var K = cmKnown(), W = CAN_WRITE;
      var h = head('Инвойс ' + esc(inv), (invDate(e) ? 'от ' + esc(ruDate(invDate(e))) + ' · ' : '') + 'позиций ' + Object.keys(e.ps).length + ' · заказов ' + Object.keys(e.os).length + ' · комментариев ' + e.items.length + (e.qty ? ' · ' + fmt(e.qty) + ' шт' : '') + (Object.keys(e.cont).length ? ' · контейнер ' + Object.keys(e.cont).join(', ') : ''));
      h += '<div class="fbar"><button class="btn sm" id="ivBack">← Все инвойсы</button>' + (W ? '<button class="btn sm pri" id="ivMore">＋ Добавить позиции</button><button class="btn sm" id="ivWhere" title="Куда добавлены комментарии: во все заказы / только где не хватает / не хватающие и производимые — пересчитать для всего инвойса">⇄ Куда добавить</button><span class="ivnh" id="ivRenH"><button class="btn sm" id="ivRen">✎ Переименовать</button></span><label style="display:flex;align-items:center;gap:6px;font-weight:800">Статус инвойса ' + invStSelect(inv, cur) + '</label><label style="display:flex;align-items:center;gap:6px;font-weight:800" title="Контейнер для всех строк инвойса (если у инвойса разные контейнеры — только для строк без контейнера)">Контейнер <input class="invcont" list="ivCL2" data-inv="' + esc(inv) + '" value="' + esc(Object.keys(e.cont).length === 1 ? Object.keys(e.cont)[0] : '') + '" placeholder="' + (Object.keys(e.cont).length > 1 ? 'разные — для строк без контейнера' : 'не указан') + '"></label><label style="display:flex;align-items:center;gap:6px;font-weight:800">Дата инвойса <input type="date" class="invdate" data-inv="' + esc(inv) + '" value="' + esc(invDate(e)) + '"></label>' : (invDate(e) ? '<b>Дата инвойса ' + esc(ruDate(invDate(e))) + '</b>' : '')) + '<span class="sp"></span>' + (W ? '<button class="btn sm ivdinv" id="ivDel" title="Удалить инвойс: все его комментарии во всех позициях и заказах">🗑 Удалить инвойс</button>' : '') + '<button class="btn sm" id="ivXls"><svg class="ic" aria-hidden="true"><use href="#i-save"/></svg>Скачать Excel</button></div>';
      h += '<datalist id="ivCL2">' + Object.keys(K.C).map(function (k) { return '<option value="' + esc(k) + '">'; }).join('') + '</datalist>';
      var matOf = function (c) { return cleanSp(c.mat || (c.mkg > 0 ? c.det : '') || ''); };
      var G = {}, gOrd = [], plain = [];
      it.forEach(function (x) { var m = matOf(x.c); if (m) { if (!G[m]) { G[m] = []; gOrd.push(m); } G[m].push(x); } else plain.push(x); });
      var NC = W ? 11 : 10, rn = 0;
      var LN = 0; /* порядковый номер строки инвойса (материал / деталь / позиция / ожидание); комментарии внутри — N.1, N.2 … */
      var noTd = function () { return '<td class="n ivno">' + (++LN) + '</td>'; };
      var rowH = function (x, cls, gm, lbl) {
        var c = x.c, sh = finalShort(x.p, x.o), n = rn++, id = ' data-p="' + x.p.id + '" data-o="' + x.o.id + '" data-ts="' + (c.ts || 0) + '" data-i="' + x.i + '"' + (gm ? ' data-m="' + esc(gm) + '"' : '') + (cls && gm && !INV_OPEN[inv + '|' + gm] ? ' hidden' : '');
        var kgN = c.mkg > 0 || gm ? '<div class="note kgn">' + (c.mkg > 0 ? cmKgTxt(c, x.p) : (cmKgu(c, x.p) > 0 ? fmtQ(cmKgu(c, x.p)) + ' кг/шт' : '')) + '</div>' : '';
        var posOpts = OOR.positions.filter(function (q) { return R[q.id].cells[x.o.id]; }).map(function (q) { return '<option value="' + q.id + '"' + (q.id === x.p.id ? ' selected' : '') + '>' + esc(q.name) + '</option>'; }).join('');
        if (!W) return '<tr class="go2 ivi ' + (cls || '') + '"' + id + '><td class="n ivsub">' + (lbl || (n + 1)) + '</td><td>' + esc(x.o.label) + '</td><td class="ivpos"><b>' + esc(x.p.name) + '</b>' + eyeBtn(x.p.id, x.o.id) + '</td><td class="n"><b>' + (c.qty > 0 ? fmt(c.qty) : '') + '</b>' + kgN + '</td><td>' + cmChip(c.st) + '</td><td>' + esc(c.cont || '') + '</td><td>' + esc(c.det || '') + '</td><td>' + (c.ship ? esc(ruDate(c.ship)) : '') + '</td><td>' + esc(c.text || '') + '</td><td class="n"><b>' + (sh > 0 ? fmt(sh) : '—') + '</b></td></tr>';
        return '<tr class="ivi ' + (cls || '') + '"' + id + ' style="border-left:4px solid ' + CM_COL[c.st || ''] + '"><td class="n ivsub">' + (lbl || (n + 1)) + '</td><td><select class="ive-f ivord" data-f="ord" title="Заказ — перенести комментарий в другой заказ этой позиции">' + QUEUE.filter(function (q) { return R[x.p.id].cells[q.id]; }).map(function (q) { return '<option value="' + q.id + '"' + (q.id === x.o.id ? ' selected' : '') + '>' + esc(q.label) + '</option>'; }).join('') + '</select></td>' +
          '<td class="ivpos"><select class="ive-f" data-f="pos">' + posOpts + '</select>' + eyeBtn(x.p.id, x.o.id) + '<button class="btn sm ive-open" title="Открыть окно позиции">↗</button></td>' +
          '<td class="n"><input class="ive-f n" data-f="qty" type="number" min="0" step="any" value="' + (c.qty > 0 ? c.qty : '') + '" title="шт">' + kgN + '</td>' +
          '<td><select class="ive-f" data-f="st">' + Object.keys(CM_ST).map(function (k) { return '<option value="' + k + '"' + ((c.st || '') === k ? ' selected' : '') + '>' + esc(CM_ST[k]) + '</option>'; }).join('') + '</select></td>' +
          '<td><input class="ive-f" data-f="cont" list="ivCL2" value="' + esc(c.cont || '') + '"></td>' +
          '<td><input class="ive-f" data-f="det" list="ivDL' + n + '" value="' + esc(c.det || '') + '" title="' + esc(c.det || '') + '">' + cmDetList(cmDetNames([[x.p, x.o]]), 'ivD' + n).replace('id="cmELivD' + n + '"', 'id="ivDL' + n + '"') + '</td>' +
          '<td><input class="ive-f" data-f="ship" type="date" value="' + esc(c.ship || '') + '"></td>' +
          '<td><input class="ive-f wide" data-f="text" value="' + esc(c.text || '') + '"></td>' +
          '<td class="n" style="color:' + (sh > 0 ? 'var(--bad)' : 'inherit') + '"><b>' + (sh > 0 ? fmt(sh) : '—') + '</b></td>' +
          '<td><button class="btn sm ivdel" title="Удалить строку (комментарий) из инвойса">✕</button></td></tr>';
      };
      /* строки инвойса — как обычная таблица: каждое значение в своей колонке; нажатие — комментарии по ячейкам */
      var uniq = function (L, f) { var o = {}; L.forEach(function (x) { var v = f(x); if (v) o[v] = 1; }); return Object.keys(o); };
      var lineRow = function (k, L, o) {
        var op = !!INV_OPEN[inv + '|' + k], ords = uniq(L, function (x) { return x.o.label; }), ps = uniq(L, function (x) { return x.p.name; }), sh = 0, cells = {};
        L.forEach(function (x) { var ck = cmKey(x.p, x.o); if (!cells[ck]) { cells[ck] = 1; sh += finalShort(x.p, x.o); } });
        var sts = uniq(L, function (x) { return x.c.st || ''; }), cs = uniq(L, function (x) { return x.c.cont; }), sp = uniq(L, function (x) { return x.c.ship ? ruDate(x.c.ship) : ''; }), tx = uniq(L, function (x) { return x.c.text; });
        var rt = ps.map(function (n) { return nameGroup(n); }), posTxt = ps.length === 1 ? esc(ps[0]) : (rt.every(function (r) { return r === rt[0]; }) ? '<b>' + esc(rt[0]) + '</b>' : '') + ' <span class="lnn">позиций ' + ps.length + '</span>';
        return '<tr class="ivmat ivL' + (o.cls ? ' ' + o.cls : '') + '" data-m="' + esc(k) + '">' + noTd() +
          '<td class="lnord"><button class="ivmt" title="Показать комментарии по ячейкам">' + (op ? '▾' : '▸') + '</button> ' + (ords.length === 1 ? esc(ords[0]) : '<span class="lnn">заказов ' + ords.length + '</span>') + '</td>' +
          '<td class="lnpos">' + posTxt + '</td>' +
          '<td class="n lnq"><b>' + (o.q ? fmt(o.q) : '—') + '</b>' + (o.qs ? '<div class="lnn">' + o.qs + '</div>' : '') + '</td>' +
          '<td>' + sts.map(function (z) { return cmChip(z); }).join(' ') + '</td>' +
          '<td>' + esc(cs.join(', ')) + '</td>' +
          '<td class="lndet">' + (o.det ? '<b>' + esc(o.det) + '</b>' + (o.tag ? ' <span class="lnn">' + o.tag + '</span>' : '') : '') + '</td>' +
          '<td>' + esc(sp.join(', ')) + '</td>' +
          '<td class="lntx">' + esc(tx.length === 1 ? tx[0] : tx.length ? 'разные' : '') + '</td>' +
          '<td class="n" style="color:' + (sh > 0 ? 'var(--bad)' : 'inherit') + '"><b>' + (sh > 0 ? fmt(sh) : '—') + '</b></td>' +
          (W ? '<td class="lnact"><button class="ivic ivled" data-k="' + esc(o.ek || k) + '" title="Изменить строку">✎</button><button class="ivic ' + o.delCls + '" title="Удалить строку из инвойса (все её комментарии)">✕</button></td>' : '') + '</tr>';
      };
      var body = gOrd.map(function (m) {
        var L = G[m], kg = 0, q = 0; L.forEach(function (x) { kg += x.c.mkg > 0 ? x.c.mkg : 0; q += x.c.qty > 0 ? x.c.qty : 0; });
        var ln = invLines(L)[0] || {}, isMat = !!matFind(m);
        var hh = lineRow(m, L, { q: ln.q != null ? ln.q : q, qs: (ln.kg || kg) > 0 ? fmtKg(ln.kg || kg) + ' кг' : '<span style="color:var(--bad)">кг не указано</span>', det: m, tag: isMat ? 'материал' : 'в кг', delCls: 'ivmdel', cls: 'ivLm', ek: 'M|' + m });
        var no0 = LN; return hh + L.map(function (x, j) { return rowH(x, 'ivmc', m, no0 + '.' + (j + 1)); }).join('');
      }).join('');
      var pend = e.pend || [];
      /* строки, позиций которых нет в заказах: «!» — та же строка таблицы; нажатие — окно строки */
      var pendH = pend.map(function (x) {
        var L = x.L, mt = invRowPositions(L.pos).length ? null : matFind(L.pos), oo = L.oid ? O(L.oid) : null;
        return '<tr class="ivmat ivpd" data-id="' + esc(x.id) + '" title="Позиции нет в заказах — строка в инвойсе, добавится в комментарии, когда позиция появится в заказах. Нажмите — открыть">' + noTd() +
          '<td class="lnord"><b class="pbang">!</b> ' + esc(oo ? oo.label : '') + '</td><td class="lnpos"><b>' + esc(L.pos) + '</b> <span class="lnn">нет в заказах</span></td>' +
          '<td class="n lnq"><b>' + (L.qty > 0 ? fmt(L.qty) : '—') + '</b>' + (mt || L.unit === 'kg' ? '<div class="lnn">кг</div>' : '') + '</td><td>' + (L.st ? cmChip(L.st) : '') + '</td><td>' + esc(L.cont || '') + '</td><td class="lndet">' + (L.det ? '<b>' + esc(L.det) + '</b>' : '') + '</td><td>' + (L.ship ? esc(ruDate(L.ship)) : '') + '</td><td class="lntx">' + esc(L.text || '') + '</td>' +
          '<td class="n lnn">ждёт</td>' + (W ? '<td class="lnact"><button class="ivic ivpx" title="Убрать строку из инвойса">✕</button></td>' : '') + '</tr>';
      }).join('');
      body += pendH;
      var DL = invLines(plain); DL.forEach(function (g) { G[g.k] = g.items; });
      body += DL.map(function (g) {
        var k = g.k, L = g.items;
        var hh = lineRow(k, L, { q: g.q, qs: g.same ? 'в ' + g.nsame + ' ячейках — один раз' : '', det: g.isDet ? g.name : '', delCls: 'ivldel', cls: 'ivLd' });
        var no0 = LN; return hh + L.map(function (x, j) { return rowH(x, 'ivmc', k, no0 + '.' + (j + 1)); }).join('');
      }).join('');
      h += '<div class="scroll" style="max-height:66vh"><table class="mini invt ive"><tr><th class="n">№</th><th>Заказ</th><th>Позиция</th><th class="n">Кол-во</th><th>Статус</th><th>Контейнер</th><th>Деталь</th><th>Отгрузка</th><th>Комментарий</th><th class="n">Не хватает</th>' + (W ? '<th></th>' : '') + '</tr>' + body + '</table></div>';
      openModal(h + '</div>', true); modal.classList.add('xw'); modal.dataset.inv = inv;
      modal.querySelectorAll('button.ivpx').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); if (!b.dataset.sure) { b.dataset.sure = 1; b.classList.add('sure'); b.textContent = 'удалить?'; return; } var id = b.closest('tr').dataset.id; invpSet(id, null, 'строка убрана').then(function () { render(); invItemsModal(inv); }); }; });
      modal.querySelectorAll('tr.ivpd').forEach(function (tr) { tr.onclick = function (ev) { if (ev.target.closest('button')) return; invPendModal(inv, tr.dataset.id); }; });
      if (sc) modal.querySelector('.scroll').scrollTop = sc;
      var again = function (nm) { invItemsModal(nm || inv); };
      $('ivBack').onclick = invListModal;
      if ($('ivMore')) $('ivMore').onclick = function () { invNewModal(inv); };
      if ($('ivWhere')) $('ivWhere').onclick = function () { invWhereModal(inv); };
      if ($('ivRen')) $('ivRen').onclick = function () { invRenameUi($('ivRenH'), inv, function (nm) { invItemsModal(nm); }); };
      var openPos = function (tr) { cellModal(tr.dataset.p, tr.dataset.o, { props: 1, back: function () { invItemsModal(inv); }, backLbl: '← Назад в инвойс ' + inv }); };
      bindEye(modal);
      if ($('ivDel')) $('ivDel').onclick = function () {
        var b = $('ivDel'); if (!b.dataset.sure) { b.dataset.sure = 1; b.classList.add('sure'); b.textContent = 'Точно удалить инвойс? (' + (e.items.length + (e.pend ? e.pend.length : 0)) + ' строк) — нажмите ещё раз'; return; }
        invDelete(inv).then(function (n) { showMsg('Инвойс <b>' + esc(inv) + '</b> удалён — комментариев: ' + n + '. Вернуть — ↶ Отменить.', 'good'); invListModal(); });
      };
      /* материал: свернуть / развернуть позиции */
      modal.querySelectorAll('button.ivled').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); invNewModal(inv, b.dataset.k); }; });
      modal.querySelectorAll('tr.ivLd').forEach(function (tr) {
        var k = tr.dataset.m, go = tr.querySelector('.ivlgo'), qi = tr.querySelector('.ivlq'), del = tr.querySelector('.ivldel');
        if (go) go.onclick = function (ev) { ev.stopPropagation(); var q = parseFloat(String(qi.value).replace(',', '.')) || 0; if (!(q > 0)) { showMsg('Укажите кол-во, шт.', 'err'); qi.focus(); return; } invLineDist(inv, G[k], q).then(function (n) { showMsg('Строка разложена: <b>' + fmt(q) + ' шт</b> по ' + n + ' ячейкам — сначала где не хватает.', 'good'); invItemsModal(inv); }); };
        if (qi) qi.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); go.click(); } };
        if (del) del.onclick = function (ev) { ev.stopPropagation(); if (!del.dataset.sure) { del.dataset.sure = 1; del.classList.add('sure'); del.textContent = 'удалить?'; return; } invDelItems(inv, G[k], 'строка ' + tr.querySelector('.ivmn').textContent).then(function (n) { showMsg('Из инвойса удалено комментариев: ' + n + '.', 'good'); invItemsModal(inv); }); };
      });
      modal.querySelectorAll('tr.ivmat:not(.ivpd)').forEach(function (tr) {
        var m = tr.dataset.m, tog = function () { var k = inv + '|' + m, op = !INV_OPEN[k]; INV_OPEN[k] = op; tr.querySelector('.ivmt').textContent = op ? '▾' : '▸'; modal.querySelectorAll('tr.ivmd, tr.ivmc').forEach(function (r) { if (r.dataset.m === m) r.hidden = !op; }); };
        tr.onclick = function (ev) { if (ev.target.closest('input,button:not(.ivmt),label')) return; tog(); };
        var go = tr.querySelector('.ivmgo'); if (go) go.onclick = function (ev) { ev.stopPropagation(); var kq = parseFloat(String(tr.querySelector('.ivmkg').value).replace(',', '.')) || 0; if (!(kq > 0)) { showMsg('Укажите, сколько кг материала в инвойсе.', 'err'); tr.querySelector('.ivmkg').focus(); return; } invMatDist(inv, m, G[m], kq).then(function (r) { showMsg('Материал <b>' + esc(m) + '</b>: ' + fmtQ(kq) + ' кг → <b>' + fmt(r.q) + ' шт</b> в ' + r.n + ' ячеек.' + (r.nok ? ' Без кг на 1 шт: ' + r.nok + ' — укажите в комментарии.' : ''), 'good'); invItemsModal(inv); }); };
        var kin = tr.querySelector('.ivmkg'); if (kin) kin.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); go.click(); } };
        var del = tr.querySelector('.ivmdel'); if (del) del.onclick = function (ev) { ev.stopPropagation(); if (!del.dataset.sure) { del.dataset.sure = 1; del.classList.add('sure'); del.textContent = 'удалить?'; return; } invDelItems(inv, G[m], 'материал ' + m).then(function (n) { showMsg('Из инвойса удалён материал <b>' + esc(m) + '</b> — комментариев: ' + n + '.', 'good'); invItemsModal(inv); }); };
      });
      modal.querySelectorAll('button.ivdel').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); if (!b.dataset.sure) { b.dataset.sure = 1; b.classList.add('sure'); b.textContent = 'удалить?'; return; } var tr = b.closest('tr'), x = it.filter(function (y) { return y.p.id === tr.dataset.p && y.o.id === tr.dataset.o && String(y.c.ts || 0) === tr.dataset.ts; }); invDelItems(inv, x, 'строка').then(function () { invItemsModal(inv); }); }; });
      modal.querySelectorAll('tr.ivi').forEach(function (tr) {
        if (!W) { tr.onclick = function (ev) { if (ev.target.closest('button.eye')) return; openPos(tr); }; return; }
        tr.querySelector('.ive-open').onclick = function () { openPos(tr); };
        tr.querySelectorAll('.ive-f').forEach(function (f) {
          if (f.tagName === 'INPUT') f.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); f.blur(); } };
          f.onchange = function () {
            var p = P(tr.dataset.p), o = O(tr.dataset.o), ts = +tr.dataset.ts, L = cmOf(p, o).slice(), i = -1;
            L.forEach(function (c, j) { if (i < 0 && (c.ts || 0) === ts && cleanSp(c.inv) === inv) i = j; }); if (i < 0) i = +tr.dataset.i;
            var old = L[i]; if (!old) return;
            var fld = f.dataset.f, now = Date.now();
            if (fld === 'ord') {
              var o2 = O(f.value); if (!o2 || o2.id === o.id) return;
              var mv = Object.assign({}, old, { ets: now, eby: ME || '' });
              cmSaveMany([[p, o], [p, o2]], function (LL, pp, oo) { return oo.id === o.id ? LL.filter(function (c, j) { return j !== i; }) : LL.concat([mv]); }, 'Инвойс ' + inv + ': комментарий перенесён ' + p.name + ' · ' + o.label + ' → ' + o2.label).then(function () { render(); again(); showMsg('Комментарий перенесён в заказ ' + esc(o2.label) + '.', 'good'); });
              return;
            }
            if (fld === 'pos') {
              var p2 = P(f.value); if (!p2 || p2.id === p.id) return;
              var moved = Object.assign({}, old, { ets: now, eby: ME || '' });
              cmSaveMany([[p, o], [p2, o]], function (LL, pp) { return pp.id === p.id ? LL.filter(function (c, j) { return j !== i; }) : LL.concat([moved]); }, 'Инвойс ' + inv + ': комментарий перенесён ' + o.label + ' · ' + p.name + ' → ' + p2.name).then(function () { render(); again(); showMsg('Комментарий перенесён на ' + esc(p2.name) + '.', 'good'); });
              return;
            }
            var v = f.value; if (fld === 'qty') { v = parseFloat(String(v).replace(',', '.')); v = v > 0 ? v : 0; } else if (fld !== 'st' && fld !== 'ship') v = cleanSp(v);
            if ((old[fld] || (fld === 'qty' ? 0 : '')) === v) return;
            var nc = Object.assign({}, old, { ets: now, eby: ME || '' }); nc[fld] = v;
            if (fld === 'qty' && (old.mat || old.mkg > 0)) { var ku = cmKgu(old, p); if (ku > 0) { nc.kgu = ku; nc.mkg = v > 0 ? Math.round(v * ku * 1e6) / 1e6 : 0; } }
            L[i] = cmClean(nc);
            cmSave(p, o, L, 'Инвойс ' + inv + ': изменён комментарий ' + o.label + ' · ' + p.name + ' — было: ' + cmDesc(old) + ' → стало: ' + cmDesc(nc)).then(function () { render(); again(); });
          };
          dateSafe(f);
        });
      });
      invBindSt(function () { invItemsModal(inv); }); invBindDate(function () { invItemsModal(inv); });
      modal.querySelectorAll('input.invcont').forEach(function (f) { f.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); f.blur(); } }; f.onchange = function () { var v = cleanSp(f.value); if (!v) return; invSetCont(inv, v).then(function (n) { showMsg('Инвойс <b>' + esc(inv) + '</b>: контейнер <b>' + esc(v) + '</b> — изменено строк: ' + n + '.', 'good'); invItemsModal(inv); }); }; });
      $('ivXls').onclick = function () {
        var aoa = [['Инвойс ' + inv], ['Дата инвойса: ' + (invDate(e) ? ruDate(invDate(e)) : '—') + ' · статус: ' + (cur !== null ? CM_ST[cur] : 'разные') + ' · позиций ' + Object.keys(e.ps).length + ' · ' + fmt(e.qty) + ' шт'], [], ['№', 'Заказ', 'Позиция', 'Кол-во, шт', 'Материал, кг', 'кг на 1 шт', 'Статус', 'Контейнер', 'Деталь', 'Отгрузка', 'Комментарий', 'Не хватает']].concat(it.map(function (x, n) { var c = x.c, ku = cmKgu(c, x.p); return [n + 1, x.o.label, x.p.name, c.qty > 0 ? c.qty : '', c.mkg > 0 ? c.mkg : '', c.mkg > 0 && ku > 0 ? ku : '', CM_ST[c.st || ''] || '', c.cont || '', c.det || '', c.ship ? ruDate(c.ship) : '', c.text || '', finalShort(x.p, x.o) || '']; }));
        var buf = xlsxBuild([{ name: 'Инвойс', rows: aoa, header: { 3: 1 }, freeze: 4, cols: [6, 12, 40, 10, 12, 11, 16, 18, 30, 12, 36, 12], border: function (r) { return r >= 3; } }]);
        saveBinary('Инвойс_' + String(inv).replace(/[^\wА-Яа-яЁё№-]+/g, '_') + '.xlsx', buf).then(function () { showMsg('Инвойс скачан в Excel.', 'good'); }, function (er) { showMsg('Не скачалось: ' + esc(er.message || er), 'err'); });
      };
    }
    function cmListModal(f) {
      var map = {}; OOR.positions.forEach(function (p) { OOR.orders.forEach(function (o) { var k = cmKey(p, o); if (OV.cm[k]) map[k] = [p, o]; }); });
      var rows = [];
      Object.keys(OV.cm || {}).forEach(function (k) { var po = map[k]; (OV.cm[k] || []).forEach(function (c, i) { rows.push({ c: c, i: i, p: po ? po[0] : null, o: po ? po[1] : null, k: k }); }); });
      rows.sort(function (a, b) { return b.c.ts - a.c.ts; });
      var cnt = {}; rows.forEach(function (r) { cnt[r.c.st || ''] = (cnt[r.c.st || ''] || 0) + 1; });
      var h = head('Комментарии — ' + rows.length, 'нажмите на строку — окно позиции');
      h += '<div class="fbar">' + (CAN_WRITE ? '<button class="btn sm primary" id="cmLAdd">＋ Добавить комментарий</button>' : '') + '<button class="btn sm" id="cmLView" title="В главной таблице останутся только заказы и позиции с комментариями">Вид: все комментарии в таблице</button></div>';
      h += '<div class="fbar">' + ['all'].concat(Object.keys(CM_ST)).map(function (k) { var n = k === 'all' ? rows.length : (cnt[k] || 0); if (k !== 'all' && !n) return ''; return '<button class="btn sm cmf-b' + ((f || 'all') === k ? ' primary' : '') + '" data-f="' + k + '">' + (k === 'all' ? 'Все' : CM_ST[k]) + ' · ' + n + '</button>'; }).join('') + '</div>';
      h += '<div class="scroll" style="max-height:66vh"><table class="mini"><tr><th>Заказ</th><th>Товар</th><th>Статус</th><th class="n">Кол-во</th><th>Комментарий</th><th>Инвойс</th><th>Контейнер</th><th>Отгрузка</th><th>Когда</th><th>Кто</th><th></th><th></th></tr>';
      rows.forEach(function (r) {
        if (f && f !== 'all' && (r.c.st || '') !== f) return;
        h += '<tr class="go"' + (r.p && r.o ? ' data-p="' + r.p.id + '" data-o="' + r.o.id + '"' : '') + '><td><b>' + esc(r.o ? r.o.label : '—') + '</b></td><td>' + esc(r.p ? r.p.name : r.k) + '</td><td>' + cmChip(r.c.st) + '</td><td class="n">' + (r.c.qty > 0 ? fmt(r.c.qty) + ' шт' : '') + '</td><td>' + esc(r.c.text || '') + '</td><td>' + (r.c.inv ? invLink(r.c.inv) : '') + '</td><td>' + esc(r.c.cont || '') + '</td><td>' + esc(r.c.ship ? ruDate(r.c.ship) : '') + '</td><td class="note">' + esc(nowStr(r.c.ts)) + '</td><td class="note">' + esc(whoName(r.c.by)) + '</td><td class="eyec">' + (r.p && r.o ? eyeBtn(r.p.id, r.o.id) : '') + '</td><td class="eyec">' + (CAN_WRITE ? '<button class="cmx" data-k="' + esc(r.k) + '" data-i="' + r.i + '" title="Удалить комментарий">×</button>' : '') + '</td></tr>';
      });
      if (!rows.length) h += '<tr><td colspan="12" class="note">Комментариев пока нет.</td></tr>';
      openModal(h + '</table></div></div>', true); bindGo(); bindEye(modal);
      if ($('cmLAdd')) $('cmLAdd').onclick = function () { cmForm([], { pick: true, back: function () { cmListModal(f); } }); };
      $('cmLView').onclick = function () { $('flt').value = 'cm'; closeModal(); render(); showMsg('Показаны только позиции с комментариями. Вернуть — кнопка «✕ Показать все» над таблицей.', 'good'); };
      modal.querySelectorAll('button.cmx').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'удалить?'; b.classList.add('sure'); return; }
          var po = map[b.dataset.k]; if (!po) return; var L = cmOf(po[0], po[1]).slice(), d = L.splice(+b.dataset.i, 1)[0];
          cmSave(po[0], po[1], L, 'Удалён комментарий: ' + po[1].label + ' · ' + po[0].name + (d ? ' — ' + cmDesc(d) : '')); render(); cmListModal(f);
        };
      });
      modal.querySelectorAll('.cmf-b').forEach(function (b) { b.onclick = function () { cmListModal(b.dataset.f); }; });
    }

    /* ===== глаз: перейти к ячейке в главной таблице (ячейка — в центре видимой части) ===== */
    function eyeBtn(pid, oid) { return '<button class="eye" data-jp="' + pid + '" data-jo="' + oid + '" title="Показать в таблице" aria-label="Показать в таблице"><svg class="ic" aria-hidden="true"><use href="#i-eye"/></svg></button>'; }
    function bindEye(root) { root.querySelectorAll('button.eye').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); e.preventDefault(); jumpToCell(b.dataset.jp, b.dataset.jo); }; }); }
    function cellTd(pid, oid) { return $('grid').querySelector('td.cell[data-p="' + pid + '"][data-o="' + oid + '"]'); }
    function jumpToCell(pid, oid) {
      closeModal();
      var td = cellTd(pid, oid);
      if (!td) { /* скрыта фильтром — сбросить фильтры */
        $('q').value = ''; $('flt').value = 'all'; if ($('cli').value) { $('cli').value = ''; } render(); td = cellTd(pid, oid);
        if (td) showMsg('Фильтры сброшены, чтобы показать позицию.', 'good');
      }
      if (!td) { showMsg('Ячейка не найдена в таблице.', 'err'); return; }
      var w = $('wrap'), g = $('grid'), wr = w.getBoundingClientRect(), zf = w.offsetHeight ? wr.height / w.offsetHeight : 1;
      var tr = td.getBoundingClientRect(), thv = g.tHead ? g.tHead.rows[0].getBoundingClientRect().height : 0, lv = 0;
      ['td.c-cat', 'td.c-no', 'td.c-name'].forEach(function (q) { var c = g.querySelector('tbody ' + q); if (c) lv += c.getBoundingClientRect().width; });
      var relY = (tr.top - wr.top) / zf + w.scrollTop, relX = (tr.left - wr.left) / zf + w.scrollLeft, th = thv / zf, left = lv / zf;
      var visH = w.clientHeight - th, visW = w.clientWidth - left;
      w.scrollTop = Math.max(0, relY + tr.height / zf / 2 - th - visH / 2);
      if (w.scrollWidth > w.clientWidth) w.scrollLeft = Math.max(0, relX + tr.width / zf / 2 - left - visW / 2);
      wr = w.getBoundingClientRect(); if (wr.top < 0 || wr.bottom > window.innerHeight) w.scrollIntoView({ block: 'nearest' });
      g.querySelectorAll('.hit').forEach(function (x) { x.classList.remove('hit'); });
      td.classList.add('hit'); td.parentNode.classList.add('hit');
    }
    document.addEventListener('pointerdown', function (e) { if (e.target.closest('button.eye')) return; var g = $('grid'); if (g) g.querySelectorAll('.hit').forEach(function (x) { x.classList.remove('hit'); }); }, true);

    /* ================= шаблон заказа: скачать / загрузить ================= */
    /* ===== комментарии v2 (24.11.2026): приоритет статуса, рамка ячейки, подсказка, окошко, меню правой кнопки, копирование, перетаскивание ===== */
    var CM_PRI = { '': 0, process: 1, transit: 2, customs: 3, arrived: 4 };
    var CMCLIP = null;
    function cmPri(c) { return CM_PRI[(c && c.st) || ''] || 0; }
    /* какой цвет у ячейки: статус, ближе всего к «прибыл» (прибыл > растаможка > в пути > в процессе) */
    function cmTop(L) { var t = null; (L || []).forEach(function (c) { if (!t || cmPri(c) > cmPri(t) || (cmPri(c) === cmPri(t) && (c.ts || 0) > (t.ts || 0))) t = c; }); return t; }
    function cmCov(L) { var s = 0; (L || []).forEach(function (c) { if (c.st && c.qty > 0) s += c.qty; }); return s; }
    function cmSorted(L) { return (L || []).map(function (c, i) { return { c: c, i: i }; }).sort(function (a, b) { return cmPri(b.c) - cmPri(a.c) || (b.c.ts || 0) - (a.c.ts || 0); }); }
    /* рамка ячейки цветом статуса; чем больше количества «в пути / на растаможке…» покрывает нехватку — тем ярче */
    function cmCell(p, o, sh) {
      var L = cmOf(p, o); if (!L.length) return { cls: '', st: '' };
      var t = cmTop(L), cov = cmCov(L), k = sh > 0 ? Math.min(1, cov / sh) : 0, lv = !cov ? 1 : (sh > 0 && cov < sh ? 2 : 3);
      var lt = FITW ? ({ '': 'коммент.', process: 'процесс', transit: 'в пути', customs: 'таможня', arrived: 'прибыл' })[t.st || ''] : (t.st ? CM_ST[t.st] : 'коммент.');
      return { cls: ' cm cmL' + lv, st: ' style="--cmc:' + CM_COL[t.st || ''] + '"', lab: '<em class="cmlab cmst" title="" draggable="true" data-cp="' + p.id + '" data-co="' + o.id + '" style="background:' + CM_COL[t.st || ''] + (FITW ? ';font-size:' + fpx(lt, FITW.ord - 12, 13, 9, 's') + 'px' : '') + '">' + esc(lt) + '</em>' };
    }
    function cmBadge(p, o) {
      var L = cmOf(p, o); if (!L.length) return ''; var t = cmTop(L);
      return '<em class="cmb' + (L.length > 1 && !FITW ? ' n' : '') + '" title="" draggable="true" data-cp="' + p.id + '" data-co="' + o.id + '" style="--cmc:' + CM_COL[t.st || ''] + ';background:' + CM_COL[t.st || ''] + '"><svg class="ic" aria-hidden="true"><use href="#i-cm"/></svg><span class="cms">' + esc(t.st ? CM_ST[t.st] : 'коммент.') + '</span>' + (L.length > 1 && !FITW ? '<span class="cmn">+' + L.length + '</span>' : '') + '</em>';
    }
    /* индикатор готовности заказа в самом названии заказа: хватает / в пути, растаможка… (по комментариям с количеством) / не хватает */
    function ordBar(o) {
      var q = 0, sh = 0, cs = {};
      OOR.positions.forEach(function (p) {
        var c = R[p.id].cells[o.id]; if (!c) return; q += c.q; var s = finalShort(p, o); sh += s;
        if (s > 0) { var L = cmOf(p, o).filter(function (x) { return x.st && x.qty > 0; }), cov = Math.min(s, cmCov(L)); if (cov > 0) { var t = cmTop(L); cs[t.st] = (cs[t.st] || 0) + cov; } }
      });
      if (!q) return { html: '', pc: 100, sh: 0 };
      var cv = 0, segs = [['хватает', q - sh, '#3BB273', 'ok']];
      ['arrived', 'customs', 'transit', 'process'].forEach(function (k) { if (cs[k]) { segs.push([CM_ST[k], cs[k], CM_COL[k], k]); cv += cs[k]; } });
      segs.push(['не хватает', sh - cv, '#E5483F', 'short']);
      var tip = segs.filter(function (s) { return s[1] > 0; }).map(function (s) { return s[0] + ' ' + fmt(s[1]) + ' шт'; }).join(' · ');
      return { html: '<span class="obar">' + segs.filter(function (s) { return s[1] > 0; }).map(function (s) { return '<i style="flex:' + s[1] + ';background:' + s[2] + '"></i>'; }).join('') + '</span>', pc: Math.max(0, Math.floor((q - sh) / q * 100)), sh: sh, tip: tip, segs: segs, q: q, cv: cv };
    }
    /* --- наведение на заказ: индикатор крупно, под ним шт и % по каждой части, общее выполнение --- */
    var ordTip = document.createElement('div'); ordTip.id = 'ordTip'; ordTip.hidden = true; document.body.appendChild(ordTip);
    function ordTipShow(th) {
      var o = O(th.dataset.o); if (!o) return;
      var b = ordBar(o); if (!b.q) return;
      var pc = function (v) { var x = v / b.q * 100; return (x > 0 && x < 1 ? '<1' : Math.floor(x)) + '%'; };
      var rv = 0, fg = 0, sp = 0, np = 0, ns = 0;
      OOR.positions.forEach(function (p) {
        var c = R[p.id].cells[o.id]; if (!c) return; np++; if (finalShort(p, o) > 0) ns++;
        var a = AC(p, o); rv += Math.min(c.rv || 0, c.q); if (a) { fg += a.fg || 0; sp += (a.semi || 0) + (a.prod || 0); }
      });
      var segs = b.segs.filter(function (x) { return x[1] > 0; });
      var h = '<div class="ot-h">' + esc(o.label) + ' <span>· ' + esc(o.client) + '</span></div><div class="ot-m">от ' + esc(o.created || '—') + ' · срок ' + esc(o.due || '—') + ' · очередь ' + (QUEUE.indexOf(o) + 1) + ' из ' + QUEUE.length + ' · позиций ' + np + (ns ? ', с нехваткой <b>' + ns + '</b>' : '') + '</div>';
      ordTip._L = ordLists(o); ordTip2.hidden = true; ordTip2.dataset.seg = '';
      h += '<div class="ot-bar">' + segs.map(function (x) { var w = x[1] / b.q * 100; return '<i data-seg="' + x[3] + '" style="flex:' + x[1] + ';background:' + x[2] + '">' + (w >= 9 ? pc(x[1]) : '') + '</i>'; }).join('') + '</div>';
      h += '<table class="ot-t">' + segs.map(function (x, i) {
        var sub = i === 0 && x[0] === 'хватает' ? [rv ? 'резерв ' + fmt(rv) : '', fg ? 'склад ' + fmt(fg) : '', sp ? 'п/ф и произв. ' + fmt(sp) : ''].filter(Boolean).join(' · ') : '';
        return '<tr data-seg="' + x[3] + '"><td><i style="background:' + x[2] + '"></i>' + esc(x[0]) + (sub ? '<small>' + sub + '</small>' : '') + '</td><td class="n">' + fmt(x[1]) + ' шт</td><td class="n">' + pc(x[1]) + ' <span class="o2a">›</span></td></tr>';
      }).join('') + '<tr class="ot-s"><td>Заказано</td><td class="n">' + fmt(b.q) + ' шт</td><td class="n">100%</td></tr></table>';
      var done = Math.floor((b.q - b.sh) / b.q * 100), withCm = Math.floor((b.q - b.sh + b.cv) / b.q * 100);
      h += '<div class="ot-f' + (b.sh ? '' : ' ok') + '">Выполнение заказа: <b>' + (b.sh ? done + '%' : '100% — закрыт полностью') + '</b>' + (b.sh && b.cv ? ' · с учётом комментариев (в пути, таможня, прибыл…) <b>' + withCm + '%</b>' : '') + '</div>';
      ordTip.innerHTML = h; ordTip.hidden = false;
      var r = th.getBoundingClientRect(), z = bodyZ(); ordTip.style.left = '0px'; ordTip.style.top = '0px';
      var w = ordTip.offsetWidth * z, hh = ordTip.offsetHeight * z, vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8)), y = r.bottom + 6; if (y + hh > vh - 8) y = Math.max(8, r.top - hh - 6);
      ordTip.style.left = x / z + 'px'; ordTip.style.top = y / z + 'px';
    }
    $('grid').addEventListener('mouseover', function (e) { var t = e.target.closest('th.ord[data-o]'); if (!t || e.target.closest('.rz')) return; if (typeof OT_T !== 'undefined') clearTimeout(OT_T); if (ordTip.dataset.o !== t.dataset.o || ordTip.hidden) { ordTip.dataset.o = t.dataset.o; ordTipShow(t); } });
    /* --- подсказка при наведении: жёлтый фон, статус цветом, инвойс и контейнер жирным --- */
    var cmTip = document.createElement('div'); cmTip.id = 'cmTip'; cmTip.hidden = true; document.body.appendChild(cmTip);
    function cmItemHtml(c, i, act) {
      return '<div class="ct-i" style="border-left-color:' + CM_COL[c.st || ''] + '"><div class="ct-h">' + cmChip(c.st) + (c.qty > 0 ? '<b class="ct-q">' + fmt(c.qty) + ' шт</b>' : '') + (c.mkg > 0 ? '<span class="ct-kg">(' + cmKgTxt(c) + ')</span>' : '') + (act ? '<span class="sp"></span><button class="ct-b" data-a="ed" data-i="' + i + '" title="Изменить">✎</button><button class="ct-b del" data-a="del" data-i="' + i + '" title="Удалить">×</button>' : '') + '</div>' +
        (c.det ? '<div>Деталь <b>' + esc(c.det) + '</b></div>' : '') + (c.inv ? '<div>Инвойс ' + invLink(c.inv) + '</div>' : '') + (c.cont ? '<div>Контейнер <b>' + esc(c.cont) + '</b></div>' : '') + (c.ship ? '<div>Отгрузка <b>' + esc(ruDate(c.ship)) + '</b></div>' : '') +
        (c.text ? '<div class="ct-t">' + esc(c.text) + '</div>' : '') + '<div class="ct-n">' + esc(nowStr(c.ts)) + ' · ' + esc(whoName(c.by)) + '</div></div>';
    }
    /* поля комментария — каждое с новой строки */
    function cmLines(c) {
      return [c.qty > 0 || c.mkg > 0 ? '<b>' + (c.qty > 0 ? fmt(c.qty) + ' шт' : '') + '</b>' + (c.mkg > 0 ? ' (' + cmKgTxt(c) + ')' : '') : '', c.det ? 'деталь <b>' + esc(c.det) + '</b>' : '', c.inv ? 'инвойс ' + invLink(c.inv) : '', c.cont ? 'контейнер <b>' + esc(c.cont) + '</b>' : '', c.ship ? 'отгрузка <b>' + esc(ruDate(c.ship)) + '</b>' : '', c.text ? esc(c.text) : '']
        .filter(Boolean).map(function (x) { return '<span class="ln">' + x + '</span>'; }).join('');
    }
    function cmLine(c, p) {
      return '<div class="cl1" style="border-left-color:' + CM_COL[c.st || ''] + '"><span class="cl1s">' + cmChip(c.st) + (c.qty > 0 ? '<b class="cl1q">' + fmt(c.qty) + ' шт</b>' : '') + '</span><span class="cl1t">' + (c.mkg > 0 ? '(<b>' + cmKgTxt(c, p) + '</b>) ' : '') + (c.inv ? 'инв. ' + invLink(c.inv) + ' ' : '') + (c.cont ? 'конт. <b>' + esc(c.cont) + '</b> ' : '') + (c.ship ? 'отгр. <b>' + esc(ruDate(c.ship)) + '</b> ' : '') + (c.det ? 'деталь <b>' + esc(c.det) + '</b> ' : '') + (c.text ? esc(c.text) : '') + '<small>' + esc(nowStr(c.ts)) + ' · ' + esc(whoName(c.by)) + '</small></span></div>';
    }
    function cmTipShow(el) {
      var p = P(el.dataset.cp), o = O(el.dataset.co); if (!p || !o) return;
      var L = cmOf(p, o); if (!L.length) return;
      cmTip.innerHTML = '<div class="ct-t0">' + esc(o.label) + ' · ' + esc(p.name) + '</div>' + cmSorted(L).map(function (x) { return cmLine(x.c, p); }).join('');
      cmTip.hidden = false; placeNear(cmTip, el.getBoundingClientRect());
    }
    /* масштаб страницы (CSS zoom на body): left/top внутри body умножаются на него — делим */
    function bodyZ() { return parseFloat(document.body.style.zoom) || 1; }
    function placeNear(box, r) {
      box.style.left = '0px'; box.style.top = '0px';
      var z = bodyZ(), w = box.offsetWidth * z, h = box.offsetHeight * z, vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var x = r.right + 8, y = r.top - 4;
      if (x + w > vw - 8) x = r.left - w - 8; if (x < 8) x = Math.max(8, Math.min(vw - w - 8, r.left));
      if (y + h > vh - 8) y = Math.max(8, vh - h - 8);
      box.style.left = x / z + 'px'; box.style.top = y / z + 'px';
    }
    /* подсказка комментариев держится: на неё можно навести мышь и прокрутить (как окно заказа); закрывается, когда мышь ушла и со значка, и с подсказки */
    var CT_HIDE = 0;
    function cmTipLater(ms) { clearTimeout(CT_HIDE); CT_HIDE = setTimeout(function () { cmTip.hidden = true; }, ms); }
    $('grid').addEventListener('mouseover', function (e) { var b = e.target.closest('em.cmb,em.cmlab'); if (!b || !cmPop.hidden) return; clearTimeout(CT_HIDE); if (cmTip.hidden || cmTip.dataset.k !== b.dataset.cp + '|' + b.dataset.co) { cmTipShow(b); cmTip.dataset.k = b.dataset.cp + '|' + b.dataset.co; cmTip.scrollTop = 0; } });
    $('grid').addEventListener('mouseout', function (e) { var b = e.target.closest('em.cmb,em.cmlab'); if (b && !b.contains(e.relatedTarget) && !cmTip.contains(e.relatedTarget)) cmTipLater(350); });
    cmTip.addEventListener('mouseenter', function () { clearTimeout(CT_HIDE); });
    cmTip.addEventListener('mouseleave', function (e) { var b = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('em.cmb,em.cmlab'); if (b && cmTip.dataset.k === b.dataset.cp + '|' + b.dataset.co) return; cmTipLater(250); });
    /* --- окошко по нажатию на значок: все комментарии, правка, удаление, добавить, копировать --- */
    var cmPop = document.createElement('div'); cmPop.id = 'cmPop'; cmPop.hidden = true; document.body.appendChild(cmPop);
    function cmPopOpen(pid, oid, anchor) {
      var p = P(pid), o = O(oid); if (!p || !o) return; cmTip.hidden = true;
      var L = cmOf(p, o);
      cmPop.innerHTML = '<div class="cp-h"><b>' + esc(o.label) + '</b> · ' + esc(p.name) + '<button class="cp-x" title="Закрыть">×</button></div><div class="cp-b">' + cmSorted(L).map(function (x) { return cmItemHtml(x.c, x.i, CAN_WRITE); }).join('') + (L.length ? '' : '<p class="note">Комментариев нет.</p>') + '</div>' +
        '<div class="cp-f">' + (CAN_WRITE ? '<button class="btn sm primary" data-a="add">＋ Добавить</button>' : '') + (L.length ? '<button class="btn sm" data-a="copy">Копировать</button>' : '') + '<button class="btn sm" data-a="open">Свойства позиции</button></div>';
      cmPop.hidden = false; cmPop.dataset.k = pid + '|' + oid; placeNear(cmPop, anchor.getBoundingClientRect());
      cmPop.querySelector('.cp-x').onclick = function () { cmPop.hidden = true; };
      cmPop.querySelectorAll('[data-a]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation(); var a = b.dataset.a, i = +b.dataset.i;
          if (a === 'add') { cmPop.hidden = true; cmForm([[p, o]]); }
          else if (a === 'copy') { cmCopy(p, o); cmPop.hidden = true; }
          else if (a === 'open') { cmPop.hidden = true; cellModal(pid, oid, { props: 1 }); }
          else if (a === 'ed') { cmPop.hidden = true; cmForm([[p, o]], { edit: i }); }
          else if (a === 'del') {
            if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'удалить?'; b.classList.add('sure'); return; }
            var L2 = cmOf(p, o).slice(), d = L2.splice(i, 1)[0];
            cmSave(p, o, L2, 'Удалён комментарий: ' + o.label + ' · ' + p.name + (d ? ' — ' + cmDesc(d) : '')); render();
            if (L2.length) { var td = cellTd(pid, oid); if (td) cmPopOpen(pid, oid, td); else cmPop.hidden = true; } else cmPop.hidden = true;
          }
        };
      });
    }
    document.addEventListener('pointerdown', function (e) { if (!cmPop.hidden && !e.target.closest('#cmPop') && !e.target.closest('em.cmb,em.cmlab')) cmPop.hidden = true; if (!ctxM.hidden && !e.target.closest('#ctxM')) ctxM.hidden = true; if (!cmTip.hidden && !e.target.closest('#cmTip') && !e.target.closest('em.cmb,em.cmlab')) cmTip.hidden = true; }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { cmPop.hidden = true; ctxM.hidden = true; cmTip.hidden = true; } });
    document.addEventListener('scroll', function (e) { var t = e.target; if (t && t.nodeType === 1 && (cmTip.contains(t) || ordTip.contains(t) || (typeof ordTip2 !== 'undefined' && ordTip2.contains(t)) || cmPop.contains(t))) return; cmTip.hidden = true; ctxM.hidden = true; ordTip.hidden = true; ordTip.dataset.o = ''; if (typeof ordTip2 !== 'undefined') ordTip2.hidden = true; }, true);
    /* --- меню правой кнопки мыши --- */
    var ctxM = document.createElement('div'); ctxM.id = 'ctxM'; ctxM.hidden = true; document.body.appendChild(ctxM);
    function ctxOpen(x, y, items) {
      ctxM.innerHTML = items.map(function (it, i) { return it === '-' ? '<hr>' : '<button data-i="' + i + '"' + (it[2] ? ' disabled' : '') + '>' + it[0] + '</button>'; }).join('');
      ctxM.hidden = false; ctxM.style.left = '0px'; ctxM.style.top = '0px';
      var z = bodyZ(), w = ctxM.offsetWidth * z, h = ctxM.offsetHeight * z, vw = document.documentElement.clientWidth, vh = window.innerHeight;
      ctxM.style.left = Math.max(4, Math.min(x + 2, vw - w - 6)) / z + 'px'; ctxM.style.top = Math.max(4, Math.min(y + 2, vh - h - 6)) / z + 'px';
      ctxM.querySelectorAll('button').forEach(function (b) { b.onclick = function () { ctxM.hidden = true; items[+b.dataset.i][1](); }; });
    }
    /* --- скрыть / показать колонки --- */
    function colItems(k) {
      var H = colHidden(), it = [];
      if (HIDEK[k]) it.push(['<b>Скрыть колонку</b> «' + esc(colName(k)) + '»', function () { colSet([k], true); }]);
      else it.push(['Скрыть колонку', function () { }, true]);
      if (H.length) {
        it.push('-');
        H.forEach(function (h) { it.push(['Показать «' + esc(colName(h)) + '»', function () { colSet([h], false); }]); });
        if (H.length > 1) it.push(['<b>Показать все скрытые (' + H.length + ')</b>', function () { colSet(H, false); }]);
      }
      return it;
    }
    /* метка на месте скрытых колонок: жёлтый язычок в шапке, нажатие — показать их */
    function colMarks() {
      var t = $('grid'); if (!t || !colHidden().length) return;
      var run = [], last = null, put = function (th, right) {
        if (!th || !run.length) return;
        var b = document.createElement('button'); b.type = 'button'; b.className = 'unh' + (right ? ' r' : ''); b.dataset.u = run.join(',');
        b.title = 'Скрыто: ' + run.map(colName).join(', ') + ' — нажмите, чтобы показать'; b.textContent = run.length > 1 ? '+' + run.length : '+';
        th.appendChild(b); th.classList.add(right ? 'hasr' : 'hasu'); run = [];
      };
      COLS.forEach(function (k) {
        if (HIDEK[k] && HIDE[k]) { run.push(k); return; }
        var th = t.querySelector('thead th[data-k="' + k + '"]'); if (!th) return;
        put(th, false); last = t.querySelectorAll('thead th[data-k="' + k + '"]'); last = last[last.length - 1];
      });
      put(last, true);
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('#grid thead .unh'); if (!b) return;
      e.preventDefault(); e.stopPropagation(); colSet(b.dataset.u.split(','), false);
    }, true);
    /* Вид → Колонки: переключатели */
    function vcolsFill() {
      var v = $('vcols'); if (!v) return;
      v.innerHTML = COLS.filter(function (k) { return HIDEK[k]; }).map(function (k) { return '<button type="button" class="vcb' + (HIDE[k] ? '' : ' on') + '" data-k="' + k + '" aria-pressed="' + (HIDE[k] ? 'false' : 'true') + '" title="' + (HIDE[k] ? 'Скрыта — нажмите, чтобы показать' : 'Видна — нажмите, чтобы скрыть') + '">' + esc(colName(k)) + '</button>'; }).join('');
      v.querySelectorAll('.vcb').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); colSet([b.dataset.k], !HIDE[b.dataset.k]); }; });
    }
    function clipLabel() { return CMCLIP ? CMCLIP.length + ' шт.' : ''; }
    function cmCopy(p, o) { var L = cmOf(p, o); if (!L.length) return; CMCLIP = L.map(function (c) { return { st: c.st || '', qty: c.qty || 0, inv: c.inv || '', cont: c.cont || '', ship: c.ship || '', text: c.text || '' }; }); showMsg('Скопировано комментариев: ' + CMCLIP.length + ' (' + esc(o.label) + ' · ' + esc(p.name) + '). Вставить — правой кнопкой на другой ячейке или перетащите значок.', 'good'); }
    /* сторона в коде: RS 7014R → R, RS 7014L-01/13 → L, R 4001FL-01/13 S → FL, RS 7014R/L → R/L, RS 7014-02/03 → '' (общая) */
    function codeSide(nm) { var t = cleanSp(nm).toUpperCase(), m = t.match(/^[A-ZА-Я]+\s*\d+([A-Z]{1,2}(?:\/[A-Z]{1,2})?)?(?=[\s\-(]|$)/); return m && m[1] ? m[1] : ''; }
    function sideOk(det, pos) {
      var a = codeSide(det), b = codeSide(pos); if (!a || !b) return true;
      return b.split('/').some(function (x) { return x === a || (x.length !== a.length && x.slice(-1) === a.slice(-1)); });
    }
    /* комментарий с деталью одной стороны (R / L / FR / FL) — только позициям этой стороны и комплектам R/L; общая деталь — всем */
    function sidePairs(prs, det) { if (!det || prs.length < 2 || !codeSide(det)) return prs; var f = prs.filter(function (x) { return sideOk(det, x[0].name); }); return f.length ? f : prs; }
    function cmPaste(pairs, src) {
      if (!src || !src.length || !CAN_WRITE) return;
      var ts = Date.now(), add = src.map(function (c, i) { return Object.assign({}, c, { ts: ts + i, by: ME || '' }); });
      if (pairs.length > 1 && add.some(function (c) { return c.det && codeSide(c.det); })) {
        var adds = {}; pairs.forEach(function (x) { adds[cmKey(x[0], x[1])] = add.filter(function (c) { return !c.det || sideOk(c.det, x[0].name); }); });
        pairs = pairs.filter(function (x) { return adds[cmKey(x[0], x[1])].length; });
        cmSaveMany(pairs, function (L, p, o) { return L.concat(adds[cmKey(p, o)].map(function (c) { return Object.assign({}, c); })); }, 'Вставлены комментарии (' + add.length + ') в ' + pairs.length + ' ячеек (с учётом стороны R/L): ' + pairs.slice(0, 3).map(function (x) { return x[1].label + ' · ' + x[0].name; }).join(', '));
        render(); showMsg('Вставлено в ' + pairs.length + ' позиций (детали одной стороны — только своей стороне).', 'good'); return;
      }
      cmSaveMany(pairs, function (L) { return L.concat(add.map(function (c) { return Object.assign({}, c); })); }, 'Вставлены комментарии (' + add.length + ') в ' + pairs.length + ' ячеек: ' + pairs.slice(0, 3).map(function (x) { return x[1].label + ' · ' + x[0].name; }).join('; ') + (pairs.length > 3 ? ' …' : ''));
      render(); showMsg('Вставлено комментариев: ' + add.length + (pairs.length > 1 ? ' в ' + pairs.length + ' позиций' : '') + '.', 'good');
    }
    /* сохранить комментарии сразу во многих ячейках (одна запись в истории) */
    function cmSaveMany(pairs, fn, text) {
      var ts = Date.now(), pr = Promise.resolve();
      pairs.forEach(function (x) {
        var p = x[0], o = x[1], k = cmKey(p, o), L = fn(cmOf(p, o).slice(), p, o);
        if (L.length) OV.cm[k] = L; else delete OV.cm[k];
        pr = pr.then(function () { return persistEdit('c' + hash(k), 'cm', k, L.length ? L : null, p, o, ts); });
      });
      var hst = { ts: ts, by: ME, kind: 'comment', text: text }; HIST.unshift(hst);
      return pr.then(function () { return persistHist(hst); });
    }
    function pairsShort(prs) { return prs.filter(function (x) { return finalShort(x[0], x[1]) > 0; }); }
    function pairsShortProd(prs) { return prs.filter(function (x) { if (finalShort(x[0], x[1]) > 0) return true; var a = AC(x[0], x[1]); return !!(a && ((a.semi || 0) + (a.prod || 0)) > 0); }); }
    function cmAddItems(prs, label) {
      var s1 = pairsShort(prs), s2 = pairsShortProd(prs);
      return [
        ['💬 Добавить комментарий на все позиции (' + prs.length + ')', function () { cmForm(prs, { title: 'Комментарий: ' + label + ' — все позиции' }); }, !CAN_WRITE],
        ['💬 Только на не хватающие (' + s1.length + ')', function () { cmForm(s1, { title: 'Комментарий: ' + label + ' — где не хватает' }); }, !CAN_WRITE || !s1.length],
        ['💬 На не хватающие и производимые (' + s2.length + ')', function () { cmForm(s2, { title: 'Комментарий: ' + label + ' — не хватает + п/ф и произв.' }); }, !CAN_WRITE || !s2.length]
      ];
    }
    function orderPairs(o, grp) { return OOR.positions.filter(function (p) { return R[p.id].cells[o.id] && (!grp || (NSORT ? nameGroup(p.name) : p.group) === grp); }).map(function (p) { return [p, o]; }); }
    $('grid').addEventListener('contextmenu', function (e) {
      var hth = e.target.closest('thead th');
      if (hth && !hth.classList.contains('ord')) { e.preventDefault(); ctxOpen(e.clientX, e.clientY, colItems(hth.dataset.k)); return; }
      if (EDITING) return;
      var td = e.target.closest('td.cell[data-p]'), th = e.target.closest('th.ord'), gc = e.target.closest('td.c-cat[data-g], td.c-name[data-p], .gcode[data-g], .c-pn[data-p]');
      if (td && !td.classList.contains('empty') && td.dataset.pp && td.dataset.pp.indexOf(',') > 0) {
        e.preventDefault(); var o2 = O(td.dataset.o), prs = td.dataset.pp.split(',').map(function (id) { return [P(id), o2]; });
        ctxOpen(e.clientX, e.clientY, cmAddItems(prs, 'заказ ' + o2.label + ' — позиции корня').concat(['-'], prs.map(function (x) { return ['Свойства: ' + esc(x[0].name), function () { cellModal(x[0].id, o2.id); }]; }))); return;
      }
      if (td && !td.classList.contains('empty')) {
        e.preventDefault(); var p = P(td.dataset.p), o = O(td.dataset.o), L = cmOf(p, o);
        ctxOpen(e.clientX, e.clientY, [
          ['💬 Добавить комментарий', function () { cmForm([[p, o]]); }, !CAN_WRITE],
          ['Свойства позиции', function () { cellModal(p.id, o.id, { props: 1 }); }],
          '-',
          ['Копировать комментарии' + (L.length ? ' (' + L.length + ')' : ''), function () { cmCopy(p, o); }, !L.length],
          ['Вставить комментарии' + (CMCLIP ? ' (' + CMCLIP.length + ')' : ''), function () { cmPaste([[p, o]], CMCLIP); }, !CMCLIP || !CAN_WRITE],
          ['Удалить все комментарии ячейки', function () { cmSaveMany([[p, o]], function () { return []; }, 'Удалены комментарии: ' + o.label + ' · ' + p.name); render(); }, !L.length || !CAN_WRITE]
        ]); return;
      }
      if (th) {
        e.preventDefault(); var oo = O(th.dataset.o), pr = orderPairs(oo);
        ctxOpen(e.clientX, e.clientY, cmAddItems(pr, 'заказ ' + oo.label).concat([
          ['Вставить комментарии во все позиции (' + pr.length + ')', function () { cmPaste(pr, CMCLIP); }, !CMCLIP || !CAN_WRITE],
          '-',
          ['Статус заказа', function () { ordModal(oo.id); }]
        ]).concat(colHidden().length ? colItems('ord').slice(1) : [])); return;
      }
      if (gc) {
        e.preventDefault();
        var ords = visibleOrders(), pairs = [], label = '', more = null;
        if (gc.dataset.g) {
          var g = gc.dataset.g.replace(/^code:/, ''), byCode = gc.dataset.g.indexOf('code:') === 0 || NSORT;
          OOR.positions.forEach(function (p) { if ((byCode ? nameGroup(p.name) : p.group) !== g) return; ords.forEach(function (o) { if (R[p.id].cells[o.id]) pairs.push([p, o]); }); });
          label = 'все позиции ' + g; more = ['Структура на 1 шт', function () { groupModal(gc.dataset.g); }];
        } else {
          var pp = P(gc.dataset.p); ords.forEach(function (o) { if (R[pp.id].cells[o.id]) pairs.push([pp, o]); });
          label = pp.name; more = ['Структура на 1 шт', function () { posBomModal(pp.id); }];
        }
        if (!pairs.length) return;
        var np = {}; pairs.forEach(function (x) { np[x[0].id] = 1; }); np = Object.keys(np).length;
        var no = {}; pairs.forEach(function (x) { no[x[1].id] = 1; }); no = Object.keys(no).length;
        var cnt = (np > 1 ? np + ' поз. × ' : '') + no + ' зак. = ' + pairs.length;
        ctxOpen(e.clientX, e.clientY, [['<b>' + esc(label) + '</b> — все заказы: ' + cnt, function () { }, true]].concat(cmAddItems(pairs, label + ' — все заказы'), [
          ['Вставить комментарии во все (' + pairs.length + ')', function () { cmPaste(pairs, CMCLIP); }, !CMCLIP || !CAN_WRITE],
          '-', more
        ]));
      }
    });
    /* --- перетаскивание значка: копирует все комментарии (статус, количество, инвойс, контейнер, отгрузка, текст) в другую ячейку --- */
    var DRAGCM = null;
    $('grid').addEventListener('dragstart', function (e) { var b = e.target.closest && e.target.closest('em.cmb,em.cmlab'); if (!b) return; cmTip.hidden = true; DRAGCM = [b.dataset.cp, b.dataset.co]; e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', 'cm'); } catch (x) { } document.body.classList.add('cmdrag'); });
    $('grid').addEventListener('dragend', function () { DRAGCM = null; document.body.classList.remove('cmdrag'); $('grid').querySelectorAll('.dropok').forEach(function (x) { x.classList.remove('dropok'); }); });
    $('grid').addEventListener('dragover', function (e) { if (!DRAGCM) return; var td = e.target.closest('td.cell[data-p]'); if (!td || td.classList.contains('empty')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!td.classList.contains('dropok')) { $('grid').querySelectorAll('.dropok').forEach(function (x) { x.classList.remove('dropok'); }); td.classList.add('dropok'); } });
    $('grid').addEventListener('drop', function (e) {
      if (!DRAGCM) return; var td = e.target.closest('td.cell[data-p]'); if (!td || td.classList.contains('empty')) return; e.preventDefault();
      var sp = P(DRAGCM[0]), so = O(DRAGCM[1]), tp = P(td.dataset.p), to = O(td.dataset.o); DRAGCM = null;
      if (sp === tp && so === to) return;
      var L = cmOf(sp, so); if (!L.length) return;
      cmPaste([[tp, to]], L.map(function (c) { return { st: c.st || '', qty: c.qty || 0, inv: c.inv || '', cont: c.cont || '', ship: c.ship || '', det: c.det || '', text: c.text || '' }; }));
    });
    /* --- форма комментария: одна ячейка, все позиции заказа / группы; выбор заказа и позиции из плитки «Комментарии» --- */
    function cmForm(pairs, opt) {
      opt = opt || {};
      var edit = opt.edit !== undefined && pairs.length === 1 ? cmOf(pairs[0][0], pairs[0][1])[opt.edit] : null;
      var h = head(esc(opt.title || (edit ? 'Изменить комментарий' : 'Новый комментарий')), pairs.length === 1 ? esc(pairs[0][1].label + ' · ' + pairs[0][0].name) : (pairs.length ? 'Позиций: ' + pairs.length : 'Выберите заказ и позицию'));
      if (opt.pick) {
        h += '<div class="cmpick"><label>Заказ<select id="cmPo">' + QUEUE.map(function (o) { return '<option value="' + o.id + '">' + esc(o.label + ' · ' + o.client) + '</option>'; }).join('') + '</select></label><label>Позиция<input id="cmPq" placeholder="поиск" autocomplete="off"><select id="cmPp" size="6"></select></label></div>';
      } else if (pairs.length > 1) h += '<p class="note">' + pairs.slice(0, 8).map(function (x) { return esc(x[0].name); }).join(', ') + (pairs.length > 8 ? ' и ещё ' + (pairs.length - 8) : '') + '</p>';
      h += cmFields(edit, 'f', opt.pick ? [] : cmDetNames(pairs)) + '<div class="row" style="display:flex;gap:8px"><button class="btn primary" id="cmFs">' + (edit ? 'Сохранить' : 'Добавить комментарий') + '</button><button class="btn" id="cmFc">Отмена</button></div></div>';
      openModal(h); cmFieldsBind('f', function () { if (opt.pick) { var pp = $('cmPp') && P($('cmPp').value); return pp ? [pp] : []; } return pairs.map(function (x) { return x[0]; }).filter(function (p, i, a) { return a.indexOf(p) === i; }); });
      if (pairs.length > 1 && $('cmEf')) {
        var sn = document.createElement('div'); sn.className = 'note'; sn.id = 'cmSideN'; sn.style.cssText = 'font-weight:700;margin:4px 0'; $('cmEf').closest('label').appendChild(sn);
        var upd = function () { var d = cleanSp($('cmEf').value), sd = d ? codeSide(d) : ''; if (!sd) { sn.textContent = ''; return; } var n = sidePairs(pairs, d).length; sn.textContent = 'Деталь стороны ' + sd + ' — комментарий получат ' + n + ' из ' + pairs.length + ' (позиции стороны ' + sd + ' и комплекты)'; };
        $('cmEf').addEventListener('input', upd); $('cmEf').addEventListener('change', upd);
      }
      var back = opt.back || null;
      $('cmFc').onclick = function () { if (back) back(); else closeModal(); };
      if (opt.pick) {
        var fillP = function () {
          var o = O($('cmPo').value), q = $('cmPq').value.replace(/\s+/g, '').toUpperCase();
          $('cmPp').innerHTML = OOR.positions.filter(function (p) { return R[p.id].cells[o.id] && (!q || p.name.replace(/\s+/g, '').toUpperCase().indexOf(q) >= 0); }).map(function (p, i) { return '<option value="' + p.id + '"' + (i ? '' : ' selected') + '>' + esc(p.name) + (cmOf(p, o).length ? ' · 💬' + cmOf(p, o).length : '') + '</option>'; }).join('');
        };
        var fillD = function () { var p = P($('cmPp').value), o = O($('cmPo').value), dl = $('cmELf'); if (dl && p && o) dl.outerHTML = cmDetList(cmDetNames([[p, o]]), 'f'); if ($('cmEf')) $('cmEf').dispatchEvent(new Event('change')); };
        $('cmPo').onchange = function () { fillP(); fillD(); }; $('cmPq').oninput = function () { fillP(); fillD(); }; $('cmPp').onchange = fillD; fillP(); fillD();
      }
      setTimeout(function () { var t = $('cmTf'); if (t && !opt.pick) t.focus(); }, 30);
      $('cmFs').onclick = function () {
        var c = cmRead('f');
        if (!c.text && !c.st && !c.inv && !c.cont && !c.qty && !c._kg && !c.ship && !c.det) { $('cmTf').focus(); return; }
        var prs = pairs;
        if (opt.pick) { var o = O($('cmPo').value), p = P($('cmPp').value); if (!o || !p) { $('cmPq').focus(); return; } prs = [[p, o]]; }
        if (edit) {
          var p0 = prs[0][0], o0 = prs[0][1], L = cmOf(p0, o0).slice(), old = L[opt.edit];
          L[opt.edit] = cmClean(Object.assign({}, old, cmKgApply(Object.assign({}, c), p0), { ets: Date.now(), eby: ME || '' }));
          cmSave(p0, o0, L, 'Изменён комментарий: ' + o0.label + ' · ' + p0.name + ' — было: ' + cmDesc(old) + ' → стало: ' + cmDesc(L[opt.edit]));
        } else {
          c.ts = Date.now(); c.by = ME || '';
          var prs0 = prs.length; prs = sidePairs(prs, c.det); var sideCut = prs0 - prs.length;
          var c0 = cmKgApply(Object.assign({}, c), prs[0][0]);
          cmSaveMany(prs, function (L, pp) { return L.concat([cmClean(cmKgApply(Object.assign({}, c), pp))]); }, 'Комментарий' + (prs.length > 1 ? ' в ' + prs.length + ' позиций' : '') + ': ' + prs[0][1].label + ' · ' + (prs.length > 1 ? prs.slice(0, 3).map(function (x) { return x[0].name; }).join(', ') + (prs.length > 3 ? ' …' : '') : prs[0][0].name) + ' — ' + cmDesc(c0));
        }
        render(); if (back) back(); else closeModal();
        showMsg(edit ? 'Комментарий изменён.' : 'Комментарий добавлен' + (prs.length > 1 ? ' в ' + prs.length + ' позиций' : '') + '.' + (!edit && sideCut ? ' Деталь стороны ' + esc(codeSide(c.det)) + ' — пропущено позиций другой стороны: ' + sideCut + '.' : ''), 'good');
      };
    }

    /* xlsx с границами: свой маленький писатель (SheetJS CE границы не пишет) */
    function xlsxBuild(sheets) {
      var X = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); };
      var col = function (i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
      var cfb = XLSX.CFB.utils.cfb_new(), add = function (p, s) { XLSX.CFB.utils.cfb_add(cfb, p, new TextEncoder().encode(s)); };
      var wbS = '', relS = '', ctS = '';
      sheets.forEach(function (sh, si) {
        var n = si + 1, rows = sh.rows, hdr = sh.header || {}, bord = sh.border || function () { return true; };
        var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"' + (sh.freeze ? '><pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView>' : '/>') + '</sheetViews>';
        if (sh.cols) x += '<cols>' + sh.cols.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
        x += '<sheetData>';
        rows.forEach(function (r, ri) {
          x += '<row r="' + (ri + 1) + '">';
          (r || []).forEach(function (v, ci) {
            var b = bord(ri, ci, v), hd = hdr[ri], s = hd ? (b ? 2 : 3) : (b ? 1 : 0), ref = col(ci) + (ri + 1);
            if (v === null || v === undefined || v === '') { if (s) x += '<c r="' + ref + '" s="' + s + '"/>'; return; }
            if (typeof v === 'number' && isFinite(v)) x += '<c r="' + ref + '" s="' + s + '"><v>' + v + '</v></c>';
            else x += '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + X(v) + '</t></is></c>';
          });
          x += '</row>';
        });
        x += '</sheetData></worksheet>';
        add('xl/worksheets/sheet' + n + '.xml', x);
        wbS += '<sheet name="' + X(String(sh.name).slice(0, 31)) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
        relS += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
        ctS += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      });
      var k = sheets.length + 1;
      add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + ctS + '</Types>');
      add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
      add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbS + '</sheets></workbook>');
      add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + relS + '<Relationship Id="rId' + k + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
      add('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
      return XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' });
    }

    function saveBinary(name, buf, mimeExt) {
      var viaAnchor = function () { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
      var inArtifact = window.claude && window.claude.use;
      return Promise.resolve(inArtifact ? window.claude.use('downloads') : null).then(function (dl) { if (dl) return dl.save({ filename: name, data: buf }); viaAnchor(); });
    }
    function orderTemplate(m) {
      var aoa = [['Номер заказа', m.label || ''], ['Клиент', m.client || ''], ['Дата заказа (ДД.ММ.ГГГГ)', m.created || todayRu()], ['Срок (ДД.ММ.ГГГГ)', m.due || ''], ['Код заказа', m.code || ''], [],
      ['Группа', 'Название товара', 'Заказ, шт', 'В резерве, шт']];
      var have = {}; (m.items || []).forEach(function (it) { if (it.name) have[cleanSp(it.name).toUpperCase()] = it; });
      OOR.positions.forEach(function (p) { var it = have[p.key]; aoa.push([p.group, p.name, it ? it.q : '', it ? (it.r || '') : '']); delete have[p.key]; });
      Object.keys(have).forEach(function (k) { var it = have[k]; aoa.push(['', it.name, it.q, it.r || '']); });
      /* все границы таблицы — свой писатель xlsx (шапка заказа и таблица позиций в рамках) */
      return xlsxBuild([{ name: 'Заказ', rows: aoa, cols: [28, 52, 12, 14], header: { 6: 1 }, freeze: 7, border: function (r) { return r !== 5; } }]);
    }
    function parseOrderFile(rows) {
      var m = { label: '', client: '', created: '', due: '', code: '', items: [] }, hr = -1, cN = -1, cQ = -1, cR = -1;
      var dv = function (v) { if (v instanceof Date) return fmtDateRu(v); if (typeof v === 'number' && v > 30000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 86400000)); return fmtDateRu(d); } return cleanSp(v); };
      rows.forEach(function (r, i) {
        r = r || []; var a = cleanSp(r[0]);
        if (hr < 0) {
          if (/^номер заказа/i.test(a)) m.label = cleanSp(r[1]);
          else if (/^клиент/i.test(a)) m.client = cleanSp(r[1]);
          else if (/^дата заказа/i.test(a)) m.created = dv(r[1]);
          else if (/^срок/i.test(a)) m.due = dv(r[1]);
          else if (/^код/i.test(a)) m.code = cleanSp(r[1]);
          var n = -1, q = -1, rr = -1;
          r.forEach(function (c, j) { var t = cleanSp(c).toLowerCase(); if (n < 0 && /назван|номенклатур|товар|позици/.test(t)) n = j; else if (/резерв/.test(t)) rr = j; else if (q < 0 && /заказ|кол-?во|количеств/.test(t) && !/номер/.test(t)) q = j; });
          if (n >= 0 && q >= 0) { hr = i; cN = n; cQ = q; cR = rr; }
          return;
        }
        var nm = cleanSp(r[cN]), qv = numLike(r[cQ]), rv = cR >= 0 ? numLike(r[cR]) : 0;
        if (nm && qv > 0) m.items.push({ name: nm, q: qv, r: rv > 0 ? rv : '' });
      });
      if (hr < 0) rows.forEach(function (r) { r = r || []; var nm = cleanSp(r[0]), qv = numLike(r[1]); if (nm && qv > 0) m.items.push({ name: nm, q: qv, r: numLike(r[2]) > 0 ? numLike(r[2]) : '' }); });
      return m;
    }

    /* ================= правка остатков в блоке Обработки ================= */
    var OBSIG = '', CURMODAL = null;
    function obsKey(nm) { return cleanSp(nm).toUpperCase().replace(/К/g, 'K'); }
    function wrapObs(OB) {
      var best0 = OB.best, memo = {};
      OB.best = function (nm) {
        var b = best0(nm), ks = Object.keys(OV.obs || {});
        if (!b || !ks.length || !OB.found(b)) return b;
        var mk = nm + '\u0001' + OBSIG; if (memo[mk]) return memo[mk];
        var hit = false;
        var rows = b.rows.map(function (r) {
          var v = null, ed = null;
          for (var c = 3; c < r.v.length; c += 2) {
            var n = r.v[c]; if (n === null || n === undefined || n === '') continue;
            var k = obsKey(n); if (!(k in OV.obs)) continue;
            if (!v) { v = r.v.slice(); ed = []; }
            ed.push(c + 1); v[c + 1] = OV.obs[k]; hit = true;
          }
          return v ? Object.assign({}, r, { v: v, obsEd: ed }) : r;
        });
        var nb = hit ? Object.assign({}, b, { rows: rows, rawRows: b.rows }) : b;
        memo[mk] = nb; return nb;
      };
    }
    function obsHits(p) { var b = blockOf(p); return !!(b && b.rawRows); }
    function setObsEdit(key, name, raw, orig) {
      var s0 = String(raw).trim().replace(/\s+/g, '').replace(',', '.'), from = (key in OV.obs) ? OV.obs[key] : orig, val, del;
      if (s0 === '') { val = orig; del = true; } else { val = parseFloat(s0); if (!isFinite(val)) return Promise.reject(new Error('нужно число')); del = orig !== null && orig !== undefined && Math.abs(val - orig) < 1e-9; }
      if (val === from && del === !(key in OV.obs)) return Promise.resolve(false);
      var id = 'e' + hash('obs|' + key), ts = Date.now();
      if (del) { delete OV.obs[key]; delete OVMETA[id]; } else { OV.obs[key] = val; OVMETA[id] = { ts: ts, by: ME }; }
      var hst = { ts: ts, by: ME, kind: 'edit', t: 'obs', k: key, orig: orig, field: 'Остаток в блоке Обработки', pos: name, ord: '', from: from, to: val };
      HIST.unshift(hst);
      return persistEdit(id, 'obs', key, del ? null : val, { name: name }, null, ts).then(function () { return persistHist(hst); }).then(function () { return true; });
    }
    /* перерисовать открытое окно, сохранив раскрытые разделы и прокрутку */
    function reopenKeep() {
      if (!CURMODAL || !ov.classList.contains('on')) return;
      var lab = function (d) { var s = d.querySelector('summary'); return s ? s.textContent.replace(/[\d\s]+/g, ' ').trim().slice(0, 40) : ''; };
      var open = {}; modal.querySelectorAll('details').forEach(function (d) { open[lab(d)] = d.open; });
      var sc = ov.scrollTop, inner = Array.prototype.map.call(modal.querySelectorAll('.scroll'), function (x) { return [x.scrollTop, x.scrollLeft]; });
      CURMODAL();
      modal.querySelectorAll('details').forEach(function (d) { var k = lab(d); if (k in open) d.open = open[k]; });
      modal.querySelectorAll('.scroll').forEach(function (x, i) { if (inner[i]) { x.scrollTop = inner[i][0]; x.scrollLeft = inner[i][1]; } });
      ov.scrollTop = sc;
    }
    function obsCellEdit(td) {
      if (td.querySelector('input')) return;
      var name = td.dataset.n, key = obsKey(name), orig = td.dataset.o === '' ? null : +td.dataset.o, cur = td.dataset.v;
      td.innerHTML = '<input class="obi" type="number" step="any" value="' + esc(cur) + '">';
      var inp = td.querySelector('input'), done = false; inp.focus(); inp.select();
      var finish = function (save) {
        if (done) return; done = true;
        if (!save || String(inp.value).trim() === String(cur)) { reopenKeep(); return; }
        setObsEdit(key, name, inp.value, orig).then(function (ch) {
          recalc(); reopenKeep();
          if (ch) showMsg('Остаток «' + esc(name) + '» в блоке изменён — сравнение позиций и статусы пересчитаны.', 'good');
        }, function (e) { showMsg('Не сохранено: ' + esc(e.message || e), 'err'); reopenKeep(); });
      };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
      inp.addEventListener('blur', function () { finish(true); });
    }
    document.addEventListener('click', function (e) { var td = e.target.closest && e.target.closest('#modal td.obv'); if (td && CAN_WRITE) { e.stopPropagation(); obsCellEdit(td); } });

    /* ================= окна ================= */
    var ov = $('ov'), modal = $('modal');
    function openModal(h, wide) { delete modal.dataset.cell; modal.className = 'modal' + (wide ? ' wide' : ''); modal.innerHTML = h; ov.classList.add('on'); modal.querySelector('.x').onclick = closeModal; ov.scrollTop = 0; }
    function closeModal() { ov.classList.remove('on'); }
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !document.querySelector('.inl')) closeModal(); });
    function head(t, m) { return '<div class="mh"><div><h2>' + t + '</h2><div class="meta">' + m + '</div></div><button class="x" title="Закрыть">×</button></div><div class="mb">'; }
    function oLabel(o) { return esc(o.fullLabel || ('Заказ ' + o.label)) + ' (' + esc(o.label) + ')'; }

    function td2Table(r) {
      if (!r.td2rows.length) return '';
      var h = '<table class="mini"><tr><th>Строка TDSheet2</th><th>Склад (кол. J)</th><th class="n">Остаток (кол. G)</th><th>Учтено</th></tr>';
      r.td2rows.forEach(function (x) { h += '<tr class="' + (x.excl ? 'ex' : '') + '"><td class="ref">G' + x.row + '</td><td>' + esc(x.wh) + '</td><td class="n">' + (x.qty === null ? '—' : fmt(x.qty)) + '</td><td>' + (x.excl ? 'нет — некондиция / отходы / брак' : 'да') + '</td></tr>'; });
      return h + '<tr><td colspan="2"><b>Итого по TDSheet2</b></td><td class="n"><b>' + fmt(r.stock0) + '</b></td><td></td></tr></table>' + (r.stockEdited ? '<p class="note"><span class="pill ed">изменено вручную</span> В расчёте используется ' + fmt(r.stock) + '.</p>' : '');
    }
    function semiBox(p) {
      var s = semiInfo(TD2, p.name); if (!s.length) return '';
      return '<h3>Справочно: полуфабрикат «-50» в TDSheet2 (в расчёт не входит)</h3><table class="mini"><tr><th>Номенклатура</th><th class="n">Остаток</th></tr>' +
        s.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="n">' + fmt(x.stock) + '</td></tr>'; }).join('') + '</table>';
    }
    function modelBox(p) {
      var md = modelOf(p);
      var h = '<h3>Модель авто (Cross Codes)</h3>';
      if (md.edited) h += '<p class="note"><span class="pill ed">изменено вручную</span> ' + esc(md.text) + '</p>';
      if (!md.ent.length) return h + '<div class="box note">Код TRT не найден в базе Cross Codes.</div>';
      md.ent.forEach(function (e, i) {
        var cars = e.car.split('\n'), mods = e.model.split('\n'), yrs = e.years.split('\n'), n = Math.max(cars.length, mods.length, yrs.length);
        h += '<div class="box" style="margin-bottom:8px"><b>' + esc(md.codes[i]) + '</b> · ' + esc(e.ru) + (e.w !== null ? ' · вес ' + fmt(e.w) + ' кг' : '') + ' <span class="ref">(' + (e.src === 'SS' ? 'TRT_SS' : 'TRT_RP') + ', строка ' + e.row + ')</span>' +
          '<table class="mini" style="margin-top:6px"><tr><th>Марка / автомобиль</th><th>Модель</th><th>Годы</th></tr>';
        for (var j = 0; j < n; j++) if ((cars[j] || mods[j] || yrs[j] || '').trim()) h += '<tr><td>' + esc(cars[j] || '') + '</td><td>' + esc(mods[j] || '') + '</td><td>' + esc(yrs[j] || '') + '</td></tr>';
        h += '</table>' + (e.oem ? '<p class="note">OEM: ' + esc(e.oem.replace(/\n/g, ', ')) + '</p>' : '') + '</div>';
      });
      return h;
    }
    function ordersTable(p, curId) {
      var r = R[p.id], i = 0, T = { q: 0, rv: 0, need: 0, fg: 0, semi: 0, prod: 0, sh: 0 };
      var h = '<table class="mini"><tr><th>#</th><th>Заказ</th><th>Клиент</th><th>Дата</th><th class="n">Заказ</th><th class="n">Резерв</th><th class="n">Нужно</th><th class="n">Склад</th><th class="n">П/ф</th><th class="n">Произв.</th><th class="n">Не хватает</th></tr>';
      QUEUE.forEach(function (o) {
        var c = r.cells[o.id]; if (!c) return; i++;
        var a = AC(p, o) || { fg: c.give, semi: 0, prod: 0, short: c.short };
        T.q += c.q; T.rv += c.rv; T.need += c.need; T.fg += a.fg; T.semi += a.semi; T.prod += a.prod; T.sh += a.short;
        h += '<tr class="go ' + (o.id === curId ? 'cur' : '') + '" data-p="' + p.id + '" data-o="' + o.id + '"><td>' + i + '</td><td>' + esc(o.label) + ((c.qE || c.rE) ? ' <span class="pill ed">правка</span>' : '') + '</td><td>' + esc(o.client) + '</td><td>' + esc(o.created) + '</td><td class="n">' + fmt(c.q) + '</td><td class="n">' + fmt(c.rv) + '</td><td class="n">' + fmt(c.need) + '</td><td class="n">' + fmt(a.fg) + '</td><td class="n">' + (a.semi ? fmt(a.semi) : '—') + '</td><td class="n">' + (a.prod ? fmt(a.prod) : '—') + '</td><td class="n" style="color:' + (a.short ? 'var(--bad)' : 'inherit') + '">' + (a.short ? fmt(a.short) : '—') + '</td></tr>';
      });
      return h + '<tr><td colspan="4"><b>Итого</b></td><td class="n"><b>' + fmt(T.q) + '</b></td><td class="n"><b>' + fmt(T.rv) + '</b></td><td class="n"><b>' + fmt(T.need) + '</b></td><td class="n"><b>' + fmt(T.fg) + '</b></td><td class="n"><b>' + fmt(T.semi) + '</b></td><td class="n"><b>' + fmt(T.prod) + '</b></td><td class="n" style="color:var(--bad)"><b>' + (T.sh ? fmt(T.sh) : '—') + '</b></td></tr></table>';
    }
    function bindGo() { modal.querySelectorAll('tr.go').forEach(function (tr) { tr.onclick = function () { tr.dataset.o ? cellModal(tr.dataset.p, tr.dataset.o) : posModal(tr.dataset.p); }; }); }
    function editNote(field, p, o) {
      var e = OVMETA[ovId(field, p, o)];
      return e ? '<p class="note"><span class="pill ed">изменено вручную</span> ' + esc(nowStr(e.ts)) + ' · ' + esc(whoName(e.by)) + '</p>' : '';
    }

    function groupShort(p) {
      var list = OOR.positions.filter(function (x) { return x.group === p.group && R[x.id].ts > 0; });
      var s = 0; list.forEach(function (x) { s += R[x.id].ts; });
      return { sum: s, list: list };
    }
    var ENGINE = null, VERIFY = null, OBUILD = null, BLKC = {};
    /* после «Обновить склад»: остатки TDSheet (E) и NEP (C) берём из нового склада; было в старом складе, а в новом нет — 0 */
    function freshSt(st, FR) { if (!st) return; Object.keys(st).forEach(function (k) { var e = TD2.idx[k]; if (e) { var s = 0; e.rows.forEach(function (x) { if (!x.excl && x.qty !== null) s += x.qty; }); st[k] = s; } else if (FR[k]) st[k] = 0; }); }
    function buildEngine() {
      ENGINE = null; VERIFY = null; OBUILD = null; BLKC = {}; BOMX = null; OBRX = BASE && BASE.obr ? indexObr(BASE.obr) : null;
      BOM_OV = {}; var ukg = {}, sk = function (t) { return cleanSp(t).toUpperCase().replace(/\s+/g, ''); };
      Object.keys(OV.bom || {}).forEach(function (k) { var v = OV.bom[k]; if (!(v > 0)) return; if (k.indexOf('N|') === 0) BOM_OV[k.slice(2)] = v; else if (k.indexOf('S|') === 0) BOM_OV[k] = v; else if (k.indexOf('K|') === 0) { var a = k.split('|'); ukg[sk(a[1]) + '|' + sk(a[2])] = v; } });
      if (!BASE || !BASE.struct) return;
      var K0 = EMBEDDED.kgdb, KGD = { kg: BASE.kgsh && BASE.kgsh.kg ? Object.assign({}, K0.kg, BASE.kgsh.kg) : K0.kg, bush: K0.bush, spec: K0.spec, specInfo: K0.specInfo, ukg: ukg };
      var S = expandStruct(effStruct()), tds = {}, FR = null;
      if (BASE.stockUpd && BASE.stockUpd.bookKeys) { FR = {}; BASE.stockUpd.bookKeys.forEach(function (k) { FR[k] = 1; }); freshSt(S.tdsSt, FR); freshSt(S.nepSt, FR); }
      Object.keys(S.tds).forEach(function (k) { tds[k] = { name: S.tds[k][0], kids: S.tds[k][1] }; });
      Object.keys(S.nep).forEach(function (k) { if (!tds[k]) tds[k] = { name: S.nep[k][0], kids: S.nep[k][1] }; });
      ENGINE = makeEngine(tds, TD2, KGD, S.nepSt, S.tdsSt, S.matRef);
      if (S.raw) { OBUILD = makeObrBuilder({ td: S.raw.td, nep: S.raw.nep.concat(specNepRows(K0.spec, S.raw.td, S.raw.nep, TD2.rows)), td2: TD2.rows, bush: K0.bush, matRef: S.matRef2, fresh: FR, disasm: BASE.disasm ? BASE.disasm.map : null, alias: BASE.alias || null }); wrapObs(OBUILD); }
      if (!OBUILD || !OBRX) return;
      if (FR) { VERIFY = { n: 0, ok: 0, bad: [], cn: 0, cok: 0, c1: 0, fresh: true }; return; }
      // самопроверка: каждый блок листа Обработка строится программой заново и сравнивается построчно; итог - с листом Расчёт
      var M = BASE.macro, V = { n: 0, ok: 0, bad: [], cn: 0, cok: 0, c1: 0 };
      Object.keys(OBRX.byProd).forEach(function (k) {
        var sh = OBRX.byProd[k]; if (!sh.rows.some(function (r) { return r.cls === 'Y' || r.cls === 'X'; })) return;
        V.n++;
        var b = OBUILD.build(sh.name), c = compareObrBlocks(b.rows, sh.rows);
        if (c.same) V.ok++; else V.bad.push(sh.name + ' — строк с расхождением: ' + c.diffs.length);
        var it = M && M.items[k];
        if (it && it.ras && it.ras.roots && it.ras.roots.length) {
          V.cn++;
          var res = computeTree(b.rows, sh.name, ENGINE.kgPerPc), worst = 0, okAll = !!res;
          it.ras.roots.forEach(function (rt) {
            var mm = (rt.summary || '').match(/= ([\d\s ]+) шт$/), exp = mm ? parseInt(mm[1].replace(/\D/g, ''), 10) : null;
            var node = res ? res.items.filter(function (x) { return x.cls === 'Y' && normKey(x.nm) === normKey(rt.name); })[0] : null;
            if (!node || exp === null) { okAll = false; return; }
            worst = Math.max(worst, Math.abs(Math.floor(node.vl) - exp));
          });
          if (okAll && worst === 0) V.cok++; else if (okAll && worst <= 1) V.c1++;
        }
      });
      VERIFY = V;
    }
    function verifyNote() {
      if (!VERIFY || !VERIFY.n) return '';
      return ' · самопроверка по книге: блоки Обработки ' + VERIFY.ok + ' из ' + VERIFY.n + ' совпадают построчно' + (VERIFY.cn ? '; итог «можно произвести» совпадает с листом Расчёт в ' + VERIFY.cok + ' из ' + VERIFY.cn + (VERIFY.c1 ? ' (ещё ' + VERIFY.c1 + ' — разница 1 шт из-за округления среднего кг/шт)' : '') : '');
    }
    function blockOf(p) { if (!(p.id in BLKC)) BLKC[p.id] = OBUILD ? blockForPosition(p, ENGINE, OBRX, OBUILD) : null; return BLKC[p.id]; }
    var CLS_BG = { Y: '#FFFF00', YA: '#BFBFBF', B: '#9BC2E6', BL: '#DDEBF7', O6: '#F4B183', O8: '#F8CBAD', X: '#FFC7CE' };
    var CLS_TXT = { Y: 'полуфабрикат', YA: 'доп. полуфабрикат (S/без S)', B: 'основная деталь', BL: 'вариант M / S / GM', O6: 'вложенный полуфабрикат', O8: 'деталь вложенного', X: 'не найдено' };
    function obrBlockBox(p) {
      var blk = blockOf(p);
      if (!blk) return '';
      var chk = blk.check, h = '<h3>Блок Обработки — построен программой</h3><p class="note">';
      if (chk) h += chk.same ? '<span class="pill ok">совпадает с листом Обработка</span>'
        : '<span class="pill warn">расходится с листом Обработка: ' + chk.diffs.length + ' из ' + chk.n + ' строк</span>';
      else h += '<span class="pill res">' + (BASE.stockUpd ? 'склад обновлён — без сверки с листом Обработка' : 'без сверки') + '</span>';
      if (blk.rawRows) h += ' <span class="pill ed">остатки изменены вручную</span>';
      if (blk.alias && blk.brand === 'RS') h += ' <span class="pill res">RS — коробка, полуфабрикат ' + esc(blk.rows[0] ? blk.rows[0].v[3] : blk.alias + '-50') + '</span>';
      else if (blk.alias) h += ' <span class="pill res">полуфабрикат по коду ' + esc(blk.alias) + '</span>';
      h += '</p>';
      var mx = 2; blk.rows.forEach(function (r) { mx = Math.max(mx, r.v.length - 3); });
      if (mx % 2) mx++;
      var bad = {}; if (chk) chk.diffs.forEach(function (d) { bad[d.i] = d; });
      /* узкое место (25.11): строки позиции, на которой останавливается производство, — светло-красная заливка */
      var BOT = {}, bres = null; try { bres = ENGINE ? computeTree(blk.rows, p.name, ENGINE.kgPerPc) : null; } catch (x) { bres = null; }
      var bkit = bres && bres.roots && bres.roots.length > 1 && bres.botRows && bres.botRows.length, bwr = bkit ? bres.items[bres.worst] : null;
      if (bres && bres.botRows) bres.botRows.forEach(function (ri) { BOT[ri] = 1; });
      if (bwr) BOT[bwr.ri] = 1; /* комплект: и полуфабрикат, который даёт меньше всего комплектов */
      if (bres && bres.bottle && bres.botRows && bres.botRows.length) h = h.replace(/<\/p>$/, ' <span class="pill bad" title="Позиция с наименьшим выпуском — на ней останавливается производство">узкое место: ' + esc((bwr ? bwr.nm + ' > ' : '') + bres.bottle) + '</span></p>');
      h += '<div class="scroll" style="max-height:48vh"><table class="ob"><tr><th>Полуфабрикат / Детали</th><th>Остаток</th>';
      for (var k = 1; k < mx / 2; k++) h += '<th>Под деталь - ' + k + '</th><th>Остаток</th>';
      h += '</tr>';
      blk.rows.forEach(function (r, i) {
        var d = bad[i], title = d ? ' title="' + esc('В листе Обработка: ' + (d.exp.join(' | ') || '(пусто)') + (d.ec !== d.gc ? ' [цвет ' + (CLS_TXT[d.ec] || d.ec || '—') + ']' : '')) + '"' : '';
        var bot = BOT[i], lastC = 3; if (bot) for (var c2 = 3; c2 < r.v.length; c2++) if (r.v[c2] !== null && r.v[c2] !== undefined && String(r.v[c2]) !== '') lastC = c2;
        h += '<tr' + (d || bot ? ' class="' + (d ? 'df' : '') + (bot ? ' obot' : '') + '"' : '') + title + '>';
        for (var c = 3; c < 3 + mx; c++) {
          var v = r.v[c], isName = (c - 3) % 2 === 0, st = '', cls = isName ? '' : 'v';
          if (c === 3 && CLS_BG[r.cls]) st = ' style="background:' + CLS_BG[r.cls] + '" title="' + esc(CLS_TXT[r.cls]) + '"';
          if (isName && r.ref && r.ref.indexOf(c) >= 0) { cls = 'bref'; st += ' title="материал из «Справочник Втулки состав»"'; }
          var txt = v === null || v === undefined ? '' : (typeof v === 'number' ? fmt(v) : esc(v)), da = '';
          if (!isName) {
            var nm = r.v[c - 1];
            if (nm !== null && nm !== undefined && cleanSp(nm) && !isPcsNote(cleanSp(nm)) && cleanSp(nm) !== '-') {
              var ro = blk.rawRows && blk.rawRows[i] ? blk.rawRows[i].v[c] : v, edd = r.obsEd && r.obsEd.indexOf(c) >= 0;
              if (CAN_WRITE) { cls += ' obv'; da = ' data-n="' + esc(cleanSp(nm)) + '" data-v="' + (typeof v === 'number' ? v : '') + '" data-o="' + (typeof ro === 'number' ? ro : '') + '"'; }
              if (edd) { cls += ' obed'; st += ' title="' + esc('Изменено вручную. По книге: ' + (typeof ro === 'number' ? fmt(ro) : '—')) + '"'; }
            }
          }
          if (bot && c <= lastC) { cls += ' botc'; if (c === 3) st = st.replace(/background:([^"]+)"/, 'box-shadow:inset 6px 0 0 $1"'); if (st.indexOf('title=') < 0) st += ' title="Узкое место — здесь останавливается производство"'; }
          h += '<td class="' + cls + '"' + st + da + '>' + txt + '</td>';
        }
        h += '</tr>';
      });
      h += '</table></div>';
      if (chk && chk.diffs.length) {
        h += '<details><summary style="cursor:pointer;color:var(--navy);font-weight:600">Расхождения с листом Обработка (' + chk.diffs.length + ')</summary><table class="mini" style="margin-top:6px"><tr><th>Строка блока</th><th>Лист Обработка (макрос)</th><th>Программа</th></tr>' +
          chk.diffs.slice(0, 40).map(function (d) { return '<tr><td class="n">' + (d.i + 1) + '</td><td>' + esc(d.exp.join(' | ') || '—') + (d.ec !== d.gc ? ' <span class="note">[' + esc(CLS_TXT[d.ec] || d.ec || '—') + ']</span>' : '') + '</td><td>' + esc(d.got.join(' | ') || '—') + (d.ec !== d.gc ? ' <span class="note">[' + esc(CLS_TXT[d.gc] || d.gc || '—') + ']</span>' : '') + '</td></tr>'; }).join('') + '</table></details>';
      }

      return h;
    }
    /* «Из чего складывается»: каждая деталь с новой строки, « +» между ними; у детали с цепочкой — «=» и пояснение строкой ниже */
    function partsHtml(parts) {
      return parts.map(function (pt, i) {
        var last = i === parts.length - 1;
        return '<div class="pt">' + pt.t + (pt.nt ? ' =<div class="pnt">' + pt.nt + (last ? '' : ' +') + '</div>' : (last ? '' : ' +')) + '</div>';
      }).join('');
    }
    /* текст из листа Расчёт: делим по « + » вне скобок */
    function memoHtml(m) {
      var out = [], cur = '', d = 0, s = String(m || '');
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if (ch === '(') d++; else if (ch === ')') d = Math.max(0, d - 1);
        if (d === 0 && s.substr(i, 3) === ' + ') { out.push(cur); cur = ''; i += 2; continue; }
        cur += ch;
      }
      out.push(cur);
      return partsHtml(out.map(function (x) { var k = x.indexOf(' ('); var pc = function (y) { y = y.replace(/\s+$/, ''); return /\d$/.test(y) ? y + ' шт' : y; }; return k > 0 && /\)\s*$/.test(x) ? { t: esc(pc(x.slice(0, k))), nt: esc(x.slice(k + 1)) } : { t: esc(pc(x)), nt: '' }; }));
    }
    /* «Детали 01–06» — расчёт программы по блоку (как в листе Order, весь склад без очереди) */
    var GRP_T = { '01': 'Корпус', '02': 'Палец', '03': 'Сухарь', '04': 'Пыльник', '06': 'Пятак' };
    /* группа детали 01–08 по названию: последняя «-0N» перед «/», пробелом, «-» или концом (RS 7016-20-01/13 → 01) */
    function grpOf(nm) { var re = /-(\d{2})(?=[\/\s-]|$)/g, m, last = ''; nm = cleanSp(nm).toUpperCase(); while ((m = re.exec(nm))) if (/^0[1-8]$/.test(m[1])) last = m[1]; return last; }
    function det0106(p, res) {
      var r = R[p.id], need = r.tn || 0, fg = Math.max(0, r.stock), secs = [], multi = res.roots.length > 1;
      res.roots.forEach(function (rt) {
        var it = res.items[rt.i], seen = {}, cards = [];
        secs.push({ nm: it.nm, kn: rt.kn, cards: cards });
        (it.pos || []).forEach(function (ps) {
          if (seen[ps.pk]) return; seen[ps.pk] = 1;
          var g = '', L = [], cdn = 1, sumRaw = 0, shW = 0, shN = 0;
          res.items.forEach(function (x) { if (x.par !== rt.i || x.pk !== ps.pk) return; if (!g) g = grpOf(x.nm); if (!x.kgpc && (x.dn || 1) > cdn) cdn = x.dn; if (x.shared) { shW = Math.max(shW, x.shared.W); shN = Math.max(shN, x.shared.cnt); } });
          if (!g) g = grpOf(ps.pk);
          res.items.forEach(function (x) {
            if (x.par !== rt.i || x.pk !== ps.pk) return;
            /* общая деталь комплекта — весь её остаток (с цепочкой), потребность — по всем полуфабрикатам комплекта */
            var pcs = x.shared ? x.shared.total : cdn > 1 ? (x.raw !== undefined ? x.raw : x.vl * cdn) : x.vl; sumRaw += pcs;
            var t = (L.length ? '+ ' : '') + x.nm + ' - ' + f0(pcs) + ' шт';
            if (x.kgpc) t += '\n(' + fmt(x.kg) + ' кг / ' + fmtQ(x.kgpc.v) + ' кг/шт)';
            else if (x.chain && x.chain.links && x.chain.links.length) {
              var ls = x.chain.links.filter(function (l, li) { return !(li === 0 && normKey(l.name) === normKey(x.nm)); });
              t += '\n(' + f0(x.own) + ' шт ост-к.)';
              ls.forEach(function (l) { t += '\n(' + l.name + ' - ' + (l.mat ? fmt(l.kg) + ' кг' + (l.kgpc ? ' / ' + fmtQ(l.kgpc) + ' кг = ' + f0(l.val) + ' шт' : '') : f0(l.val) + ' шт') + ')'; });
            } else if (x.cont) t += '\n(свой ' + f0(x.own) + ' шт + из деталей)';
            L.push(t);
          });
          var nd = need * rt.kn, left = Math.floor(ps.sum) - nd + fg, tot;
          if (shW > 1) {
            /* как в листе Order: потребность группы = заказ × полуфабрикатов на комплект × деталей на полуфабрикат, по всем полуфабрикатам, где деталь общая */
            left = Math.floor(sumRaw) - need * shW + fg * shW;
            tot = 'Всего: ' + f0(sumRaw) + ' - ' + f0(need) + ' x' + shW + ' (по ' + shW + ' шт на 1 комплект' + (shN > 1 ? ', общая для ' + shN + ' полуфабрикатов' : '') + ')' + (fg ? ' + ' + f0(fg * shW) + ' (готовая)' : '') + ' = ' + (left >= 0 ? f0(left) + ' остаток' : 'не хватает ' + f0(-left) + ' шт');
          } else if (rt.kn * cdn > 1 && rt.kn > 1) {
            left = Math.floor(sumRaw) - need * rt.kn * cdn + fg * rt.kn * cdn;
            tot = 'Всего: ' + f0(sumRaw) + ' - ' + f0(need) + ' x' + (rt.kn * cdn) + ' (по ' + (rt.kn * cdn) + ' шт на 1 комплект)' + (fg ? ' + ' + f0(fg * rt.kn * cdn) + ' (готовая)' : '') + ' = ' + (left >= 0 ? f0(left) + ' остаток' : 'не хватает ' + f0(-left) + ' шт');
          } else if (cdn > 1) {
            /* как в листе Order: в штуках деталей — «− заказ x2 (по 2 шт на 1 шт)» */
            left = Math.floor(sumRaw) - nd * cdn + fg * cdn;
            tot = 'Всего: ' + f0(sumRaw) + ' - ' + f0(need) + ' x' + (rt.kn * cdn) + ' (по ' + cdn + ' шт на 1 шт)' + (fg ? ' + ' + f0(fg * cdn) + ' (готовая)' : '') + ' = ' + (left >= 0 ? f0(left) + ' остаток' : 'не хватает ' + f0(-left) + ' шт');
          } else tot = 'Всего: ' + f0(ps.sum) + ' - ' + f0(need) + (rt.kn > 1 ? ' x' + rt.kn : '') + ' (заказ)' + (fg ? ' + ' + f0(fg) + ' (готовая)' : '') + ' = ' + (left >= 0 ? f0(left) + ' остаток' : 'не хватает ' + f0(-left) + ' шт');
          cards.push({ g: g || '99', title: GRP_T[g] ? g + '-' + GRP_T[g] : ps.pk.replace(/^MAT\|/, ''), text: L.join('\n') + '\n------------------\n' + tot, bad: left < 0, edited: false });
        });
      });
      if (!secs.some(function (x) { return x.cards.length; })) return '';
      var h = '<h3>Детали 01–06' + (multi ? ' — по каждому полуфабрикату (' + secs.length + ')' : '') + '</h3>';
      secs.forEach(function (sc) {
        if (!sc.cards.length) return;
        sc.cards.sort(function (a, b) { return a.g < b.g ? -1 : a.g > b.g ? 1 : 0; });
        var bad = sc.cards.some(function (c) { return c.bad; });
        if (multi) h += '<div class="d06h' + (bad ? ' bad' : '') + '">' + esc(sc.nm) + (sc.kn > 1 ? ' <span>× ' + sc.kn + ' на комплект</span>' : '') + '</div>';
        h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:10px">';
        sc.cards.forEach(function (c) { h += '<div class="box" style="' + (c.bad ? 'border-color:#f0b4b4;background:var(--bad-bg)' : '') + '"><b>' + esc(c.title) + '</b><div class="pre note" style="color:var(--ink);margin-top:4px">' + esc(c.text) + '</div></div>'; });
        h += '</div>';
      });
      return h;
    }
    function builtBox(p, h, gsum) {
      var blk = blockOf(p);
      if (!blk && /^Рычаг/i.test(cleanSp(p.name))) return h + '<div class="box"><span class="pill res">готовый товар</span> Рычаг — готовый товар без состава: учитываются только склад и резерв, производство не считается. Если состав появится в TDSheet/NEP, программа подхватит его при «Обновить базу».</div>';
      if (!blk) return h + '<div class="box"><span class="pill warn">структура не найдена</span> Как и макрос, программа не нашла для «' + esc(p.name) + '» ни заголовка блока в TDSheet/NEP, ни полуфабриката «' + esc(baseProductCode(p.name)) + '-50» — состав неизвестен, производство не учитывается.</div>';
      var res = computeTree(blk.rows, p.name, ENGINE.kgPerPc);
      var BM = BASE.macro && BASE.macro.items[p.key] && BASE.macro.items[p.key].ras;
      h += '<p class="note"><span class="pill res">расчёт программы</span>' + (BM && obsHits(p) ? ' <span class="pill ed">пересчитано после правки блока</span>' : '') + '</p>';
      if (!res) return h + obrBlockBox(p);
      var fg = Math.max(0, R[p.id].stock), semi = Infinity;
      res.roots.forEach(function (rt) { semi = Math.min(semi, Math.floor(Math.max(0, res.items[rt.i].own) / rt.kn)); });
      if (semi === Infinity) semi = 0;
      var prod = Math.max(0, res.total - semi);
      h += tiles4(fg, semi, prod, fg + res.total, semi + prod >= gsum);
      var B = [];
      if (res.bottle) B.push('Ограничивает выпуск: <b>' + esc(res.bottle) + '</b>.');
      B.push(groupLine(p, semi + prod, res.bottle));
      B.push(CURCELL ? 'Плитки выше — на момент этого заказа (после заказов выше по очереди). Строка «Нехватка по OOR» и сравнение позиций ниже — по всему складу, без очереди.' : 'Это расчёт «по структуре со склада» — без учёта того, что общие детали забирают заказы выше по очереди. Сколько реально достаётся каждому заказу — в «Карте анализа» ячейки.');
      res.roots.forEach(function (rt) {
        var it = res.items[rt.i];
        h += '<h3>Основные детали ' + esc(it.nm) + ' — сравнение позиций</h3><table class="mini"><tr><th>Позиция</th><th>Из чего складывается</th><th class="n">Можно, шт</th></tr>';
        var seenPk = {};
        (it.pos || []).forEach(function (ps) {
          if (seenPk[ps.pk]) return; seenPk[ps.pk] = 1;
          var parts = [];
          res.items.forEach(function (x) {
            if (x.par !== rt.i || x.pk !== ps.pk) return;
            var t = esc(x.nm) + ' ' + f0(x.vl) + ' шт', nt = '';
            if (x.kgpc) nt = '(' + fmt(x.kg) + ' кг / ' + fmtQ(x.kgpc.v) + ' кг/шт' + (x.kgpc.exact ? '' : ' x̄') + ')';
            else if (x.chain && x.chain.links && x.chain.links.length) {
              var ls = x.chain.links.filter(function (l, li) { return !(li === 0 && normKey(l.name) === normKey(x.nm)); });
              if (ls.length) nt = '(свой ' + f0(x.own) + ' шт + цепочка: ' + ls.map(function (l) { return esc(l.name) + ' ' + (l.mat ? fmt(l.kg) + ' кг' + (l.kgpc ? ' / ' + fmtQ(l.kgpc) + ' кг/шт' + (l.exact ? '' : ' x̄') + ' = ' + f0(l.val) + ' шт' : '') : f0(l.val) + ' шт'); }).join(' → ') + ')';
            }
            else if (x.cont) nt = '(свой ' + f0(x.own) + ' шт + из деталей)';
            if (x.shared) nt += (nt ? ' ' : '') + '<span class="shn">общая деталь ' + x.shared.cnt + ' мест в комплекте: всего ' + f0(x.shared.total) + ' шт, доля ' + x.shared.w + '/' + x.shared.W + ' по расходу на 1 комплект' + (x.dn > 1 ? ', по ' + x.dn + ' шт на 1' : '') + '</span>';
            parts.push({ t: t, nt: nt });
          });
          h += '<tr' + (ps.pk === it.minPk ? ' style="background:#fde2df;font-weight:600"' : '') + '><td style="white-space:nowrap">' + esc(ps.pk.replace(/^MAT\|/, '')) + '</td><td>' + partsHtml(parts) + '</td><td class="n">' + f0(ps.sum) + '</td></tr>';
        });
        h += '</table><p class="note"><b>' + esc(it.nm) + ' = свой остаток ' + f0(it.own) + ' шт' + (it.ya.length ? ' (вместе с ' + esc(it.ya.join(', ')) + ')' : '') + ' + минимум по позициям ' + f0(it.vl - it.own) + ' шт = ' + f0(it.vl) + ' шт' + (rt.kn > 1 ? ' / ' + rt.kn + ' на комплект = ' + f0(Math.floor(it.vl / rt.kn)) + ' шт' : '') + '</b></p>';
      });
      h += det0106(p, res);
      return h + obrBlockBox(p);
    }
    function groupLine(p, canMore, bottle) {
      var gs = groupShort(p);
      if (!gs.sum) return 'По OOR в группе ' + esc(p.group) + ' нехватки нет — производство не требуется.';
      var nm = gs.list.map(function (x) { return esc(x.name) + ' — ' + fmt(R[x.id].ts) + ' шт'; }).join('; ');
      if (canMore >= gs.sum) return 'Нехватка по OOR в группе ' + esc(p.group) + ': <b>' + fmt(gs.sum) + ' шт</b> (' + nm + '). Полуфабрикат на складе + производство дают <b>' + fmt(canMore) + ' шт</b> — <span style="color:var(--ok);font-weight:600">нехватку можно закрыть производством</span>, останется ' + fmt(canMore - gs.sum) + ' шт.';
      return 'Нехватка по OOR в группе ' + esc(p.group) + ': <b>' + fmt(gs.sum) + ' шт</b> (' + nm + '). Полуфабрикат на складе + производство дают только <b>' + fmt(canMore) + ' шт</b> — <span style="color:var(--bad);font-weight:600">даже с производством не хватает ' + fmt(gs.sum - canMore) + ' шт</span>' + (bottle ? ', узкое место — ' + esc(bottle) : '') + '.';
    }
    var CURCELL = null;
    /* ключи пулов блока позиции: готовая, полуфабрикаты, детали, материалы */
    function poolKeysOf(p) {
      var b = ALLOC && ALLOC.pos[p.id] ? ALLOC.pos[p.id].block : null, keys = {};
      keys['FG|' + p.key] = p.name;
      if (b) b.rows.forEach(function (r) {
        for (var c = 3; c < r.v.length; c += 2) {
          var nm = cleanSp(r.v[c]); if (!nm || isPcsNote(nm) || nm === '-') continue;
          var k = (c === 3 && (r.cls === 'Y' || r.cls === 'YA')) ? 'SEMI|' + poolKey(nm) : (isRawName(nm) ? 'KG|' : '') + poolKey(nm);
          keys[k] = nm;
        }
      });
      return keys;
    }
    /* кто раньше по очереди брал из тех же пулов (готовая, п/ф, детали, материалы) */
    function prevTakers(p, o) {
      if (!ALLOC || !ALLOC.seq) return [];
      var me = p.id + '@' + o.id, my = ALLOC.seq[me], keys = poolKeysOf(p), agg = {};
      if (my === undefined) return [];
      Object.keys(keys).forEach(function (k) {
        var L = ALLOC.pools.led[k]; if (!L) return;
        Object.keys(L).forEach(function (cid) { if (ALLOC.seq[cid] < my && L[cid] > 0) { var a = agg[cid] || (agg[cid] = { cid: cid, keys: [] }); a.keys.push(keys[k]); } });
      });
      return Object.keys(agg).map(function (cid) { return agg[cid]; }).sort(function (a, b) { return ALLOC.seq[a.cid] - ALLOC.seq[b.cid]; });
    }
    /* плитки «на момент заказа»: что осталось после заказов выше по очереди */
    function cellTiles(p, o) {
      var a = AC(p, o); if (!a) return null;
      var r = R[p.id], fg0 = Math.max(0, r.stock), st = null, blk = ALLOC.pos[p.id] ? ALLOC.pos[p.id].block : null;
      if (blk) { var res = computeTree(blk.rows, p.name, ENGINE.kgPerPc); if (res) { var sm = Infinity; res.roots.forEach(function (rt) { sm = Math.min(sm, Math.floor(Math.max(0, res.items[rt.i].own) / rt.kn)); }); if (sm === Infinity) sm = 0; st = { semi: sm, prod: Math.max(0, res.total - sm), total: res.total }; } }
      var cf = a.fgBefore || 0, cs = a.semiBefore === undefined || a.semiBefore === Infinity ? null : Math.max(0, a.semiBefore), cp = a.prodCap === undefined ? null : a.prodCap;
      var cur = cf + (cs || 0) + (cp || 0), was = fg0 + (st ? st.total : 0), took = (cs === null || cp === null) ? Math.max(0, fg0 - cf) : Math.max(0, was - cur);
      var T = function (v, l, cls) { return '<div class="tile ' + (cls || '') + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; };
      var L = prevTakers(p, o), q = QUEUE.indexOf(o) + 1;
      var h = '<p class="note"><b>На момент заказа ' + esc(o.label) + ' (очередь ' + q + ' из ' + QUEUE.length + ')</b> — после того, что забрали заказы выше по очереди.</p>';
      h += '<div class="tiles">' + T(f0(cf), 'Готовая продукция') + T(cs === null ? '—' : f0(cs), 'Полуфабрикат на складе' + (cs === null ? ' (не потребовался)' : '')) +
        T(f0(took), 'Ранее забрали по очереди' + (L.length ? ' — ' + L.length + ' заказ(ов), список ниже' : ' — никто'), took ? 'bad' : '') +
        T(cp === null ? '—' : f0(cp), 'Можно произвести полуфабриката' + (cp === null ? ' (не потребовалось)' : '')) +
        T(f0(cur), 'Всего можно получить, шт', cur >= (a.need || 0) ? 'ok' : 'bad') + '</div>';
      h += '<p class="note">До очереди (весь склад): готовая ' + f0(fg0) + (st ? ' · п/ф ' + f0(st.semi) + ' · произвести ' + f0(st.prod) + ' · всего ' + f0(fg0 + st.total) : '') + ' шт.</p>';
      if (L.length) {
        h += '<details' + (L.length <= 6 ? ' open' : '') + '><summary style="cursor:pointer;color:var(--navy);font-weight:600">Где потрачено раньше по очереди (' + L.length + ')</summary><table class="mini" style="margin-top:6px"><tr><th>Очередь</th><th>Заказ</th><th>Товар</th><th class="n">Взял, шт</th><th>Общие с этим товаром</th></tr>';
        L.forEach(function (x) {
          var pid = x.cid.split('@')[0], oid = x.cid.split('@')[1], pp = P(pid), oo = O(oid), aa = pp && oo ? AC(pp, oo) : null;
          var got = aa ? [aa.fg ? 'готовая ' + f0(aa.fg) : '', aa.semi ? 'п/ф ' + f0(aa.semi) : '', aa.prod ? 'произв. ' + f0(aa.prod) : ''].filter(Boolean).join(' · ') : '';
          var tot = aa ? aa.fg + aa.semi + aa.prod : 0;
          h += '<tr class="go" data-p="' + pid + '" data-o="' + oid + '"><td>' + (QUEUE.indexOf(oo) + 1) + '</td><td><b>' + esc(oo ? oo.label : oid) + '</b></td><td>' + esc(pp ? pp.name : pid) + (pp && pp.id === p.id ? ' <span class="pill res">этот товар</span>' : '') + '</td><td class="n">' + f0(tot) + (got ? '<div class="note" style="font-family:inherit">' + esc(got) + '</div>' : '') + '</td><td class="note">' + esc(x.keys.slice(0, 4).join(', ') + (x.keys.length > 4 ? ' и ещё ' + (x.keys.length - 4) : '')) + '</td></tr>';
        });
        h += '</table></details>';
      }
      return h;
    }
    function tiles4(fg, semi, prod, total, ok) {
      if (CURCELL) { var ct = cellTiles(CURCELL.p, CURCELL.o); if (ct) return ct; }
      return '<div class="tiles"><div class="tile"><div class="v">' + fmt(fg) + '</div><div class="l">Готовая продукция</div></div>' +
        '<div class="tile"><div class="v">' + fmt(semi) + '</div><div class="l">Полуфабрикат на складе</div></div>' +
        '<div class="tile"><div class="v">' + fmt(prod) + '</div><div class="l">Можно произвести полуфабриката</div></div>' +
        '<div class="tile ' + (ok ? 'ok' : 'bad') + '"><div class="v">' + fmt(total) + '</div><div class="l">Всего можно получить, шт</div></div></div>';
    }
    function f0(n) { return Math.floor(n).toLocaleString('ru-RU'); }
    function macroBox(p) {
      var M = BASE.macro, own = M && M.items[p.key] && M.items[p.key].ras && !obsHits(p) && !BASE.stockUpd ? M.items[p.key] : null;
      var h = '<h3>Анализ по Обработке</h3>';
      var gsum = groupShort(p).sum;
      if (own) {
        var ra = own.ras, od = own.order;
        h += '<p class="note"><span class="pill ok">результат макроса</span></p>';
        h += tiles4(ra.fg || 0, ra.semi || 0, ra.prod || 0, ra.total || 0, ra.status === 'закрыто');
        var A = [];
        if (ra.bottle) A.push('Ограничивает выпуск: <b>' + esc(ra.bottle) + '</b>.');
        ra.notes.forEach(function (n) { if (!/^Ограничивает выпуск/.test(n)) A.push(esc(n)); });
        A.push(groupLine(p, (ra.semi || 0) + (ra.prod || 0), ra.bottle));
        A.push('Статус в Order (макрос): <b>' + esc(ra.status) + '</b>' + (od && od.det ? ' · не покрыты: ' + esc(od.det.replace(/\n/g, ' ')) : '') + '.');
        ra.roots.forEach(function (rt) {
          var min = null; rt.rows.forEach(function (x) { if (x.can !== null && (min === null || x.can < min)) min = x.can; });
          h += '<h3>Основные детали ' + esc(rt.name) + ' — сравнение позиций</h3><table class="mini"><tr><th>Позиция</th><th>Из чего складывается</th><th class="n">Можно, шт</th></tr>';
          rt.rows.forEach(function (x) { h += '<tr' + (x.can === min ? ' style="background:#fde2df;font-weight:600"' : '') + '><td style="white-space:nowrap">' + esc(x.pos) + '</td><td>' + memoHtml(x.memo) + '</td><td class="n">' + (x.can === null ? '—' : f0(x.can)) + '</td></tr>'; });
          h += '</table>' + (rt.summary ? '<p class="note"><b>' + esc(rt.summary.replace(/(\d)(?= \+)/g, '$1 шт')) + '</b></p>' : '');
        });
        if (od && od.groups) {
          h += '<h3>Детали 01–06 (лист Order)</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">';
          od.groups.forEach(function (g) { if (!g.text || g.text === '-') return; var bad = /не хватает/.test(g.text); h += '<div class="box" style="' + (bad ? 'border-color:#f0b4b4;background:var(--bad-bg)' : '') + '"><b>' + esc(g.title) + '</b><div class="pre note" style="color:var(--ink);margin-top:4px">' + esc(g.text) + '</div></div>'; });
          h += '</div>';
        }
        return h + obrBlockBox(p);
      }
      if (OBUILD) return builtBox(p, h, gsum);
      var eng = ENGINE ? ENGINE.analyze(p.name) : null;
      if (!eng || !eng.found) return h + '<div class="box"><span class="pill warn">структура не найдена</span> Позиции нет в TDSheet/NEP как заголовка блока, и полуфабрикат «' + esc(baseProductCode(p.name)) + '-50» не найден — состав для расчёта неизвестен.</div>';
      h += '<p class="note"><span class="pill res">расчёт программы</span></p>';
      (VERIFY ? ' · проверено на ' + VERIFY.n + ' товарах, посчитанных макросом: совпадает в ' + VERIFY.ok + ' (' + Math.round(VERIFY.ok / VERIFY.n * 100) + '%). Для комплектов R/L, RS 70xx, R 4xxx, NR возможны расхождения — сверяйте с макросом.' : '') + '</p>';
      var canMore = eng.semi + eng.prod;
      h += tiles4(eng.fg, eng.semi, eng.prod, eng.total, canMore >= gsum);
      var B = [];
      if (eng.bottle) B.push('Ограничивает выпуск: <b>' + esc(eng.bottle) + '</b>.');
      B.push(groupLine(p, canMore, eng.bottle));
      eng.roots.forEach(function (rt) {
        h += '<h3>Основные детали ' + esc(rt.name) + ' — сравнение позиций</h3><table class="mini"><tr><th>Позиция</th><th>Из чего складывается</th><th class="n">Можно, шт</th></tr>';
        rt.positions.forEach(function (ps) {
          var memo = ps.items.map(function (i) { return esc(i.name) + ' ' + f0(i.value) + (i.chain && i.chain.length ? ' <span class="note">(свой ' + f0(i.own) + ' + цепочка)</span>' : '') + (i.mat ? ' <span class="note">(' + fmt(i.kg) + ' кг / ' + fmtQ(i.kgpc) + (i.exact ? '' : ' x̄') + ')</span>' : ''); }).join(' + ');
          h += '<tr' + (ps.key === rt.minKey ? ' style="background:#fde2df;font-weight:600"' : '') + '><td>' + esc(ps.key.replace(/^MAT\|/, '')) + '</td><td>' + memo + '</td><td class="n">' + f0(ps.sum) + '</td></tr>';
        });
        h += '</table><p class="note"><b>' + esc(rt.name) + ' = свой остаток ' + f0(rt.own) + (rt.extra.length ? ' (вместе с ' + esc(rt.extra.join(', ')) + ')' : '') + ' + минимум по позициям ' + f0(rt.min) + ' = ' + f0(rt.value) + ' шт' + (rt.kitNorm > 1 ? ' / ' + rt.kitNorm + ' на комплект = ' + f0(rt.kits) : '') + '</b></p>';
        var chains = []; rt.positions.forEach(function (ps) { ps.items.forEach(function (i) { if (i.chain && i.chain.length) chains.push(i); }); });
        if (chains.length) {
          h += '<details><summary style="cursor:pointer;color:var(--navy);font-weight:600">Цепочки под-деталей (' + chains.length + ')</summary><table class="mini" style="margin-top:6px"><tr><th>Деталь</th><th>Цепочка (остаток)</th><th class="n">Итого, шт</th></tr>';
          chains.forEach(function (i) { h += '<tr><td>' + esc(i.name) + ' <span class="note">' + f0(i.own) + '</span></td><td>' + i.chain.map(function (l) { return l.mat ? esc(l.name) + ': ' + fmt(l.kg) + ' кг / ' + fmtQ(l.kgpc) + ' кг/шт' + (l.exact ? '' : ' (x̄ среднее)') + ' = ' + f0(l.pcs) + ' шт' : esc(l.name) + ' ' + f0(l.stock); }).join(' → ') + '</td><td class="n">' + f0(i.value) + '</td></tr>'; });
          h += '</table></details>';
        }
      });
      return h;
    }

    function mapBox(p, o) {
      var a = AC(p, o), c = R[p.id].cells[o.id]; if (!a || !c) return '';
      var blk = ALLOC.pos[p.id].block;
      var row = function (n, title, before, took, note, cls) { return '<tr' + (cls ? ' style="' + cls + '"' : '') + '><td><b>' + n + '</b></td><td>' + title + '</td><td class="n">' + (before === null ? '' : fmt(before)) + '</td><td class="n"><b>' + fmt(took) + '</b></td><td class="note">' + (note || '') + '</td></tr>'; };
      var h = '<h3>Карта анализа позиции (очередь ' + (QUEUE.indexOf(o) + 1) + ' из ' + QUEUE.length + ')</h3><table class="mini"><tr><th>#</th><th>Шаг</th><th class="n">Было доступно</th><th class="n">Покрыто, шт</th><th>Пояснение</th></tr>';
      h += row(1, 'Заказ', null, a.q, 'кол-во заказано по OOR');
      h += row(2, 'Покрыто резервом', null, Math.min(a.rv, a.q), 'данные OOR «В резерве»');
      h += row(3, 'Готовая продукция (свободный остаток)', a.fgBefore === undefined ? null : a.fgBefore, a.fg, 'TDSheet2 минус то, что забрали заказы раньше по очереди');
      if (a.semiBefore !== undefined || a.prodCap !== undefined) {
        h += row(4, 'Полуфабрикат на складе', a.semiBefore === undefined || a.semiBefore === Infinity ? 0 : a.semiBefore, a.semi, (blk ? blk.note : '') + '; общий для всех товаров с этим полуфабрикатом');
        if (a.prodCap !== undefined) h += row(5, 'Производство из деталей', a.prodCap, a.prod, a.bottle ? 'узкое место: ' + esc(a.bottle) : '');
      }
      h += row('=', a.short > 0 ? '<b style="color:var(--bad)">Не хватает</b>' : '<b style="color:var(--ok)">Покрыто полностью</b>', null, a.short, '', a.short > 0 ? 'background:var(--bad-bg)' : 'background:var(--ok-bg)');
      h += '</table>';
      if (a.used && a.used.length) {
        var agg = {}; a.used.forEach(function (u) { var k = u[0] + '|' + u[2]; agg[k] = (agg[k] || 0) + u[1]; });
        h += '<details><summary style="cursor:pointer;color:var(--navy);font-weight:600">Что списано на производство ' + fmt(a.prod) + ' шт (' + Object.keys(agg).length + ' позиций)</summary><table class="mini" style="margin-top:6px"><tr><th>Деталь / материал</th><th class="n">Списано</th></tr>' +
          Object.keys(agg).map(function (k) { var x = k.split('|'); return '<tr><td>' + esc(x[0]) + '</td><td class="n">' + (x[1] === 'кг' ? fmt(Math.round(agg[k] * 100) / 100) + ' кг' : fmt(Math.round(agg[k])) + ' шт') + '</td></tr>'; }).join('') + '</table></details>';
      }
      if (!blk && a.short > 0 && a.prodCap === undefined && /^Рычаг/i.test(cleanSp(p.name))) h += '<p class="note"><span class="pill res">готовый товар</span> Рычаг — готовый товар без состава: нехватку можно закрыть только поступлением на склад.</p>';
      else if (!blk && a.short > 0 && a.prodCap === undefined) h += '<p class="note"><span class="pill warn">структура не найдена</span> Полуфабрикат и детали для этой позиции не найдены ни в Обработке, ни в TDSheet/NEP — производство не учтено.</p>';
      return h;
    }

    /* полоса покрытия заказа: резерв / склад / п/ф / производство / не хватает */
    function coverBar(c, a) {
      var q = Math.max(1, c.q), rv = Math.min(c.rv, c.q);
      var parts = [['Резерв', rv, '#2a6fb0'], ['Со склада', a.fg || 0, '#1f9a5b'], ['Из полуфабриката', a.semi || 0, '#e0b000'], ['Произвести', a.prod || 0, '#e8890c'], ['Не хватает', a.short || 0, '#c62828']];
      var bar = '<div class="cov">' + parts.map(function (x) { return x[1] > 0 ? '<span style="width:' + (x[1] / q * 100) + '%;background:' + x[2] + '" title="' + x[0] + ': ' + fmt(x[1]) + ' шт"></span>' : ''; }).join('') + '</div>';
      var chips = '<div class="covl">' + parts.map(function (x) { return x[1] > 0 ? '<span><i style="background:' + x[2] + '"></i>' + x[0] + ' <b>' + fmt(x[1]) + ' шт</b></span>' : ''; }).join('') + '</div>';
      return bar + chips;
    }
    /* склад на момент заказа (после заказов выше по очереди) */
    function cellNow(p, o) {
      var a = AC(p, o), r = R[p.id]; if (!a) return '';
      var fg0 = Math.max(0, r.stock), st = null, blk = ALLOC.pos[p.id] ? ALLOC.pos[p.id].block : null;
      var cs = a.semiBefore === undefined || a.semiBefore === Infinity ? null : Math.max(0, a.semiBefore), cp = a.prodCap === undefined ? null : a.prodCap, cf = a.fgBefore || 0;
      if (blk && cp !== null) { var res = computeTree(blk.rows, p.name, ENGINE.kgPerPc); if (res) st = res.total; }
      var cur = cf + (cs || 0) + (cp || 0), took = cp === null ? Math.max(0, fg0 - cf) : Math.max(0, fg0 + (st || 0) - cur);
      var T = function (v, l, cls) { return '<div class="tile ' + (cls || '') + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; };
      var L = prevTakers(p, o);
      var h = '<div class="sec s-stock" title="Склад на момент заказа — после заказов выше по очереди"><div class="sec-b"><div class="tiles">' + T(f0(cf), 'Готовая продукция');
      if (cs !== null) h += T(f0(cs), 'Полуфабрикат на складе');
      if (cp !== null) h += T(f0(cp), 'Можно произвести');
      if (cs !== null || cp !== null) h += T(f0(cur), 'Всего можно получить', cur >= a.need ? 'ok' : 'bad');
      h += T(f0(took), 'Ранее забрали по очереди', took ? 'bad' : '') + T(fmt(r.after), 'Остаток после всех заказов') + '</div>';
      if (L.length) {
        h += '<details><summary class="sm">Кто забрал раньше по очереди (' + L.length + ')</summary><table class="mini" style="margin-top:6px"><tr><th>Очередь</th><th>Заказ</th><th>Товар</th><th class="n">Взял, шт</th><th>Общее</th></tr>';
        L.forEach(function (x) {
          var pid = x.cid.split('@')[0], oid = x.cid.split('@')[1], pp = P(pid), oo = O(oid), aa = pp && oo ? AC(pp, oo) : null, tot = aa ? aa.fg + aa.semi + aa.prod : 0;
          h += '<tr class="go" data-p="' + pid + '" data-o="' + oid + '"><td>' + (QUEUE.indexOf(oo) + 1) + '</td><td><b>' + esc(oo ? oo.label : oid) + '</b></td><td>' + esc(pp ? pp.name : pid) + (pp && pp.id === p.id ? ' <span class="pill res">этот товар</span>' : '') + '</td><td class="n">' + f0(tot) + '</td><td class="note">' + esc(x.keys.slice(0, 3).join(', ') + (x.keys.length > 3 ? ' …' : '')) + '</td></tr>';
        });
        h += '</table></details>';
      }
      if (!blk && a.short > 0 && cp === null) h += '<p class="note">' + (/^Рычаг/i.test(cleanSp(p.name)) ? 'Рычаг — готовый товар без состава: нехватку закрывает только поступление на склад.' : 'Состав не найден — производство не учитывается.') + '</p>';
      return h + '</div></div>';
    }
    var CELL_LAST = null;
    function cellModal(pid, oid, opt) {
      var p = P(pid), o = O(oid), r = R[pid], c = r.cells[oid];
      if (!c) return;
      if (!opt && CELL_LAST && CELL_LAST.k === pid + '|' + oid) opt = CELL_LAST.opt;
      opt = opt || {}; CELL_LAST = { k: pid + '|' + oid, opt: opt };
      CURMODAL = function () { cellModal(pid, oid, opt); };
      var a = AC(p, o) || { fg: c.give, semi: 0, prod: 0, short: c.short, need: c.need };
      var st = a.short > 0 ? '<span class="pill bad">не хватает ' + fmt(a.short) + ' шт</span>' : (!c.need ? '<span class="pill res">В Резерве</span>' : (a.semi || a.prod ? '<span class="pill mk">' + (a.prod ? 'произвести' : 'из полуфабриката') + '</span>' : '<span class="pill ok">хватает</span>'));
      var h = head(esc(p.name), 'Группа ' + esc(p.group) + ' · ' + oLabel(o) + ' · ' + esc(o.client));
      h += '<div class="cbar">' + st + '<span class="big">Заказ ' + fmt(c.q) + ' шт</span><span>Очередь заказа <b>' + (QUEUE.indexOf(o) + 1) + ' из ' + QUEUE.length + '</b></span><span class="note">создан ' + esc(o.created || '—') + ' · срок ' + esc(o.due || '—') + (/\d/.test(o.pct) ? ' · готовность ' + esc(o.pct) : '') + '</span></div>';
      h += coverBar(c, a);
      h += editNote('q', p, o) + editNote('r', p, o);
      if (CAN_WRITE) h += '<div class="edrow"><b>Правка</b><label>Заказ <input type="number" step="any" id="ceQ" value="' + c.q + '"> шт</label><label>Резерв <input type="number" step="any" id="ceR" value="' + c.rv + '"> шт</label><label>Остаток склада <input type="number" step="any" id="ceS" value="' + r.stock + '"> шт</label><span class="note" id="ceMsg"></span></div>';
      h += cellNow(p, o);
      var n = QUEUE.filter(function (x) { return r.cells[x.id]; }).length;
      h += '<details class="sec s-ord"' + (opt.props ? '' : ' open') + '><summary class="sec-h"><span class="ic">📋</span>Все заказы по позиции<span class="cnt">' + n + '</span><span class="sp"></span><span class="tw">▾</span></summary><div class="sec-b">' + ordersTable(p, oid) + '</div></details>';
      h += '<details class="sec s-more"><summary class="sec-h"><span class="ic">🔧</span>Состав и расчёт по Обработке<span class="sub">весь склад, без очереди</span><span class="sp"></span><span class="tw">▾</span></summary><div class="sec-b">' + macroBox(p) + '</div></details>';
      h += '<details class="sec s-more"><summary class="sec-h"><span class="ic">🏷</span>Остаток склада по TDSheet2 · модель авто<span class="sp"></span><span class="tw">▾</span></summary><div class="sec-b">' + td2Table(r) + semiBox(p) + modelBox(p) + '</div></details>';
      h += cmBox(p, o);
      h += '<p class="ref">' + (o.manual || !p.rows.length ? 'Источник: заказ добавлен вручную' : 'Источник: OOR!' + o.colLetter + p.rows[0] + ' / ' + colLetter(o.col + 1) + p.rows[0]) + '</p></div>';
      var sc = ov.scrollTop, same = ov.classList.contains('on') && modal.dataset.cell === pid + '|' + oid;
      openModal(h); bindGo(); cmBind(p, o);
      if (opt.back) { var bb = document.createElement('div'); bb.className = 'fbar cbk'; bb.innerHTML = '<button class="btn sm pri" id="cellBack">' + esc(opt.backLbl || '← Назад') + '</button>'; var hd = modal.querySelector('.cbar'); if (hd) hd.parentNode.insertBefore(bb, hd); $('cellBack').onclick = function () { CELL_LAST = null; opt.back(); }; }
      modal.dataset.cell = pid + '|' + oid; if (same) ov.scrollTop = sc;
      [['ceQ', 'q'], ['ceR', 'r'], ['ceS', 'stock']].forEach(function (f) {
        var inp = $(f[0]); if (!inp) return;
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
        inp.addEventListener('change', function () {
          setEdit(f[1], p, f[1] === 'stock' ? null : o, inp.value).then(function () { recalc(); cellModal(pid, oid); showMsg('Сохранено — статус пересчитан.', 'good'); }, function (e) { $('ceMsg').textContent = 'Не сохранено: ' + (e.message || e); });
        });
      });
    }
    function posModal(pid) {
      var p = P(pid), r = R[pid], fs = { mk: 0, sh: 0 };
      CURMODAL = function () { posModal(pid); };
      QUEUE.forEach(function (o) { if (!r.cells[o.id]) return; var a = AC(p, o); if (a) { fs.mk += a.semi + a.prod; fs.sh += a.short; } else fs.sh += r.cells[o.id].short; });
      var h = head(esc(p.name), 'Группа ' + esc(p.group) + (p.rows.length ? ' · строка OOR ' + p.rows.join(', ') : ' · позиция добавлена вручную'));
      h += '<div class="tiles"><div class="tile"><div class="v">' + fmt(r.tq) + '</div><div class="l">Заказ</div></div>' +
        '<div class="tile res"><div class="v">' + fmt(r.tr) + '</div><div class="l">В резерве</div></div>' +
        '<div class="tile"><div class="v">' + fmt(r.stock) + '</div><div class="l">Остаток склада</div></div>' +
        '<div class="tile"><div class="v">' + fmt(r.tn) + '</div><div class="l">Нужно со склада</div></div>' +
        '<div class="tile"><div class="v">' + fmt(fs.mk) + '</div><div class="l">Из п/ф и производства</div></div>' +
        '<div class="tile ' + (fs.sh ? 'bad' : 'ok') + '"><div class="v">' + fmt(fs.sh) + '</div><div class="l">Не хватает (с производством)</div></div>' +
        '<div class="tile"><div class="v">' + fmt(r.after) + '</div><div class="l">Конечный остаток</div></div></div>';
      h += macroBox(p) + '<h3>Заказы по очереди</h3>' + ordersTable(p, '') + '<h3>Остаток склада по TDSheet2</h3>' + td2Table(r) + semiBox(p) + modelBox(p) + '</div>';
      openModal(h); bindGo();
    }

    function ordModal(oid) {
      var o = O(oid), rows = OOR.positions.filter(function (p) { return R[p.id].cells[oid]; });
      var q = 0, rv = 0, sh = 0, okN = 0, mk = 0, A = {};
      rows.forEach(function (p) { var c = R[p.id].cells[oid], a = AC(p, o) || { fg: c.give, semi: 0, prod: 0, short: c.short }; A[p.id] = a; q += c.q; rv += c.rv; sh += a.short; mk += a.semi + a.prod; if (!a.short) okN++; });
      var h = head(oLabel(o), esc(o.client) + ' · создан ' + esc(o.created || '—') + ' · код ' + esc(o.code || '—') + ' · срок ' + esc(o.due || '—') + ' · место в очереди ' + (QUEUE.indexOf(o) + 1) + ' из ' + QUEUE.length);
      h += '<div class="tiles"><div class="tile"><div class="v">' + rows.length + '</div><div class="l">Позиций</div></div>' +
        '<div class="tile ' + (okN === rows.length ? 'ok' : 'bad') + '"><div class="v">' + okN + ' / ' + rows.length + '</div><div class="l">Позиций хватает</div></div>' +
        '<div class="tile"><div class="v">' + fmt(q) + '</div><div class="l">Заказ, шт</div></div><div class="tile res"><div class="v">' + fmt(rv) + '</div><div class="l">В резерве, шт</div></div>' +
        '<div class="tile"><div class="v">' + fmt(mk) + '</div><div class="l">Из п/ф и производства, шт</div></div>' +
        '<div class="tile ' + (sh ? 'bad' : 'ok') + '"><div class="v">' + fmt(sh) + '</div><div class="l">Не хватает, шт</div></div>' +
        '<div class="tile"><div class="v">' + (q ? Math.floor((q - sh) / q * 100) : 100) + '%</div><div class="l">Обеспечено</div></div></div>';
      if (o.manual) h += '<div class="box" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="pill ed">добавлен вручную</span>' + (OV.mo[o.manual] && OV.mo[o.manual].ts ? '<span class="note">' + esc(nowStr(OV.mo[o.manual].ts)) + ' · ' + esc(whoName(OV.mo[o.manual].by)) + '</span>' : '') + '<span class="sp"></span><button class="btn" id="moEditBtn">✎ Изменить заказ</button></div>';
      h += '<div class="ordh"><h3>Позиции заказа</h3><span class="sp"></span><button class="btn sm" id="ordXls" title="Скачать статус заказа в Excel"><svg class="ic" aria-hidden="true"><use href="#i-save"/></svg>Скачать Excel</button></div><div class="ordsc"><table class="mini ordt"><tr><th class="n">№</th><th>Группа</th><th>Название товара</th><th class="n">Заказ</th><th class="n">Резерв</th><th class="n">Склад</th><th class="n">П/ф</th><th class="n">Произв.</th><th class="n">Не хватает</th><th>Статус</th><th class="oc0">Коммент.</th><th class="n">Кол-во</th><th>Инвойс</th><th>Контейнер №</th><th>Деталь</th><th>Отгрузка</th><th>Комментарий</th></tr>';
      var N = function (v) { return v ? fmt(v) : '—'; };
      var NN = 0, XR = [];
      rows.sort(function (a, b) { return A[b.id].short - A[a.id].short; }).forEach(function (p) {
        var c = R[p.id].cells[oid], a = A[p.id];
        var stt = a.short ? (c.q - c.rv - a.short > 0 ? '<span class="pill warn">частично</span>' : '<span class="pill bad">нет</span>') : (!c.need ? '<span class="pill res">резерв</span>' : (a.semi || a.prod ? '<span class="pill warn" style="background:#fff1cc;color:#8a5a00">' + (a.prod ? 'произвести' : 'из п/ф') + '</span>' : '<span class="pill ok">хватает</span>'));
        var cl = cmOf(p, o);
        var xb = [NN + 1, p.group, p.name, c.q, c.rv, a.fg || 0, a.semi || 0, a.prod || 0, a.short || 0, a.short ? (c.q - c.rv - a.short > 0 ? 'частично' : 'нет') : (!c.need ? 'резерв' : (a.semi || a.prod ? (a.prod ? 'произвести' : 'из п/ф') : 'хватает'))];
        var xc = function (k) { return k ? [CM_ST[k.st || ''] || '', (k.qty > 0 ? k.qty : '') + (k.mkg > 0 ? ' (' + cmKgTxt(k) + ')' : ''), k.inv || '', k.cont || '', k.det || '', k.ship ? ruDate(k.ship) : '', k.text || ''] : ['', '', '', '', '', '', '']; };
        var xl = cmSorted(cl); XR.push(xb.concat(xc(xl[0] && xl[0].c))); xl.slice(1).forEach(function (x) { XR.push(['', '', '', '', '', '', '', '', '', ''].concat(xc(x.c))); });
        var qi = CAN_WRITE ? '<input class="oedit" type="number" step="any" data-f="q" data-p="' + p.id + '" value="' + c.q + '">' : fmt(c.q), ri = CAN_WRITE ? '<input class="oedit" type="number" step="any" data-f="r" data-p="' + p.id + '" value="' + c.rv + '">' : N(c.rv);
        var CL = cmSorted(cl), RS = CL.length > 1 ? ' rowspan="' + CL.length + '"' : '', tdr = function (x) { return x.replace(/<td(?= |>)/g, '<td' + RS); };
        var cmTds = function (k) { return k ? '<td class="oc0" style="border-left:4px solid ' + CM_COL[k.st || ''] + '">' + cmChip(k.st) + '</td><td class="n"><b>' + (k.qty > 0 ? fmt(k.qty) : '') + '</b>' + (k.mkg > 0 ? '<div class="note kgn">' + cmKgTxt(k) + '</div>' : '') + '</td><td>' + (k.inv ? invLink(k.inv) : '') + '</td><td><b>' + esc(k.cont || '') + '</b></td><td>' + esc(k.det || '') + '</td><td>' + (k.ship ? esc(ruDate(k.ship)) : '') + '</td><td class="otx">' + esc(k.text || '') + '</td>' : '<td class="oc0"></td><td></td><td></td><td></td><td></td><td></td><td></td>'; };
        h += '<tr class="go' + (CL.length > 1 ? ' ocf' : '') + '" data-p="' + p.id + '" data-o="' + oid + '">' + tdr('<td class="n">' + (++NN) + '</td><td>' + esc(p.group) + '</td><td><b>' + esc(p.name) + '</b></td><td class="n">' + qi + '</td><td class="n">' + ri + '</td><td class="n">' + N(a.fg) + '</td><td class="n">' + N(a.semi) + '</td><td class="n">' + N(a.prod) + '</td><td class="n" style="color:' + (a.short ? 'var(--bad)' : 'inherit') + '"><b>' + N(a.short) + '</b></td><td>' + stt + '</td>') + cmTds(CL[0] && CL[0].c) + '</tr>';
        CL.slice(1).forEach(function (x, xi) { h += '<tr class="go ocx' + (xi === CL.length - 2 ? ' ocl2' : '') + '" data-p="' + p.id + '" data-o="' + oid + '">' + cmTds(x.c) + '</tr>'; });
      });
      openModal(h + '</table></div></div>', true); modal.classList.add('xw'); bindGo();
      if (o.manual && $('moEditBtn')) $('moEditBtn').onclick = function () { orderForm(o.manual); };
      $('ordXls').onclick = function () {
        var hd = ['№', 'Группа', 'Название товара', 'Заказ', 'Резерв', 'Склад', 'П/ф', 'Произв.', 'Не хватает', 'Статус', 'Статус комментария', 'Кол-во', 'Инвойс', 'Контейнер №', 'Деталь', 'Отгрузка', 'Комментарий'];
        var aoa = [[o.fullLabel || ('Заказ ' + o.label)], [o.client + ' · от ' + (o.created || '—') + ' · срок ' + (o.due || '—') + ' · очередь ' + (QUEUE.indexOf(o) + 1) + ' из ' + QUEUE.length], [], hd].concat(XR);
        var buf = xlsxBuild([{ name: 'Статус заказа', rows: aoa, header: { 3: 1 }, freeze: 4, cols: [6, 12, 40, 10, 10, 10, 10, 10, 12, 14, 16, 10, 18, 18, 24, 12, 40], border: function (r) { return r >= 3; } }]);
        saveBinary('Статус_заказа_' + String(o.label).replace(/[^\wА-Яа-яЁё№-]+/g, '_') + '.xlsx', buf).then(function () { showMsg('Статус заказа скачан в Excel.', 'good'); }, function (e) { showMsg('Не скачалось: ' + esc(e.message || e), 'err'); });
      };
      modal.querySelectorAll('table.ordt tr.go').forEach(function (tr) {
        tr.addEventListener('contextmenu', function (e) {
          e.preventDefault(); var pp = P(tr.dataset.p), gg = NSORT ? nameGroup(pp.name) : pp.group, all = orderPairs(o), grp = orderPairs(o, gg);
          ctxOpen(e.clientX, e.clientY, [
            ['💬 Комментарий к позиции', function () { cmForm([[pp, o]], { back: function () { ordModal(oid); } }); }, !CAN_WRITE],
            ['💬 Комментарий всем позициям группы ' + esc(gg) + ' (' + grp.length + ')', function () { cmForm(grp, { title: 'Комментарий: ' + o.label + ' · группа ' + gg, back: function () { ordModal(oid); } }); }, !CAN_WRITE],
            ['💬 Комментарий всем позициям заказа (' + all.length + ')', function () { cmForm(all, { title: 'Комментарий ко всем позициям заказа ' + o.label, back: function () { ordModal(oid); } }); }, !CAN_WRITE],
            '-',
            ['Копировать комментарии', function () { cmCopy(pp, o); }, !cmOf(pp, o).length],
            ['Вставить комментарии', function () { cmPaste([[pp, o]], CMCLIP); ordModal(oid); }, !CMCLIP || !CAN_WRITE],
            ['Свойства позиции', function () { cellModal(pp.id, oid, { props: 1 }); }]
          ]);
        });
      });
      modal.querySelectorAll('.oedit').forEach(function (inp) {
        inp.addEventListener('click', function (e) { e.stopPropagation(); });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
        inp.addEventListener('change', function () {
          var pp = P(inp.dataset.p);
          setEdit(inp.dataset.f, pp, o, inp.value).then(function () { var sc = ov.scrollTop; recalc(); ordModal(oid); ov.scrollTop = sc; showMsg('Сохранено — статус заказа пересчитан.', 'good'); }, function (e) { showMsg('Не сохранено: ' + esc(e.message || e), 'err'); });
        });
      });
    }

    /* ---- Склад: все данные TDSheet2 ---- */
    function stockModal(pre) {
      var whs = {}; TD2.rows.forEach(function (x) { whs[x[3]] = (whs[x[3]] || 0) + 1; });
      var whOpts = Object.keys(whs).sort().map(function (w) { return '<option>' + esc(w) + '</option>'; }).join('');
      var h = head('Склад — остатки на ' + esc(TD2.period || '—'), 'Лист TDSheet2 книги ' + esc(BASE.file) + ' · загружено ' + esc(BASE.loadedAt) + ' · строк: ' + TD2.rows.length) + stkDiffHtml(BASE.stkDiff && !BASE.stkDiff.seen);
      h += '<div class="fbar"><input type="search" id="sq" placeholder="Поиск по номенклатуре…" value="' + esc(pre || '') + '" style="min-width:260px"><select id="sw"><option value="">Все склады</option>' + whOpts + '</select>' +
        '<label><input type="checkbox" id="sx" checked> без складов-исключений</label><label><input type="checkbox" id="so"> только товары из OOR</label><label><input type="checkbox" id="sg"> свести по названию</label></div><div id="sres"></div>';
      openModal(h + '</div>', true); stkDiffBind();
      var keys = {}; OOR.positions.forEach(function (p) { keys[p.key] = 1; });
      var draw = function () {
        var q = $('sq').value.replace(/\s+/g, '').toUpperCase(), w = $('sw').value, nx = $('sx').checked, oo = $('so').checked, gg = $('sg').checked;
        var rows = TD2.rows.filter(function (x) {
          if (q && x[0].replace(/\s+/g, '').toUpperCase().indexOf(q) < 0) return false; if (w && x[3] !== w) return false;
          if (nx && EXCL_WH.indexOf(x[3].toUpperCase()) >= 0) return false; if (oo && !keys[x[0].toUpperCase()]) return false; return true;
        });
        var sum = 0; rows.forEach(function (x) { if (x[1] !== null && EXCL_WH.indexOf(x[3].toUpperCase()) < 0) sum += x[1]; });
        var out = '<p class="note">Найдено строк: <b>' + rows.length + '</b> · сумма остатка (без складов-исключений): <b>' + fmt(sum) + '</b>' + (rows.length > 1500 ? ' · показаны первые 1500 — уточните поиск' : '') + '</p><div class="scroll"><table class="mini">';
        if (gg) {
          var g = {}, order = [];
          rows.forEach(function (x) { var k = x[0].toUpperCase(); if (!g[k]) { g[k] = { n: x[0], s: 0, w: [] }; order.push(k); } if (x[1] !== null && EXCL_WH.indexOf(x[3].toUpperCase()) < 0) g[k].s += x[1]; g[k].w.push(x[3] + ': ' + fmt(x[1] || 0)); });
          out += '<tr><th>Номенклатура</th><th class="n">Остаток</th><th>По складам</th></tr>';
          order.slice(0, 1500).forEach(function (k) { out += '<tr><td>' + esc(g[k].n) + '</td><td class="n">' + fmt(g[k].s) + '</td><td class="note">' + esc(g[k].w.join('; ')) + '</td></tr>'; });
        } else {
          out += '<tr><th>Строка</th><th>Номенклатура</th><th class="n">Остаток</th><th class="n">Мин. кол-во</th><th>Склад</th></tr>';
          rows.slice(0, 1500).forEach(function (x) { var ex = EXCL_WH.indexOf(x[3].toUpperCase()) >= 0 || /\(НЕКОНДИЦИЯ\)/i.test(x[0]); out += '<tr class="' + (ex ? 'ex' : '') + '" title="' + (ex ? 'Некондиция / отходы / брак — в остаток не входит' : '') + '"><td class="ref">' + x[4] + '</td><td>' + esc(x[0]) + '</td><td class="n">' + (x[1] === null ? '—' : fmt(x[1])) + '</td><td class="n">' + (x[2] === null ? '' : fmt(x[2])) + '</td><td>' + esc(x[3]) + '</td></tr>'; });
        }
        $('sres').innerHTML = out + '</table></div>';
      };
      ['sq', 'sw', 'sx', 'so', 'sg'].forEach(function (id) { $(id).addEventListener(id === 'sq' ? 'input' : 'change', draw); });
      draw();
    }
    /* ---- Склад: критично / ниже минимума (плитка) ---- */
    var STK_UI = { f: 'all', sort: 'imp', only: false, raw: false };
    function minStockModal(pre, mode) {
      if (mode) STK_UI.f = mode === 'low' ? 'low' : mode; else STK_UI.f = 'all';
      var h = head('Склад: критично / ниже минимума', 'Остатки на ' + esc(TD2.period || '—') + ' · TDSheet2 · ' + esc(BASE.file) + ' · без некондиции, отходов и брака');
      h += '<div class="tiles" id="stT"></div>';
      h += '<div class="fbar"><input type="search" id="sq" placeholder="Поиск по номенклатуре…" value="' + esc(pre || '') + '" style="min-width:240px">' +
        '<select id="ss"><option value="imp">По важности</option><option value="name">По названию</option><option value="stock">Остаток ↑</option><option value="rate">Расход ↓</option></select>' +
        '<label>Мин. запас на <input type="number" id="scm" min="0.25" step="0.25" value="' + COVER_M + '" style="width:62px"> мес.</label>' +
        '<label><input type="checkbox" id="so"' + (STK_UI.only ? ' checked' : '') + '> только с расходом по заказам</label>' +
        '</div><div id="sres"></div>';
      openModal(h + '</div>', true);
      $('ss').value = STK_UI.sort;
      var IMP = { red: 0, yellow: 1, ok: 2, none: 3 };
      var tiles = function (S) {
        var T = [['all', 'Позиций', S.list.filter(function (x) { return !x.ex; }).length, ''], ['red', 'Критично', S.red, 'bad'], ['yellow', 'Ниже минимума', S.yellow, 'warn'], ['ok', 'Норма', S.ok, 'ok'], ['none', 'Без минимума', S.none, '']];
        $('stT').innerHTML = T.map(function (t) { var on = STK_UI.f === t[0] || (STK_UI.f === 'low' && (t[0] === 'red' || t[0] === 'yellow')); return '<div class="tile clk ' + t[3] + (on ? ' on' : '') + '" data-f="' + t[0] + '"><div class="v">' + fmt(t[2]) + '</div><div class="l">' + t[1] + '</div></div>'; }).join('');
        $('stT').querySelectorAll('.tile').forEach(function (d) { d.onclick = function () { STK_UI.f = STK_UI.f === d.dataset.f ? 'all' : d.dataset.f; draw(); }; });
      };
      var editCell = function (it) {
        return '<input class="sedit" type="number" step="any" data-k="' + esc(it.key) + '" value="' + (Math.round(it.stock * 1000) / 1000) + '"' + (CAN_WRITE ? '' : ' disabled') + '>' + (it.ed ? ' <span class="pill ed" title="Изменено вручную. По TDSheet2: ' + fmt(it.orig) + '">✎</span>' : '');
      };
      var draw = function () {
        var S = stockPlan(), q = $('sq').value.replace(/\s+/g, '').toUpperCase();
        STK_UI.sort = $('ss').value; STK_UI.only = $('so').checked;
        tiles(S);
        var L = S.list.filter(function (it) {
          if (it.ex) return false;
          if (q && it.key.replace(/\s+/g, '').indexOf(q) < 0) return false;
          if (STK_UI.only && !(it.req > 0)) return false;
          if (STK_UI.f === 'low') return it.st === 'red' || it.st === 'yellow';
          if (STK_UI.f !== 'all' && it.st !== STK_UI.f) return false;
          return true;
        });
        var cmp = {
          imp: function (a, b) { return IMP[a.st] - IMP[b.st] || ((a.min ? a.stock / a.min : 9e9) - (b.min ? b.stock / b.min : 9e9)) || b.rate - a.rate || a.name.localeCompare(b.name, 'ru'); },
          name: function (a, b) { return a.name.localeCompare(b.name, 'ru'); },
          stock: function (a, b) { return a.stock - b.stock || a.name.localeCompare(b.name, 'ru'); },
          rate: function (a, b) { return b.rate - a.rate || a.name.localeCompare(b.name, 'ru'); }
        }[STK_UI.sort] || function (a, b) { return a.name.localeCompare(b.name, 'ru'); };
        L.sort(cmp);
        var stTxt = { red: 'критично', yellow: 'ниже минимума', ok: 'норма', none: '—' };
        var out = '<p class="note">Строк: <b>' + L.length + '</b> · расход — по всем заказам OOR за ' + (Math.round(S.months * 10) / 10) + ' мес.' + (L.length > 1500 ? ' · показаны первые 1500' : '') + '</p><div class="scroll" style="max-height:60vh"><table class="mini stk-t"><tr><th>Номенклатура</th><th class="n">Остаток</th><th class="n">Мин. остаток</th><th class="n">Расход по заказам</th><th class="n">Расход в мес.</th><th>Статус</th><th>По складам</th></tr>';
        L.slice(0, 1500).forEach(function (it) {
          out += '<tr class="sr-' + it.st + '"><td>' + esc(it.name) + '</td><td class="n">' + editCell(it) + '</td><td class="n">' + (it.min ? fmt(it.min) + (it.minSrc === 'расчёт' ? ' <span class="note" title="Нет мин. остатка в TDSheet2 — рассчитан по расходу заказов">расч.</span>' : '') : '—') + '</td><td class="n">' + (it.req ? fmt(it.req) : '—') + '</td><td class="n">' + (it.rate ? fmt(it.rate) : '—') + '</td><td><span class="sst ' + it.st + '">' + stTxt[it.st] + '</span></td><td class="note">' + esc(it.wh.join('; ')) + '</td></tr>';
        });
        if (!L.length) out += '<tr><td colspan="7" class="note">Нет строк по фильтру</td></tr>';
        $('sres').innerHTML = out + '</table></div>';
        bindEdits();
      };
      var bindEdits = function () {
        $('sres').querySelectorAll('.sedit').forEach(function (inp) {
          var go = function () {
            var k = inp.dataset.k, it = stockPlan().items[k]; if (!it) return;
            if (String(inp.value).trim() === '' && !it.ed) { inp.value = it.stock; return; }
            if (parseFloat(String(inp.value).replace(',', '.')) === it.stock) return;
            var pos = OOR.positions.find(function (x) { return x.key === k; });
            var pr = pos ? setEdit('stock', pos, null, inp.value) : setTd2Edit(k, it.name, inp.value);
            pr.then(function () { recalc(); draw(); showMsg('Остаток «' + esc(it.name) + '» сохранён, статусы пересчитаны.', 'good'); }, function (e) { showMsg('Не сохранено: ' + esc(e.message || e), 'err'); draw(); });
          };
          inp.addEventListener('change', go);
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
        });
      };
      $('sq').addEventListener('input', draw);['ss', 'so'].forEach(function (id) { $(id).addEventListener('change', draw); });
      $('scm').addEventListener('change', function () { var v = parseFloat($('scm').value); if (v > 0) { COVER_M = v; lsSet('coverM', v); STOCKPLAN = null; render(); draw(); } });
      draw();
    }
    function modelModal(pid) { var p = P(pid); openModal(head(esc(p.name), 'Модель авто · группа ' + esc(p.group)) + modelBox(p) + '<p class="ref">База: ' + esc(MODELS ? MODELS.src : '—') + ' · загружено ' + esc(MODELS ? MODELS.loadedAt : '—') + '</p></div>'); }

    /* ================= клики / редактирование ================= */
    $('grid').addEventListener('click', function (e) {
      if (e.target.closest('.rz') || e.target.closest('.inl')) return;
      var cbm = e.target.closest('em.cmb,em.cmlab'); if (cbm && !EDITING) { e.stopPropagation(); return cmPopOpen(cbm.dataset.cp, cbm.dataset.co, cbm); }
      var thO = e.target.closest('th.ord'); if (thO) return ordModal(thO.dataset.o);
      var gc = e.target.closest('td.c-cat[data-g], .gcode[data-g]'); if (gc && !EDITING) return groupModal(gc.dataset.g);
      if (e.target.closest('th.stockh')) return stockModal('');
      if (e.target.closest('th.nsort')) { NSORT = NSORT ? '' : 'name'; lsSet('nsort', NSORT); render(); return; }
      if (EDITING) {
        var t = e.target.closest('td.cell,td.stk,td.mdl'); if (t) return startInline(t);
      }
      var m = e.target.closest('td.mdl'); if (m) return modelModal(m.dataset.m);
      var s = e.target.closest('td.stk'); if (s) return stockModal(s.dataset.sq || P(s.dataset.s).name);
      var td = e.target.closest('[data-p]'); if (!td) return;
      if (td.dataset.o && td.dataset.pp && td.dataset.pp.indexOf(',') > 0) { var oo = O(td.dataset.o); ctxOpen(e.clientX, e.clientY, [['<b>' + esc(oo.label) + '</b> — позиции корня', function () { }, true]].concat(td.dataset.pp.split(',').map(function (id) { var c = R[id].cells[oo.id]; return [esc(P(id).name) + ' — <b>' + fmt(c ? c.q : 0) + ' шт</b>', function () { cellModal(id, oo.id); }]; }))); return; }
      if (td.dataset.o) cellModal(td.dataset.p, td.dataset.o); else posModal(td.dataset.p);
    });
    var SESSION_EDITS = [];
    function setEditing(on) {
      EDITING = on; document.body.classList.toggle('editing', on);
      var b = $('editBtn'); b.classList.toggle('on', on); b.querySelector('.t').textContent = on ? 'Готово' : 'Редактировать'; b.querySelector('use').setAttribute('href', on ? '#i-check' : '#i-edit'); if (typeof fitToolbar === 'function') fitToolbar();
      $('cancelEditBtn').style.display = on ? '' : 'none';
      if (on) SESSION_EDITS = [];
    }
    $('editBtn').onclick = function () {
      if (!CAN_WRITE) { showMsg('У вас нет прав на изменение данных этой страницы.', 'err'); return; }
      var open = document.querySelector('.inl'); if (open) { recalc(); }
      var n = SESSION_EDITS.length;
      setEditing(!EDITING);
      if (!EDITING && n) showMsg('Сохранено изменений: ' + n + '.', 'good');
    };
    $('cancelEditBtn').onclick = function () {
      var list = SESSION_EDITS.slice().reverse(); SESSION_EDITS = [];
      if (document.querySelector('.inl')) recalc();
      var p0 = Promise.resolve();
      list.forEach(function (e) { p0 = p0.then(function () { return setEdit(e.t, e.p, e.o, e.had ? e.prev : '', true); }); });
      p0.then(function () { setEditing(false); recalc(); showMsg(list.length ? 'Отменено изменений: ' + list.length + ' — значения возвращены.' : 'Режим редактирования закрыт без изменений.', 'good'); },
        function (err) { setEditing(false); recalc(); showMsg('Ошибка отмены: ' + esc(err && err.message || err), 'err'); });
    };
    function fileInfoModal() {
      openModal(head('Обновить базу — какой файл выбрать', 'Кнопка «Обновить базу» загружает новые данные в программу') + '<div class="note" style="font-size:13px;line-height:1.7">' +
        '<b>Выберите последнюю версию файла «Анализ_Детально.xlsm»</b> (D:\\Детально\\Анализ_Детально.xlsm — ярлык «Детально» на рабочем столе).<br>' +
        'Перед загрузкой в этом файле должны быть обновлены:<br>' +
        '• <b>TDSheet2</b> — остатки из 1С (дата берётся из «Период»);<br>' +
        '• <b>OOR</b> — журнал заказов с количеством и резервом;<br>' +
        '• при изменении состава — <b>TDSheet</b> и <b>NEP</b>;<br>' +
        '• запускать макрос <b>не обязательно</b> — программа сама строит блоки Обработки по TDSheet, NEP, TDSheet2 и Базе пыльник. Если макрос «Обработка_ВСЕ» запускали, программа сверит свои блоки с листом Обработка построчно и итоги с листом Расчёт.<br>' +
        (VERIFY && VERIFY.n ? '<b>Сверка текущей базы:</b> ' + esc(verifyNote().replace(/^ · /, '')) + '.<br>' : '') +
        'Сохраните файл в Excel перед выбором. Программа читает листы: OOR, TDSheet2, TDSheet, NEP, База пыльник, Order, Расчёт, Обработка.<br>' +
        'Ручные правки и история сохраняются; после загрузки нажмите «💾 Сохранить HTML», чтобы отправить обновлённый файл.</div></div>');
    };
    function startInline(td) {
      if (document.querySelector('.inl')) return;
      if (HIDE.name) { showMsg('Колонка «Название товара» скрыта — строки сложены по корню. Правка — в окне позиции или покажите название.', 'err'); return; }
      var html0 = td.innerHTML, form;
      if (td.classList.contains('cell')) {
        var p = P(td.dataset.p), o = O(td.dataset.o), c = R[p.id].cells[o.id] || { q: 0, rv: 0 };
        td.innerHTML = '<div class="inl"><label>Заказ<input type="number" step="any" data-f="q" value="' + c.q + '"></label><label>Резерв<input type="number" step="any" data-f="r" value="' + c.rv + '"></label><div class="row"><button class="btn sm" data-a="ok">✓</button><button class="btn sm" data-a="no">✕</button></div></div>';
        form = { save: function () { var iq = td.querySelector('[data-f=q]').value, ir = td.querySelector('[data-f=r]').value; return Promise.resolve(setEdit('q', p, o, iq)).then(function () { return setEdit('r', p, o, ir); }); } };
      } else if (td.classList.contains('stk')) {
        var p2 = P(td.dataset.s);
        td.innerHTML = '<div class="inl"><input type="number" step="any" value="' + R[p2.id].stock + '"><div class="row"><button class="btn sm" data-a="ok">✓</button><button class="btn sm" data-a="no">✕</button></div></div>';
        form = { save: function () { return setEdit('stock', p2, null, td.querySelector('input').value); } };
      } else {
        var p3 = P(td.dataset.m);
        td.innerHTML = '<div class="inl"><textarea>' + esc(modelOf(p3).text) + '</textarea><div class="row"><button class="btn sm" data-a="ok">✓</button><button class="btn sm" data-a="no">✕</button></div></div>';
        form = { save: function () { return setEdit('model', p3, null, td.querySelector('textarea').value); } };
      }
      var done = false;
      var finish = function (ok) { if (done) return; done = true; if (ok) form.save().then(recalc, function (err) { showMsg('Не сохранено: ' + esc(err && err.message || err), 'err'); recalc(); }); else td.innerHTML = html0; };
      var first = td.querySelector('input,textarea'); first.focus(); if (first.select) first.select();
      td.querySelector('.inl').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !(e.target.tagName === 'TEXTAREA' && e.shiftKey)) { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      });
      td.querySelector('[data-a=ok]').onclick = function (e) { e.stopPropagation(); finish(true); };
      td.querySelector('[data-a=no]').onclick = function (e) { e.stopPropagation(); finish(false); };
    }

    /* ---- правки: ключ, значение, история ---- */
    var FIELD = { q: 'Кол-во заказано', r: 'В резерве', stock: 'Остаток склада', model: 'Модель авто' };
    function ovKeyOf(t, p, o) { return (t === 'q' || t === 'r') ? ovKey(p, o) : p.key; }
    function ovId(t, p, o) { return 'e' + hash(t + '|' + ovKeyOf(t, p, o)); }
    function curVal(t, p, o) {
      if (t === 'stock') return R[p.id].stock;
      if (t === 'model') return modelOf(p).text;
      var c = R[p.id].cells[o.id]; return c ? (t === 'q' ? c.q : c.rv) : 0;
    }
    function origVal(t, p, o) {
      if (t === 'stock') return R[p.id].stock0;
      if (t === 'model') return modelOf(p).auto;
      return t === 'q' ? (p.q[o.id] || 0) : (p.r[o.id] || 0);
    }
    function setEdit(t, p, o, raw, isRevert) {
      var k = ovKeyOf(t, p, o), from = curVal(t, p, o), orig = origVal(t, p, o), val, del;
      if (t === 'model') { val = String(raw).trim(); del = (val === '' || val === orig); if (val === '') val = orig; }
      else { var s = String(raw).trim().replace(',', '.'); if (s === '') { val = orig; del = true; } else { val = parseFloat(s); if (!isFinite(val)) return Promise.reject(new Error('нужно число')); del = (val === orig); } }
      if (val === from && (del === !Object.prototype.hasOwnProperty.call(OV[t], k))) return Promise.resolve();
      if (EDITING && !isRevert) SESSION_EDITS.push({ t: t, p: p, o: o, had: Object.prototype.hasOwnProperty.call(OV[t], k), prev: OV[t][k] });
      var id = ovId(t, p, o), ts = Date.now();
      if (del) { delete OV[t][k]; delete OVMETA[id]; } else { OV[t][k] = val; OVMETA[id] = { ts: ts, by: ME }; }
      var hist = { ts: ts, by: ME, kind: 'edit', t: t, k: k, field: FIELD[t], pos: p.name, ord: o ? o.label + ' · ' + o.client : '', from: from, to: val, revert: !!isRevert };
      HIST.unshift(hist);
      return persistEdit(id, t, k, del ? null : val, p, o, ts).then(function () { return persistHist(hist); });
    }
    function whoName(id) { if (!id) return 'вы (локально)'; return NAMES[id] || (id === ME ? 'вы' : 'пользователь'); }

    /* ================= хранение (база страницы / локально) ================= */
    function setSync(t, ok) { var s = $('sync'); s.textContent = t; s.style.background = ok ? 'rgba(46,160,90,.35)' : 'rgba(255,255,255,.12)'; }
    function persistEdit(id, t, k, v, p, o, ts) {
      KT[t + '\u0001' + k] = v === null ? { ts: ts || Date.now(), by: ME || '', d: 1 } : { ts: ts || Date.now(), by: ME || '' };
      if (!DB) { lsSet('ov', { OV: OV, META: OVMETA, KT: KT }); return Promise.resolve(); }
      var ref = DB.collection('edits').doc(id);
      return v === null ? ref.delete() : ref.set({ t: t, k: k, v: v, pos: p.name, ord: o ? o.label : '', ts: ts, by: ME || '' });
    }
    function persistHist(hst) {
      if (!DB) { lsSet('hist', HIST.slice(0, 1000)); return Promise.resolve(); }
      return DB.collection('history').doc('h' + hst.ts + '-' + Math.random().toString(36).slice(2, 7)).set(hst).catch(function (e) { showMsg('История не сохранена: ' + esc(e.message || e.code), 'err'); });
    }
    function applyEditDocs(docs) {
      OV = { stock: {}, q: {}, r: {}, model: {}, mo: {}, td2: {}, cm: {}, obs: {}, bom: {}, invp: {} }; OVMETA = {};
      docs.forEach(function (d) { var x = d.data(); if (!x || !OV[x.t]) return; OV[x.t][x.k] = x.v; OVMETA[d.id] = { ts: x.ts, by: x.by }; });
    }
    var CH = 90000;
    function saveChunked(coll, metaDoc, obj, meta) {
      var s = JSON.stringify(obj), parts = [];
      for (var i = 0; i < s.length; i += CH) parts.push(s.slice(i, i + CH));
      var ver = Date.now(), p = Promise.resolve();
      parts.forEach(function (part, i) { p = p.then(function () { return DB.collection(coll).doc('v' + ver + '-' + i).set({ s: part, i: i, ver: ver }); }); });
      return p.then(function () { meta.ver = ver; meta.n = parts.length; return DB.doc(metaDoc).set(meta); })
        .then(function () { return DB.collection(coll).get(); })
        .then(function (snap) { var q = Promise.resolve(); snap.docs.forEach(function (d) { if (d.data().ver !== ver) q = q.then(function () { return DB.collection(coll).doc(d.id).delete(); }); }); return q; })
        .then(function () { return ver; });
    }
    function loadChunked(coll, meta) {
      var ids = []; for (var i = 0; i < meta.n; i++) ids.push('v' + meta.ver + '-' + i);
      return Promise.all(ids.map(function (id) { return DB.collection(coll).doc(id).get(); })).then(function (snaps) {
        if (snaps.some(function (s) { return !s.exists; })) throw new Error('неполные данные');
        return JSON.parse(snaps.map(function (s) { return s.data().s; }).join(''));
      });
    }
    var loadedVer = { base: 0, models: 0 }, dbEditsSeen = false;
    function watchChunked(name, coll, apply) {
      DB.doc('meta/' + name).onSnapshot(function (snap) {
        if (!snap.exists) return;
        var m = snap.data(); if (!m.ver || m.ver === loadedVer[name]) return;
        loadedVer[name] = m.ver;
        loadChunked(coll, m).then(function (obj) { apply(obj); }).catch(function () { loadedVer[name] = 0; });
      }, function () { });
    }
    function startDb() {
      var timer = setTimeout(function () { setSync('База недоступна — правки сохраняются только в этом браузере', false); }, 10000);
      Promise.resolve(window.claude && window.claude.use ? window.claude.use('db') : null).then(function (db) {
        if (!db) { clearTimeout(timer); localMode(); return; }
        DB = db;
        Promise.resolve(window.claude.use('user')).then(function (u) {
          USER = u; if (!u) return;
          return Promise.resolve(u.id ? u.id() : null).then(function (id) { ME = id; return u.can ? u.can('data.write') : null; }).then(function (c) { if (c === false) { CAN_WRITE = false; $('editBtn').disabled = true; } });
        }).catch(function () { });
        watchChunked('base', 'base_chunks', function (b) { setBase(b); showMsg('Обновлены данные книги из базы: ' + esc(b.file) + ' (' + esc(b.loadedAt) + ').', 'good'); });
        watchChunked('models', 'model_chunks', function (m) { setModels(m); });
        DB.collection('edits').onSnapshot(function (snap) {
          clearTimeout(timer); setSync('Сохранение: база страницы ✓', true);
          if (snap.empty && EMBEDDED.ov && !dbEditsSeen) { recalc(); return; }
          dbEditsSeen = true; applyEditDocs(snap.docs); recalc();
        }, function (e) { clearTimeout(timer); setSync('База недоступна (' + e.code + ') — правки только локально', false); DB = null; localMode(); });
        DB.collection('history').orderBy('ts', 'desc').limit(1000).onSnapshot(function (snap) {
          if (snap.empty && EMBEDDED.hist) return;
          HIST = snap.docs.map(function (d) { return d.data(); }); resolveNames();
        }, function () { });
      }).catch(function (e) { clearTimeout(timer); localMode(); if (window.claude && window.claude.use) setSync('База страницы недоступна (' + (e && (e.code || e.message) || 'нет доступа') + ') — правки только в этом браузере; для передачи — «Сохранить HTML»', false); });
    }
    function localMode() {
      setSync((EMBEDDED.savedAt ? 'Файл от ' + EMBEDDED.savedAt + ' · ' : '') + 'правки хранятся в этом браузере — для передачи нажмите «Сохранить HTML»', false);
      /* правки этого браузера + данные файла: по каждому значению берётся более новое (другие ПК могли изменить файл) */
      var s = lsGet('ov', null), dirty = false;
      /* правки, сделанные в этом браузере до первого сохранения файла (файл без saveId) — переносятся один раз */
      if (!s && EMBEDDED.saveId) { try { var s0 = localStorage.getItem('oor_app_v2_base' + 'ov'); if (s0) s = JSON.parse(s0); } catch (e) { } }
      if (s && s.OV) { var mg = ovMerge({ OV: s.OV, META: s.META || {}, KT: s.KT || {} }, { OV: OV, META: OVMETA, KT: KT }); OV = mg.ov.OV; OVMETA = mg.ov.META; KT = mg.ov.KT; dirty = mg.toB > 0; }
      OV_TYPES.forEach(function (k) { OV[k] = OV[k] || {}; });
      HIST = histMerge(lsGet('hist', []), HIST);
      var b = lsGet('base', null); if (b && baseT(b) > baseT(BASE)) { setBase(b); dirty = true; } else if (b) lsDel('base');
      var m = lsGet('models', null); if (m && baseT(m) > baseT(MODELS)) { setModels(m); dirty = true; } else if (m) lsDel('models');
      lsQuiet('ov', { OV: OV, META: OVMETA, KT: KT });
      SYNC.dirty = dirty;
      recalc();
    }
    function resolveNames() {
      if (!USER || !USER.profiles) return;
      var ids = {}; HIST.forEach(function (h) { if (h.by) ids[h.by] = 1; }); Object.keys(OVMETA).forEach(function (k) { if (OVMETA[k].by) ids[OVMETA[k].by] = 1; });
      var list = Object.keys(ids); if (!list.length) return;
      Promise.resolve(USER.profiles(list)).then(function (ps) { list.forEach(function (id) { if (ps && ps[id] && ps[id].name) NAMES[id] = ps[id].name; }); if (ov.classList.contains('on') && $('histList')) drawHist(); }).catch(function () { });
    }

    /* ---- история ---- */
    function histModal() {
      openModal(head('История изменений', 'Ручные правки, загрузка книги и базы моделей · кто и когда') + '<div class="fbar"><input type="search" id="hq" placeholder="Поиск по истории…" style="min-width:260px"><select id="hk"><option value="">Все события</option><option value="edit">Правки</option><option value="book">Загрузка книги</option><option value="models">Загрузка Марки Авто</option><option value="save">Сохранение файла</option><option value="bom">Структура</option><option value="undo">Отмена / повтор</option><option value="order">Заказы вручную</option><option value="analysis">Анализ</option><option value="comment">Комментарии</option><option value="stock">Обновление склада</option></select>' + (CAN_WRITE ? '<span class="sp"></span><button class="btn sm" id="hClr">Очистить историю</button>' : '') + '</div><div id="histList"></div></div>', true);
      var hb = modal.querySelector('.fbar'); if (hb && CAN_WRITE) { hb.insertAdjacentHTML('afterbegin', '<button class="btn sm" id="hUndo"><svg class="ic" aria-hidden="true"><use href="#i-undo"/></svg>Отменить</button><button class="btn sm" id="hRedo"><svg class="ic" aria-hidden="true"><use href="#i-redo"/></svg>Повторить</button>'); $('hUndo').onclick = function () { undoMenu(this, false); }; $('hRedo').onclick = function () { undoMenu(this, true); }; undoUi(); }
      if ($('hClr')) $('hClr').onclick = function () { var b = $('hClr'); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Точно очистить всю историю?'; b.classList.add('danger'); return; } histClear(); };
      $('hq').addEventListener('input', drawHist); $('hk').addEventListener('change', drawHist); drawHist();
    }
    function drawHist() {
      var q = ($('hq').value || '').replace(/\s+/g, '').toUpperCase(), k = $('hk').value;
      var rows = HIST.filter(function (h) { if (k && h.kind !== k) return false; return !q || JSON.stringify(h).replace(/\s+/g, '').toUpperCase().indexOf(q) >= 0; });
      var out = '<p class="note">Записей: ' + rows.length + '</p><div class="scroll"><table class="mini"><tr><th>Когда</th><th>Кто</th><th>Что</th><th>Позиция / заказ</th><th class="n">Было</th><th class="n">Стало</th><th></th></tr>';
      rows.slice(0, 500).forEach(function (h, i) {
        if (h.kind === 'edit') out += '<tr><td class="ref">' + esc(nowStr(h.ts)) + '</td><td>' + esc(whoName(h.by)) + '</td><td>' + esc(h.field) + (h.revert ? ' <span class="pill warn">возврат</span>' : '') + '</td><td>' + esc(h.pos) + (h.ord ? '<br><span class="note">' + esc(h.ord) + '</span>' : '') + '</td><td class="n">' + esc(typeof h.from === 'number' ? fmt(h.from) : h.from) + '</td><td class="n">' + esc(typeof h.to === 'number' ? fmt(h.to) : h.to) + '</td><td><button class="btn sm" data-undo="' + HIST.indexOf(h) + '">Вернуть «было»</button></td></tr>';
        else out += '<tr><td class="ref">' + esc(nowStr(h.ts)) + '</td><td>' + esc(whoName(h.by)) + '</td><td>' + ({ book: 'Загрузка книги', models: 'Загрузка Марки Авто', save: 'Сохранён HTML-файл', order: 'Заказ вручную', analysis: 'Анализ заново', comment: 'Комментарий', stock: 'Обновление склада', bom: 'Структура', undo: 'Отмена / повтор' }[h.kind] || h.kind) + '</td><td colspan="4" class="pre">' + esc(h.text) + '</td></tr>';
      });
      $('histList').innerHTML = out + '</table></div>';
      $('histList').querySelectorAll('[data-undo]').forEach(function (b) {
        b.onclick = function () {
          var h = HIST[+b.dataset.undo];
          if (h.t === 'obs') { setObsEdit(h.k, h.pos, h.from === null || h.from === undefined ? '' : h.from, h.orig).then(function () { recalc(); drawHist(); showMsg('Значение возвращено.', 'good'); }, function (e) { showMsg('Ошибка: ' + esc(e.message || e), 'err'); }); return; }
          if (h.t === 'td2') { setTd2Edit(h.k, h.pos, h.from).then(function () { recalc(); drawHist(); showMsg('Значение возвращено.', 'good'); }, function (e) { showMsg('Ошибка: ' + esc(e.message || e), 'err'); }); return; }
          var p = OOR.positions.find(function (x) { return (h.t === 'q' || h.t === 'r') ? h.k.indexOf(x.key + '§') === 0 : x.key === h.k; });
          var o = (h.t === 'q' || h.t === 'r') ? OOR.orders.find(function (x) { return h.k === p.key + '§' + x.key; }) : null;
          if (!p || ((h.t === 'q' || h.t === 'r') && !o)) { showMsg('Позиции или заказа больше нет в текущей книге.', 'err'); return; }
          setEdit(h.t, p, o, h.from, true).then(function () { recalc(); drawHist(); showMsg('Значение возвращено.', 'good'); }, function (e) { showMsg('Ошибка: ' + esc(e.message || e), 'err'); });
        };
      });
    }

    /* ================= загрузка файлов ================= */
    function compactObr(rows) { var last = rows.length; while (last > 0 && !rows[last - 1].v.length) last--; return rows.slice(0, last); }
    function readWb(f) { return f.arrayBuffer().then(function (buf) { return XLSX.read(buf, { type: 'array', cellDates: true, cellStyles: true }); }); }
    function sheetRows(wb, n) { return XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }); }
    /* ================= справочники книги: Анализ_разоб_виде, кг_шт, «-» ================= */
    function parseDisasm(rows) {
      if (!rows || !rows.length) return null;
      var hr = -1, C = {}, r;
      for (r = 0; r < Math.min(rows.length, 10) && hr < 0; r++) {
        C = {};
        (rows[r] || []).forEach(function (v, j) { var t = cleanSp(v).toLowerCase(); if (/^trt/.test(t)) C.code = j; else if (/^готов/.test(t)) C.semi = j; else if (/максимал/.test(t)) C.max = j; else { var m = t.match(/\((0[12346])\)/); if (m) C[m[1]] = j; } });
        if (C.code !== undefined && C.semi !== undefined && C['01'] !== undefined) hr = r;
      }
      if (hr < 0) return null;
      var list = [], map = {}, cur = null;
      for (r = hr + 1; r < rows.length; r++) {
        var row = rows[r] || [], code = cleanSp(row[C.code]), sm = cleanSp(row[C.semi]);
        if (code) { cur = { code: code, semi: [], p: ['', '', '', '', ''], s: [null, null, null, null, null], max: C.max !== undefined && typeof row[C.max] === 'number' ? row[C.max] : null }; list.push(cur); }
        if (!cur) continue;
        if (sm) cur.semi.push(sm);
        ['01', '02', '03', '04', '06'].forEach(function (g, i) {
          if (C[g] === undefined || cur.p[i]) return;
          var v = cleanSp(row[C[g]]); if (v) { cur.p[i] = /^не\s*использ/i.test(v) ? '-' : v; if (cur.p[i] !== '-' && typeof row[C[g] + 1] === 'number') cur.s[i] = row[C[g] + 1]; }
        });
      }
      /* норма деталей на 1 п/ф: наименьшее N (1–4), при котором мин. остаток ÷ N = «Максимально можно собрать» (R 4xxx в книге — 2) */
      var norm = {};
      list.forEach(function (it) {
        var st = it.s.filter(function (x) { return x !== null; }), mn = st.length ? Math.min.apply(null, st) : null, k = 0;
        if (mn > 0 && it.max !== null) for (var n = 1; n <= 4 && !k; n++) if (Math.floor(mn / n) === it.max) k = n;
        it.norm = k || null;
        if (k) norm[cleanSp(it.code.replace(/\(.*$/, '')).toUpperCase().replace(/\s+/g, '')] = k;
      });
      list.forEach(function (it) { map[cleanSp(it.code.replace(/\(.*$/, '')).toUpperCase().replace(/\s+/g, '')] = it.p.concat([it.semi[0] || '', it.code]); });
      return list.length ? { rows: list, map: map, norm: norm } : null;
    }
    function parseKgSh(rows) {
      if (!rows || rows.length < 2) return null;
      var hr = -1, C = {}, r;
      for (r = 0; r < Math.min(rows.length, 10) && hr < 0; r++) {
        C = {};
        (rows[r] || []).forEach(function (v, j) { var t = cleanSp(v).toLowerCase(); if (/^товар/.test(t)) C.p = j; else if (/^основн/.test(t)) C.m = j; else if (/^под-?\s*детал/.test(t)) C.d = j; else if (/^материал/.test(t)) C.mat = j; else if (/^кг/.test(t)) C.kg = j; else if (/средн/.test(t)) C.f = j; });
        if (C.p !== undefined && C.kg !== undefined && (C.d !== undefined || C.m !== undefined)) hr = r;
      }
      if (hr < 0) return null;
      var kg = {}, n = 0;
      for (r = hr + 1; r < rows.length; r++) {
        var w = rows[r] || [], p = cleanSp(w[C.p]), d = cleanSp(w[C.d !== undefined ? C.d : C.m]) || cleanSp(w[C.m]), x = w[C.kg], v = typeof x === 'number' ? x : parseFloat(cleanSp(x).replace(',', '.')), f = C.f !== undefined ? cleanSp(w[C.f]) : '';
        if (!p || !d || !(v > 0) || /x̄|~/.test(f)) continue;
        kg[kgKey(baseProductCode(p)) + '|' + kgKey(d)] = v; n++;
      }
      return n ? { kg: kg, n: n } : null;
    }
    function parseAlias(rows) {
      var A = {}, n = 0;
      (rows || []).forEach(function (r) { (r || []).forEach(function (v) { var t = cleanSp(v).toUpperCase().replace(/\s+/g, ''), m = t.match(/^([A-Z]+\d[\w\/-]*)=([A-Z]+\d[\w\/-]*)$/); if (m) { A[m[1]] = m[2]; n++; } }); });
      return n ? A : null;
    }
    $('file').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return; e.target.value = '';
      if (!window.XLSX) { showMsg('Модуль чтения Excel не загрузился. Обновите страницу.', 'err'); return; }
      showMsg('Читаю ' + esc(f.name) + '…', 'good');
      readWb(f).then(function (wb) {
        var find = function (n) { return wb.SheetNames.find(function (s) { return s.trim().toUpperCase() === n; }); };
        var sO = find('OOR'), sT = find('TDSHEET2');
        if (!sO || !sT) throw new Error('В книге нужны листы «OOR» и «TDSheet2». Найдены: ' + wb.SheetNames.join(', '));
        var oor = parseOOR(sheetRows(wb, sO)), td2 = parseTD2(sheetRows(wb, sT));
        var sOr = find('ORDER'), sRa = wb.SheetNames.find(function (s) { return /^РАСЧ[ЁЕ]Т/i.test(s.trim()); }), sOb = find('ОБРАБОТКА');
        var macro = parseMacro(sOr ? sheetRows(wb, sOr) : null, sRa ? sheetRows(wb, sRa) : null, sOb ? sheetRows(wb, sOb) : null);
        var sTd = find('TDSHEET'), sNp = find('NEP'), sBp = find('БАЗА ПЫЛЬНИК');
        var struct = buildStructRaw(sTd ? sheetRows(wb, sTd) : [], sNp ? sheetRows(wb, sNp) : [], sBp ? sheetRows(wb, sBp) : []);
        var sDa = wb.SheetNames.find(function (s) { return /^анализ.?разоб/i.test(s.trim()); }), sKg = wb.SheetNames.find(function (s) { return /^кг.?шт$/i.test(s.trim()); }), sAl = find('-');
        var old = BASE, b = {
          file: f.name, loadedAt: nowStr(Date.now()), oor: oor, td2: { period: td2.period, rows: td2.rows }, macro: macro, struct: struct, obr: sOb ? compactObr(obrFromSheet(wb.Sheets[sOb])) : null,
          disasm: sDa ? parseDisasm(sheetRows(wb, sDa)) : null, kgsh: sKg ? parseKgSh(sheetRows(wb, sKg)) : null, alias: sAl ? parseAlias(sheetRows(wb, sAl)) : null
        };
        if (old && old.td2) b.stkDiff = stkDiffCalc(old.td2.rows, td2.rows, 'Обновить базу', f.name, old.td2.period, td2.period);
        var diff = diffBase(old, b);
        setBase(b);
        var hst = {
          ts: Date.now(), by: ME, kind: 'book', text: 'Файл ' + f.name + ': OOR — ' + oor.orders.length + ' заказов, ' + oor.positions.length + ' позиций; TDSheet2 на ' + (td2.period || '—') + ' — ' + td2.rows.length + ' строк; Обработка: ' + Object.keys(macro.items).length + ' товаров (' + (macro.title || 'нет листа Order') + ').' +
            ' TDSheet: ' + struct.raw.td.length + ' строк, NEP: ' + struct.raw.nep.length + ', База пыльник: ' + struct.raw.bp.length + ', Анализ_разоб_виде: ' + (b.disasm ? b.disasm.rows.length + ' товаров' : 'нет') + ', кг_шт: ' + (b.kgsh ? b.kgsh.n : 'нет') + ', «-»: ' + (b.alias ? Object.keys(b.alias).length : 'нет') + '.' + (b.stkDiff ? ' Склад к прошлой книге: ▲ ' + b.stkDiff.inc + ' выросло, ▼ ' + b.stkDiff.dec + ' уменьшилось.' : '') + '\n' + diff
        };
        HIST.unshift(hst);
        if (!DB) { lsSet('base', b); persistHist(hst); showMsg('Книга загружена (сохранена в этом браузере). ' + esc(diff), 'good'); return; }
        showMsg('Книга прочитана, сохраняю в базу…', 'good');
        return saveChunked('base_chunks', 'meta/base', b, { file: f.name, loadedAt: b.loadedAt, by: ME || '' }).then(function (ver) { loadedVer.base = ver; return persistHist(hst); })
          .then(function () { showMsg('Книга загружена и сохранена в базу. ' + esc(diff), 'good'); });
      }).catch(function (err) { showMsg('Ошибка: ' + esc(err.message || err.code || err), 'err'); });
    });
    function diffBase(a, b) {
      if (!a) return '';
      var A = {}, B = {}, ch = 0;
      a.oor.positions.forEach(function (p) { a.oor.orders.forEach(function (o) { if (p.q[o.id] || p.r[o.id]) A[p.key + '§' + o.key] = (p.q[o.id] || 0) + '/' + (p.r[o.id] || 0); }); });
      b.oor.positions.forEach(function (p) { b.oor.orders.forEach(function (o) { if (p.q[o.id] || p.r[o.id]) B[p.key + '§' + o.key] = (p.q[o.id] || 0) + '/' + (p.r[o.id] || 0); }); });
      Object.keys(B).forEach(function (k) { if (A[k] !== B[k]) ch++; }); Object.keys(A).forEach(function (k) { if (!(k in B)) ch++; });
      var ta = indexTD2({ rows: a.td2.rows }), tb = indexTD2({ rows: b.td2.rows }), sc = 0;
      b.oor.positions.forEach(function (p) { if (td2Stock(ta, p.name).stock !== td2Stock(tb, p.name).stock) sc++; });
      return 'Изменилось ячеек заказ/резерв: ' + ch + '; позиций с другим остатком склада: ' + sc + '.';
    }
    /* ================= Обновить склад: только остатки (TDSheet2 / отчёт 1С «Остатки номенклатуры») ================= */
    function parseStockSheet(rows) {
      var hr = -1, cN = -1, cQ = -1, cM = -1, cW = -1, period = '';
      for (var r = 0; r < Math.min(rows.length, 60) && hr < 0; r++) {
        var row = rows[r] || [], n = -1, q = -1, m = -1, w = -1;
        row.forEach(function (v, j) {
          var t = cleanSp(v).toLowerCase(); if (!t) return;
          if (!period && /^период/.test(t)) { var mm = t.match(/(\d{1,2}\.\d{1,2}\.\d{4})/); period = mm ? mm[1] : t.replace(/^период:\s*/, ''); }
          if (n < 0 && /^номенклатура$/.test(t)) n = j;
          else if (w < 0 && /^склад/.test(t)) w = j;
          else if (m < 0 && /^мин/.test(t)) m = j;
          else if (q < 0 && /остат|количеств|кол-во/.test(t)) q = j;
        });
        if (n >= 0 && q >= 0) { hr = r; cN = n; cQ = q; cM = m; cW = w; }
      }
      if (hr < 0) throw new Error('Не найдена шапка с колонками «Номенклатура» и «Остаток» (как в TDSheet2 / отчёте 1С «Остатки номенклатуры»).');
      var list = [];
      for (r = hr + 1; r < rows.length; r++) {
        var x = rows[r] || [], nm = cleanSp(x[cN]); if (!nm || /^номенклатура$/i.test(nm) || /^итого/i.test(nm)) continue;
        list.push([nm, numLike(x[cQ]), cM >= 0 ? numLike(x[cM]) : null, cW >= 0 ? cleanSp(x[cW]) : '', r + 1]);
      }
      return { period: period, rows: list, cols: { name: colLetter(cN), qty: colLetter(cQ), min: cM >= 0 ? colLetter(cM) : '', wh: cW >= 0 ? colLetter(cW) : '' } };
    }
    function td2Keys(rows) { var s = {}; rows.forEach(function (x) { if (EXCL_WH.indexOf(String(x[3]).toUpperCase()) < 0) s[x[0].toUpperCase()] = 1; }); return Object.keys(s); }
    var SNAP = null;
    function snapOrders() {
      var S = { by: {}, short: 0, rows: 0, pos: 0, closed: 0, n: 0 }, ps = {};
      QUEUE.forEach(function (o) {
        var q = 0, need = 0, sh = 0, np = 0;
        OOR.positions.forEach(function (p) { var c = R[p.id].cells[o.id]; if (!c) return; np++; q += c.q; need += c.need; var s = finalShort(p, o); if (s > 0) { sh += s; S.rows++; ps[p.id] = 1; } });
        if (!np) return;
        S.n++; if (!sh) S.closed++; S.short += sh;
        S.by[o.key] = { np: np, q: q, need: need, sh: sh };
      });
      S.pos = Object.keys(ps).length; return S;
    }
    function stockEditCount() { return Object.keys(OV.stock).length + Object.keys(OV.td2 || {}).length + Object.keys(OV.obs || {}).length; }
    function clearStockEdits() {
      var jobs = [];
      Object.keys(OV.stock).forEach(function (k) { var id = 'e' + hash('stock|' + k); delete OVMETA[id]; jobs.push(persistEdit(id, 'stock', k, null, { name: k }, null, Date.now())); });
      Object.keys(OV.td2 || {}).forEach(function (k) { var id = 'e' + hash('td2|' + k); delete OVMETA[id]; jobs.push(persistEdit(id, 'td2', k, null, { name: k }, null, Date.now())); });
      Object.keys(OV.obs || {}).forEach(function (k) { var id = 'e' + hash('obs|' + k); delete OVMETA[id]; jobs.push(persistEdit(id, 'obs', k, null, { name: k }, null, Date.now())); });
      OV.stock = {}; OV.td2 = {}; OV.obs = {};
      return Promise.all(jobs);
    }
    /* ================= сверка склада: что изменилось относительно прошлого склада (▲ вырос / ▼ уменьшился) ================= */
    function stkDiffCalc(oldRows, newRows, src, file, from, to) {
      var A = indexTD2({ rows: oldRows || [] }).idx, B = indexTD2({ rows: newRows || [] }).idx, items = [], keys = {}, inc = 0, dec = 0, sInc = 0, sDec = 0;
      Object.keys(A).forEach(function (k) { keys[k] = 1; }); Object.keys(B).forEach(function (k) { keys[k] = 1; });
      var sum = function (e) { var s = 0, any = false; if (e) e.rows.forEach(function (x) { if (!x.excl && x.qty !== null) { s += x.qty; any = true; } }); return any ? Math.round(s * 1000) / 1000 : null; };
      Object.keys(keys).forEach(function (k) {
        var a = sum(A[k]), b = sum(B[k]), d = (b || 0) - (a || 0); if (Math.abs(d) < 1e-9) return;
        items.push([(B[k] || A[k]).name, a, b]); if (d > 0) { inc++; sInc += d; } else { dec++; sDec -= d; }
      });
      items.sort(function (x, y) { return Math.abs((y[2] || 0) - (y[1] || 0)) - Math.abs((x[2] || 0) - (x[1] || 0)); });
      return { at: nowStr(Date.now()), src: src, file: file || '', from: from || '', to: to || '', items: items.slice(0, 6000), inc: inc, dec: dec, sInc: Math.round(sInc * 1000) / 1000, sDec: Math.round(sDec * 1000) / 1000, seen: false };
    }
    var STKD = {}, STKD_SRC = null;
    function stkD() { var d = BASE && BASE.stkDiff; if (d !== STKD_SRC) { STKD_SRC = d; STKD = {}; if (d) d.items.forEach(function (x) { STKD[normKey(x[0])] = x; }); } return STKD; }
    function stkDelta(x) { return (x[2] || 0) - (x[1] || 0); }
    function stkArrow(name) {
      var x = stkD()[normKey(name)]; if (!x) return '';
      var d = stkDelta(x);
      return '<span class="sdl ' + (d > 0 ? 'up' : 'dn') + '" title="' + esc('Склад ' + (d > 0 ? 'вырос' : 'уменьшился') + ' после обновления: было ' + fmt(x[1] || 0) + ' → стало ' + fmt(x[2] || 0) + ' (' + (d > 0 ? '+' : '−') + fmt(Math.abs(d)) + ')') + '">' + (d > 0 ? '▲' : '▼') + '</span>';
    }
    function stkBang() {
      var d = BASE && BASE.stkDiff, on = !!(d && d.items.length);
      [$('stockBtn'), document.querySelector('#htiles [data-k="stock"]')].forEach(function (b) {
        if (!b) return; var s = b.querySelector('.bang');
        if (!on) { if (s) s.remove(); return; }
        if (!s) { s = document.createElement('span'); s.className = 'bang'; b.appendChild(s); }
        s.textContent = '!'; s.classList.toggle('new', !d.seen);
        s.title = 'Сверка склада ' + d.at + ': ▲ ' + d.inc + ' выросло, ▼ ' + d.dec + ' уменьшилось — откройте СКЛАД';
      });
    }
    function stkDiffHtml(full) {
      var d = BASE && BASE.stkDiff; if (!d) return '';
      var D = stkD(), inOOR = {}; OOR.positions.forEach(function (p) { if (D[normKey(p.name)]) inOOR[normKey(p.name)] = 1; });
      var nO = Object.keys(inOOR).length;
      var h = '<details class="sec s-sdf"' + (full ? ' open' : '') + '><summary class="sec-h"><span class="ic">⇅</span>Последняя сверка склада <span class="sdh">' + esc(d.at) + ' · ' + esc(d.src) + (d.file ? ' · ' + esc(d.file) : '') + ' · было на ' + esc(d.from || '—') + ' → стало на ' + esc(d.to || '—') + '</span><span class="sp"></span><span class="tw">▾</span></summary><div class="sec-b">';
      h += '<div class="tiles"><div class="tile ok"><div class="v"><span class="sdl up">▲</span> ' + d.inc + '</div><div class="l">выросло · +' + fmt(d.sInc) + '</div></div><div class="tile bad"><div class="v"><span class="sdl dn">▼</span> ' + d.dec + '</div><div class="l">уменьшилось · −' + fmt(d.sDec) + '</div></div><div class="tile"><div class="v">' + nO + '</div><div class="l">из них позиций заказов (OOR)</div></div><div class="tile"><div class="v">' + (d.inc + d.dec) + '</div><div class="l">изменений всего</div></div></div>';
      h += '<div class="fbar"><input type="search" id="sdq" placeholder="Поиск"><select id="sdf"><option value="">Все изменения</option><option value="up">▲ только выросло</option><option value="dn">▼ только уменьшилось</option><option value="oor">только позиции заказов</option></select><span class="note" id="sdn"></span></div><div class="scroll" style="max-height:46vh"><table class="mini sdt" id="sdt"></table></div></div></details>';
      return h;
    }
    function stkDiffBind() {
      var d = BASE && BASE.stkDiff; if (!d || !$('sdt')) return;
      var oor = {}; OOR.positions.forEach(function (p) { oor[normKey(p.name)] = 1; });
      var draw = function () {
        var q = ($('sdq').value || '').replace(/\s+/g, '').toUpperCase(), f = $('sdf').value, n = 0, h = '<tr><th class="n">№</th><th>Номенклатура</th><th class="n">Было</th><th class="n">Стало</th><th class="n">Изменение</th></tr>';
        d.items.forEach(function (x) {
          var dl = stkDelta(x); if (f === 'up' && dl <= 0) return; if (f === 'dn' && dl >= 0) return; if (f === 'oor' && !oor[normKey(x[0])]) return;
          if (q && x[0].replace(/\s+/g, '').toUpperCase().indexOf(q) < 0) return;
          if (++n > 1500) return;
          h += '<tr><td class="n sdno">' + n + '</td><td>' + (oor[normKey(x[0])] ? '<b>' + esc(x[0]) + '</b>' : esc(x[0])) + '</td><td class="n">' + (x[1] === null ? '—' : fmt(x[1])) + '</td><td class="n">' + (x[2] === null ? '—' : fmt(x[2])) + '</td><td class="n sdv ' + (dl > 0 ? 'up' : 'dn') + '"><span class="sdl ' + (dl > 0 ? 'up' : 'dn') + '">' + (dl > 0 ? '▲' : '▼') + '</span> ' + (dl > 0 ? '+' : '−') + fmt(Math.abs(dl)) + '</td></tr>';
        });
        $('sdt').innerHTML = h; $('sdn').textContent = 'строк: ' + n + (n > 1500 ? ' (показаны первые 1500)' : '');
      };
      $('sdq').oninput = draw; $('sdf').onchange = draw; draw();
      if (!d.seen) { d.seen = true; stkBang(); if (!DB) lsSet('base', BASE); }
    }
    function stkDiffModal() {
      openModal(head('Сверка склада', 'что изменилось относительно прошлого склада') + stkDiffHtml(true) + '</div>', true);
      stkDiffBind();
    }
    function applyStock(f, sheet, td2, resetEdits) {
      SNAP = snapOrders(); SNAP.label = 'до обновления склада (на ' + (TD2.period || '—') + ')';
      var oldIdx = indexTD2({ rows: BASE.td2.rows }), newIdx = indexTD2({ rows: td2.rows }), sc = 0;
      OOR.positions.forEach(function (p) { if (td2Stock(oldIdx, p.name).stock !== td2Stock(newIdx, p.name).stock) sc++; });
      var prev = BASE.stockUpd, b = Object.assign({}, BASE, { td2: { period: td2.period, rows: td2.rows } });
      b.stkDiff = stkDiffCalc(BASE.td2.rows, td2.rows, 'Обновить склад', f.name, BASE.td2.period, td2.period);
      b.stockUpd = { file: f.name, sheet: sheet, loadedAt: nowStr(Date.now()), period: td2.period, rows: td2.rows.length, bookPeriod: prev ? prev.bookPeriod : BASE.td2.period, bookKeys: prev ? prev.bookKeys : td2Keys(BASE.td2.rows) };
      var nEd = stockEditCount();
      var pre = resetEdits && nEd ? clearStockEdits() : Promise.resolve();
      return pre.then(function () {
        setBase(b);
        var txt = 'Файл ' + f.name + ' (лист ' + sheet + '): склад на ' + (td2.period || '—') + ', строк ' + td2.rows.length + '. Позиций OOR с другим остатком: ' + sc + '.' + (nEd ? (resetEdits ? ' Ручные правки остатков сброшены: ' + nEd + '.' : ' Ручные правки остатков оставлены: ' + nEd + '.') : '');
        var hst = { ts: Date.now(), by: ME, kind: 'stock', text: txt }; HIST.unshift(hst);
        if (!DB) { lsSet('base', b); persistHist(hst); return txt; }
        return saveChunked('base_chunks', 'meta/base', b, { file: b.file, loadedAt: b.loadedAt, by: ME || '' }).then(function (ver) { loadedVer.base = ver; return persistHist(hst); }).then(function () { return txt; });
      });
    }
    $('sfile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return; e.target.value = '';
      if (!BASE) { showMsg('Сначала загрузите книгу («Обновить базу»).', 'err'); return; }
      if (!window.XLSX) { showMsg('Модуль чтения Excel не загрузился. Обновите страницу.', 'err'); return; }
      showMsg('Читаю склад из ' + esc(f.name) + '…', 'good');
      readWb(f).then(function (wb) {
        var sheet = wb.SheetNames.find(function (s) { return /^TDSHEET2$/i.test(s.trim()); }) || wb.SheetNames.find(function (s) { return /^TDSHEET$/i.test(s.trim()); }) || wb.SheetNames[0];
        var td2 = parseStockSheet(sheetRows(wb, sheet));
        var withQ = td2.rows.filter(function (x) { return x[1] !== null; }).length;
        if (withQ < 20) throw new Error('В листе «' + sheet + '» найдено только ' + withQ + ' строк с остатком — это не похоже на отчёт остатков.');
        var go = function (reset) {
          closeModal(); showMsg('Обновляю склад…', 'good');
          setTimeout(function () {
            applyStock(f, sheet, td2, reset).then(function (txt) { showMsg('Склад обновлён. ' + esc(txt) + ' Нажмите <b>⟳ АНАЛИЗ</b> — итог по заказам.', 'good'); $('anBtn').classList.add('hot'); stkDiffModal(); }, function (err) { showMsg('Ошибка: ' + esc(err.message || err.code || err), 'err'); });
          }, 30);
        };
        var nEd = stockEditCount();
        if (!nEd) { go(false); return; }
        openModal(head('Новый склад: ' + esc(f.name), 'Лист ' + esc(sheet) + ' · на ' + esc(td2.period || '—') + ' · строк ' + td2.rows.length) +
          '<p style="font-size:15px">Есть ручные правки остатков: <b>' + nEd + '</b> (остаток товара, склад, блок Обработки). Новый склад уже содержит актуальные остатки.</p>' +
          '<div class="fbar"><button class="btn primary" id="suReset">Сбросить правки остатков</button><button class="btn" id="suKeep">Оставить правки</button><button class="btn" id="suNo">Отмена</button></div></div>');
        $('suReset').onclick = function () { go(true); }; $('suKeep').onclick = function () { go(false); }; $('suNo').onclick = closeModal;
      }).catch(function (err) { showMsg('Ошибка: ' + esc(err.message || err.code || err), 'err'); });
    });
    /* итог анализа по заказам (до / после) */
    function analysisModal(now, prev, txt) {
      var d = function (a, b, good) { if (b === undefined || b === null || a === b) return ''; var up = a > b; return ' <span style="font-size:12px;font-weight:700;color:' + ((up === good) ? 'var(--ok)' : 'var(--bad)') + '">' + (up ? '▲' : '▼') + ' было ' + fmt(b) + '</span>'; };
      var h = head('Итог анализа', esc(txt));
      if (prev) h += '<p class="note">Сравнение: ' + esc(prev.label) + '</p>';
      h += '<div class="tiles">' +
        '<div class="tile ' + (now.closed === now.n ? 'ok' : '') + '"><div class="v">' + now.closed + ' / ' + now.n + d(now.closed, prev && prev.closed, true) + '</div><div class="l">Заказов закрыто полностью</div></div>' +
        '<div class="tile ' + (now.short ? 'bad' : 'ok') + '"><div class="v">' + fmt(now.short) + ' шт' + d(now.short, prev && prev.short, false) + '</div><div class="l">Не хватает всего</div></div>' +
        '<div class="tile"><div class="v">' + now.pos + d(now.pos, prev && prev.pos, false) + '</div><div class="l">Позиций с нехваткой</div></div>' +
        '<div class="tile"><div class="v">' + now.rows + d(now.rows, prev && prev.rows, false) + '</div><div class="l">Строк позиция × заказ с нехваткой</div></div></div>';
      h += '<div class="scroll" style="max-height:60vh"><table class="mini an-t"><tr><th>#</th><th>Заказ</th><th>Клиент</th><th>Дата</th><th>Срок</th><th class="n">Позиций</th><th class="n">Заказ, шт</th><th class="n">Нужно со склада</th><th class="n">Не хватает</th>' + (prev ? '<th class="n">Было</th>' : '') + '<th class="n">Готовность</th><th>Статус</th></tr>';
      var i = 0;
      QUEUE.forEach(function (o) {
        var s = now.by[o.key]; if (!s) return; i++;
        var pv = prev && prev.by[o.key], rd = s.need ? Math.max(0, Math.round((s.need - s.sh) / s.need * 100)) : 100;
        var st = !s.sh ? '<span class="sst ok">закрыт</span>' : '<span class="sst red">не хватает</span>';
        var ch = pv && pv.sh !== s.sh ? (s.sh < pv.sh ? ' style="color:var(--ok)"' : ' style="color:var(--bad)"') : '';
        h += '<tr class="goo" data-o="' + o.id + '"><td>' + i + '</td><td><b>' + esc(o.label) + '</b></td><td>' + esc(o.client || '') + '</td><td>' + esc(o.created || '') + '</td><td>' + esc(o.due || '') + '</td><td class="n">' + s.np + '</td><td class="n">' + fmt(s.q) + '</td><td class="n">' + fmt(s.need) + '</td><td class="n"' + (s.sh ? ' style="color:var(--bad)"' : '') + '><b>' + (s.sh ? fmt(s.sh) : '—') + '</b></td>' + (prev ? '<td class="n"' + ch + '>' + (pv ? (pv.sh ? fmt(pv.sh) : '—') : 'нов.') + '</td>' : '') + '<td class="n">' + rd + ' %</td><td>' + st + '</td></tr>';
      });
      openModal(h + '</table></div></div>', true);
      modal.querySelectorAll('tr.goo').forEach(function (tr) { tr.onclick = function () { ordModal(tr.dataset.o); }; });
    }

    $('mfile').addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files); e.target.value = ''; if (!files.length) return;
      if (!window.XLSX) { showMsg('Модуль чтения Excel не загрузился. Обновите страницу.', 'err'); return; }
      showMsg('Читаю ' + files.length + ' файл(а)… большой файл может читаться до минуты.', 'good');
      Promise.all(files.map(function (f) { return readWb(f).then(function (wb) { return { f: f, map: parseModels(sheetRows(wb, wb.SheetNames[0]), /_RP/i.test(f.name) ? 'RP' : 'SS') }; }); })).then(function (res) {
        var map = {}, names = [];
        res.forEach(function (x) { names.push(x.f.name); for (var k in x.map) if (!map[k]) map[k] = x.map[k]; });
        var keep = MODELS ? MODELS.map : {}, added = 0;
        Object.keys(keep).forEach(function (k) { if (!map[k] && !res.some(function (x) { return keep[k].src === (/_RP/i.test(x.f.name) ? 'RP' : 'SS'); })) map[k] = keep[k]; });
        Object.keys(map).forEach(function (k) { if (!keep[k]) added++; });
        var m = { src: names.join('; '), loadedAt: nowStr(Date.now()), map: map };
        setModels(m);
        var hst = { ts: Date.now(), by: ME, kind: 'models', text: names.join(', ') + ': кодов в базе ' + Object.keys(map).length + ' (новых ' + added + ').' };
        HIST.unshift(hst);
        if (!DB) { lsSet('models', m); persistHist(hst); showMsg('База моделей обновлена (в этом браузере).', 'good'); return; }
        return saveChunked('model_chunks', 'meta/models', m, { src: m.src, loadedAt: m.loadedAt, by: ME || '' }).then(function (ver) { loadedVer.models = ver; return persistHist(hst); })
          .then(function () { showMsg('База моделей обновлена и сохранена: ' + Object.keys(map).length + ' кодов.', 'good'); });
      }).catch(function (err) { showMsg('Ошибка: ' + esc(err.message || err.code || err), 'err'); });
    });

    /* ================= прочее ================= */
    function showText(t) { openModal(head('Список нехватки', 'Выделите всё (Ctrl+A), скопируйте и вставьте в Excel') + '<textarea class="big" readonly>' + esc(t) + '</textarea></div>'); var ta = modal.querySelector('textarea'); ta.focus(); ta.select(); }
    /* полоса «что показано» — видна всегда (и при скрытом верхе); «Показать все» сбрасывает фильтр, клиента и поиск */
    var FLT_T = { short: 'только с нехваткой', ok: 'только где хватает', nf: 'нет в складе', ed: 'с ручными правками', cm: 'только позиции с комментариями' };
    function renderFltBar(list, ords) {
      var b = $('fltBar'); if (!b) return;
      var f = $('flt').value, c = $('cli').value, q = ($('q').value || '').trim(), parts = [];
      if (FLT_T[f]) parts.push('<b>' + FLT_T[f] + '</b>');
      if (c) parts.push('клиент <b>' + esc(c) + '</b>');
      if (q) parts.push('поиск «<b>' + esc(q) + '</b>»');
      if (!parts.length) { b.hidden = true; b.innerHTML = ''; return; }
      b.innerHTML = '<span>Показано: ' + parts.join(' · ') + ' — позиций ' + (list || []).length + ', заказов ' + ords.length + '</span><button class="btn sm pri" id="fltAll">✕ Показать все</button>';
      b.hidden = false;
      $('fltAll').onclick = function () { $('flt').value = 'all'; $('cli').value = ''; $('q').value = ''; render(); };
    }
    function showMsg(t, cls) { var m = $('msg'); m.className = 'msg on ' + cls; m.innerHTML = t; clearTimeout(m._t); m._t = setTimeout(function () { m.className = 'msg'; }, 9000); }
    $('stockBtn').onclick = function () { stockModal(''); };
    $('histBtn').onclick = histModal;
    $('howBtn').onclick = function () {
      openModal(head('Справочник', 'Одинаковые правила для встроенных данных и загруженной книги') + '<div class="note" style="font-size:13px;line-height:1.65">' +
        '<b>Названия товаров</b> — строки OOR с заполненной колонкой B; строка с кодом в A и пустой B (напр. «R8001») — группа.<br>' +
        '<b>Модель авто</b> — из базы Cross Codes (файлы TRT_SS и TRT_RP, колонка CAR NAME) по коду TRT из названия («R 8001 TRT…» → R8001; «RS 7012R/L» → RS7012R + RS7012L), если не найден — по коду группы OOR.<br>' +
        '<b>Заказы</b> — пары колонок «Кол-во заказано» / «В резерве» в OOR. Порядок слева направо = очередь, в которой заказы забирают склад: по дате заказа (строка 1 шапки OOR), по сроку (строка 5) или как в OOR — выбирается сверху. При одинаковой дате — порядок колонок OOR.<br>' +
        '<b>Остаток склада</b> — сумма TDSheet2!G по точному названию (TDSheet2!B), кроме складов «СКЛАД МЕТАЛЛООТХОДОВ №8», «СКЛАД ТМЦ НЕКОНДИЦИЯ», «СКЛАД БРАКА» — как в макросе (LoadTD2ArrVTOV / IsExcludedWarehouse). Дата — «Период» из шапки TDSheet2.<br>' +
        '<b>По каждому заказу:</b> нужно со склада = заказано − резерв (не меньше 0); выдано = min(нужно, что осталось на складе); не хватает = нужно − выдано. Резерв склад не уменьшает.<br>' +
        '<b>Ручные правки</b> (заказано, резерв, остаток, модель) действуют поверх данных книги и сохраняются после загрузки новой книги. Пустое поле при правке — вернуть значение из книги.<br>' +
        '<b>⟳ Анализ</b> — заново строит блоки Обработки для всех позиций (по TDSheet, NEP, TDSheet2, Базе пыльник) и пересчитывает очередь: резерв → склад → полуфабрикат → производство.<br>' +
        '<b>＋ Добавить заказ</b> — заказ вводится вручную (номер, клиент, дата, позиции с количеством и резервом) и встаёт в очередь по дате заказа. Можно указать и новый товар, которого нет в OOR: программа найдёт его остаток и состав. Изменить или удалить такой заказ — через его заголовок в таблице. Большой заказ: «⬇ Скачать шаблон Excel» (все позиции OOR), заполнить колонку «Заказ, шт», «⬆ Загрузить заказ из файла».<br>' +
        '<b>Склад — минимальный остаток</b>: из TDSheet2 (колонка «Мин. кол-во»); если его нет — рассчитан: расход по всем заказам OOR (товар × состав на 1 шт) ÷ месяцы между первой датой заказа и последним сроком × «Мин. запас на N мес.». Жёлтый — остаток ниже минимума, красный — меньше ¼ минимума или закончился. Некондиция, отходы и брак не учитываются. Окно — плитка «Склад: критично / ниже мин.»; остаток там можно изменить прямо в таблице — статусы заказов пересчитываются сразу.<br>' +
        '<b>Ширина колонок</b> — потяните за правый край заголовка; двойной щелчок по краю — вернуть ширину.<br>' +
        '<b>🖨 Печать</b> — A4 или A3, альбомный или книжный лист; печатается таблица как на экране (фильтры, клиент, группировка). Если заказы не помещаются по ширине — печатаются частями, в каждой части все позиции. В окне Claude печать отключена — «Файл для печати» скачивает файл, при открытии которого сразу открывается окно печати. <b>Масштаб</b> (− 100% +, Ctrl + колесо, Ctrl +/−) сохраняется и попадает в файл «Сохранить HTML» вместе с шириной колонок и группировкой.<br>' +
        '<b>⇪ Обновить склад</b> — загружает только остатки: лист TDSheet2 или выгрузку 1С «Остатки номенклатуры» (колонки Номенклатура, Остаток, Мин. количество, Склад ищутся по шапке). Заказы, состав и NEP остаются из книги; остатки полуфабрикатов и деталей, которые блок брал из TDSheet/NEP, берутся из нового склада (было в старом складе, а в новом нет — 0). Сверка с листом Обработка после этого не проводится. Затем <b>⟳ АНАЛИЗ</b> — пересчёт всех заказов и итог по заказам: было / стало.<br>' +
        '<b>Блок Обработки</b> — остаток любой детали, полуфабриката или материала можно изменить нажатием на число (Enter — сохранить, пусто — вернуть значение книги). Правка действует на все блоки с этой номенклатурой; сравнение позиций, «Детали 01–06», очередь и статусы пересчитываются сразу.<br>' +
        '<b>Комментарии</b> — в окне ячейки заказа: статус (в процессе / в пути / на растаможке / прибыл), инвойс, контейнер, текст. Значок 💬 в ячейке, все комментарии — плитка «Комментарии».<br>' +
        '<b>Верхние блоки</b> — нажмите на любой, чтобы открыть список соответствующих позиций, заказов или строк.<br>' +
        '<b>Проверенный состав</b> (добавлен ' + esc((EMBEDDED.kgdb.specInfo || {}).date || '') + '): ' + esc(Object.keys(EMBEDDED.kgdb.spec || {}).filter(function (k) { return /-1[12]$|\/50$|-50$|TRT/.test(k); }).join(', ')) + '. Используется в структуре на 1 шт (с нормами, болтами и проволокой) и в анализе: кг/шт материалов, нормы RS 7016-30/50 (по 2 шт), недостающие в NEP узлы. RS 9021L подтверждён спецификацией.<br>' +
        '<b>Хранение</b>: книга, база моделей, правки и история сохраняются в базе этой страницы и видны всем, кому открыт доступ.</div></div>');
    };
    $('queue').value = lsGet('queue', 'created');
    ['q', 'flt', 'cli'].forEach(function (id) { $(id).addEventListener(id === 'q' ? 'input' : 'change', render); });
    $('queue').addEventListener('change', function () { lsSet('queue', this.value); recalc(); });

    /* ================= сохранить HTML со всеми данными ================= */
    /* ================= масштаб (сохраняется в браузере и в файле «Сохранить HTML») ================= */
    var EUI = EMBEDDED.ui || {};
    var ZOOM = +lsGet('zoom', EUI.zoom || 100) || 100;
    function applyZoom() { document.body.style.zoom = ZOOM === 100 ? '' : String(ZOOM / 100); if ($('zoomV')) $('zoomV').textContent = ZOOM + '%'; fitWrap(); if (FIT && BASE && $('grid').rows.length) render(); }
    function setZoom(z) { ZOOM = Math.max(50, Math.min(160, Math.round(z / 5) * 5)); lsSet('zoom', ZOOM); applyZoom(); }
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(ZOOM + 10); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(ZOOM - 10); }
      else if (e.key === '0') { setZoom(100); }
    });
    window.addEventListener('wheel', function (e) { if (!e.ctrlKey) return; e.preventDefault(); setZoom(ZOOM + (e.deltaY < 0 ? 10 : -10)); }, { passive: false });

    /* ================= печать A4 / A3 ================= */
    var PRN = { fmt: lsGet('pfmt', 'A4') === 'A3' ? 'A3' : 'A4', orient: lsGet('porient', 'landscape') === 'portrait' ? 'portrait' : 'landscape', mdl: !!lsGet('pmdl', false) };
    function prnLayout(nOrd) {
      var pw = PRN.fmt === 'A3' ? (PRN.orient === 'landscape' ? 420 : 297) : (PRN.orient === 'landscape' ? 297 : 210);
      var font = PRN.fmt === 'A3' ? 10 : 8.5, k = font / 8.5, use = pw - 16;
      var fixed = (7 + 17 + 50 + 14 + 14 + 15 + 14 + 15 + (PRN.mdl ? 38 : 0)) * k, oc = 19 * k;
      var per = Math.max(3, Math.floor((use - fixed) / oc)), blocks = Math.max(1, Math.ceil(nOrd / per));
      per = Math.ceil(nOrd / blocks) || 1;
      var ow = Math.min(34 * k, (use - fixed) / per);
      return { pw: pw, font: font, k: k, per: per, blocks: blocks, use: use, ow: ow };
    }
    function printHtml(auto) {
      var ords = visibleOrders(), G = gridList(ords), L = prnLayout(ords.length), K = kpiData(ords);
      var mm = function (v) { return (v * L.k).toFixed(1) + 'mm'; };
      var fl = []; if ($('cli').value) fl.push('клиент: ' + $('cli').value); if ($('flt').value !== 'all') fl.push($('flt').selectedOptions[0].textContent); if ($('q').value) fl.push('поиск: «' + $('q').value + '»');
      fl.push(NSORT ? 'группировка по названию' : 'группировка по стандарту'); fl.push($('queue').selectedOptions[0].textContent.toLowerCase());
      var css = '@page{size:' + PRN.fmt + ' ' + PRN.orient + ';margin:8mm}' +
        '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        'body{font-family:Arial,"Helvetica Neue",sans-serif;font-size:' + L.font + 'pt;color:#000;margin:0}' +
        'h1{font-size:' + (L.font + 6) + 'pt;margin:0 0 1mm} .sub{font-size:' + (L.font - 0.5) + 'pt;margin-bottom:2.5mm}' +
        '.kp{display:flex;gap:2mm;margin-bottom:2.5mm;flex-wrap:wrap} .kp div{border:0.3mm solid #8a99ab;border-radius:1.5mm;padding:1.2mm 2.5mm;min-width:26mm} .kp b{display:block;font-size:' + (L.font + 3) + 'pt} .kp span{font-size:' + (L.font - 1) + 'pt;text-transform:uppercase} .kp .bad b{color:#c62828}' +
        '.lg{font-size:' + (L.font - 1) + 'pt;margin-bottom:2mm} .lg i{display:inline-block;width:3.2mm;height:3.2mm;border:0.2mm solid #999;vertical-align:-0.6mm;margin:0 1mm 0 3mm}' +
        'table{border-collapse:collapse;table-layout:fixed;width:auto} th,td{border:0.2mm solid #8a99ab;padding:0.8mm 1.2mm;vertical-align:middle;overflow:hidden}' +
        'thead{display:table-header-group} tr{page-break-inside:avoid;break-inside:avoid}' +
        'th{background:#1f3a5a;color:#fff;font-weight:700;font-size:' + (L.font - 0.5) + 'pt;text-align:center;line-height:1.15} th small{display:block;font-weight:400;font-size:' + (L.font - 2) + 'pt}' +
        'td.n{text-align:right;white-space:nowrap} td.nm{font-weight:700} td.no{text-align:center}' +
        'tr.g td{background:#e3e9f1;font-weight:700;font-size:' + (L.font + 0.5) + 'pt;padding:1mm 1.5mm}' +
        'td.c{text-align:center;white-space:nowrap} td.c s{text-decoration:none;font-size:' + (L.font - 1) + 'pt;margin-left:1mm} td.gr{font-weight:700;font-size:' + (L.font - 0.5) + 'pt;word-break:break-word} tr.gs td{border-top:0.6mm solid #1f3a5a}' +
        'th .cl{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:400;font-size:' + (L.font - 2) + 'pt}' +
        '.ok{background:#e3f4ea} .res{background:#e1edf9} .mk{background:#fff1cc} .sh{background:#f9d4d4;color:#b71c1c} .sh b{color:#b71c1c}' +
        'td.bad{color:#c62828;font-weight:700} .blk{font-weight:700;margin:3mm 0 1.5mm;font-size:' + (L.font + 1) + 'pt} .pb{page-break-before:always;break-before:page}' +
        '@media screen{body{padding:10mm;background:#eef1f5} .sheet{background:#fff;padding:8mm;box-shadow:0 1px 6px rgba(0,0,0,.2);width:' + L.pw + 'mm}}';
      var head = '<h1>Анализ продаж</h1><div class="sub">Книга: ' + esc(BASE.file) + ' (' + esc(BASE.loadedAt) + ') · склад на ' + esc(TD2.period || '—') + (BASE.stockUpd ? ' (обновлён: ' + esc(BASE.stockUpd.file) + ')' : '') + ' · напечатано ' + esc(nowStr(Date.now())) + ' · ' + esc(fl.join(' · ')) + '</div>';
      head += '<div class="kp">' + K.map(function (x) { return '<div class="' + (x[2] === 'bad' ? 'bad' : '') + '"><b>' + x[1] + '</b><span>' + esc(x[0]) + '</span></div>'; }).join('') + '</div>';
      head += '<div class="lg">Ячейка заказа — заказано, шт:<i class="ok"></i>хватает<i class="res"></i>рез. — В Резерве<i class="mk"></i>п/ф / произв. — полуфабрикат / производство<i class="sh"></i>−N — не хватает N шт</div>';
      var body = '';
      for (var b = 0; b < L.blocks; b++) {
        var bo = ords.slice(b * L.per, (b + 1) * L.per); if (!bo.length) break;
        var t = (b ? '<div class="pb"></div>' : '') + (L.blocks > 1 ? '<div class="blk">Заказы ' + (b * L.per + 1) + '–' + (b * L.per + bo.length) + ' из ' + ords.length + '</div>' : '');
        t += '<table><colgroup><col style="width:' + mm(7) + '"><col style="width:' + mm(17) + '"><col style="width:' + mm(50) + '">' + (PRN.mdl ? '<col style="width:' + mm(38) + '">' : '') + '<col style="width:' + mm(14) + '"><col style="width:' + mm(14) + '"><col style="width:' + mm(15) + '"><col style="width:' + mm(14) + '"><col style="width:' + mm(15) + '">' + bo.map(function () { return '<col style="width:' + L.ow.toFixed(1) + 'mm">'; }).join('') + '</colgroup>';
        t += '<thead><tr><th>№</th><th>' + (NSORT ? 'Код' : 'Группа') + '</th><th>Название товара</th>' + (PRN.mdl ? '<th>Модель авто</th>' : '') + '<th>Заказ</th><th>В резерве</th><th>Остаток<small>на ' + esc(TD2.period || '') + '</small></th><th>Нужно со склада</th><th>Не хватает</th>' +
          bo.map(function (o) { var d2 = function (x) { return String(x || '—').replace(/\.(\d\d)(\d\d)$/, '.$2'); }; return '<th>' + esc(o.label) + '<span class="cl">' + esc(o.client) + '</span><small>' + esc(d2(o.created)) + ' → ' + esc(d2(o.due)) + '</small></th>'; }).join('') + '</tr></thead><tbody>';
        var NO = 0;
        G.groups.forEach(function (g) {
          G.by[g].forEach(function (p, gi) {
            var r = R[p.id], tq = 0, tr = 0, tn = 0, ts = 0, oc = '';
            ords.forEach(function (o) { var c = r.cells[o.id]; if (!c) return; tq += c.q; tr += c.rv; tn += c.need; ts += finalShort(p, o); });
            bo.forEach(function (o) {
              var c = r.cells[o.id]; if (!c) { oc += '<td></td>'; return; }
              var ac = AC(p, o) || { short: c.short, semi: 0, prod: 0 };
              if (ac.short > 0) oc += '<td class="c sh"><b>' + fmt(c.q) + '</b><s>−' + fmt(ac.short) + '</s></td>';
              else if (c.need === 0) oc += '<td class="c res">' + fmt(c.q) + '<s>рез.</s></td>';
              else if (ac.semi || ac.prod) oc += '<td class="c mk">' + fmt(c.q) + '<s>' + (ac.prod ? 'произв.' : 'п/ф') + '</s></td>';
              else oc += '<td class="c ok">' + fmt(c.q) + '</td>';
            });
            t += '<tr' + (gi === 0 ? ' class="gs"' : '') + '><td class="no">' + (++NO) + '</td><td class="gr">' + (gi === 0 ? esc(g) : '') + '</td><td class="nm">' + esc(p.name) + '</td>' + (PRN.mdl ? '<td style="font-size:' + (L.font - 1.5) + 'pt">' + esc(modelOf(p).text || '—') + '</td>' : '') +
              '<td class="n">' + fmt(tq) + '</td><td class="n">' + fmt(tr) + '</td><td class="n">' + fmt(r.stock) + '</td><td class="n">' + fmt(tn) + '</td><td class="n' + (ts ? ' bad' : '') + '">' + (ts ? fmt(ts) : '—') + '</td>' + oc + '</tr>';
          });
        });
        body += t + '</tbody></table>';
      }
      return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Анализ продаж — печать ' + PRN.fmt + '</title><style>' + css + '</style></head><body><div class="sheet">' + head + body + '</div>' +
        (auto ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)});<\/script>' : '') + '</body></html>';
    }
    function printModal() {
      var inArt = !!(window.claude && window.claude.use), ords = visibleOrders();
      var draw = function () {
        var L = prnLayout(ords.length);
        var opt = function (id, val, cur, txt) { return '<button class="btn pfm' + (cur === val ? ' primary' : '') + '" data-id="' + id + '" data-v="' + val + '">' + txt + '</button>'; };
        var h = head('Печать', 'Таблица как на экране: фильтры, клиент и группировка — текущие');
        h += '<div class="prn"><div><b>Формат</b>' + opt('fmt', 'A4', PRN.fmt, 'A4') + opt('fmt', 'A3', PRN.fmt, 'A3') + '</div>' +
          '<div><b>Лист</b>' + opt('orient', 'landscape', PRN.orient, 'Альбомный') + opt('orient', 'portrait', PRN.orient, 'Книжный') + '</div>' +
          '<div><label><input type="checkbox" id="pMdl"' + (PRN.mdl ? ' checked' : '') + '> колонка «Модель авто»</label></div></div>';
        h += '<p class="prn-i">Шрифт <b>' + String(L.font).replace('.', ',') + ' pt</b> · заказов по ширине листа: <b>' + L.per + '</b>' + (L.blocks > 1 ? ' · заказы печатаются ' + L.blocks + ' частями (' + ords.length + ' заказов), в каждой части — все позиции' : '') + '</p>';
        h += '<div class="fbar">' + (inArt ? '' : '<button class="btn primary" id="pGo">🖨 Печать</button>') + '<button class="btn' + (inArt ? ' primary' : '') + '" id="pDl">⬇ Файл для печати</button><button class="btn" id="pView">Предпросмотр</button></div>';
        if (inArt) h += '<p class="note">В окне Claude печать отключена: откройте скачанный файл — окно печати откроется сразу.</p>';
        h += '<div id="pPrev"></div>';
        openModal(h + '</div>', true);
        modal.querySelectorAll('.pfm').forEach(function (b) { b.onclick = function () { PRN[b.dataset.id] = b.dataset.v; lsSet(b.dataset.id === 'fmt' ? 'pfmt' : 'porient', b.dataset.v); draw(); }; });
        $('pMdl').onchange = function () { PRN.mdl = this.checked; lsSet('pmdl', PRN.mdl); draw(); };
        var fname = function () { var d = new Date(); return 'Анализ_продаж_печать_' + PRN.fmt + '_' + ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear() + '.html'; };
        $('pDl').onclick = function () {
          var nm = fname();
          saveBinary(nm, printHtml(true)).then(function () { showMsg('Файл ' + esc(nm) + ' сохранён. Откройте его — окно печати ' + PRN.fmt + ' откроется сразу.', 'good'); }, function (e) { showMsg('Файл не сохранён: ' + esc(e && (e.message || e.code) || e), 'err'); });
        };
        if ($('pGo')) $('pGo').onclick = function () {
          var fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
          document.body.appendChild(fr);
          fr.onload = function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { showMsg('Печать не запустилась — используйте «Файл для печати».', 'err'); } setTimeout(function () { fr.remove(); }, 60000); };
          fr.srcdoc = printHtml(false);
        };
        $('pView').onclick = function () {
          var fr = '<iframe class="pprev" style="width:100%;height:62vh;border:1px solid var(--line);border-radius:6px;background:#eef1f5"></iframe>';
          $('pPrev').innerHTML = fr; modal.querySelector('.pprev').srcdoc = printHtml(false);
        };
      };
      draw();
    }

    /* ================= темы оформления ================= */
    var THEMES = [['steel', 'Сталь', '#22415F', '#0F6A88'], ['draft', 'Чертёж', '#FFFFFF', '#1C3E8C'], ['graphite', 'Графит', '#1A1E24', '#E39A00'], ['indigo', 'Индиго', '#2F2B70', '#5A48D8'], ['contrast', 'Контраст', '#000000', '#FFFFFF']];
    var THEME = lsGet('theme', (EMBEDDED.ui && EMBEDDED.ui.theme) || 'steel');
    var FONTS = [['arial', 'Arial'], ['segoe', 'Segoe UI'], ['tahoma', 'Tahoma'], ['design', 'Дизайн']];
    var FONT = lsGet('font', (EMBEDDED.ui && EMBEDDED.ui.font) || 'arial');
    function applyFont(f) {
      if (!FONTS.some(function (x) { return x[0] === f; })) f = 'arial';
      FONT = f; document.documentElement.setAttribute('data-font', f);
      var sel = $('fnt'); if (sel) sel.value = f;
      fitWrap(); if (typeof FIT !== 'undefined' && FIT && BASE && $('grid').rows.length) render();
    }
    function applyTheme(t) {
      if (!THEMES.some(function (x) { return x[0] === t; })) t = 'steel';
      THEME = t; document.documentElement.setAttribute('data-theme', t);
      var box = $('thm'); if (box) box.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-pressed', b.dataset.t === t ? 'true' : 'false'); });
      fitWrap();
    }
    (function () {
      var box = $('thm'); if (!box) return;
      box.innerHTML = '<span>Тема</span>' + THEMES.map(function (x) { return '<button data-t="' + x[0] + '" title="' + x[1] + '" aria-label="Тема ' + x[1] + '" style="background:linear-gradient(135deg,' + x[2] + ' 50%,' + x[3] + ' 50%)"></button>'; }).join('');
      box.querySelectorAll('button').forEach(function (b) { b.onclick = function () { applyTheme(b.dataset.t); lsSet('theme', THEME); showMsg('Тема «' + THEMES.find(function (x) { return x[0] === THEME; })[1] + '».', 'good'); }; });
      applyTheme(THEME);
      var sel = $('fnt');
      if (sel) { sel.innerHTML = FONTS.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join(''); sel.onchange = function () { applyFont(sel.value); lsSet('font', FONT); showMsg('Шрифт «' + FONTS.find(function (x) { return x[0] === FONT; })[1] + '».', 'good'); }; }
      applyFont(FONT);
    })();

    /* браузер уменьшил страницу (масштаб браузера < 100%) — подсказать */
    function checkBrowserZoom() {
      var r = window.devicePixelRatio || 1;
      if (r < 0.95 && !checkBrowserZoom.done) { checkBrowserZoom.done = true; showMsg('Масштаб браузера ' + Math.round(r * 100) + '% — поэтому шрифт мелкий. Нажмите <b>Ctrl + 0</b>, чтобы вернуть 100%; размер в программе — кнопками «− 100% +».', 'err'); }
      if (r >= 0.95) checkBrowserZoom.done = false;
    }
    window.addEventListener('resize', checkBrowserZoom); setTimeout(checkBrowserZoom, 1500);
    $('printBtn').onclick = function () { if (BASE) printModal(); };
    (function () {
      var b = $('viewBtn'), pop = $('viewPop');
      var close = function () { pop.hidden = true; b.setAttribute('aria-expanded', 'false'); b.classList.remove('on'); };
      /* окно всегда в видимой части экрана: по ширине — сдвиг вправо/влево, по высоте — вверх, если внизу не хватает места */
      var place = function () {
        if (pop.hidden) return;
        pop.style.left = ''; pop.style.right = ''; pop.style.top = ''; pop.style.bottom = '';
        var r = pop.getBoundingClientRect(), zf = pop.offsetWidth ? r.width / pop.offsetWidth : 1, vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 8;
        if (r.left < m) { pop.style.right = 'auto'; pop.style.left = '0px'; r = pop.getBoundingClientRect(); }
        if (r.right > vw - m) { var cur = parseFloat(pop.style.left) || 0; if (pop.style.left) pop.style.left = (cur - (r.right - vw + m) / zf) + 'px'; else pop.style.right = (parseFloat(getComputedStyle(pop).right) + (r.right - vw + m) / zf) + 'px'; r = pop.getBoundingClientRect(); }
        if (r.left < m) { pop.style.right = 'auto'; pop.style.left = ((parseFloat(pop.style.left) || 0) + (m - r.left) / zf) + 'px'; }
        r = pop.getBoundingClientRect();
        if (r.bottom > vh - m) { var br = b.getBoundingClientRect(); if (br.top - r.height - 6 > m) { pop.style.top = 'auto'; pop.style.bottom = 'calc(100% + 6px)'; } }
      };
      b.onclick = function (e) { e.stopPropagation(); var open = pop.hidden; pop.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.classList.toggle('on', open); place(); };
      window.addEventListener('resize', place);
      document.addEventListener('click', function (e) { if (!pop.hidden && !e.target.closest('.vwrap')) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) close(); });
    })();
    /* верх (шапка, кнопки, плитки, легенда) скрывается и раскрывается одной кнопкой; состояние сохраняется */
    var TOPC = lsGet('topc', (EMBEDDED.ui && EMBEDDED.ui.topc) || 0) ? 1 : 0;
    function applyTop() {
      document.body.classList.toggle('topc', !!TOPC);
      var b = $('topBtn'); b.setAttribute('aria-expanded', TOPC ? 'false' : 'true');
      b.querySelector('use').setAttribute('href', TOPC ? '#i-down' : '#i-up'); b.querySelector('.t').textContent = TOPC ? 'Показать верх' : 'Скрыть верх';
      if (!TOPC) fitToolbar(); fitHeader(); fitWrap();
    }
    /* узкая шапка в одну строку: если не помещается — сначала у плиток только значки и числа, затем и у «Комментарии» / «Показать верх» */
    function fitHeader() {
      var h = document.querySelector('header.top'); if (!h) return; h.classList.remove('hc1', 'hc2');
      if (!TOPC) return;
      if (h.offsetHeight < 60) return; h.classList.add('hc1'); if (h.offsetHeight < 60) return; h.classList.add('hc2');
    }
    window.addEventListener('resize', fitHeader);
    $('cmTopBtn').onclick = function () { cmListModal(); };
    $('htiles').addEventListener('click', function (e) { var b = e.target.closest('.ht'); if (!b) return; if (b.dataset.k === 'stock') stockModal(''); else kpiList(b.dataset.k); });
    $('topBtn').onclick = function () { TOPC = TOPC ? 0 : 1; lsSet('topc', TOPC); applyTop(); };
    setTimeout(applyTop, 0);
    /* панель в один ряд: если не помещается — у второстепенных кнопок остаются только значки (название — в подсказке) */
    function fitToolbar() {
      var t = document.querySelector('.toolbar'); if (!t) return;
      var one = function () { var k = [].filter.call(t.children, function (e) { return e.offsetParent !== null && !e.hidden && e.tagName !== 'INPUT' && e.offsetHeight > 4; }); if (!k.length) return true; var top = k[0].offsetTop; return k.every(function (e) { return Math.abs(e.offsetTop - top) < 12; }); };
      t.classList.remove('c1', 'c2');
      if (one()) return; t.classList.add('c1'); if (one()) return; t.classList.add('c2');
    }
    window.addEventListener('resize', function () { fitToolbar(); fitWrap(); });
    setTimeout(function () { fitToolbar(); fitWrap(); }, 0);
    $('fitBtn').onclick = function () { setFit(!FIT); showMsg(FIT ? 'Все заказы — в одном окне.' : 'Обычный вид (с прокруткой вбок).', 'good'); }; $('zoomIn').onclick = function () { setZoom(ZOOM + 10); }; $('zoomOut').onclick = function () { setZoom(ZOOM - 10); }; $('zoomV').onclick = function () { setZoom(100); };
    function buildHtml(saveId, savedAt) {
      var data = curData(saveId, savedAt);
      var clone = document.documentElement.cloneNode(true);
      ['#cmTip', '#cmPop', '#ctxM', '#ordTip'].forEach(function (q) { var e = clone.querySelector(q); if (e) e.remove(); });
      var vp = clone.querySelector('#viewPop'); if (vp) vp.hidden = true;
      ['grid', 'kpis', 'modal'].forEach(function (id) { var e = clone.querySelector('#' + id); if (e) e.innerHTML = ''; });
      clone.querySelector('#ov').className = 'ov';
      var m = clone.querySelector('#msg'); m.className = 'msg'; m.innerHTML = '';
      clone.querySelector('body').removeAttribute('class'); clone.querySelector('body').style.zoom = ''; var zf = clone.querySelector('iframe'); if (zf) zf.remove();
      var eb = clone.querySelector('#editBtn'); eb.className = 'btn'; eb.querySelector('.t').textContent = 'Редактировать'; eb.querySelector('use').setAttribute('href', '#i-edit'); eb.removeAttribute('disabled'); clone.querySelector('#cancelEditBtn').style.display = 'none';
      clone.querySelector('#sync').textContent = '';
      clone.querySelector('#emb').textContent = 'var EMBEDDED = ' + JSON.stringify(data).replace(/<\//g, '<\\/') + ';';
      return '<!DOCTYPE html>\n' + clone.outerHTML;
    }
    $('saveBtn').onclick = function () {
      var ts = Date.now(), d = new Date(ts), savedAt = nowStr(ts);
      var name = 'OOR_TDSheet2_' + ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear() + '_' + ('0' + d.getHours()).slice(-2) + '-' + ('0' + d.getMinutes()).slice(-2) + '.html';
      var hst = { ts: ts, by: ME, kind: 'save', text: name + ' — книга ' + BASE.file + ' (' + BASE.loadedAt + '), правок: ' + (Object.keys(OV.stock).length + Object.keys(OV.q).length + Object.keys(OV.r).length + Object.keys(OV.model).length + Object.keys(OV.td2).length) + ', комментариев: ' + cmCount() };
      HIST.unshift(hst); persistHist(hst);
      var html = buildHtml(ts.toString(36), savedAt);
      var viaAnchor = function () {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      };
      var inArtifact = window.claude && window.claude.use;
      var okMsg = function () { showMsg('Файл ' + esc(name) + ' сохранён (' + Math.round(html.length / 1024) + ' КБ). В нём все данные, правки и история — его можно отправить, он откроется без доступа и запросов.', 'good'); };
      Promise.resolve(inArtifact ? window.claude.use('downloads') : null).then(function (dl) {
        if (dl) return dl.save({ filename: name, data: html });
        viaAnchor();
      }).then(okMsg, function (e) {
        /* загрузчик страницы отказал (нет разрешения, отмена) — пробуем обычное скачивание браузера */
        var why = e && (e.code || e.message) || String(e);
        try { viaAnchor(); showMsg('Загрузчик страницы не сохранил файл (' + esc(why) + '), запущено обычное скачивание браузера: ' + esc(name) + '. Если файла нет в «Загрузках» — разрешите скачивание для этого сайта.', 'err'); }
        catch (e2) { showMsg('Файл не сохранён: ' + esc(why), 'err'); }
      });
    };

    /* ===== версия программы ===== */
    var APP_VER = '2026.11.25i';
    /* ===== сохранение в этот же HTML-файл и автосохранение после каждой правки (Chrome / Edge, файл открыт с диска) ===== */
    var FILEH = null, FILE_SID = EMBEDDED.saveId || ('f' + Date.now().toString(36)), AUTOSAVE_T = 0, FS_LAST = 0;
    function fsAvail() { return !!window.showSaveFilePicker && !DB && location.protocol === 'file:'; }
    function idbKV() { return new Promise(function (res, rej) { var r = indexedDB.open('oor_app_fs', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
    function idbGet(k) { return idbKV().then(function (db) { return new Promise(function (res) { var t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = function () { res(t.result || null); }; t.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
    function idbSet(k, v) { return idbKV().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); }; }); }).catch(function () { return false; }); }
    var FH_KEY = 'fh|' + decodeURIComponent(location.pathname || '');
    function fileName() { var n = decodeURIComponent((location.pathname || '').split('/').pop() || ''); return /\.html?$/i.test(n) ? n : 'OOR_TDSheet2.html'; }
    function fsPerm(h, ask) { if (!h || !h.queryPermission) return Promise.resolve(false); return h.queryPermission({ mode: 'readwrite' }).then(function (p) { if (p === 'granted') return true; if (!ask) return false; return h.requestPermission({ mode: 'readwrite' }).then(function (q) { return q === 'granted'; }); }).catch(function () { return false; }); }
    function fsWrite(html) {
      return FILEH.createWritable().then(function (w) { return w.write(new Blob([html], { type: 'text/html' })).then(function () { return w.close(); }); }).then(function () {
        FS_LAST = Date.now(); setSync('Сохранено в файл ' + esc(FILEH.name || fileName()) + ' · ' + new Date(FS_LAST).toLocaleTimeString('ru-RU'), true);
      });
    }
    function fsPick() { return window.showSaveFilePicker({ id: 'oorhtml', suggestedName: fileName(), types: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }] }).then(function (h) { FILEH = h; idbSet(FH_KEY, h); return h; }); }
    /* «Сохранить»: в тот же файл; первый раз — выбрать этот файл в окне (один раз) */
    function saveToFile(interactive) {
      if (!fsAvail()) return Promise.reject(new Error('nofs'));
      if (FILEH) return fsPerm(FILEH, interactive).then(function (ok) { if (ok) return fsSaveNow(); if (!interactive) throw new Error('perm'); return fsPick().then(fsSaveNow); });
      if (!interactive) return Promise.reject(new Error('nohandle'));
      return fsPick().then(fsSaveNow);
    }
    function autosave() {
      if (!fsAvail() || !FILEH || SYNC.quiet) return;
      clearTimeout(AUTOSAVE_T);
      AUTOSAVE_T = setTimeout(function () { saveToFile(false).catch(function () { setSync(SYNC.stale ? SYNC_STALE : 'Автосохранение ждёт разрешения — нажмите «Сохранить» один раз', false); }); }, 1500);
    }

    /* ===== общий файл (сетевая папка, несколько ПК): перед записью файл читается с диска, правки других ПК сводятся с вашими,
       по каждому значению побеждает более новое; открытая страница подтягивает чужие правки каждые 15 с ===== */
    var SYNC = { wid: EMBEDDED.wid || '', mod: 0, dirty: false, n: 0, quiet: false, stale: false, q: null };
    var OV_TYPES = ['stock', 'q', 'r', 'model', 'mo', 'td2', 'cm', 'obs', 'bom', 'invp'];
    var SYNC_STALE = 'Файл обновлён до новой версии программы с другого ПК — нажмите F5 (ваши правки перенесутся)';
    function newWid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function lsQuiet(k, v) { SYNC.quiet = true; try { return lsSet(k, v); } finally { SYNC.quiet = false; } }
    function lsDel(k) { try { localStorage.removeItem(LS + k); } catch (e) { } }
    function ruT(s) { var m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/); return m ? new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime() : 0; }
    function baseT(b) { return b ? (b.bts || ruT(b.loadedAt) || 0) : 0; }
    function ktGet(S, t, k) {
      var e = S.KT && S.KT[t + '\u0001' + k]; if (e) return e.ts || 0;
      var m = S.META && S.META[t === 'mo' ? 'mo_' + k : undoId(t, k)]; return m && m.ts ? m.ts : -1;
    }
    /* A и B: { OV, META, KT }; результат — новее по каждому ключу; toA / toB — сколько значений отличается от A / от B */
    function ovMerge(A, B) {
      var R = { OV: {}, META: Object.assign({}, B.META || {}), KT: {} }, toA = 0, toB = 0, J = JSON.stringify, kk = {};
      Object.keys(A.META || {}).forEach(function (id) { var a = A.META[id], b = R.META[id]; if (a && (!b || (a.ts || 0) >= (b.ts || 0))) R.META[id] = a; });
      OV_TYPES.forEach(function (t) { kk[t] = {}; });
      [A, B].forEach(function (S) {
        OV_TYPES.forEach(function (t) { Object.keys((S.OV && S.OV[t]) || {}).forEach(function (k) { kk[t][k] = 1; }); });
        Object.keys(S.KT || {}).forEach(function (x) { var i = x.indexOf('\u0001'); if (i > 0 && kk[x.slice(0, i)]) kk[x.slice(0, i)][x.slice(i + 1)] = 1; });
      });
      OV_TYPES.forEach(function (t) {
        var a = (A.OV && A.OV[t]) || {}, b = (B.OV && B.OV[t]) || {}, r = R.OV[t] = {};
        Object.keys(kk[t]).forEach(function (k) {
          var ta = ktGet(A, t, k), tb = ktGet(B, t, k), useB = ta < 0 && tb < 0 ? !(k in a) : tb > ta;
          var v = useB ? b[k] : a[k], kx = t + '\u0001' + k, e = ((useB ? B : A).KT || {})[kx], tw = useB ? tb : ta;
          if (v !== undefined) r[k] = v;
          if (e) R.KT[kx] = e; else if (tw >= 0) R.KT[kx] = v === undefined ? { ts: tw, d: 1 } : { ts: tw };
          if (J(v) !== J(a[k])) toA++;
          if (J(v) !== J(b[k])) toB++;
        });
      });
      return { ov: R, toA: toA, toB: toB };
    }
    function histMerge(a, b) {
      var S = {}, out = [];
      (a || []).concat(b || []).forEach(function (h) { if (!h) return; var k = (h.ts || 0) + '|' + (h.kind || '') + '|' + (h.text || h.field || '') + '|' + (h.pos || '') + '|' + (h.ord || ''); if (S[k]) return; S[k] = 1; out.push(h); });
      out.sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
      return out.slice(0, 3000);
    }
    function embParse(txt) {
      var a = txt.indexOf('<script id="emb">'), b = a >= 0 ? txt.indexOf('<\/script>', a) : -1; if (a < 0 || b < 0) return null;
      var s = txt.slice(a + 17, b).replace(/^\s*var EMBEDDED = /, '').replace(/;\s*$/, '');
      try { var d = JSON.parse(s); d._ver = (txt.match(/var APP_VER = '([^']+)'/) || [])[1] || ''; return d; } catch (e) { return null; }
    }
    function syncQ(fn) { var p = (SYNC.q || Promise.resolve()).then(fn); SYNC.q = p.catch(function () { }); return p; }
    /* прочитать файл с диска; если его записал другой ПК — свести с текущими данными */
    function syncRead() {
      if (!FILEH || !fsAvail()) return Promise.resolve(false);
      return fsPerm(FILEH, false).then(function (ok) {
        if (!ok) return false;
        return FILEH.getFile().then(function (f) {
          if (f.lastModified === SYNC.mod) return false;
          return f.text().then(function (txt) {
            var d = embParse(txt); SYNC.mod = f.lastModified;
            if (!d) return false;
            if (d._ver && d._ver > APP_VER) { SYNC.stale = true; setSync(SYNC_STALE, false); showMsg(SYNC_STALE + '.', 'err'); return false; }
            if (EMBEDDED.saveId && d.saveId && d.saveId !== EMBEDDED.saveId) return false;
            if (d.saveId && !EMBEDDED.saveId) FILE_SID = d.saveId;
            if (d.wid && d.wid === SYNC.wid) return false;
            return syncApply(d);
          });
        });
      }).catch(function () { return false; });
    }
    function syncApply(d) {
      var mg = ovMerge({ OV: OV, META: OVMETA, KT: KT }, { OV: (d.ov && d.ov.OV) || {}, META: (d.ov && d.ov.META) || {}, KT: (d.ov && d.ov.KT) || {} });
      var nb = d.base && baseT(d.base) > baseT(BASE), nm = d.models && baseT(d.models) > baseT(MODELS);
      HIST = histMerge(HIST, d.hist); if (d.wid) SYNC.wid = d.wid;
      if (!mg.toA && !nb && !nm) return false;
      OV = mg.ov.OV; OVMETA = mg.ov.META; KT = mg.ov.KT;
      lsQuiet('ov', { OV: OV, META: OVMETA, KT: KT }); lsQuiet('hist', HIST.slice(0, 1000));
      UNDO = []; REDO = []; undoUi();
      if (nb) { setBase(d.base); lsDel('base'); }
      if (nm) { setModels(d.models); lsDel('models'); }
      if (!nb) recalc();
      showMsg('Обновлено из общего файла' + (d.savedAt ? ' (' + esc(d.savedAt) + ')' : '') + ': ' + (mg.toA ? fmt(mg.toA) + ' правок с другого ПК' : '') + (nb ? (mg.toA ? ', ' : '') + 'новая база книги' : '') + (nm ? ', марки авто' : '') + '.', 'good');
      return true;
    }
    function fsWriteNow() {
      if (SYNC.stale) return Promise.reject(new Error(SYNC_STALE));
      var n = SYNC.n; SYNC.wid = newWid();
      return fsWrite(buildHtml(FILE_SID, nowStr(Date.now()))).then(function () { return FILEH.getFile(); }).then(function (f) { SYNC.mod = f.lastModified; if (SYNC.n === n) SYNC.dirty = false; });
    }
    /* запись: сначала прочитать файл (вдруг другой ПК записал), свести, потом записать */
    function fsSaveNow() { return syncQ(function () { return syncRead().then(fsWriteNow); }); }
    function syncPoll() {
      if (document.hidden || !FILEH || SYNC.stale || !fsAvail()) return;
      var ae = document.activeElement; if (EDITING || (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return;
      syncQ(syncRead);
    }
    setInterval(syncPoll, 15000);
    window.addEventListener('focus', function () { setTimeout(syncPoll, 300); });
    function syncStart() { setTimeout(function () { syncQ(syncRead).then(function () { if (SYNC.dirty) autosave(); }); }, 1500); }

    if (fsAvail()) idbGet(FH_KEY).then(function (h) {
      if (!h) { setTimeout(function () { setSync('Чтобы сохранять в этот файл автоматически — нажмите «Сохранить» и выберите этот же файл (один раз)', false); }, 1200); return; }
      FILEH = h;
      fsPerm(h, false).then(function (ok) {
        if (ok) { setSync('Автосохранение в файл ' + esc(h.name || fileName()) + ' включено', true); syncStart(); }
        else {
          setSync('Автосохранение в файл: нажмите в любом месте страницы и разрешите доступ к файлу', false);
          var once = function () { document.removeEventListener('pointerdown', once, true); fsPerm(FILEH, true).then(function (g) { setSync(g ? 'Автосохранение в файл ' + esc(FILEH.name || fileName()) + ' включено' : 'Автосохранение выключено — нет разрешения на файл', g); if (g) syncStart(); }); };
          document.addEventListener('pointerdown', once, true);
        }
      });
    });
    /* каждую правку и запись истории — сразу в файл (в фоне) */
    (function () {
      var pe = persistEdit, ph = persistHist;
      persistEdit = function () { var r = pe.apply(this, arguments); Promise.resolve(r).then(autosave, function () { }); return r; };
      persistHist = function () { var r = ph.apply(this, arguments); Promise.resolve(r).then(autosave, function () { }); return r; };
      var ls = lsSet; lsSet = function (k, v) {
        var big = k === 'base' || k === 'models';
        if (big && v && typeof v === 'object' && !SYNC.quiet) v.bts = Date.now();
        var r = ls.apply(this, arguments);
        if ((big || k === 'ov' || k === 'hist') && !SYNC.quiet) { SYNC.dirty = true; SYNC.n++; autosave(); }
        return r;
      };
    })();

    /* ===== данные для файла (общие для «Сохранить» и «Обновить версию») ===== */
    function curData(saveId, savedAt) { return { base: BASE, models: MODELS, kgdb: EMBEDDED.kgdb, ov: { OV: OV, META: OVMETA, KT: KT }, hist: HIST.slice(0, 3000), saveId: saveId, savedAt: savedAt, ver: APP_VER, wid: SYNC.wid, ui: { zoom: ZOOM, widths: WIDTHS, nsort: NSORT, theme: THEME, font: FONT, fit: FIT, topc: TOPC, hide: HIDE, fitw: FITWU } }; }

    /* ===== Настройки (шестерёнка) ===== */
    function setModal() {
      var T = function (id, ic, t, sub, dis) { return '<button class="stile" id="' + id + '"' + (dis ? ' disabled' : '') + '><svg class="ic" aria-hidden="true"><use href="#' + ic + '"/></svg><b>' + t + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</button>'; };
      var h = head('Настройки', 'Версия ' + APP_VER);
      h += '<h3 class="sh3">Данные</h3><div class="sgrid">' +
        T('stBase', 'i-book', 'Обновить базу', 'книга Анализ_Детально: OOR, TDSheet2, TDSheet, NEP, Анализ_разоб_виде, База пыльник, кг_шт, «-», Обработка, Order') +
        T('stStock', 'i-upload', 'Обновить склад', 'только остатки: TDSheet2 или «Остатки номенклатуры» 1С') +
        T('stModels', 'i-car', 'Марки Авто', 'файлы TRT_SS / TRT_RP Cross Codes') +
        T('stInv', 'i-cm', 'Добавить инвойс', 'позиции инвойса → комментарии со статусом, номером и количеством') + '</div><p class="note" style="margin-top:6px"><a href="#" id="stInfo">Какой файл выбрать для «Обновить базу»?</a></p>';
      h += '<h3 class="sh3">Справочники</h3><div class="sgrid">' +
        T('stBom', 'i-boxes', 'Состав позиций', 'все позиции действующих заказов → состав на 1 шт, правка расхода') +
        T('stBush', 'i-book', 'Справочник Втулки состав', Object.keys(bushAll()).length + ' записей') +
        T('stPyl', 'i-book', 'Состав пыльник', 'лист «База пыльник»') +
        T('stDis', 'i-boxes', 'Анализ в разобранном виде', 'лист «Анализ_разоб_виде»') + '</div>';
      h += '<h3 class="sh3">Программа</h3><div class="sgrid">' +
        T('stVer', 'i-refresh', 'Обновить версию', DB ? 'онлайн-версия обновляется сама' : 'новый HTML программы — данные и правки сохраняются', !!DB) +
        T('stCopy', 'i-save', 'Сохранить копию', 'скачать HTML со всеми данными') +
        T('stHist', 'i-clock', 'История изменений', 'просмотр и очистка') +
        T('stAbout', 'i-info', 'О программе', '') + '</div></div>';
      openModal(h, true);
      $('stBase').onclick = function () { $('file').click(); };
      $('stStock').onclick = function () { $('sfile').click(); };
      $('stModels').onclick = function () { $('mfile').click(); };
      $('stInv').onclick = function () { invPick(); };
      $('stInfo').onclick = function (e) { e.preventDefault(); fileInfoModal(); };
      $('stBom').onclick = function () { bomListModal(); };
      $('stBush').onclick = function () { bushModal(); };
      $('stPyl').onclick = function () { pylModal(); };
      $('stDis').onclick = function () { disModal(); };
      if ($('stVer')) $('stVer').onclick = function () { verPick(); };
      $('stCopy').onclick = function () { downloadHtml(); };
      $('stHist').onclick = function () { histModal(); };
      $('stAbout').onclick = function () { aboutModal(); };
    }
    function aboutModal() {
      var ne = Object.keys(OV.stock).length + Object.keys(OV.q).length + Object.keys(OV.r).length + Object.keys(OV.model).length + Object.keys(OV.td2 || {}).length + Object.keys(OV.obs || {}).length + Object.keys(OV.bom || {}).length;
      var R2 = function (a, b) { return '<tr><td>' + a + '</td><td><b>' + b + '</b></td></tr>'; };
      var h = head('О программе', 'Анализ продаж') + '<table class="mini about">' +
        R2('Программа', 'Анализ продаж — заказы OOR × склад TDSheet2, расчёт по Обработке') + R2('Версия', APP_VER) +
        R2('Книга', esc(BASE.file) + ' · загружена ' + esc(BASE.loadedAt)) + R2('Склад на', esc((BASE.stockUpd && BASE.stockUpd.period) || TD2.period || '—')) +
        R2('Заказов / позиций', OOR.orders.length + ' / ' + OOR.positions.length) + R2('Комментариев', cmCount()) + R2('Ручных правок', ne) + R2('Записей истории', HIST.length) +
        R2('Хранение', DB ? 'база страницы (общая для всех, кто открыл страницу)' : (FILEH ? 'этот файл (' + esc(FILEH.name || fileName()) + '), автосохранение' : 'этот браузер — нажмите «Сохранить», чтобы писать в файл')) +
        '</table></div>';
      openModal(h);
    }
    function downloadHtml() {
      var ts = Date.now(), d = new Date(ts), name = 'OOR_TDSheet2_' + ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear() + '_' + ('0' + d.getHours()).slice(-2) + '-' + ('0' + d.getMinutes()).slice(-2) + '.html';
      var html = buildHtml(ts.toString(36), nowStr(ts));
      return saveBinary(name, html).then(function () { showMsg('Копия сохранена: ' + esc(name) + ' (' + Math.round(html.length / 1024) + ' КБ).', 'good'); }, function (e) { showMsg('Не сохранено: ' + esc(e.message || e), 'err'); });
    }
    /* ===== обновить версию: новый HTML программы + текущие данные (база, правки, комментарии, история, вид) ===== */
    function verPick() {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.html,.htm';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        f.text().then(function (txt) {
          var a = txt.indexOf('<script id="emb">'), b = a >= 0 ? txt.indexOf('<\/script>', a) : -1;
          if (a < 0 || b < 0) { showMsg('Это не файл программы «Анализ продаж» (нет блока данных).', 'err'); return; }
          var nv = (txt.match(/var APP_VER = '([^']+)'/) || [])[1] || '?';
          var mk = function () { return txt.slice(0, a) + '<script id="emb">var EMBEDDED = ' + JSON.stringify(curData(FILE_SID, nowStr(Date.now()))).replace(/<\//g, '<\\/') + ';' + txt.slice(b); };
          var hst = { ts: Date.now(), by: ME, kind: 'save', text: 'Обновлена версия программы: ' + APP_VER + ' → ' + nv + ' (' + f.name + '); данные и правки перенесены.' }; HIST.unshift(hst);
          var done = function (how) { showMsg('Версия ' + esc(nv) + ' ' + how, 'good'); };
          if (fsAvail()) {
            saveToFile(true).then(function () { SYNC.wid = newWid(); return fsWrite(mk()); }).then(function () { SYNC.stale = true; done('записана в этот файл — страница перезагрузится.'); setTimeout(function () { location.reload(); }, 1200); }, function () {
              saveBinary(fileName(), mk()).then(function () { done('скачана с вашими данными — откройте скачанный файл.'); });
            });
          } else saveBinary(fileName(), mk()).then(function () { done('скачана с вашими данными — откройте скачанный файл (старый можно удалить).'); });
        });
      };
      inp.click();
    }

    /* ===== справочники ===== */
    function bushModal() {
      var B = bushAll(), U = {}; Object.keys(OV.bom || {}).forEach(function (k) { var v = OV.bom[k]; if (k.indexOf('W|') === 0 && v && v.qty > 0) U[k.slice(2)] = v; });
      var ks = Object.keys(B).concat(Object.keys(U).filter(function (k) { return !B[k]; })).sort();
      var h = head('Справочник Втулки состав', ks.length + ' записей · материал и кг на 1 шт' + (Object.keys(U).length ? ' · добавлено вами: ' + Object.keys(U).length : '')) + '<div class="fbar"><input type="search" id="bq" placeholder="Поиск">' + (CAN_WRITE ? '<span class="sp"></span><input id="bAk" placeholder="код, напр. NR 1010-A1" style="width:170px"><input id="bAm" placeholder="материал (необязательно)" style="width:200px"><input id="bAg" type="number" step="any" min="0" placeholder="кг / шт" style="width:90px"><button class="btn sm pri" id="bAdd">＋ Добавить / изменить</button>' : '') + '</div><div class="scroll" style="max-height:66vh"><table class="mini" id="bt"><tr><th>№</th><th>Втулка</th><th>Материал</th><th class="n">кг / шт</th><th></th></tr>' +
        ks.map(function (k, i) { var v = B[k] || [], u = U[k]; var ad = !(EMBEDDED.kgdb.bush || {})[k] && BUSH_ADD[k]; return '<tr' + (u ? ' class="bush-u"' : ad ? ' class="bush-a" title="из вашего файла справочника (25.11) — в макросе нет"' : '') + '><td class="n">' + (i + 1) + '</td><td><b>' + esc(k) + '</b></td><td>' + esc(u ? (u.mat || '') : (v[0] || '')) + '</td><td class="n">' + esc(u ? String(u.qty) : (v[1] !== undefined ? String(v[1]) : '')) + (u && v[1] !== undefined ? ' <span class="note">(было ' + v[1] + ')</span>' : '') + '</td><td>' + (u && CAN_WRITE ? '<button class="btn sm bDel" data-k="' + esc(k) + '" title="Убрать вашу запись">✕</button>' : '') + '</td></tr>'; }).join('') + '</table></div></div>';
      openModal(h, true); tblSearch('bq', 'bt');
      if ($('bAdd')) $('bAdd').onclick = function () {
        var raw = cleanSp($('bAk').value), k = bushKey(raw) || raw.replace(/\s+/g, '').toUpperCase(), g = parseFloat(String($('bAg').value).replace(',', '.')) || 0;
        if (!k || !(g > 0)) { showMsg('Укажите код и кг на 1 шт.', 'err'); return; }
        bomSet('W|' + k, { name: k, mat: cleanSp($('bAm').value), qty: g, unit: 'кг/шт' }, 'Справочник втулок ' + k).then(function () { showMsg('Справочник втулок: <b>' + esc(k) + '</b> — ' + fmtQ(g) + ' кг/шт.', 'good'); bushModal(); });
      };
      modal.querySelectorAll('.bDel').forEach(function (b) { b.onclick = function () { bomSet('W|' + b.dataset.k, null, 'Справочник втулок ' + b.dataset.k).then(bushModal); }; });
    }
    function pylModal() {
      var rows = (BASE.struct && BASE.struct.raw && BASE.struct.raw.bp) || [];
      var h = head('Состав пыльник', 'лист «База пыльник» книги ' + esc(BASE.file)) + '<table class="mini"><tr><th>№</th><th>Пыльник</th><th>Материал</th><th class="n">кг за 1 шт</th></tr>' +
        rows.filter(function (r) { return r && cleanSp(r[0]) && !/^пыльник$/i.test(cleanSp(r[0])); }).map(function (r, i) { return '<tr><td class="n">' + (i + 1) + '</td><td><b>' + esc(cleanSp(r[0])) + '</b></td><td>' + esc(cleanSp(r[1])) + '</td><td class="n">' + esc(String(r[2] === null || r[2] === undefined ? '' : r[2])) + '</td></tr>'; }).join('') + '</table></div>';
      openModal(h);
    }
    function disModal() {
      var D = (BASE.disasm && BASE.disasm.rows) || [], src = 'лист «Анализ_разоб_виде» · ' + D.length + ' товаров';
      if (!D.length && OBUILD && OBUILD.disasm) { var M = OBUILD.disasm; D = Object.keys(M).map(function (k) { return { code: M[k][6] || k, semi: [M[k][5]].filter(Boolean), p: M[k].slice(0, 5) }; }); src = 'встроенный список · ' + D.length + ' товаров · из книги — после «Обновить базу»'; }
      var st = function (n) { var x = TD2 ? td2Stock(TD2, n) : null; return x && x.found ? x.stock : 0; };
      var cell = function (n, semi) { n = cleanSp(n); if (!n) return { h: '<td></td>' }; if (n === '-') return { h: '<td class="note">не используется</td>' }; var v = st(n), dn = detNorm(semi, n); return { h: '<td>' + esc(n) + '<br><b>' + fmt(v) + '</b>' + (dn > 1 ? ' <span class="note">÷' + dn + '</span>' : '') + '</td>', v: Math.floor(v / dn) }; };
      var h = head('Анализ в разобранном виде', src);
      if (D.length) {
        h += '<div class="fbar"><input type="search" id="dsq" placeholder="Поиск"></div><div class="scroll" style="max-height:70vh"><table class="mini wl" id="dst"><tr><th>TRT №</th><th>Готовая продукция</th><th>Корпус (01)</th><th>Палец (02)</th><th>Пыльник (04)</th><th>Сухарь (03)</th><th>Пятак (06)</th><th class="n">Можно собрать</th></tr>' +
          D.map(function (d) {
            var sm = d.semi[0] || '', cs = [0, 1, 3, 2, 4].map(function (i) { return cell(d.p[i], sm); }), vs = cs.filter(function (c) { return c.v !== undefined; }).map(function (c) { return c.v; });
            return '<tr><td><b>' + esc(d.code) + '</b></td><td>' + d.semi.map(function (x) { return esc(x) + ' <b>' + fmt(st(x)) + '</b>'; }).join('<br>') + '</td>' + cs.map(function (c) { return c.h; }).join('') + '<td class="n"><b>' + (vs.length ? fmt(Math.min.apply(null, vs)) : '—') + '</b></td></tr>';
          }).join('') + '</table></div>';
      }
      openModal(h + '</div>', true);
      if (D.length) tblSearch('dsq', 'dst');
    }
    function tblSearch(qid, tid) { $(qid).oninput = function () { var q = $(qid).value.replace(/\s+/g, '').toUpperCase(); $(tid).querySelectorAll('tr').forEach(function (tr, i) { if (!i) return; tr.style.display = !q || tr.textContent.replace(/\s+/g, '').toUpperCase().indexOf(q) >= 0 ? '' : 'none'; }); }; }
    /* состав: «белый лист» всех позиций действующих заказов → нажать — состав на 1 шт */
    function bomListModal() {
      var list = OOR.positions.filter(function (p) { return QUEUE.some(function (o) { return R[p.id].cells[o.id]; }); }).slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }); });
      var h = head('Состав позиций', list.length + ' позиций в действующих заказах · нажмите на позицию — состав на 1 шт') + '<div class="fbar"><input type="search" id="blq" placeholder="Поиск"></div><div class="scroll" style="max-height:70vh"><table class="mini wl" id="blt"><tr><th>№</th><th>Код</th><th>Название товара</th><th class="n">Заказов</th><th class="n">Заказ, шт</th><th></th></tr>' +
        list.map(function (p, i) { var n = QUEUE.filter(function (o) { return R[p.id].cells[o.id]; }).length; return '<tr class="go2" data-p="' + p.id + '"><td class="n">' + (i + 1) + '</td><td>' + esc(nameGroup(p.name)) + '</td><td><b>' + esc(p.name) + '</b></td><td class="n">' + n + '</td><td class="n">' + fmt(R[p.id].tq) + '</td><td>' + (bomTouched(p) ? '<span class="pill ed">изменён</span>' : '') + '</td></tr>'; }).join('') + '</table></div></div>';
      openModal(h, true); tblSearch('blq', 'blt');
      modal.querySelectorAll('tr.go2').forEach(function (tr) { tr.onclick = function () { posBomModal(tr.dataset.p, bomListModal); }; });
    }

    /* ===== история: очистить ===== */
    function histClear() {
      var n = HIST.length, done = function () { HIST = [{ ts: Date.now(), by: ME, kind: 'save', text: 'История очищена (было записей: ' + n + ').' }]; persistHist(HIST[0]); histModal(); showMsg('История очищена.', 'good'); };
      if (!DB) { HIST = []; lsSet('hist', []); done(); return; }
      DB.collection('history').get().then(function (snap) { var pr = Promise.resolve(); snap.docs.forEach(function (d) { pr = pr.then(function () { return DB.collection('history').doc(d.id).delete(); }); }); return pr; }).then(done, function (e) { showMsg('Не очищено: ' + esc(e.message || e.code || e), 'err'); });
    }

    /* ===== инвойс → комментарии ===== */
    function invPick() {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xlsm,.xls,.csv';
      inp.onchange = function () { var f = inp.files[0]; if (!f) return; readWb(f).then(function (wb) { invModal(f.name, wb); }, function (e) { showMsg('Не прочитан: ' + esc(e.message || e), 'err'); }); };
      inp.click();
    }
    function invParse(rows) {
      var hr = -1, cN = -1, cQ = -1, cQ2 = -1;
      for (var i = 0; i < Math.min(rows.length, 30) && hr < 0; i++) {
        var r = rows[i] || [];
        r.forEach(function (v, j) { var t = cleanSp(v).toUpperCase(); if (!t) return; if (cN < 0 && (/TRT\s*NO|^КОД|НОМЕНКЛАТУРА|НАИМЕНОВАНИЕ|АРТИКУЛ|ТОВАР/.test(t))) cN = j; if (/ПО ИНВОЙСУ/.test(t)) cQ2 = j; else if (cQ < 0 && /КОЛ-?ВО|КОЛИЧЕСТВО|QTY|КОЛ\./.test(t)) cQ = j; });
        if (cN >= 0 && (cQ >= 0 || cQ2 >= 0)) hr = i; else { cN = -1; cQ = -1; cQ2 = -1; }
      }
      if (hr < 0) return null;
      var q = cQ2 >= 0 ? cQ2 : cQ, out = [];
      for (var k = hr + 1; k < rows.length; k++) {
        var rr = rows[k] || [], nm = cleanSp(rr[cN]), v = rr[q];
        if (!nm || /ИТОГ/i.test(nm)) continue;
        var n = typeof v === 'number' ? v : parseFloat(String(v || '').replace(/\s+/g, '').replace(',', '.'));
        if (!(n > 0)) continue;
        out.push({ code: nm, qty: n });
      }
      return out;
    }
    function invMatch(code) {
      var k = code.replace(/\s+/g, '').toUpperCase(), byName = OOR.positions.filter(function (p) { return p.key.replace(/\s+/g, '') === k; });
      if (byName.length) return byName;
      var byCode = OOR.positions.filter(function (p) { var m = cleanSp(p.name).match(/^(.+?)\s+(TRT|RS|HORT)\b/i); return m && m[1].replace(/\s+/g, '').toUpperCase() === k; });
      if (byCode.length) return byCode;
      var g = OOR.positions.filter(function (p) { return String(p.group || '').replace(/\s+/g, '').toUpperCase() === k || nameGroup(p.name).replace(/\s+/g, '').toUpperCase() === k; });
      return codeSide(code) ? g.filter(function (p) { var ps = codeSide(p.name); return !ps || ps.split('/').indexOf(codeSide(code)) >= 0; }) : g;
    }
    /* распределение: по очереди заказов — сначала где не хватает, остаток — в первую ячейку */
    function invAlloc(lines, oid) {
      return lines.map(function (ln) {
        var ps = invMatch(ln.code), left = ln.qty, parts = [];
        var cells = []; QUEUE.forEach(function (o) { if (oid && o.id !== oid) return; ps.forEach(function (p) { if (R[p.id].cells[o.id]) cells.push([p, o, finalShort(p, o)]); }); });
        cells.forEach(function (c) { if (left <= 0 || c[2] <= 0) return; var t = Math.min(left, c[2]); parts.push([c[0], c[1], t]); left -= t; });
        if (left > 0 && cells.length) { var f = parts.length ? parts[parts.length - 1] : null; if (f) f[2] += left; else parts.push([cells[0][0], cells[0][1], left]); left = 0; }
        return { code: ln.code, qty: ln.qty, ps: ps, parts: parts, left: left };
      });
    }
    function invModal(fname, wb) {
      var sheets = wb.SheetNames.filter(function (s) { return invParse(sheetRows(wb, s)); });
      if (!sheets.length) { showMsg('В файле не найдены колонки «TRT NO.» / «Номенклатура» и «Кол-во».', 'err'); return; }
      var pref = sheets.filter(function (s) { return /инвойс/i.test(s); }), sh0 = (pref.length ? pref : sheets)[(pref.length ? pref : sheets).length - 1];
      var h = head('Добавить инвойс', esc(fname)) + '<div class="invf"><label>Лист<select id="ivS">' + sheets.map(function (s) { return '<option' + (s === sh0 ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
        '<label>Инвойс №<input id="ivN" list="ivNL" autocomplete="off">' + cmKnownList(cmKnown().I, 'ivNL', function (a) { return Object.keys(a.cont).join(', '); }) + '</label><label>Статус<select id="ivSt">' + Object.keys(CM_ST).filter(Boolean).map(function (k) { return '<option value="' + k + '"' + (k === 'transit' ? ' selected' : '') + '>' + CM_ST[k] + '</option>'; }).join('') + '</select></label>' +
        '<label>Контейнер №<input id="ivC" list="ivCL" autocomplete="off">' + cmKnownList(cmKnown().C, 'ivCL', function (b) { return b.inv ? 'инв. ' + b.inv : ''; }) + '</label><label>Дата инвойса<input id="ivDI" type="date"></label><label>Дата отгрузки<input id="ivD" type="date"></label>' +
        '<label>Заказ<select id="ivO"><option value="">по очереди — где не хватает</option>' + QUEUE.map(function (o) { return '<option value="' + o.id + '">' + esc(o.label + ' · ' + o.client) + '</option>'; }).join('') + '</select></label>' +
        '<label class="wide">Комментарий (общий для всех)<input id="ivT" placeholder="необязательно"></label></div><div id="ivP"></div>' +
        '<div class="row" style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" id="ivGo">Добавить комментарии</button><button class="btn" id="ivX">Отмена</button></div></div>';
      openModal(h, true);
      var A = null;
      var draw = function () {
        var s = $('ivS').value, lines = invParse(sheetRows(wb, s)) || [];
        if (!$('ivN').dataset.man) $('ivN').value = (s.match(/\d+/) || [''])[0];
        A = invAlloc(lines, $('ivO').value);
        var nOk = 0, nc = 0, out = '<table class="mini ivt"><tr><th>№</th><th>Код</th><th class="n">Кол-во</th><th>Куда (позиция · заказ · шт)</th></tr>';
        A.forEach(function (a, i) {
          if (a.parts.length) { nOk++; nc += a.parts.length; }
          out += '<tr' + (a.parts.length ? '' : ' class="ivnf"') + '><td class="n">' + (i + 1) + '</td><td><b>' + esc(a.code) + '</b></td><td class="n">' + fmt(a.qty) + '</td><td>' + (a.parts.length ? a.parts.map(function (x) { return esc(x[0].name) + ' · <b>' + esc(x[1].label) + '</b> · ' + fmt(x[2]) + ' шт'; }).join('<br>') : '<span style="color:var(--bad)">нет в заказах</span>') + '</td></tr>';
        });
        $('ivP').innerHTML = '<p class="note">Строк: ' + A.length + ' · найдено: ' + nOk + ' · комментариев будет: ' + nc + '</p><div class="scroll" style="max-height:46vh">' + out + '</table></div>';
        $('ivGo').textContent = 'Добавить комментарии (' + nc + ')'; $('ivGo').disabled = !nc;
      };
      $('ivN').oninput = function () { $('ivN').dataset.man = 1; };
      $('ivS').onchange = draw; $('ivO').onchange = draw; draw();
      $('ivX').onclick = setModal;
      $('ivGo').onclick = function () {
        var inv = cleanSp($('ivN').value), st = $('ivSt').value, cont = cleanSp($('ivC').value), ship = $('ivD').value, txt = String($('ivT').value || '').trim(), ts = Date.now(), pairs = [], qty = {};
        A.forEach(function (a) { a.parts.forEach(function (x) { var k = x[0].id + '|' + x[1].id; if (!qty[k]) { qty[k] = 0; pairs.push([x[0], x[1]]); } qty[k] += x[2]; }); });
        if (!pairs.length) return;
        var invd = $('ivDI') ? $('ivDI').value : '';
        cmSaveMany(pairs, function (L, p, o) { var c = { st: st, qty: qty[p.id + '|' + o.id], inv: inv, cont: cont, ship: ship, text: txt, ts: ts, by: ME || '' }; if (invd) c.invd = invd; return L.concat([c]); }, 'Инвойс ' + inv + ' (' + $('ivS').value + '): добавлено комментариев ' + pairs.length + ', статус «' + CM_ST[st] + '».');
        render(); closeModal(); showMsg('Инвойс ' + esc(inv) + ': добавлено комментариев — ' + pairs.length + '.', 'good');
      };
    }

    /* «Сохранить»: в этот же файл (Chrome/Edge, файл с диска); иначе — скачать */
    /* «Сохранить» — только в этот же файл, без скачивания. Первый раз браузер просит один раз указать этот файл (так устроена защита браузера) */
    function saveOk() { showMsg('Сохранено в этот же файл <b>' + esc(FILEH.name || fileName()) + '</b> · ' + new Date().toLocaleTimeString('ru-RU') + '. Дальше каждая правка сохраняется сама.', 'good'); }
    function saveErr(e) { if (e && e.name === 'AbortError') { showMsg('Не сохранено — файл не выбран.', 'err'); return; } showMsg('Не сохранено: ' + esc((e && (e.message || e.name)) || e) + '. Копия — ⚙ Настройки → «Сохранить копию».', 'err'); }
    function saveFirst() {
      var n = fileName();
      openModal(head('Сохранение в этот файл', 'один раз — дальше без окон') + '<div class="svf"><p>Браузер разрешает программе записывать в файл только после того, как вы <b>один раз</b> укажете этот файл.</p><ol><li>Нажмите «Указать файл».</li><li>В окне откройте папку, где лежит <b>' + esc(n) + '</b>, выберите его и нажмите «Сохранить».</li><li>На вопрос «Заменить?» ответьте «Да».</li></ol><p>После этого «Сохранить» и все правки пишутся прямо в этот файл — без скачивания и окон.</p><div class="row" style="display:flex;gap:8px"><button class="btn primary" id="svGo">Указать файл</button><button class="btn" id="svNo">Отмена</button></div></div></div>');
      $('svNo').onclick = closeModal;
      $('svGo').onclick = function () { closeModal(); fsPick().then(fsSaveNow).then(saveOk, saveErr); };
    }
    $('saveBtn').onclick = function () {
      if (DB) { showMsg('Здесь всё сохраняется само — в базе страницы. Скачать копию: ⚙ Настройки → «Сохранить копию».', 'good'); return; }
      if (!fsAvail()) { showMsg('Этот браузер не умеет записывать в открытый файл. Откройте ' + esc(fileName()) + ' в Google Chrome или Microsoft Edge — там «Сохранить» пишет прямо в этот файл. Копия: ⚙ Настройки → «Сохранить копию».', 'err'); return; }
      if (!FILEH) { saveFirst(); return; }
      fsPerm(FILEH, true).then(function (ok) { if (!ok) { FILEH = null; saveFirst(); return; } return fsSaveNow().then(saveOk); }).catch(saveErr);
    };
    $('setBtn').onclick = setModal;

    /* ===== 24.11 v5: окно заказа (закреплено, списки частей), подсказка ячейки, отмена / повтор ===== */
    /* --- окно заказа: держится, пока не наведёте на другой заказ или на ячейки; части индикатора → список позиций --- */
    var ordTip2 = document.createElement('div'); ordTip2.id = 'ordTip2'; ordTip2.hidden = true; document.body.appendChild(ordTip2);
    var OT_T = 0;
    function ordTipHide() { clearTimeout(OT_T); ordTip.hidden = true; ordTip.dataset.o = ''; ordTip2.hidden = true; }
    function ordTipLater(ms) { clearTimeout(OT_T); OT_T = setTimeout(ordTipHide, ms); }
    function ordLists(o) {
      var L = { ok: [], short: [] };
      OOR.positions.forEach(function (p) {
        var c = R[p.id].cells[o.id]; if (!c) return; var s = finalShort(p, o), a = AC(p, o);
        if (c.q - s > 0) L.ok.push([p, c.q - s, s > 0 ? 'частично' : (c.need === 0 ? 'резерв' : a && (a.semi || a.prod) ? (a.prod ? 'произв.' : 'п/ф') : 'склад')]);
        if (s > 0) {
          var C = cmOf(p, o).filter(function (x) { return x.st && x.qty > 0; }), cov = Math.min(s, cmCov(C));
          if (cov > 0) {
            var t = cmTop(C).st, Gc = {}, go = [];
            C.forEach(function (x) { var k = (x.st || '') + '|' + cleanSp(x.inv) + '|' + cleanSp(x.cont); if (!Gc[k]) { Gc[k] = { st: x.st, inv: cleanSp(x.inv), cont: cleanSp(x.cont), q: 0, kg: 0 }; go.push(k); } Gc[k].q += x.qty; Gc[k].kg += x.mkg > 0 ? x.mkg : 0; });
            var lines = go.map(function (k) { var g = Gc[k]; return '<span class="o2c"><i style="background:' + CM_COL[g.st || ''] + '"></i>' + esc(CM_ST[g.st] || '') + ' <b>' + fmt(g.q) + ' шт</b>' + (g.kg > 0 ? ' (' + fmtKg(g.kg) + ' кг)' : '') + (g.inv ? ' · инв. ' + invLink(g.inv) : '') + (g.cont ? ' · конт. <b>' + esc(g.cont) + '</b>' : '') + '</span>'; }).join('');
            (L[t] = L[t] || []).push([p, cov, '', lines]);
          }
          if (s - cov > 0) L.short.push([p, s - cov, 'из ' + fmt(c.q)]);
        }
      });
      Object.keys(L).forEach(function (k) { L[k].sort(function (a, b) { return b[1] - a[1]; }); });
      return L;
    }
    function hexA(h, a) { var m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return 'transparent'; var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
    function ordTip2Show(el) {
      var o = O(ordTip.dataset.o), k = el.dataset.seg; if (!o || !ordTip._L) return;
      var L = ordTip._L[k] || [], nm = { ok: 'хватает (закрыто)', short: 'не хватает' }[k] || CM_ST[k], col = { ok: '#3BB273', short: '#E5483F' }[k] || CM_COL[k];
      ordTip2.innerHTML = '<div class="o2-h" style="border-left-color:' + col + '">' + esc(nm) + ' <span>· ' + esc(o.label) + ' · позиций ' + L.length + ' · ' + fmt(L.reduce(function (s, x) { return s + x[1]; }, 0)) + ' шт</span></div>' +
        '<div class="o2-b"><table>' + L.map(function (x) { return '<tr class="o2pr" data-p="' + x[0].id + '"><td style="background:' + hexA(col, .16) + ';box-shadow:inset 4px 0 0 ' + col + '">' + esc(x[0].name) + (x[2] ? '<small>' + esc(x[2]) + '</small>' : '') + '</td><td class="n" style="background:' + hexA(col, .16) + '">' + fmt(x[1]) + ' шт</td></tr>' + (x[3] ? '<tr class="o2lr" data-p="' + x[0].id + '"><td colspan="2"><small class="o2cs">' + x[3] + '</small></td></tr>' : ''); }).join('') + '</table></div>';
      ordTip2.hidden = false;
      var r = ordTip.getBoundingClientRect(), z = bodyZ(); ordTip2.style.left = '0px'; ordTip2.style.top = '0px';
      var w = ordTip2.offsetWidth * z, hh = ordTip2.offsetHeight * z, vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var x = r.right + 6; if (x + w > vw - 8) x = Math.max(8, r.left - w - 6);
      var y = Math.max(8, Math.min(el.getBoundingClientRect().top - 10, vh - hh - 8));
      ordTip2.style.left = x / z + 'px'; ordTip2.style.top = y / z + 'px';
    }
    ordTip.addEventListener('mouseover', function (e) { clearTimeout(OT_T); var s = e.target.closest('[data-seg]'); if (s && ordTip2.dataset.seg !== s.dataset.seg + '|' + ordTip.dataset.o) { ordTip2.dataset.seg = s.dataset.seg + '|' + ordTip.dataset.o; ordTip2Show(s); } });
    ordTip.addEventListener('mouseleave', function (e) { if (e.relatedTarget && (ordTip2.contains(e.relatedTarget) || (e.relatedTarget.closest && e.relatedTarget.closest('th.ord')))) return; ordTipLater(700); });
    ordTip2.addEventListener('mouseover', function () { clearTimeout(OT_T); });
    ordTip2.addEventListener('mouseleave', function (e) { if (e.relatedTarget && ordTip.contains(e.relatedTarget)) return; ordTipLater(700); });
    ordTip2.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-p]'), o = ordTip.dataset.o; if (!tr || !o) return; ordTipHide(); cellModal(tr.dataset.p, o); });
    document.addEventListener('pointerdown', function (e) { if (ordTip.hidden) return; if (ordTip.contains(e.target) || ordTip2.contains(e.target)) return; ordTipHide(); }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { ordTipHide(); cellTip.hidden = true; } });

    /* --- наведение на ячейку позиции: мини-индикатор + детали 01–06 с количеством --- */
    var cellTip = document.createElement('div'); cellTip.id = 'cellTip'; cellTip.hidden = true; document.body.appendChild(cellTip);
    var CT_T = 0, CTREE = {}, CTREE_SIG = null;
    function cellTree(p) {
      if (CTREE_SIG !== ALLOC) { CTREE = {}; CTREE_SIG = ALLOC; }
      if (!(p.id in CTREE)) { var res = null; try { var blk = blockOf(p); if (blk && ENGINE) res = computeTree(blk.rows, p.name, ENGINE.kgPerPc); } catch (x) { res = null; } CTREE[p.id] = res; }
      return CTREE[p.id];
    }
    function cellTipHtml(p, o) {
      var c = R[p.id].cells[o.id]; if (!c) return '';
      var a = AC(p, o), s = finalShort(p, o), rv = Math.min(c.rv || 0, c.q), fg = a ? a.fg || 0 : 0, sm = a ? a.semi || 0 : 0, pr = a ? a.prod || 0 : 0;
      var C = cmOf(p, o).filter(function (x) { return x.st && x.qty > 0; }), cov = s > 0 ? Math.min(s, cmCov(C)) : 0, ct = cov ? cmTop(C).st : '';
      if (!a) fg = Math.max(0, c.q - rv - s);
      var segs = [['резерв', rv, '#5B8DD6'], ['со склада', fg, '#3BB273'], ['полуфабрикат', sm, '#E8B400'], ['произвести', pr, '#F08C00']];
      if (cov) segs.push([CM_ST[ct], cov, CM_COL[ct]]);
      segs.push(['не хватает', s - cov, '#E5483F']);
      segs = segs.filter(function (x) { return x[1] > 0; });
      var st = s > 0 ? ['не хватает ' + fmt(s) + ' шт', 'bad'] : c.need === 0 ? ['В Резерве', 'res'] : (sm || pr) ? [pr ? 'произвести' : 'из полуфабриката', 'mk'] : ['хватает', 'ok'];
      var q = c.q || 1, pc = function (v) { var x = v / q * 100; return (x > 0 && x < 1 ? '<1' : Math.floor(x)) + '%'; };
      var h = '<div class="ct2-h">' + esc(p.name) + ' <span>· ' + esc(o.label) + '</span></div><div class="ct2-s"><span class="pill ' + st[1] + '">' + esc(st[0]) + '</span> заказ <b>' + fmt(c.q) + ' шт</b></div>';
      h += '<div class="ot-bar">' + segs.map(function (x) { return '<i style="flex:' + x[1] + ';background:' + x[2] + '">' + (x[1] / q >= 0.12 ? pc(x[1]) : '') + '</i>'; }).join('') + '</div>';
      h += '<table class="ot-t">' + segs.map(function (x) { return '<tr><td><i style="background:' + x[2] + '"></i>' + esc(x[0]) + '</td><td class="n">' + fmt(x[1]) + ' шт</td><td class="n">' + pc(x[1]) + '</td></tr>'; }).join('') + '</table>';
      if (sm || pr || s > 0) h += tipDet(p);
      return h;
    }
    function tipDet(p) {
      var h = '';
      {
        var res = cellTree(p);
        if (res && res.roots.length) {
          var rows = '';
          res.roots.forEach(function (rt) {
            var it = res.items[rt.i], seen = {}, need = (R[p.id].tn || 0) * (rt.kn || 1);
            if (res.roots.length > 1) rows += '<tr class="sm"><td colspan="2">' + esc(it.nm) + (rt.kn > 1 ? ' × ' + rt.kn : '') + '</td></tr>';
            (it.pos || []).forEach(function (ps) {
              if (seen[ps.pk]) return; seen[ps.pk] = 1;
              var g = '', nm = ''; res.items.forEach(function (x) { if (x.par === rt.i && x.pk === ps.pk) { if (!g) g = grpOf(x.nm); if (!nm) nm = x.nm; } }); if (!g) g = grpOf(ps.pk);
              var v = Math.floor(ps.sum || 0), bad = v < need;
              rows += '<tr' + (bad ? ' class="bad"' : '') + '><td><b>' + esc(GRP_T[g] ? g + '-' + GRP_T[g] : ps.pk.replace(/^MAT\|/, '')) + '</b><small>' + esc(nm) + '</small></td><td class="n">' + fmt(v) + ' шт' + (bad ? '<small>нужно ' + fmt(need) + '</small>' : '') + '</td></tr>';
            });
          });
          if (rows) h += '<div class="ct2-d">Детали 01–06 — есть на складе (с цепочкой)</div><table class="ot-t ct2-t">' + rows + '</table>';
        }
      }
      return h;
    }
    /* наведение на название позиции — мини-индикатор по всем заказам позиции */
    function posTipHtml(p) {
      var Q = 0, RV = 0, FG = 0, SM = 0, PR = 0, S = 0, CS = {}, no = 0, ns = 0;
      QUEUE.forEach(function (o) {
        var c = R[p.id].cells[o.id]; if (!c) return; no++;
        var a = AC(p, o), s = finalShort(p, o), rv = Math.min(c.rv || 0, c.q);
        Q += c.q; RV += rv; S += s; if (s > 0) ns++;
        if (a) { FG += a.fg || 0; SM += a.semi || 0; PR += a.prod || 0; } else FG += Math.max(0, c.q - rv - s);
        if (s > 0) { var C = cmOf(p, o).filter(function (x) { return x.st && x.qty > 0; }), cov = Math.min(s, cmCov(C)); if (cov) { var t = cmTop(C).st; CS[t] = (CS[t] || 0) + cov; } }
      });
      if (!no) return '';
      var segs = [['резерв', RV, '#5B8DD6'], ['со склада', FG, '#3BB273'], ['полуфабрикат', SM, '#E8B400'], ['произвести', PR, '#F08C00']], cv = 0;
      ['arrived', 'customs', 'transit', 'process'].forEach(function (k) { if (CS[k]) { segs.push([CM_ST[k], CS[k], CM_COL[k]]); cv += CS[k]; } });
      segs.push(['не хватает', S - cv, '#E5483F']);
      segs = segs.filter(function (x) { return x[1] > 0; });
      var r = R[p.id], st = S > 0 ? ['не хватает ' + fmt(S) + ' шт', 'bad'] : (r.tn || 0) === 0 ? ['В Резерве', 'res'] : (SM || PR) ? [PR ? 'произвести' : 'из полуфабриката', 'mk'] : ['хватает', 'ok'];
      var q = Q || 1, pc = function (v) { var x = v / q * 100; return (x > 0 && x < 1 ? '<1' : Math.floor(x)) + '%'; };
      var h = '<div class="ct2-h">' + esc(p.name) + ' <span>· все заказы</span></div><div class="ct2-s"><span class="pill ' + st[1] + '">' + esc(st[0]) + '</span> заказов <b>' + no + '</b>' + (ns ? ', с нехваткой <b>' + ns + '</b>' : '') + ' · всего <b>' + fmt(Q) + ' шт</b> · склад <b>' + fmt(r.stock) + '</b></div>';
      h += '<div class="ot-bar">' + segs.map(function (x) { return '<i style="flex:' + x[1] + ';background:' + x[2] + '">' + (x[1] / q >= 0.12 ? pc(x[1]) : '') + '</i>'; }).join('') + '</div>';
      h += '<table class="ot-t">' + segs.map(function (x) { return '<tr><td><i style="background:' + x[2] + '"></i>' + esc(x[0]) + '</td><td class="n">' + fmt(x[1]) + ' шт</td><td class="n">' + pc(x[1]) + '</td></tr>'; }).join('') + '</table>';
      if (SM || PR || S > 0) h += tipDet(p);
      return h;
    }
    function cellTipShow(td) {
      var p = P(td.dataset.p), o = O(td.dataset.o); if (!p || !o) return;
      if (td.dataset.pp && td.dataset.pp.indexOf(',') > 0) { /* одна строка на корень: несколько позиций в ячейке */
        if (td.title) { td.dataset.t = td.title; td.title = ''; }
        var rows = td.dataset.pp.split(',').map(function (id) { var pp = P(id), c = R[id].cells[o.id], ac = AC(pp, o) || { short: c.short }; return '<tr><td><b>' + esc(pp.name) + '</b></td><td class="n"><b>' + fmt(c.q) + '</b> шт</td><td class="n" style="color:' + (ac.short > 0 ? 'var(--bad)' : 'var(--ok)') + ';font-weight:700">' + (ac.short > 0 ? 'не хватает ' + fmt(ac.short) : 'хватает') + '</td></tr>'; }).join('');
        cellTip.innerHTML = '<div style="font-weight:800;margin-bottom:4px">' + esc(o.label) + ' · позиций ' + td.dataset.pp.split(',').length + '</div><table class="mini">' + rows + '</table><div class="note" style="margin-top:4px">Нажмите — выбрать позицию</div>';
        cellTip.hidden = false; placeNear(cellTip, td.getBoundingClientRect()); return;
      }
      if (td.title) { td.dataset.t = td.title; td.title = ''; }
      var h = cellTipHtml(p, o); if (!h) return;
      cellTip.innerHTML = h; cellTip.hidden = false; placeNear(cellTip, td.getBoundingClientRect());
    }
    $('grid').addEventListener('mouseover', function (e) {
      var nm = e.target.closest('td.c-name[data-p], .c-pn[data-p]');
      if (nm && !EDITING && !DRAGCM) {
        if (!ordTip.hidden) ordTipLater(350);
        if (cellTip.dataset.k === 'n|' + nm.dataset.p && !cellTip.hidden) return;
        clearTimeout(CT_T); cellTip.hidden = true; cellTip.dataset.k = 'n|' + nm.dataset.p;
        CT_T = setTimeout(function () { var pp = P(nm.dataset.p); if (!pp) return; if (nm.title) { nm.dataset.t = nm.title; nm.title = ''; } var hh = posTipHtml(pp); if (!hh) return; cellTip.innerHTML = hh; cellTip.hidden = false; placeNear(cellTip, nm.getBoundingClientRect()); }, 350);
        return;
      }
      var td = e.target.closest('td.cell[data-p]');
      if (!ordTip.hidden && !e.target.closest('th.ord')) ordTipLater(350);
      if (!td || td.classList.contains('empty') || e.target.closest('em.cmb,em.cmlab') || EDITING || DRAGCM) { clearTimeout(CT_T); cellTip.hidden = true; return; }
      if (cellTip.dataset.k === td.dataset.p + '|' + td.dataset.o && !cellTip.hidden) return;
      clearTimeout(CT_T); cellTip.hidden = true; cellTip.dataset.k = td.dataset.p + '|' + td.dataset.o;
      CT_T = setTimeout(function () { cellTipShow(td); }, 350);
    });
    $('grid').addEventListener('mouseleave', function () { clearTimeout(CT_T); cellTip.hidden = true; cellTip.dataset.k = ''; });
    document.addEventListener('scroll', function (e) { var t = e.target; if (t && t.nodeType === 1 && (cmTip.contains(t) || ordTip.contains(t) || ordTip2.contains(t) || cmPop.contains(t))) return; clearTimeout(CT_T); cellTip.hidden = true; cellTip.dataset.k = ''; ordTip2.hidden = true; }, true);
    document.addEventListener('pointerdown', function () { clearTimeout(CT_T); cellTip.hidden = true; cellTip.dataset.k = ''; }, true);

    /* --- отменить / повторить: до 3 шагов назад и вперёд (заказ, резерв, остаток, модель, склад, блок, комментарии, структура) --- */
    var UNDO = [], REDO = [], UNDO_BUSY = false, UNDO_LBL = '', UNDO_TYPES = ['q', 'r', 'stock', 'model', 'td2', 'obs', 'cm', 'bom', 'invp'];
    function ovClone() { var o = {}; UNDO_TYPES.forEach(function (t) { o[t] = JSON.parse(JSON.stringify(OV[t] || {})); }); return o; }
    function ovSame(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function undoId(t, k) { return t === 'cm' ? 'c' + hash(k) : t === 'bom' ? 'b' + hash(k) : t === 'invp' ? 'v' + hash(k) : 'e' + hash(t + '|' + k); }
    function histLbl(h) {
      if (!h) return '';
      if (h.text) return h.text;
      var f = function (v) { return v === undefined || v === null || v === '' ? '—' : (typeof v === 'number' ? fmt(v) : String(v)); };
      return (h.field || '') + ': ' + (h.pos || '') + (h.ord ? ' · ' + String(h.ord).split(' · ')[0] : '') + ' ' + f(h.from) + ' → ' + f(h.to);
    }
    function undoSnap() {
      if (UNDO_BUSY) return;
      var cur = ovClone(), top = UNDO[UNDO.length - 1];
      if (top && ovSame(top.ov, cur)) return;
      UNDO.push({ ov: cur, lbl: UNDO_LBL || 'правка' }); UNDO_LBL = ''; REDO = [];
      while (UNDO.length > 4) UNDO.shift();
      undoUi();
    }
    /* перед правкой: верх стека = состояние прямо перед ней (если данные менялись загрузкой или другим пользователем — подтягиваем) */
    function undoPre() {
      if (UNDO_BUSY) return;
      var cur = ovClone(), top = UNDO[UNDO.length - 1];
      if (!top) UNDO.push({ ov: cur, lbl: '' }); else if (!ovSame(top.ov, cur)) top.ov = cur;
    }
    function undoApply(target, verb, lbl) {
      UNDO_BUSY = true;
      var ts = Date.now(), jobs = [], n = 0, types = {};
      UNDO_TYPES.forEach(function (t) {
        var A = OV[t] || (OV[t] = {}), B = target[t] || {}, keys = {};
        Object.keys(A).forEach(function (k) { keys[k] = 1; }); Object.keys(B).forEach(function (k) { keys[k] = 1; });
        Object.keys(keys).forEach(function (k) {
          if (JSON.stringify(A[k]) === JSON.stringify(B[k])) return;
          var v = B[k] === undefined ? null : JSON.parse(JSON.stringify(B[k])), id = undoId(t, k);
          if (v === null) { delete A[k]; delete OVMETA[id]; } else { A[k] = v; OVMETA[id] = { ts: ts, by: ME }; }
          n++; types[t] = 1;
          jobs.push(persistEdit(id, t, k, v, { name: k }, null, ts));
        });
      });
      if (types.obs) BLKC = {};
      if (types.bom) BOMX = null;
      var hst = { ts: ts, by: ME, kind: 'undo', text: verb + ': ' + lbl };
      HIST.unshift(hst); jobs.push(persistHist(hst));
      recalc();
      UNDO_BUSY = false; undoUi(); showMsg(verb + ': ' + esc(lbl) + (n > 1 ? ' (' + n + ' изменений)' : '') + '.', 'good');
      return Promise.all(jobs).catch(function (e) { showMsg('Не удалось сохранить: ' + esc(e.message || e), 'err'); });
    }
    function undoSteps(k) {
      if (!CAN_WRITE || UNDO.length < 2) return Promise.resolve();
      k = Math.min(k || 1, UNDO.length - 1);
      var lbls = [];
      for (var i = 0; i < k; i++) { var s = UNDO.pop(); REDO.push(s); lbls.push(s.lbl); }
      return undoApply(UNDO[UNDO.length - 1].ov, 'Отменено', lbls.join('; '));
    }
    function redoSteps(k) {
      if (!CAN_WRITE || !REDO.length) return Promise.resolve();
      k = Math.min(k || 1, REDO.length);
      var lbls = [], s;
      for (var i = 0; i < k; i++) { s = REDO.pop(); UNDO.push(s); lbls.push(s.lbl); }
      return undoApply(s.ov, 'Повторено', lbls.join('; '));
    }
    function undoUi() {
      var nu = Math.max(0, UNDO.length - 1), nr = REDO.length;
      [['undoBtn', nu], ['undoDd', nu], ['redoBtn', nr], ['redoDd', nr], ['hUndo', nu], ['hRedo', nr]].forEach(function (x) { var b = $(x[0]); if (b) b.disabled = !x[1] || !CAN_WRITE; });
      var ub = $('undoBtn'), rb = $('redoBtn');
      if (ub) ub.title = nu ? 'Отменить: ' + UNDO[UNDO.length - 1].lbl + ' (Ctrl+Z)' : 'Отменить — нечего';
      if (rb) rb.title = nr ? 'Повторить: ' + REDO[REDO.length - 1].lbl + ' (Ctrl+Y)' : 'Повторить — нечего';
    }
    function undoMenu(btn, redo) {
      var r = btn.getBoundingClientRect(), it = [];
      if (redo) for (var i = REDO.length - 1, n = 1; i >= 0 && n <= 3; i--, n++) (function (n, s) { it.push([n + '. ' + esc(s.lbl.length > 90 ? s.lbl.slice(0, 90) + '…' : s.lbl), function () { redoSteps(n); }]); })(n, REDO[i]);
      else for (var j = UNDO.length - 1, m = 1; j >= 1 && m <= 3; j--, m++) (function (m, s) { it.push([m + '. ' + esc(s.lbl.length > 90 ? s.lbl.slice(0, 90) + '…' : s.lbl), function () { undoSteps(m); }]); })(m, UNDO[j]);
      if (!it.length) it.push([redo ? 'Нечего повторять' : 'Нечего отменять', function () { }, true]);
      ctxOpen(r.left, r.bottom + 2, it);
    }
    /* правки идут через эти функции: снимок до и после */
    (function () {
      var wrap = function (f) { return function () { undoPre(); var n0 = HIST.length, r = f.apply(this, arguments); if (!UNDO_BUSY) { if (HIST.length > n0) UNDO_LBL = histLbl(HIST[0]); undoSnap(); } return r; }; };
      setEdit = wrap(setEdit); setTd2Edit = wrap(setTd2Edit); setObsEdit = wrap(setObsEdit); cmSave = wrap(cmSave); cmSaveMany = wrap(cmSaveMany); bomSet = wrap(bomSet);
      var rc = recalc; recalc = function () { var r = rc.apply(this, arguments); if (!UNDO.length && OOR) { UNDO.push({ ov: ovClone(), lbl: '' }); undoUi(); } return r; };
    })();
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      var t = e.target, tag = t && t.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      var k = e.key.toLowerCase();
      if ((k === 'z' || k === 'я') && !e.shiftKey) { e.preventDefault(); undoSteps(1); }
      else if (k === 'y' || k === 'н' || ((k === 'z' || k === 'я') && e.shiftKey)) { e.preventDefault(); redoSteps(1); }
    });
    $('undoBtn').onclick = function () { undoSteps(1); };
    $('redoBtn').onclick = function () { redoSteps(1); };
    $('undoDd').onclick = function (e) { e.stopPropagation(); undoMenu(this, false); };
    $('redoDd').onclick = function (e) { e.stopPropagation(); undoMenu(this, true); };
    undoUi();

    /* ================= старт ================= */
    (function () {
      var d = EMBEDDED;
      setBase(d.base); setModels(d.models);
      if (d.ov && d.ov.OV) { OV = d.ov.OV; OVMETA = d.ov.META || {}; KT = d.ov.KT || {};['stock', 'q', 'r', 'model', 'mo', 'td2', 'cm', 'obs', 'bom', 'invp'].forEach(function (k) { OV[k] = OV[k] || {}; }); }
      if (d.hist) HIST = d.hist;
      if (d.savedAt) $('sync').textContent = 'Файл сохранён ' + d.savedAt;
      recalc(); applyZoom();
    })();
    startDb();

    /* ===== «← Назад» во всех окнах: окно, открытое из другого окна (список → позиция → …), возвращает к предыдущему ===== */
    var NAV = { cur: null, stack: [], back: false, depth: 0 };
    var NAV_VIEW = ['kpiList', 'bomModal', 'invListModal', 'invItemsModal', 'invPendModal', 'cmListModal', 'cellModal', 'posModal', 'ordModal', 'stockModal', 'minStockModal', 'modelModal', 'fileInfoModal', 'histModal', 'stkDiffModal', 'analysisModal', 'showText', 'setModal', 'aboutModal', 'bushModal', 'pylModal', 'disModal', 'bomListModal'];
    var NAV_FORM = ['orderForm', 'invNewModal', 'invLineModal', 'invWhereModal', 'cmForm', 'printModal', 'invModal'];
    function navSame(a, b) { if (!a || !b || a.n !== b.n || a.a.length !== b.a.length) return false; for (var i = 0; i < a.a.length; i++) { var x = a.a[i], y = b.a[i]; if (x === y) continue; if (x && y && typeof x === 'object' && typeof y === 'object') continue; return false; } return true; }
    function navBtn() {
      if (!ov.classList.contains('on') || !NAV.stack.length) return;
      var mh = modal.querySelector('.mh'); if (!mh || mh.querySelector('.navback')) return;
      if ([].some.call(modal.querySelectorAll('button'), function (b) { return /^\s*←/.test(b.textContent); })) return;
      var t = NAV.stack[NAV.stack.length - 1], b = document.createElement('button'); b.className = 'navback'; b.textContent = '← Назад'; b.title = 'Вернуться в предыдущее окно';
      b.onclick = navBack; mh.insertBefore(b, mh.firstChild);
    }
    function navBack() { var t = NAV.stack.pop(); if (!t) return; NAV.back = true; try { window[t.n].apply(null, t.a); } finally { NAV.back = false; } }
    NAV_VIEW.concat(NAV_FORM).forEach(function (n) {
      var f = window[n]; if (typeof f !== 'function') return;
      var view = NAV_VIEW.indexOf(n) >= 0;
      window[n] = function () {
        if (NAV.depth) return f.apply(this, arguments);
        var me = { n: n, a: Array.prototype.slice.call(arguments), view: view }, wasOpen = ov.classList.contains('on'), r;
        if (!NAV.back) {
          if (!wasOpen) NAV.stack = [];
          else if (NAV.cur && !navSame(NAV.cur, me)) {
            var top = NAV.stack[NAV.stack.length - 1];
            if (top && navSame(top, me)) NAV.stack.pop(); else if (NAV.cur.view) NAV.stack.push(NAV.cur);
            if (NAV.stack.length > 30) NAV.stack.shift();
          }
        }
        NAV.cur = me; NAV.depth = 1;
        try { r = f.apply(this, arguments); } finally { NAV.depth = 0; }
        navBtn();
        return r;
      };
    });
    (function () { var c0 = closeModal; closeModal = function () { NAV.stack = []; NAV.cur = null; return c0.apply(this, arguments); }; })();
