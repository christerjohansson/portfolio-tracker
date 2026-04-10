# Portföljtracker 📊

> A self-hosted, privacy-first financial dashboard to track your global net worth across banks, stocks, crypto, and mutual funds — with SEK as the base currency.

![Dashboard Screenshot](screenshot.png)

---

## Features

### Dashboard (Översikt)
- **4 KPI cards** — Total portfolio value, Total gain/loss (% and SEK), Total dividends received (with Yield on Cost), and number of holdings
- **Asset allocation donut chart** — Visual breakdown by asset type (SE/US/CA stocks, crypto, SE/US/DE funds, cash)
- **Currency exposure bars** — All holdings converted to SEK, grouped by original currency (SEK, USD, CAD, EUR)
- **Live FX rate widget** — Shows current USD/CAD/EUR → SEK rates
- **Snabbregistrering (Quick entry)** — Two-tab widget:
  - *Snabb*: Add a transaction (buy/sell/deposit/withdrawal) in seconds
  - *Importera*: Paste a row from an Avanza/Nordnet CSV export and let the parser extract date, type, quantity, price, and amount automatically
- **Top holdings table** — Your largest positions ranked by SEK value with gain/loss %

### Holdings (Innehav)
- Holdings grouped by category: **Aktier**, **Krypto**, **Fonder**, **Kassa**
- Per-row data: quantity, live price (in native currency), market value (SEK), cost basis (SEK), gain/loss %
- **Live price refresh** — per holding or bulk "Uppdatera kurser" for all at once
- **Manual price flag** — mark niche Swedish funds or illiquid assets as manually priced (skipped in auto-refresh)
- **Add Asset modal** — name, type (8 types supported), currency (auto-suggested by type), ticker, exchange, ISIN
- **Add Holding modal** — link to asset, account/depå, quantity, cost basis, optional starting price
- Search/filter bar across name, ticker, and account

### Dividends (Utdelningar)
- Log dividend events with per-share amount → auto-calculates total from current quantity
- **Yield on Cost (YoC)** table per holding — total dividends ÷ cost basis
- Full dividend history with native currency amounts and SEK conversion
- Orange accent throughout to visually distinguish passive income from capital gains

### Transactions
- Complete log of all buys, sells, deposits, withdrawals, and transfers
- Filter by transaction type
- Summary totals: total purchased, total sold, total fees paid
- Linked to holding and asset for full context

### Settings (Inställningar)
- **Live FX rate refresh** — fetches from [open.er-api.com](https://open.er-api.com) with one click
- **Manual FX rate override** — edit any rate directly (useful if you want to lock a rate)
- **Asset management** — view and delete all registered assets
- **Data transparency** — clear disclosure of which external APIs are called

---

## Supported Asset Types

| Type | Label | Default Currency |
|------|-------|-----------------|
| `stock_se` | SE Stock | SEK |
| `stock_us` | US Stock | USD |
| `stock_ca` | CA Stock | CAD |
| `crypto` | Crypto | USD |
| `fund_se` | SE Fund | SEK |
| `fund_us` | US Fund | USD |
| `fund_de` | DE Fund | EUR |
| `cash` | Cash | SEK |

---

## Price Data Sources

| Asset Type | Source | Notes |
|------------|--------|-------|
| SE/US/CA Stocks | [Yahoo Finance](https://finance.yahoo.com) | Appends `.ST` for Stockholm, `.TO` for Toronto |
| SE/US/DE Funds | Yahoo Finance | `.ST` suffix for SE funds |
| Crypto | [CoinGecko](https://www.coingecko.com) | Supports BTC, ETH, SOL, ADA, DOT, AVAX, MATIC, BNB, XRP, DOGE, LTC, LINK and more |
| FX Rates | [open.er-api.com](https://open.er-api.com) | Free, no API key required |
| Niche SE Funds | Manual | Set `manualPrice: true` to skip auto-refresh |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI Components | shadcn/ui + Radix UI |
| Styling | Tailwind CSS v3 |
| Data Fetching | TanStack Query v5 |
| Routing | Wouter (hash-based) |
| Charts | Recharts |
| Backend | Express.js |
| Database | SQLite via Drizzle ORM (`better-sqlite3`) |
| Validation | Zod + drizzle-zod |

All data is stored locally in `portfolio.db` (SQLite). Nothing is sent to external servers except price/FX API calls.

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/christerjohansson/portfolio-tracker.git
cd portfolio-tracker
npm install
```

### Development

```bash
npm run dev
```

Opens at [http://localhost:5000](http://localhost:5000). The Express backend and Vite frontend both serve from the same port.

### Production Build

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

---

## Project Structure

```
portfolio-tracker/
├── client/
│   └── src/
│       ├── components/
│       │   ├── ui/              # shadcn/ui components
│       │   └── AddQuickEntry.tsx
│       ├── lib/
│       │   ├── portfolio.ts     # Calculations: SEK conversion, gain/loss, YoC
│       │   └── queryClient.ts
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── Holdings.tsx
│       │   ├── Dividends.tsx
│       │   ├── Transactions.tsx
│       │   └── Settings.tsx
│       └── index.css            # Avanza-inspired color palette
├── server/
│   ├── routes.ts                # All API endpoints
│   └── storage.ts               # Drizzle ORM + SQLite storage layer
├── shared/
│   └── schema.ts                # Drizzle schema: assets, holdings, transactions, dividends, fxRates
└── portfolio.db                 # SQLite database (auto-created, gitignored)
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets` | List all assets |
| POST | `/api/assets` | Create asset |
| PATCH | `/api/assets/:id` | Update asset |
| DELETE | `/api/assets/:id` | Delete asset |
| GET | `/api/holdings` | List all holdings |
| POST | `/api/holdings` | Create holding |
| PATCH | `/api/holdings/:id` | Update holding |
| DELETE | `/api/holdings/:id` | Delete holding |
| POST | `/api/holdings/:id/refresh-price` | Refresh price for one holding |
| POST | `/api/holdings/refresh-all` | Refresh all prices + FX rates |
| GET | `/api/transactions` | List all transactions |
| POST | `/api/transactions` | Create transaction |
| DELETE | `/api/transactions/:id` | Delete transaction |
| GET | `/api/dividends` | List all dividends |
| POST | `/api/dividends` | Log dividend event |
| DELETE | `/api/dividends/:id` | Delete dividend |
| GET | `/api/fx-rates` | Get current FX rates |
| PATCH | `/api/fx-rates/:currency` | Manually update a rate |
| POST | `/api/fx-rates/refresh` | Fetch live rates from API |
| POST | `/api/parse-transaction` | Smart parser for Avanza/Nordnet export rows |

---

## Color System

Inspired by [Avanza.se](https://www.avanza.se):

| Color | Hex | Used for |
|-------|-----|----------|
| Green | `#27AE60` | Gains, net worth totals, profit |
| Orange | `#E67E22` | Dividends, action buttons, withdrawals |
| White | `#FFFFFF` | Card backgrounds |
| Near-black | `#1A1A1A` | Sidebar, primary typography |

Full dark mode support with a toggle in the top-right corner.

---

## Privacy

- **Local-first**: all financial data lives in `portfolio.db` on your own machine
- **No accounts, no cloud sync** — run it on your local network or a private server
- **External calls only for**: Yahoo Finance (prices), CoinGecko (crypto prices), open.er-api.com (FX rates)
- `portfolio.db` is in `.gitignore` — your data is never committed to version control

---

## License

MIT
