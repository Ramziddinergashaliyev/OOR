/* ===== Ядро расчёта: OOR × TDSheet2 (общий код для страницы и проверки) ===== */
    var EXCL_WH = ['СКЛАД МЕТАЛЛООТХОДОВ №8', 'СКЛАД ТМЦ НЕКОНДИЦИЯ', 'СКЛАД БРАКА'];

    function cleanSp(v) {
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return fmtDateRu(new Date(v.getTime() + 432e5));
      var s = String(v).replace(/ /g, ' ').trim();
      while (s.indexOf('  ') >= 0) s = s.replace(/  /g, ' ');
      return s;
    }
    function normKey(v) { return cleanSp(v).toUpperCase(); }
    function fmtDateRu(d) { return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear(); }
    function numVal(v) {
      if (typeof v === 'number') return isFinite(v) ? v : null;
      if (v === null || v === undefined || v instanceof Date) return null;
      var s = cleanSp(v).replace(/\s/g, '').replace(',', '.');
      return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
    }
    function numLike(v) {
      var n = numVal(v); if (n !== null) return n;
      if (typeof v !== 'string') return null;
      var m = cleanSp(v).replace(/\s/g, '').match(/^-?\d+([.,]\d+)?/);
      return m ? parseFloat(m[0].replace(',', '.')) : null;
    }
    // "dd.mm.yyyy" -> yyyymmdd (число) или null
    function dateNum(s) { var m = cleanSp(s).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]) : null; }
    function colLetter(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }

    /* TDSheet2 -> компактный список строк [название, остаток, мин, склад, № строки] */
    function parseTD2(rows) {
      var list = [], period = '';
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r] || [];
        if (!period) for (var c = 0; c < row.length; c++) { var t = cleanSp(row[c]); if (/^Период/i.test(t)) { var m = t.match(/(\d{1,2}\.\d{1,2}\.\d{4})/); period = m ? m[1] : t.replace(/^Период:\s*/i, ''); } }
        var name = cleanSp(row[1]); if (!name) continue;
        if (/^номенклатура$/i.test(name)) continue;
        list.push([name, numLike(row[6]), numLike(row[7]), cleanSp(row[9]), r + 1]);
      }
      return { period: period, rows: list };
    }
    /* Индекс по точному названию (как LoadTD2ArrVTOV) */
    function indexTD2(td2) {
      var idx = {};
      td2.rows.forEach(function (x) {
        var k = x[0].toUpperCase();
        if (!idx[k]) idx[k] = { name: x[0], rows: [] };
        idx[k].rows.push({ row: x[4], qty: x[1], min: x[2], wh: x[3], excl: EXCL_WH.indexOf(x[3].toUpperCase()) >= 0 });
      });
      td2.idx = idx; return td2;
    }
    function td2Stock(td2, name) {
      var e = td2.idx[normKey(name)];
      if (!e) return { found: false, stock: 0, rows: [] };
      var s = 0, any = false;
      e.rows.forEach(function (x) { if (!x.excl && x.qty !== null) { s += x.qty; any = true; } });
      return { found: any, stock: s, rows: e.rows };
    }

    /* OOR */
    function parseOOR(rows) {
      var hdr = -1, maxC = 0;
      rows.forEach(function (r) { if (r && r.length > maxC) maxC = r.length; });
      for (var r = 0; r < Math.min(10, rows.length) && hdr < 0; r++)
        for (var c = 0; c < maxC; c++) if (cleanSp((rows[r] || [])[c]).toLowerCase().indexOf('кол-во заказано') >= 0) { hdr = r; break; }
      if (hdr < 0) throw new Error('На листе OOR не найдена шапка «Кол-во заказано» в строках 1–10');
      var cell = function (rr, cc) { return cleanSp((rows[rr] || [])[cc]); };
      var orders = [];
      for (var c2 = 0; c2 < maxC; c2++) {
        if (cell(hdr, c2).toLowerCase().indexOf('кол-во заказано') < 0) continue;
        var label = '', num = '', country = '';
        for (var off = 0; off <= 1 && !num; off++)
          for (var rr = 0; rr < hdr; rr++) { var t = cell(rr, c2 + off), m = t.match(/№\s*(\d+)/); if (m) { num = m[1]; label = t; break; } }
        for (var rr2 = 0; rr2 < hdr; rr2++) {
          var t2 = cell(rr2, c2).toUpperCase().replace(/[АКЕОРСТХМНВУ]/g, function (ch) { return 'AKEOPCTXMHBY'['АКЕОРСТХМНВУ'.indexOf(ch)]; });
          var m2 = t2.match(/^([A-Z]{2})(\s*-?\s*\d+.*)?$/); if (m2) { country = m2[1]; break; }
        }
        var o = {
          id: 'c' + c2, col: c2, colLetter: colLetter(c2),
          label: num ? (country ? country + ' №' + num : '№' + num) : (label || 'кол. ' + colLetter(c2)),
          fullLabel: label, client: cell(1, c2), created: cell(0, c2), code: cell(3, c2), due: cell(4, c2), pct: cell(5, c2)
        };
        o.key = [normKey(o.fullLabel || o.label), normKey(o.code), normKey(o.client)].join('|');
        orders.push(o);
      }
      var positions = [], byKey = {}, group = '(без корня)';
      for (var r2 = hdr + 1; r2 < rows.length; r2++) {
        var row = rows[r2] || [];
        var a = cleanSp(row[0]), b = cleanSp(row[1]);
        if (!b) { if (a) group = a; continue; }
        var k = b.toUpperCase(), p = byKey[k];
        if (!p) { p = { id: 'p' + positions.length, key: k, name: b, group: group, rows: [], q: {}, r: {} }; byKey[k] = p; positions.push(p); }
        p.rows.push(r2 + 1);
        orders.forEach(function (o) {
          var q = numVal(row[o.col]), rv = numVal(row[o.col + 1]);
          if (q !== null) p.q[o.id] = (p.q[o.id] || 0) + q;
          if (rv !== null) p.r[o.id] = (p.r[o.id] || 0) + rv;
        });
      }
      return { orders: orders, positions: positions, headerRow: hdr + 1 };
    }

    /* Очередь заказов: 'created' — дата заказа (стр.1 шапки OOR), 'due' — срок (стр.5),
       'col' — порядок колонок OOR. При равной дате — порядок колонок. Без даты — в конец. */
    function orderQueue(orders, mode) {
      var f = mode === 'due' ? 'due' : 'created';
      return orders.slice().sort(function (a, b) {
        if (mode !== 'col') {
          var da = dateNum(a[f]), db = dateNum(b[f]);
          if (da === null) da = 99999999; if (db === null) db = 99999999;
          if (da !== db) return da - db;
        }
        return a.col - b.col;
      });
    }

    /* Ручные правки: ov = {stock:{posKey:число}, q:{posKey§orderKey:число}, r:{...}} */
    function ovKey(p, o) { return p.key + '§' + o.key; }

    /* Расчёт по очереди: нужно = заказано − резерв (≥0); выдано = min(нужно, осталось); не хватает = нужно − выдано */
    function computeAll(oor, td2, queue, ov) {
      ov = ov || { stock: {}, q: {}, r: {} };
      var res = {};
      oor.positions.forEach(function (p) {
        var st = td2Stock(td2, p.name);
        var stockEdited = Object.prototype.hasOwnProperty.call(ov.stock, p.key);
        var stock = stockEdited ? ov.stock[p.key] : st.stock;
        var avail = stock, cells = {}, tq = 0, tr = 0, tn = 0, tg = 0, ts = 0, nOrd = 0, nShort = 0, prevTaken = 0;
        queue.forEach(function (o) {
          var k = ovKey(p, o);
          var qE = Object.prototype.hasOwnProperty.call(ov.q, k), rE = Object.prototype.hasOwnProperty.call(ov.r, k);
          var q = qE ? ov.q[k] : (p.q[o.id] || 0), rv = rE ? ov.r[k] : (p.r[o.id] || 0);
          if (q === 0 && rv === 0 && !qE && !rE) return;
          var need = Math.max(0, q - rv);
          var before = avail, give = Math.min(need, Math.max(0, avail));
          avail -= give;
          var short = need - give;
          cells[o.id] = { q: q, rv: rv, need: need, before: before, give: give, short: short, after: avail, prevTaken: prevTaken, qE: qE, rE: rE, q0: p.q[o.id] || 0, r0: p.r[o.id] || 0 };
          prevTaken += give;
          tq += q; tr += rv; tn += need; tg += give; ts += short; nOrd++; if (short > 0) nShort++;
        });
        res[p.id] = { stockFound: st.found, stock0: st.stock, stock: stock, stockEdited: stockEdited, td2rows: st.rows, cells: cells, tq: tq, tr: tr, tn: tn, tg: tg, ts: ts, after: stock - tg, nOrd: nOrd, nShort: nShort };
      });
      return res;
    }

    /* Справочно: полуфабрикат «-50» того же кода в TDSheet2 */
    function baseCode(name) {
      var m = cleanSp(name).match(/^([A-ZА-Я]{1,3}\s?\d{3,5}[A-ZА-Я]{0,2}(?:\/[0-9A-ZА-Я]+)?)/i);
      return m ? m[1] : '';
    }
    function semiInfo(td2, name) {
      var b = baseCode(name); if (!b) return [];
      var key = b.toUpperCase().replace(/\s+/g, ''), out = [];
      Object.keys(td2.idx).forEach(function (k) {
        var kk = k.replace(/\s+/g, '');
        if (kk.indexOf(key + '-50') === 0 && !/^\d/.test(kk.slice(key.length + 3)) && k !== normKey(name)) {
          var s = td2Stock(td2, td2.idx[k].name);
          out.push({ name: td2.idx[k].name, stock: s.stock, found: s.found });
        }
      });
      return out;
    }


    /* ===== База моделей авто (Cross Codes): код TRT -> машина/модель/годы ===== */
    function mlines(v) { return String(v == null ? '' : v).replace(/ |\t/g, ' ').split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).join('\n').replace(/^\n+|\n+$/g, ''); }
    /* Ищет строку шапки с колонкой TRT-кода и CAR NAME; возвращает {код: запись} */
    function parseModels(rows, src) {
      var hdr = -1, ci = {};
      for (var r = 0; r < Math.min(15, rows.length) && hdr < 0; r++) {
        var row = rows[r] || [], m = {};
        row.forEach(function (v, c) {
          var t = cleanSp(v).toUpperCase().replace(/\s+/g, ' ');
          if (/^TRT (CODE|NO\.?)$/.test(t)) m.code = c;
          else if (t === 'CAR NAME') m.car = c; else if (t === 'MODEL') m.model = c; else if (t === 'YEARS') m.years = c;
          else if (t === 'RUSSIAN NAME') m.ru = c; else if (/^OEM NO/.test(t)) m.oem = c; else if (/^WEIGHT/.test(t)) m.w = c; else if (/^PRICE$/.test(t)) m.price = c;
        });
        if (m.code !== undefined && m.car !== undefined) { hdr = r; ci = m; }
      }
      if (hdr < 0) throw new Error('Не найдена шапка с колонками «TRT CODE/TRT NO.» и «CAR NAME»');
      var out = {}, n = 0;
      for (var r2 = hdr + 1; r2 < rows.length; r2++) {
        var row2 = rows[r2] || [], raw = mlines(row2[ci.code]);
        var code0 = raw.toUpperCase().replace(/ /g, '');
        if (!code0 || !/^[A-Z]{1,3}\d/.test(code0)) continue;
        var g = function (k) { return ci[k] === undefined ? '' : mlines(row2[ci[k]]); };
        var e = {
          src: src, row: r2 + 1, code: raw, car: g('car'), model: g('model'), years: g('years'), ru: g('ru'), oem: g('oem'),
          w: ci.w === undefined ? null : numVal(row2[ci.w]), price: ci.price === undefined ? null : numVal(row2[ci.price])
        };
        code0.split(/[\n,;]+/).forEach(function (c) { if (c && !out[c]) { out[c] = e; n++; } });
      }
      return out;
    }
    /* Код(ы) TRT позиции: из названия ("R 8001 TRT (2шт/48) ВНТ" -> R8001; "RS 7012R/L" -> RS7012R+RS7012L), иначе код группы OOR */
    function modelCodes(p, map) {
      var s = cleanSp(p.name).toUpperCase();
      s = s.replace(/\s+(TRT|RS|KSM)\b.*$/, '').replace(/\s*\(.*$/, '').trim().replace(/-50(\s*S)?$/, '').replace(/\s+S$/, '');
      var ns = s.replace(/\s+/g, '');
      if (map[ns]) return [ns];
      var out = [], prev = '';
      s.split('/').forEach(function (part) {
        var c = part.trim().replace(/\s+/g, '');
        if (/^[A-Z]{1,2}$/.test(c) && prev) c = prev.replace(/[A-Z]{1,2}$/, '') + c;
        if (map[c] && out.indexOf(c) < 0) out.push(c);
        prev = c;
      });
      if (out.length) return out;
      var gk = cleanSp(p.group).toUpperCase().replace(/\s+/g, '');
      return map[gk] ? [gk] : [];
    }
    /* Краткая строка «машины» для колонки: уникальные строки CAR NAME через запятую */
    function carShort(entries) {
      var seen = {}, out = [];
      entries.forEach(function (e) { e.car.split('\n').forEach(function (l) { l = l.trim(); var k = l.toUpperCase(); if (l && !seen[k] && !/^\d+$/.test(l)) { seen[k] = 1; out.push(l); } }); });
      return out.join(', ');
    }

    /* ===== Результаты макроса из книги: листы Order, Расчёт, Обработка ===== */
    function txt(v) { return v === null || v === undefined ? '' : (v instanceof Date ? fmtDateRu(new Date(v.getTime() + 432e5)) : String(v).replace(/ /g, ' ').replace(/\r/g, '').trim()); }
    function parseMacro(orderRows, rasRows, obrRows) {
      var M = { title: '', created: '', items: {} };
      var get = function (k, name) { var key = normKey(name); if (!M.items[key]) M.items[key] = { name: cleanSp(name) }; return M.items[key]; };
      // --- Order: строка 2 = шапка, данные с 3-й
      if (orderRows && orderRows.length > 2) {
        M.title = txt((orderRows[0] || [])[1]);
        var hdr = (orderRows[1] || []).map(txt), ci = {};
        hdr.forEach(function (h, c) {
          var u = h.toUpperCase();
          if (u === 'НАИМЕНОВАНИЕ') ci.name = c; else if (u === 'ЗАКАЗ') ci.qty = c; else if (u.indexOf('ДРУГИЕ ЗАКАЗЫ') === 0) ci.other = c;
          else if (u.indexOf('ГОТОВАЯ') === 0) ci.fg = c; else if (/^50-/.test(u)) ci.semi = c; else if (u === 'СТАТУС') ci.status = c;
          else if (u.indexOf('ДЕТАЛИ (01') === 0) ci.det = c; else if (u === 'ПРИМЕЧАНИЕ') ci.note = c;
          else if (/^0[1-9]-/.test(u)) { (ci.groups = ci.groups || []).push(c); }
        });
        if (ci.name !== undefined) for (var r = 2; r < orderRows.length; r++) {
          var row = orderRows[r] || [], nm = cleanSp(row[ci.name]); if (!nm) continue;
          var it = get('', nm);
          it.order = {
            qty: txt(row[ci.qty]), other: txt(row[ci.other]), fg: txt(row[ci.fg]), semi: txt(row[ci.semi]), status: txt(row[ci.status]), det: txt(row[ci.det]),
            groups: (ci.groups || []).map(function (c) { return { title: hdr[c], text: txt(row[c]) }; })
          };
        }
      }
      // --- Расчёт: блок "N.  Название" ... ИТОГ ... ОСНОВНЫЕ ДЕТАЛИ ...
      if (rasRows) {
        var cur = null, root = null, mode = '';
        M.created = txt((rasRows[0] || [])[0]);
        for (var i = 0; i < rasRows.length; i++) {
          var rw = rasRows[i] || [], b = txt(rw[1]);
          var mh = b.match(/^\d+\.\s+(.+)$/);
          if (mh && (txt(rw[7]) === 'закрыто' || txt(rw[7]) === 'не хватает')) { cur = get('', mh[1]); cur.ras = { status: txt(rw[7]), roots: [], notes: [] }; root = null; mode = ''; continue; }
          if (!cur) continue;
          if (b === 'Сколько товара можно получить') { var v = rasRows[i + 1] || []; cur.ras.fg = numLike(v[1]); cur.ras.semi = numLike(v[3]); cur.ras.prod = numLike(v[5]); cur.ras.total = numLike(v[7]); i++; continue; }
          if (/^готовая продукция$/.test(b)) continue;
          var mr = b.match(/^ОСНОВНЫЕ ДЕТАЛИ (.+)$/); if (mr) { root = { name: mr[1], rows: [], summary: '' }; cur.ras.roots.push(root); mode = 'root'; continue; }
          if (b === 'ДЕРЕВО СТРУКТУРЫ' || b === 'ИТОГ' || b === 'Как считается каждая ветка' || b === 'Сравнение позиций' || b === 'ПОЗИЦИЯ') continue;
          if (mode === 'root' && root) {
            if (/ = свой остаток /.test(b)) { root.summary = b; mode = ''; continue; }
            if (b) root.rows.push({ pos: b, memo: txt(rw[2]), can: numLike(rw[7]) });
            continue;
          }
          if (b) { var m2 = b.match(/Ограничивает выпуск:\s*(.+?)\.(\s|$)/); if (m2) cur.ras.bottle = m2[1]; cur.ras.notes.push(b); }
        }
      }
      // --- Обработка: блок "№ | Название | Остаток", дальше цепочки D/E, F/G, ...
      if (obrRows) {
        var cb = null;
        for (var j = 1; j < obrRows.length; j++) {
          var o = obrRows[j] || [], a = txt(o[0]), nm2 = cleanSp(o[1]);
          if (a && nm2 && /^\d+$/.test(a)) { cb = get('', nm2); cb.obr = { row: j + 1, fg: txt(o[2]), qty: '', lines: [] }; continue; }
          if (!cb) continue;
          if (nm2 === 'Количество заказов') { cb.obr.qty = txt(o[2]); continue; }
          var cells = [], any = false;
          for (var c2 = 3; c2 < Math.max(o.length, 4); c2 += 2) { var n0 = txt(o[c2]), v0 = txt(o[c2 + 1]); cells.push([n0, v0]); if (n0 || v0) any = true; }
          while (cells.length && !cells[cells.length - 1][0] && !cells[cells.length - 1][1]) cells.pop();
          if (any) cb.obr.lines.push({ row: j + 1, cells: cells });
        }
      }
      return M;
    }
    /* Анализ макроса для позиции: своя запись, иначе — позиция той же группы OOR (общий полуфабрикат) */
    function macroFor(M, oor, p) {
      if (!M) return null;
      var own = M.items[p.key]; if (own && (own.ras || own.order || own.obr)) return { it: own, via: null };
      var bc = baseCode(p.name).replace(/\s+/g, '').toUpperCase();
      var sib = p.group === '(без корня)' || !bc ? null : oor.positions.filter(function (x) { return x.group === p.group && x !== p && baseCode(x.name).replace(/\s+/g, '').toUpperCase() === bc && M.items[x.key] && M.items[x.key].ras; })[0];
      return sib ? { it: M.items[sib.key], via: sib.name } : null;
    }


    /* ===== Обработка в программе: дерево из TDSheet, остатки TDSheet2, база кг/шт (как в макросе) ===== */
    function engNorm(s) { return cleanSp(s).toUpperCase(); }
    function kgKey(s) { var t = cleanSp(s).toUpperCase().replace(/Х/g, 'X').replace(/ /g, ''); while (t.slice(-1) === '.') t = t.slice(0, -1); return t; }
    function ctryKey(s) { return cleanSp(s).toUpperCase().replace(/ /g, '').replace(/[АКЕОРСТХМНВУ]/g, function (c) { return 'AKEOPCTXMHBY'['АКЕОРСТХМНВУ'.indexOf(c)]; }); }
    function isComp(s) { return /^[A-Za-zА-Яа-я]{1,4}\s?\d/.test(cleanSp(s)); }
    function isNRKgCode(s) { var t = ctryKey(s); if (t === 'NR1019-A2') return false; return /^(NR|CR)\d{3,5}-[ASC]\d{1,2}$/i.test(t); }
    function isRaw(s) { s = cleanSp(s); if (isNRKgCode(s)) return true; if (s.slice(0, 2).toUpperCase() === 'SR') return true; return !isComp(s); }
    function isSemi50(s) { return /-50\s*S?(\s|$|\))/i.test(cleanSp(s)); }
    function posKey(nm) {
      var s = engNorm(nm); if (/ [MS]$/.test(s)) s = cleanSp(s.slice(0, -2));
      if (isRaw(nm)) return 'MAT|' + s;
      var m = s.match(/^(.*?-\s*(?:[A-Z]{1,2}\d+|\d+))/i); return m ? cleanSp(m[1]) : s;
    }
    function baseProductCode(name) {
      var s = cleanSp(name); if (!s) return '';
      var m = s.match(/^(\S+\s+\d+(?:-\d+)?\s?(?:FL|FR|F|R|L)?)/i); if (m) return cleanSp(m[1]);
      m = s.match(/^(\S*\d+)/); if (m) return cleanSp(m[1]);
      var p = s.split(' '); return p.length > 1 ? p[0] + ' ' + p[1] : p[0];
    }
    var KIT_NORM = [["RS 7007", "RS 7007-30/50", 1], ["RS 7007", "RS 7007L-20/50", 1], ["RS 7007", "RS 7007R-20/50", 1], ["RS 7007", "RS 7007-10/50", 2], ["NR 1145", "NR 1042-50", 2], ["NR 1145", "NR 1043-50", 2], ["NR 1145", "NR 1044-50", 2], ["NR 1145", "NR 1045-50", 6], ["NR 1019", "NR 1019/1-50", 1], ["NR 1019", "NR 1020-50", 1], ["NR 1046/NR 1047", "NR 1046-50", 4], ["NR 1046/NR 1047", "NR 1047-50", 4], ["NR 1048/NR 1049", "NR 1048-50", 6], ["NR 1048/NR 1049", "NR 1049-50", 4], ["NR 1122", "NR 1015-50", 4], ["NR 1122", "NR 1016-50", 2], ["NR 1122", "NBR 1903-50", 2], ["NR 1127", "NR 1027-50", 4], ["NR 1127", "NBR 1904-50", 2], ["NR 1126", "NR 1025-50", 2], ["NR 1126", "NR 1026-50", 4], ["RS 7016", "RS 7007-10/50", 2], ["RS 7016", "RS 7016-20/50", 2], ["RS 7016", "RS 7016-30/50", 1], ["RS 7017", "RS 7016-30/50", 1], ["RS 7017", "RS 7017-20/50", 1], ["RS 7017", "RS 7017-21/50", 1], ["RS 7017", "RS 7007-10/50", 2]];

    /* TDSheet: заголовок блока в A, дочерние позиции в B */
    function parseTDS(rows, stockCol) {
      var hdr = {}, cur = null, st = {};
      hdr.__stock = st;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r] || [], a = cleanSp(row[0]), b = cleanSp(row[1]);
        var sv = stockCol === undefined ? null : numLike(row[stockCol]);
        if (a) { var k = a.toUpperCase(); cur = hdr[k] || (hdr[k] = { name: a, kids: [], row: r + 1 }); if (sv !== null && st[k] === undefined) st[k] = sv; continue; }
        if (b) { if (sv !== null && st[b.toUpperCase()] === undefined) st[b.toUpperCase()] = sv; if (cur && cur.kids.indexOf(b) < 0) cur.kids.push(b); }
      }
      return hdr;
    }
    function makeEngine(tds, td2, kgdb, nepStock, tdsStock, matRef) {
      nepStock = nepStock || {}; tdsStock = tdsStock || {}; matRef = matRef || {};
      var KG = kgdb.kg, BUSH = kgdb.bush, prodKeys = {}, SPECKG = {}, UKG = kgdb.ukg || null;
      var sk = function (t) { return cleanSp(t).toUpperCase().replace(/\s+/g, ''); };
      /* проверенный состав (пользователь): деталь -> материал, кг на 1 шт — важнее базы кг/шт */
      Object.keys(kgdb.spec || {}).forEach(function (p) { (kgdb.spec[p].kids || []).forEach(function (c) { if (c[2] === 'кг') SPECKG[sk(p) + '|' + sk(c[0])] = c[1]; }); });
      Object.keys(KG).forEach(function (k) { prodKeys[k.split('|')[0]] = 1; });
      var PK = Object.keys(prodKeys).sort(function (a, b) { return b.length - a.length; });
      var avg = 0, n = 0; for (var k in KG) { avg += KG[k]; n++; } avg = n ? avg / n : 0.1036;
      var byPrefix = null;
      function stockRaw(name) {
        var s = td2Stock(td2, name); if (s.found) return s.stock;
        var k = engNorm(name);
        if (nepStock[k] !== undefined && nepStock[k] !== null) return nepStock[k];
        if (tdsStock[k] !== undefined && tdsStock[k] !== null) return tdsStock[k];
        return null;
      }
      function stock(name) {
        var v = stockRaw(name);
        if ((v === null || v === 0) && / P$/i.test(cleanSp(name))) { var d = stockRaw(cleanSp(name).replace(/ P$/i, ' D')); if (d) return { v: d, note: '(D)' }; }
        return { v: v === null ? 0 : v, note: v === null ? 'нет' : '' };
      }
      function exists(name) { var k = engNorm(name); return !!(td2.idx[k] || tds[k] || nepStock[k] !== undefined || tdsStock[k] !== undefined); }
      function detNormKey(t) { t = cleanSp(t).toUpperCase(); var p = t.indexOf(' TRT'); if (p > 0) t = t.slice(0, p); var ch; do { ch = false; if (/ GM$/.test(t)) { t = t.slice(0, -3); ch = true; } if (/ [MSPD]$/.test(t)) { t = t.slice(0, -2); ch = true; } } while (ch); return ctryKey(t); }
      function kgPerPc(order, material, raw) {
        if (UKG && cleanSp(material) && cleanSp(raw)) { var uv = UKG[sk(material) + '|' + sk(raw)]; if (uv > 0) return { v: uv, exact: true, user: true }; }
        if (cleanSp(material) && cleanSp(raw)) { var sv = SPECKG[sk(material) + '|' + sk(raw)]; if (sv > 0) return { v: sv, exact: true, spec: true }; }
        var fam = cleanSp(raw) || cleanSp(material);
        if (isNRKgCode(fam)) { var fk = fam.toUpperCase().replace(/\s/g, ''); return BUSH[fk] ? { v: BUSH[fk][1], exact: true } : { v: 0, exact: false }; }
        if (cleanSp(material)) { var dk = detNormKey(material); if (matRef[dk] > 0) return { v: matRef[dk], exact: true }; }
        var mu = cleanSp(material).toUpperCase().replace(/Х/g, 'X');
        if (/БЕСШОВНАЯ ТРУБА/.test(mu) && /61,5X57,5/.test(mu)) return { v: 0.085, exact: true };
        if (/БЕСШОВНАЯ ТРУБА/.test(mu) && /22X12,3/.test(mu)) return { v: 0.105, exact: true };
        var core = cleanSp(material).replace(/\s*\(.*$/, '');
        if (kgKey(core) === 'R9005-01/01') return { v: /СТ\s?\.?45/i.test(raw) ? 0.256 : 0.245, exact: true };
        if (kgKey(core) === 'RS8014-01/01') { if (/[DД]=29/i.test(raw)) return { v: 0.385, exact: true }; if (/[DД]=38/i.test(raw)) return { v: 0.38, exact: true }; }
        var det = kgKey(material), base = kgKey(baseProductCode(order)), ord = kgKey(order);
        if (base && ord.length > base.length + 1 && ord.indexOf(base) === 0 && ord.charAt(base.length) === '/') {
          var p = base.length + 1; while (p < ord.length && /\d/.test(ord.charAt(p))) p++;
          if (p > base.length + 1 && KG[ord.slice(0, p) + '|' + det]) return { v: KG[ord.slice(0, p) + '|' + det], exact: true };
        }
        if (KG[base + '|' + det]) return { v: KG[base + '|' + det], exact: true };
        for (var i = 0; i < PK.length; i++) if (ord.indexOf(PK[i]) === 0 && KG[PK[i] + '|' + det]) return { v: KG[PK[i] + '|' + det], exact: true };
        var sb = kgKey(baseProductCode(material)); if (sb && sb !== base && KG[sb + '|' + det]) return { v: KG[sb + '|' + det], exact: true };
        var dp = core.indexOf('-'); if (dp > 0) { var ss = kgKey(core.slice(0, dp)); if (ss && ss !== base && ss !== sb && KG[ss + '|' + det]) return { v: KG[ss + '|' + det], exact: true }; }
        var bm = cleanSp(material).toUpperCase().match(/^NR\s*(\d+)\s*-\s*(S\d+)/); if (bm) { var bk = 'NR' + bm[1] + '-' + bm[2]; if (BUSH[bk] && BUSH[bk][1] > 0) return { v: BUSH[bk][1], exact: true }; }
        var bc = baseProductCode(order).toUpperCase();
        if (/NR 1001/.test(bc)) return { v: 0.0136, exact: true }; if (/NR 1053/.test(bc)) return { v: 0.0358, exact: true };
        if (/RB 1902/.test(bc)) return { v: 0.0575, exact: true }; if (/CR 1703/.test(bc)) return { v: 0.0675, exact: true }; if (/CR 1704/.test(bc)) return { v: 0.095, exact: true };
        return { v: avg, exact: false };
      }
      /* цепочка под-деталей: свой остаток + остатки всех звеньев + материал в шт */
      function chain(order, name, seen) {
        var h = tds[engNorm(name)], links = [], sum = 0;
        if (!h) return { sum: 0, links: links };
        h.kids.forEach(function (kid) {
          var kk = engNorm(kid); if (seen[kk]) return; seen[kk] = 1;
          if (isRaw(kid)) {
            if (/^(СОЛИДОЛ|ЛИТОЛ|СМАЗКА)/i.test(kid)) return;
            var kg = stock(kid).v, c = kgPerPc(order, name, kid), pcs = kg > 0 && c.v > 0 ? kg / c.v : 0;
            links.push({ name: kid, kg: kg, kgpc: c.v, exact: c.exact, pcs: pcs, mat: true }); sum += pcs;
          } else {
            var st = stock(kid), sub = chain(order, kid, seen);
            links.push({ name: kid, stock: st.v, note: st.note }); sum += st.v;
            links = links.concat(sub.links); sum += sub.sum;
          }
        });
        return { sum: sum, links: links };
      }
      function variantsOf(name) {
        var s = cleanSp(name), base = s.replace(/ (M|S|GM)$/i, ''), out = [s];
        [base, base + ' M', base + ' S'].forEach(function (v) { if (out.map(engNorm).indexOf(engNorm(v)) < 0 && exists(v)) out.push(v); });
        var cr = base.match(/^(.*-04)\s*CR-\S+$/i);
        if (cr) {
          var pre = engNorm(cr[1]);
          Object.keys(td2.idx).forEach(function (k) { if (k.indexOf(pre) === 0 && /^\s*CR-/.test(k.slice(pre.length)) && out.map(engNorm).indexOf(k) < 0) out.push(td2.idx[k].name); });
        }
        return out;
      }
      function evalRoot(order, semi, depth) {
        var own = stock(semi).v, extra = [];
        var sv = / S$/i.test(cleanSp(semi)) ? cleanSp(semi).replace(/ S$/i, '') : cleanSp(semi) + ' S';
        if (isSemi50(sv) && exists(sv)) { var x = stock(sv).v; own += x; extra.push(sv + ' ' + x); }
        var h = tds[engNorm(semi)] || tds[engNorm(sv)], kids = h ? h.kids.filter(function (k) { return isComp(k) || /^SR/i.test(k); }) : [];
        var pos = {}, order_ = [], seen = {};
        kids.forEach(function (kid) {
          if (isSemi50(kid) && depth < 4 && engNorm(kid) !== engNorm(semi)) {
            var sub = evalRoot(order, kid, depth + 1), pk0 = posKey(kid);
            if (!pos[pk0]) { pos[pk0] = { key: pk0, items: [], sum: 0 }; order_.push(pk0); }
            if (!seen[engNorm(kid)]) { seen[engNorm(kid)] = 1; pos[pk0].items.push({ name: kid, value: sub.value, own: sub.own, sub: sub }); pos[pk0].sum += sub.value; }
            return;
          }
          if (isRaw(kid)) {
            var kg = stock(kid).v, c = kgPerPc(order, semi, kid), pcs = kg > 0 && c.v > 0 ? Math.floor(kg / c.v) : 0, pkm = 'MAT|' + engNorm(kid);
            if (!pos[pkm]) { pos[pkm] = { key: pkm, items: [], sum: 0 }; order_.push(pkm); }
            if (!seen[engNorm(kid)]) { seen[engNorm(kid)] = 1; pos[pkm].items.push({ name: kid, value: pcs, kg: kg, kgpc: c.v, exact: c.exact, mat: true }); pos[pkm].sum += pcs; }
            return;
          }
          variantsOf(kid).forEach(function (v) {
            var ek = engNorm(v); if (seen[ek]) return; seen[ek] = 1;
            var pk = posKey(v), st = stock(v), ch = chain(order, v, {});
            if (!pos[pk]) { pos[pk] = { key: pk, items: [], sum: 0 }; order_.push(pk); }
            var val = st.v + ch.sum;
            pos[pk].items.push({ name: v, own: st.v, note: st.note, chain: ch.links, value: val }); pos[pk].sum += val;
          });
        });
        var min = null, minK = '';
        order_.forEach(function (k) { if (min === null || pos[k].sum < min) { min = pos[k].sum; minK = k; } });
        return { name: semi, own: own, extra: extra, positions: order_.map(function (k) { return pos[k]; }), minKey: minK, min: min === null ? 0 : min, value: own + (min === null ? 0 : min) };
      }
      function analyze(product) {
        var name = cleanSp(product), fg = isSemi50(name) ? 0 : stock(name).v, h = tds[engNorm(name)];
        var semis = h ? h.kids.filter(function (k) { return isComp(k) && isSemi50(k); }) : [];
        if (!semis.length && !isSemi50(name)) {
          var sfx = / S$/i.test(name) ? [' S', ''] : ['', ' S'], bases = [baseProductCode(name)];
          var bc1 = baseCode(name); if (bc1 && bases.indexOf(bc1) < 0) bases.push(bc1);
          bases.forEach(function (bc0) { sfx.forEach(function (x) { var c = bc0 + '-50' + x; if (!semis.length && (tds[engNorm(c)] || exists(c))) semis = [c]; }); });
        }
        if (!h && !semis.length && !(isSemi50(name) && exists(name))) return { found: false, name: name, fg: fg };
        var roots;
        if (semis.length) roots = semis.map(function (s) { return evalRoot(name, s, 0); });
        else if (isSemi50(name)) roots = [evalRoot(name, name, 0)];
        else { var r0 = evalRoot(name, name, 0); r0.own = 0; r0.value = r0.min; roots = [r0]; }
        var total = null, worst = null, pk = kgKey(baseProductCode(name));
        roots.forEach(function (r) {
          var kn = 1; KIT_NORM.forEach(function (x) { if (kgKey(x[0]) === kgKey(baseProductCode(name)) || cleanSp(name).toUpperCase().indexOf(x[0]) === 0) { if (kgKey(x[1]) === kgKey(r.name)) kn = x[2]; } });
          r.kitNorm = kn; r.kits = Math.floor(r.value / kn);
          if (total === null || r.kits < total) { total = r.kits; worst = r; }
        });
        var semiOwn = semis.length === 1 ? roots[0].own : 0;
        var bottle = '';
        if (worst && worst.minKey) { var p0 = worst.positions.filter(function (p) { return p.key === worst.minKey; })[0]; bottle = p0.items.map(function (i) { return i.name; }).join(' + ') + ' - ' + Math.floor(p0.sum).toLocaleString('ru-RU') + ' шт'; }
        return { found: true, name: name, fg: fg, roots: roots, tree: total, semi: semiOwn, prod: Math.max(0, total - semiOwn), total: fg + total, bottle: bottle };
      }
      return { analyze: analyze, kgPerPc: kgPerPc };
    }
    /* Компактная структура для хранения: заголовки TDSheet/NEP, их остатки и «База пыльник» */
    function buildStruct(tdsRows, nepRows, bpRows) {
      var a = parseTDS(tdsRows, 4), b = parseTDS(nepRows, 2), out = { tds: {}, nep: {}, tdsSt: a.__stock, nepSt: b.__stock, matRef: { 'RS8007-04': 0.01045 } };
      delete a.__stock; delete b.__stock;
      Object.keys(a).forEach(function (k) { out.tds[k] = [a[k].name, a[k].kids]; });
      Object.keys(b).forEach(function (k) { out.nep[k] = [b[k].name, b[k].kids]; });
      (bpRows || []).forEach(function (r) { var nm = cleanSp(r[0]), c = numVal(r[2]); if (nm && c > 0) { var t = nm.toUpperCase(), p = t.indexOf(' TRT'); if (p > 0) t = t.slice(0, p); out.matRef[ctryKey(t)] = c; } });
      return out;
    }

    /* Сырые строки листов для построителя блока (как читает макрос): TDSheet [A,B,E,C,D] (C - кол-во заказано, D - кол-во состав), NEP [A,B,C], База пыльник [A,B,C] */
    function trimRow(r) { var o = r.slice(); while (o.length && (o[o.length - 1] === null || o[o.length - 1] === undefined || o[o.length - 1] === '')) o.pop(); return o; }
    function buildStructRaw(tdsRows, nepRows, bpRows) {
      var cut = function (rows, cols) { var out = (rows || []).map(function (r) { r = r || []; return trimRow(cols.map(function (c) { var v = r[c]; return v instanceof Date ? cleanSp(v) : (v === undefined ? null : v); })); }); while (out.length && !out[out.length - 1].length) out.pop(); return out; };
      return { raw: { td: cut(tdsRows, [0, 1, 4, 2, 3]), nep: cut(nepRows, [0, 1, 2]), bp: cut(bpRows, [0, 1, 2]) } };
    }
    /* Из сырых строк -> структура для движка (tds/nep/остатки/кг-шт) + справочник материалов пыльников */
    function expandStruct(S) {
      if (!S || !S.raw) return S;
      var a = parseTDS(S.raw.td, 2), b = parseTDS(S.raw.nep, 2), out = { tds: {}, nep: {}, tdsSt: a.__stock, nepSt: b.__stock, matRef: { 'RS8007-04': 0.01045 }, matRef2: { 'RS8007-04': ['Термопластик полиуретан (TPU)', 0.01045] }, raw: S.raw };
      delete a.__stock; delete b.__stock;
      Object.keys(a).forEach(function (k) { out.tds[k] = [a[k].name, a[k].kids]; });
      Object.keys(b).forEach(function (k) { out.nep[k] = [b[k].name, b[k].kids]; });
      (S.raw.bp || []).forEach(function (r) {
        var nm = cleanSp(r[0]), mat = cleanSp(r[1]), c = typeof r[2] === 'number' ? r[2] : (/^[0-9]/.test(cleanSp(r[2])) ? parseFloat(cleanSp(r[2]).replace(/ /g, '').replace(',', '.')) : 0);
        if (nm && c > 0) { var t = nm.toUpperCase(), p = t.indexOf(' TRT'); if (p > 0) t = t.slice(0, p); out.matRef[ctryKey(t)] = c; }
        if (nm && mat && c > 0) out.matRef2[detailNormKey(nm)] = [mat, c];
      });
      return out;
    }


    /* ===== Порт расчёта Обработки: ComputeTreeProducibleVTOV + ResolveNRRowChain (по блоку строк) ===== */
    var TRASH = ["Гофрокороб", "Стикер", "Руководство", "Скотч", "Пакет", "Коробка", "Инструкция", "Пленка", "Плёнка", "Солидол", "Литол",
      "Болт", "Гайка", "Метиз", "Метизов", "Заклепка", "Заклёпка", "Стопорное кольцо", "Стопор", "Хемосил", "Шайба", "Вкладыш", "Грунт", "Эмаль", "Краска",
      "Кольцо метал. 32х26х3", "Кольцо N15", "Кольцо метал. 32х26х3 TRT", "Кольцо метал", "Гофролист", "Кольцо N12", "Кольцо N21", "Кольцо", "NR 1056 K", "NR 1056 К", "NR 1057 K", "NR 1057 К",
      "Хомут рулевой тяги 2101", "Трубка рулевой тяги 2101", "Шплинт d3х45", "Этилацетат", "Ортоксилол", "Масленка M6A", "Подшипник (метал.) 6202 Z",
      "Термопластик полиуретан (TPU)", "Сварочная проволока СВ-08Г2С d=1,2mm"];
    function trashNorm(s) { s = cleanSp(s).toUpperCase().replace(/[,.;:()\/\\-]/g, ' '); while (s.indexOf('  ') >= 0) s = s.replace(/  /g, ' '); return s.trim(); }
    var TRASH_N = TRASH.map(function (t) { return ' ' + trashNorm(t) + ' '; });
    function isValidSemi(name) {
      var n = ' ' + trashNorm(name) + ' ';
      for (var i = 0; i < TRASH_N.length; i++) if (n.indexOf(TRASH_N[i]) >= 0) return false;
      if (/^(NR|CR|NBR|RB)\s*\d+\s*[KК](\s|\(|$)/i.test(cleanSp(name))) return false;
      if (/муштук|муштум/i.test(name)) return false;
      return true;
    }
    function isPcsNote(s) { var t = cleanSp(s); return t.charAt(0) === '(' && t.slice(-1) === ')' && t.toUpperCase().indexOf(' ШТ') > 0; }
    function numLikeV(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return v; var s = cleanSp(String(v)); var m = s.match(/^-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; }
    function isWaste(v) { return typeof v === 'string' && /\(Отход\)/i.test(v); }
    function nrFamilyKey(s) { s = cleanSp(s); if (/ [MS]$/i.test(s)) s = cleanSp(s.slice(0, -2)); var p = s.lastIndexOf('/'); return (p > 0 ? cleanSp(s.slice(0, p)) : s).toUpperCase(); }
    function shortFamilyLabel(rowD, order) {
      var fam = nrFamilyKey(rowD), base = cleanSp(baseProductCode(order)).toUpperCase();
      if (base && fam.indexOf(base) !== 0) {
        var head = cleanSp(order).toUpperCase(); if (head.indexOf('(') >= 0) head = head.slice(0, head.indexOf('('));
        if (head.indexOf('/') >= 0) { var re = /([A-Z]{1,4})\s*(\d{3,5})/g, m; while ((m = re.exec(head))) { var kc = m[1] + ' ' + m[2]; if (fam.indexOf(kc) === 0) { base = kc; break; } } }
      }
      if (base && fam.indexOf(base) === 0) { var sp = cleanSp(fam.slice(base.length)); if (sp.charAt(0) === '-') sp = cleanSp(sp.slice(1)); if (sp && !/[^0-9]/.test(sp)) return fam; if (sp) return sp; return fam; }
      return fam;
    }
    function isMetalAluLbl(l) { var t = cleanSp(l).toUpperCase(); return /^[SA]\d/.test(t) && t.length <= 3; }
    function kitNormKey(t) { t = ctryKey(t); var p = t.toUpperCase().indexOf('TRT'); if (p > 0) t = t.slice(0, p); while (t.length > 1 && t.slice(-1) === 'S' && /\d/.test(t.charAt(t.length - 2))) t = t.slice(0, -1); return t; }
    var DETAIL_NORM = [["RS 7007-30/50", "RS 7007-30-01/13", 1], ["RS 7007-30/50", "RS 7007-02/03", 2], ["RS 7007-30/50", "R 8003-03", 2], ["RS 7007-30/50", "RS 7008-04", 2], ["RS 7007-30/50", "RS 7007-06/13", 2],
    ["RS 7007L-20/50", "RS 7007L-20-01/13", 1], ["RS 7007L-20/50", "RS 7007-02/03", 1], ["RS 7007L-20/50", "R 8003-03", 1], ["RS 7007L-20/50", "RS 7008-04", 1], ["RS 7007L-20/50", "RS 7007-06/13", 1],
    ["RS 7007R-20/50", "RS 7007R-20-01/13", 1], ["RS 7007R-20/50", "RS 7007-02/03", 1], ["RS 7007R-20/50", "R 8003-03", 1], ["RS 7007R-20/50", "RS 7008-04", 1], ["RS 7007R-20/50", "RS 7007-06/13", 1],
    ["RS 7007-10/50", "RS 7007-10-01/13", 1], ["RS 7007-10/50", "RS 7007-02/03", 1], ["RS 7007-10/50", "R 8003-03", 1], ["RS 7007-10/50", "RS 7008-04", 1], ["RS 7007-10/50", "RS 7007-06/13", 1],
    ["RS 7016-30/50", "RS 7016-30-01/13", 1], ["RS 7016-30/50", "RS 7007-02/03", 2], ["RS 7016-30/50", "R 8003-03", 2], ["RS 7016-30/50", "RS 7008-04", 2], ["RS 7016-30/50", "RS 7007-06/13", 2]];
    function detailNormKey(t) { t = cleanSp(t).toUpperCase(); var p = t.indexOf(' TRT'); if (p > 0) t = t.slice(0, p); var ch; do { ch = false; if (/ GM$/.test(t)) { t = t.slice(0, -3); ch = true; } if (/ [MSPD]$/.test(t)) { t = t.slice(0, -2); ch = true; } } while (ch); return ctryKey(t); }
    var DNORM = {}; DETAIL_NORM.forEach(function (x) { DNORM[kitNormKey(x[0]) + '|' + detailNormKey(x[1])] = x[2]; });
    /* расход детали на 1 полуфабрикат — как в макросе v372_4 (24.11.2026, SemiDetailNormVTOV / StabLinkGroupNormVTOV):
       правка пользователя > стойка стабилизатора R/RS 4XXX: 02-палец, 03-сухарь, 04-пыльник, 06-пятак — по 2 шт, 01-корпус — 1 шт > таблица норм > 1 */
    var BOM_OV = {}, DIS_NORM = {}, ORD_NORM = { C: {}, D: {}, G4: {} };
    function isStabCode(t) { return /^RS?\s?[34]\d{3}/i.test(cleanSp(t)); }
    function isStab4(t) { return /^RS?\s?4\d{3}/i.test(cleanSp(t)); }
    function is06(t) { return /\d-06(\/\d+)?(\s|$)/.test(cleanSp(t).toUpperCase()); }
    function detGrp(nm) { var re = /-(\d{2})(?=[\/\s-]|$)/g, m, last = ''; nm = cleanSp(nm).toUpperCase(); while ((m = re.exec(nm))) if (/^0[1-6]$/.test(m[1])) last = m[1]; return last; }
    function disKey(semi) { var t = cleanSp(semi).toUpperCase(), m = t.match(/^(.+?)-50(\s|$)/); return m ? m[1].replace(/\s+/g, '') : ''; }
    function stab4Norm(g) { return g === '02' || g === '03' || g === '04' || g === '06' ? 2 : 1; }
    function detNorm(semi, det) {
      var k = kitNormKey(semi) + '|' + detailNormKey(det);
      if (BOM_OV[k] > 0) return BOM_OV[k];
      if (isStab4(semi)) { var g = detGrp(det); if (g) return stab4Norm(g); }
      if (DNORM[k] > 0) return DNORM[k];
      return 1;
    }
    var KNORM = {}; KIT_NORM.forEach(function (x) { KNORM[kitNormKey(x[0]) + '|' + kitNormKey(x[1])] = x[2]; });
    function kitNormOf(order, semi) { var k = kitNormKey(order) + '|' + kitNormKey(semi); return (typeof BOM_OV !== 'undefined' && BOM_OV['S|' + k]) || KNORM[k] || 1; }
    function colorClass(c) {
      switch (c) {
        case 'FFFFFF00': return 'Y'; case 'FF9BC2E6': case 'FFBDD7EE': return 'B'; case 'FFDDEBF7': return 'BL';
        case 'FFF4B183': case 'FFFFC000': return 'O6'; case 'FFF8CBAD': return 'O8'; case 'FFBFBFBF': return 'YA'; case 'FFFFC7CE': return 'X';
        default: return 'W';
      }
    }
    /* Одна строка блока: цепочка D,F,H,... (имя) / E,G,I,... (значение) */
    function resolveChain(cells, order, kgPerPc, startIdx) {
      var col = startIdx === undefined ? 3 : startIdx, prev = '', links = [], own = null, first = null, best = -1, idx = 0;
      while (col < cells.length && col <= 59) {
        var nm = cleanSp(cells[col]); if (!nm || isPcsNote(nm)) break;
        idx++;
        var raw = cells[col + 1], v = numLikeV(raw);
        if (v !== null) {
          var mat = isRawName(nm), disp = v, kp = null;
          if (mat) { kp = kgPerPc(order, prev, nm); disp = kp.v > 0 ? v / kp.v : v; }
          var w = isWaste(raw), cnt = w ? 0 : disp;
          if (first === null) first = { v: disp, w: w };
          if (own === null) own = w ? 0 : disp;
          var key = nm.toUpperCase().replace(/К/g, 'K'), dup = null;
          for (var i = 0; i < links.length; i++) if (links[i].key === key) { dup = links[i]; break; }
          if (dup) { dup.val += disp; dup.cnt += cnt; } else links.push({ key: key, name: nm, val: disp, cnt: cnt, mat: mat, kg: mat ? v : null, kgpc: kp ? kp.v : null, exact: kp ? kp.exact : null, prev: prev });
          if (/^SR/i.test(nm) && disp > 0 && !w) return { val: disp, own: own === null ? 0 : own, links: links, used: [links[links.length - 1]], sr: true };
          if (!w && disp > best) best = disp;
        }
        prev = nm; col += 2;
      }
      var sum = 0, used = [], firstDet = -1, nz = false;
      links.forEach(function (l, i) { if (!l.mat) { if (firstDet < 0) firstDet = i; if (l.val > 0) nz = true; } });
      links.forEach(function (l, i) { var inc = l.mat ? true : (nz ? l.val > 0 : i === firstDet); if (inc) { sum += l.cnt; used.push(l); } });
      var fin;
      if (used.length && sum > best) fin = sum; else if (best >= 0) fin = best; else fin = first ? (first.w ? 0 : first.v) : 0;
      return { val: fin, own: own === null ? 0 : own, links: links, used: used };
    }
    function isRawName(s) { s = cleanSp(s); if (isNRKgCode(s)) return true; if (s.slice(0, 2).toUpperCase() === 'SR') return true; return !isComp(s); }
    function treePosKey(nm) {
      var s = cleanSp(nm).toUpperCase(); if (/ [MS]$/.test(s)) s = cleanSp(s.slice(0, -2));
      if (isRawName(nm)) return 'MAT|' + s;
      var m = s.match(/^(.*?-\s*(?:[A-Z]{1,2}\d+|\d+))/i); return m ? cleanSp(m[1]) : s;
    }
    /* blk: [{row, v:[...], cls}] — строки блока (от первой строки после «Количество заказов»), order — имя заказа */
    function computeTree(blk, order, kgPerPc) {
      var it = [];
      blk.forEach(function (r, ri) {
        var d = cleanSp(r.v[3]);
        if (d && !isRawName(d) && !isValidSemi(d)) d = '';
        if (d && d !== '-' && d !== 'НЕ НАЙДЕНО' && !isPcsNote(d)) { var cc = r.cls; if (cc !== 'X') it.push({ nm: d, ri: ri, cls: cc, pk: treePosKey(d), par: 0, cont: false, vl: 0, own: 0, addOwn: 0, ya: [] }); }
      });
      var n = it.length; if (!n) return null;
      var curRoot = -1, lastL1 = -1, lastO6 = -1, curCont = -1, k, j;
      for (k = 0; k < n; k++) {
        var x = it[k]; x.par = -1;
        switch (x.cls) {
          case 'Y': curRoot = k; x.cont = true; lastL1 = -1; lastO6 = -1; curCont = -1; break;
          case 'YA':
            if (curRoot >= 0) { x.par = -2; var yv = numLikeV(blk[x.ri].v[4]); if (yv !== null) it[curRoot].addOwn += yv; it[curRoot].ya.push(x.nm); lastL1 = -1; lastO6 = -1; curCont = -1; }
            else { x.cls = 'Y'; curRoot = k; x.cont = true; lastL1 = -1; lastO6 = -1; curCont = -1; }
            break;
          case 'B': x.par = curRoot; lastL1 = k; lastO6 = -1; curCont = -1; break;
          case 'O6':
            if (lastL1 >= 0 && lastO6 < 0) x.par = it[lastL1].pk !== x.pk ? lastL1 : curRoot;
            else if (lastO6 >= 0) x.par = it[lastO6].par; else x.par = curRoot;
            lastO6 = k; break;
          case 'O8':
            if (lastO6 >= 0) x.par = lastO6; else if (lastL1 >= 0) { x.par = lastL1; curCont = lastL1; } else x.par = curRoot;
            break;
          default:
            var alt = -1, low = lastL1 >= 0 ? lastL1 : curRoot + 1;
            for (j = k - 1; j >= low; j--) if (j > curRoot && it[j].pk === x.pk) { alt = j; break; }
            if (alt >= 0) x.par = it[alt].par;
            else if (lastO6 >= 0) x.par = lastO6;
            else if (curCont >= 0) x.par = curCont;
            else if (lastL1 >= 0 && it[lastL1].pk !== x.pk) { x.par = lastL1; curCont = lastL1; }
            else x.par = curRoot;
        }
        if (x.par >= 0) it[x.par].cont = true;
      }
      if (curRoot < 0) return null;
      var bEnd = blk.length - 1;
      /* (25.11.2026) общая деталь у нескольких полуфабрикатов комплекта (RS 7007: пыльник в -30, L-20, R-20, -10):
         1) остаток с цепочкой (в т. ч. выпуск из материала, напр. TPU) берётся у той строки, где цепочка полнее — одинаково для всех мест;
         2) делится не поровну, а по расходу на 1 комплект (норма полуфабриката в комплекте × норма детали), чтобы все полуфабрикаты давали одно число комплектов */
      var PRE = {};
      for (k = 0; k < n; k++) {
        var e0 = it[k]; if (e0.cont || isRawName(e0.nm)) continue;
        var ch0 = resolveChain(blk[e0.ri].v, order, kgPerPc), f0 = Math.max(0, ch0.val), fam0 = shortFamilyLabel(e0.nm, order).toUpperCase();
        if (isMetalAluLbl(fam0)) {
          for (var r0 = e0.ri + 1; r0 <= bEnd; r0++) {
            if (cleanSp(blk[r0].v[3])) break;
            for (var c0 = 5; c0 < Math.min(blk[r0].v.length, 60); c0 += 2) {
              var nm0 = cleanSp(blk[r0].v[c0]); if (!nm0) continue;
              if (shortFamilyLabel(nm0, order).toUpperCase() === fam0) {
                var v0 = numLikeV(blk[r0].v[c0 + 1]);
                if (v0 !== null && v0 > 0) { if (isNRKgCode(nm0)) { var k0 = kgPerPc(order, '', nm0); if (k0.v > 0) f0 += Math.floor(v0 / k0.v); } else if (!isRawName(nm0)) f0 += Math.floor(v0); }
              }
            }
          }
        }
        var up0 = e0.par; while (up0 >= 0 && it[up0].cls !== 'Y') up0 = it[up0].par;
        var dn0 = up0 >= 0 ? detNorm(it[up0].nm, e0.nm) : 1, kn0 = up0 >= 0 ? kitNormOf(order, it[up0].nm) : 1;
        e0._ch = ch0; e0._fn = f0; e0._dn = dn0; e0._w = Math.max(1, dn0) * Math.max(1, kn0);
        var gk = e0.nm.toUpperCase(), g0 = PRE[gk] || (PRE[gk] = { best: e0, W: 0, cnt: 0 }); g0.W += e0._w; g0.cnt++; if (f0 > g0.best._fn) g0.best = e0;
      }
      for (k = n - 1; k >= 0; k--) {
        var e = it[k];
        if (e.cont) {
          var ov = numLikeV(blk[e.ri].v[4]); ov = ov === null ? 0 : ov; if (ov < 0) ov = 0; ov += e.addOwn;
          var pos = {}, order_ = [], seen = {};
          for (j = k + 1; j < n; j++) if (it[j].par === k && !seen[it[j].nm.toUpperCase()]) {
            seen[it[j].nm.toUpperCase()] = 1;
            if (!pos[it[j].pk]) { pos[it[j].pk] = 0; order_.push(it[j].pk); } pos[it[j].pk] += it[j].vl;
          }
          var mn = -1; e.minPk = '';
          order_.forEach(function (pk) { if (mn < 0 || pos[pk] < mn) { mn = pos[pk]; e.minPk = pk; } });
          if (mn < 0) mn = 0;
          e.vl = ov + mn; e.own = ov; e.pos = order_.map(function (pk) { return { pk: pk, sum: pos[pk] }; });
        } else if (isRawName(e.nm)) {
          var kg = numLikeV(blk[e.ri].v[4]); kg = kg === null ? 0 : kg;
          var pn = e.par >= 0 ? it[e.par].nm : '', kp = kgPerPc(order, pn, e.nm);
          e.kgpc = kp; e.kg = kg; e.vl = (kp.v > 0 && kg > 0) ? Math.floor(kg / kp.v) : 0; e.own = kg;
        } else {
          var g1 = PRE[e.nm.toUpperCase()], bst = g1 ? g1.best : e, ch = bst._ch || resolveChain(blk[e.ri].v, order, kgPerPc), fn = bst._fn != null ? bst._fn : Math.max(0, ch.val);
          if (g1 && g1.cnt > 1) fn = Math.floor(fn * e._w / g1.W + 1e-9);
          e.raw = fn; e.dn = e._dn || 1;
          if (e.dn > 1) fn = Math.floor(fn / e.dn);
          e.vl = fn; e.own = ch.own; e.chain = ch; e.shared = g1 && g1.cnt > 1 ? { cnt: g1.cnt, w: e._w, W: g1.W, total: bst._fn } : null;
        }
      }
      var total = -1, worst = -1, roots = [];
      for (k = 0; k < n; k++) if (it[k].cls === 'Y') {
        var kn = kitNormOf(order, it[k].nm); roots.push({ i: k, kn: kn });
        var kits = Math.floor(it[k].vl / kn);
        if (total < 0 || kits < total) { total = kits; worst = k; }
      }
      if (total < 0) return null;
      var cur = worst, path = [], g = 0, botRows = [];
      while (cur >= 0 && it[cur].cont && it[cur].minPk && g < 10) {
        g++; var nx = -1;
        for (j = cur + 1; j < n; j++) if (it[j].par === cur && it[j].pk === it[cur].minPk) { if (nx < 0) nx = j; if (it[j].cont) { nx = j; break; } }
        if (nx < 0) break;
        if (!it[nx].cont) { var ps = 0; for (j = cur + 1; j < n; j++) if (it[j].par === cur && it[j].pk === it[cur].minPk) { ps += it[j].vl; botRows.push(it[j].ri); } path.push(it[nx].nm + ' - ' + Math.floor(ps).toLocaleString('ru-RU') + ' шт'); break; }
        path.push(it[nx].nm); cur = nx;
      }
      /* botRows — строки блока узкого места (позиция с наименьшим выпуском у полуфабриката, на котором останавливается производство) */
      return { total: total, items: it, roots: roots, worst: worst, bottle: path.join(' > '), botRows: botRows };
    }

    /* ===== Карта анализа: очередь → резерв → готовая продукция → полуфабрикат → производство (общие пулы) ===== */
    /* Лист Обработка -> строки {v:[...], c:'FFRRGGBB'} (цвет заливки колонки D) */
    function obrFromSheet(ws) {
      if (!ws || !ws['!ref']) return [];
      var rg = XLSX.utils.decode_range(ws['!ref']), out = [];
      for (var r = rg.s.r; r <= rg.e.r; r++) {
        var v = [], last = -1;
        for (var c = 0; c <= Math.min(rg.e.c, 79); c++) { var cl = ws[XLSX.utils.encode_cell({ r: r, c: c })]; var x = cl ? (cl.t === 'e' ? (cl.w || '#ERR') : (cl.v instanceof Date ? cleanSp(cl.v) : cl.v)) : null; v.push(x === undefined ? null : x); if (x !== null && x !== undefined && x !== '') last = c; }
        v.length = last + 1;
        var d = ws[XLSX.utils.encode_cell({ r: r, c: 3 })], col = null;
        if (d && d.s && d.s.patternType === 'solid' && d.s.fgColor && d.s.fgColor.rgb) col = ('FF' + d.s.fgColor.rgb).slice(-8).toUpperCase();
        out.push({ v: v, c: col });
      }
      return out;
    }
    /* Блоки Обработки: по товару и по полуфабрикату (поддерево от жёлтой строки) */
    function indexObr(obr) {
      var byProd = {}, bySemi = {}, cur = null;
      obr.forEach(function (r, i) {
        var a = r.v[0], b = r.v[1];
        if (i > 0 && a !== null && a !== undefined && a !== '' && b && /^(\d+|б\/н)$/.test(String(a).trim())) { cur = { name: cleanSp(b), rows: [] }; byProd[normKey(b)] = cur; return; }
        if (!cur) return;
        if (cleanSp(b) === 'Количество заказов') return;
        cur.rows.push({ v: r.v.slice(), cls: colorClass(r.c) });
      });
      Object.keys(byProd).forEach(function (k) {
        var rows = byProd[k].rows, st = -1;
        for (var i = 0; i <= rows.length; i++) {
          var isY = i < rows.length && rows[i].cls === 'Y';
          if ((isY || i === rows.length) && st >= 0) { var nm = normKey(rows[st].v[3]); if (!bySemi[nm]) bySemi[nm] = rows.slice(st, i); }
          if (isY) st = i;
        }
      });
      return { byProd: byProd, bySemi: bySemi };
    }
    /* Структура программы (makeEngine.analyze) -> строки блока в формате Обработки */
    function structToRows(a) {
      var rows = [];
      (a.roots || []).forEach(function (rt) {
        var semiOwn = rt.own - rt.extra.reduce(function (s, x) { var m = x.match(/\s(-?[\d.]+)$/); return s + (m ? parseFloat(m[1]) : 0); }, 0);
        rows.push({ v: [null, null, null, rt.name, semiOwn], cls: 'Y', gen: true });
        rt.extra.forEach(function (x) { var m = x.match(/^(.*)\s(-?[\d.]+)$/); if (m) rows.push({ v: [null, null, null, m[1], parseFloat(m[2])], cls: 'YA', gen: true }); });
        rt.positions.forEach(function (ps) {
          ps.items.forEach(function (it) {
            if (it.sub) { structToRows({ roots: [it.sub] }).forEach(function (r) { if (r.cls === 'Y') r.cls = 'O6'; rows.push(r); }); return; }
            if (it.mat) { rows.push({ v: [null, null, null, it.name, it.kg], cls: 'B', gen: true }); return; }
            var v = [null, null, null, it.name, it.own];
            (it.chain || []).forEach(function (l) { v.push(l.name, l.mat ? l.kg : l.stock); });
            rows.push({ v: v, cls: 'B', gen: true });
          });
        });
      });
      return rows;
    }
    /* Блок для позиции OOR: 1) свой блок Обработки; 2) полуфабрикат найден программой и есть в Обработке; 3) построено программой */
    function blockForPosition(p, ENG, OBRX, OB) {
      if (OB) {
        var b = OB.best(p.name);
        if (!OB.found(b)) return null;
        var sh = OBRX && OBRX.byProd[p.key];
        return { rows: b.rows, rawRows: b.rawRows || null, src: 'build', alias: b.alias || '', brand: b.brand || '', check: sh && !OB.fresh ? compareObrBlocks(b.rawRows || b.rows, sh.rows) : null, note: 'блок построен программой по правилам Обработки' };
      }
      var own = OBRX && OBRX.byProd[p.key];
      if (own && own.rows.some(function (r) { return r.cls === 'Y'; })) return { rows: own.rows, src: 'obr', note: 'блок Обработки (макрос)' };
      var a = ENG ? ENG.analyze(p.name) : null;
      if (!a || !a.found || !a.roots || !a.roots.length) return null;
      if (OBRX) {
        var parts = a.roots.map(function (rt) { return OBRX.bySemi[normKey(rt.name)] || null; });
        if (parts.every(function (x) { return x; })) return { rows: [].concat.apply([], parts), src: 'obrsemi', note: 'полуфабрикат из блока Обработки (макрос)' };
      }
      return { rows: structToRows(a), src: 'eng', note: 'структура построена программой (TDSheet/NEP)' };
    }

    /* ----- пулы ----- */
    function poolKey(nm) { return cleanSp(nm).toUpperCase().replace(/К/g, 'K'); }
    function makePools(td2, stockOv) {
      var P = { v: {}, init: {}, cur: '', led: {} };
      P.get = function (key, def) { if (!(key in P.v)) { P.v[key] = def; P.init[key] = def; } return P.v[key]; };
      /* журнал: какая ячейка (позиция@заказ) сколько взяла из пула */
      P.take = function (key, amt) { P.v[key] = (P.v[key] || 0) - amt; if (P.cur && amt > 0) { var L = P.led[key] || (P.led[key] = {}); L[P.cur] = (L[P.cur] || 0) + amt; } };
      return P;
    }
    /* Подставить текущие остатки пулов в строки блока */
    function pooledRows(rows, P) {
      return rows.map(function (r) {
        var v = r.v.slice(), d = cleanSp(v[3]);
        if (d && !isPcsNote(d) && d !== '-') {
          var raw = numLikeV(v[4]), key = (isRawName(d) ? 'KG|' : '') + poolKey(d);
          if (r.cls === 'Y' || r.cls === 'YA') v[4] = 0; else v[4] = P.get(key, raw === null ? 0 : Math.max(0, raw));
        }
        for (var c = 5; c + 1 < v.length && c <= 59; c += 2) {
          var nm = cleanSp(v[c]); if (!nm || isPcsNote(nm)) break;
          var rv = numLikeV(v[c + 1]); if (rv === null) continue;
          v[c + 1] = P.get((isRawName(nm) ? 'KG|' : '') + poolKey(nm), Math.max(0, rv));
        }
        return { v: v, cls: r.cls };
      });
    }
    /* Списать X шт выпуска корня (полуфабриката) из пулов деталей / цепочек / материалов */
    function consumeRoot(res, ri, X, P, order, kgPerPc, log) {
      var it = res.items, root = it[ri];
      if (X <= 0) return;
      var byPk = {};
      for (var j = ri + 1; j < it.length; j++) if (it[j].par === ri) { (byPk[it[j].pk] = byPk[it[j].pk] || []).push(j); }
      Object.keys(byPk).forEach(function (pk) {
        var left = X;
        byPk[pk].forEach(function (j) {
          if (left <= 0) return;
          var e = it[j], t = Math.min(left, Math.max(0, e.vl)); if (t <= 0) return;
          left -= t;
          /* норма детали на полуфабрикат (RS 7007-30/50, RS 7016-30/50: по 2 шт) — физический расход = t × норма */
          var up = e.par; while (up >= 0 && it[up].cls !== 'Y') up = it[up].par;
          var nrm = up >= 0 ? detNorm(it[up].nm, e.nm) : 1;
          if (e.cont) { consumeRoot(res, j, t, P, order, kgPerPc, log); return; }
          if (isRawName(e.nm)) { var kg = t * nrm * (e.kgpc ? e.kgpc.v : 0); P.take('KG|' + poolKey(e.nm), kg); log.push([e.nm, kg, 'кг']); return; }
          var rem = t * nrm, ch = e.chain;
          (ch ? ch.used : []).forEach(function (l) {
            if (rem <= 0) return;
            /* по фактическому остатку пула (другие полуфабрикаты комплекта этого же заказа уже могли взять из него) */
            var lk = (l.mat ? 'KG|' : '') + poolKey(l.name), live = lk in P.v ? (l.mat ? (l.kgpc > 0 ? Math.floor(P.v[lk] / l.kgpc + 1e-9) : 0) : P.v[lk]) : l.cnt;
            var avail = Math.min(l.cnt, live); if (avail <= 0) return;
            var u = Math.min(rem, avail); rem -= u;
            if (l.mat) { var kg2 = u * (l.kgpc || 0); P.take('KG|' + poolKey(l.name), kg2); log.push([l.name, kg2, 'кг']); }
            else { P.take(poolKey(l.name), u); log.push([l.name, u, 'шт']); }
          });
        });
      });
    }
    /* Главный расчёт карты анализа */
    function allocateAll(oor, queue, td2, ov, ENG, OBRX, kgPerPc, OB) {
      ov = ov || { stock: {}, q: {}, r: {} };
      var P = makePools(), out = {}, blocks = {}, seq = {}, n = 0;
      oor.positions.forEach(function (p) { out[p.id] = { cells: {}, block: null }; });
      queue.forEach(function (o) {
        oor.positions.forEach(function (p) {
          var k = ovKey(p, o), qE = Object.prototype.hasOwnProperty.call(ov.q, k), rE = Object.prototype.hasOwnProperty.call(ov.r, k);
          var q = qE ? ov.q[k] : (p.q[o.id] || 0), rv = rE ? ov.r[k] : (p.r[o.id] || 0);
          if (q === 0 && rv === 0 && !qE && !rE) return;
          var need = Math.max(0, q - rv), cell = { q: q, rv: rv, need: need, fg: 0, semi: 0, prod: 0, short: 0, steps: [] };
          P.cur = p.id + '@' + o.id; seq[P.cur] = n++;
          // 1) готовая продукция
          var fgKey = 'FG|' + p.key;
          var st = Object.prototype.hasOwnProperty.call(ov.stock, p.key) ? ov.stock[p.key] : td2Stock(td2, p.name).stock;
          var fgAvail = P.get(fgKey, Math.max(0, st)), left = need;
          cell.fgBefore = fgAvail;
          var t1 = Math.min(left, fgAvail); P.take(fgKey, t1); cell.fg = t1; left -= t1;
          // 2) полуфабрикат на складе и 3) производство
          if (left > 0) {
            if (!(p.id in blocks)) blocks[p.id] = blockForPosition(p, ENG, OBRX, OB);
            var bl = blocks[p.id]; out[p.id].block = bl;
            if (bl) {
              var res0 = computeTree(pooledRows(bl.rows, P), p.name, kgPerPc);
              if (res0) {
                var roots = res0.items.map(function (x, i) { return x.cls === 'Y' ? i : -1; }).filter(function (i) { return i >= 0; });
                var semiAv = roots.map(function (ri) {
                  var it = res0.items[ri], keys = [poolKey(it.nm)].concat(it.ya.map(poolKey)), tot = 0;
                  var r0 = bl.rows.filter(function (r) { return r.cls === 'Y' || r.cls === 'YA'; });
                  keys.forEach(function (kk) { var row = r0.filter(function (r) { return poolKey(r.v[3]) === kk; })[0]; tot += P.get('SEMI|' + kk, row ? Math.max(0, numLikeV(row.v[4]) || 0) : 0); });
                  return { ri: ri, keys: keys, avail: tot, kn: kitNormOf(p.name, it.nm) };
                });
                cell.semiBefore = semiAv.reduce(function (s, x) { return Math.min(s, Math.floor(x.avail / x.kn)); }, Infinity);
                var t2 = Math.min(left, cell.semiBefore);
                if (t2 > 0) semiAv.forEach(function (x) { var u = t2 * x.kn; x.keys.forEach(function (kk) { var a = P.v['SEMI|' + kk] || 0, w = Math.min(a, u); P.take('SEMI|' + kk, w); u -= w; }); });
                cell.semi = t2; left -= t2;
                if (left > 0) {
                  var cap = Infinity; roots.forEach(function (ri) { cap = Math.min(cap, Math.floor(res0.items[ri].vl / kitNormOf(p.name, res0.items[ri].nm))); });
                  cell.prodCap = cap === Infinity ? 0 : cap; cell.bottle = res0.bottle;
                  var t3 = Math.min(left, cell.prodCap), log = [];
                  if (t3 > 0) roots.forEach(function (ri) { consumeRoot(res0, ri, t3 * kitNormOf(p.name, res0.items[ri].nm), P, p.name, kgPerPc, log); });
                  cell.prod = t3; cell.used = log; left -= t3;
                }
                cell.tree = res0;
              }
            }
          }
          cell.short = left;
          out[p.id].cells[o.id] = cell;
        });
      });
      P.cur = '';
      return { pos: out, pools: P, seq: seq };
    }

    /* ===== Порт построения блока Обработки (Обработка_ОСНОВНАЯ_VTOV и помощники, v372) =====
       D = { td: [[A,B,E],...], nep: [[A,B,C],...], td2: [[name, G, min, J, row],...], bush: {...}, matRef: {DetailNormKey: [material, kgpc]} } */
    function makeObrBuilder(D) {
      var MAX_GAP_SEARCH = 40, MAX_GAP_SUBDETAILS = 40, MAX_EMPTY_STREAK = 25;
      var U = function (s) { return cleanSp(s).toUpperCase(); };
      var kLat = function (s) { return String(s).replace(/К/g, 'K'); };
      function isExclWh(w) { return EXCL_WH.indexOf(U(w)) >= 0; }
      function hasNekond(n) { return U(n).indexOf('(НЕКОНДИЦИЯ)') >= 0; }
      function emptyOrZero(v) { if (v === null || v === undefined || v === '') return true; if (typeof v === 'number') return v === 0; var n = numVal(v); if (n !== null) return n === 0; return cleanSp(v) === ''; }
      // --- листы: TD, NEP (A,B,stock), TD2 (по строкам)
      function mkSheet(rows, name) {
        var S = { name: name, rows: rows, colA: [], colB: [], exA: {}, exB: {} };
        rows.forEach(function (r, i) {
          var a = cleanSp(r[0]), b = cleanSp(r[1]);
          if (a) { S.colA.push({ row: i + 1, v: a.toUpperCase(), o: a }); if (!(a.toUpperCase() in S.exA)) S.exA[a.toUpperCase()] = i + 1; }
          if (b) { S.colB.push({ row: i + 1, v: b.toUpperCase(), o: b }); if (!(b.toUpperCase() in S.exB)) S.exB[b.toUpperCase()] = i + 1; }
        });
        S.A = function (r) { return r >= 1 && r <= rows.length ? cleanSp(rows[r - 1][0]) : ''; };
        S.B = function (r) { return r >= 1 && r <= rows.length ? cleanSp(rows[r - 1][1]) : ''; };
        S.V = function (r) { return r >= 1 && r <= rows.length ? rows[r - 1][2] : null; };
        S.J = function () { return ''; };
        return S;
      }
      var TD = mkSheet(D.td || [], 'TDSheet'), NEP = (D.nep && D.nep.length) ? mkSheet(D.nep, 'NEP') : null;
      /* «Обновить склад»: остаток строки TDSheet (E) / NEP (C) берём из нового склада по названию строки;
         было в складе книги, а в новом нет — 0; в складе никогда не было — оставляем значение листа */
      function freshen(S) {
        if (!S || !D.fresh) return; var v0 = S.V;
        S.V = function (r) { var nm = S.A(r) || S.B(r); if (!nm) return v0(r); var sv = td2SumOf(nm); if (sv !== null) return sv; if (D.fresh[U(nm)]) return 0; return v0(r); };
      }
      freshen(TD); freshen(NEP);
      // TD2 как лист: строки по номеру, колонка B
      var T2 = { name: 'TDSheet2', colB: [], byRow: {}, sum: {}, exB: {} };
      (D.td2 || []).forEach(function (x) {
        var nm = cleanSp(x[0]), up = nm.toUpperCase(), ex = isExclWh(x[3]);
        T2.colB.push({ row: x[4], v: up, o: nm, ex: ex, g: x[1] });
        T2.byRow[x[4]] = { name: nm, g: x[1], j: x[3], ex: ex };
        if (!ex) { if (!T2.sum[up]) T2.sum[up] = { s: 0 }; if (x[1] !== null && x[1] !== undefined) T2.sum[up].s += numLikeV(x[1]) || 0; }
      });
      T2.colB.sort(function (a, b) { return a.row - b.row; });
      T2.colB.forEach(function (e) { if (!(e.v in T2.exB)) T2.exB[e.v] = e.row; });
      T2.J = function (r) { return T2.byRow[r] ? T2.byRow[r].j : ''; };
      function td2SumOf(nm) { var e = T2.sum[U(nm)]; return e ? e.s : null; }               // BuildTD2SumFormula ("" -> null)
      function td2RowNR10(nm) { var t = U(nm); for (var i = 0; i < T2.colB.length; i++) { var e = T2.colB[i]; if (e.v === t && !e.ex) return e.row; } return 0; }
      function td2G(r) { return T2.byRow[r] ? T2.byRow[r].g : null; }
      // --- поиск
      function findInCol(S, col, nm) { var t = U(nm); if (!t) return 0; var ex = col === 'A' ? S.exA : S.exB; return ex[t] || 0; }
      function findClean(S, nm) { var t = U(nm); if (!t) return 0; for (var i = 0; i < S.rows.length; i++) { if (U(S.rows[i][0]) === t || U(S.rows[i][1]) === t) return i + 1; } return 0; }
      function findPrefix(S, col, pre) { var t = U(pre); if (!t) return null; var L = col === 'A' ? S.colA : S.colB; for (var i = 0; i < L.length; i++) if (L[i].v.indexOf(t) === 0) return { row: L[i].row, name: L[i].o }; return null; }
      function isNR10(n) { return /^NR\s?10\d\d/i.test(U(n)); }
      function isR30(n) { return /^RS?\s?3\d\d\d/i.test(U(baseProductCode(n))); }
      function isR40(n) { return /^RS?\s?4[01]\d\d/i.test(U(baseProductCode(n))); }
      function isRS90(n) { return /^RS\s?90\d\d/i.test(U(baseProductCode(n))); }
      function isR90Series(n) { var u = U(n); return u.indexOf('R 90') >= 0 || u.indexOf('R90') >= 0 || u.indexOf('RS 90') >= 0 || u.indexOf('RS90') >= 0; }
      function findCodeOrPrefix(S, col, code) {
        var t = U(code); if (!t) return null;
        var skip = isNR10(code) || isR30(code) || isR40(code);
        var L = col === 'A' ? S.colA : S.colB, i, e;
        var bad = function (e) { return skip && ((S === T2 ? isExclWh(T2.J(e.row)) : false) || hasNekond(e.o)); };
        for (i = 0; i < L.length; i++) { e = L[i]; if (e.v === t && !bad(e)) return { row: e.row, name: e.o }; }
        for (i = 0; i < L.length; i++) { e = L[i]; if (e.o.length > t.length && e.v.indexOf(t) === 0) { var nc = e.v.charAt(t.length); if ((nc === ' ' || nc === '(') && !bad(e)) return { row: e.row, name: e.o }; } }
        return null;
      }
      function spaceVariant(code) {
        var s = cleanSp(code); if (!s) return '';
        if (/(\d) (FL|FR|F|R|L)(-\d)/i.test(s)) return s.replace(/(\d) (FL|FR|F|R|L)(-\d)/i, '$1$2$3');
        if (/(\d)(FL|FR|F|R|L)(-\d)/i.test(s)) return s.replace(/(\d)(FL|FR|F|R|L)(-\d)/i, '$1 $2$3');
        return '';
      }
      function findCodeSA(S, col, code) { var r = findCodeOrPrefix(S, col, code); if (r) return r; var sv = spaceVariant(code); return sv ? findCodeOrPrefix(S, col, sv) : null; }
      // --- классификаторы
      function isDash11(n) { return /-11(\s|$)/i.test(U(n)); }
      function isNested(n) { return /\(\s*\d+\s*шт\s*\/\s*\d+/i.test(cleanSp(n)); }
      function isSemi50Code(n) { return /-50\s*S?(\s|$|\))/i.test(U(n)); }
      function isNamedSemi(n) { return ['NR 1022-S4/12', 'NR 1022-S4/11', 'NR 1012-R2', 'NR 1003 R1', 'NR 1028-S2/11', 'NR 1031-S4/11', 'NR 1032-S3/11', 'NR 1038-S2/13'].indexOf(U(n)) >= 0; }
      function isMainNotSemi(n) { return ['NR 1012-R2', 'NR 1012-S1/13 M', 'NR 1003-S2/13'].indexOf(U(n)) >= 0; }
      function isSrCr(n) { var u = U(n); return u.indexOf('SR') === 0 || u.indexOf('CR') === 0; }
      function skipSR(order, det) { var o = U(order), d = U(det); return (o.indexOf('NR') === 0 || o.indexOf('CR') === 0) && d.indexOf('SR') === 0; }
      function isMVar(n) { var s = cleanSp(n); return / M$/i.test(s) && isNR10(s); }
      function nonM(n) { var s = cleanSp(n); return / M$/i.test(s) ? cleanSp(s.slice(0, -2)) : s; }
      function level03(n) { var s = cleanSp(n), p = s.lastIndexOf('/'); return p >= 0 ? s.slice(0, p + 1) + '03' : ''; }
      function sourceCode(n) { var s = cleanSp(n), p = s.lastIndexOf('/'); return p >= 0 ? cleanSp(s.slice(0, p)) : ''; }
      function isKitProduct(n) { var u = U(n); return u.indexOf('КОМПЛЕКТ') >= 0 || u.indexOf('FR/FL') >= 0 || u.indexOf('FL/FR') >= 0 || u.indexOf('R/L') >= 0 || u.indexOf('L/R') >= 0; }
      function comboCodes(n) { var m = cleanSp(n).match(/^(\S+\s+\d+)(FR|FL|R|L)\s?\/\s?(FR|FL|R|L)/i); return m ? [cleanSp(m[1]) + m[2].toUpperCase(), cleanSp(m[1]) + m[3].toUpperCase()] : null; }
      function isKitSemiChild(n) { return /[-\/]50(\s|TRT|$)/i.test(U(n)); }
      function extractNR1S(t) { var s = ctryKey(t); var m = s.match(/^(NR|CR)(\d+)-([SAC])(\d+)/i); return m ? (m[1] + m[2] + '-' + (m[3] === 'C' ? 'S' : m[3]) + m[4]).toUpperCase() : ''; }
      function hortNormalize(raw) { var s = cleanSp(raw), m = s.match(/^.+?\(([^)]+)\)\s*HORT\s*(\(.+\))\s*$/i); if (m && cleanSp(m[1]) && cleanSp(m[2])) return cleanSp(m[1]) + ' TRT ' + cleanSp(m[2]) + ' ЭКС'; return raw; }
      // --- допуск материалов (BuildTD2SumFormulaToleranceVTOV)
      function xTok(s) { var m = String(s).match(/\d+[.,]?\d*\s*[xXхХ]\s*\d+[.,]?\d*/); return m ? m[0].replace(/ /g, '').replace(/,/g, '.').replace(/[ХхX]/g, 'x') : ''; }
      function vbVal(s) { var m = String(s).match(/^\s*-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; }
      function sizeTokNum(x) { var p = x.toLowerCase().replace(/,/g, '.').split('x'); return p.length < 2 ? x : vbVal(p[0]) + '|' + vbVal(p[1]); }
      function bushMatMatch(ref, t2) {
        var r = U(ref); if (r.indexOf('ЛИСТ') < 0 && r.indexOf('ТРУБА') < 0) return 0;
        r = r.replace(/[Хх]/g, 'X'); var tk = U(t2), t = tk.replace(/[Хх]/g, 'X');
        var m = r.match(/^\(?\s*ЛИСТ\s*T?Т?\s*=\s*(\d+[.,]?\d*)/i);
        if (m) {
          var thR = vbVal(m[1].replace(',', '.'));
          if (tk.indexOf('ЛИСТ') < 0) return -1;
          if (/АСБЕСТ|НЕРЖАВ|ИНСТРУМЕНТ|ПАПКА|ГОФРО|ФАЙЛ|ЛИСТОВЫЕ|НЕКОНДИЦ/.test(tk)) return -1;
          var m2 = t.match(/ЛИСТ[^0-9]*?(\d+[.,]\d+|\d+)\s*(ММ|X|\s|$)/); if (!m2) return -1;
          return Math.abs(vbVal(m2[1].replace(',', '.')) - thR) < 0.001 ? 1 : -1;
        }
        if (r.indexOf('ТРУБА') >= 0) {
          var xR = xTok(r); if (!xR) return 0;
          if (tk.indexOf('ТРУБА') < 0) return -1;
          if (r.indexOf('БЕСШОВ') >= 0 && tk.indexOf('БЕСШОВ') < 0) return -1;
          if (tk.indexOf('НЕКОНДИЦ') >= 0 || tk.indexOf('ОТХОД') >= 0) return -1;
          return sizeTokNum(xTok(t)) === sizeTokNum(xR) ? 1 : -1;
        }
        return 0;
      }
      function normWords(s) { s = cleanSp(s); var m = s.search(/\d/); var ph = m >= 0 ? s.slice(0, m) : s; return ph.split(' ').filter(function (p) { return p.length >= 2; }).map(function (p) { return p.toUpperCase(); }).join(' '); }
      function firstNum(s) { var m = String(s).match(/\d+[.,]?\d*/); return m ? m[0].replace(',', '.') : ''; }
      function matTol(ref, t2) {
        var b = bushMatMatch(ref, t2); if (b !== 0) return b === 1;
        var rw = normWords(ref), tw = normWords(t2); if (!rw || !tw) return false;
        if (tw.indexOf(rw) < 0 && rw.indexOf(tw) < 0) return false;
        var rx = xTok(ref), tx = xTok(t2); if (rx || tx) { if (!rx || !tx) return false; return rx === tx; }
        var rn = firstNum(ref), tn = firstNum(t2); if (!rn || !tn) return false; return rn === tn;
      }
      var tolCache = {};
      function td2Tolerance(ref) {
        var k = U(ref); if (k in tolCache) return tolCache[k];
        var matched = '', sum = 0, any = false;
        T2.colB.forEach(function (e) { if (matTol(ref, e.o)) { if (!matched) matched = e.o; if (!e.ex) { any = true; sum += numLikeV(e.g) || 0; } } });
        var res = any ? { name: matched, v: sum } : null; tolCache[k] = res; return res;
      }
      function materialStockTD2(ref) {
        var res = td2Tolerance(ref); if (res) return res;
        var paren = ''; var a = ref.indexOf('('), b = ref.indexOf(')'); if (a >= 0 && b > a) paren = ref.slice(a + 1, b).toUpperCase();
        var words = ref.replace(/[()]/g, ' ').toUpperCase().split(' ');
        var tot = 0, matched = '';
        T2.colB.forEach(function (e) {
          if (/[A-ZА-Я]{1,4}\s*\d{3,5}/.test(e.v)) return;
          var hits = 0, sig = 0; words.forEach(function (w) { if (w.length >= 4) { sig++; if (e.v.indexOf(w.slice(0, -1)) >= 0) hits++; } });
          var ok = sig >= 1 && hits === sig; if (ok && paren) ok = e.v.indexOf(paren) >= 0; if (ok && e.v.indexOf('ДРОБЛ') >= 0 && ref.toUpperCase().indexOf('ДРОБЛ') < 0) ok = false;
          if (ok && !e.ex) { if (!matched) matched = e.o; tot += numLikeV(e.g) || 0; }
        });
        return matched ? { name: matched, v: tot } : null;
      }
      // --- лист-результат
      var G, maxColUsed, dedupFrom, BASEOV = '';
      function bpc(n) { return BASEOV || baseProductCode(n); }
      function cell(r, c) { var x = G[r]; return x && x.c[c] !== undefined ? x.c[c] : null; }
      function set(r, c, v) { if (c % 2 === 1 && (v === null || v === undefined)) v = 0; if (!G[r]) G[r] = { c: {}, cls: null }; G[r].c[c] = v; if (c + 1 > maxColUsed && c % 2 === 1) maxColUsed = c; }
      function setD(r, nm, v) { set(r, 4, nm); set(r, 5, v); }
      function color(r, cls) { if (!G[r]) G[r] = { c: {}, cls: null }; G[r].cls = cls; }
      function dName(r) { return cleanSp(cell(r, 4)); }
      function nameInD(r1, r2, nm) { if (r2 < r1) return false; var k = kLat(U(nm)); for (var r = r1; r <= r2; r++) if (kLat(U(cell(r, 4))) === k) return true; return false; }
      function inRowUpTo(r, upto, nm) { var t = U(nm); if (!t) return false; for (var c = 4; c <= upto; c++) if (U(cell(r, c)) === t) return true; return false; }
      function sheetStock(S, r) { return S.V(r); }
      function stockF(S, srcRow, nm) {
        var plain = sheetStock(S, srcRow), cn = cleanSp(nm);
        if (S === TD && isMVar(cn) && emptyOrZero(plain)) { var r2 = td2RowNR10(cn); if (r2) return td2G(r2); }
        if (!/ P$/i.test(cn)) return plain;
        if (!emptyOrZero(plain)) return plain;
        var dn = cn.slice(0, -1) + 'D', dr = findClean(S, dn); if (!dr) return plain;
        var dv = sheetStock(S, dr); if (emptyOrZero(dv)) return plain;
        return String(dv) + ' (D)';
      }
      // --- варианты основной детали (TryAdd*VariantForMainDetail)
      function tryAddVariant(S, rIdx, detName, order, kind) {
        var cd = cleanSp(detName), sib = '', pre = '';
        if (kind === 'M') { if (/ M$/i.test(cd)) sib = cleanSp(cd.slice(0, -2)); else if (/ S$/i.test(cd)) { sib = cleanSp(cd.slice(0, -2)); if (sib) sib += ' M'; } else sib = cd + ' M'; if (!sib) return rIdx; }
        else if (kind === 'S') { if (/ S$/i.test(cd)) sib = cleanSp(cd.slice(0, -2)); else if (/ M$/i.test(cd)) { sib = cleanSp(cd.slice(0, -2)); if (sib) sib += ' S'; } else sib = cd + ' S'; if (!sib) return rIdx; }
        else { var gp = U(cd).indexOf(' (GM'); if (gp >= 0) { sib = cleanSp(cd.slice(0, gp)); if (!sib) return rIdx; } else pre = cd + ' (GM'; }
        if (kind !== 'GM' && dedupFrom > 0 && dedupFrom <= rIdx && nameInD(dedupFrom, rIdx, sib)) return rIdx;
        var fr = 0, isTD = false, sumV = null;
        if (pre) { var f = findPrefix(S, 'A', pre); if (f) { fr = f.row; isTD = true; sib = f.name; } else { var f2 = findPrefix(T2, 'B', pre); if (f2) { sib = f2.name; sumV = td2SumOf(f2.name); if (sumV !== null) fr = 1; } } }
        else { fr = findInCol(S, 'A', sib); if (fr) isTD = true; else { sumV = td2SumOf(sib); if (sumV !== null) fr = 1; } }
        if (!fr) return rIdx;
        var mr = rIdx + 1; setD(mr, sib, isTD ? stockF(S, fr, sib) : sumV); color(mr, 'BL');
        var end = mr;
        if (isTD && !isSrCr(sib)) { var mx = { v: mr }; if (isR90Series(order)) subR90(S, sib, mr, order, mx); else subExact(S, sib, mr, order, mx); end = mx.v; }
        return end;
      }
      // --- сиблинги в цепочке
      function writeMSib(S, rIdx, col, item, order, mx) {
        if (!isMVar(item)) return;
        var plain = nonM(item); if (!plain) return;
        var own = findInCol(S, 'A', plain) || findClean(S, plain), t2r = 0, fam = false;
        if (!own) t2r = td2RowNR10(plain);
        if (!own && !t2r) {
          var l3 = level03(plain);
          if (l3 && U(l3) !== U(plain)) {
            var lo = findInCol(S, 'A', l3) || findClean(S, l3), lt = lo ? 0 : td2RowNR10(l3);
            if (lo || lt) { if (inRowUpTo(rIdx, col, l3)) fam = true; else { own = lo; t2r = lt; plain = l3; } }
          }
        }
        var src = '';
        if (!own && !t2r) { src = sourceCode(plain); if (src) { own = findInCol(S, 'A', src) || findClean(S, src); if (!own) t2r = td2RowNR10(src); if (own || t2r || fam) plain = src; } }
        if (!own && !t2r && !(fam && src)) return;
        var sr = mx.v + 1; set(sr, col, plain);
        if (own) set(sr, col + 1, stockF(S, own, plain)); else if (t2r) set(sr, col + 1, td2G(t2r));
        if (sr > mx.v) mx.v = sr;
      }
      function writeGMSib(S, rIdx, col, item, order, mx) {
        var ci = cleanSp(item); if (!ci || U(ci).indexOf('(GM') >= 0) return;
        var pre = ci + ' (GM', f = findPrefix(S, 'A', pre), name = '', val = null, ok = false;
        if (f) { ok = true; name = f.name; val = stockF(S, f.row, name); }
        else { var f2 = findPrefix(T2, 'B', pre); if (f2) { var sv = td2SumOf(f2.name); if (sv !== null) { ok = true; name = f2.name; val = sv; } } }
        if (!ok) return;
        var sr = mx.v + 1; set(sr, col, name); set(sr, col + 1, val); if (sr > mx.v) mx.v = sr;
      }
      function writeMSSib(S, rIdx, col, item, order, mx) {
        var ci = cleanSp(item); if (!ci) return;
        var up = ci.toUpperCase(), base = ci, own = '';
        if (/ [MS]$/.test(up)) { own = up.slice(-1); base = cleanSp(ci.slice(0, -2)); if (!base) return; }
        for (var k = 1; k <= 3; k++) {
          var cand = '';
          if (k === 1 && own !== 'M') cand = base + ' M';
          if (k === 2) { if (own === 'S') cand = base; if (own === 'M' && !isMVar(ci)) cand = base; }
          if (k === 3 && own !== 'S') cand = base + ' S';
          if (cand && inRowUpTo(rIdx, col, cand)) cand = '';
          if (cand) for (var r = rIdx; r <= mx.v; r++) if (U(cell(r, col)) === U(cand)) { cand = ''; break; }
          if (!cand) continue;
          var fr = findInCol(S, 'A', cand), val = null, ok = false;
          if (fr) { ok = true; val = stockF(S, fr, cand); } else { var sv = td2SumOf(cand); if (sv !== null) { ok = true; val = sv; } }
          if (!ok) continue;
          var sr = mx.v + 1; set(sr, col, cand); set(sr, col + 1, val); if (col === 4) color(sr, 'BL');
          if (sr > mx.v) mx.v = sr;
        }
      }
      function writeRegionSib(S, rIdx, col, item, order, mx) {
        var ci = cleanSp(item); if (!ci || U(ci).indexOf('(GM') >= 0) return;
        var p = U(ci).lastIndexOf('CR-'); if (p < 0) return;
        var pre = U(ci.slice(0, p + 3)); if (pre.length < 4) return;
        var seen = {}, added = 0;
        for (var i = 0; i < S.colA.length && added < 3; i++) {
          var e = S.colA[i]; if (e.v === U(ci) || e.v.indexOf('(GM') >= 0 || e.v.indexOf(pre) !== 0 || seen[e.v]) continue;
          seen[e.v] = 1; added++; var sr = mx.v + 1; set(sr, col, e.o); set(sr, col + 1, stockF(S, e.row, e.o)); if (sr > mx.v) mx.v = sr;
        }
        for (var j = 0; j < T2.colB.length && added < 3; j++) {
          var t = T2.colB[j]; if (t.v === U(ci) || t.v.indexOf('(GM') >= 0 || t.v.indexOf(pre) !== 0 || seen[t.v]) continue;
          var sv = td2SumOf(t.o); if (sv === null) continue;
          seen[t.v] = 1; added++; var sr2 = mx.v + 1; set(sr2, col, t.o); set(sr2, col + 1, sv); if (sr2 > mx.v) mx.v = sr2;
        }
      }
      function nr1Fallback(rIdx, col, item) {
        var bk = extractNR1S(item); if (!bk || !D.bush[bk]) return col;
        var mat = D.bush[bk][0]; if (!mat) return col;
        var t = td2Tolerance(mat); if (!t) return col;
        set(rIdx, col, t.name); set(rIdx, col + 1, t.v); G[rIdx].ref = G[rIdx].ref || []; G[rIdx].ref.push(col); return col + 2;
      }
      function tryExpandNR1M(S, rIdx, colRef, item, order, depth, mx) {
        if (!isMVar(item)) return false;
        var plain = nonM(item); if (!plain) return false;
        if (findInCol(S, 'A', plain)) { follow(S, plain, rIdx, colRef, order, depth + 1, mx); return true; }
        if (findInCol(S, 'A', plain + ' S')) { follow(S, plain + ' S', rIdx, colRef, order, depth + 1, mx); return true; }
        return false;
      }
      // --- FollowDetailChain
      function follow(S, start, rIdx, colRef, order, depth, mx) {
        if (depth > 20 || skipSR(order, start) || isSrCr(start)) return;
        var fr = findInCol(S, 'A', start); if (!fr) return;
        if (isDash11(start) || isNested(start) || isSemi50Code(start) || isNamedSemi(start)) {
          for (var r = fr + 1; !S.A(r) && r <= S.rows.length; r++) {
            var nm = S.B(r);
            if (nm && isValidSemi(nm)) {
              var nr = mx.v + 1; mx.v = nr; setD(nr, nm, stockF(S, r, nm)); color(nr, isMainNotSemi(nm) ? 'B' : 'O8');
              if (findInCol(S, 'A', nm)) { var cc = { v: 6 }; follow(S, nm, nr, cc, order, depth + 1, mx); }
              else {
                var before = mx.v;
                writeMSib(S, nr, 4, nm, order, mx); writeGMSib(S, nr, 4, nm, order, mx); writeMSSib(S, nr, 4, nm, order, mx); writeRegionSib(S, nr, 4, nm, order, mx);
                if (mx.v === before) nr1Fallback(nr, 6, nm);
              }
            }
            if (r + 1 > fr + MAX_GAP_SUBDETAILS) break;
          }
          return;
        }
        for (var r2 = fr + 1; !S.A(r2) && r2 <= S.rows.length; r2++) {
          var sn = S.B(r2);
          if (sn && isValidSemi(sn)) {
            var wc = colRef.v;
            set(rIdx, colRef.v, sn); set(rIdx, colRef.v + 1, stockF(S, r2, sn)); colRef.v += 2;
            if (rIdx > mx.v) mx.v = rIdx;
            writeMSib(S, rIdx, wc, sn, order, mx); writeGMSib(S, rIdx, wc, sn, order, mx); writeMSSib(S, rIdx, wc, sn, order, mx); writeRegionSib(S, rIdx, wc, sn, order, mx);
            if (findInCol(S, 'A', sn)) follow(S, sn, rIdx, colRef, order, depth + 1, mx);
            else if (!tryExpandNR1M(S, rIdx, colRef, sn, order, depth, mx)) colRef.v = nr1Fallback(rIdx, colRef.v, sn);
          }
          if (r2 + 1 > fr + MAX_GAP_SUBDETAILS) break;
        }
      }
      function firstKidIsTPU(S, fr, gap) { var r = fr + 1; while (!S.A(r) && !S.B(r) && r <= S.rows.length) { r++; if (r > fr + gap) break; } return S.B(r).toUpperCase().indexOf('ТЕРМОПЛАСТИК ПОЛИУРЕТАН (TPU)') === 0; }
      function subR90(S, det, rIdx, order, mx) {
        mx.v = rIdx; if (skipSR(order, det)) return;
        var fr = findInCol(S, 'A', det); if (!fr) return;
        if (firstKidIsTPU(S, fr, MAX_GAP_SUBDETAILS)) return;
        follow(S, det, rIdx, { v: 6 }, order, 0, mx);
      }
      function subExact(S, det, rIdx, order, mx) {
        mx.v = rIdx; if (skipSR(order, det)) return;
        if (U(det) === 'R 7123-02/03') { var c = 6;['R 7000-02/02', 'R 7000-02/01', 'Прут d=18mm Ст.40Х'].forEach(function (nm) { var r = findClean(TD, nm); if (r) { set(rIdx, c, nm); set(rIdx, c + 1, stockF(TD, r, nm)); c += 2; } }); return; }
        var fr = findInCol(S, 'A', det);
        if (fr) {
          if (isDash11(det) || isNested(det) || isSemi50Code(det) || isNamedSemi(det)) { follow(S, det, rIdx, { v: 6 }, order, 0, mx); return; }
          if (firstKidIsTPU(S, fr, MAX_EMPTY_STREAK)) return;
          var special = /R 7050-01\/01|R 7000-01\/01/i.test(cleanSp(det));
          var col = { v: 6 }, empty = 0;
          for (var r = fr + 1; empty < MAX_EMPTY_STREAK && r <= S.rows.length + 1; r++) {
            var a = S.A(r), b = S.B(r);
            if (!a && !b) { empty++; continue; }
            empty = 0; if (a) break;
            if (special || isValidSemi(b)) {
              var wc = col.v; set(rIdx, col.v, b); set(rIdx, col.v + 1, stockF(S, r, b)); col.v += 2;
              writeMSib(S, rIdx, wc, b, order, mx); writeGMSib(S, rIdx, wc, b, order, mx); writeMSSib(S, rIdx, wc, b, order, mx); writeRegionSib(S, rIdx, wc, b, order, mx);
              if (findInCol(S, 'A', b)) follow(S, b, rIdx, col, order, 0, mx);
              else if (!tryExpandNR1M(S, rIdx, col, b, order, 0, mx)) col.v = nr1Fallback(rIdx, col.v, b);
            }
          }
        } else {
          var cc = { v: 6 };
          if (!tryExpandNR1M(S, rIdx, cc, det, order, 0, mx)) nr1Fallback(rIdx, 6, det);
        }
      }
      // --- ProcessSingleSemiDetails
      function procSemi(S, semi, startR, order) {
        var seenOut = {}, seenSrc = {};
        var fr = findInCol(S, 'A', semi), maxR = startR, isR90 = isR90Series(order);
        if (!fr) return maxR;
        var dr = fr + 1;
        while (!S.A(dr) && !S.B(dr)) { dr++; if (dr > fr + MAX_GAP_SEARCH) return maxR; }
        var out = startR + 1, lastNest = 0;
        while ((S.A(dr) || S.B(dr)) && dr <= S.rows.length) {
          if (S.A(dr)) break;
          var det = S.B(dr); if (!det) break;
          if (isValidSemi(det)) {
            var child = findInCol(S, 'A', det);
            if (child && isR90) {
              var nestStart = out; setD(out, det, stockF(S, dr, det)); color(out, 'B');
              dedupFrom = lastNest > startR + 1 ? lastNest : startR + 1;
              maxR = tryAddVariant(S, out, det, order, 'M'); maxR = tryAddVariant(S, maxR, det, order, 'GM'); maxR = tryAddVariant(S, maxR, det, order, 'S');
              var mxr = { v: maxR }; writeRegionSib(S, out, 4, det, order, mxr); maxR = mxr.v;
              out = maxR + 1;
              for (var sr = child + 1; !S.A(sr) && sr <= S.rows.length; sr++) {
                var sn = S.B(sr);
                if (sn && isValidSemi(sn) && !nameInD(nestStart + 1, out - 1, sn)) {
                  setD(out, sn, stockF(S, sr, sn)); if (isDash11(sn)) color(out, 'O6');
                  var ms = { v: out }; if (!isSrCr(sn)) subR90(S, sn, out, order, ms);
                  dedupFrom = nestStart + 1;
                  var m2 = ms.v; m2 = tryAddVariant(S, m2, sn, order, 'M'); m2 = tryAddVariant(S, m2, sn, order, 'GM'); m2 = tryAddVariant(S, m2, sn, order, 'S');
                  var mm = { v: m2 }; writeRegionSib(S, out, 4, sn, order, mm); m2 = mm.v;
                  maxR = m2; out = m2 + 1;
                }
                if (sr + 1 > child + MAX_GAP_SUBDETAILS) break;
              }
              lastNest = out;
            } else {
              var dk = kLat(U(det)), from = lastNest > startR + 1 ? lastNest : startR + 1;
              if (!(dk in seenOut) && nameInD(from, out - 1, det)) { /* уже есть как вариант */ }
              else if (dk in seenOut) {
                var oldV = numVal(S.V(seenSrc[dk])) || 0, newV = numVal(S.V(dr)) || 0;
                if (oldV === 0 && newV !== 0) { setD(seenOut[dk], det, stockF(S, dr, det)); seenSrc[dk] = dr; }
              } else {
                seenOut[dk] = out; seenSrc[dk] = dr;
                setD(out, det, stockF(S, dr, det));
                color(out, (isDash11(det) || isNested(det) || isSemi50Code(det) || isNamedSemi(det)) && !isMainNotSemi(det) ? 'O6' : 'B');
                var md = { v: out };
                if (!isSrCr(det)) { if (isR90) subR90(S, det, out, order, md); else subExact(S, det, out, order, md); }
                dedupFrom = from;
                var m3 = md.v; m3 = tryAddVariant(S, m3, det, order, 'M'); m3 = tryAddVariant(S, m3, det, order, 'GM'); m3 = tryAddVariant(S, m3, det, order, 'S');
                var m4 = { v: m3 }; writeRegionSib(S, out, 4, det, order, m4); m3 = m4.v;
                maxR = m3; out = m3 + 1;
              }
            }
          }
          dr++;
        }
        dedupFrom = 0;
        return maxR;
      }
      // --- поиск полуфабриката по коду (способы 2-4)
      function findSemiByCode(code) {
        var f = NEP ? findCodeSA(NEP, 'A', code) : null;
        if (f) return { name: f.name, row: f.row, src: 'NEP' };
        f = findCodeSA(TD, 'A', code); if (f) return { name: f.name, row: f.row, src: 'TD' };
        f = findCodeSA(T2, 'B', code); if (f) return { name: f.name, row: f.row, src: 'TD2' };
        return null;
      }
      function findSemiPlain(code) {
        var f = NEP ? findCodeOrPrefix(NEP, 'A', code) : null;
        if (f) return { name: f.name, row: f.row, src: 'NEP' };
        f = findCodeOrPrefix(TD, 'A', code); if (f) return { name: f.name, row: f.row, src: 'TD' };
        f = findCodeOrPrefix(T2, 'B', code); if (f) return { name: f.name, row: f.row, src: 'TD2' };
        return null;
      }
      function srcValue(x) { if (x.src === 'TD') return TD.V(x.row); if (x.src === 'NEP') return NEP.V(x.row); var s = td2SumOf(x.name); return s !== null ? s : td2G(x.row); }
      function expandSemi(name, row, order) {
        if (NEP && findInCol(NEP, 'A', name)) return procSemi(NEP, name, row, order);
        if (findInCol(TD, 'A', name)) return procSemi(TD, name, row, order);
        return row;
      }
      // доп. серый вариант «-50 S» / «-50» (R 30xx/40xx/RS 90xx)
      function r30Extra(semi, order, cur, isDirect) {
        var fam = isDirect ? semi : order;
        if (!(isR30(fam) || isR40(fam) || isRS90(fam))) return cur;
        var hasS = / S$/i.test(cleanSp(semi)), x = null;
        if (!hasS) {
          x = findSemiPlain(semi + ' S');
          if (!x) { var sv = spaceVariant(semi); if (sv) x = findSemiPlain(sv + ' S'); }
          if (x) { var r = cur + 1; setD(r, x.name, x.src === 'TD' ? TD.V(x.row) : srcValue(x)); color(r, 'YA'); var m = expandSemi(x.name, r, order); return Math.max(cur, m, r); }
          if (!isDirect && (isR30(order) || isR40(order))) { var r2 = cur + 1; var s2 = td2SumOf(cleanSp(semi) + ' S'); setD(r2, cleanSp(semi) + ' S', s2 === null ? 0 : s2); color(r2, 'YA'); return r2; }
          return cur;
        }
        var bc = isDirect ? baseProductCode(semi) : bpc(order), c50 = bc ? bc + '-50' : '';
        if (c50) { x = findSemiPlain(c50); if (x && / S$/i.test(cleanSp(x.name))) x = null; }
        if (!x && c50) { var sv2 = spaceVariant(c50); if (sv2) { x = findSemiPlain(sv2); if (x && / S$/i.test(cleanSp(x.name))) x = null; } }
        if (x) { var r3 = cur + 1; setD(r3, x.name, x.src === 'TD' ? TD.V(x.row) : srcValue(x)); color(r3, 'YA'); var m3 = expandSemi(x.name, r3, order); return Math.max(cur, m3, r3); }
        if (!isDirect && (isR30(order) || isR40(order)) && c50) { var r4 = cur + 1, nm4 = cleanSp(cleanSp(semi).slice(0, -2)), s4 = td2SumOf(nm4); setD(r4, nm4, s4 === null ? 0 : s4); color(r4, 'YA'); return r4; }
        return cur;
      }
      // --- главный: блок одного заказа
      function build(orderRaw, opts) {
        G = {}; maxColUsed = 5; dedupFrom = 0; BASEOV = (opts && opts.base) || '';
        var order = cleanSp(orderRaw), raw = order, hn = hortNormalize(raw);
        if (hn !== raw && !findInCol(TD, 'A', raw) && !td2RowNR10(raw) && !(NEP && findInCol(NEP, 'A', raw))) order = hn;
        var T = 1, cur = T;
        if (/-50\s*S?(\s|$|\))/i.test(U(order))) {
          setD(T, order, null); color(T, 'Y');
          var fd = findInCol(TD, 'A', order), t2r = td2RowNR10(order), nr = NEP ? findInCol(NEP, 'A', order) : 0;
          if (t2r) { var s0 = td2SumOf(order); set(T, 5, s0 !== null ? s0 : td2G(t2r)); }
          else if (fd) set(T, 5, stockF(TD, fd, order)); else if (nr) set(T, 5, NEP.V(nr)); else set(T, 5, '');
          if (fd) { var wc = 6; for (var r = fd + 1; r <= TD.rows.length && !TD.A(r); r++) { var dv = TD.B(r); if (dv && isValidSemi(dv) && !isSrCr(dv)) { set(T, wc, dv); set(T, wc + 1, stockF(TD, r, dv)); wc += 2; } } }
          else if (nr) cur = procSemi(NEP, order, T, order);
          cur = r30Extra(order, order, cur, true);
          cur = ensureDisasm(order, T, cur);
          return finish(order, T, cur);
        }
        var isKit = isKitProduct(order);
        var fTD = findInCol(TD, 'A', order) || findInCol(TD, 'A', order + ' S');
        var nepC = [];
        if (NEP) {
          var nh = findInCol(NEP, 'A', order) || findInCol(NEP, 'A', order + ' S');
          if (nh) {
            var q = nh + 1; while (!NEP.A(q) && !NEP.B(q)) { q++; if (q > nh + MAX_GAP_SEARCH) break; }
            while (!NEP.A(q) && NEP.B(q)) { var cn = NEP.B(q); if (isValidSemi(cn) && nepC.length < 20) nepC.push({ name: cn, row: q }); q++; if (q > nh + MAX_GAP_SUBDETAILS + MAX_GAP_SEARCH) break; }
          }
        }
        var multi = false;
        if (fTD && !isKit && !nepC.length) { var cnt = 0, kr = fTD + 1; while (!TD.A(kr) && !TD.B(kr)) { kr++; if (kr > fTD + MAX_GAP_SEARCH) break; } while (!TD.A(kr) && TD.B(kr)) { var kn = TD.B(kr); if (isValidSemi(kn) && isKitSemiChild(kn)) cnt++; kr++; if (kr > fTD + 80) break; } multi = cnt >= 2; }
        var combo = comboCodes(order);
        if (fTD && (isKit || multi) && !nepC.length) {
          var k2 = fTD + 1, w = T; while (!TD.A(k2) && !TD.B(k2)) { k2++; if (k2 > fTD + MAX_GAP_SEARCH) break; }
          while (!TD.A(k2) && TD.B(k2)) {
            var cand = TD.B(k2);
            if (isValidSemi(cand) && (!multi || isKitSemiChild(cand))) {
              if (dName(w)) w = cur + 1;
              var tr = td2RowNR10(cand), sv2 = tr ? td2SumOf(cand) : null;
              setD(w, cand, tr ? (sv2 !== null ? sv2 : td2G(tr)) : TD.V(k2)); color(w, 'Y');
              var e2 = (NEP && findInCol(NEP, 'A', cand)) ? procSemi(NEP, cand, w, order) : (findInCol(TD, 'A', cand) ? procSemi(TD, cand, w, order) : w);
              cur = e2 > cur ? e2 : w;
            }
            k2++; if (k2 > fTD + 80) break;
          }
        } else if (!nepC.length && combo) {
          var cw = T;
          cur = comboHalf(cw, order, combo[0]); if (cur < cw) cur = cw;
          cw = cur + 1; var c2 = comboHalf(cw, order, combo[1]); if (c2 < cw) c2 = cw; if (c2 > cur) cur = c2;
        } else if (nepC.length >= 2) {
          var wn = T;
          nepC.forEach(function (c) {
            if (dName(wn)) wn = cur + 1;
            var tr2 = td2RowNR10(c.name), sv3 = tr2 ? td2SumOf(c.name) : null;
            setD(wn, c.name, tr2 ? (sv3 !== null ? sv3 : td2G(tr2)) : NEP.V(c.row)); color(wn, 'Y');
            var e3 = findInCol(NEP, 'A', c.name) ? procSemi(NEP, c.name, wn, order) : (findInCol(TD, 'A', c.name) ? procSemi(TD, c.name, wn, order) : wn);
            cur = e3 > cur ? e3 : wn;
          });
        } else {
          var semi = '', srow = 0, src = 'TD';
          if (NEP) {
            var n1 = findInCol(NEP, 'A', order) || findInCol(NEP, 'A', order + ' S');
            if (n1) { var sr2 = n1 + 1; while (!NEP.A(sr2) && !NEP.B(sr2)) { sr2++; if (sr2 > n1 + MAX_GAP_SEARCH) break; } var sn2 = NEP.B(sr2) || NEP.A(sr2); if (sn2 && isValidSemi(sn2)) { semi = sn2; srow = sr2; src = 'NEP'; } }
          }
          if (!semi && fTD) {
            var sr3 = fTD + 1; while (!TD.A(sr3) && !TD.B(sr3)) { sr3++; if (sr3 > fTD + MAX_GAP_SEARCH) break; }
            if (TD.B(sr3)) { semi = TD.B(sr3); srow = sr3; } else if (TD.A(sr3) && !isNested(TD.A(sr3))) { semi = TD.A(sr3); srow = sr3; }
            if (!(semi && isValidSemi(semi))) semi = '';
          }
          if (!semi) {
            var bc = bpc(order);
            if (bc) {
              var c50 = bc + '-50', x = null;
              if (/ S$/i.test(order)) x = findSemiByCode(c50 + ' S');
              if (!x) x = findSemiByCode(c50);
              if (!x && (isR30(order) || isR40(order))) x = findSemiByCode(c50 + ' S');
              if (x) { semi = x.name; srow = x.row; src = x.src; }
            }
          }
          if (semi) {
            var ev;
            if (src === 'TD') {
              var tv = TD.V(srow), bad = emptyOrZero(tv) || isWaste(tv);
              if (bad && (isR30(order) || isR40(order))) ev = 0;
              else if (bad) { var fb = td2RowNR10(semi) || td2RowNR10(semi + ' S'); ev = fb ? td2G(fb) : tv; }
              else ev = tv;
            } else if (src === 'TD2') { var ss = td2SumOf(semi); ev = ss !== null ? ss : td2G(srow); }
            else ev = NEP.V(srow);
            setD(T, semi, ev); color(T, 'Y');
            cur = expandSemi(semi, T, order);
            cur = r30Extra(semi, order, cur, false);
          }
        }
        cur = ensureBearing(order, T, cur);
        cur = ensureSecondOwner(order, fTD, cur);
        cur = ensureTopSiblings(order, fTD, cur, T);
        cur = ensureDisasm(order, T, cur);
        if (!dName(T)) { set(T, 4, 'НЕ НАЙДЕНО'); color(T, 'X'); }
        return finish(order, T, cur);
      }
      function comboHalf(r, order, half) {
        var c50 = half + '-50', x = null;
        if (/ S$/i.test(order)) x = findSemiPlain(c50 + ' S');
        if (!x) x = findSemiPlain(c50);
        if (!x) return r;
        var v;
        if (x.src === 'TD') { var tv = TD.V(x.row); v = (emptyOrZero(tv) || isWaste(tv)) ? '' : tv; } else v = srcValue(x);
        setD(r, x.name, v); color(r, 'Y');
        return expandSemi(x.name, r, order);
      }
      function ensureBearing(order, T, cur) {
        var o = U(order), bn = o.indexOf('NR 1011') === 0 ? 'Подшипник опоры стойки амортизатора Нексии G4214 GMB' : (o.indexOf('NR 1023') === 0 ? 'Подшипник чашки амортизатора Спарк G4115 GMB' : '');
        if (!bn) return cur;
        for (var r = T; r <= cur; r++) if (U(cell(r, 4)) === U(bn)) return cur;
        var w = cur + 1, fr = findClean(TD, bn);
        if (fr) { setD(w, bn, TD.V(fr)); return w; }
        var t = td2RowNR10(bn); if (t) { setD(w, bn, td2G(t)); return w; }
        return cur;
      }
      function looksS(n) { return /-S\d+\/\d+/i.test(cleanSp(n)); }
      function ensureSecondOwner(order, fTD, cur) {
        if (fTD <= 0) return cur;
        var bc = U(bpc(order)); if (!bc) return cur;
        var from = fTD + 1;
        for (var loop = 0; loop < 5; loop++) {
          var fr = 0, nm = '';
          for (var r = from; r <= from + MAX_GAP_SEARCH; r++) {
            var b = TD.B(r), a = TD.A(r);
            if (b && looksS(b) && U(b).indexOf(bc) === 0) { fr = r; nm = b; break; }
            if (a && looksS(a) && U(a).indexOf(bc) === 0) { fr = r; nm = a; break; }
            if (a) break;
          }
          if (!fr) break;
          var have = false; for (var rc = 1; rc <= cur; rc++) if (U(cell(rc, 4)) === U(nm)) { have = true; break; }
          if (!have) {
            var w = cur + 1; setD(w, nm, TD.V(fr)); color(w, 'Y');
            var mxw = w;
            if (findInCol(TD, 'A', nm)) mxw = procSemi(TD, nm, w, order);
            else { var mm = { v: w }, cc = { v: 6 }; if (!tryExpandNR1M(TD, w, cc, nm, order, 0, mm)) nr1Fallback(w, 6, nm); mxw = mm.v; }
            if (mxw > cur) cur = mxw;
          }
          from = fr + 1;
        }
        return cur;
      }
      function ensureTopSiblings(order, fTD, cur, top) {
        if (fTD <= 0) return cur;
        var isR90 = isR90Series(order), safety = 0;
        for (var r = fTD + 1; !TD.A(r) && r <= TD.rows.length; r++) {
          var nm = TD.B(r);
          if (nm && isValidSemi(nm)) {
            var have = false; for (var rc = top; rc <= cur; rc++) if (U(cell(rc, 4)) === U(nm)) { have = true; break; }
            if (!have) {
              var w = cur + 1, mx = w;
              var semiLike = isSemi50Code(nm) && !isMainNotSemi(nm);
              if (semiLike) {
                var tv = TD.V(r), s2 = td2SumOf(nm);
                setD(w, nm, (!emptyOrZero(tv) && !isWaste(tv)) ? tv : (s2 !== null ? s2 : tv)); color(w, 'Y');
                if (findInCol(TD, 'A', nm)) mx = procSemi(TD, nm, w, order);
              } else {
                setD(w, nm, stockF(TD, r, nm)); color(w, isDash11(nm) ? 'O6' : 'B');
                var m = { v: w }; if (!isSrCr(nm)) { if (isR90) subR90(TD, nm, w, order, m); else subExact(TD, nm, w, order, m); }
                var m2 = m.v; m2 = tryAddVariant(TD, m2, nm, order, 'M'); m2 = tryAddVariant(TD, m2, nm, order, 'GM'); m2 = tryAddVariant(TD, m2, nm, order, 'S');
                var mm = { v: m2 }; writeRegionSib(TD, w, 4, nm, order, mm); mx = mm.v;
              }
              if (mx > cur) cur = mx;
            }
          }
          safety++; if (safety > 80) break;
        }
        return cur;
      }
      var DISASM = { "R3003": ["", "", "R 3003-03 D (24C)", "", "", "R 3003-50", "R 3003"], "R3004/1": ["R 3004/1-01/13 S", "R 3004/1-02/13 S", "R 3004/1-03 D (25C)", "", "", "R 3004/1-50", "R 3004/1"], "R3005": ["R 3005-01/13 S", "R 3005-02/13 S", "R 3004/1-03 D (25C)", "", "", "R 3005-50", "R 3005"], "R3010": ["R 3010-01/13 S", "R 3010-02/13 S", "R 3004/1-03 D (25C)", "", "", "R 3010-50", "R 3010"], "R3016": ["R 3016-01/13 S", "R 3016-02/13 S", "", "", "", "R 3016-50", "R 3016"], "R3048": ["R 3048-01/13 S", "R 3048-02/13 S", "R 3004/1-03 D (25C)", "", "", "R 3048-50", "R 3048"], "R3049": ["R 3049-01/13 S", "R 3049-02/13 S", "R 3004/1-03 D (25C)", "", "", "R 3049-50", "R 3049"], "R3150": ["", "", "R 3004/1-03 D (25C)", "", "", "R 3150-50 S", "R 3150"], "R3152": ["", "", "R 3004/1-03 D (25C)", "", "", "R 3152-50 S", "R 3152"], "RS3014": ["RS 3014-01/13 S", "RS 3014-02/13 S", "RS 3014-03 D", "", "", "RS 3014-50", "RS 3014"], "RS3015": ["", "", "RS 3014-03 D", "", "", "RS 3015-50", "RS 3015"], "RS3026": ["RS 3026-01/13 S", "RS 3026-02/13 S", "R 3004/1-03 D (25C)", "", "", "RS 3026-50", "RS 3026"], "R4001FL": ["R 4001FL-01/13 S", "R 4001-02/13 S", "R 4001-03 D (18C-1)", "R 4001-04 CR-C", "R 4001-06/13 M", "R 4001FL-50", "R 4001FL"], "R4001FR": ["R 4001FR-01/13 S", "R 4001-02/13 S", "R 4001-03 D (18C-1)", "R 4001-04 CR-C", "R 4001-06/13 M", "R 4001FR-50", "R 4001FR"], "R4001R": ["", "", "", "", "", "R 4001R-50", "R 4001R"], "R4002F": ["R 4002F-01/13 S", "R 4002-02/13 S", "-", "R 4002-04 CR-C", "-", "R 4002F-50", "R 4002F"], "R4004F": ["R 4004F-01/13 S", "R 4004-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "R 4004F-50", "R 4004F"], "R4008": ["R 4008-01/13 S", "R 4008-02/13 S", "-", "R 4002-04 CR-C", "-", "R 4008-50", "R 4008"], "R4010F": ["R 4010F-01/13 S", "R 4010-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "R 4010F-50", "R 4010F"], "R4011R": ["R 4011R-01/13 S", "R 4011-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "R 4011R-50", "R 4011R"], "R4012F": ["R 4012F-01/13 S", "R 4012-02/13 S", "", "", "", "R 4012F-50", "R 4012F"], "R4013F": ["R 4013F-01/13 S", "R 4013-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "R 4013F-50", "R 4013F"], "R4015": ["R 4015-01/13 S", "R 4015-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "R 4015-50", "R 4015"], "R4016": ["R 4016-01/13 S", "R 4016-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "R 4016-50", "R 4016"], "R4019": ["R 4019-01/13 S", "R 4019-02/13 S", "R 4001-03 D (18C-1)", "R 4001-04 CR-C", "R 4001-06/13 M", "R 4019-50", "R 4019"], "R4094FR": ["R 4094FR-01/13 S", "R 4094-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "R 4094FR-50 S", "R 4094FR (R 4037FR)"], "R4094FL": ["R 4094FL-01/13 S", "R 4094-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "R 4094FL-50 S", "R 4094FL (R 4037FL)"], "R4073F": ["R 4073F-01/13 S", "R 4073-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "R 4073F-50 S", "R 4073F"], "RS4015": ["RS 4015-01/13 S", "RS 4015-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "RS 4015-50", "RS 4015"], "RS4026F": ["RS 4026F-01/13 S", "RS 4026-02/13 S", "R 4004-03 D (20C-1)", "R 4004-04 CR-C", "R 4004-06/13 M", "RS 4026F-50", "RS 4026F"] };
      if (D.disasm) Object.keys(D.disasm).forEach(function (k) { DISASM[k.toUpperCase()] = D.disasm[k]; });
      function varBase(n) { var t = U(n); if (/ [MS]$/.test(t)) t = cleanSp(t.slice(0, -2)); return kLat(t); }
      function insertRow(at) { var keys = Object.keys(G).map(Number).sort(function (a, b) { return b - a; }); keys.forEach(function (k) { if (k >= at) { G[k + 1] = G[k]; delete G[k]; } }); }
      function ensureDisasm(order, T, cur) {
        if (cur < T) cur = T;
        var t = cleanSp(order), mb = t.match(/^(.+?)\s+(TRT|RS|HORT)\b/i), ok = mb ? U(mb[1]).replace(/ /g, '') : '';
        if (ok && !DISASM[ok] && D.alias && D.alias[ok] && DISASM[D.alias[ok]]) ok = D.alias[ok];
        if (!dName(T)) {
          if (!ok || !DISASM[ok] || !DISASM[ok][5]) return cur;
          var s = td2SumOf(DISASM[ok][5]); setD(T, DISASM[ok][5], s === null ? 0 : s); color(T, 'Y');
        }
        var ys = []; for (var r = T; r <= cur; r++) if (dName(r) && G[r].cls === 'Y') ys.push(r);
        if (!ys.length) return cur;
        for (var yi = ys.length - 1; yi >= 0; yi--) {
          var st = ys[yi], en = yi < ys.length - 1 ? ys[yi + 1] - 1 : cur, sn = U(dName(st)), key = '', q = sn.indexOf('-50');
          if (q > 0) key = sn.slice(0, q).replace(/ /g, '');
          if (!key || !DISASM[key]) { key = ''; if (ys.length === 1 && ok && DISASM[ok]) key = ok; }
          if (!key) continue;
          var arr = DISASM[key];
          for (var j = 0; j <= 4; j++) {
            var nm = cleanSp(arr[j]); if (!nm || nm === '-') continue;
            var have = false; for (var rr = st; rr <= en; rr++) if (dName(rr) && varBase(dName(rr)) === varBase(nm)) { have = true; break; }
            if (have) continue;
            var w = en + 1;
            if (yi < ys.length - 1) { insertRow(w); cur++; }
            var sv = td2SumOf(nm); setD(w, nm, sv === null ? 0 : sv); color(w, 'B'); en = w;
            if (yi === ys.length - 1) {
              cur = w; dedupFrom = st + 1;
              cur = tryAddVariant(TD, cur, nm, order, 'M'); cur = tryAddVariant(TD, cur, nm, order, 'S'); dedupFrom = 0; en = cur;
            } else {
              for (var vk = 1; vk <= 3; vk++) {
                var vn = nm; if (/ [MS]$/i.test(vn)) vn = cleanSp(vn.slice(0, -2));
                if (vk === 1) vn += ' M'; if (vk === 3) vn += ' S';
                if (U(vn) !== U(nm)) { var vf = td2SumOf(vn); if (vf !== null) { en++; insertRow(en); cur++; setD(en, vn, vf); color(en, 'BL'); } }
              }
            }
          }
        }
        return cur;
      }
      // --- постобработка блока: (Отход)->0, материалы втулок и пыльников
      function finish(order, T, cur) {
        var r, c;
        for (r = T; r <= cur; r++) for (c = 5; c <= maxColUsed + 1; c += 2) { var v = cell(r, c); if (typeof v === 'string' && /\(Отход\)/i.test(v)) set(r, c, 0); }
        var has = {};
        for (r = T; r <= cur; r++) { var first = ''; for (c = 4; c <= maxColUsed; c += 2) { var nm = cleanSp(cell(r, c)); if (!nm) continue; if (!first) first = nm; if (isRawName(nm) && U(nm).slice(0, 2) !== 'SR' && first !== nm) { var fm = extractNR1S(first); if (fm) has[fm] = 1; } } }
        for (r = T; r <= cur; r++) {
          var last = '', lc = 0;
          for (c = 4; c <= maxColUsed; c += 2) { var n2 = cleanSp(cell(r, c)); if (n2) { last = n2; lc = c; } }
          if (!last || !lc) continue;
          if (!isRawName(last) && /\/0[12]( [MS])?$/i.test(last)) {
            var fam = extractNR1S(last);
            if (fam && !has[fam] && D.bush[fam]) { var mat = D.bush[fam][0]; if (mat) { var nc = nr1Fallback(r, lc + 2, last); if (nc === lc + 2) { set(r, lc + 2, mat); set(r, lc + 3, 0); } has[fam] = 1; } }
          } else if (!isRawName(last)) {
            var dk = detailNormKey(last);
            if (D.matRef[dk] && !has['DM|' + dk]) {
              var mt = D.matRef[dk][0], tt = td2Tolerance(mt);
              if (tt) { set(r, lc + 2, tt.name); set(r, lc + 3, tt.v); }
              else { var ms = materialStockTD2(mt); if (ms) { set(r, lc + 2, ms.name); set(r, lc + 3, ms.v); } else { set(r, lc + 2, mt); set(r, lc + 3, 0); } }
              has['DM|' + dk] = 1;
            }
          }
        }
        var rows = [];
        for (r = T; r <= cur; r++) {
          var x = G[r] || { c: {}, cls: null }, v = [null, null, null], mc = 0;
          Object.keys(x.c).forEach(function (k) { if (+k > mc) mc = +k; });
          for (c = 4; c <= mc; c++) v.push(x.c[c] === undefined ? null : x.c[c]);
          var ro = { v: v, cls: x.cls || 'W' }; if (x.ref) ro.ref = x.ref.map(function (c) { return c - 1; }); rows.push(ro);
        }
        return { order: order, rows: rows };
      }
      function found(b) { return b.rows.some(function (r) { return r.cls === 'Y'; }); }
      /* Как макрос; если макрос не нашёл бы (бренд RS/«/2H» в названии сбивает GetBaseProductCode) - повтор с кодом до бренда */
      var MEMO = {};
      function best(name) {
        var mk = U(name); if (MEMO[mk]) return MEMO[mk];
        return (MEMO[mk] = best0(name));
      }
      function best0(name) {
        var b = build(name);
        if (found(b)) return b;
        var m = cleanSp(name).match(/^(.+?)\s+(TRT|RS|HORT)\b/i);
        if (m && U(m[1]) !== U(baseProductCode(name))) { var b2 = build(name, { base: cleanSp(m[1]) }); if (found(b2)) { b2.alias = cleanSp(m[1]); b2.brand = m[2].toUpperCase(); return b2; } }
        /* лист «-» книги: код = код (например R8182R=R8180R) — состав берётся у второго */
        var ak = m ? U(m[1]).replace(/\s+/g, '') : '', al = ak && D.alias ? D.alias[ak] : '';
        if (al) { var bb = al.replace(/^([A-Z]+)\s*(\d)/, '$1 $2'), b3 = build(name, { base: bb }); if (found(b3)) { b3.alias = bb; b3.brand = m[2].toUpperCase(); return b3; } }
        return b;
      }
      return { build: build, best: best, found: found, fresh: !!D.fresh, disasm: DISASM };
    }
    /* Проверенный состав (kgdb.spec): узлы, которых нет ни в TDSheet, ни в NEP, добавляются в конец NEP как обычные строки
       (заголовок + дети, колонка C = остаток TDSheet2), чтобы построитель блока нашёл их как макрос. Болты/проволока (флаг 'x') не добавляются. */
    function specNepRows(spec, tdRows, nepRows, td2rows) {
      var has = {}, st = {}, out = [];
      (tdRows || []).forEach(function (r) { var a = cleanSp(r[0]); if (a) has[a.toUpperCase()] = 1; });
      (nepRows || []).forEach(function (r) { var a = cleanSp(r[0]); if (a) has[a.toUpperCase()] = 1; });
      (td2rows || []).forEach(function (x) { if (EXCL_WH.indexOf(cleanSp(x[3]).toUpperCase()) >= 0) return; var k = cleanSp(x[0]).toUpperCase(); if (typeof x[1] === 'number') st[k] = (st[k] || 0) + x[1]; else if (!(k in st)) st[k] = null; });
      var sv = function (n) { var k = cleanSp(n).toUpperCase(); return k in st ? st[k] : null; };
      Object.keys(spec || {}).forEach(function (p) {
        if (has[cleanSp(p).toUpperCase()]) return;
        out.push([p, null, sv(p)]);
        (spec[p].kids || []).forEach(function (c) { if (c[3] !== 'x') out.push([null, c[0], sv(c[0])]); });
      });
      return out;
    }
    /* Сверка построенного блока с блоком листа Обработка (по строкам: D..; подписи «(N шт …)», «Справочник Втулки состав», #REF! не сравниваются) */
    function obrCellNorm(v) { if (v === null || v === undefined || v === '') return ''; if (typeof v === 'number') return String(Math.round(v * 1000) / 1000); var s = cleanSp(String(v)); return /^-?\d+(\.\d+)?$/.test(s) ? String(Math.round(parseFloat(s) * 1000) / 1000) : s; }
    function obrIsAnn(x) { if (typeof x !== 'string') return false; var t = x.trim(); return /^\(.*шт/.test(t) || t === 'Справочник Втулки состав' || /^#[A-Z]/.test(t); }
    function obrRowCells(rw, other) { var v = (rw ? rw.v : []).slice(3).map(function (x, i) { return obrIsAnn(x) || (other && obrIsAnn(other.v[i + 3])) ? '' : obrCellNorm(x); }); while (v.length && v[v.length - 1] === '') v.pop(); return v; }
    function compareObrBlocks(built, sheet) {
      var A = (sheet || []).slice(), Bb = (built || []).slice();
      var nonEmpty = function (r) { return r && r.v.slice(3).some(function (x) { return x !== null && x !== undefined && x !== ''; }); };
      while (A.length && !nonEmpty(A[A.length - 1])) A.pop();
      while (Bb.length && !nonEmpty(Bb[Bb.length - 1])) Bb.pop();
      var n = Math.max(A.length, Bb.length), diffs = [];
      for (var i = 0; i < n; i++) {
        var e = obrRowCells(A[i]), g = obrRowCells(Bb[i], A[i]), ec = A[i] ? (A[i].cls || 'W') : '', gc = Bb[i] ? (Bb[i].cls || 'W') : '';
        if (e.join('|') !== g.join('|') || ec !== gc) diffs.push({ i: i, exp: e, got: g, ec: ec, gc: gc });
      }
      return { n: n, same: diffs.length === 0, diffs: diffs };
    }
