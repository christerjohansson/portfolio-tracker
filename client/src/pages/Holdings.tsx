import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Asset, Holding, FxRate, Dividend } from "@shared/schema";
import {
  formatSEK, formatCurrency, formatPct, formatNumber,
  toSEK, holdingMarketValue, holdingGainLossSEK, holdingGainLossPct,
  ASSET_TYPE_LABELS, ASSET_TYPE_CURRENCIES, CURRENCIES, enrichWithDividendCash
} from "@/lib/portfolio";
import { useToast } from "@/hooks/use-toast";
import { Plus, RefreshCw, Pencil, Trash2, X, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAssetSchema, insertHoldingSchema } from "@shared/schema";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const ASSET_TYPES = [
  "stock_se", "stock_us", "stock_ca", "stock_no", "crypto", "fund_se", "fund_us", "fund_de", "etf_se", "etf_us", "etf_de", "etf_ca", "etf_no", "cash"
] as const;

const TYPE_GROUPS = [
  { label: "Aktier", types: ["stock_se", "stock_us", "stock_ca", "stock_no"] },
  { label: "Krypto", types: ["crypto"] },
  { label: "Fonder", types: ["fund_se", "fund_us", "fund_de"] },
  { label: "ETF", types: ["etf_se", "etf_us", "etf_de", "etf_ca", "etf_no"] },
  { label: "Kassa", types: ["cash"] },
];

