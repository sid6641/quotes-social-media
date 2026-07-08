"use client";

import { useEffect, useState, useCallback } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface CaptionData {
  commentary: string;
  hashtags: string[];
}

interface ImageEntry {
  id: string;
  filename: string;
  quote: string;
  template: string;
  promptTemplate: string;
  status: "pending" | "approved" | "rejected";
  /** All 5 generated caption options */
  captions?: CaptionData[];
  /** The currently active/selected caption */
  caption?: CaptionData;
  /** Index into captions[] that is selected, or -1 if custom-edited */
  selectedCaptionIndex?: number;
}

interface BatchInfo {
  id: string;
  generatedAt: string;
  trigger: "cli" | "web";
}

interface Manifest {
  batch: BatchInfo;
  images: ImageEntry[];
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";
type ViewMode = "review" | "queue" | "templates" | "hashtags";

interface QueueEntry {
  id: string;
  batchId: string;
  imageId: string;
  filename: string;
  quote: string;
  template: string;
  caption: { commentary: string; hashtags: string[] };
  scheduledAt: string;
  status: "queued" | "publishing" | "published" | "failed";
  publishedAt?: string;
  error?: string;
}

export default function ReviewPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("review");
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch history
  const [allBatches, setAllBatches] = useState<
    Array<{ id: string; generatedAt: string; trigger: string; imageCount: number; approvedCount: number }>
  >([]);
  const [batchSelectorOpen, setBatchSelectorOpen] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<Array<{ filename: string; sizeKB: string }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Hashtag bank
  const [hashtagSets, setHashtagSets] = useState<Array<{ name: string; tags: string[] }>>([]);
  const [hashtagSetsLoading, setHashtagSetsLoading] = useState(false);
  const [newHashtagSetName, setNewHashtagSetName] = useState("");
  const [newHashtagSetTags, setNewHashtagSetTags] = useState("");

  // Preview modal
  const [previewImage, setPreviewImage] = useState<ImageEntry | null>(null);

