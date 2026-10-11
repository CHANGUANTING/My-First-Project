/*
 * 界面逻辑。所有用户输入都用 textContent / value 渲染，不拼接 innerHTML。
 */
(function () {
  'use strict';

  var C = window.FACalc;
  var R = window.FARisks;
  var F = window.FAFormat;
  var S = window.FAStorage;

  var state;
  var selectedId = null;
  var charts = [];

  // ---------- DOM 工具 ----------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') node.textContent = v;
        else if (k === 'className') node.className = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function $(id) { return document.getElementById(id); }

  var msgTimer = null;
  function showMessage(text, isError) {
    var box = $('message');
    box.textContent = text;
    box.className = 'message' + (isError ? ' error' : '');
    box.hidden = false;
    clearTimeout(msgTimer);
    if (!isError) msgTimer = setTimeout(function () { box.hidden = true; }, 3000);
  }

  function persist() {
    var err = S.save(state);
    if (err) showMessage(err, true);
  }

  function current() {
    for (var i = 0; i < state.companies.length; i++) {
      if (state.companies[i].id === selectedId) return state.companies[i];
    }
    return null;
  }

  function unitLabel(unit) {
    for (var i = 0; i < F.UNITS.length; i++) if (F.UNITS[i].value === unit) return F.UNITS[i].label;
    return '';
  }

  // ---------- 公司列表 ----------

  function renderList() {
    var list = $('companyList');
    list.textContent = '';
    if (state.companies.length === 0) {
      list.appendChild(el('li', { className: 'empty', text: '暂无公司' }));
      return;
    }
    state.companies.forEach(function (c) {
      var meta = [c.ticker, c.market === 'MY' ? '马股' : '美股', c.currency].filter(Boolean).join(' · ');
      list.appendChild(el('li', null, [
        el('button', {
          type: 'button',
          className: c.id === selectedId ? 'active' : '',
          onclick: function () { select(c.id); }
        }, [el('span', { text: c.name }), el('span', { className: 'meta', text: meta })])
      ]));
    });
  }

  function select(id) {
    selectedId = id;
    renderList();
    renderMain();
  }

  // ---------- 主区域 ----------

  function renderMain() {
    destroyCharts();
    var main = $('main');
    main.textContent = '';
    var c = current();
    if (!c) {
      main.appendChild(el('section', { className: 'card' }, [
        el('h2', { text: '开始使用' }),
        el('p', { className: 'empty', text: '点击「新增公司」录入财务数据，或点击「载入示例数据」查看效果。' })
      ]));
      return;
    }
    main.appendChild(renderInfo(c));
    main.appendChild(renderDataTable(c));
    main.appendChild(el('div', { id: 'analysis' }));
    renderAnalysis(c);
  }

  function renderInfo(c) {
    function onInfoChange() {
      persist();
      renderList();
      renderAnalysis(c);
    }

    var name = el('input', { type: 'text', value: c.name, maxlength: 60 });
    name.addEventListener('change', function () {
      c.name = name.value.trim() || '未命名公司';
      name.value = c.name;
      onInfoChange();
    });

    var ticker = el('input', { type: 'text', value: c.ticker, maxlength: 20 });
    ticker.addEventListener('change', function () {
      c.ticker = ticker.value.trim().toUpperCase();
      ticker.value = c.ticker;
      onInfoChange();
    });

    var currency = el('select', null, Object.keys(F.CURRENCIES).map(function (k) {
      return el('option', { value: k, text: F.CURRENCIES[k].label, selected: c.currency === k });
    }));
    currency.addEventListener('change', function () { c.currency = currency.value; onInfoChange(); });

    var market = el('select', null, [
      el('option', { value: 'US', text: '美股', selected: c.market === 'US' }),
      el('option', { value: 'MY', text: '马股', selected: c.market === 'MY' })
    ]);
    market.addEventListener('change', function () {
      c.market = market.value;
      c.currency = c.market === 'MY' ? 'MYR' : 'USD';
      currency.value = c.currency;
      onInfoChange();
    });

    var unit = el('select', null, F.UNITS.map(function (u) {
      return el('option', { value: String(u.value), text: u.label, selected: c.unit === u.value });
    }));
    unit.addEventListener('change', function () { c.unit = Number(unit.value); onInfoChange(); });

    return el('section', { className: 'card' }, [
      el('div', { className: 'card-head' }, [
        el('h2', { text: '公司信息' }),
        el('button', { type: 'button', className: 'danger small', text: '删除公司', onclick: function () { deleteCompany(c); } })
      ]),
      el('div', { className: 'form-grid' }, [
        el('label', null, ['公司名称', name]),
        el('label', null, ['股票代码', ticker]),
        el('label', null, ['市场', market]),
        el('label', null, ['报表币种', currency]),
        el('label', null, ['金额与股数单位', unit])
      ])
    ]);
  }

  function renderDataTable(c) {
    var thead = el('tr', null, [el('th', { text: '项目' })]);
    c.years.forEach(function (y) {
      var yearInput = el('input', { type: 'text', inputmode: 'numeric', value: String(y.year), 'aria-label': '年份' });
      yearInput.addEventListener('change', function () { changeYear(c, y, yearInput); });
      thead.appendChild(el('th', null, [
        el('div', { className: 'year-head' }, [
          yearInput,
          el('button', { type: 'button', className: 'small danger', text: '删除', onclick: function () { deleteYear(c, y); } })
        ])
      ]));
    });

    var tbody = el('tbody');
    var lastGroup = null;
    C.FIELDS.forEach(function (f) {
      if (f.group !== lastGroup) {
        lastGroup = f.group;
        tbody.appendChild(el('tr', { className: 'group' }, [el('td', { colspan: String(c.years.length + 1), text: f.group })]));
      }
      var tr = el('tr', null, [el('td', { text: f.label + (f.kind === 'price' ? '（每股）' : '') })]);
      c.years.forEach(function (y) {
        var input = el('input', {
          type: 'text',
          inputmode: 'decimal',
          value: F.raw(y[f.key]),
          placeholder: '—',
          'aria-label': y.year + '年 ' + f.label
        });
        input.addEventListener('change', function () { changeValue(c, y, f, input); });
        tr.appendChild(el('td', null, [input]));
      });
      tbody.appendChild(tr);
    });

    var unitText = unitLabel(c.unit);
    return el('section', { className: 'card' }, [
      el('div', { className: 'card-head' }, [
        el('h2', { text: '财务数据' }),
        el('button', { type: 'button', className: 'small', text: '＋ 添加年份', onclick: function () { addYear(c); } })
      ]),
      el('p', {
        className: 'hint',
        text: '金额与股数单位：' + unitText + '（' + c.currency + '）。股价按每股实际价格填写。' +
          '留空表示无数据（不会当作 0）；负数可填 -100 或 (100)；修改后自动保存。'
      }),
      c.years.length === 0
        ? el('p', { className: 'empty', text: '还没有年度数据，请点击「添加年份」。' })
        : el('div', { className: 'table-wrap' }, [el('table', { className: 'data-table' }, [el('thead', null, [thead]), tbody])])
    ]);
  }

  function changeValue(c, y, f, input) {
    var parsed = C.parseInput(input.value);
    if (!parsed.ok) {
      input.classList.add('invalid');
      showMessage(y.year + '年「' + f.label + '」输入无效，请输入数字（未保存）。', true);
      return;
    }
    input.classList.remove('invalid');
    y[f.key] = parsed.value;
    input.value = F.raw(parsed.value);
    persist();
    renderAnalysis(c);
  }

  function changeYear(c, y, input) {
    var v = Number(String(input.value).trim());
    if (!Number.isInteger(v) || v < 1900 || v > 2100) {
      input.classList.add('invalid');
      showMessage('年份需为 1900–2100 之间的整数（未保存）。', true);
      return;
    }
    var dup = c.years.some(function (o) { return o !== y && o.year === v; });
    if (dup) {
      input.classList.add('invalid');
      showMessage(v + ' 年已存在（未保存）。', true);
      return;
    }
    y.year = v;
    c.years.sort(function (a, b) { return a.year - b.year; });
    persist();
    renderMain();
  }

  function addYear(c) {
    var year = c.years.length
      ? Math.max.apply(null, c.years.map(function (y) { return y.year; })) + 1
      : new Date().getFullYear() - 1;
    if (year > 2100) {
      showMessage('无法再添加年份。', true);
      return;
    }
    c.years.push(S.emptyYear(year));
    c.years.sort(function (a, b) { return a.year - b.year; });
    persist();
    renderMain();
  }

  function deleteYear(c, y) {
    if (!window.confirm('确定删除 ' + y.year + ' 年的数据吗？')) return;
    c.years = c.years.filter(function (o) { return o !== y; });
    persist();
    renderMain();
  }

  function deleteCompany(c) {
    if (!window.confirm('确定删除「' + c.name + '」及其全部数据吗？此操作无法撤销。')) return;
    state.companies = state.companies.filter(function (o) { return o !== c; });
    persist();
    select(state.companies.length ? state.companies[0].id : null);
  }

  // ---------- 分析结果 ----------

  function formatRatio(fmt, value, c) {
    if (fmt === 'pct') return F.pct(value);
    if (fmt === 'x') return F.times(value);
    if (fmt === 'money') return F.money(value, c.currency, c.unit);
    if (fmt === 'perShare') return F.perShare(value, c.currency);
    return F.DASH;
  }

  function ratioCell(res, text) {
    var td = el('td', { className: C.isNum(res.value) && res.value < 0 ? 'neg' : '' }, [text]);
    // 「数据不足」不额外显示；其余说明（如亏损、基数为负）直接显示，手机上也能看到
    if (res.note && res.note !== '数据不足') {
      td.appendChild(el('span', { className: 'note', text: res.note }));
    }
    return td;
  }

  function renderAnalysis(c) {
    var box = $('analysis');
    if (!box) return;
    destroyCharts();
    box.textContent = '';

    if (c.years.length === 0) return;
    var rows = C.analyze(c.years);

    box.appendChild(renderRisks(rows));
    box.appendChild(renderRatioTable(rows, c));
    box.appendChild(renderCharts(rows, c));
  }

  function renderRisks(rows) {
    var risks = R.assess(rows);
    var body;
    if (risks.length === 0) {
      body = el('p', { className: 'ok', text: '根据现有数据，未发现明显风险信号。数据越完整，检查越准确。' });
    } else {
      body = el('ul', { className: 'risk-list' }, risks.map(function (r) {
        var high = r.level === R.HIGH;
        return el('li', { className: high ? 'high' : 'mid' }, [
          el('span', { className: 'badge', text: (high ? '▲ 高风险' : '● 注意') }),
          el('span', { className: 'year', text: r.year + '年' }),
          el('span', { text: r.message })
        ]);
      }));
    }
    var highCount = risks.filter(function (r) { return r.level === R.HIGH; }).length;
    return el('section', { className: 'card' }, [
      el('div', { className: 'card-head' }, [
        el('h2', { text: '风险提示' }),
        el('span', { className: 'hint', text: '共 ' + risks.length + ' 条，其中高风险 ' + highCount + ' 条' })
      ]),
      body
    ]);
  }

  function renderRatioTable(rows, c) {
    var head = el('tr', null, [el('th', { text: '指标' })].concat(rows.map(function (r) {
      return el('th', { text: String(r.year) });
    })));
    var tbody = el('tbody');

    tbody.appendChild(el('tr', { className: 'group' }, [el('td', { colspan: String(rows.length + 1), text: '财务比率' })]));
    C.RATIOS.forEach(function (def) {
      tbody.appendChild(el('tr', null, [el('td', { text: def.label })].concat(rows.map(function (r) {
        var res = r.ratios[def.key];
        return ratioCell(res, formatRatio(def.fmt, res.value, c));
      }))));
    });

    tbody.appendChild(el('tr', { className: 'group' }, [el('td', { colspan: String(rows.length + 1), text: '同比增长' })]));
    C.GROWTHS.forEach(function (def) {
      tbody.appendChild(el('tr', null, [el('td', { text: def.label })].concat(rows.map(function (r) {
        var res = r.growth[def.key];
        return ratioCell(res, F.pct(res.value));
      }))));
    });

    return el('section', { className: 'card' }, [
      el('h2', { text: '财务比率' }),
      el('div', { className: 'table-wrap' }, [el('table', null, [el('thead', null, [head]), tbody])]),
      el('p', { className: 'hint', text: '「—」表示数据不足或该指标在此情况下无意义。ROE 使用期末股东权益；自由现金流 = 经营现金流 − 资本开支。' })
    ]);
  }

  // ---------- 图表 ----------

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function destroyCharts() {
    charts.forEach(function (ch) { ch.destroy(); });
    charts = [];
  }

  function chartCard(title) {
    var canvas = el('canvas', { role: 'img', 'aria-label': title });
    var card = el('div', { className: 'card' }, [el('h3', { text: title }), el('div', { className: 'chart-box' }, [canvas])]);
    return { card: card, canvas: canvas };
  }

  /*
   * series: [{ label, data: [number|null] }]
   * tickFmt / tipFmt: 数值 → 文本
   */
  function lineChart(canvas, years, series, tickFmt, tipFmt) {
    var text2 = cssVar('--text-2');
    var grid = cssVar('--grid');
    var surface = cssVar('--surface');
    var zero = cssVar('--text-3');
    var colors = [cssVar('--series-1'), cssVar('--series-2'), cssVar('--series-3'), cssVar('--series-4')];

    var ch = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: years.map(String),
        datasets: series.map(function (s, i) {
          return {
            label: s.label,
            data: s.data,
            borderColor: colors[i],
            backgroundColor: colors[i],
            pointBackgroundColor: colors[i],
            pointBorderColor: surface,
            pointBorderWidth: 2,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: false // null 断开，不画成 0
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: series.length > 1,
            position: 'top',
            align: 'start',
            labels: { color: text2, boxWidth: 12, boxHeight: 12, usePointStyle: true }
          },
          tooltip: {
            callbacks: {
              title: function (items) { return items.length ? items[0].label + '年' : ''; },
              label: function (item) {
                return item.dataset.label + '：' + (item.raw === null ? F.DASH : tipFmt(item.raw));
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: text2 }, grid: { display: false }, border: { color: grid } },
          y: {
            ticks: { color: text2, callback: function (v) { return tickFmt(v); } },
            grid: {
              color: function (ctx) { return ctx.tick && ctx.tick.value === 0 ? zero : grid; },
              lineWidth: function (ctx) { return ctx.tick && ctx.tick.value === 0 ? 1.5 : 1; }
            },
            border: { display: false }
          }
        }
      }
    });
    charts.push(ch);
  }

  function renderCharts(rows, c) {
    var years = rows.map(function (r) { return r.year; });
    var data = function (key) { return rows.map(function (r) { return C.isNum(r.data[key]) ? r.data[key] : null; }); };
    var ratio = function (key) { return rows.map(function (r) { return r.ratios[key].value; }); };
    var money = function (v) { return F.money(v, c.currency, c.unit); };
    var pct0 = function (v) { return F.pct(v, 0); };
    var times = function (v) { return Number(v).toFixed(1) + '倍'; };

    var defs = [
      { title: '营业收入', series: [{ label: '营业收入', data: data('revenue') }], tick: money, tip: money },
      {
        title: '净利润与现金流',
        series: [
          { label: '净利润', data: data('netIncome') },
          { label: '经营现金流', data: data('operatingCashFlow') },
          { label: '自由现金流', data: ratio('freeCashFlow') }
        ],
        tick: money, tip: money
      },
      {
        title: '利润率与 ROE',
        series: [
          { label: '毛利率', data: ratio('grossMargin') },
          { label: '净利率', data: ratio('netMargin') },
          { label: 'ROE', data: ratio('roe') }
        ],
        tick: pct0, tip: function (v) { return F.pct(v); }
      },
      { title: '负债率', series: [{ label: '负债率', data: ratio('debtRatio') }], tick: pct0, tip: function (v) { return F.pct(v); } },
      { title: '流动比率', series: [{ label: '流动比率', data: ratio('currentRatio') }], tick: times, tip: F.times },
      { title: '市盈率 PE（亏损年份不显示）', series: [{ label: '市盈率', data: ratio('pe') }], tick: times, tip: F.times }
    ];

    var grid = el('div', { className: 'charts' });
    var pending = [];
    defs.forEach(function (d) {
      var cc = chartCard(d.title);
      grid.appendChild(cc.card);
      pending.push(function () { lineChart(cc.canvas, years, d.series, d.tick, d.tip); });
    });

    var section = el('section', null, [
      el('h2', { text: '多年趋势' }),
      grid
    ]);
    // 等元素挂到页面后再绘制，Chart.js 才能拿到尺寸
    requestAnimationFrame(function () {
      if (!window.Chart) {
        showMessage('图表库加载失败，无法显示趋势图。', true);
        return;
      }
      pending.forEach(function (fn) { fn(); });
    });
    return section;
  }

  // ---------- 工具栏 ----------

  function addCompany() {
    var c = S.normalizeCompany({ name: '新公司', market: 'US', currency: 'USD', unit: 1e6, years: [] });
    c.years.push(S.emptyYear(new Date().getFullYear() - 1));
    state.companies.push(c);
    persist();
    select(c.id);
  }

  function loadSample() {
    var samples = S.sampleCompanies();
    state.companies = state.companies.concat(samples);
    persist();
    select(samples[0].id);
    showMessage('已添加 2 家示例公司（数据为虚构）。');
  }

  function exportData() {
    var blob = new Blob([S.exportJSON(state)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: '基本面数据-' + new Date().toISOString().slice(0, 10) + '.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var res = S.importJSON(String(reader.result));
      if (res.error) {
        showMessage('导入失败：' + res.error, true);
        return;
      }
      if (state.companies.length && !window.confirm('导入将替换当前全部数据（' + state.companies.length + ' 家公司），确定吗？')) return;
      state = res.state;
      persist();
      select(state.companies.length ? state.companies[0].id : null);
      showMessage('导入成功，共 ' + state.companies.length + ' 家公司。');
    };
    reader.onerror = function () { showMessage('读取文件失败。', true); };
    reader.readAsText(file);
  }

  // ---------- 启动 ----------

  function init() {
    var loaded = S.load();
    state = loaded.state;
    if (loaded.error) showMessage(loaded.error, true);

    $('btnAddCompany').addEventListener('click', addCompany);
    $('btnSample').addEventListener('click', loadSample);
    $('btnExport').addEventListener('click', exportData);
    $('btnImport').addEventListener('click', function () { $('fileImport').click(); });
    $('fileImport').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });

    // 切换浅色 / 深色时重绘图表颜色
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var redraw = function () { var c = current(); if (c) renderAnalysis(c); };
      if (mq.addEventListener) mq.addEventListener('change', redraw);
    }

    select(state.companies.length ? state.companies[0].id : null);
  }

  init();
})();
