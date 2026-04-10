import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, sql } from "drizzle-orm";
import {
  assets, holdings, transactions, dividends, fxRates,
  type Asset, type InsertAsset,
  type Holding, type InsertHolding,
  type Transaction, type InsertTransaction,
  type Dividend, type InsertDividend,
  type FxRate, type InsertFxRate,
  users, type User, type InsertUser,
} from "@shared/schema";

const sqlite = new Database("portfolio.db");
const key = process.env.DB_ENCRYPTION_KEY;
if (key) {
  sqlite.pragma(`cipher='sqlcipher'`);
  sqlite.pragma(`key='${key}'`);
}
export const db = drizzle(sqlite);

// Ensure tables exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ticker TEXT,
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
    exchange TEXT,
    isin TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    account TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    cost_basis REAL NOT NULL DEFAULT 0,
    cost_basis_currency TEXT,
    current_price REAL,
    last_price_update TEXT,
    manual_price INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holding_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    quantity REAL,
    price REAL,
    amount REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0,
    notes TEXT,
    raw_import TEXT
  );
  CREATE TABLE IF NOT EXISTS dividends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holding_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    total_amount REAL NOT NULL,
    currency TEXT NOT NULL,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS fx_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    currency TEXT NOT NULL UNIQUE,
    rate_sek REAL NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL DEFAULT 'admin',
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL
  );
`);

// Seed default FX rates if empty
const existingRates = db.select().from(fxRates).all();
if (existingRates.length === 0) {
  const now = new Date().toISOString();
  db.insert(fxRates).values([
    { currency: "USD", rateSek: 10.45, updatedAt: now },
    { currency: "CAD", rateSek: 7.70, updatedAt: now },
    { currency: "EUR", rateSek: 11.20, updatedAt: now },
    { currency: "NOK", rateSek: 0.98, updatedAt: now },
  ]).run();
}

// Ensure cost_basis_currency column exists (migration)
try {
  db.run(sql`ALTER TABLE holdings ADD COLUMN cost_basis_currency TEXT`);
} catch (e) {
  // column likely exists already
}

export interface IStorage {
  // Users
  getUser(id: number): User | undefined;
  getUserByUsername(username: string): User | undefined;
  createUser(data: InsertUser): User;
  hasUsers(): boolean;

  // Assets
  getAssets(): Asset[];
  getAsset(id: number): Asset | undefined;
  createAsset(data: InsertAsset): Asset;
  updateAsset(id: number, data: Partial<InsertAsset>): Asset | undefined;
  deleteAsset(id: number): void;

  // Holdings
  getHoldings(): Holding[];
  getHoldingsByAsset(assetId: number): Holding[];
  getHolding(id: number): Holding | undefined;
  createHolding(data: InsertHolding): Holding;
  updateHolding(id: number, data: Partial<InsertHolding>): Holding | undefined;
  deleteHolding(id: number): void;

  // Transactions
  getTransactions(): Transaction[];
  getTransactionsByHolding(holdingId: number): Transaction[];
  createTransaction(data: InsertTransaction): Transaction;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Transaction;
  deleteTransaction(id: number): void;

  // Dividends
  getDividends(): Dividend[];
  getDividendsByHolding(holdingId: number): Dividend[];
  createDividend(data: InsertDividend): Dividend;
  updateDividend(id: number, data: Partial<InsertDividend>): Dividend;
  deleteDividend(id: number): void;

  // FX Rates
  getFxRates(): FxRate[];
  updateFxRate(currency: string, rateSek: number): void;
}

export const storage: IStorage = {
  // ─── Users ─────────────────────────────────────────────────────────
  getUser(id) {
    return db.select().from(users).where(eq(users.id, id)).get();
  },
  getUserByUsername(username) {
    return db.select().from(users).where(eq(users.username, username)).get();
  },
  createUser(data) {
    return db.insert(users).values(data).returning().get();
  },
  hasUsers() {
    const res = db.select().from(users).limit(1).all();
    return res.length > 0;
  },

  // ─── Assets ────────────────────────────────────────────────────────
  getAssets() {
    return db.select().from(assets).all();
  },
  getAsset(id) {
    return db.select().from(assets).where(eq(assets.id, id)).get();
  },
  createAsset(data) {
    return db.insert(assets).values(data).returning().get();
  },
  updateAsset(id, data) {
    return db.update(assets).set(data).where(eq(assets.id, id)).returning().get();
  },
  deleteAsset(id) {
    db.delete(assets).where(eq(assets.id, id)).run();
  },

  // ─── Holdings ────────────────────────────────────────────────────────
  getHoldings() {
    return db.select().from(holdings).all();
  },
  getHoldingsByAsset(assetId) {
    return db.select().from(holdings).where(eq(holdings.assetId, assetId)).all();
  },
  getHolding(id) {
    return db.select().from(holdings).where(eq(holdings.id, id)).get();
  },
  createHolding(data) {
    return db.insert(holdings).values(data).returning().get();
  },
  updateHolding(id, data) {
    return db.update(holdings).set(data).where(eq(holdings.id, id)).returning().get();
  },
  deleteHolding(id) {
    db.delete(holdings).where(eq(holdings.id, id)).run();
  },

  // ─── Transactions ────────────────────────────────────────────────────────
  getTransactions() {
    return db.select().from(transactions).orderBy(desc(transactions.date)).all();
  },
  getTransactionsByHolding(holdingId) {
    return db.select().from(transactions).where(eq(transactions.holdingId, holdingId)).orderBy(desc(transactions.date)).all();
  },
  createTransaction(data) {
    return db.insert(transactions).values(data).returning().get();
  },
  updateTransaction(id, data) {
    return db.update(transactions).set(data).where(eq(transactions.id, id)).returning().get();
  },
  deleteTransaction(id) {
    db.delete(transactions).where(eq(transactions.id, id)).run();
  },

  // ─── Dividends ────────────────────────────────────────────────────────
  getDividends() {
    return db.select().from(dividends).orderBy(desc(dividends.date)).all();
  },
  getDividendsByHolding(holdingId) {
    return db.select().from(dividends).where(eq(dividends.holdingId, holdingId)).orderBy(desc(dividends.date)).all();
  },
  createDividend(data) {
    return db.insert(dividends).values(data).returning().get();
  },
  updateDividend(id, data) {
    return db.update(dividends).set(data).where(eq(dividends.id, id)).returning().get();
  },
  deleteDividend(id) {
    db.delete(dividends).where(eq(dividends.id, id)).run();
  },

  // ─── FX Rates ────────────────────────────────────────────────────────
  getFxRates() {
    return db.select().from(fxRates).all();
  },
  updateFxRate(currency, rateSek) {
    db.update(fxRates).set({ rateSek, updatedAt: new Date().toISOString() }).where(eq(fxRates.currency, currency)).run();
  },
};
