"use client";

import { useEffect, useState, useCallback } from "react";
import type { QueueEntry } from "./types";

export default function QueueTab({
  selectedAccount,
  onPreviewQueue,
}: {
  selectedAccount: string;
  onPreviewQueue?: (entry: QueueEntry) => void;
}) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const accountParam = selectedAccount ? `?account=${selectedAccount}` : "";
      const res = await fetch(`/api/queue${accountParam}`);
      if (!res.ok) throw new Error("Failed to fetch queue");
      const data = await res.json();
      setQueue(data.queue || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleRemove = async (id: string) => {
    try {
      const res = await fetch("/api/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to remove from queue");
      setQueue((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // non-fatal
    }
  };

  const handlePublishNow = async () => {
    try {
      setPublishing(true);
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process" }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Publish failed");
      await fetchQueue();
    } catch {
      // non-fatal
    } finally {
      setPublishing(false);
    }
  };

  const queued = queue.filter((e) => e.status === "queued").length;
  const published = queue.filter((e) => e.status === "published").length;
  const failed = queue.filter((e) => e.status === "failed").length;

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading queue...</div>;
  }

  if (queue.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 mb-2">
          {selectedAccount
            ? "No items in the publish queue. Approve images from the Review tab to add them."
            : "Select an account from the dropdown above to see its publish queue."}
        </p>
        {!selectedAccount && (
          <p className="text-xs text-gray-400">
            Each account has its own queue. Choose one to review queued posts.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-500">
          {queued} queued &middot; {published} published &middot; {failed} failed
        </div>
        <button
          onClick={handlePublishNow}
          disabled={publishing || queued === 0}
          className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {publishing ? "Publishing..." : "Publish Due Items Now"}
        </button>
      </div>

      <div className="space-y-3">
        {queue.map((entry) => (
          <div
            key={entry.id}
            onClick={() => onPreviewQueue?.(entry)}
            className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all cursor-pointer hover:shadow-md ${
              entry.status === "published" ? "border-green-200 opacity-70"
              : entry.status === "failed" ? "border-red-200"
              : "border-gray-200"
            }`}
          >
            <div className="p-4 flex items-start gap-4">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                <img
                  src={`/api/images/${entry.filename}${selectedAccount ? `?account=${selectedAccount}` : ""}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 line-clamp-1 font-medium">
                  &ldquo;{entry.quote}&rdquo;
                </p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{entry.caption.commentary}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {entry.caption.hashtags.slice(0, 5).map((tag, ti) => (
                    <span key={ti} className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                  {entry.caption.hashtags.length > 5 && (
                    <span className="text-xs text-gray-400">+{entry.caption.hashtags.length - 5}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <span
                    className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                      entry.status === "queued" ? "bg-yellow-100 text-yellow-700"
                      : entry.status === "published" ? "bg-green-100 text-green-700"
                      : entry.status === "failed" ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {entry.status === "queued" ? "Queued"
                      : entry.status === "published" ? "Published"
                      : entry.status === "failed" ? "Failed"
                      : entry.status}
                  </span>
                  {entry.status === "queued" && (
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(entry.scheduledAt).toLocaleString()}</p>
                  )}
                  {entry.publishedAt && (
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(entry.publishedAt).toLocaleString()}</p>
                  )}
                  {entry.error && (
                    <p className="text-xs text-red-400 mt-0.5 max-w-[200px] truncate" title={entry.error}>{entry.error}</p>
                  )}
                </div>
                {entry.status === "queued" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(entry.id); }}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove from queue"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
