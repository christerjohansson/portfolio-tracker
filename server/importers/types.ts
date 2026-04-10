export interface ImportRow {
  source: "avanza" | "nordnet" | "binance";
  date: string;              // ISO YYYY-MM-DD
  type: "buy" | "sell" | "dividend" | "deposit" | "withdrawal" | "fee" | "transfer";
  assetName: string;
  ticker?: string;
  isin?: string;
  quantity?: number;
  price?: number;
  amount: number;
  fees: number;
  currency: string;
  account?: string;
  rawLine: string;
  warnings: string[];
}

export interface ImportResult {
  rows: ImportRow[];
  unmappedAssets: string[];
  errors: string[];
  source: string;
}
