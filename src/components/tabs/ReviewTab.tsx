"use client";

import { useEffect, useState, useCallback } from "react";
import { FilterBar, StatusBadge } from "@/components/ui";
import type { ImageEntry, Manifest, StatusFilter, CaptionData } from "./types";

export default function ReviewTab({
  selectedAccount,
  onPreviewImage,
}: {
  selectedAccount: string;
  onPreviewImage?: (img: ImageEntry) => void;
}) {
  // ── State ──────────────────────────────────────────────────────────
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("unreviewed");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Per-batch pagination: one batch = one page
  const [batches, setBatches] = useState<Array<{ id: string; generatedAt: string; trigger: string; imageCount: number; approvedCount: number }>>([]);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);

  // Track which images are being marked as reviewed (loading state)
  const [reviewingPage, setReviewingPage] = useState(false);

  // Caption editing
  const [editingCaptions, setEditingCaptions] = useState<Record<string, CaptionData>>({});
  const [savingCaption, setSavingCaption] = useState<string | null>(null);

  // ── Fetching ───────────────────────────────────────────────────────
  // On mount: fetch batches list
  useEffect(() => {
    setLoading(true);
    setManifest(null);
    setBatches([]);
    setCurrentBatchIndex(0);
    const accountParam = selectedAccount ? `?all=true&account=${selectedAccount}` : "?all=true";
    fetch(`/api/manifest${accountParam}`)
      .then((r) => r.json())
      .then((data) => {
        let list: Array<{ id: string; generatedAt: string; trigger: string; imageCount: number; approvedCount: number }> = [];
        if (data.success) list = (data.batches || []).reverse();
        setBatches(list);
        if (list.length > 0) {
          const batchId = list[0].id;
          const accParam = selectedAccount ? `&account=${selectedAccount}` : "";
          return fetch(`/api/manifest?batchId=${batchId}${accParam}`).then((r) => r.json());
        }
        return null;
      })
      .then((data) => {
        if (data) setManifest(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedAccount]);

  // Navigate to a specific batch
  const goToBatch = useCallback(async (index: number) => {
    const safeIdx = Math.max(0, Math.min(index, batches.length - 1));
    if (safeIdx === currentBatchIndex && manifest) return;
    setCurrentBatchIndex(safeIdx);
    setLoading(true);
    setSelectedIds(new Set());
    const batchId = batches[safeIdx].id;
    const accountParam = selectedAccount ? `&account=${selectedAccount}` : "";
    try {
      const res = await fetch(`/api/manifest?batchId=${batchId}${accountParam}`);
      const data = await res.json();
      setManifest(data);
    } catch { /* non-fatal */ } finally { setLoading(false); }
  }, [batches, currentBatchIndex, manifest, selectedAccount]);

  // ── Mark current batch as reviewed ─────────────────────────────────
  const handleMarkBatchReviewed = async () => {
    if (!manifest) return;
    const unreviewed = displayImages.filter(
      (img) => img.status === "pending" && !img.reviewed
    );
    if (unreviewed.length === 0) return;

    setReviewingPage(true);
    try {
      const images = unreviewed.map((img) => ({
        batchId: manifest.batch.id,
        imageId: img.id,
      }));
      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          account: selectedAccount || undefined,
        }),
      });
      // Re-fetch the current batch to get updated reviewed status
      const accountParam = selectedAccount ? `&account=${selectedAccount}` : "";
      const res = await fetch(`/api/manifest?batchId=${manifest.batch.id}${accountParam}`);
      const data = await res.json();
      setManifest(data);
    } catch {
      // non-fatal
    } finally {
      setReviewingPage(false);
    }
  };

  // ── Reject all non-approved images in this batch ───────────────────
  const [rejectingRemaining, setRejectingRemaining] = useState(false);

  const handleRejectRemaining = async () => {
    if (!manifest) return;
    const toReject = manifest.images.filter((img) => img.status !== "approved");
    if (toReject.length === 0) return;

    setRejectingRemaining(true);
    try {
      await fetch("/api/batch-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: manifest.batch.id,
          imageIds: toReject.map((img) => img.id),
          status: "rejected",
          account: selectedAccount || undefined,
        }),
      });
      // Re-fetch current batch
      const accountParam = selectedAccount ? `&account=${selectedAccount}` : "";
      const res = await fetch(`/api/manifest?batchId=${manifest.batch.id}${accountParam}`);
      const data = await res.json();
      setManifest(data);
      setSelectedIds(new Set());
    } catch {
      // non-fatal
    } finally {
      setRejectingRemaining(false);
    }
  };

  // ── Actions ────────────────────────────────────────────────────────
  const handleStatusChange = async (batchId: string, imageId: string, status: "approved" | "rejected") => {
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageId, status, account: selectedAccount || undefined }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      // Re-fetch the current batch to sync state with server
      const accountParam = selectedAccount ? `&account=${selectedAccount}` : "";
      const refresh = await fetch(`/api/manifest?batchId=${batchId}${accountParam}`);
      const data = await refresh.json();
      setManifest(data);
    } catch { /* non-fatal */ }
  };

  const handlePickCaptionOption = async (batchId: string, imageId: string, optionIndex: number) => {
    try {
      await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageId, selectedOption: optionIndex, account: selectedAccount || undefined }),
      });
      setManifest((prev) => prev ? {
        ...prev,
        images: prev.images.map((img) => img.id === imageId ? {
          ...img,
          selectedCaptionIndex: optionIndex,
          caption: img.captions?.[optionIndex] ?? img.caption,
        } : img),
      } : prev);
    } catch { /* non-fatal */ }
  };

  const toggleSelect = (imageId: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(imageId) ? next.delete(imageId) : next.add(imageId); return next; });
  };

  const toggleSelectAll = () => {
    const pending = manifest?.images.filter((i) => i.status === "pending") ?? [];
    setSelectedIds(selectedIds.size === pending.length && pending.length > 0 ? new Set() : new Set(pending.map((i) => i.id)));
  };

  const handleBulkStatus = async (status: "approved" | "rejected") => {
    if (selectedIds.size === 0 || !manifest) return;
    try {
      await fetch("/api/batch-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: manifest.batch.id, imageIds: Array.from(selectedIds), status, account: selectedAccount || undefined }),
      });
      // Re-fetch current batch
      const accountParam = selectedAccount ? `&account=${selectedAccount}` : "";
      const res = await fetch(`/api/manifest?batchId=${manifest.batch.id}${accountParam}`);
      const data = await res.json();
      setManifest(data);
      setSelectedIds(new Set());
    } catch { /* non-fatal */ }
  };

  // Caption editing
  const handleCaptionEdit = (imageId: string, field: "commentary" | "hashtags", value: string | string[]) => {
    setEditingCaptions((prev) => {
      const current = prev[imageId] ?? { commentary: "", hashtags: [] };
      return { ...prev, [imageId]: { ...current, [field]: value } };
    });
  };

  const startEditingCaption = (image: ImageEntry) => {
    setEditingCaptions((prev) => ({ ...prev, [image.id]: { commentary: image.caption?.commentary ?? "", hashtags: image.caption?.hashtags ?? [] } }));
  };

  const cancelEditingCaption = (imageId: string) => {
    setEditingCaptions((prev) => { const next = { ...prev }; delete next[imageId]; return next; });
  };

  const handleCaptionSave = async (batchId: string, imageId: string) => {
    const caption = editingCaptions[imageId];
    if (!caption) return;
    try {
      setSavingCaption(imageId);
      await fetch("/api/caption", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, imageId, caption }) });
      setManifest((prev) => prev ? { ...prev, images: prev.images.map((img) => img.id === imageId ? { ...img, caption } : img) } : prev);
      cancelEditingCaption(imageId);
    } catch { /* non-fatal */ } finally { setSavingCaption(null); }
  };

  const copyCaption = async (image: ImageEntry) => {
    const caption = image.caption;
    if (!caption) return;
    const text = `${caption.commentary}\n\n${caption.hashtags.join(" ")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(image.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(image.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // ── Computed ───────────────────────────────────────────────────────
  const displayImages = manifest?.images ?? [];

  const filteredImages = displayImages.filter((img) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "unreviewed") return img.status === "pending" && !img.reviewed;
    return img.status === statusFilter;
  });

  const statusCounts = {
    unreviewed: displayImages.filter((i) => i.status === "pending" && !i.reviewed).length,
    all: displayImages.length,
    pending: displayImages.filter((i) => i.status === "pending").length,
    approved: displayImages.filter((i) => i.status === "approved").length,
    rejected: displayImages.filter((i) => i.status === "rejected").length,
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (loading) return <div className="text-center py-20 text-gray-500">Loading manifest...</div>;
  if (!manifest && batches.length === 0) return <div className="text-center py-20 text-gray-400">No batches generated yet.</div>;
  if (!manifest) return <div className="text-center py-20 text-gray-500">Loading manifest...</div>;

  return (
    <>
      {/* Batch header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="text-sm text-gray-700 font-medium">
            Batch {manifest.batch.id}
          </span>
          <span>&middot; {new Date(manifest.batch.generatedAt).toLocaleString()} &middot; {manifest.batch.trigger}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">{manifest.images.length} image{manifest.images.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Per-batch pagination */}
          {batches.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToBatch(currentBatchIndex - 1)}
                disabled={currentBatchIndex === 0}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-500 px-1">
                {currentBatchIndex + 1} / {batches.length}
              </span>
              <button
                onClick={() => goToBatch(currentBatchIndex + 1)}
                disabled={currentBatchIndex >= batches.length - 1}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
          {/* Reject remaining */}
          {manifest.images.some((img) => img.status !== "approved") && (
            <button
              onClick={handleRejectRemaining}
              disabled={rejectingRemaining}
              className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {rejectingRemaining ? "Rejecting..." : "🗑️ Reject remaining"}
            </button>
          )}
        </div>
      </div>

      {/* Filter + select-all */}
      <div className="flex items-center gap-2 mb-2">
        <FilterBar
          options={[
            { key: "unreviewed", label: "Unreviewed", count: statusCounts.unreviewed },
            { key: "all", label: "All", count: statusCounts.all },
            { key: "pending", label: "Pending", count: statusCounts.pending },
            { key: "approved", label: "Approved", count: statusCounts.approved },
            { key: "rejected", label: "Rejected", count: statusCounts.rejected },
          ]}
          selected={statusFilter}
          onChange={(key) => { setStatusFilter(key as StatusFilter); setSelectedIds(new Set()); }}
        />
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={filteredImages.length > 0 && filteredImages.every((i) => selectedIds.has(i.id))} onChange={toggleSelectAll} className="rounded border-gray-300" />
            Select all
          </label>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-10 mb-4 flex items-center justify-between bg-white border border-blue-200 rounded-xl shadow-lg px-5 py-3">
          <span className="text-sm text-gray-700 font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => handleBulkStatus("approved")} className="px-4 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium">✅ Approve ({selectedIds.size})</button>
            <button onClick={() => handleBulkStatus("rejected")} className="px-4 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium">❌ Reject ({selectedIds.size})</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm">Clear</button>
          </div>
        </div>
      )}

      {/* Mark batch as reviewed */}
      {statusFilter === "unreviewed" && filteredImages.some((img) => img.status === "pending" && !img.reviewed) && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleMarkBatchReviewed}
            disabled={reviewingPage}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {reviewingPage ? "Marking..." : "👁️ Mark batch as reviewed"}
          </button>
        </div>
      )}

      {/* Image grid */}
      {filteredImages.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No {statusFilter === "all" ? "" : statusFilter === "unreviewed" ? "unreviewed" : statusFilter} images to show.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredImages.map((image) => {
            return (
              <div key={image.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${image.status === "approved" ? "border-green-400 ring-2 ring-green-200" : image.status === "rejected" ? "border-red-200 opacity-60" : "border-gray-200"}`}>
                <div className="aspect-square bg-gray-100 relative">
                  <img src={`/api/images/${image.filename}${selectedAccount ? `?account=${selectedAccount}` : ""}`} alt={`Quote: ${image.quote}`} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute top-2 left-2">
                    {image.status !== "pending" && <StatusBadge status={image.status} variant="solid" />}
                  </div>
                  <div className="absolute top-2 right-2">
                    <input type="checkbox" checked={selectedIds.has(image.id)} onChange={() => toggleSelect(image.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600 shadow-sm cursor-pointer" onClick={(e) => e.stopPropagation()} />
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm text-gray-700 line-clamp-2 mb-1">&ldquo;{image.quote}&rdquo;</p>
                  <p className="text-xs text-gray-400 mb-2">Template: {image.template}</p>

                  {/* Caption options */}
                  {image.captions && image.captions.length > 0 && (
                    <div className="mb-3 border-t border-gray-100 pt-2">
                      <p className="text-xs font-medium text-gray-500 mb-1.5">Choose caption style:</p>
                      <div className="space-y-1">
                        {image.captions.map((opt, oi) => {
                          const isSelected = image.selectedCaptionIndex === oi;
                          const isEditing = editingCaptions[image.id] !== undefined && image.selectedCaptionIndex === oi;
                          return (
                            <div key={oi}>
                              <button onClick={() => handlePickCaptionOption(manifest.batch.id, image.id, oi)}
                                className={`w-full text-left p-2 rounded-lg border transition-all ${isSelected ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200" : "border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100"}`}>
                                <div className="flex items-start gap-2">
                                  <span className={`text-xs font-bold mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-500"}`}>{oi + 1}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs leading-relaxed ${isSelected ? "text-blue-800" : "text-gray-600"}`}>{opt.commentary}</p>
                                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                                      {opt.hashtags.slice(0, 4).map((tag, ti) => <span key={ti} className={`text-[10px] ${isSelected ? "text-blue-500" : "text-gray-400"}`}>{tag}</span>)}
                                      {opt.hashtags.length > 4 && <span className="text-[10px] text-gray-400">+{opt.hashtags.length - 4}</span>}
                                    </div>
                                  </div>
                                </div>
                              </button>
                              {isEditing && (
                                <div className="ml-6 mt-1 p-2 bg-white border border-blue-200 rounded-lg">
                                  <textarea value={editingCaptions[image.id].commentary} onChange={(e) => handleCaptionEdit(image.id, "commentary", e.target.value)} rows={2} className="w-full text-xs text-gray-600 border border-gray-200 rounded-md p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                  <input value={editingCaptions[image.id].hashtags.join(" ")} onChange={(e) => { const tags = e.target.value.split(/\s+/).filter((t) => t.length > 0).map((t) => t.startsWith("#") ? t : `#${t}`); handleCaptionEdit(image.id, "hashtags", tags); }} className="w-full text-xs text-gray-500 border border-gray-200 rounded-md p-1.5 mt-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                  <div className="flex gap-1.5 mt-1">
                                    <button onClick={() => handleCaptionSave(manifest.batch.id, image.id)} disabled={savingCaption === image.id} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors text-[10px] font-medium">{savingCaption === image.id ? "Saving..." : "Save Edit"}</button>
                                    <button onClick={() => cancelEditingCaption(image.id)} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors text-[10px]">Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {image.selectedCaptionIndex !== undefined && image.selectedCaptionIndex >= 0 && !editingCaptions[image.id] && (
                        <button onClick={() => startEditingCaption(image)} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors mt-1">✏️ Custom edit selected option</button>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  {image.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => handleStatusChange(manifest.batch.id, image.id, "approved")} className="flex-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors text-xs font-medium">Approve</button>
                      <button onClick={() => handleStatusChange(manifest.batch.id, image.id, "rejected")} className="flex-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-xs font-medium">Reject</button>
                    </div>
                  )}
                  {image.status === "approved" && (
                    <button onClick={() => handleStatusChange(manifest.batch.id, image.id, "rejected")} className="w-full px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium">Move to Rejected</button>
                  )}
                  {image.status === "rejected" && (
                    <button onClick={() => handleStatusChange(manifest.batch.id, image.id, "approved")} className="w-full px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium">Move to Approved</button>
                  )}

                  {image.caption && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => onPreviewImage?.(image)} className="flex-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 transition-colors text-xs font-medium">👁️ Preview</button>
                      <button onClick={() => copyCaption(image)} className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium">{copiedId === image.id ? "✅ Copied!" : "📋 Copy Caption"}</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