// ─── Add Asset Modal ─────────────────────────────────────────────────────────
function AddAssetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof insertAssetSchema>>({
    resolver: zodResolver(insertAssetSchema),
    defaultValues: { name: "", type: "stock_se", currency: "SEK", isActive: true },
  });

  const createAsset = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/assets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Tillgång skapad" });
      form.reset();
      onClose();
    },
  });

  const watchType = form.watch("type");
  // Auto-set currency based on type
  const handleTypeChange = (v: string) => {
    form.setValue("type", v);
    form.setValue("currency", ASSET_TYPE_CURRENCIES[v] || "SEK");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till tillgång</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => createAsset.mutate(d))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Namn *</FormLabel>
                <FormControl><Input placeholder="t.ex. Ericsson B" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Typ *</FormLabel>
                  <Select value={field.value} onValueChange={handleTypeChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-asset-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{ASSET_TYPE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="currency" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valuta *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="ticker" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ticker</FormLabel>
                  <FormControl><Input placeholder="t.ex. ERIC-B" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="exchange" render={({ field }) => (
                <FormItem>
                  <FormLabel>Börs</FormLabel>
                  <FormControl><Input placeholder="t.ex. STO" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="isin" render={({ field }) => (
              <FormItem>
                <FormLabel>ISIN</FormLabel>
                <FormControl><Input placeholder="SE0000108656" {...field} value={field.value ?? ""} /></FormControl>
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80">Avbryt</button>
              <button type="submit" disabled={createAsset.isPending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {createAsset.isPending ? "Sparar…" : "Skapa tillgång"}
              </button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Holding Modal ────────────────────────────────────────────────────────
function AddHoldingModal({ open, onClose, assets }: { open: boolean; onClose: () => void; assets: Asset[] }) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ local: Asset[]; remote: any[] }>({ local: [], remote: [] });
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const form = useForm({
    defaultValues: {
      account: "",
      quantity: "",
      costBasis: "",
      costBasisCurrency: "SEK",
      currentPrice: "",
      manualPrice: false,
    },
  });

  const createHolding = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/holdings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      toast({ title: "Innehav skapat" });
      form.reset();
      setSelectedAsset(null);
      setSearchQuery("");
      onClose();
    },
  });

  // Debounced ticker search
  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 1) {
      setSearchResults({ local: [], remote: [] });
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search/ticker?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(true);
        }
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearchQuery(v);
    setSelectedAsset(null);
    doSearch(v);
  };

  // Derive asset type from Yahoo data
  const inferAssetType = (remote: any): string => {
    const sym = remote.symbol || "";
    const quoteType = (remote.type || "").toUpperCase();
    const exch = (remote.exchange || "").toUpperCase();
    if (quoteType === "CRYPTOCURRENCY") return "crypto";
    if (sym.endsWith(".ST")) return quoteType === "ETF" ? "etf_se" : "stock_se";
    if (sym.endsWith(".OL")) return quoteType === "ETF" ? "etf_no" : "stock_no";
    if (sym.endsWith(".TO") || sym.endsWith(".V")) return quoteType === "ETF" ? "etf_ca" : "stock_ca";
    if (sym.endsWith(".DE") || sym.endsWith(".F")) return quoteType === "ETF" ? "etf_de" : "fund_de";
    if (exch === "NMS" || exch === "NYQ" || exch === "NGM" || exch === "PCX" || exch === "BTS") {
      return quoteType === "ETF" ? "etf_us" : "stock_us";
    }
    if (quoteType === "ETF") return "etf_us";
    if (quoteType === "MUTUALFUND") return "fund_se";
    return "stock_us";
  };

  const cleanTicker = (sym: string): string => sym.replace(/\.(ST|OL|TO|V|DE|F)$/, "").replace(/-(USD|EUR|GBP|SEK|NOK|CAD)$/, "");

  const handleSelectLocal = (asset: Asset) => {
    setSelectedAsset(asset);
    setSearchQuery(`${asset.name} (${asset.ticker || asset.type})`);
    setShowDropdown(false);
    form.setValue("costBasisCurrency", asset.currency);
  };

  const handleSelectRemote = async (remote: any) => {
    setShowDropdown(false);
    setSearching(true);
    const ticker = cleanTicker(remote.symbol);
    const existing = assets.find(a => a.ticker?.toLowerCase() === ticker.toLowerCase());
    if (existing) {
      setSelectedAsset(existing);
      setSearchQuery(`${existing.name} (${existing.ticker})`);
      form.setValue("costBasisCurrency", existing.currency);
      setSearching(false);
      return;
    }
    const assetType = inferAssetType(remote);
    const currency = ASSET_TYPE_CURRENCIES[assetType] || "SEK";
    try {
      const res = await apiRequest("POST", "/api/assets", {
        name: remote.name, ticker, type: assetType, currency,
        exchange: remote.exchange || null, isActive: true,
      });
      const newAsset = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      setSelectedAsset(newAsset);
      setSearchQuery(`${newAsset.name} (${newAsset.ticker})`);
      form.setValue("costBasisCurrency", newAsset.currency);
      toast({ title: "Tillgång skapad", description: `${newAsset.name} (${newAsset.ticker}) lades till.` });
    } catch {
      toast({ title: "Kunde inte skapa tillgång", variant: "destructive" });
    }
    setSearching(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSearchQuery(""); setSelectedAsset(null); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till innehav</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(d => {
          if (!selectedAsset) { toast({ title: "Välj en tillgång först", variant: "destructive" }); return; }
          createHolding.mutate({
            assetId: selectedAsset.id, account: d.account,
            quantity: Number(d.quantity), costBasis: Number(d.costBasis),
            costBasisCurrency: d.costBasisCurrency || null,
            currentPrice: d.currentPrice ? Number(d.currentPrice) : null,
            manualPrice: d.manualPrice,
          });
        })} className="space-y-4">
          {/* Ticker search */}
          <div ref={searchRef} className="relative">
            <label className="text-sm font-medium mb-1.5 block">Sök tillgång (ticker / namn) *</label>
            <div className="relative">
              <Input
                placeholder="t.ex. ERIC-B, AAPL, Tesla..."
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => { if (searchResults.local.length > 0 || searchResults.remote.length > 0) setShowDropdown(true); }}
                className={selectedAsset ? "border-green-500/50 bg-green-500/5" : ""}
                autoComplete="off"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <RefreshCw size={14} className="animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {selectedAsset && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 font-semibold text-[10px]">Vald</span>
                {selectedAsset.name} · {selectedAsset.ticker || "—"} · {selectedAsset.currency}
                <button type="button" onClick={() => { setSelectedAsset(null); setSearchQuery(""); }} className="ml-auto text-muted-foreground hover:text-foreground">
                  <X size={12} />
                </button>
              </div>
            )}
            {showDropdown && !selectedAsset && (
              <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {searchResults.local.length > 0 && (
                  <div>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sparade tillgångar</div>
                    {searchResults.local.map(a => (
                      <button key={a.id} type="button" onClick={() => handleSelectLocal(a)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">{a.name}</span>
                          {a.ticker && <span className="ml-2 text-xs text-muted-foreground font-mono">{a.ticker}</span>}
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a.currency}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.remote.length > 0 && (
                  <div>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border">Yahoo Finance</div>
                    {searchResults.remote.map((r, i) => (
                      <button key={`${r.symbol}-${i}`} type="button" onClick={() => handleSelectRemote(r)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">{r.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground font-mono">{r.symbol}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">{r.exchange}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">{r.type || "EQUITY"}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.local.length === 0 && searchResults.remote.length === 0 && !searching && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">Inga resultat</div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Konto / Depå *</label>
            <Input placeholder="t.ex. Avanza ISK" {...form.register("account")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Antal</label>
              <Input type="number" step="any" placeholder="100" {...form.register("quantity")} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Anskaffningsvärde</label>
              <div className="flex gap-2">
                <Input type="number" step="any" placeholder="8250.00" {...form.register("costBasis")} className="flex-1" />
                <Select value={form.watch("costBasisCurrency")} onValueChange={v => form.setValue("costBasisCurrency", v)}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Aktuellt pris</label>
              <Input type="number" step="any" placeholder="Auto" {...form.register("currentPrice")} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...form.register("manualPrice")} className="w-4 h-4" />
                Manuellt pris
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80">Avbryt</button>
            <button type="submit" disabled={createHolding.isPending || !selectedAsset} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {createHolding.isPending ? "Sparar…" : "Skapa innehav"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


// ─── Edit Holding Modal ───────────────────────────────────────────────────────
function EditHoldingModal({ holding, assets, onClose }: { holding: Holding | null; assets: Asset[]; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm({
    values: {
      assetId: holding ? String(holding.assetId) : "",
      account: holding ? holding.account : "",
      quantity: holding ? String(holding.quantity) : "",
      costBasis: holding ? String(holding.costBasis) : "",
      costBasisCurrency: holding && holding.costBasisCurrency ? holding.costBasisCurrency : (holding ? (assets.find(a => a.id === holding.assetId)?.currency || "SEK") : "SEK"),
      currentPrice: holding && holding.currentPrice !== null ? String(holding.currentPrice) : "",
      manualPrice: holding ? holding.manualPrice : false,
    },
  });

  const updateHolding = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/holdings/${holding?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      toast({ title: "Innehav uppdaterat" });
      onClose();
    },
  });

  return (
    <Dialog open={!!holding} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Redigera innehav</DialogTitle>
        </DialogHeader>
        {holding && (
          <form onSubmit={form.handleSubmit(d => updateHolding.mutate({
            assetId: Number(d.assetId),
            account: d.account,
            quantity: Number(d.quantity),
            costBasis: Number(d.costBasis),
            costBasisCurrency: d.costBasisCurrency || null,
            currentPrice: d.currentPrice ? Number(d.currentPrice) : null,
            manualPrice: d.manualPrice,
          }))} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Tillgång *</label>
              <Select value={form.watch("assetId")} onValueChange={v => form.setValue("assetId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj tillgång..." />
                </SelectTrigger>
                <SelectContent>
                  {assets.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.ticker || a.type}) - {a.currency}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Konto / Depå *</label>
              <Input placeholder="t.ex. Avanza ISK" {...form.register("account")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Antal</label>
                <Input type="number" step="any" {...form.register("quantity")} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Anskaffningsvärde</label>
                <div className="flex gap-2">
                  <Input type="number" step="any" {...form.register("costBasis")} className="flex-1" />
                  <Select value={form.watch("costBasisCurrency")} onValueChange={v => form.setValue("costBasisCurrency", v)}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assets.map(a => a.currency).filter((v, i, a) => a.indexOf(v) === i).concat(["SEK"]).filter((v, i, a) => a.indexOf(v) === i).map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Aktuellt pris</label>
                <Input type="number" step="any" placeholder="Auto" {...form.register("currentPrice")} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" {...form.register("manualPrice")} className="w-4 h-4" />
                  Manuellt pris
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80">Avbryt</button>
              <button type="submit" disabled={updateHolding.isPending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {updateHolding.isPending ? "Sparar…" : "Spara ändringar"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Holdings Page ────────────────────────────────────────────────────────────
export default function Holdings() {
  const { toast } = useToast();
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const { data: assets = [], isLoading: loadingA } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: holdings = [], isLoading: loadingH } = useQuery<Holding[]>({ queryKey: ["/api/holdings"] });
  const { data: fxRates = [] } = useQuery<FxRate[]>({ queryKey: ["/api/fx-rates"] });
  const { data: dividends = [] } = useQuery<Dividend[]>({ queryKey: ["/api/dividends"] });

  const { augmentedHoldings, augmentedAssets } = useMemo(() => enrichWithDividendCash(holdings, assets, dividends), [holdings, assets, dividends]);

  const assetMap = new Map(augmentedAssets.map(a => [a.id, a]));

  const refreshHolding = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/holdings/${id}/refresh-price`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/holdings"] }),
    onError: () => toast({ title: "Kunde inte hämta kurs", variant: "destructive" }),
  });

  const deleteHolding = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/holdings/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/holdings"] }),
  });

  // Build rows
  const rows = augmentedHoldings.map(h => {
    const asset = assetMap.get(h.assetId);
    if (!asset) return null;
    const valueSEK = toSEK(holdingMarketValue(h), asset.currency, fxRates);
    const gainPct = holdingGainLossPct(h, asset.currency, fxRates);
    const gainSEK = holdingGainLossSEK(h, asset.currency, fxRates);
    return { h, asset, valueSEK, gainPct, gainSEK };
  }).filter(Boolean) as { h: Holding; asset: Asset; valueSEK: number; gainPct: number; gainSEK: number }[];

  // Filter
  const filtered = rows.filter(r =>
    !filter || r.asset.name.toLowerCase().includes(filter.toLowerCase()) ||
    (r.asset.ticker || "").toLowerCase().includes(filter.toLowerCase()) ||
    r.h.account.toLowerCase().includes(filter.toLowerCase())
  );

  const grouped = TYPE_GROUPS.map(g => ({
    ...g,
    rows: filtered.filter(r => g.types.includes(r.asset.type)),
  })).filter(g => g.rows.length > 0);

  const loading = loadingA || loadingH;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Innehav</h1>
          <p className="text-sm text-muted-foreground">{holdings.length} innehav · {assets.length} tillgångar</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddAsset(true)} data-testid="btn-add-asset" className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80">
            <Plus size={14} /> Tillgång
          </button>
          <button onClick={() => setShowAddHolding(true)} data-testid="btn-add-holding" className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus size={14} /> Innehav
          </button>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="Sök innehav, ticker, konto…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="max-w-xs"
        data-testid="input-holdings-filter"
      />

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : holdings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-4">💼</div>
          <h3 className="text-lg font-semibold mb-2">Inga innehav ännu</h3>
          <p className="text-muted-foreground text-sm max-w-xs mb-6">Börja med att lägga till en tillgång, sedan ett innehav.</p>
          <button onClick={() => setShowAddAsset(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground">
            <Plus size={14} /> Lägg till tillgång
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(group => (
            <div key={group.label} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <span className="text-xs text-muted-foreground">
                  {formatSEK(group.rows.reduce((s, r) => s + r.valueSEK, 0))} SEK
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Tillgång</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Antal</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Kurs</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Marknadsvärde</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Kostnad</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Vinst/Förlust</th>
                      <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(({ h, asset, valueSEK, gainPct, gainSEK }) => (
                      <tr key={h.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium flex items-center gap-1.5">
                            {asset.name}
                            <span className="px-1.5 py-0.5 rounded border border-border text-[10px] font-semibold uppercase text-muted-foreground bg-muted/20">
                              {asset.currency}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {asset.ticker ? `${asset.ticker} · ` : ""}{h.account}
                            {h.manualPrice && <span className="ml-1 text-dividend">(manuellt pris)</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatNumber(h.quantity)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {h.currentPrice ? `${h.currentPrice.toFixed(2)} ${asset.currency}` : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {h.currentPrice ? formatSEK(valueSEK) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatSEK(toSEK(h.costBasis, h.costBasisCurrency || asset.currency, fxRates))}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${gainPct >= 0 ? "text-gain" : "text-loss"}`}>
                          {h.currentPrice ? formatPct(gainPct) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {h.id > 0 ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => refreshHolding.mutate(h.id)}
                                title="Uppdatera kurs"
                                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                <RefreshCw size={13} className={refreshHolding.isPending ? "animate-spin" : ""} />
                              </button>
                              <button
                                onClick={() => { if (confirm("Ta bort innehav?")) deleteHolding.mutate(h.id); }}
                                title="Ta bort"
                                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                              <button
                                onClick={() => setEditingHolding(h)}
                                title="Redigera"
                                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                <Pencil size={13} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">från utdelning</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddAssetModal open={showAddAsset} onClose={() => setShowAddAsset(false)} />
      <AddHoldingModal open={showAddHolding} onClose={() => setShowAddHolding(false)} assets={assets} />
      <EditHoldingModal holding={editingHolding} assets={assets} onClose={() => setEditingHolding(null)} />
    </div>
  );
}
