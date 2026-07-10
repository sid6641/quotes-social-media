"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { logAction } from "@/lib/frontend-logger";
import { Modal, ModalHeader, ModalFooter, FilterBar, StatusBadge, EmptyState, LoadingState, Banner, TabBar } from "@/components/ui";
import { ImagePreviewModal } from "@/components/preview/ImagePreviewModal";
import { QueuePreviewModal } from "@/components/preview/QueuePreviewModal";
import { CreateAccountModal } from "@/components/accounts/CreateAccountModal";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";

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
type ViewMode = "review" | "queue" | "templates" | "hashtags" | "quotes" | "accounts";

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
  // Initialize frontend action logger
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

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<{ total: number; completed: number; current: string } | null>(null);
  const [generateCount, setGenerateCount] = useState(5);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("review");
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Cross-batch review (all images across all batches for the account)
  const [allImages, setAllImages] = useState<Array<{ batchId: string; image: ImageEntry }> | null>(null);
  const [batchScope, setBatchScope] = useState<string>("__all__");

  // Batch history
  const [allBatches, setAllBatches] = useState<
    Array<{ id: string; generatedAt: string; trigger: string; imageCount: number; approvedCount: number }>
  >([]);
  const [batchSelectorOpen, setBatchSelectorOpen] = useState(false);

  // Account selection (first-class citizen)
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; enabled: boolean; cooldownDays?: number }>>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    id: "",
    name: "",
    igUserId: "",
    igAccessToken: "",
    igPageId: "",
  });

  // Quotes pool
  const [poolQuotes, setPoolQuotes] = useState<Array<{ id: string; text: string; status: string; usageCount: number; isFavorite?: boolean }>>([]);
  const [poolStats, setPoolStats] = useState<{ total: number; available: number; cooldown: number; retired: number } | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [newQuoteText, setNewQuoteText] = useState("");
  const [newQuoteAuthor, setNewQuoteAuthor] = useState("");
  const [quoteScopeFilter, setQuoteScopeFilter] = useState<"all" | "account" | "favorites">("all");
  const [quoteSearch, setQuoteSearch] = useState("");
  const [favoriteTogglingQuotes, setFavoriteTogglingQuotes] = useState<Set<string>>(new Set());

  // Templates
  const [templates, setTemplates] = useState<Array<{ filename: string; sizeKB: string; filePath?: string; isFavorite?: boolean; source?: "global" | "account" }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<"all" | "account" | "favorites">("all");

  // Hashtag bank
  const [hashtagSets, setHashtagSets] = useState<Array<{ name: string; tags: string[] }>>([]);
  const [hashtagSetsLoading, setHashtagSetsLoading] = useState(false);
  const [newHashtagSetName, setNewHashtagSetName] = useState("");
  const [newHashtagSetTags, setNewHashtagSetTags] = useState("");

  // Preview modal
  const [previewImage, setPreviewImage] = useState<ImageEntry | null>(null);
  const [queuePreview, setQueuePreview] = useState<QueueEntry | null>(null);

  const fetchLatestBatch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const accountParam = selectedAccount ? `?account=${selectedAccount}` : "";
      const res = await fetch(`/api/manifest${accountParam}`);
      if (!res.ok) {
        if (res.status === 404) {
          setManifest(null);
          setLoading(false);
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
  }, [selectedAccount]);

  // Fetch ALL images across all batches (for the unified review view)
  const fetchAllImages = useCallback(async () => {
    try {
      const accountParam = selectedAccount ? `?allImages=true&account=${selectedAccount}` : "?allImages=true";
      const res = await fetch(`/api/manifest${accountParam}`);
      if (!res.ok) { setAllImages([]); return; }
      const data = await res.json();
      setAllImages(data.images || []);
    } catch {
      setAllImages([]);
    }
  }, [selectedAccount]);

  // Fetch batches summary list
  const fetchAllBatchesList = useCallback(async () => {
    try {
      const accountParam = selectedAccount ? `?all=true&account=${selectedAccount}` : "?all=true";
      const res = await fetch(`/api/manifest${accountParam}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setAllBatches(data.batches || []);
    } catch {
      // non-fatal
    }
  }, [selectedAccount]);

  useEffect(() => {
    fetchLatestBatch();
    fetchAllImages();
    fetchAllBatchesList();
  }, [fetchLatestBatch, fetchAllImages, fetchAllBatchesList]);

  // Load accounts on mount for the account selector
  useEffect(() => {
    fetch("/api/accounts").then(res => res.json()).then(data => {
      if (data.success) setAccounts(data.accounts || []);
    }).catch(() => {});
  }, []);

  // Re-fetch when account changes — runs after all callbacks are defined
  useEffect(() => {
    if (viewMode === "quotes") fetchPoolQuotes();
    if (viewMode === "templates") fetchTemplates();
    if (viewMode === "queue") fetchQueue();
    if (viewMode === "review") {
      fetchLatestBatch();
      fetchAllImages();
      fetchAllBatchesList();
    }
  }, [selectedAccount]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    logAction("generate", { account: selectedAccount, count: generateCount });
    try {
      setGenerating(true);
      setError(null);
      setGenerateProgress({ total: generateCount, completed: 0, current: "Starting..." });

      // Poll progress while generating
      const accountParam = selectedAccount ? `?account=${encodeURIComponent(selectedAccount)}` : "";
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/generate${accountParam}`);
          const data = await res.json();
          if (data.success && data.total > 0) {
            setGenerateProgress({ total: data.total, completed: data.completed, current: data.current });
          }
        } catch { /* ignore poll errors */ }
      }, 500);

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: selectedAccount || undefined, count: generateCount }),
      });
      clearInterval(pollInterval);
      setGenerateProgress(null);

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Generation failed");
      }
      if (data.imageCount === 0) {
        throw new Error("Generation produced no images. Check if the account has quotes, templates, and prompts configured.");
      }
      await fetchLatestBatch();
    } catch (err) {
      setGenerateProgress(null);
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
    logAction("status-change", { batchId, imageId, status, account: selectedAccount });
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageId, status, account: selectedAccount || undefined }),
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
      setAllImages((prev) => {
        if (!prev) return prev;
        return prev.map((entry) =>
          entry.image.id === imageId
            ? { ...entry, image: { ...entry.image, status } }
            : entry
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // Queue fetching
  const fetchQueue = useCallback(async () => {
    try {
      setQueueLoading(true);
      const accountParam = selectedAccount ? `?account=${selectedAccount}` : "";
      const res = await fetch(`/api/queue${accountParam}`);
      if (!res.ok) throw new Error("Failed to fetch queue");
      const data = await res.json();
      setQueue(data.queue || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setQueueLoading(false);
    }
  }, [selectedAccount]);

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
    logAction("caption-pick", { batchId, imageId, optionIndex, account: selectedAccount });
    try {
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageId, selectedOption: optionIndex, account: selectedAccount || undefined }),
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
      setAllImages((prev) => {
        if (!prev) return prev;
        return prev.map((entry) => {
          if (entry.image.id !== imageId) return entry;
          const caption = entry.image.captions?.[optionIndex] ?? entry.image.caption;
          return {
            ...entry,
            image: { ...entry.image, selectedCaptionIndex: optionIndex, caption },
          };
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pick caption");
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7, account: selectedAccount || undefined }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Export failed");
      const relPath = data.result.contentDir.replace(/^.*?output\//, "output/");
      setExportResult(
        `📅 Exported ${data.result.totalImages} images for the next ${data.result.totalDays} days. ` +
        `Files ready in: ${relPath}/`
      );
      setTimeout(() => setExportResult(null), 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Reject all remaining pending images across the current view scope
  const handleRejectRemaining = async () => {
    const pending = displayEntries.filter((i) => i.status === "pending");
    if (pending.length === 0) return;

    let rejected = 0;
    for (const img of pending) {
      const entry = img as ImageEntry & { batchId?: string };
      const batchId = entry.batchId || manifest?.batch?.id;
      if (!batchId) continue;
      try {
        const res = await fetch("/api/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchId,
            imageId: img.id,
            status: "rejected",
            account: selectedAccount || undefined,
          }),
        });
        if (res.ok) rejected++;
      } catch {
        // continue
      }
    }

    await Promise.all([fetchLatestBatch(), fetchAllImages(), fetchAllBatchesList()]);
    setError(`Rejected ${rejected} remaining image(s).`);
    setTimeout(() => setError(null), 4000);
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
    if (batchId === "__all__") {
      setBatchScope("__all__");
      setBatchSelectorOpen(false);
      return;
    }
    try {
      setLoading(true);
      const accountParam = selectedAccount ? `&account=${selectedAccount}` : "";
      const res = await fetch(`/api/manifest?batchId=${batchId}${accountParam}`);
      if (!res.ok) throw new Error("Failed to load batch");
      const data = await res.json();
      setManifest(data);
      setBatchScope(batchId);
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
    logAction("bulk-status", { status, count: selectedIds.size, account: selectedAccount });
    if (selectedIds.size === 0) return;
    // In cross-batch mode, use the first selected image's batchId
    const firstSelected = displayEntries.find((e) => selectedIds.has(e.id));
    const batchId = firstSelected
      ? (firstSelected as any).batchId || manifest?.batch?.id
      : manifest?.batch?.id;
    if (!batchId) return;

    try {
      const res = await fetch("/api/batch-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          imageIds: Array.from(selectedIds),
          status,
          account: selectedAccount || undefined,
        }),
      });
      if (!res.ok) throw new Error("Batch status update failed");
      await Promise.all([fetchLatestBatch(), fetchAllImages(), fetchAllBatchesList()]);
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

  // Accounts
  const [editingAccount, setEditingAccount] = useState<{
    id: string;
    name: string;
    description: string;
    scope: string;
    scheduleTime: string;
    scheduleTimezone: string;
    postsPerDay: string;
    cooldownDays: string;
    igUserId: string;
    igPageId: string;
    igAccessToken: string;
    enabled: boolean;
  } | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setAccountsLoading(true);
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (data.success) setAccounts(data.accounts || []);
    } catch {
      // non-fatal
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const openAccountEditor = (account: typeof accounts[0]) => {
    setEditingAccount({
      id: account.id,
      name: account.name || "",
      description: (account as any).description || "",
      scope: "",
      scheduleTime: (account as any).schedule?.time || "09:00",
      scheduleTimezone: (account as any).schedule?.timezone || "America/New_York",
      postsPerDay: String((account as any).schedule?.postsPerDay ?? 1),
      cooldownDays: String(account.cooldownDays ?? 30),
      igUserId: (account as any).instagram?.igUserId || "",
      igPageId: (account as any).instagram?.pageId || "",
      igAccessToken: (account as any).instagram?.accessToken || "",
      enabled: account.enabled,
    });
  };

  const closeAccountEditor = () => setEditingAccount(null);

  const handleSaveAccount = async () => {
    if (!editingAccount) return;
    const e = editingAccount;
    try {
      const body: Record<string, unknown> = {
        id: e.id,
        name: e.name || e.id,
        description: e.description || undefined,
        scope: e.scope ? e.scope.split(",").map((t) => t.trim()).filter(Boolean) : [],
        schedule: {
          time: e.scheduleTime || "09:00",
          timezone: e.scheduleTimezone || "America/New_York",
          postsPerDay: parseInt(e.postsPerDay) || 1,
          reelsPerWeek: 0,
        },
        instagram: {
          igUserId: e.igUserId || undefined,
          pageId: e.igPageId || undefined,
          accessToken: e.igAccessToken || undefined,
        },
        cooldownDays: parseInt(e.cooldownDays) || 30,
        enabled: e.enabled,
      };

      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save account");
      closeAccountEditor();
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account");
    }
  };

  const handleCreateAccount = async () => {
    if (!createForm.id.trim()) return;
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: createForm.id.trim(),
          name: createForm.name.trim() || createForm.id.trim(),
          instagram: {
            igUserId: createForm.igUserId.trim() || undefined,
            pageId: createForm.igPageId.trim() || undefined,
            accessToken: createForm.igAccessToken.trim() || undefined,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to create account");
      setShowCreateModal(false);
      setCreateForm({ id: "", name: "", igUserId: "", igAccessToken: "", igPageId: "" });
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    }
  };

  const handleToggleAccount = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error("Failed to update account");
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update account");
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      const res = await fetch("/api/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete account");
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    }
  };

  // Quotes pool
  const fetchPoolQuotes = useCallback(async () => {
    try {
      setQuotesLoading(true);
      const accountParam = selectedAccount ? `account=${encodeURIComponent(selectedAccount)}` : "";
      const status = quoteScopeFilter !== "all" ? quoteScopeFilter : undefined;
      const params = [status ? `status=${status}` : "", accountParam].filter(Boolean).join("&");
      const url = params ? `/api/quotes?${params}` : "/api/quotes";
      const statsUrl = accountParam ? `/api/quotes?stats=true&${accountParam}` : "/api/quotes?stats=true";
      const [quotesRes, statsRes] = await Promise.all([
        fetch(url),
        fetch(statsUrl),
      ]);
      const quotesData = await quotesRes.json();
      const statsData = await statsRes.json();
      if (quotesData.success) setPoolQuotes(quotesData.quotes || []);
      if (statsData.success) setPoolStats(statsData.stats || null);
    } catch {
      // non-fatal
    } finally {
      setQuotesLoading(false);
    }
  }, [quoteScopeFilter, selectedAccount]);

  const handleAddQuote = async () => {
    const text = newQuoteText.trim();
    if (!text) return;
    if (!selectedAccount) {
      setError("Select an account first before adding quotes.");
      return;
    }
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          author: newQuoteAuthor.trim() || undefined,
          account: selectedAccount,
        }),
      });
      if (!res.ok) throw new Error("Failed to add quote");
      setNewQuoteText("");
      setNewQuoteAuthor("");
      await fetchPoolQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add quote");
    }
  };

  const handleDeleteQuote = async (id: string) => {
    try {
      const res = await fetch("/api/quotes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, account: selectedAccount || undefined }),
      });
      if (!res.ok) throw new Error("Failed to delete quote");
      await fetchPoolQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete quote");
    }
  };

  // Toggle quote favorite
  const handleToggleQuoteFavorite = async (quoteId: string, isFavorite: boolean) => {
    if (!selectedAccount) return;
    setFavoriteTogglingQuotes((prev) => new Set(prev).add(quoteId));
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
        setPoolQuotes((prev) =>
          prev.map((q) =>
            q.id === quoteId ? { ...q, isFavorite: !isFavorite } : q
          )
        );
      }
    } catch {
      // non-fatal
    } finally {
      setFavoriteTogglingQuotes((prev) => {
        const next = new Set(prev);
        next.delete(quoteId);
        return next;
      });
    }
  };

  // Templates
  const fetchTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const accountParam = selectedAccount ? `?account=${encodeURIComponent(selectedAccount)}` : "";
      const res = await fetch(`/api/templates${accountParam}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setTemplates(data.templates || []);
    } catch {
      // non-fatal
    } finally {
      setTemplatesLoading(false);
    }
  }, [selectedAccount]);

  // Toggle template favorite
  const [favoriteToggling, setFavoriteToggling] = useState<Set<string>>(new Set());
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
          prev.map((t) =>
            t.filename === filename ? { ...t, isFavorite: !isFavorite } : t
          )
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
    if (mode === "quotes") fetchPoolQuotes();
    if (mode === "accounts") fetchAccounts();
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
          const accParam = selectedAccount ? `?account=${selectedAccount}` : "";
          const res = await fetch(`/api/images/${img.filename}${accParam}`);
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

  // When viewing all batches: merged list with batchId attached
  const isCrossBatch = batchScope === "__all__";
  const displayEntries: (ImageEntry & { batchId?: string })[] = isCrossBatch
    ? (allImages ?? []).map((entry) => ({ ...entry.image, batchId: entry.batchId }))
    : (manifest?.images ?? []);

  const filteredImages = displayEntries.filter(
    (img) => statusFilter === "all" || img.status === statusFilter
  );

  const statusCounts = {
    all: displayEntries.length,
    pending: displayEntries.filter((i) => i.status === "pending").length,
    approved: displayEntries.filter((i) => i.status === "approved").length,
    rejected: displayEntries.filter((i) => i.status === "rejected").length,
  };

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Quote Image Review
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            {/* Account selector */}
            <select
              value={selectedAccount}
              onChange={(e) => {
                const newAccount = e.target.value;
                setSelectedAccount(newAccount);
                // Re-fetch current view's data when account changes
                // Use newAccount directly to avoid stale closure
                if (viewMode === "templates") {
                  fetch(`/api/templates${newAccount ? `?account=${encodeURIComponent(newAccount)}` : ""}`)
                    .then(r => r.json())
                    .then(d => { if (d.success) setTemplates(d.templates || []); })
                    .catch(() => {});
                }
                if (viewMode === "queue") {
                  setQueueLoading(true);
                  fetch(`/api/queue${newAccount ? `?account=${newAccount}` : ""}`)
                    .then(r => r.json())
                    .then(d => { if (d.success) setQueue(d.queue || []); })
                    .catch(() => {})
                    .finally(() => setQueueLoading(false));
                }
              }}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white cursor-pointer"
            >
              <option value="">All accounts</option>
              {accounts.filter(a => a.enabled).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </select>

            {manifest && (
            <span className="relative">
              {/* Batch selector */}
              <span
                className="cursor-pointer hover:text-gray-700 transition-colors"
                onClick={() => {
                  fetchAllBatchesList();
                  setBatchSelectorOpen(!batchSelectorOpen);
                }}
              >
                {isCrossBatch
                  ? `📦 All iterations (${displayEntries.length} images) ▾`
                  : `📦 Batch: ${batchScope} ▾`}
              </span>
              {!isCrossBatch && manifest && (
                <span>
                  &middot; Generated{" "}
                  {new Date(manifest.batch.generatedAt).toLocaleString()}
                  &middot; Trigger: {manifest.batch.trigger}
                </span>
              )}

              {batchSelectorOpen && allBatches.length > 0 && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[280px] max-h-60 overflow-y-auto">
                  <button
                    onClick={() => switchBatch("__all__")}
                    className={`w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                      isCrossBatch
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-600"
                    }`}
                  >
                    <span className="font-medium">All iterations</span>
                    <span className="text-gray-400 ml-2">
                      {allImages?.length ?? 0} image{(allImages?.length ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </button>
                  {allBatches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => switchBatch(b.id)}
                      className={`w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${
                        b.id === batchScope
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
            </span>
          )}
          </div>
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
            onClick={handleExport}
            disabled={statusCounts.approved === 0 || exporting}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {exporting
              ? "Exporting..."
              : `📅 Export Calendar (${statusCounts.approved})`}
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
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">
              Count:
              <input
                type="range"
                min={1}
                max={10}
                value={generateCount}
                onChange={(e) => setGenerateCount(Number(e.target.value))}
                disabled={generating}
                className="ml-1 w-20 align-middle"
              />
              <span className="ml-1 font-medium text-gray-700">{generateCount}</span>
            </label>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {generating ? "Generating..." : `Generate ${generateCount} Images`}
            </button>
          </div>
        </div>
      </div>

      {/* Generation progress bar */}
      {generateProgress && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">
              Generating {generateProgress.completed}/{generateProgress.total}
            </span>
            <span className="text-xs text-blue-500 truncate ml-4 max-w-xs">
              {generateProgress.current}
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(generateProgress.completed / generateProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Publish result banner */}
      <Banner variant="success" message={publishResult} onDismiss={() => setPublishResult(null)} />

      {/* Export result banner */}
      <Banner variant="success" message={exportResult} onDismiss={() => setExportResult(null)} />

      {/* Error banner */}
      <Banner variant="error" message={error} onDismiss={() => setError(null)} />

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
        <button
          onClick={() => switchView("quotes")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === "quotes"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Quotes {poolStats ? `(${poolStats.available})` : ""}
        </button>
        <button
          onClick={() => switchView("accounts")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === "accounts"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Accounts {accounts.length > 0 ? `(${accounts.length})` : ""}
        </button>
      </div>

      {/* Filter tabs + select-all (review mode only) */}
      {(manifest || allImages) && viewMode === "review" && (
        <div className="flex items-center gap-2 mb-6">
          <FilterBar
            options={[
              { key: "all", label: "All", count: statusCounts.all },
              { key: "pending", label: "Pending", count: statusCounts.pending },
              { key: "approved", label: "Approved", count: statusCounts.approved },
              { key: "rejected", label: "Rejected", count: statusCounts.rejected },
            ]}
            selected={statusFilter}
            onChange={(key) => {
              setStatusFilter(key as StatusFilter);
              setSelectedIds(new Set());
            }}
          />
          <div className="ml-auto flex items-center gap-2">
            {statusCounts.pending > 0 && (
              <button
                onClick={handleRejectRemaining}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                title="Mark all still-pending images as rejected"
              >
                Reject remaining ({statusCounts.pending})
              </button>
            )}
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
      {(manifest || allImages) && viewMode === "review" && selectedIds.size > 0 && (
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
      {viewMode === "review" && (
        <>
          {/* Cross-batch info bar */}
          {isCrossBatch && allImages && allImages.length > 0 && (
            <div className="text-xs text-gray-400 mb-3 px-1">
              Showing {filteredImages.length} of {displayEntries.length} images across {allBatches.length} iteration(s)
            </div>
          )}

          {filteredImages.length === 0 && displayEntries.length === 0 && manifest === null && allImages === null ? (
            <div className="text-center py-20 text-gray-400">Loading...</div>
          ) : filteredImages.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              No {statusFilter === "all" ? "" : statusFilter} images to show.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredImages.map((image) => {
                const imgBatchId = (image as any).batchId;
                return (
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
                      src={`/api/images/${image.filename}${selectedAccount ? `?account=${selectedAccount}` : ""}`}
                      alt={`Quote: ${image.quote}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Iteration badge (cross-batch mode) */}
                    {isCrossBatch && imgBatchId && (
                      <div className="absolute top-2 left-2 bg-gray-900/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                        {imgBatchId}
                      </div>
                    )}
                    {/* Status badge */}
                    <div className={`absolute top-2 left-2 ${imgBatchId ? "top-6" : ""}`}>
                      {image.status !== "pending" && (
                        <StatusBadge status={image.status} variant="solid" />
                      )}
                    </div>
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
                    {isCrossBatch && imgBatchId && (
                      <p className="text-[10px] text-gray-400 font-mono mb-1">{imgBatchId}</p>
                    )}
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
                                      imgBatchId || manifest?.batch?.id || "",
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
                                            imgBatchId || manifest?.batch?.id || "",
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
                              imgBatchId || manifest?.batch?.id || "",
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
                              imgBatchId || manifest?.batch?.id || "",
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
                            imgBatchId || manifest?.batch?.id || "",
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
                            imgBatchId || manifest?.batch?.id || "",
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
              );})}
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
                    onClick={() => setQueuePreview(entry)}
                    className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all cursor-pointer hover:shadow-md ${
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
                          src={`/api/images/${entry.filename}${selectedAccount ? `?account=${selectedAccount}` : ""}`}
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
                            onClick={(e) => { e.stopPropagation(); handleRemoveFromQueue(entry.id); }}
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
          {/* Template filter bar */}
          {selectedAccount && templates.length > 0 && (
            <FilterBar
              options={[
                { key: "all", label: "All" },
                { key: "account", label: "Account", count: templates.filter(t => t.source === "account" || t.isFavorite).length },
                { key: "favorites", label: "Favorites", count: templates.filter(t => t.isFavorite).length },
              ]}
              selected={templateFilter}
              onChange={setTemplateFilter}
            />
          )}

          {templatesLoading ? (
            <div className="text-center py-20 text-gray-500">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-400 mb-2">No template images found.</p>
              <p className="text-sm text-gray-400">Add .jpg, .png, or .webp files to the templates/ folder.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {templates
                .filter((t) => {
                  if (templateFilter === "all") return t.source === "global" || !selectedAccount;
                  if (templateFilter === "account") return t.source === "account" || t.isFavorite;
                  if (templateFilter === "favorites") return t.isFavorite;
                  return true;
                })
                .map((t) => (
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
                    {/* Favorite star */}
                    {selectedAccount && (
                      <button
                        onClick={() => handleToggleFavorite(t.filename, !!t.isFavorite)}
                        disabled={favoriteToggling.has(t.filename)}
                        className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm ${
                          t.isFavorite
                            ? "bg-yellow-400 text-white"
                            : "bg-white text-gray-400 hover:bg-yellow-50 hover:text-yellow-500"
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
      )}

      {/* Quotes Pool mode */}
      {viewMode === "quotes" && (
        <div>
          {/* Stats bar */}
          {poolStats && (
            <div className="flex gap-4 mb-6 text-sm">
              <span className="text-gray-500">Total: <strong>{poolStats.total}</strong></span>
              <span className="text-green-600">Available: <strong>{poolStats.available}</strong></span>
              <span className="text-yellow-600">Cooldown: <strong>{poolStats.cooldown}</strong></span>
              <span className="text-gray-400">Retired: <strong>{poolStats.retired}</strong></span>
            </div>
          )}

          {/* Search */}
          {selectedAccount && poolQuotes.length > 0 && (
            <div className="mb-4">
              <input
                value={quoteSearch}
                onChange={(e) => setQuoteSearch(e.target.value)}
                placeholder="Search quotes..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          )}

          {/* Add new quote */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Add Quote</h3>
            <div className="flex gap-2">
              <input
                value={newQuoteText}
                onChange={(e) => setNewQuoteText(e.target.value)}
                placeholder="Enter quote text..."
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleAddQuote()}
              />
              <input
                value={newQuoteAuthor}
                onChange={(e) => setNewQuoteAuthor(e.target.value)}
                placeholder="Author (optional)"
                className="w-40 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={handleAddQuote}
                disabled={!newQuoteText.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                Add
              </button>
            </div>
          </div>

          {/* Scope filter tabs */}
          {selectedAccount && (
            <FilterBar
              options={[
                { key: "all", label: "All" },
                { key: "account", label: "Account" },
                { key: "favorites", label: "Favorites", count: poolQuotes.filter(q => q.isFavorite).length },
              ]}
              selected={quoteScopeFilter}
              onChange={setQuoteScopeFilter}
            />
          )}

          {/* Quote list */}
          {quotesLoading ? (
            <div className="text-center py-10 text-gray-500">Loading quotes...</div>
          ) : !selectedAccount ? (
            <div className="text-center py-10 text-gray-400">
              Select an account from the dropdown above to view its quote pool.
            </div>
          ) : poolQuotes.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              No quotes found for this account. Add one above or import from a text file via CLI.
            </div>
          ) : (
            <div className="space-y-2">
              {poolQuotes
                .filter((q) => quoteScopeFilter !== "favorites" || q.isFavorite)
                .filter((q) => !quoteSearch || q.text.toLowerCase().includes(quoteSearch.toLowerCase()))
                .map((q) => (
                <div
                  key={q.id}
                  className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3"
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      q.status === "available"
                        ? "bg-green-400"
                        : q.status === "cooldown"
                        ? "bg-yellow-400"
                        : "bg-gray-300"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">&ldquo;{q.text}&rdquo;</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs text-gray-400">
                        Used {q.usageCount}x
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggleQuoteFavorite(q.id, !!q.isFavorite)}
                      disabled={favoriteTogglingQuotes.has(q.id)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-colors ${
                        q.isFavorite
                          ? "text-yellow-500 hover:text-yellow-600"
                          : "text-gray-300 hover:text-yellow-400"
                      }`}
                      title={q.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      {q.isFavorite ? "★" : "☆"}
                    </button>
                    <button
                      onClick={() => handleDeleteQuote(q.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-0.5"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Accounts mode */}
      {viewMode === "accounts" && (
        <div className="max-w-3xl">
          <p className="text-sm text-gray-500 mb-6">
            Manage your Instagram accounts. Each account has its own schedule,
            Instagram auth, and isolated publish queue.
          </p>

          {/* Create new account — modal trigger */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">Accounts</h3>
              <button
                onClick={() => {
                  setCreateForm({ id: "", name: "", igUserId: "", igAccessToken: "", igPageId: "" });
                  setShowCreateModal(true);
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                + Create Account
              </button>
            </div>
          </div>

          {/* Account list */}
          {accountsLoading ? (
            <div className="text-center py-10 text-gray-500">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              No accounts yet. Create your first one above.
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="bg-white border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">{a.name}</h4>
                      <p className="text-xs text-gray-400">ID: {a.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleAccount(a.id, !a.enabled)}
                        className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                          a.enabled
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {a.enabled ? "Enabled" : "Disabled"}
                      </button>
                      <button
                        onClick={() => openAccountEditor(a)}
                        className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(a.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    {a.cooldownDays && <span>Cooldown: {a.cooldownDays}d</span>}
                    {(a as any).schedule?.time && <span>Schedule: {(a as any).schedule.time}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Account editor modal */}
      {/* Create Account Modal */}
      {showCreateModal && (
        <CreateAccountModal
          form={createForm}
          onChange={setCreateForm}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateAccount}
        />
      )}

      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onChange={setEditingAccount}
          onClose={closeAccountEditor}
          onSave={handleSaveAccount}
        />
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
        <ImagePreviewModal
          image={previewImage}
          selectedAccount={selectedAccount}
          copiedId={copiedId}
          onClose={() => setPreviewImage(null)}
          onCopyCaption={() => copyCaption(previewImage)}
        />
      )}

      {/* Preview modal for queue entries */}
      {queuePreview && (
        <QueuePreviewModal
          entry={queuePreview}
          selectedAccount={selectedAccount}
          onClose={() => setQueuePreview(null)}
          onRemove={handleRemoveFromQueue}
        />
      )}
    </main>
  );
}
