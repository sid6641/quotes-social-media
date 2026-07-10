"use client";

import { useEffect, useState, useCallback } from "react";
import { FilterBar, EmptyState, LoadingState } from "@/components/ui";

interface HashtagSet {
  name: string;
  tags: string[];
}

export default function HashtagsTab() {
  const [sets, setSets] = useState<HashtagSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");

  const fetchSets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/hashtags");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setSets(data.sets || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSets(); }, [fetchSets]);

  const handleAdd = async () => {
    const trimmedName = name.trim();
    const cleanTags = tags
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));
    if (!trimmedName || cleanTags.length === 0) return;

    try {
      const res = await fetch("/api/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, tags: cleanTags }),
      });
      if (!res.ok) throw new Error("Failed to save hashtag set");
      await fetchSets();
      setName("");
      setTags("");
    } catch {
      // non-fatal
    }
  };

  const handleDelete = async (setName: string) => {
    try {
      const res = await fetch("/api/hashtags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: setName }),
      });
      if (!res.ok) throw new Error("Failed to delete hashtag set");
      await fetchSets();
    } catch {
      // non-fatal
    }
  };

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-500 mb-6">
        Create reusable hashtag sets you can apply to any post. Tags will be merged
        into the caption alongside the AI-generated ones.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">New Hashtag Set</h3>
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Set name (e.g., motivation, philosophy)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags separated by spaces (e.g., #motivation #inspiration #goals)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleAdd}
            disabled={!name.trim() || !tags.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            Add Set
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading hashtag sets..." />
      ) : sets.length === 0 ? (
        <EmptyState message="No hashtag sets yet. Create your first one above." />
      ) : (
        <div className="space-y-3">
          {sets.map((set) => (
            <div key={set.name} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700">{set.name}</h4>
                <button
                  onClick={() => handleDelete(set.name)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {set.tags.map((tag, ti) => (
                  <span key={ti} className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
