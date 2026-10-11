/*
 * 风险提示规则（纯函数）。输入为 FACalc.analyze() 的结果。
 * 规则所需的任何值为 null 时跳过，不误报；同比只与紧邻上一年比较（row.prev）。
 */
(function (root) {
  'use strict';

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function pct(v) {
    return (v * 100).toFixed(1) + '%';
  }

  var HIGH = '高';
  var MEDIUM = '中';

  // 每条规则：(row, rows, index) → 风险对象或 null
  var RULES = [
    {
      id: 'profitUpCashDown',
      check: function (row) {
        var p = row.prev;
        if (!p) return null;
        var ni = row.data.netIncome, niP = p.data.netIncome;
        var ocf = row.data.operatingCashFlow, ocfP = p.data.operatingCashFlow;
        if (![ni, niP, ocf, ocfP].every(isNum)) return null;
        if (ni > niP && ocf < ocfP) {
          return { level: HIGH, message: '净利润增长，但经营现金流下降，利润质量存疑' };
        }
        return null;
      }
    },
    {
      id: 'lowCashConversion',
      check: function (row) {
        var p = row.prev;
        if (!p) return null;
        var a = row.ratios.ocfToNetIncome.value, b = p.ratios.ocfToNetIncome.value;
        if (!isNum(a) || !isNum(b)) return null;
        if (a < 0.8 && b < 0.8) {
          return { level: MEDIUM, message: '经营现金流/净利润连续两年低于 0.8（本年 ' + a.toFixed(2) + ' 倍），利润含金量偏低' };
        }
        return null;
      }
    },
    {
      id: 'profitButNegativeFcf',
      check: function (row) {
        var ni = row.data.netIncome, fcf = row.ratios.freeCashFlow.value;
        if (!isNum(ni) || !isNum(fcf)) return null;
        if (ni > 0 && fcf < 0) {
          return { level: MEDIUM, message: '有盈利，但自由现金流为负' };
        }
        return null;
      }
    },
    {
      id: 'highDebt',
      check: function (row) {
        var d = row.ratios.debtRatio.value;
        if (!isNum(d)) return null;
        if (d > 0.7) return { level: HIGH, message: '负债率偏高（' + pct(d) + '，超过 70%）' };
        return null;
      }
    },
    {
      id: 'debtJump',
      check: function (row) {
        var p = row.prev;
        if (!p) return null;
        var d = row.ratios.debtRatio.value, dP = p.ratios.debtRatio.value;
        if (!isNum(d) || !isNum(dP)) return null;
        if (d - dP > 0.1) {
          return { level: MEDIUM, message: '负债率一年内上升 ' + ((d - dP) * 100).toFixed(1) + ' 个百分点' };
        }
        return null;
      }
    },
    {
      id: 'lowCurrentRatio',
      check: function (row) {
        var c = row.ratios.currentRatio.value;
        if (!isNum(c)) return null;
        if (c < 1) return { level: MEDIUM, message: '流动比率低于 1（' + c.toFixed(2) + ' 倍），短期偿债有压力' };
        return null;
      }
    },
    {
      id: 'marginSqueeze',
      check: function (row) {
        var p = row.prev;
        if (!p) return null;
        var rev = row.data.revenue, revP = p.data.revenue;
        var gm = row.ratios.grossMargin.value, gmP = p.ratios.grossMargin.value;
        if (![rev, revP, gm, gmP].every(isNum)) return null;
        if (rev > revP && gmP - gm > 0.03) {
          return { level: MEDIUM, message: '营收增长，但毛利率下降 ' + ((gmP - gm) * 100).toFixed(1) + ' 个百分点' };
        }
        return null;
      }
    },
    {
      id: 'negativeEquity',
      check: function (row) {
        var e = row.data.totalEquity;
        if (!isNum(e)) return null;
        if (e <= 0) return { level: HIGH, message: '股东权益为零或负数（资不抵债）' };
        return null;
      }
    },
    {
      id: 'turnToLoss',
      check: function (row) {
        var p = row.prev;
        if (!p) return null;
        var ni = row.data.netIncome, niP = p.data.netIncome;
        if (!isNum(ni) || !isNum(niP)) return null;
        if (niP > 0 && ni < 0) return { level: HIGH, message: '净利润由盈转亏' };
        return null;
      }
    },
    {
      id: 'dilution',
      check: function (row) {
        var p = row.prev;
        if (!p) return null;
        var s = row.data.sharesOutstanding, sP = p.data.sharesOutstanding;
        if (!isNum(s) || !isNum(sP) || sP <= 0) return null;
        var g = (s - sP) / sP;
        if (g > 0.05) return { level: MEDIUM, message: '总股数增加 ' + pct(g) + '，股东权益被摊薄' };
        return null;
      }
    },
    {
      id: 'valuation',
      // 估值只看最新一年
      check: function (row, rows, i) {
        if (i !== rows.length - 1) return null;
        var ni = row.data.netIncome, price = row.data.sharePrice;
        var peV = row.ratios.pe.value;
        if (isNum(peV) && peV > 50) {
          return { level: MEDIUM, message: '市盈率偏高（' + peV.toFixed(1) + ' 倍，超过 50 倍）' };
        }
        if (isNum(ni) && ni < 0 && isNum(price)) {
          return { level: MEDIUM, message: '最新年度亏损，无法用市盈率估值' };
        }
        return null;
      }
    }
  ];

  /*
   * 返回风险列表，按年份降序、同年内「高」在前。
   */
  function assess(rows) {
    var out = [];
    (rows || []).forEach(function (row, i) {
      RULES.forEach(function (rule) {
        var r = rule.check(row, rows, i);
        if (r) out.push({ id: rule.id, year: row.year, level: r.level, message: r.message });
      });
    });
    out.sort(function (a, b) {
      if (a.year !== b.year) return b.year - a.year;
      return (a.level === HIGH ? 0 : 1) - (b.level === HIGH ? 0 : 1);
    });
    return out;
  }

  var api = { RULES: RULES, assess: assess, HIGH: HIGH, MEDIUM: MEDIUM };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FARisks = api;
})(this);
