import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { FxRate, Asset } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Trash2, Save, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ASSET_TYPE_LABELS, CURRENCIES } from "@/lib/portfolio";

const ASSET_TYPES = [
  "stock_se", "stock_us", "stock_ca", "stock_no", "crypto",
  "fund_se", "fund_us", "fund_de",
  "etf_se", "etf_us", "etf_de", "etf_ca", "etf_no", "cash"
] as const;

// ─── Edit Asset Modal ────────────────────────────────────────────────────────
function EditAssetModal({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState("stock_se");
  const [currency, setCurrency] = useState("SEK");
  const [exchange, setExchange] = useState("");
  const [isin, setIsin] = useState("");
  const [notes, setNotes] = useState("");

  // Sync state when asset changes
  if (asset && name !== asset.name && ticker !== (asset.ticker || "")) {
    setName(asset.name);
    setTicker(asset.ticker || "");
    setType(asset.type);
    setCurrency(asset.currency);
    setExchange(asset.exchange || "");
    setIsin(asset.isin || "");
    setNotes(asset.notes || "");
  }

  const updateAsset = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/assets/${asset?.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Tillgång uppdaterad" });
      onClose();
    },
    onError: () => toast({ title: "Kunde inte uppdatera", variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!name) { toast({ title: "Namn krävs", variant: "destructive" }); return; }
    updateAsset.mutate({
      name, ticker: ticker || null, type, currency,
      exchange: exchange || null, isin: isin || null, notes: notes || null,
    });
  };

  if (!asset) return null;

  return (
    <Dialog open={!!asset} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Redigera tillgång</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Namn *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="t.ex. Ericsson B" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Typ *</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{ASSET_TYPE_LABELS[t] || t}</SelectItem>)}
                </SelectContent>
              </Select>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Ticker</label>
              <Input value={ticker} onChange={e => setTicker(e.target.value)} placeholder="t.ex. ERIC-B" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Börs</label>
              <Input value={exchange} onChange={e => setExchange(e.target.value)} placeholder="t.ex. STO" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">ISIN</label>
            <Input value={isin} onChange={e => setIsin(e.target.value)} placeholder="SE0000108656" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Anteckning</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Valfri kommentar" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80">Avbryt</button>
            <button
              onClick={handleSubmit}
              disabled={updateAsset.isPending}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {updateAsset.isPending ? "Sparar…" : "Spara ändringar"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { data: fxRates = [], isLoading: loadingFX } = useQuery<FxRate[]>({ queryKey: ["/api/fx-rates"] });
  const { data: assets = [] } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });

  const [editRates, setEditRates] = useState<Record<string, string>>({});
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  const refreshFX = useMutation({
    mutationFn: () => apiRequest("POST", "/api/fx-rates/refresh"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fx-rates"] });
      toast({ title: "Växelkurser uppdaterade" });
    },
    onError: () => toast({ title: "Kunde inte hämta växelkurser", variant: "destructive" }),
  });

  const updateRate = useMutation({
    mutationFn: ({ currency, rateSek }: { currency: string; rateSek: number }) =>
      apiRequest("PATCH", `/api/fx-rates/${currency}`, { rateSek }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fx-rates"] });
      toast({ title: "Kurs uppdaterad" });
    },
  });

  const deleteAsset = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/assets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/assets"] }),
  });

  const handleSaveRate = (currency: string) => {
    const v = Number(editRates[currency]);
    if (!v || isNaN(v)) return;
    updateRate.mutate({ currency, rateSek: v });
    setEditRates(p => { const n = { ...p }; delete n[currency]; return n; });
  };

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Inställningar</h1>
        <p className="text-sm text-muted-foreground">Växelkurser, tillgångar och datainformation</p>
      </div>

      {/* FX Rates */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Växelkurser → SEK</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Används för omräkning av alla tillgångar till SEK</p>
          </div>
          <button
            data-testid="btn-refresh-fx"
            onClick={() => refreshFX.mutate()}
            disabled={refreshFX.isPending}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60"
          >
            <RefreshCw size={12} className={refreshFX.isPending ? "animate-spin" : ""} />
            Hämta live-kurser
          </button>
        </div>
        <div className="divide-y divide-border">
          {fxRates.map(r => (
            <div key={r.currency} className="flex items-center justify-between px-5 py-3 gap-4">
              <div>
                <span className="font-semibold text-sm">{r.currency}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  Uppdaterad: {new Date(r.updatedAt).toLocaleDateString("sv-SE")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  className="w-24 h-8 text-sm tabular-nums text-right"
                  value={editRates[r.currency] !== undefined ? editRates[r.currency] : r.rateSek.toFixed(4)}
                  onChange={e => setEditRates(p => ({ ...p, [r.currency]: e.target.value }))}
                  data-testid={`input-rate-${r.currency}`}
                />
                <span className="text-xs text-muted-foreground">SEK</span>
                {editRates[r.currency] !== undefined && (
                  <button
                    onClick={() => handleSaveRate(r.currency)}
                    className="p-1.5 rounded text-primary hover:bg-primary/10 transition-colors"
                    title="Spara"
                  >
                    <Save size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Asset management */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Tillgångar</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{assets.length} tillgångar registrerade</p>
        </div>
        <div className="divide-y divide-border">
          {assets.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground text-center">Inga tillgångar ännu</div>
          ) : assets.map(a => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <span className="font-medium text-sm">{a.name}</span>
                {a.ticker && <span className="ml-2 text-xs text-muted-foreground font-mono">{a.ticker}</span>}
                <span className="ml-2 text-xs text-muted-foreground">{ASSET_TYPE_LABELS[a.type] || a.type} · {a.currency}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditingAsset(a)}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Redigera"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => { if (confirm(`Ta bort ${a.name}?`)) deleteAsset.mutate(a.id); }}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Ta bort"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Data info */}
      <section className="bg-card border border-border rounded-lg px-5 py-4">
        <h2 className="text-sm font-semibold mb-3">Datainformation</h2>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>• All data lagras lokalt i <code className="font-mono bg-muted px-1 py-0.5 rounded">portfolio.db</code> (SQLite)</li>
          <li>• Inga data skickas till externa servrar (förutom pris-API:er)</li>
          <li>• Aktiekurser hämtas från Yahoo Finance</li>
          <li>• Kryptokurser hämtas från CoinGecko</li>
          <li>• Växelkurser hämtas från open.er-api.com</li>
          <li>• Fonder utan ticker kräver manuell prisuppdatering</li>
        </ul>
      </section>

      <EditAssetModal asset={editingAsset} onClose={() => setEditingAsset(null)} />
    </div>
  );
}
