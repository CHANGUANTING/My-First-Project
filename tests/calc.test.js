'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('parseInput：空值为 null，不是 0', () => {
  assert.deepEqual(C.parseInput(''), { ok: true, value: null });
  assert.deepEqual(C.parseInput('   '), { ok: true, value: null });
  assert.deepEqual(C.parseInput(null), { ok: true, value: null });
  assert.deepEqual(C.parseInput('0'), { ok: true, value: 0 });
});

test('parseInput：千分位、负数、括号负数', () => {
  assert.equal(C.parseInput('1,234.5').value, 1234.5);
  assert.equal(C.parseInput('-200').value, -200);
  assert.equal(C.parseInput('(300)').value, -300);
  assert.equal(C.parseInput('1，000').value, 1000);
});

test('parseInput：非法输入', () => {
  assert.equal(C.parseInput('abc').ok, false);
  assert.equal(C.parseInput('12abc').ok, false);
  assert.equal(C.parseInput('1-2').ok, false);
  assert.equal(C.parseInput('Infinity').ok, false);
});

test('safeDiv：null / 0 / 非有限数', () => {
  assert.equal(C.safeDiv(1, 0), null);
  assert.equal(C.safeDiv(null, 2), null);
  assert.equal(C.safeDiv(2, null), null);
  assert.equal(C.safeDiv(NaN, 2), null);
  assert.equal(C.safeDiv(-4, 2), -2);
});

test('毛利率 / 净利率', () => {
  close(C.grossMargin({ revenue: 100, grossProfit: 40 }).value, 0.4);
  close(C.netMargin({ revenue: 100, netIncome: -10 }).value, -0.1); // 亏损正常显示负值
  assert.equal(C.grossMargin({ revenue: 0, grossProfit: 10 }).value, null);
  assert.equal(C.netMargin({ revenue: -5, netIncome: 1 }).value, null);
  assert.equal(C.netMargin({ revenue: null, netIncome: 1 }).note, '数据不足');
});

test('ROE：权益为负时不计算', () => {
  close(C.roe({ netIncome: 10, totalEquity: 50 }).value, 0.2);
  close(C.roe({ netIncome: -10, totalEquity: 50 }).value, -0.2);
  const r = C.roe({ netIncome: -10, totalEquity: -50 }); // 负/负 不能变成正 ROE
  assert.equal(r.value, null);
  assert.match(r.note, /股东权益/);
  assert.equal(C.roe({ netIncome: 10, totalEquity: 0 }).value, null);
});

test('负债率 / 流动比率', () => {
  close(C.debtRatio({ totalLiabilities: 60, totalAssets: 100 }).value, 0.6);
  assert.equal(C.debtRatio({ totalLiabilities: 60, totalAssets: 0 }).value, null);
  close(C.currentRatio({ currentAssets: 30, currentLiabilities: 20 }).value, 1.5);
  assert.equal(C.currentRatio({ currentAssets: 30, currentLiabilities: 0 }).value, null);
  assert.equal(C.currentRatio({ currentAssets: null, currentLiabilities: 10 }).value, null);
});

test('经营现金流/净利润：净利润 ≤ 0 不计算', () => {
  close(C.ocfToNetIncome({ operatingCashFlow: 12, netIncome: 10 }).value, 1.2);
  close(C.ocfToNetIncome({ operatingCashFlow: -5, netIncome: 10 }).value, -0.5);
  assert.equal(C.ocfToNetIncome({ operatingCashFlow: -5, netIncome: -10 }).value, null);
  assert.equal(C.ocfToNetIncome({ operatingCashFlow: 5, netIncome: 0 }).value, null);
});

test('自由现金流：可为负，缺值为 null，capex 负数取绝对值', () => {
  assert.equal(C.freeCashFlow({ operatingCashFlow: 100, capex: 30 }).value, 70);
  assert.equal(C.freeCashFlow({ operatingCashFlow: 10, capex: 30 }).value, -20);
  assert.equal(C.freeCashFlow({ operatingCashFlow: 100, capex: -30 }).value, 70);
  assert.equal(C.freeCashFlow({ operatingCashFlow: 100, capex: null }).value, null);
  assert.equal(C.freeCashFlow({ operatingCashFlow: 100, capex: 0 }).value, 100);
});

test('EPS / 市盈率：亏损时 PE 不适用', () => {
  const d = { netIncome: 100, sharesOutstanding: 50, sharePrice: 40 };
  close(C.eps(d).value, 2);
  close(C.pe(d).value, 20);
  const loss = { netIncome: -100, sharesOutstanding: 50, sharePrice: 40 };
  close(C.eps(loss).value, -2);
  assert.equal(C.pe(loss).value, null);
  assert.match(C.pe(loss).note, /亏损/);
  assert.equal(C.pe({ netIncome: 100, sharesOutstanding: 0, sharePrice: 40 }).value, null);
  assert.equal(C.pe({ netIncome: 100, sharesOutstanding: 50, sharePrice: null }).value, null);
});

test('市值', () => {
  assert.equal(C.marketCap({ sharePrice: 2, sharesOutstanding: 100 }).value, 200);
  assert.equal(C.marketCap({ sharePrice: null, sharesOutstanding: 100 }).value, null);
});

test('同比增长：基数为零、为负、为空', () => {
  close(C.growth(120, 100).value, 0.2);
  assert.equal(C.growth(120, 0).value, null);
  assert.equal(C.growth(null, 100).value, null);
  const g = C.growth(-50, -100); // 亏损收窄 → 正增长
  close(g.value, 0.5);
  assert.equal(g.note, '基数为负');
  close(C.growth(-150, -100).value, -0.5); // 亏损扩大 → 负增长
  close(C.growth(50, -100).value, 1.5);
});

test('analyze：按年份排序，年份不连续不算同比', () => {
  const rows = C.analyze([
    { year: 2023, revenue: 120 },
    { year: 2020, revenue: 80 },
    { year: 2022, revenue: 100 }
  ]);
  assert.deepEqual(rows.map(r => r.year), [2020, 2022, 2023]);
  assert.equal(rows[0].growth.revenue.value, null);
  assert.equal(rows[1].prev, null);
  assert.equal(rows[1].growth.revenue.value, null);
  assert.equal(rows[1].growth.revenue.note, '年份不连续');
  close(rows[2].growth.revenue.value, 0.2);
});

test('analyze：结果中不出现 NaN / Infinity', () => {
  const rows = C.analyze([
    { year: 2021, revenue: 0, grossProfit: 0, netIncome: 0, totalAssets: 0, totalLiabilities: 0,
      totalEquity: 0, currentAssets: 0, currentLiabilities: 0, operatingCashFlow: 0, capex: 0,
      sharesOutstanding: 0, sharePrice: 0 },
    { year: 2022 }
  ]);
  for (const row of rows) {
    for (const r of Object.values(row.ratios).concat(Object.values(row.growth))) {
      assert.ok(r.value === null || Number.isFinite(r.value), JSON.stringify(r));
    }
  }
});
