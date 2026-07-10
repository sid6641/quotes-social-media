"use client";

import { Modal } from "@/components/ui";
import { StatusBadge } from "@/components/ui";

interface QueuePreviewModalProps {
  entry: {
    id: string;
    filename: string;
    quote: string;
    caption: { commentary: string; hashtags: string[] };
    scheduledAt: string;
    status: "queued" | "publishing" | "published" | "failed";
    publishedAt?: string;
    error?: string;
  };
  selectedAccount: string;
  onClose: () => void;
  onRemove: (id: string) => void;
}

export function QueuePreviewModal({
  entry,
  selectedAccount,
  onClose,
  onRemove,
}: QueuePreviewModalProps) {
  return (
    <Modal open={true} onClose={onClose} width="max-w-sm">
      <div className="bg-gray-100 p-4">
        <img
          src={`/api/images/${entry.filename}${selectedAccount ? `?account=${selectedAccount}` : ""}`}
          alt="Post preview"
          className="w-full aspect-square rounded-lg object-cover shadow-md"
        />
      </div>
      <div className="p-5">
        <p className="text-sm text-gray-700 font-medium mb-2">
          &ldquo;{entry.quote}&rdquo;
        </p>
        <p className="text-sm text-gray-600 leading-relaxed mb-3">
          {entry.caption.commentary}
        </p>
        <div className="flex flex-wrap gap-1 mb-4">
          {entry.caption.hashtags.map((tag, ti) => (
            <span
              key={ti}
              className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between mb-4">
          <StatusBadge status={entry.status} variant="pill" />
          <span className="text-xs text-gray-400">
            {entry.status === "queued"
              ? `Scheduled: ${new Date(entry.scheduledAt).toLocaleString()}`
              : entry.publishedAt
              ? `Published: ${new Date(entry.publishedAt).toLocaleString()}`
              : ""}
          </span>
        </div>
        {entry.error && (
          <p className="text-xs text-red-400 mb-4">{entry.error}</p>
        )}
        <div className="flex gap-2">
          {entry.status === "queued" && (
            <button
              onClick={() => { onRemove(entry.id); onClose(); }}
              className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
            >
              Remove from Queue
            </button>
          )}
          <button
            onClick={onClose}
            className={`${entry.status === "queued" ? "flex-1" : "w-full"} px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm`}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
