export function calculateBonus(salesVolume, profit, config = {}) {
  const grossProfit = Number(profit);
  if (![salesVolume, grossProfit].every((value) => Number.isFinite(Number(value)))) {
    throw new TypeError('salesVolume and profit must be numbers');
  }
  const eligible = config.enabled === true && Number(salesVolume) >= Number(config.targetSales);
  const percentage = eligible ? Number(config.percentage) : 0;
  if (percentage < 0 || percentage > 100) throw new RangeError('Bonus percentage must be between 0 and 100');
  const bonusAmount = roundMoney(grossProfit * percentage / 100);
  return {
    eligible,
    targetSales: Number(config.targetSales ?? 0),
    percentage,
    bonusAmount,
    netProfit: roundMoney(grossProfit - bonusAmount)
  };
}

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
