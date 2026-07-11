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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allImages, setAllImages] = useState<Array<{ batchId: string; image: ImageEntry }> | null>(null);
  const [batchScope, setBatchScope] = useState<string>("__all__");
  const [allBatches, setAllBatches] = useState<Array<{ id: string; generatedAt: string; trigger: string; imageCount: number; approvedCount: number }>>([]);
  const [batchSelectorOpen, setBatchSelectorOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Caption editing
  const [editingCaptions, setEditingCaptions] = useState<Record<string, CaptionData>>({});
  const [savingCaption, setSavingCaption] = useState<string | null>(null);

  // ── Fetching ───────────────────────────────────────────────────────
  const fetchLatestBatch = useCallback(async () => {
    try {
      setLoading(true);
      const accountParam = selectedAccount ? `?account=${selectedAccount}` : "";
      const res = await fetch(`/api/manifest${accountParam}`);
      if (!res.ok) {
        if (res.status === 404) { setManifest(null); setLoading(false); return; }
        throw new Error(`Failed to fetch manifest: ${res.statusText}`);
      }
      const data = await res.json();
      setManifest(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  const fetchAllImages = useCallback(async () => {
    try {
      const accountParam = selectedAccount ? `?allImages=true&account=${selectedAccount}` : "?allImages=true";
      const res = await fetch(`/api/manifest${accountParam}`);
      const data = await res.json();
      setAllImages(data.images || []);
    } catch { setAllImages([]); }
  }, [selectedAccount]);

  const fetchAllBatchesList = useCallback(async () => {
    try {
      const accountParam = selectedAccount ? `?all=true&account=${selectedAccount}` : "?all=true";
      const res = await fetch(`/api/manifest${accountParam}`);
      const data = await res.json();
      if (data.success) setAllBatches(data.batches || []);
    } catch { /* non-fatal */ }
  }, [selectedAccount]);

  useEffect(() => {
    fetchLatestBatch();
    fetchAllImages();
    fetchAllBatchesList();
  }, [fetchLatestBatch, fetchAllImages, fetchAllBatchesList]);

  // ── Actions ────────────────────────────────────────────────────────
  const handleStatusChange = async (batchId: string, imageId: string, status: "approved" | "rejected") => {
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageId, status, account: selectedAccount || undefined }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      setManifest((prev) => prev ? { ...prev, images: prev.images.map((img) => img.id === imageId ? { ...img, status } : img) } : prev);
      setAllImages((prev) => prev ? prev.map((e) => e.batchId === batchId && e.image.id === imageId ? { ...e, image: { ...e.image, status } } : e) : prev);
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
      setAllImages((prev) => prev ? prev.map((e) => {
        if (e.batchId !== batchId || e.image.id !== imageId) return e;
        const caption = e.image.captions?.[optionIndex] ?? e.image.caption;
        return { ...e, image: { ...e.image, selectedCaptionIndex: optionIndex, caption } };
      }) : prev);
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
    if (selectedIds.size === 0) return;
    const firstSelected = displayEntries.find((e) => selectedIds.has(e.id));
    const batchId = firstSelected ? ((firstSelected as any).batchId || manifest?.batch?.id) : manifest?.batch?.id;
    if (!batchId) return;
    try {
      await fetch("/api/batch-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageIds: Array.from(selectedIds), status, account: selectedAccount || undefined }),
      });
      await Promise.all([fetchLatestBatch(), fetchAllImages(), fetchAllBatchesList()]);
      setSelectedIds(new Set());
    } catch { /* non-fatal */ }
  };

  const switchBatch = async (batchId: string) => {
    if (batchId === "__all__") { setBatchScope("__all__"); setBatchSelectorOpen(false); return; }
    try {
      setLoading(true);
      const accountParam = selectedAccount ? `&account=${selectedAccount}` : "";
      const res = await fetch(`/api/manifest?batchId=${batchId}${accountParam}`);
      const data = await res.json();
      setManifest(data);
      setBatchScope(batchId);
      setBatchSelectorOpen(false);
    } catch { /* non-fatal */ } finally { setLoading(false); }
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
  const isCrossBatch = batchScope === "__all__";
  const displayEntries: (ImageEntry & { batchId?: string })[] = isCrossBatch
    ? (allImages ?? []).map((entry) => ({ ...entry.image, batchId: entry.batchId }))
    : (manifest?.images ?? []);

  const filteredImages = displayEntries.filter((img) => statusFilter === "all" || img.status === statusFilter);

  const statusCounts = {
    all: displayEntries.length,
    pending: displayEntries.filter((i) => i.status === "pending").length,
    approved: displayEntries.filter((i) => i.status === "approved").length,
    rejected: displayEntries.filter((i) => i.status === "rejected").length,
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (loading) return <div className="text-center py-20 text-gray-500">Loading manifest...</div>;
  if (!manifest && !allImages) return <div className="text-center py-20 text-gray-400">No batches generated yet.</div>;

  return (
    <>
      {/* Batch selector info */}
      <div className="flex items-center gap-3 text-sm text-gray-500 mb-4 relative">
        {manifest && (
          <span className="cursor-pointer hover:text-gray-700 transition-colors" onClick={() => { fetchAllBatchesList(); setBatchSelectorOpen(!batchSelectorOpen); }}>
            {isCrossBatch ? `📦 All iterations (${displayEntries.length} images) ▾` : `📦 Batch: ${batchScope} ▾`}
          </span>
        )}
        {!isCrossBatch && manifest && (
          <span>&middot; Generated {new Date(manifest.batch.generatedAt).toLocaleString()} &middot; Trigger: {manifest.batch.trigger}</span>
        )}
        {batchSelectorOpen && allBatches.length > 0 && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[280px] max-h-60 overflow-y-auto">
            <button onClick={() => switchBatch("__all__")} className={`w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 border-b ${isCrossBatch ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600"}`}>
              <span className="font-medium">All iterations</span>
              <span className="text-gray-400 ml-2">{allImages?.length ?? 0} image{(allImages?.length ?? 0) !== 1 ? "s" : ""}</span>
            </button>
            {allBatches.map((b) => (
              <button key={b.id} onClick={() => switchBatch(b.id)} className={`w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 border-b last:border-0 ${b.id === batchScope ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600"}`}>
                <span className="font-medium">{b.id}</span>
                <span className="text-gray-400 ml-2">{b.imageCount} image{b.imageCount !== 1 ? "s" : ""}{b.approvedCount > 0 && ` · ${b.approvedCount} approved`}</span>
                <br /><span className="text-gray-400">{new Date(b.generatedAt).toLocaleString()} · {b.trigger}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter + select-all */}
      <div className="flex items-center gap-2 mb-6">
        <FilterBar
          options={[
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

      {/* Cross-batch info */}
      {isCrossBatch && allImages && allImages.length > 0 && (
        <div className="text-xs text-gray-400 mb-3 px-1">Showing {filteredImages.length} of {displayEntries.length} images across {allBatches.length} iteration(s)</div>
      )}

      {/* Image grid */}
      {filteredImages.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No {statusFilter === "all" ? "" : statusFilter} images to show.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredImages.map((image) => {
            const imgBatchId = (image as any).batchId;
            return (
              <div key={imgBatchId ? `${imgBatchId}-${image.id}` : image.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${image.status === "approved" ? "border-green-400 ring-2 ring-green-200" : image.status === "rejected" ? "border-red-200 opacity-60" : "border-gray-200"}`}>
                <div className="aspect-square bg-gray-100 relative">
                  <img src={`/api/images/${image.filename}${selectedAccount ? `?account=${selectedAccount}` : ""}`} alt={`Quote: ${image.quote}`} className="w-full h-full object-cover" loading="lazy" />
                  {isCrossBatch && imgBatchId && <div className="absolute top-2 left-2 bg-gray-900/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">{imgBatchId}</div>}
                  <div className={`absolute top-2 left-2 ${imgBatchId ? "top-6" : ""}`}>
                    {image.status !== "pending" && <StatusBadge status={image.status} variant="solid" />}
                  </div>
                  <div className="absolute top-2 right-2">
                    <input type="checkbox" checked={selectedIds.has(image.id)} onChange={() => toggleSelect(image.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600 shadow-sm cursor-pointer" onClick={(e) => e.stopPropagation()} />
                  </div>
                </div>
                <div className="p-3">
                  {isCrossBatch && imgBatchId && <p className="text-[10px] text-gray-400 font-mono mb-1">{imgBatchId}</p>}
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
                              <button onClick={() => handlePickCaptionOption(imgBatchId || manifest?.batch?.id || "", image.id, oi)}
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
                                    <button onClick={() => handleCaptionSave(imgBatchId || manifest?.batch?.id || "", image.id)} disabled={savingCaption === image.id} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors text-[10px] font-medium">{savingCaption === image.id ? "Saving..." : "Save Edit"}</button>
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
                      <button onClick={() => handleStatusChange(imgBatchId || manifest?.batch?.id || "", image.id, "approved")} className="flex-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors text-xs font-medium">Approve</button>
                      <button onClick={() => handleStatusChange(imgBatchId || manifest?.batch?.id || "", image.id, "rejected")} className="flex-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-xs font-medium">Reject</button>
                    </div>
                  )}
                  {image.status === "approved" && (
                    <button onClick={() => handleStatusChange(imgBatchId || manifest?.batch?.id || "", image.id, "rejected")} className="w-full px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium">Move to Rejected</button>
                  )}
                  {image.status === "rejected" && (
                    <button onClick={() => handleStatusChange(imgBatchId || manifest?.batch?.id || "", image.id, "approved")} className="w-full px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium">Move to Approved</button>
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
