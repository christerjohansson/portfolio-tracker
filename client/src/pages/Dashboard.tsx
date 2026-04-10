import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Asset, Holding, Dividend, FxRate } from "@shared/schema";
import { buildPortfolioSummary, formatSEK, formatPct, toSEK, holdingMarketValue, holdingGainLossPct, ASSET_TYPE_LABELS } from "@/lib/portfolio";
import {
  TrendingUp, TrendingDown, RefreshCw, Wallet, Coins,
  Banknote, PiggyBank, AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid
} from "recharts";
import { useEffect, useRef, useState } from "react";
import { AddQuickEntry } from "@/components/AddQuickEntry";
import { Skeleton } from "@/components/ui/skeleton";

// Animated counter
function AnimatedValue({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [display, setDisplay] = useState(0);
  const start = useRef(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const from = start.current;
    const to = value;
    const duration = 600;
    const t0 = performance.now();
    const step = (now: number) => {
      const elapsed = now - t0;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) raf.current = requestAnimationFrame(step);
      else start.current = to;
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  return <span className="tabular-nums">{formatter(display)}</span>;
}

// KPI Card
function KPICard({
  label, value, sub, icon: Icon, color = "default", loading
}: {
  label: string; value: string; sub?: string; icon: any; color?: "default"|"gain"|"loss"|"dividend"; loading?: boolean;
}) {
  const colorMap = {
    default: "text-foreground",
    gain: "text-gain",
    loss: "text-loss",
    dividend: "text-dividend",
  };
  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="kpi-label">{label}</span>
        <Icon size={16} className="text-muted-foreground shrink-0 mt-0.5" />
      </div>
      {loading ? (
        <div>
          <Skeleton className="h-7 w-32 mb-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ) : (
        <>
          <div className={`kpi-value ${colorMap[color]}`}>{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </>
      )}
    </div>
  );
}

const ALLOCATION_COLORS = [
  "#27AE60", "#E67E22", "#3498DB", "#9B59B6", "#E74C3C", "#1ABC9C", "#F39C12", "#2ECC71"
];

const TYPE_COLORS: Record<string, string> = {
  stock_se: "#3498DB",
  stock_us: "#9B59B6",
  stock_ca: "#E74C3C",
  crypto: "#F39C12",
  fund_se: "#1ABC9C",
  fund_us: "#2980B9",
  fund_de: "#E67E22",
  cash: "#27AE60",
};

export default function Dashboard() {
  const { toast } = useToast();

  const { data: assets = [], isLoading: loadingA } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: holdings = [], isLoading: loadingH } = useQuery<Holding[]>({ queryKey: ["/api/holdings"] });
  const { data: dividends = [], isLoading: loadingD } = useQuery<Dividend[]>({ queryKey: ["/api/dividends"] });
  const { data: fxRates = [], isLoading: loadingF } = useQuery<FxRate[]>({ queryKey: ["/api/fx-rates"] });

  const loading = loadingA || loadingH || loadingD || loadingF;

  const refreshAll = useMutation({
    mutationFn: () => apiRequest("POST", "/api/holdings/refresh-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fx-rates"] });
      toast({ title: "Prices refreshed", description: "All live prices & FX rates updated." });
    },
    onError: () => toast({ title: "Refresh failed", description: "Could not reach price APIs.", variant: "destructive" }),
  });

  const summary = buildPortfolioSummary(holdings, assets, dividends, fxRates);

  // Top holdings by value
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const holdingsSorted = [...holdings]
    .filter(h => h.currentPrice)
    .map(h => {
      const asset = assetMap.get(h.assetId);
      if (!asset) return null;
      const valueSEK = toSEK(holdingMarketValue(h), asset.currency, fxRates);
      const pct = holdingGainLossPct(h, asset.currency, fxRates);
      return { h, asset, valueSEK, pct };
    })
    .filter(Boolean)
    .sort((a, b) => b!.valueSEK - a!.valueSEK)
    .slice(0, 8) as { h: Holding; asset: Asset; valueSEK: number; pct: number }[];

  // Allocation by type for pie
  const allocationData = Object.entries(summary.allocationByType)
    .map(([type, valueSEK]) => ({
      name: ASSET_TYPE_LABELS[type] || type,
      value: Math.round(valueSEK),
      color: TYPE_COLORS[type] || "#95A5A6",
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  // Currency allocation
  const currencyData = Object.entries(summary.allocationByCurrency)
    .map(([currency, value]) => ({ name: currency, value: Math.round(value) }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const isEmpty = holdings.length === 0 && !loading;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Översikt</h1>
          <p className="text-sm text-muted-foreground">Portföljvärde i SEK</p>
        </div>
        <button
          data-testid="refresh-all"
          onClick={() => refreshAll.mutate()}
          disabled={refreshAll.isPending}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshAll.isPending ? "animate-spin" : ""} />
          Uppdatera kurser
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Totalt förmögenhetsvärde"
          value={loading ? "—" : formatSEK(summary.totalValueSEK)}
          sub={loading ? undefined : `Kostnad: ${formatSEK(summary.totalCostSEK)}`}
          icon={Wallet}
          loading={loading}
        />
        <KPICard
          label="Total vinst/förlust"
          value={loading ? "—" : formatSEK(summary.totalGainSEK)}
          sub={loading ? undefined : formatPct(summary.totalGainPct)}
          icon={summary.totalGainSEK >= 0 ? TrendingUp : TrendingDown}
          color={summary.totalGainSEK >= 0 ? "gain" : "loss"}
          loading={loading}
        />
        <KPICard
          label="Total utdelning (YTD)"
          value={loading ? "—" : formatSEK(summary.totalDividendsSEK)}
          sub={loading ? undefined : `YoC: ${summary.totalCostSEK > 0 ? ((summary.totalDividendsSEK / summary.totalCostSEK) * 100).toFixed(2) + "%" : "—"}`}
          icon={Banknote}
          color="dividend"
          loading={loading}
        />
        <KPICard
          label="Antal innehav"
          value={loading ? "—" : holdings.length.toString()}
          sub={loading ? undefined : `${assets.length} tillgångar`}
          icon={PiggyBank}
          loading={loading}
        />
      </div>

      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold mb-2">Inga innehav ännu</h3>
          <p className="text-muted-foreground text-sm max-w-xs mb-6">
            Lägg till en tillgång och ett innehav för att se din portföljöversikt.
          </p>
        </div>
      )}

      {/* Main grid */}
      {!isEmpty && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Allocation pie */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold mb-4">Tillgångsfördelning</h2>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : allocationData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={allocationData}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {allocationData.map((entry, i) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatSEK(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="space-y-1.5 mt-3">
                  {allocationData.map(d => (
                    <li key={d.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        {d.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {summary.totalValueSEK > 0 ? ((d.value / summary.totalValueSEK) * 100).toFixed(1) + "%" : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">Inga kurser tillgängliga</div>
            )}
          </div>

          {/* Currency exposure */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold mb-4">Valutaexponering (SEK)</h2>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : currencyData.length > 0 ? (
              <div className="space-y-3 mt-2">
                {currencyData.map((d, i) => (
                  <div key={d.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{d.name}</span>
                      <span className="tabular-nums text-muted-foreground">{formatSEK(d.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${summary.totalValueSEK > 0 ? (d.value / summary.totalValueSEK) * 100 : 0}%`,
                          backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">Inga innehav</div>
            )}

            {/* FX rates widget */}
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Växelkurser → SEK</p>
              <div className="grid grid-cols-3 gap-2">
                {fxRates.map(r => (
                  <div key={r.currency} className="text-center">
                    <div className="text-[11px] text-muted-foreground">{r.currency}</div>
                    <div className="text-sm font-semibold tabular-nums">{r.rateSek.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick entry */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold mb-4">Snabbregistrering</h2>
            <AddQuickEntry holdings={holdings} assets={assets} />
          </div>
        </div>
      )}

      {/* Top holdings table */}
      {!isEmpty && holdingsSorted.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Topp-innehav</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Tillgång</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Typ</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Kurs</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Värde (SEK)</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Vinst/Förlust</th>
                </tr>
              </thead>
              <tbody>
                {holdingsSorted.map(({ h, asset, valueSEK, pct }) => (
                  <tr key={h.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium">{asset.name}</div>
                      <div className="text-xs text-muted-foreground">{asset.ticker || "—"} · {h.account}</div>
                    </td>
                    <td className="px-4 py-3 flex gap-1 items-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium badge-${asset.type.replace("_", "-")}`}>
                        {ASSET_TYPE_LABELS[asset.type]}
                      </span>
                      <span className="px-1.5 py-0.5 rounded border border-border text-[10px] font-semibold uppercase text-muted-foreground bg-muted/20">
                        {asset.currency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {h.currentPrice?.toFixed(2) ?? "—"} {asset.currency}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatSEK(valueSEK)}
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums font-medium ${pct >= 0 ? "text-gain" : "text-loss"}`}>
                      {formatPct(pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
