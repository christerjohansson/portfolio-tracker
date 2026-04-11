import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { FxRate, Asset } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Trash2, Save, Pencil, Search, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ASSET_TYPE_LABELS, CURRENCIES, ASSET_TYPE_CURRENCIES } from "@/lib/portfolio";
import { useState, useEffect, useRef, useCallback } from "react";

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

  const createAsset = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/assets", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Tillgång skapad" });
    },
    onError: () => toast({ title: "Kunde inte skapa tillgång", variant: "destructive" }),
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

  const handleSelectRemote = (remote: any) => {
    const ticker = remote.symbol.replace(/\.(ST|OL|TO|V|DE|F)$/, "").replace(/-(USD|EUR|GBP|SEK|NOK|CAD)$/, "");
    const type = inferAssetType(remote);
    const currency = ASSET_TYPE_CURRENCIES[type] || "SEK";
    createAsset.mutate({
      name: remote.name,
      ticker,
      type,
      currency,
      exchange: remote.exchange || null,
      isActive: true
    });
  };

  const AddAssetSearch = ({ onAdd }: { onAdd: (remote: any) => void }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const searchRef = useRef<HTMLDivElement>(null);

    const doSearch = useCallback((q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.length < 1) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const res = await fetch(`/api/search/ticker?q=${encodeURIComponent(q)}`);
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data.remote || []);
            setShowDropdown(true);
          }
        } catch { /* ignore */ }
        setSearching(false);
      }, 300);
    }, []);

    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
      <div className="p-5 border-b border-border bg-muted/10">
        <div ref={searchRef} className="relative max-w-md">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Lägg till ny tillgång</label>
          <div className="relative">
            <Input
              placeholder="Sök namn eller ticker (t.ex. Volvo, AAPL...)"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); doSearch(e.target.value); }}
              className="h-9 pr-8"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {searching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            </div>
          </div>
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button
                  key={`${r.symbol}-${i}`}
                  onClick={() => { onAdd(r); setSearchQuery(""); setShowDropdown(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between border-b border-border last:border-0"
                >
                  <div className="overflow-hidden">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{r.symbol} · {r.exchange}</div>
                  </div>
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-bold uppercase">{r.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const AssetList = ({ filterTypes }: { filterTypes: string[] }) => {
    const filtered = assets.filter(a => filterTypes.includes(a.type));
    if (filtered.length === 0) return <div className="px-5 py-6 text-sm text-muted-foreground text-center">Inga tillgångar i denna kategori</div>;
    return (
      <div className="divide-y divide-border">
        {filtered.map(a => (
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
    );
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
          <h2 className="text-sm font-semibold">Tillgångshantering</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{assets.length} tillgångar registrerade</p>
        </div>
        
        <Tabs defaultValue="stock">
          <div className="px-5 py-3 bg-muted/20 border-b border-border">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="stock" className="text-xs">Aktier</TabsTrigger>
              <TabsTrigger value="fund" className="text-xs">Fonder</TabsTrigger>
              <TabsTrigger value="etf" className="text-xs">ETF:er</TabsTrigger>
              <TabsTrigger value="crypto" className="text-xs">Krypto</TabsTrigger>
              <TabsTrigger value="cash" className="text-xs">Kassa / Övrigt</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="stock" className="mt-0">
            <AddAssetSearch onAdd={handleSelectRemote} />
            <AssetList filterTypes={["stock_se", "stock_us", "stock_ca", "stock_no"]} />
          </TabsContent>

          <TabsContent value="fund" className="mt-0">
            <AddAssetSearch onAdd={handleSelectRemote} />
            <AssetList filterTypes={["fund_se", "fund_us", "fund_de"]} />
          </TabsContent>

          <TabsContent value="etf" className="mt-0">
            <AddAssetSearch onAdd={handleSelectRemote} />
            <AssetList filterTypes={["etf_se", "etf_us", "etf_de", "etf_ca", "etf_no"]} />
          </TabsContent>

          <TabsContent value="crypto" className="mt-0">
            <AddAssetSearch onAdd={handleSelectRemote} />
            <AssetList filterTypes={["crypto"]} />
          </TabsContent>

          <TabsContent value="cash" className="mt-0">
            <AssetList filterTypes={["cash"]} />
          </TabsContent>
        </Tabs>
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
