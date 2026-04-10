import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Asset, Holding, Transaction } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Filter, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";

const TX_TYPE_LABELS: Record<string, string> = {
  buy: "Köp",
  sell: "Sälj",
  deposit: "Insättning",
  withdrawal: "Uttag",
  transfer: "Överföring",
};

const TX_TYPE_COLORS: Record<string, string> = {
  buy: "text-gain",
  sell: "text-loss",
  deposit: "text-blue-600 dark:text-blue-400",
  withdrawal: "text-dividend",
  transfer: "text-muted-foreground",
};

// ─── Edit Transaction Modal ───────────────────────────────────────────────────
function EditTransactionModal({ tx, assets, holdings, onClose }: { tx: Transaction | null; assets: Asset[]; holdings: Holding[]; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm({
    values: {
      date: tx ? tx.date : "",
      type: tx ? tx.type : "",
      quantity: tx && tx.quantity != null ? String(tx.quantity) : "",
      price: tx && tx.price != null ? String(tx.price) : "",
      amount: tx ? String(tx.amount) : "",
      fees: tx ? String(tx.fees) : "",
      holdingId: tx ? String(tx.holdingId) : "",
    },
  });

  const updateTx = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/transactions/${tx?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "Transaktion uppdaterad" });
      onClose();
    },
  });

  if (!tx) return null;

  return (
    <Dialog open={!!tx} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Redigera transaktion</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(d => updateTx.mutate({
          date: d.date,
          type: d.type,
          quantity: d.quantity ? Number(d.quantity) : null,
          price: d.price ? Number(d.price) : null,
          amount: Number(d.amount),
          fees: Number(d.fees),
          holdingId: Number(d.holdingId),
        }))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Datum *</label>
              <Input type="date" {...form.register("date")} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Typ *</label>
              <Select value={form.watch("type")} onValueChange={v => form.setValue("type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Köp</SelectItem>
                  <SelectItem value="sell">Sälj</SelectItem>
                  <SelectItem value="deposit">Insättning</SelectItem>
                  <SelectItem value="withdrawal">Uttag</SelectItem>
                  <SelectItem value="transfer">Överföring</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Innehav *</label>
            <Select value={form.watch("holdingId")} onValueChange={v => form.setValue("holdingId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Välj innehav..." />
              </SelectTrigger>
              <SelectContent>
                {holdings.map(h => {
                  const a = assets.find(asset => asset.id === h.assetId);
                  return (
                    <SelectItem key={h.id} value={String(h.id)}>
                      {a ? `${a.name} (${a.currency}) - ` : ""}{h.account}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Antal</label>
              <Input type="number" step="any" {...form.register("quantity")} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Pris per st</label>
              <Input type="number" step="any" {...form.register("price")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Totalt belopp *</label>
              <Input type="number" step="any" {...form.register("amount")} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Courtage / Avgifter</label>
              <Input type="number" step="any" {...form.register("fees")} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">Avbryt</button>
            <button type="submit" disabled={updateTx.isPending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground">
              {updateTx.isPending ? "Sparar…" : "Spara"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Transactions() {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const { data: assets = [] } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: holdings = [] } = useQuery<Holding[]>({ queryKey: ["/api/holdings"] });
  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({ queryKey: ["/api/transactions"] });

  const assetMap = new Map(assets.map(a => [a.id, a]));
  const holdingMap = new Map(holdings.map(h => [h.id, h]));

  const deleteTx = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/transactions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/transactions"] }),
  });

  const filtered = transactions.filter(tx => {
    if (typeFilter !== "all" && tx.type !== typeFilter) return false;
    if (search) {
      const h = holdingMap.get(tx.holdingId);
      const a = h ? assetMap.get(h.assetId) : null;
      const text = [a?.name, h?.account, tx.notes, tx.date].filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // Totals
  const totalIn = transactions.filter(t => ["buy","deposit"].includes(t.type)).reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter(t => ["sell","withdrawal"].includes(t.type)).reduce((s, t) => s + t.amount, 0);
  const totalFees = transactions.reduce((s, t) => s + (t.fees || 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Transaktioner</h1>
          <p className="text-sm text-muted-foreground">{transactions.length} transaktioner</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="kpi-card">
          <div className="kpi-label mb-2">Total inköp</div>
          <div className="kpi-value text-gain tabular-nums">{totalIn.toLocaleString("sv-SE", { minimumFractionDigits: 0 })}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label mb-2">Total försäljning</div>
          <div className="kpi-value text-loss tabular-nums">{totalOut.toLocaleString("sv-SE", { minimumFractionDigits: 0 })}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label mb-2">Totala avgifter</div>
          <div className="kpi-value text-muted-foreground tabular-nums">{totalFees.toFixed(2)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Sök…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 text-sm"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-9 text-sm" data-testid="filter-tx-type">
            <Filter size={13} className="mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla typer</SelectItem>
            <SelectItem value="buy">Köp</SelectItem>
            <SelectItem value="sell">Sälj</SelectItem>
            <SelectItem value="deposit">Insättning</SelectItem>
            <SelectItem value="withdrawal">Uttag</SelectItem>
            <SelectItem value="transfer">Överföring</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} träffar</span>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="text-3xl mb-3">📋</div>
            <p className="text-sm text-muted-foreground">Inga transaktioner hittades.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Datum</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Typ</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Tillgång / Konto</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Antal</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Kurs</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Belopp</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Avgifter</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => {
                  const h = holdingMap.get(tx.holdingId);
                  const a = h ? assetMap.get(h.assetId) : null;
                  return (
                    <tr key={tx.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 tabular-nums text-muted-foreground text-xs">{tx.date}</td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${TX_TYPE_COLORS[tx.type] || ""}`}>
                          {TX_TYPE_LABELS[tx.type] || tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{a?.name ?? "?"}</div>
                        <div className="text-xs text-muted-foreground">{h?.account ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {tx.quantity != null ? tx.quantity.toFixed(4) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {tx.price != null ? tx.price.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {tx.amount.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} {a?.currency || ""}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {tx.fees > 0 ? tx.fees.toFixed(2) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingTx(tx)}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => { if (confirm("Ta bort transaktion?")) deleteTx.mutate(tx.id); }}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditTransactionModal tx={editingTx} assets={assets} holdings={holdings} onClose={() => setEditingTx(null)} />
    </div>
  );
}
