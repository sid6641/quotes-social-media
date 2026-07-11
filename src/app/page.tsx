"use client";

/**
 * Review Page Shell — account selector + tab routing + shared modals.
 *
 * Each tab is a self-contained component in src/components/tabs/.
 * The shell handles cross-tab concerns: account selection, generation
 * actions, error display, and shared preview modals.
 */

import { useEffect, useState, useRef } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { logAction } from "@/lib/frontend-logger";
import { Banner } from "@/components/ui";
import { ImagePreviewModal } from "@/components/preview/ImagePreviewModal";
import { QueuePreviewModal } from "@/components/preview/QueuePreviewModal";
import ReviewTab from "@/components/tabs/ReviewTab";
import QueueTab from "@/components/tabs/QueueTab";
import QuotesTab from "@/components/tabs/QuotesTab";
import TemplatesTab from "@/components/tabs/TemplatesTab";
import HashtagsTab from "@/components/tabs/HashtagsTab";
import AccountsTab from "@/components/tabs/AccountsTab";
import type { ImageEntry, QueueEntry, Manifest } from "@/components/tabs/types";

type ViewMode = "review" | "queue" | "templates" | "hashtags" | "quotes" | "accounts";

export default function ReviewPage() {
  // ── Logger init ─────────────────────────────────────────────────────
  const loggerInited = useRef(false);
  useEffect(() => {
    if (loggerInited.current) return;
    loggerInited.current = true;
    (async () => {
      const { initLogger, patchFetch, enableClickTracking, logger } = await import("@/lib/frontend-logger");
      initLogger();
      patchFetch();
      enableClickTracking();
      logger.info("page", "ReviewPage mounted");
    })();
  }, []);

  // ── Shared state ────────────────────────────────────────────────────
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("review");
  const [error, setError] = useState<string | null>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [latestManifest, setLatestManifest] = useState<Manifest | null>(null);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<{ total: number; completed: number; current: string } | null>(null);
  const [generateCount, setGenerateCount] = useState(5);
  const [generateAll, setGenerateAll] = useState(false);

  // Publishing / Export
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);

  // Accounts list (for dropdown)
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; enabled: boolean; cooldownDays?: number }>>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Shared modals
  const [previewImage, setPreviewImage] = useState<ImageEntry | null>(null);
  const [queuePreview, setQueuePreview] = useState<QueueEntry | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Shell data: manifest summary for header buttons ────────────────
  // Fetched independently — no child→parent data push needed.
  useEffect(() => {
    const accountParam = selectedAccount ? `?account=${selectedAccount}` : "";
    fetch(`/api/manifest${accountParam}`)
      .then((r) => r.json())
      .then((d) => {
        setLatestManifest(d);
        setApprovedCount((d.images || []).filter((i: ImageEntry) => i.status === "approved").length);
      })
      .catch(() => {});
  }, [selectedAccount, refreshKey]);

  // ── Accounts list ───────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => { if (d.success) setAccounts(d.accounts || []); })
      .catch(() => {});
  }, [refreshKey]);

  // ── Header actions ──────────────────────────────────────────────────

  const handleGenerate = async () => {
    logAction("generate", { account: selectedAccount, count: generateAll ? "all" : generateCount });
    try {
      setGenerating(true);
      setError(null);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: selectedAccount || undefined, count: generateAll ? 0 : generateCount, all: generateAll }),
      });
      const accountParam = selectedAccount ? `?account=${encodeURIComponent(selectedAccount)}` : "";
      const pollInterval = setInterval(async () => {
        try {
          const pr = await fetch(`/api/generate${accountParam}`);
          const pd = await pr.json();
          if (pd.success && pd.total > 0) setGenerateProgress({ total: pd.total, completed: pd.completed, current: pd.current });
        } catch { /* ignore */ }
      }, 500);
      const data = await res.json();
      clearInterval(pollInterval);
      setGenerateProgress(null);
      if (!data.success) throw new Error(data.error || "Generation failed");
      if (data.imageCount === 0) throw new Error("Generation produced no images.");
      setRefreshKey((k) => k + 1); // refresh manifest summary + review tab
    } catch (err) {
      setGenerateProgress(null);
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 7, account: selectedAccount || undefined }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Export failed");
      const relPath = data.result.contentDir.replace(/^.*?output\//, "output/");
      setExportResult(`📅 Exported ${data.result.totalImages} images. Files: ${relPath}/`);
      setTimeout(() => setExportResult(null), 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handlePublishToInstagram = async () => {
    try {
      const accountParam = selectedAccount ? `?account=${selectedAccount}` : "";
      const res = await fetch(`/api/manifest${accountParam}`);
      const manifest: Manifest = await res.json();
      const approved = (manifest.images || []).filter((img) => img.status === "approved");
      if (approved.length === 0) { setError("No approved images to publish"); return; }

      setPublishing(true);
      setPublishResult(null);
      setError(null);
      const pubRes = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: approved.map((img) => img.id), caption: "Daily quote inspiration ✨ #quotes" }),
      });
      const data = await pubRes.json();
      if (!data.success) throw new Error(data.error || "Publishing failed");
      setPublishResult(`✅ Published ${data.published} image${data.published !== 1 ? "s" : ""} to Instagram${data.failed > 0 ? ` (${data.failed} failed)` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish to Instagram");
    } finally {
      setPublishing(false);
    }
  };

  const handleDownloadApproved = async () => {
    try {
      const accountParam = selectedAccount ? `?account=${selectedAccount}` : "";
      const res = await fetch(`/api/manifest${accountParam}`);
      const manifest: Manifest = await res.json();
      const approved = (manifest.images || []).filter((img) => img.status === "approved");
      if (approved.length === 0) { setError("No approved images to download"); return; }

      const zip = new JSZip();
      await Promise.all(approved.map(async (img) => {
        const accParam = selectedAccount ? `?account=${selectedAccount}` : "";
        const imgRes = await fetch(`/api/images/${img.filename}${accParam}`);
        if (!imgRes.ok) throw new Error(`Failed to fetch ${img.filename}`);
        zip.file(img.filename, await imgRes.blob());
      }));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `approved-${manifest.batch.id}.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create download");
    }
  };

  const handleAccountsChanged = () => setRefreshKey((k) => k + 1);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Quote Image Review</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white cursor-pointer"
            >
              <option value="">All accounts</option>
              {accounts.filter((a) => a.enabled).map((a) => (
                <option key={a.id} value={a.id}>{a.name || a.id}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handleDownloadApproved} disabled={approvedCount === 0} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium">
            Download Approved ({approvedCount})
          </button>
          <button onClick={handleExport} disabled={approvedCount === 0 || exporting} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium">
            {exporting ? "Exporting..." : `📅 Export Calendar (${approvedCount})`}
          </button>
          <button onClick={handlePublishToInstagram} disabled={approvedCount === 0 || publishing} className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium">
            {publishing ? "Publishing..." : `Publish to Instagram (${approvedCount})`}
          </button>
          <div className="flex items-center gap-2">
            {!generateAll && (
              <label className="text-xs text-gray-500">
                Count:
                <input type="number" min={1} max={10} value={generateCount} onChange={(e) => setGenerateCount(Math.min(10, Math.max(1, Number(e.target.value))))} disabled={generating} className="ml-1 w-14 text-center text-sm border border-gray-200 rounded-lg px-1 py-1.5" />
              </label>
            )}
            <button onClick={handleGenerate} disabled={generating} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium">
              {generating ? "Generating..." : generateAll ? "Generate All Images" : `Generate ${generateCount} Images`}
            </button>
            <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${generating ? "opacity-50 pointer-events-none" : ""}`}>
              <input type="checkbox" checked={generateAll} onChange={(e) => setGenerateAll(e.target.checked)} disabled={generating} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-gray-600">All images</span>
            </label>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {generateProgress && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">Generating {generateProgress.completed}/{generateProgress.total}</span>
            <span className="text-xs text-blue-500 truncate ml-4 max-w-xs">{generateProgress.current}</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${(generateProgress.completed / generateProgress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Banners */}
      <Banner variant="success" message={publishResult} onDismiss={() => setPublishResult(null)} />
      <Banner variant="success" message={exportResult} onDismiss={() => setExportResult(null)} />
      <Banner variant="error" message={error} onDismiss={() => setError(null)} />

      {/* Tab bar */}
      <div className="flex gap-2 mb-6">
        {(["review", "queue", "templates", "hashtags", "quotes", "accounts"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === mode ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {mode === "review" ? "Review"
              : mode === "queue" ? "Queue"
              : mode === "templates" ? "Templates"
              : mode === "hashtags" ? "Hashtag Bank"
              : mode === "quotes" ? "Quotes"
              : `Accounts ${accounts.length > 0 ? `(${accounts.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {viewMode === "review" && (
        <ReviewTab
          key={`review-${refreshKey}`}
          selectedAccount={selectedAccount}
          onPreviewImage={setPreviewImage}
        />
      )}
      {viewMode === "queue" && <QueueTab selectedAccount={selectedAccount} onPreviewQueue={setQueuePreview} />}
      {viewMode === "templates" && <TemplatesTab selectedAccount={selectedAccount} />}
      {viewMode === "hashtags" && <HashtagsTab />}
      {viewMode === "quotes" && <QuotesTab selectedAccount={selectedAccount} />}
      {viewMode === "accounts" && <AccountsTab onAccountsChanged={handleAccountsChanged} />}

      {/* Shared modals */}
      {previewImage && (
        <ImagePreviewModal
          image={previewImage}
          selectedAccount={selectedAccount}
          copiedId={copiedId}
          onClose={() => setPreviewImage(null)}
          onCopyCaption={() => {
            const caption = previewImage.caption;
            if (!caption) return;
            const text = `${caption.commentary}\n\n${caption.hashtags.join(" ")}`;
            navigator.clipboard.writeText(text).then(() => { setCopiedId(previewImage.id); setTimeout(() => setCopiedId(null), 2000); }).catch(() => {});
          }}
        />
      )}
      {queuePreview && (
        <QueuePreviewModal entry={queuePreview} selectedAccount={selectedAccount} onClose={() => setQueuePreview(null)} onRemove={() => {}} />
      )}
    </main>
  );
}
