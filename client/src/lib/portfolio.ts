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

// Generates virtual cash holdings by aggregating dividends into the respective accounts
export function enrichWithDividendCash(
  holdings: Holding[],
  assets: Asset[],
  dividends: Dividend[]
): { augmentedHoldings: Holding[], augmentedAssets: Asset[] } {
  const cashByAccountCurrency: Record<string, number> = {};
  const holdingMap = new Map(holdings.map(h => [h.id, h]));
  
  for (const d of dividends) {
    const h = holdingMap.get(d.holdingId);
    if (!h) continue;
    const key = `${h.account}|${d.currency}`;
    cashByAccountCurrency[key] = (cashByAccountCurrency[key] || 0) + d.totalAmount;
  }

  const augmentedHoldings = [...holdings];
  const augmentedAssets = [...assets];
  
  for (const [key, amount] of Object.entries(cashByAccountCurrency)) {
    const [account, currency] = key.split("|");
    
    let foundHolding = false;
    for (let i = 0; i < augmentedHoldings.length; i++) {
        const h = augmentedHoldings[i];
        if (h.account === account) {
            const a = augmentedAssets.find(x => x.id === h.assetId);
            if (a && a.type === "cash" && a.currency === currency) {
                augmentedHoldings[i] = { ...h, quantity: h.quantity + amount };
                foundHolding = true;
                break;
            }
        }
    }
    
    if (!foundHolding) {
        let asset = augmentedAssets.find(a => a.type === "cash" && a.currency === currency);
        if (!asset) {
            asset = {
                id: -Math.floor(Math.random() * 1000000),
                name: `Cash ${currency}`,
                type: "cash",
                currency: currency,
                ticker: null, exchange: null, isin: null, notes: null, isActive: 1
            };
            augmentedAssets.push(asset);
        }
        
        augmentedHoldings.push({
            id: -Math.floor(Math.random() * 1000000),
            assetId: asset.id,
            account: account,
            quantity: amount,
            costBasis: amount,
            costBasisCurrency: currency,
            currentPrice: 1,
            lastPriceUpdate: null,
            manualPrice: true,
            notes: "Auto-generated from dividends",
        });
    }
  }
  
  return { augmentedHoldings, augmentedAssets };
}

// Gain/Loss in SEK
export function holdingGainLossSEK(h: Holding, assetCurrency: string, fxRates: FxRate[]): number {
  if (!h.currentPrice) return 0;
  const marketSEK = toSEK(holdingMarketValue(h), assetCurrency, fxRates);
  const costSEK = toSEK(h.costBasis, h.costBasisCurrency || assetCurrency, fxRates);
  return marketSEK - costSEK;
}

// Gain/Loss %
export function holdingGainLossPct(h: Holding, assetCurrency: string, fxRates: FxRate[]): number {
  if (!h.currentPrice || h.costBasis === 0) return 0;
  const marketSEK = toSEK(holdingMarketValue(h), assetCurrency, fxRates);
  const costSEK = toSEK(h.costBasis, h.costBasisCurrency || assetCurrency, fxRates);
  if (costSEK === 0) return 0;
  return ((marketSEK - costSEK) / costSEK) * 100;
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

export type AssetType = "stock_se" | "stock_us" | "stock_ca" | "stock_no" | "crypto" | "fund_se" | "fund_us" | "fund_de" | "etf_se" | "etf_us" | "etf_ca" | "etf_de" | "etf_no" | "cash";

export const ASSET_TYPE_LABELS: Record<string, string> = {
  stock_se: "SE Stock",
  stock_us: "US Stock",
  stock_ca: "CA Stock",
  stock_no: "NO Stock",
  crypto: "Crypto",
  fund_se: "SE Fund",
  fund_us: "US Fund",
  fund_de: "DE Fund",
  etf_se: "SE ETF",
  etf_us: "US ETF",
  etf_ca: "CA ETF",
  etf_de: "DE ETF",
  etf_no: "NO ETF",
  cash: "Cash",
};

export const ASSET_TYPE_CURRENCIES: Record<string, string> = {
  stock_se: "SEK",
  stock_us: "USD",
  stock_ca: "CAD",
  stock_no: "NOK",
  crypto: "USD",
  fund_se: "SEK",
  fund_us: "USD",
  fund_de: "EUR",
  etf_se: "SEK",
  etf_us: "USD",
  etf_ca: "CAD",
  etf_de: "EUR",
  etf_no: "NOK",
  cash: "SEK",
};

export const CURRENCIES = ["SEK", "USD", "CAD", "EUR", "NOK", "BTC", "BNB", "XRP", "ETH"] as const;

export interface PortfolioSummary {
  totalValueSEK: number;
  totalCostSEK: number;
  totalGainSEK: number;
  totalGainPct: number;
  totalDividendsSEK: number;
  cashBalanceSEK: number;
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
  let cashBalanceSEK = 0;
  const allocationByCurrency: Record<string, number> = {};
  const allocationByType: Record<string, number> = {};

  for (const h of holdings) {
    const asset = assetMap.get(h.assetId);
    if (!asset) continue;
    const valueSEK = toSEK(holdingMarketValue(h), asset.currency, fxRates);
    const costSEK = toSEK(h.costBasis, h.costBasisCurrency || asset.currency, fxRates);
    totalValueSEK += valueSEK;
    totalCostSEK += costSEK;
    if (asset.type === "cash") cashBalanceSEK += valueSEK;
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
    totalDividendsSEK, cashBalanceSEK, allocationByCurrency, allocationByType,
  };
}
