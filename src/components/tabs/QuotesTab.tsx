"use client";

import { useEffect, useState, useCallback } from "react";
import { FilterBar } from "@/components/ui";

interface Quote {
  id: string;
  text: string;
  status: string;
  usageCount: number;
  isFavorite?: boolean;
}

interface PoolStats {
  total: number;
  available: number;
  cooldown: number;
  retired: number;
}

export default function QuotesTab({ selectedAccount }: { selectedAccount: string }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [newText, setNewText] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "account" | "favorites">("all");
  const [search, setSearch] = useState("");
  const [favoriteToggling, setFavoriteToggling] = useState<Set<string>>(new Set());

  const fetchQuotes = useCallback(async () => {
    try {
      setLoading(true);
      const accountParam = selectedAccount ? `account=${encodeURIComponent(selectedAccount)}` : "";
      const status = scopeFilter !== "all" ? scopeFilter : undefined;
      const params = [status ? `status=${status}` : "", accountParam].filter(Boolean).join("&");
      const url = params ? `/api/quotes?${params}` : "/api/quotes";
      const statsUrl = accountParam ? `/api/quotes?stats=true&${accountParam}` : "/api/quotes?stats=true";
      const [quotesRes, statsRes] = await Promise.all([fetch(url), fetch(statsUrl)]);
      const quotesData = await quotesRes.json();
      const statsData = await statsRes.json();
      if (quotesData.success) setQuotes(quotesData.quotes || []);
      if (statsData.success) setStats(statsData.stats || null);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [scopeFilter, selectedAccount]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text || !selectedAccount) return;
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author: newAuthor.trim() || undefined, account: selectedAccount }),
      });
      if (!res.ok) throw new Error("Failed to add quote");
      setNewText("");
      setNewAuthor("");
      await fetchQuotes();
    } catch {
      // non-fatal
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/quotes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, account: selectedAccount || undefined }),
      });
      if (!res.ok) throw new Error("Failed to delete quote");
      await fetchQuotes();
    } catch {
      // non-fatal
    }
  };

  const handleToggleFavorite = async (quoteId: string, isFavorite: boolean) => {
    if (!selectedAccount) return;
    setFavoriteToggling((prev) => new Set(prev).add(quoteId));
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isFavorite ? "unfavorite" : "favorite",
          quoteId,
          account: selectedAccount,
        }),
      });
      if (res.ok) {
        setQuotes((prev) =>
          prev.map((q) => (q.id === quoteId ? { ...q, isFavorite: !isFavorite } : q))
        );
      }
    } catch {
      // non-fatal
    } finally {
      setFavoriteToggling((prev) => {
        const next = new Set(prev);
        next.delete(quoteId);
        return next;
      });
    }
  };

  const activeQuotes = quotes
    .filter((q) => scopeFilter !== "favorites" || q.isFavorite)
    .filter((q) => !search || q.text.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {stats && (
        <div className="flex gap-4 mb-6 text-sm">
          <span className="text-gray-500">Total: <strong>{stats.total}</strong></span>
          <span className="text-green-600">Available: <strong>{stats.available}</strong></span>
          <span className="text-yellow-600">Cooldown: <strong>{stats.cooldown}</strong></span>
          <span className="text-gray-400">Retired: <strong>{stats.retired}</strong></span>
        </div>
      )}

      {selectedAccount && quotes.length > 0 && (
        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotes..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Add Quote</h3>
        <div className="flex gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Enter quote text..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <input
            value={newAuthor}
            onChange={(e) => setNewAuthor(e.target.value)}
            placeholder="Author (optional)"
            className="w-40 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleAdd}
            disabled={!newText.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            Add
          </button>
        </div>
      </div>

      {selectedAccount && (
        <FilterBar
          options={[
            { key: "all", label: "All" },
            { key: "account", label: "Account" },
            { key: "favorites", label: "Favorites", count: quotes.filter(q => q.isFavorite).length },
          ]}
          selected={scopeFilter}
          onChange={setScopeFilter}
        />
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading quotes...</div>
      ) : !selectedAccount ? (
        <div className="text-center py-10 text-gray-400">
          Select an account from the dropdown above to view its quote pool.
        </div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          No quotes found for this account. Add one above or import from a text file via CLI.
        </div>
      ) : (
        <div className="space-y-2">
          {activeQuotes.map((q) => (
            <div key={q.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
              <span
                className={`inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  q.status === "available" ? "bg-green-400" : q.status === "cooldown" ? "bg-yellow-400" : "bg-gray-300"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">&ldquo;{q.text}&rdquo;</p>
                <span className="text-xs text-gray-400">Used {q.usageCount}x</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleToggleFavorite(q.id, !!q.isFavorite)}
                  disabled={favoriteToggling.has(q.id)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-colors ${
                    q.isFavorite ? "text-yellow-500 hover:text-yellow-600" : "text-gray-300 hover:text-yellow-400"
                  }`}
                >
                  {q.isFavorite ? "★" : "☆"}
                </button>
                <button onClick={() => handleDelete(q.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-0.5">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
