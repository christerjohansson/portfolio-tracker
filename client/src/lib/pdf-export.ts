import type { Asset, Holding, Dividend, FxRate } from "@shared/schema";
import { toSEK, holdingMarketValue, holdingGainLossPct, enrichWithDividendCash, formatSEK, formatPct, ASSET_TYPE_LABELS, buildPortfolioSummary } from "@/lib/portfolio";
import type { PortfolioSummary } from "@/lib/portfolio";

export interface PdfReportData {
  summary: PortfolioSummary;
  holdings: Holding[];
  assets: Asset[];
  dividends: Dividend[];
  fxRates: FxRate[];
}

export interface AccountSummary {
  name: string;
  valueSEK: number;
  holdings: { asset: Asset; holding: Holding; valueSEK: number; gainPct: number }[];
}

export function buildAccountSummaries(
  holdings: Holding[],
  assets: Asset[],
  fxRates: FxRate[]
): AccountSummary[] {
  const assetMap = new Map(assets.map(a => [a.id, a]));

  // Group holdings by account
  const accountMap = new Map<string, { asset: Asset; holding: Holding; valueSEK: number; gainPct: number }[]>();

  for (const h of holdings) {
    const asset = assetMap.get(h.assetId);
    if (!asset) continue;
    const valueSEK = toSEK(holdingMarketValue(h), asset.currency, fxRates);
    const gainPct = holdingGainLossPct(h, asset.currency, fxRates);

    const account = h.account || "Unknown";
    if (!accountMap.has(account)) {
      accountMap.set(account, []);
    }
    accountMap.get(account)!.push({ asset, holding: h, valueSEK, gainPct });
  }

  return Array.from(accountMap.entries())
    .map(([name, holdingData]) => ({
      name,
      valueSEK: holdingData.reduce((sum, h) => sum + h.valueSEK, 0),
      holdings: holdingData,
    }))
    .sort((a, b) => b.valueSEK - a.valueSEK);
}

export function formatDateForFilename(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}