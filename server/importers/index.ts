import { ImportRow, ImportResult } from "./types";
import { parseAvanza } from "./avanza";
import { parseNordnet } from "./nordnet";
import { parseBinance } from "./binance";
import { storage } from "../storage";

export function detectFormatAndParse(csv: string, sourceHint?: string): ImportResult {
  let source = sourceHint || "unknown";
  let rows: ImportRow[] = [];
  
  if (source === "unknown") {
    // Auto-detect based on first line
    const firstLine = csv.split("\n")[0].toLowerCase();
    if (firstLine.includes("datum") && firstLine.includes("typ av transaktion") && firstLine.includes("värdepapper")) {
      source = "avanza";
    } else if (firstLine.includes("datum") && (firstLine.includes("transaktionstyp") || firstLine.includes("transaktionstekst"))) {
      source = "nordnet";
    } else if (firstLine.includes("date(utc)") && firstLine.includes("market") && firstLine.includes("fee")) {
      source = "binance";
    }
  }

  if (source === "avanza") {
    rows = parseAvanza(csv);
  } else if (source === "nordnet") {
    rows = parseNordnet(csv);
  } else if (source === "binance") {
    rows = parseBinance(csv);
  }

  if (source === "unknown" || rows.length === 0) {
    return {
      rows: [],
      unmappedAssets: [],
      errors: ["Kunde inte identifiera formatet. Vänligen välj källa manuellt eller kontrollera filen."],
      source
    };
  }

  // Find unmapped assets
  const existingAssets = storage.getAssets();
  const existingAssetNames = new Set(existingAssets.map(a => a.name.toLowerCase()));
  const existingTickers = new Set(existingAssets.map(a => a.ticker?.toLowerCase()).filter(Boolean));
  
  const unmapped = new Set<string>();
  
  rows.forEach(row => {
    const isMapped = existingAssetNames.has(row.assetName.toLowerCase()) || 
                     (row.ticker && existingTickers.has(row.ticker.toLowerCase()));
    if (!isMapped) {
      unmapped.add(row.assetName);
    }
  });

  return {
    rows,
    unmappedAssets: Array.from(unmapped),
    errors: [],
    source
  };
}
