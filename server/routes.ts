import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { insertAssetSchema, insertHoldingSchema, insertTransactionSchema, insertDividendSchema } from "@shared/schema";
import { detectFormatAndParse } from "./importers";
import type { ImportRow } from "./importers/types";

// Fetch live price from Yahoo Finance (via redirect)
async function fetchYahooPrice(ticker: string, type: string): Promise<number | null> {
  try {
    const suffix =
      type === "stock_se" || type === "fund_se" || type === "etf_se" ? ".ST" :
      type === "stock_ca" || type === "etf_ca" ? ".TO" :
      type === "stock_no" || type === "etf_no" ? ".OL" :
      type === "etf_de" ? ".DE" : "";
    const symbol = encodeURIComponent(ticker + suffix);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json() as any;
    return json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

// Fetch crypto price from CoinGecko
async function fetchCryptoPrice(ticker: string): Promise<number | null> {
  try {
    const coinMap: Record<string, string> = {
      BTC: "bitcoin", ETH: "ethereum", SOL: "solana", ADA: "cardano",
      DOT: "polkadot", AVAX: "avalanche-2", MATIC: "matic-network",
      BNB: "binancecoin", XRP: "ripple", DOGE: "dogecoin",
      LTC: "litecoin", LINK: "chainlink",
    };
    const id = coinMap[ticker.toUpperCase()] || ticker.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json() as any;
    return json?.[id]?.usd ?? null;
  } catch {
    return null;
  }
}

// Fetch FX rates from open.er-api.com (free, no key needed)
async function fetchFxRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/SEK", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json() as any;
    // Rates are X per SEK, we want SEK per X → invert
    const usd = json?.rates?.USD ? 1 / json.rates.USD : null;
    const eur = json?.rates?.EUR ? 1 / json.rates.EUR : null;
    const cad = json?.rates?.CAD ? 1 / json.rates.CAD : null;
    const nok = json?.rates?.NOK ? 1 / json.rates.NOK : null;
    if (!usd || !eur || !cad || !nok) return null;
    return { USD: usd, EUR: eur, CAD: cad, NOK: nok };
  } catch {
    return null;
  }
}

