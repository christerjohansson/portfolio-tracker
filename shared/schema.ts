import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().default("admin"),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Asset Types ────────────────────────────────────────────────────────────
// type: "stock_se" | "stock_us" | "stock_ca" | "crypto" | "fund_se" | "fund_us" | "fund_de" | "cash"
// currency: "SEK" | "USD" | "CAD" | "EUR"

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  ticker: text("ticker"),                       // e.g. "ERIC-B", "BTC", null for cash
  type: text("type").notNull(),                 // stock_se|stock_us|stock_ca|crypto|fund_se|fund_us|fund_de|cash
  currency: text("currency").notNull(),         // SEK|USD|CAD|EUR
  exchange: text("exchange"),                   // e.g. "STO", "NASDAQ", "TSX"
  isin: text("isin"),                           // for funds/stocks
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

// ─── Holdings ────────────────────────────────────────────────────────────────
// A position in an asset across one or more accounts

export const holdings = sqliteTable("holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  account: text("account").notNull(),           // e.g. "Avanza ISK", "SEB", "Kraken"
  quantity: real("quantity").notNull().default(0),
  costBasis: real("cost_basis").notNull().default(0), // total cost in asset currency
  currentPrice: real("current_price"),          // last known price in asset currency
  lastPriceUpdate: text("last_price_update"),   // ISO datetime
  manualPrice: integer("manual_price", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
});

export const insertHoldingSchema = createInsertSchema(holdings).omit({ id: true });
export type InsertHolding = z.infer<typeof insertHoldingSchema>;
export type Holding = typeof holdings.$inferSelect;

// ─── Transactions ────────────────────────────────────────────────────────────
// Deposits, withdrawals, buys, sells

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  holdingId: integer("holding_id").notNull().references(() => holdings.id),
  type: text("type").notNull(),                 // buy|sell|deposit|withdrawal|transfer
  date: text("date").notNull(),                 // ISO date YYYY-MM-DD
  quantity: real("quantity"),                   // shares/coins bought/sold
  price: real("price"),                         // price per unit in asset currency
  amount: real("amount").notNull(),             // total amount in asset currency (positive)
  fees: real("fees").notNull().default(0),
  notes: text("notes"),
  rawImport: text("raw_import"),                // original pasted text if imported
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// ─── Dividends ───────────────────────────────────────────────────────────────

export const dividends = sqliteTable("dividends", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  holdingId: integer("holding_id").notNull().references(() => holdings.id),
  date: text("date").notNull(),                 // ISO date YYYY-MM-DD
  amount: real("amount").notNull(),             // per-share dividend
  totalAmount: real("total_amount").notNull(),  // total received
  currency: text("currency").notNull(),
  notes: text("notes"),
});

export const insertDividendSchema = createInsertSchema(dividends).omit({ id: true });
export type InsertDividend = z.infer<typeof insertDividendSchema>;
export type Dividend = typeof dividends.$inferSelect;

// ─── FX Rates ────────────────────────────────────────────────────────────────
// Cached exchange rates to SEK

export const fxRates = sqliteTable("fx_rates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  currency: text("currency").notNull().unique(),  // USD|CAD|EUR
  rateSek: real("rate_sek").notNull(),             // 1 currency = N SEK
  updatedAt: text("updated_at").notNull(),
});

export const insertFxRateSchema = createInsertSchema(fxRates).omit({ id: true });
export type InsertFxRate = z.infer<typeof insertFxRateSchema>;
export type FxRate = typeof fxRates.$inferSelect;
