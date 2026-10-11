/*
 * 显示格式化。null / 非有限数一律显示 "—"，绝不显示 NaN / Infinity。
 */
(function (root) {
  'use strict';

  var DASH = '—';

  var CURRENCIES = {
    USD: { label: '美元 USD', symbol: '$' },
    MYR: { label: '马币 MYR', symbol: 'RM' }
  };

  // 录入单位：金额与股数使用同一单位
  var UNITS = [
    { value: 1, label: '元（个位）' },
    { value: 1e3, label: '千' },
    { value: 1e6, label: '百万' },
    { value: 1e9, label: '十亿' }
  ];

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function symbol(currency) {
    return (CURRENCIES[currency] || CURRENCIES.USD).symbol;
  }

  // 保留两位小数并去掉末尾多余的 0：3000.00 → 3000，1.50 → 1.5
  function fixed2(v) {
    return v.toFixed(2).replace(/\.?0+$/, '');
  }

  // 大数用「万 / 亿」缩写
  function compact(abs) {
    if (abs >= 1e12) return fixed2(abs / 1e12) + '万亿';
    if (abs >= 1e8) return fixed2(abs / 1e8) + '亿';
    if (abs >= 1e4) return fixed2(abs / 1e4) + '万';
    return abs.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  // 金额：value 为录入单位下的数，unit 为单位乘数
  function money(value, currency, unit) {
    if (!isNum(value)) return DASH;
    var v = value * (unit || 1);
    return (v < 0 ? '-' : '') + symbol(currency) + compact(Math.abs(v));
  }

  // 股数（不带币种）
  function shares(value, unit) {
    if (!isNum(value)) return DASH;
    var v = value * (unit || 1);
    return (v < 0 ? '-' : '') + compact(Math.abs(v)) + '股';
  }

  // 每股金额（股价、EPS），不乘单位
  function perShare(value, currency) {
    if (!isNum(value)) return DASH;
    return (value < 0 ? '-' : '') + symbol(currency) + Math.abs(value).toFixed(2);
  }

  function pct(value, digits) {
    if (!isNum(value)) return DASH;
    return (value * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  }

  function times(value) {
    if (!isNum(value)) return DASH;
    return value.toFixed(2) + ' 倍';
  }

  // 输入框回显：保留原数，不缩写
  function raw(value) {
    return isNum(value) ? String(value) : '';
  }

  var api = {
    DASH: DASH,
    CURRENCIES: CURRENCIES,
    UNITS: UNITS,
    money: money,
    shares: shares,
    perShare: perShare,
    pct: pct,
    times: times,
    raw: raw
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FAFormat = api;
})(this);
