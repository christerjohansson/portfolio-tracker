import { ImportRow } from "./types";

export function parseNordnet(csv: string): ImportRow[] {
  const lines = csv.split("\n");
  const rows: ImportRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(";").map(p => p.trim());
    if (parts.length < 6) continue;
    
    try {
      // Nordnet typical format (might vary slightly)
      // Id;Date;Account;Type;Security;Quantity;Price;Amount;Currency;Fees...
      const dateStr = parts[1]; // Date
      const account = parts[2]; // Account
      const rawType = parts[3]?.toLowerCase() || "";
      
      let type: ImportRow["type"] = "transfer";
      if (rawType.includes("köpt") || rawType.includes("buy")) type = "buy";
      else if (rawType.includes("sålt") || rawType.includes("sell")) type = "sell";
      else if (rawType.includes("utdelning") || rawType.includes("dividend")) type = "dividend";
      else if (rawType.includes("insättning")) type = "deposit";
      else if (rawType.includes("uttag")) type = "withdrawal";

      const assetName = parts[4] || "";
      const quantity = parseNumber(parts[5]);
      const price = parseNumber(parts[6]);
      const amount = Math.abs(parseNumber(parts[7]) || 0);
      const currency = parts[8] || "SEK";
      const fees = parseNumber(parts[9]) || 0;
      const isin = parts[11] || parts[12] || ""; // Varies by exact export column

      rows.push({
        source: "nordnet",
        date: dateStr,
        account,
        type,
        assetName,
        quantity,
        price,
        amount,
        fees,
        currency,
        isin,
        rawLine: line,
        warnings: [],
      });
    } catch (e) {
      // Ignore unparseable lines
    }
  }
  
  return rows;
}

function parseNumber(str: string): number | undefined {
  if (!str || str === "-") return undefined;
  const num = parseFloat(str.replace(/\s/g, "").replace(",", "."));
  return isNaN(num) ? undefined : num;
}
