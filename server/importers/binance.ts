import { ImportRow } from "./types";

const BINANCE_ASSET_MAP: Record<string, string> = {
  "BTC": "Bitcoin",
  "ETH": "Ethereum",
  "SOL": "Solana",
  "ADA": "Cardano",
  "DOT": "Polkadot",
  "AVAX": "Avalanche",
  "MATIC": "Polygon",
  "BNB": "Binance Coin",
  "XRP": "Ripple",
  "DOGE": "Dogecoin",
  "LTC": "Litecoin",
  "LINK": "Chainlink",
};

export function parseBinance(csv: string): ImportRow[] {
  const lines = csv.split("\n");
  const rows: ImportRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Binance is regular comma-separated
    const parts = line.split(",").map(p => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 6) continue;
    
    try {
      // Date(UTC),Market,Type,Price,Amount,Total,Fee,Fee Coin
      const dateStr = parts[0].split(" ")[0]; // Take only YYYY-MM-DD
      const market = parts[1];
      const rawType = parts[2]?.toLowerCase() || "";
      
      let type: ImportRow["type"] = "transfer";
      if (rawType.includes("buy")) type = "buy";
      else if (rawType.includes("sell")) type = "sell";

      const price = parseFloat(parts[3]) || undefined;
      const quantity = parseFloat(parts[4]) || undefined;
      const amount = parseFloat(parts[5]) || 0;
      const fees = parseFloat(parts[6]) || 0;
      const feeCurrency = parts[7] || "";

      // Hack to extract base/quote from pair string like BTCUSDT
      let base = market;
      let quote = "USDT";
      if (market.endsWith("USDT")) { base = market.replace("USDT", ""); }
      else if (market.endsWith("BUSD")) { base = market.replace("BUSD", ""); quote = "BUSD"; }
      else if (market.endsWith("BTC")) { base = market.replace("BTC", ""); quote = "BTC"; }
      else if (market.endsWith("EUR")) { base = market.replace("EUR", ""); quote = "EUR"; }

      const assetName = BINANCE_ASSET_MAP[base] || base;

      rows.push({
        source: "binance",
        date: dateStr,
        account: "Binance",
        type,
        assetName,
        ticker: base,
        quantity,
        price,
        amount,
        fees,
        currency: quote,
        rawLine: line,
        warnings: feeCurrency && feeCurrency !== quote ? [`Avgift dragen i annan valuta (${feeCurrency})`] : [],
      });
    } catch (e) {
      // Ignore unparseable lines
    }
  }
  
  return rows;
}
