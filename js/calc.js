/*
 * 财务计算纯函数（无 DOM）。
 * 规则：空值是 null，不是 0；任何输入为 null / 非有限数 → 结果为 null；
 * 除数为 0 → null；除数为负且无经济意义 → null 并附中文说明 note。
 */
(function (root) {
  'use strict';

  // 录入字段（顺序即表格行顺序）
  var FIELDS = [
    { key: 'revenue', label: '营业收入', group: '损益表' },
    { key: 'grossProfit', label: '毛利', group: '损益表' },
    { key: 'netIncome', label: '净利润', group: '损益表' },
    { key: 'totalAssets', label: '总资产', group: '资产负债表' },
    { key: 'totalLiabilities', label: '总负债', group: '资产负债表' },
    { key: 'totalEquity', label: '股东权益', group: '资产负债表' },
    { key: 'currentAssets', label: '流动资产', group: '资产负债表' },
    { key: 'currentLiabilities', label: '流动负债', group: '资产负债表' },
    { key: 'operatingCashFlow', label: '经营活动现金流', group: '现金流量表' },
    { key: 'capex', label: '资本开支（填正数）', group: '现金流量表' },
    { key: 'sharesOutstanding', label: '总股数', group: '股本与股价', kind: 'shares' },
    { key: 'sharePrice', label: '年末股价', group: '股本与股价', kind: 'price' }
  ];

  var MISSING = '数据不足';

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function result(value, note) {
    return { value: isNum(value) ? value : null, note: note || null };
  }

  function safeDiv(a, b) {
    if (!isNum(a) || !isNum(b) || b === 0) return null;
    var v = a / b;
    return isNum(v) ? v : null;
  }

  /*
   * 解析用户输入：
   *  ''/空白 → null（不是 0）；支持千分位逗号、空格、括号表示负数 "(123)"。
   *  非法 → { ok: false }
   */
  function parseInput(raw) {
    if (raw === null || raw === undefined) return { ok: true, value: null };
    var s = String(raw).trim();
    if (s === '') return { ok: true, value: null };
    s = s.replace(/[,，\s]/g, '');
    var neg = false;
    var m = /^\((.*)\)$/.exec(s);
    if (m) { neg = true; s = m[1]; }
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return { ok: false, value: null };
    var v = Number(s);
    if (!isNum(v)) return { ok: false, value: null };
    if (neg) v = -Math.abs(v);
    return { ok: true, value: v };
  }

  function grossMargin(d) {
    if (!isNum(d.grossProfit) || !isNum(d.revenue)) return result(null, MISSING);
    if (d.revenue <= 0) return result(null, '营收为零或负数，毛利率无意义');
    return result(safeDiv(d.grossProfit, d.revenue));
  }

  function netMargin(d) {
    if (!isNum(d.netIncome) || !isNum(d.revenue)) return result(null, MISSING);
    if (d.revenue <= 0) return result(null, '营收为零或负数，净利率无意义');
    return result(safeDiv(d.netIncome, d.revenue));
  }

  function roe(d) {
    if (!isNum(d.netIncome) || !isNum(d.totalEquity)) return result(null, MISSING);
    if (d.totalEquity <= 0) return result(null, '股东权益为零或负数，ROE 无意义');
    return result(safeDiv(d.netIncome, d.totalEquity));
  }

  function debtRatio(d) {
    if (!isNum(d.totalLiabilities) || !isNum(d.totalAssets)) return result(null, MISSING);
    if (d.totalAssets <= 0) return result(null, '总资产为零或负数，负债率无意义');
    return result(safeDiv(d.totalLiabilities, d.totalAssets));
  }

  function currentRatio(d) {
    if (!isNum(d.currentAssets) || !isNum(d.currentLiabilities)) return result(null, MISSING);
    if (d.currentLiabilities <= 0) return result(null, '流动负债为零或负数，流动比率无意义');
    return result(safeDiv(d.currentAssets, d.currentLiabilities));
  }

  function ocfToNetIncome(d) {
    if (!isNum(d.operatingCashFlow) || !isNum(d.netIncome)) return result(null, MISSING);
    if (d.netIncome <= 0) return result(null, '净利润为零或负数，比率无意义');
    return result(safeDiv(d.operatingCashFlow, d.netIncome));
  }

  // 自由现金流 = 经营现金流 − 资本开支。资本开支按支出金额处理（若误填负数取绝对值）。
  function freeCashFlow(d) {
    if (!isNum(d.operatingCashFlow) || !isNum(d.capex)) return result(null, MISSING);
    return result(d.operatingCashFlow - Math.abs(d.capex));
  }

  function eps(d) {
    if (!isNum(d.netIncome) || !isNum(d.sharesOutstanding)) return result(null, MISSING);
    if (d.sharesOutstanding <= 0) return result(null, '股数为零或负数，无法计算每股收益');
    return result(safeDiv(d.netIncome, d.sharesOutstanding));
  }

  function pe(d) {
    var e = eps(d);
    if (e.value === null) return result(null, e.note);
    if (!isNum(d.sharePrice)) return result(null, MISSING);
    if (d.sharePrice <= 0) return result(null, '股价无效');
    if (e.value <= 0) return result(null, '亏损，市盈率不适用');
    return result(safeDiv(d.sharePrice, e.value));
  }

  function marketCap(d) {
    if (!isNum(d.sharePrice) || !isNum(d.sharesOutstanding)) return result(null, MISSING);
    if (d.sharePrice <= 0 || d.sharesOutstanding <= 0) return result(null, '股价或股数无效');
    return result(d.sharePrice * d.sharesOutstanding);
  }

  /*
   * 同比增长率：(本期 − 上期) / |上期|
   * 上期为 null 或 0 → null；上期为负 → 用绝对值作分母并标注「基数为负」。
   */
  function growth(cur, prev) {
    if (!isNum(cur) || !isNum(prev)) return result(null, MISSING);
    if (prev === 0) return result(null, '上期为零，无法计算增长率');
    var v = (cur - prev) / Math.abs(prev);
    return result(v, prev < 0 ? '基数为负' : null);
  }

  var RATIOS = [
    { key: 'grossMargin', label: '毛利率', fmt: 'pct', fn: grossMargin },
    { key: 'netMargin', label: '净利率', fmt: 'pct', fn: netMargin },
    { key: 'roe', label: 'ROE（净资产收益率）', fmt: 'pct', fn: roe },
    { key: 'debtRatio', label: '负债率', fmt: 'pct', fn: debtRatio },
    { key: 'currentRatio', label: '流动比率', fmt: 'x', fn: currentRatio },
    { key: 'ocfToNetIncome', label: '经营现金流 / 净利润', fmt: 'x', fn: ocfToNetIncome },
    { key: 'freeCashFlow', label: '自由现金流', fmt: 'money', fn: freeCashFlow },
    { key: 'eps', label: '每股收益 EPS', fmt: 'perShare', fn: eps },
    { key: 'pe', label: '市盈率 PE', fmt: 'x', fn: pe },
    { key: 'marketCap', label: '市值', fmt: 'money', fn: marketCap }
  ];

  var GROWTHS = [
    { key: 'revenue', label: '营收增长率', get: function (r) { return r.data.revenue; } },
    { key: 'netIncome', label: '净利润增长率', get: function (r) { return r.data.netIncome; } },
    { key: 'operatingCashFlow', label: '经营现金流增长率', get: function (r) { return r.data.operatingCashFlow; } },
    { key: 'eps', label: 'EPS 增长率', get: function (r) { return r.ratios.eps.value; } }
  ];

  function computeYear(d) {
    var out = {};
    RATIOS.forEach(function (r) { out[r.key] = r.fn(d); });
    return out;
  }

  /*
   * 输入：年度数据数组（任意顺序）。
   * 输出：按年份升序的行 { year, data, ratios, growth, prev }。
   * prev 只指向「紧邻的上一年」；年份不连续时 prev 为 null，不计算同比。
   */
  function analyze(years) {
    var rows = (years || [])
      .filter(function (y) { return y && isNum(y.year); })
      .slice()
      .sort(function (a, b) { return a.year - b.year; })
      .map(function (d) { return { year: d.year, data: d, ratios: computeYear(d), growth: {}, prev: null }; });

    rows.forEach(function (row, i) {
      var p = i > 0 ? rows[i - 1] : null;
      row.prev = p && p.year === row.year - 1 ? p : null;
      GROWTHS.forEach(function (g) {
        row.growth[g.key] = row.prev
          ? growth(g.get(row), g.get(row.prev))
          : result(null, i > 0 ? '年份不连续' : '无上年数据');
      });
    });
    return rows;
  }

  var api = {
    FIELDS: FIELDS,
    RATIOS: RATIOS,
    GROWTHS: GROWTHS,
    isNum: isNum,
    safeDiv: safeDiv,
    parseInput: parseInput,
    grossMargin: grossMargin,
    netMargin: netMargin,
    roe: roe,
    debtRatio: debtRatio,
    currentRatio: currentRatio,
    ocfToNetIncome: ocfToNetIncome,
    freeCashFlow: freeCashFlow,
    eps: eps,
    pe: pe,
    marketCap: marketCap,
    growth: growth,
    computeYear: computeYear,
    analyze: analyze
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FACalc = api;
})(this);
