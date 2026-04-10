import type { Asset, Holding, FxRate, Dividend, Transaction } from "@shared/schema";

// Convert amount in foreign currency to SEK
export function toSEK(amount: number, currency: string, fxRates: FxRate[]): number {
  if (currency === "SEK") return amount;
  const rate = fxRates.find(r => r.currency === currency);
  if (!rate) return amount; // fallback: no conversion
  return amount * rate.rateSek;
}

// Get current market value of a holding in its native currency
export function holdingMarketValue(h: Holding): number {
  if (!h.currentPrice) return 0;
  return h.quantity * h.currentPrice;
}

// Gain/Loss in native currency
export function holdingGainLoss(h: Holding): number {
  if (!h.currentPrice) return 0;
  return holdingMarketValue(h) - h.costBasis;
}

// Gain/Loss %
export function holdingGainLossPct(h: Holding): number {
  if (!h.currentPrice || h.costBasis === 0) return 0;
  return ((holdingMarketValue(h) - h.costBasis) / h.costBasis) * 100;
}

// Yield on Cost = total dividends received / cost basis * 100
export function yieldOnCost(costBasis: number, totalDividendsSEK: number): number {
  if (costBasis === 0) return 0;
  return (totalDividendsSEK / costBasis) * 100;
}

// Format number as SEK
export function formatSEK(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return new Intl.NumberFormat("sv-SE", {
      style: "currency", currency: "SEK",
      notation: "compact", maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("sv-SE", {
    style: "currency", currency: "SEK",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value);
}

export function formatCurrency(value: number, currency: string, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency,
      notation: "compact", maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatNumber(value: number, decimals = 4): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0, maximumFractionDigits: decimals,
  }).format(value);
}

export type AssetType = "stock_se" | "stock_us" | "stock_ca" | "crypto" | "fund_se" | "fund_us" | "fund_de" | "cash";

export const ASSET_TYPE_LABELS: Record<string, string> = {
  stock_se: "SE Stock",
  stock_us: "US Stock",
  stock_ca: "CA Stock",
  crypto: "Crypto",
  fund_se: "SE Fund",
  fund_us: "US Fund",
  fund_de: "DE Fund",
  cash: "Cash",
};

export const ASSET_TYPE_CURRENCIES: Record<string, string> = {
  stock_se: "SEK",
  stock_us: "USD",
  stock_ca: "CAD",
  crypto: "USD",
  fund_se: "SEK",
  fund_us: "USD",
  fund_de: "EUR",
  cash: "SEK",
};

export const CURRENCIES = ["SEK", "USD", "CAD", "EUR"] as const;

export interface PortfolioSummary {
  totalValueSEK: number;
  totalCostSEK: number;
  totalGainSEK: number;
  totalGainPct: number;
  totalDividendsSEK: number;
  allocationByCurrency: Record<string, number>;
  allocationByType: Record<string, number>;
}

export function buildPortfolioSummary(
  holdings: Holding[],
  assets: Asset[],
  dividends: Dividend[],
  fxRates: FxRate[]
): PortfolioSummary {
  const assetMap = new Map(assets.map(a => [a.id, a]));

  let totalValueSEK = 0;
  let totalCostSEK = 0;
  const allocationByCurrency: Record<string, number> = {};
  const allocationByType: Record<string, number> = {};

  for (const h of holdings) {
    const asset = assetMap.get(h.assetId);
    if (!asset) continue;
    const valueSEK = toSEK(holdingMarketValue(h), asset.currency, fxRates);
    const costSEK = toSEK(h.costBasis, asset.currency, fxRates);
    totalValueSEK += valueSEK;
    totalCostSEK += costSEK;
    allocationByCurrency[asset.currency] = (allocationByCurrency[asset.currency] || 0) + valueSEK;
    allocationByType[asset.type] = (allocationByType[asset.type] || 0) + valueSEK;
  }

  const totalDividendsSEK = dividends.reduce((sum, d) => {
    return sum + toSEK(d.totalAmount, d.currency, fxRates);
  }, 0);

  const totalGainSEK = totalValueSEK - totalCostSEK;
  const totalGainPct = totalCostSEK > 0 ? (totalGainSEK / totalCostSEK) * 100 : 0;

  return {
    totalValueSEK, totalCostSEK, totalGainSEK, totalGainPct,
    totalDividendsSEK, allocationByCurrency, allocationByType,
  };
}
