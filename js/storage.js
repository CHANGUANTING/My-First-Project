/*
 * localStorage 读写、JSON 导入导出与示例数据。
 * 规范化时所有数值字段只接受有限数，其余一律存为 null（不是 0）。
 */
(function (root) {
  'use strict';

  var KEY = 'fa-tool:v1';
  var VERSION = 1;
  var FIELDS = root.FACalc.FIELDS;
  var UNIT_VALUES = [1, 1e3, 1e6, 1e9];

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function newId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emptyYear(year) {
    var y = { year: year };
    FIELDS.forEach(function (f) { y[f.key] = null; });
    return y;
  }

  function normalizeYear(src) {
    if (!src || !isNum(src.year)) return null;
    var y = emptyYear(Math.round(src.year));
    FIELDS.forEach(function (f) { y[f.key] = isNum(src[f.key]) ? src[f.key] : null; });
    return y;
  }

  function normalizeCompany(src) {
    if (!src || typeof src !== 'object') return null;
    var market = src.market === 'MY' ? 'MY' : 'US';
    var currency = src.currency === 'MYR' || src.currency === 'USD'
      ? src.currency
      : (market === 'MY' ? 'MYR' : 'USD');
    var seen = {};
    var years = (Array.isArray(src.years) ? src.years : [])
      .map(normalizeYear)
      .filter(function (y) {
        if (!y || seen[y.year]) return false;
        seen[y.year] = true;
        return true;
      })
      .sort(function (a, b) { return a.year - b.year; });
    return {
      id: typeof src.id === 'string' && src.id ? src.id : newId(),
      name: typeof src.name === 'string' && src.name.trim() ? src.name.trim() : '未命名公司',
      ticker: typeof src.ticker === 'string' ? src.ticker.trim() : '',
      market: market,
      currency: currency,
      unit: UNIT_VALUES.indexOf(src.unit) >= 0 ? src.unit : 1e6,
      years: years
    };
  }

  function normalizeState(src) {
    var list = src && Array.isArray(src.companies) ? src.companies : [];
    var ids = {};
    var companies = list.map(normalizeCompany).filter(function (c) {
      if (!c) return false;
      if (ids[c.id]) c.id = newId();
      ids[c.id] = true;
      return true;
    });
    return { version: VERSION, companies: companies };
  }

  // 返回 { state, error }，读取失败时返回空数据并给出中文错误
  function load() {
    var text;
    try {
      text = root.localStorage.getItem(KEY);
    } catch (e) {
      return { state: normalizeState(null), error: '无法访问浏览器存储（localStorage），数据将不会被保存。' };
    }
    if (!text) return { state: normalizeState(null), error: null };
    try {
      return { state: normalizeState(JSON.parse(text)), error: null };
    } catch (e) {
      return { state: normalizeState(null), error: '已保存的数据损坏，无法读取。' };
    }
  }

  function save(state) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
      return null;
    } catch (e) {
      return '保存失败：浏览器存储不可用或空间已满。';
    }
  }

  function exportJSON(state) {
    return JSON.stringify(state, null, 2);
  }

  // 返回 { state, error }
  function importJSON(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { state: null, error: '文件不是有效的 JSON。' };
    }
    if (!parsed || !Array.isArray(parsed.companies)) {
      return { state: null, error: '文件格式不正确：缺少 companies 列表。' };
    }
    return { state: normalizeState(parsed), error: null };
  }

  function row(year, values) {
    var y = emptyYear(year);
    FIELDS.forEach(function (f, i) { y[f.key] = values[i] === undefined ? null : values[i]; });
    return y;
  }

  // 示例数据（虚构，仅供演示）。字段顺序同 FIELDS：
  // 营收, 毛利, 净利润, 总资产, 总负债, 股东权益, 流动资产, 流动负债, 经营现金流, 资本开支, 股数, 股价
  function sampleCompanies() {
    return [
      normalizeCompany({
        name: '示例科技（虚构）', ticker: 'DEMO', market: 'US', currency: 'USD', unit: 1e6,
        years: [
          row(2020, [1000, 450, 120, 2000, 900, 1100, 800, 400, 180, 60, 500, 7]),
          row(2021, [1150, 520, 150, 2200, 950, 1250, 900, 420, 210, 70, 500, 9]),
          row(2022, [1300, 580, 175, 2450, 1050, 1400, 950, 470, 230, 90, 505, 8]),
          row(2023, [1450, 610, 205, 2700, 1200, 1500, 1000, 520, 190, 110, 510, 12]),
          row(2024, [1600, 640, 230, 3000, 1450, 1550, 1050, 560, 170, 140, 540, 22])
        ]
      }),
      normalizeCompany({
        name: '示例种植（虚构）', ticker: 'DEMOMY', market: 'MY', currency: 'MYR', unit: 1e3,
        years: [
          row(2020, [500000, 150000, 40000, 900000, 400000, 500000, 200000, 150000, 60000, 30000, 800000, 1.2]),
          row(2021, [620000, 200000, 70000, 1000000, 430000, 570000, 260000, 170000, 90000, 35000, 800000, 1.65]),
          row(2022, [560000, 120000, -25000, 1050000, 560000, 490000, 210000, 230000, 20000, 40000, 880000, 0.95]),
          row(2023, [590000, 140000, 8000, 1020000, 540000, 480000, 220000, 210000, 35000, null, 880000, 1.05]),
          row(2024, [650000, 170000, 30000, 1060000, 560000, 500000, 240000, 200000, 52000, 30000, 880000, 1.3])
        ]
      })
    ];
  }

  root.FAStorage = {
    KEY: KEY,
    newId: newId,
    emptyYear: emptyYear,
    normalizeCompany: normalizeCompany,
    load: load,
    save: save,
    exportJSON: exportJSON,
    importJSON: importJSON,
    sampleCompanies: sampleCompanies
  };
})(this);
