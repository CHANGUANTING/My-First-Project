'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');
const R = require('../js/risks.js');

const ids = (years) => R.assess(C.analyze(years)).map(r => r.year + ':' + r.id);

test('利润增长但经营现金流下降', () => {
  const out = ids([
    { year: 2022, netIncome: 100, operatingCashFlow: 120 },
    { year: 2023, netIncome: 130, operatingCashFlow: 90 }
  ]);
  assert.ok(out.includes('2023:profitUpCashDown'));
});

test('缺值时规则跳过，不误报', () => {
  const out = ids([
    { year: 2022, netIncome: 100, operatingCashFlow: null },
    { year: 2023, netIncome: 130, operatingCashFlow: 90 }
  ]);
  assert.ok(!out.includes('2023:profitUpCashDown'));
  assert.deepEqual(ids([{ year: 2023 }]), []);
});

test('年份不连续时不做同比比较', () => {
  const out = ids([
    { year: 2020, netIncome: 100, operatingCashFlow: 120 },
    { year: 2023, netIncome: 130, operatingCashFlow: 90 }
  ]);
  assert.ok(!out.includes('2023:profitUpCashDown'));
});

test('由盈转亏、权益为负', () => {
  const out = ids([
    { year: 2022, netIncome: 10, totalEquity: 5 },
    { year: 2023, netIncome: -20, totalEquity: -15 }
  ]);
  assert.ok(out.includes('2023:turnToLoss'));
  assert.ok(out.includes('2023:negativeEquity'));
});

test('亏损后亏损收窄不算由盈转亏', () => {
  const out = ids([
    { year: 2022, netIncome: -30 },
    { year: 2023, netIncome: -10 }
  ]);
  assert.ok(!out.includes('2023:turnToLoss'));
});

test('负债率高、上升快，流动比率 < 1', () => {
  const out = ids([
    { year: 2022, totalAssets: 100, totalLiabilities: 55, currentAssets: 50, currentLiabilities: 40 },
    { year: 2023, totalAssets: 100, totalLiabilities: 75, currentAssets: 30, currentLiabilities: 40 }
  ]);
  assert.ok(out.includes('2023:highDebt'));
  assert.ok(out.includes('2023:debtJump'));
  assert.ok(out.includes('2023:lowCurrentRatio'));
  assert.ok(!out.includes('2022:lowCurrentRatio'));
});

test('盈利但自由现金流为负；现金转化率连续偏低', () => {
  const out = ids([
    { year: 2022, netIncome: 100, operatingCashFlow: 50, capex: 20 },
    { year: 2023, netIncome: 100, operatingCashFlow: 60, capex: 80 }
  ]);
  assert.ok(out.includes('2023:profitButNegativeFcf'));
  assert.ok(out.includes('2023:lowCashConversion'));
  assert.ok(!out.includes('2022:lowCashConversion'));
});

test('营收增长但毛利率下滑、股数摊薄', () => {
  const out = ids([
    { year: 2022, revenue: 100, grossProfit: 40, sharesOutstanding: 100 },
    { year: 2023, revenue: 120, grossProfit: 42, sharesOutstanding: 110 }
  ]);
  assert.ok(out.includes('2023:marginSqueeze'));
  assert.ok(out.includes('2023:dilution'));
});

test('估值只看最新一年', () => {
  const out = ids([
    { year: 2022, netIncome: 1, sharesOutstanding: 1, sharePrice: 100 },
    { year: 2023, netIncome: 10, sharesOutstanding: 1, sharePrice: 100 }
  ]);
  assert.ok(!out.includes('2022:valuation'));
  assert.ok(!out.includes('2023:valuation'));
  const loss = ids([{ year: 2023, netIncome: -10, sharesOutstanding: 1, sharePrice: 5 }]);
  assert.ok(loss.includes('2023:valuation'));
});

test('排序：年份降序，高风险在前', () => {
  const risks = R.assess(C.analyze([
    { year: 2022, netIncome: 10, totalEquity: 5 },
    { year: 2023, netIncome: -20, totalEquity: 5, currentAssets: 1, currentLiabilities: 2 }
  ]));
  assert.equal(risks[0].year, 2023);
  assert.equal(risks[0].level, '高');
  assert.equal(risks[risks.length - 1].level, '中');
});
