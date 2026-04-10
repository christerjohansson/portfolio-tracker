import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Asset, Holding, Dividend, FxRate } from "@shared/schema";
import { formatSEK, formatCurrency, toSEK, yieldOnCost, CURRENCIES } from "@/lib/portfolio";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Add Dividend Modal ───────────────────────────────────────────────────────
function AddDividendModal({
  open, onClose, holdings, assets
}: {
  open: boolean; onClose: () => void; holdings: Holding[]; assets: Asset[];
}) {
  const { toast } = useToast();
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const [holdingId, setHoldingId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");    // per share
  const [currency, setCurrency] = useState("SEK");
  const [notes, setNotes] = useState("");

  const selectedHolding = holdings.find(h => String(h.id) === holdingId);
  const totalAmount = selectedHolding && amount
    ? selectedHolding.quantity * Number(amount)
    : 0;

  const createDiv = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/dividends", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividends"] });
      toast({ title: "Utdelning registrerad" });
      setHoldingId(""); setAmount(""); setNotes("");
      onClose();
    },
    onError: () => toast({ title: "Fel", description: "Kunde inte registrera utdelning.", variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!holdingId || !amount) {
      toast({ title: "Fyll i alla obligatoriska fält", variant: "destructive" });
      return;
    }
    createDiv.mutate({
      holdingId: Number(holdingId),
      date,
      amount: Number(amount),
      totalAmount: totalAmount,
      currency,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrera utdelning</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Innehav *</label>
            <Select value={holdingId} onValueChange={setHoldingId}>
              <SelectTrigger data-testid="select-dividend-holding">
                <SelectValue placeholder="Välj innehav..." />
              </SelectTrigger>
              <SelectContent>
                {holdings.map(h => {
                  const a = assetMap.get(h.assetId);
                  return <SelectItem key={h.id} value={String(h.id)}>{a?.name ?? "?"} — {h.account}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Utdelning / aktie *</label>
              <Input
                data-testid="input-dividend-amount"
                type="number" step="any" placeholder="2.50"
                value={amount} onChange={e => setAmount(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Valuta *</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {totalAmount > 0 && (
            <div className="p-3 bg-dividend-subtle rounded-md text-sm">
              <span className="text-muted-foreground">Totalt mottaget: </span>
              <span className="font-semibold text-dividend tabular-nums">
                {totalAmount.toFixed(2)} {currency}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                ({selectedHolding?.quantity.toFixed(2)} × {Number(amount).toFixed(2)})
              </span>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Datum</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Anteckning</label>
            <Input placeholder="Valfri kommentar" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80">Avbryt</button>
            <button
              data-testid="btn-save-dividend"
              onClick={handleSubmit}
              disabled={createDiv.isPending}
              className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60"
            >
              {createDiv.isPending ? "Sparar…" : "Registrera"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Dividends() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);

  const { data: assets = [] } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: holdings = [] } = useQuery<Holding[]>({ queryKey: ["/api/holdings"] });
  const { data: dividends = [], isLoading } = useQuery<Dividend[]>({ queryKey: ["/api/dividends"] });
  const { data: fxRates = [] } = useQuery<FxRate[]>({ queryKey: ["/api/fx-rates"] });

  const assetMap = new Map(assets.map(a => [a.id, a]));
  const holdingMap = new Map(holdings.map(h => [h.id, h]));

  const deleteDiv = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dividends/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dividends"] }),
  });

  // Summary calculations
  const totalDividendsSEK = dividends.reduce((sum, d) => sum + toSEK(d.totalAmount, d.currency, fxRates), 0);

  // By holding
  const byHolding: Record<number, { totalSEK: number; count: number }> = {};
  dividends.forEach(d => {
    if (!byHolding[d.holdingId]) byHolding[d.holdingId] = { totalSEK: 0, count: 0 };
    byHolding[d.holdingId].totalSEK += toSEK(d.totalAmount, d.currency, fxRates);
    byHolding[d.holdingId].count++;
  });

  // Monthly summary (this year)
  const thisYear = new Date().getFullYear();
  const monthlyTotals: Record<string, number> = {};
  dividends.forEach(d => {
    if (!d.date.startsWith(String(thisYear))) return;
    const month = d.date.slice(0, 7); // YYYY-MM
    monthlyTotals[month] = (monthlyTotals[month] || 0) + toSEK(d.totalAmount, d.currency, fxRates);
  });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Utdelningar</h1>
          <p className="text-sm text-muted-foreground">{dividends.length} utbetalningar registrerade</p>
        </div>
        <button
          data-testid="btn-add-dividend"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Plus size={14} /> Registrera utdelning
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="kpi-card">
          <div className="kpi-label mb-2 flex items-center gap-1"><Banknote size={14} className="text-dividend" />Total utdelning</div>
          <div className="kpi-value text-dividend">{formatSEK(totalDividendsSEK)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label mb-2">Antal utdelningar</div>
          <div className="kpi-value">{dividends.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label mb-2">Genomsnitt / utdelning</div>
          <div className="kpi-value">
            {dividends.length > 0 ? formatSEK(totalDividendsSEK / dividends.length) : "—"}
          </div>
        </div>
      </div>

      {/* Per holding YoC table */}
      {Object.keys(byHolding).length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Avkastning på anskaffningsvärde (YoC)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Innehav</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Totalt (SEK)</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Antal utbetalningar</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">YoC</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byHolding).map(([hid, info]) => {
                  const h = holdingMap.get(Number(hid));
                  const a = h ? assetMap.get(h.assetId) : null;
                  const costBasis = h ? toSEK(h.costBasis, a?.currency || "SEK", fxRates) : 0;
                  const yoc = yieldOnCost(costBasis, info.totalSEK);
                  return (
                    <tr key={hid} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium">{a?.name ?? "?"}</div>
                        <div className="text-xs text-muted-foreground">{h?.account ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-dividend font-medium">{formatSEK(info.totalSEK)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{info.count}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-gain">{yoc.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All dividends list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Alla utdelningar</h2>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : dividends.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="text-3xl mb-3">💰</div>
            <p className="text-sm text-muted-foreground">Inga utdelningar registrerade ännu.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Datum</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Innehav</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Per aktie</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Totalt</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">SEK</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {dividends.map(d => {
                  const h = holdingMap.get(d.holdingId);
                  const a = h ? assetMap.get(h.assetId) : null;
                  const sek = toSEK(d.totalAmount, d.currency, fxRates);
                  return (
                    <tr key={d.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 tabular-nums text-muted-foreground">{d.date}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{a?.name ?? "?"}</div>
                        <div className="text-xs text-muted-foreground">{h?.account ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.amount.toFixed(4)} {d.currency}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-dividend">{d.totalAmount.toFixed(2)} {d.currency}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatSEK(sek)}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => deleteDiv.mutate(d.id)}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddDividendModal open={showAdd} onClose={() => setShowAdd(false)} holdings={holdings} assets={assets} />
    </div>
  );
}

// Missing import
function Banknote({ size, className }: { size?: number; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size||24} height={size||24} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>;
}
