import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

import Dashboard from "@/pages/Dashboard";
import Holdings from "@/pages/Holdings";
import Dividends from "@/pages/Dividends";
import Transactions from "@/pages/Transactions";
import Import from "@/pages/Import";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

import {
  LayoutDashboard, Briefcase, Banknote, ArrowLeftRight,
  Settings2, Sun, Moon, RefreshCw, ChevronRight, LogOut, Upload
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import Login from "@/pages/Login";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/holdings", label: "Holdings", icon: Briefcase },
  { href: "/dividends", label: "Dividends", icon: Banknote },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  return (
    <aside className="sidebar-shell flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[hsl(var(--sidebar-border))]">
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="Förmögenhetsöversikt logo">
          <rect x="2" y="2" width="28" height="28" rx="6" fill="hsl(145,63%,42%)" />
          <path d="M8 22 L12 16 L16 19 L20 11 L24 14" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <circle cx="24" cy="14" r="2" fill="white"/>
        </svg>
        <div>
          <div className="font-bold text-sm text-[hsl(var(--sidebar-text))] leading-tight">Portföljtracker</div>
          <div className="text-[10px] text-[hsl(var(--sidebar-text-muted))] leading-tight">Privat · SEK</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5" role="navigation">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = location === href || (href !== "/" && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <a
                data-testid={`nav-${label.toLowerCase()}`}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer
                  ${active
                    ? "bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active))]"
                    : "text-[hsl(var(--sidebar-text-muted))] hover:text-[hsl(var(--sidebar-text))] hover:bg-white/5"
                  }`}
              >
                <Icon size={16} />
                {label}
                {active && <ChevronRight size={12} className="ml-auto opacity-60" />}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[hsl(var(--sidebar-border))] flex flex-col gap-2">
        <div className="text-[10px] text-[hsl(var(--sidebar-text-muted))]">
          Local-first · Data stays on your machine
        </div>
        <button
          onClick={() => {
            fetch("/api/auth/logout", { method: "POST" }).then(() => {
              window.location.reload();
            });
          }}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut size={12} /> Logga ut
        </button>
      </div>
    </aside>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return (
    <button
      data-testid="theme-toggle"
      onClick={() => setDark(d => !d)}
      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin"><RefreshCw /></div></div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="dashboard-layout">
      {/* Sidebar — desktop */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-56">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="main-content flex flex-col min-h-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <button
            className="md:hidden p-1.5 rounded text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex-1" />
          <ThemeToggle />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/holdings" component={Holdings} />
            <Route path="/dividends" component={Dividends} />
            <Route path="/transactions" component={Transactions} />
            <Route path="/import" component={Import} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppShell />
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