  const fetchLatestBatch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/manifest");
      if (!res.ok) {
        if (res.status === 404) {
          setManifest(null);
          return;
        }
        throw new Error(`Failed to fetch manifest: ${res.statusText}`);
      }
      const data = await res.json();
      setManifest(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manifest");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatestBatch();
  }, [fetchLatestBatch]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);
      const res = await fetch("/api/generate", { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Generation failed");
      }
      await fetchLatestBatch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleStatusChange = async (
    batchId: string,
    imageId: string,
    status: "approved" | "rejected"
  ) => {
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageId, status }),
      });
      if (!res.ok) throw new Error("Failed to update status");

      setManifest((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          images: prev.images.map((img) =>
            img.id === imageId ? { ...img, status } : img
          ),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // Queue fetching
  const fetchQueue = useCallback(async () => {
    try {
      setQueueLoading(true);
      const res = await fetch("/api/queue");
      if (!res.ok) throw new Error("Failed to fetch queue");
      const data = await res.json();
      setQueue(data.queue || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const handleRemoveFromQueue = async (id: string) => {
    try {
      const res = await fetch("/api/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to remove from queue");
      setQueue((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove from queue"
      );
    }
  };

  const handlePickCaptionOption = async (
    batchId: string,
    imageId: string,
    optionIndex: number
  ) => {
    try {
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageId, selectedOption: optionIndex }),
      });
      if (!res.ok) throw new Error("Failed to pick caption");

      setManifest((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          images: prev.images.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  selectedCaptionIndex: optionIndex,
                  caption: img.captions?.[optionIndex] ?? img.caption,
                }
              : img
          ),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pick caption");
    }
  };

  const handlePublishNow = async () => {
    try {
      setPublishing(true);
      setError(null);
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process" }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Publish failed");

      await fetchQueue();
      setPublishResult(
        `📤 Published ${data.results?.filter((r: any) => r.status === "published").length || 0} item(s)`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  // Batch history
  const fetchAllBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/manifest?all=true");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setAllBatches(data.batches || []);
    } catch {
      // non-fatal
    }
  }, []);

  const switchBatch = async (batchId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/manifest?batchId=${batchId}`);
      if (!res.ok) throw new Error("Failed to load batch");
      const data = await res.json();
      setManifest(data);
      setBatchSelectorOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load batch");
    } finally {
      setLoading(false);
    }
  };

  // Batch selection
  const toggleSelect = (imageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pending = manifest?.images.filter((i) => i.status === "pending") ?? [];
    if (selectedIds.size === pending.length && pending.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pending.map((i) => i.id)));
    }
  };

  const handleBulkStatus = async (status: "approved" | "rejected") => {
    if (!manifest || selectedIds.size === 0) return;
    try {
      const res = await fetch("/api/batch-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: manifest.batch.id,
          imageIds: Array.from(selectedIds),
          status,
        }),
      });
      if (!res.ok) throw new Error("Batch status update failed");
      await fetchLatestBatch();
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch update failed");
    }
  };

  // Hashtag bank
  const fetchHashtagSets = useCallback(async () => {
    try {
      setHashtagSetsLoading(true);
      const res = await fetch("/api/hashtags");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setHashtagSets(data.sets || []);
    } catch {
      // non-fatal
    } finally {
      setHashtagSetsLoading(false);
    }
  }, []);

  const handleAddHashtagSet = async () => {
    const name = newHashtagSetName.trim();
    const tags = newHashtagSetTags
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));
    if (!name || tags.length === 0) return;

    try {
      const res = await fetch("/api/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tags }),
      });
      if (!res.ok) throw new Error("Failed to save hashtag set");
      await fetchHashtagSets();
      setNewHashtagSetName("");
      setNewHashtagSetTags("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save hashtag set");
    }
  };

  const handleDeleteHashtagSet = async (name: string) => {
    try {
      const res = await fetch("/api/hashtags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to delete hashtag set");
      await fetchHashtagSets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete hashtag set");
    }
  };

  // Templates
  const fetchTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const res = await fetch("/api/templates");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setTemplates(data.templates || []);
    } catch {
      // non-fatal
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // Copy caption to clipboard
  const copyCaption = async (image: ImageEntry) => {
    const caption = image.caption;
    if (!caption) return;
    const text = `${caption.commentary}\n\n${caption.hashtags.join(" ")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(image.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback for insecure contexts
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

  // Switch view and fetch data
  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    setSelectedIds(new Set());
    if (mode === "queue") fetchQueue();
    if (mode === "templates") fetchTemplates();
    if (mode === "hashtags") fetchHashtagSets();
  };

  const handlePublishToInstagram = async () => {
    if (!manifest) return;

    const approved = manifest.images.filter(
      (img) => img.status === "approved"
    );
    if (approved.length === 0) {
      setError("No approved images to publish");
      return;
    }

    try {
      setPublishing(true);
      setPublishResult(null);
      setError(null);

      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageIds: approved.map((img) => img.id),
          caption: "Daily quote inspiration ✨ #quotes",
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Publishing failed");
      }

      setPublishResult(
        `✅ Published ${data.published} image${data.published !== 1 ? "s" : ""} to Instagram` +
          (data.failed > 0
            ? ` (${data.failed} failed)`
            : "")
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to publish to Instagram"
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleDownloadApproved = async () => {
    if (!manifest) return;

    const approved = manifest.images.filter(
      (img) => img.status === "approved"
    );
    if (approved.length === 0) {
      setError("No approved images to download");
      return;
    }

    try {
      const zip = new JSZip();

      await Promise.all(
        approved.map(async (img) => {
          const res = await fetch(`/api/images/${img.filename}`);
          if (!res.ok) throw new Error(`Failed to fetch ${img.filename}`);
          const blob = await res.blob();
          zip.file(img.filename, blob);
        })
      );

      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `approved-${manifest.batch.id}.zip`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create download"
      );
    }
  };

  // Caption editing state: { imageId: { commentary, hashtags } }
  const [editingCaptions, setEditingCaptions] = useState<
    Record<string, CaptionData>
  >({});
  const [savingCaption, setSavingCaption] = useState<string | null>(null);

  const handleCaptionEdit = (
    imageId: string,
    field: "commentary" | "hashtags",
    value: string | string[]
  ) => {
    setEditingCaptions((prev) => {
      const current = prev[imageId] ?? { commentary: "", hashtags: [] };
      return {
        ...prev,
        [imageId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const startEditingCaption = (image: ImageEntry) => {
    setEditingCaptions((prev) => ({
      ...prev,
      [image.id]: {
        commentary: image.caption?.commentary ?? "",
        hashtags: image.caption?.hashtags ?? [],
      },
    }));
  };

  const cancelEditingCaption = (imageId: string) => {
    setEditingCaptions((prev) => {
      const next = { ...prev };
      delete next[imageId];
      return next;
    });
  };

  const handleCaptionSave = async (
    batchId: string,
    imageId: string
  ) => {
    const caption = editingCaptions[imageId];
    if (!caption) return;

    try {
      setSavingCaption(imageId);
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageId, caption }),
      });
      if (!res.ok) throw new Error("Failed to save caption");

      setManifest((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          images: prev.images.map((img) =>
            img.id === imageId ? { ...img, caption } : img
          ),
        };
      });
      cancelEditingCaption(imageId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save caption"
      );
    } finally {
      setSavingCaption(null);
    }
  };

  const filteredImages =
    manifest?.images.filter(
      (img) => statusFilter === "all" || img.status === statusFilter
    ) ?? [];

  const statusCounts = {
    all: manifest?.images.length ?? 0,
    pending:
      manifest?.images.filter((i) => i.status === "pending").length ?? 0,
    approved:
      manifest?.images.filter((i) => i.status === "approved").length ?? 0,
    rejected:
      manifest?.images.filter((i) => i.status === "rejected").length ?? 0,
  };

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Quote Image Review
          </h1>
          {manifest && (
            <div className="text-sm text-gray-500 mt-1 relative">
              {/* Batch selector */}
              <span
                className="cursor-pointer hover:text-gray-700 transition-colors"
                onClick={() => {
                  fetchAllBatches();
                  setBatchSelectorOpen(!batchSelectorOpen);
                }}
              >
                📦 Batch: {manifest.batch.id} ▾
              </span>
              &middot; Generated{" "}
              {new Date(manifest.batch.generatedAt).toLocaleString()}
              &middot; Trigger: {manifest.batch.trigger}

              {batchSelectorOpen && allBatches.length > 0 && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[280px] max-h-60 overflow-y-auto">
                  {allBatches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => switchBatch(b.id)}
                      className={`w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${
                        b.id === manifest.batch.id
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-600"
                      }`}
                    >
                      <span className="font-medium">{b.id}</span>
                      <span className="text-gray-400 ml-2">
                        {b.imageCount} image{b.imageCount !== 1 ? "s" : ""}
                        {b.approvedCount > 0 && ` · ${b.approvedCount} approved`}
                      </span>
                      <br />
                      <span className="text-gray-400">
                        {new Date(b.generatedAt).toLocaleString()} · {b.trigger}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDownloadApproved}
            disabled={statusCounts.approved === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            Download Approved ({statusCounts.approved})
          </button>
          <button
            onClick={handlePublishToInstagram}
            disabled={statusCounts.approved === 0 || publishing}
            className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {publishing
              ? "Publishing..."
              : `Publish to Instagram (${statusCounts.approved})`}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {generating ? "Generating..." : "Generate New Batch"}
          </button>
        </div>
      </div>

      {/* Publish result banner */}
      {publishResult && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {publishResult}
          <button
            onClick={() => setPublishResult(null)}
            className="ml-3 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-20 text-gray-500">
          Loading manifest...
        </div>
      )}

      {/* Empty state */}
      {!loading && !manifest && !error && (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">
            No batches generated yet. Start by generating your first batch of
            quote images.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
          >
            {generating ? "Generating..." : "Generate Your First Batch"}
          </button>
        </div>
      )}

      {/* View mode tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => switchView("review")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === "review"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Review
        </button>
        <button
          onClick={() => switchView("queue")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === "queue"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Queue
        </button>
        <button
          onClick={() => switchView("templates")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === "templates"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => switchView("hashtags")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === "hashtags"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Hashtag Bank
        </button>
      </div>

      {/* Filter tabs + select-all (review mode only) */}
      {manifest && viewMode === "review" && (
        <div className="flex items-center gap-2 mb-6">
          {(
            [
              { key: "all", label: "All" },
              { key: "pending", label: "Pending" },
              { key: "approved", label: "Approved" },
              { key: "rejected", label: "Rejected" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setStatusFilter(key);
                setSelectedIds(new Set());
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {label} ({statusCounts[key]})
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={
                  filteredImages.length > 0 &&
                  filteredImages.every((i) => selectedIds.has(i.id))
                }
                onChange={toggleSelectAll}
                className="rounded border-gray-300"
              />
              Select all
            </label>
          </div>
        </div>
      )}

      {/* Floating batch action bar */}
      {manifest && viewMode === "review" && selectedIds.size > 0 && (
        <div className="sticky top-4 z-10 mb-4 flex items-center justify-between bg-white border border-blue-200 rounded-xl shadow-lg px-5 py-3">
          <span className="text-sm text-gray-700 font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkStatus("approved")}
              className="px-4 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
            >
              ✅ Approve ({selectedIds.size})
            </button>
            <button
              onClick={() => handleBulkStatus("rejected")}
              className="px-4 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
            >
              ❌ Reject ({selectedIds.size})
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Review mode — image grid */}
      {viewMode === "review" && manifest && (
        <>
          {filteredImages.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              No {statusFilter === "all" ? "" : statusFilter} images to show.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredImages.map((image) => (
                <div
                  key={image.id}
                  className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                    image.status === "approved"
                      ? "border-green-400 ring-2 ring-green-200"
                      : image.status === "rejected"
                      ? "border-red-200 opacity-60"
                      : "border-gray-200"
                  }`}
                >
                  {/* Image */}
                  <div className="aspect-square bg-gray-100 relative">
                    <img
                      src={`/api/images/${image.filename}`}
                      alt={`Quote: ${image.quote}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Status badge */}
                    {image.status === "approved" && (
                      <div className="absolute top-2 left-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
                        ✓ Approved
                      </div>
                    )}
                    {image.status === "rejected" && (
                      <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                        ✗ Rejected
                      </div>
                    )}
                    {/* Selection checkbox */}
                    <div className="absolute top-2 right-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(image.id)}
                        onChange={() => toggleSelect(image.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 shadow-sm cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm text-gray-700 line-clamp-2 mb-1">
                      &ldquo;{image.quote}&rdquo;
                    </p>
                    <p className="text-xs text-gray-400 mb-2">
                      Template: {image.template}
                    </p>

                    {/* Caption options — 5 pickable choices */}
                    {image.captions && image.captions.length > 0 && (
                      <div className="mb-3 border-t border-gray-100 pt-2">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">
                          Choose caption style:
                        </p>
                        <div className="space-y-1">
                          {image.captions.map((opt, oi) => {
                            const isSelected =
                              image.selectedCaptionIndex === oi;
                            const isEditing =
                              editingCaptions[image.id] !== undefined &&
                              image.selectedCaptionIndex === oi;
                            return (
                              <div key={oi}>
                                <button
                                  onClick={() =>
                                    handlePickCaptionOption(
                                      manifest.batch.id,
                                      image.id,
                                      oi
                                    )
                                  }
                                  className={`w-full text-left p-2 rounded-lg border transition-all ${
                                    isSelected
                                      ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                                      : "border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100"
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <span
                                      className={`text-xs font-bold mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                                        isSelected
                                          ? "bg-blue-500 text-white"
                                          : "bg-gray-200 text-gray-500"
                                      }`}
                                    >
                                      {oi + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p
                                        className={`text-xs leading-relaxed ${
                                          isSelected
                                            ? "text-blue-800"
                                            : "text-gray-600"
                                        }`}
                                      >
                                        {opt.commentary}
                                      </p>
                                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                                        {opt.hashtags
                                          .slice(0, 4)
                                          .map((tag, ti) => (
                                            <span
                                              key={ti}
                                              className={`text-[10px] ${
                                                isSelected
                                                  ? "text-blue-500"
                                                  : "text-gray-400"
                                              }`}
                                            >
                                              {tag}
                                            </span>
                                          ))}
                                        {opt.hashtags.length > 4 && (
                                          <span className="text-[10px] text-gray-400">
                                            +{opt.hashtags.length - 4}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                                {/* Inline editor for selected option */}
                                {isEditing && (
                                  <div className="ml-6 mt-1 p-2 bg-white border border-blue-200 rounded-lg">
                                    <textarea
                                      value={
                                        editingCaptions[image.id].commentary
                                      }
                                      onChange={(e) =>
                                        handleCaptionEdit(
                                          image.id,
                                          "commentary",
                                          e.target.value
                                        )
                                      }
                                      rows={2}
                                      className="w-full text-xs text-gray-600 border border-gray-200 rounded-md p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                    <input
                                      value={
                                        editingCaptions[image.id].hashtags.join(
                                          " "
                                        )
                                      }
                                      onChange={(e) => {
                                        const tags = e.target.value
                                          .split(/\s+/)
                                          .filter((t) => t.length > 0)
                                          .map((t) =>
                                            t.startsWith("#") ? t : `#${t}`
                                          );
                                        handleCaptionEdit(
                                          image.id,
                                          "hashtags",
                                          tags
                                        );
                                      }}
                                      className="w-full text-xs text-gray-500 border border-gray-200 rounded-md p-1.5 mt-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                    <div className="flex gap-1.5 mt-1">
                                      <button
                                        onClick={() =>
                                          handleCaptionSave(
                                            manifest.batch.id,
                                            image.id
                                          )
                                        }
                                        disabled={
                                          savingCaption === image.id
                                        }
                                        className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors text-[10px] font-medium"
                                      >
                                        {savingCaption === image.id
                                          ? "Saving..."
                                          : "Save Edit"}
                                      </button>
                                      <button
                                        onClick={() =>
                                          cancelEditingCaption(image.id)
                                        }
                                        className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors text-[10px]"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* Edit the selected one */}
                        {image.selectedCaptionIndex !== undefined &&
                          image.selectedCaptionIndex >= 0 &&
                          !editingCaptions[image.id] && (
                            <button
                              onClick={() =>
                                startEditingCaption(image)
                              }
                              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors mt-1"
                            >
                              ✏️ Custom edit selected option
                            </button>
                          )}
                      </div>
                    )}

                    {/* Action buttons */}
                    {image.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handleStatusChange(
                              manifest.batch.id,
                              image.id,
                              "approved"
                            )
                          }
                          className="flex-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors text-xs font-medium"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            handleStatusChange(
                              manifest.batch.id,
                              image.id,
                              "rejected"
                            )
                          }
                          className="flex-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-xs font-medium"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {image.status === "approved" && (
                      <button
                        onClick={() =>
                          handleStatusChange(
                            manifest.batch.id,
                            image.id,
                            "rejected"
                          )
                        }
                        className="w-full px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium"
                      >
                        Move to Rejected
                      </button>
                    )}
                    {image.status === "rejected" && (
                      <button
                        onClick={() =>
                          handleStatusChange(
                            manifest.batch.id,
                            image.id,
                            "approved"
                          )
                        }
                        className="w-full px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium"
                      >
                        Move to Approved
                      </button>
                    )}

                    {/* Preview & Copy buttons */}
                    {image.caption && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => setPreviewImage(image)}
                          className="flex-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 transition-colors text-xs font-medium"
                        >
                          👁️ Preview
                        </button>
                        <button
                          onClick={() => copyCaption(image)}
                          className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium"
                        >
                          {copiedId === image.id ? "✅ Copied!" : "📋 Copy Caption"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Queue mode — publish queue view */}
      {viewMode === "queue" && (
        <div>
          {queueLoading ? (
            <div className="text-center py-20 text-gray-500">
              Loading queue...
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-400 mb-4">
                No items in the publish queue. Approve images from the Review tab to add them.
              </p>
            </div>
          ) : (
            <>
              {/* Queue header */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-500">
                  {queue.filter((e) => e.status === "queued").length} queued
                  &middot; {queue.filter((e) => e.status === "published").length} published
                  &middot; {queue.filter((e) => e.status === "failed").length} failed
                </div>
                <button
                  onClick={handlePublishNow}
                  disabled={publishing || queue.filter((e) => e.status === "queued").length === 0}
                  className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {publishing ? "Publishing..." : "Publish Due Items Now"}
                </button>
              </div>

              {/* Queue table */}
              <div className="space-y-3">
                {queue.map((entry) => (
                  <div
                    key={entry.id}
                    className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                      entry.status === "published"
                        ? "border-green-200 opacity-70"
                        : entry.status === "failed"
                        ? "border-red-200"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="p-4 flex items-start gap-4">
                      {/* Thumbnail */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        <img
                          src={`/api/images/${entry.filename}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 line-clamp-1 font-medium">
                          &ldquo;{entry.quote}&rdquo;
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                          {entry.caption.commentary}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.caption.hashtags.slice(0, 5).map((tag, ti) => (
                            <span
                              key={ti}
                              className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {entry.caption.hashtags.length > 5 && (
                            <span className="text-xs text-gray-400">
                              +{entry.caption.hashtags.length - 5}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status & Actions */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                              entry.status === "queued"
                                ? "bg-yellow-100 text-yellow-700"
                                : entry.status === "published"
                                ? "bg-green-100 text-green-700"
                                : entry.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {entry.status === "queued"
                              ? "Queued"
                              : entry.status === "published"
                              ? "Published"
                              : entry.status === "failed"
                              ? "Failed"
                              : entry.status}
                          </span>
                          {entry.status === "queued" && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(entry.scheduledAt).toLocaleString()}
                            </p>
                          )}
                          {entry.publishedAt && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(entry.publishedAt).toLocaleString()}
                            </p>
                          )}
                          {entry.error && (
                            <p className="text-xs text-red-400 mt-0.5 max-w-[200px] truncate" title={entry.error}>
                              {entry.error}
                            </p>
                          )}
                        </div>
                        {entry.status === "queued" && (
                          <button
                            onClick={() => handleRemoveFromQueue(entry.id)}
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
            </>
          )}
        </div>
      )}

      {/* Templates mode — template preview */}
      {viewMode === "templates" && (
        <div>
          {templatesLoading ? (
            <div className="text-center py-20 text-gray-500">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-400 mb-2">No template images found.</p>
              <p className="text-sm text-gray-400">Add .jpg, .png, or .webp files to the templates/ folder.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {templates.map((t) => (
                <div
                  key={t.filename}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-gray-100">
                    <img
                      src={`/api/images/${t.filename}`}
                      alt={t.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs text-gray-700 truncate font-medium">{t.filename}</p>
                    <p className="text-[10px] text-gray-400">{t.sizeKB} KB</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hashtag Bank mode */}
      {viewMode === "hashtags" && (
        <div className="max-w-2xl">
          <p className="text-sm text-gray-500 mb-6">
            Create reusable hashtag sets you can apply to any post. Tags will be merged
            into the caption alongside the AI-generated ones.
          </p>

          {/* Add new set */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">New Hashtag Set</h3>
            <div className="space-y-2">
              <input
                value={newHashtagSetName}
                onChange={(e) => setNewHashtagSetName(e.target.value)}
                placeholder="Set name (e.g., motivation, philosophy)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                value={newHashtagSetTags}
                onChange={(e) => setNewHashtagSetTags(e.target.value)}
                placeholder="Tags separated by spaces (e.g., #motivation #inspiration #goals)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={handleAddHashtagSet}
                disabled={!newHashtagSetName.trim() || !newHashtagSetTags.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                Add Set
              </button>
            </div>
          </div>

          {/* Existing sets */}
          {hashtagSetsLoading ? (
            <div className="text-center py-10 text-gray-500">Loading hashtag sets...</div>
          ) : hashtagSets.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              No hashtag sets yet. Create your first one above.
            </div>
          ) : (
            <div className="space-y-3">
              {hashtagSets.map((set) => (
                <div
                  key={set.name}
                  className="bg-white border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-700">{set.name}</h4>
                    <button
                      onClick={() => handleDeleteHashtagSet(set.name)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {set.tags.map((tag, ti) => (
                      <span
                        key={ti}
                        className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Phone-like frame */}
            <div className="bg-gray-100 p-4">
              <img
                src={`/api/images/${previewImage.filename}`}
                alt="Post preview"
                className="w-full aspect-square rounded-lg object-cover shadow-md"
              />
            </div>
            {/* Caption overlay */}
            {previewImage.caption && (
              <div className="p-5">
                <p className="text-sm text-gray-700 leading-relaxed mb-3">
                  {previewImage.caption.commentary}
                </p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {previewImage.caption.hashtags.map((tag, ti) => (
                    <span
                      key={ti}
                      className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyCaption(previewImage)}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                  >
                    {copiedId === previewImage.id
                      ? "✅ Copied!"
                      : "📋 Copy Caption"}
                  </button>
                  <button
                    onClick={() => setPreviewImage(null)}
                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
