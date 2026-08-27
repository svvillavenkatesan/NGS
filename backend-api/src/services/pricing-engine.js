export function validatePricingHierarchy({ baseRate, distributorRate, subDistributorRate, sellerRate, customerRate }) {
  const chain = [baseRate, distributorRate];
  if (subDistributorRate !== undefined && subDistributorRate !== null) chain.push(subDistributorRate);
  chain.push(sellerRate);
  if (customerRate !== undefined && customerRate !== null) chain.push(customerRate);

  if (chain.some((rate) => !Number.isFinite(Number(rate)) || Number(rate) < 0)) {
    throw new TypeError('All rates must be non-negative numbers');
  }
  if (chain.some((rate, index) => index > 0 && Number(rate) < Number(chain[index - 1]))) {
    throw new RangeError('A lower tier rate cannot be below its parent tier rate');
  }
  return true;
}

export function calculateTierProfits({ quantity, baseRate, distributorRate, subDistributorRate, sellerRate, customerRate, totalPrizes = 0, distributorBonus = 0, downstreamBonus = 0 }) {
  validatePricingHierarchy({ baseRate, distributorRate, subDistributorRate, sellerRate, customerRate });
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 0) throw new TypeError('quantity must be a non-negative integer');
  const distributorSellRate = subDistributorRate ?? sellerRate;
  return {
    admin: (Number(distributorRate) - Number(baseRate)) * qty - Number(totalPrizes) - Number(distributorBonus),
    distributor: (Number(distributorSellRate) - Number(distributorRate)) * qty - Number(downstreamBonus),
    subDistributor: subDistributorRate == null ? null : (Number(sellerRate) - Number(subDistributorRate)) * qty - Number(downstreamBonus),
    seller: (Number(customerRate) - Number(sellerRate)) * qty
  };
}