export function registerRoutes(httpServer: Server, app: Express) {
  // Apply auth to all /api routes except auth endpoints itself
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth")) {
      return next();
    }
    return requireAuth(req, res, next);
  });

  // ─── Assets ──────────────────────────────────────────────────────────────
  app.get("/api/assets", (_req, res) => {
    res.json(storage.getAssets());
  });

  app.post("/api/assets", (req, res) => {
    const parse = insertAssetSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    res.json(storage.createAsset(parse.data));
  });

  app.patch("/api/assets/:id", (req, res) => {
    const id = Number(req.params.id);
    const updated = storage.updateAsset(id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/assets/:id", (req, res) => {
    storage.deleteAsset(Number(req.params.id));
    res.json({ ok: true });
  });

  // ─── Holdings ──────────────────────────────────────────────────────────────
  app.get("/api/holdings", (_req, res) => {
    res.json(storage.getHoldings());
  });

  app.post("/api/holdings", (req, res) => {
    const parse = insertHoldingSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    res.json(storage.createHolding(parse.data));
  });

  app.patch("/api/holdings/:id", (req, res) => {
    const id = Number(req.params.id);
    const updated = storage.updateHolding(id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/holdings/:id", (req, res) => {
    storage.deleteHolding(Number(req.params.id));
    res.json({ ok: true });
  });

  // ─── Price Refresh ──────────────────────────────────────────────────────────
  app.post("/api/holdings/:id/refresh-price", async (req, res) => {
    const id = Number(req.params.id);
    const holding = storage.getHolding(id);
    if (!holding) return res.status(404).json({ error: "Not found" });
    const asset = storage.getAsset(holding.assetId);
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    if (holding.manualPrice) return res.json({ holding, message: "Manual price — skipped" });
    if (!asset.ticker) return res.json({ holding, message: "No ticker" });

    let price: number | null = null;
    if (asset.type === "crypto") {
      price = await fetchCryptoPrice(asset.ticker);
    } else {
      price = await fetchYahooPrice(asset.ticker, asset.type);
    }

    if (price === null) return res.status(502).json({ error: "Could not fetch price" });
    const updated = storage.updateHolding(id, {
      currentPrice: price,
      lastPriceUpdate: new Date().toISOString(),
    });
    res.json(updated);
  });

  // Bulk refresh all holdings
  app.post("/api/holdings/refresh-all", async (_req, res) => {
    const allHoldings = storage.getHoldings();
    const allAssets = storage.getAssets();
    const assetMap = new Map(allAssets.map(a => [a.id, a]));
    const results: any[] = [];

    for (const h of allHoldings) {
      if (h.manualPrice) { results.push({ id: h.id, skipped: true }); continue; }
      const asset = assetMap.get(h.assetId);
      if (!asset?.ticker) { results.push({ id: h.id, skipped: true }); continue; }
      let price: number | null = null;
      if (asset.type === "crypto") {
        price = await fetchCryptoPrice(asset.ticker);
      } else {
        price = await fetchYahooPrice(asset.ticker, asset.type);
      }
      if (price !== null) {
        storage.updateHolding(h.id, { currentPrice: price, lastPriceUpdate: new Date().toISOString() });
        results.push({ id: h.id, price });
      } else {
        results.push({ id: h.id, error: "fetch failed" });
      }
      await new Promise(r => setTimeout(r, 300)); // rate limit
    }

    // Also refresh FX rates
    const fx = await fetchFxRates();
    if (fx) {
      for (const [currency, rate] of Object.entries(fx)) {
        storage.updateFxRate(currency, rate);
      }
    }

    res.json({ results, fxUpdated: !!fx });
  });

  // ─── Transactions ──────────────────────────────────────────────────────────
  app.get("/api/transactions", (_req, res) => {
    res.json(storage.getTransactions());
  });

  app.get("/api/holdings/:id/transactions", (req, res) => {
    res.json(storage.getTransactionsByHolding(Number(req.params.id)));
  });

  app.post("/api/transactions", (req, res) => {
    const parse = insertTransactionSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    res.json(storage.createTransaction(parse.data));
  });

  app.delete("/api/transactions/:id", (req, res) => {
    storage.deleteTransaction(Number(req.params.id));
    res.json({ ok: true });
  });

  app.patch("/api/transactions/:id", (req, res) => {
    const parse = insertTransactionSchema.partial().safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    res.json(storage.updateTransaction(Number(req.params.id), parse.data));
  });

  // ─── Dividends ──────────────────────────────────────────────────────────────
  app.get("/api/dividends", (_req, res) => {
    res.json(storage.getDividends());
  });

  app.get("/api/holdings/:id/dividends", (req, res) => {
    res.json(storage.getDividendsByHolding(Number(req.params.id)));
  });

  app.post("/api/dividends", (req, res) => {
    const parse = insertDividendSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    res.json(storage.createDividend(parse.data));
  });

  app.delete("/api/dividends/:id", (req, res) => {
    storage.deleteDividend(Number(req.params.id));
    res.json({ ok: true });
  });

  app.patch("/api/dividends/:id", (req, res) => {
    const parse = insertDividendSchema.partial().safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    res.json(storage.updateDividend(Number(req.params.id), parse.data));
  });

  // ─── FX Rates ──────────────────────────────────────────────────────────────
  app.get("/api/fx-rates", (_req, res) => {
    res.json(storage.getFxRates());
  });

  app.patch("/api/fx-rates/:currency", (req, res) => {
    const { rateSek } = req.body;
    storage.updateFxRate(req.params.currency, Number(rateSek));
    res.json(storage.getFxRates());
  });

  // Refresh FX rates from API
  app.post("/api/fx-rates/refresh", async (_req, res) => {
    const fx = await fetchFxRates();
    if (!fx) return res.status(502).json({ error: "Could not fetch FX rates" });
    for (const [currency, rate] of Object.entries(fx)) {
      storage.updateFxRate(currency, rate);
    }
    res.json(storage.getFxRates());
  });

  // ─── Smart Parser ──────────────────────────────────────────────────────────
  // Parses a pasted row from Avanza/Nordnet export
  app.post("/api/parse-transaction", (req, res) => {
    const { text } = req.body as { text: string };
    if (!text) return res.status(400).json({ error: "No text provided" });

    // Try to parse tab-separated or semicolon-separated Avanza/Nordnet row
    // Common Avanza format: Date;Type;Name/description;Quantity;Price;Amount;Balance;Currency
    const line = text.trim().replace(/\t/g, ";");
    const parts = line.split(";").map((p: string) => p.trim());
    
    const parsed: Record<string, any> = {};
    if (parts.length >= 6) {
      // Try date
      const dateStr = parts[0];
      const dateMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) parsed.date = dateMatch[1];
      
      // Type mapping
      const rawType = parts[1]?.toLowerCase() || "";
      if (rawType.includes("köp") || rawType.includes("buy")) parsed.type = "buy";
      else if (rawType.includes("sälj") || rawType.includes("sell")) parsed.type = "sell";
      else if (rawType.includes("insättning") || rawType.includes("deposit")) parsed.type = "deposit";
      else if (rawType.includes("uttag") || rawType.includes("withdrawal")) parsed.type = "withdrawal";
      else if (rawType.includes("utdelning") || rawType.includes("dividend")) parsed.type = "dividend";
      
      parsed.description = parts[2];
      
      // Numeric values — handle Swedish number format (comma as decimal)
      const parseNum = (s: string) => {
        if (!s) return undefined;
        const cleaned = s.replace(/\s/g, "").replace(",", ".");
        const n = parseFloat(cleaned);
        return isNaN(n) ? undefined : n;
      };
      
      if (parts[3]) parsed.quantity = parseNum(parts[3]);
      if (parts[4]) parsed.price = parseNum(parts[4]);
      if (parts[5]) parsed.amount = parseNum(parts[5].replace(/-/g, ""));
      if (parts[7]) parsed.currency = parts[7];
    }

    res.json({ parsed, raw: text });
  });

  // ─── CSV Import ────────────────────────────────────────────────────────────
  app.post("/api/import/preview", (req, res) => {
    const { csv, source } = req.body;
    if (!csv) return res.status(400).json({ error: "Missing csv content" });
    const result = detectFormatAndParse(csv, source);
    res.json(result);
  });

  app.post("/api/import/execute", (req, res) => {
    const { rows, assetMapping } = req.body as { rows: ImportRow[], assetMapping: Record<string, number> };
    if (!rows || !Array.isArray(rows)) return res.status(400).json({ error: "No rows provided" });
    
    let createdTransactions = 0;
    
    // Group transactions by mapped assetId
    for (const row of rows) {
      let assetId = assetMapping[row.assetName];
      // If we don't have a mapping but the asset name matches exactly, try to find it
      if (!assetId) {
        const found = storage.getAssets().find(a => a.name.toLowerCase() === row.assetName.toLowerCase());
        if (found) assetId = found.id;
      }
      
      if (!assetId) continue; // Skip rows where asset mapping is unresolved

      // Try to find a holding for this asset + account combination
      let holding = storage.getHoldingsByAsset(assetId).find(h => h.account === (row.account || "Default"));
      
      if (!holding) {
        holding = storage.createHolding({
          assetId,
          account: row.account || "Default",
          quantity: 0,
          costBasis: 0,
          manualPrice: false
        });
      }

      // Create transaction
      if (row.type === "dividend") {
        storage.createDividend({
          holdingId: holding.id,
          date: row.date,
          amount: row.amount / (row.quantity || 1),
          totalAmount: row.amount,
          currency: row.currency,
          notes: "Imported"
        });
      } else {
        storage.createTransaction({
          holdingId: holding.id,
          type: row.type,
          date: row.date,
          quantity: row.quantity,
          price: row.price,
          amount: row.amount,
          fees: row.fees,
          rawImport: row.rawLine,
          notes: "Imported"
        });
      }
      createdTransactions++;
    }

    // Refresh holdings to auto-calculate totals
    // (A real app would do this automatically in the DB trigger or recalculate here,
    // but the tracker frontend will refetch /api/holdings)

    res.json({ success: true, createdTransactions });
  });
}
