"use client";

import { useEffect, useState, useCallback } from "react";
import { FilterBar } from "@/components/ui";

interface Template {
  filename: string;
  sizeKB: string;
  filePath?: string;
  isFavorite?: boolean;
  source?: "global" | "account";
}

export default function TemplatesTab({ selectedAccount }: { selectedAccount: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "account" | "favorites">("all");
  const [favoriteToggling, setFavoriteToggling] = useState<Set<string>>(new Set());

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const accountParam = selectedAccount ? `?account=${encodeURIComponent(selectedAccount)}` : "";
      const res = await fetch(`/api/templates${accountParam}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setTemplates(data.templates || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleToggleFavorite = async (filename: string, isFavorite: boolean) => {
    if (!selectedAccount) return;
    setFavoriteToggling((prev) => new Set(prev).add(filename));
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isFavorite ? "unfavorite" : "favorite",
          filename,
          account: selectedAccount,
        }),
      });
      if (res.ok) {
        setTemplates((prev) =>
          prev.map((t) => (t.filename === filename ? { ...t, isFavorite: !isFavorite } : t))
        );
      }
    } catch {
      // non-fatal
    } finally {
      setFavoriteToggling((prev) => {
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
    }
  };

  const filtered = templates.filter((t) => {
    if (filter === "all") return t.source === "global" || !selectedAccount;
    if (filter === "account") return t.source === "account" || t.isFavorite;
    if (filter === "favorites") return t.isFavorite;
    return true;
  });

  return (
    <div>
      {selectedAccount && templates.length > 0 && (
        <FilterBar
          options={[
            { key: "all", label: "All" },
            { key: "account", label: "Account", count: templates.filter(t => t.source === "account" || t.isFavorite).length },
            { key: "favorites", label: "Favorites", count: templates.filter(t => t.isFavorite).length },
          ]}
          selected={filter}
          onChange={setFilter}
        />
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-2">No template images found.</p>
          <p className="text-sm text-gray-400">Add .jpg, .png, or .webp files to the templates/ folder.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((t) => (
            <div
              key={t.filename}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group"
            >
              <div className="aspect-square bg-gray-100 relative">
                <img
                  src={`/api/images/${t.filename}${selectedAccount ? `?account=${selectedAccount}` : ""}`}
                  alt={t.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {selectedAccount && (
                  <button
                    onClick={() => handleToggleFavorite(t.filename, !!t.isFavorite)}
                    disabled={favoriteToggling.has(t.filename)}
                    className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm ${
                      t.isFavorite ? "bg-yellow-400 text-white" : "bg-white text-gray-400 hover:bg-yellow-50 hover:text-yellow-500"
                    }`}
                    title={t.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    {t.isFavorite ? "★" : "☆"}
                  </button>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs text-gray-700 truncate font-medium">{t.filename}</p>
                <p className="text-[10px] text-gray-400">{t.sizeKB} KB</p>
                {t.filePath && (
                  <p className="text-[9px] text-gray-300 truncate mt-0.5 font-mono">{t.filePath}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
