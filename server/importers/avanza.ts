import { ImportRow } from "./types";

export function parseAvanza(csv: string): ImportRow[] {
  const lines = csv.split("\n");
  const rows: ImportRow[] = [];
  
  // skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Avanza can be semicolon or tab delimited depending on exact export
    const delimiter = line.includes(";") ? ";" : "\t";
    const parts = line.split(delimiter).map(p => p.trim());
    
    if (parts.length < 6) continue;
    
    try {
      const dateStr = parts[0];
      const account = parts[1];
      const rawType = parts[2].toLowerCase();
      let type: ImportRow["type"] = "transfer";
      
      if (rawType.includes("köp")) type = "buy";
      else if (rawType.includes("sälj")) type = "sell";
      else if (rawType.includes("utdelning")) type = "dividend";
      else if (rawType.includes("insättning")) type = "deposit";
      else if (rawType.includes("uttag")) type = "withdrawal";

      const assetName = parts[3] || "";
      const quantity = parseNumber(parts[4]);
      const price = parseNumber(parts[5]);
      const amount = Math.abs(parseNumber(parts[6]) || 0); // Avanza amount can be negative
      const fees = parseNumber(parts[7]) || 0;
      const currency = parts[8] || "SEK";
      const isin = parts[9] || "";

      rows.push({
        source: "avanza",
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
