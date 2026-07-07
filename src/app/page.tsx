"use client";

import { useEffect, useState, useCallback } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface ImageEntry {
  id: string;
  filename: string;
  quote: string;
  template: string;
  promptTemplate: string;
  status: "pending" | "approved" | "rejected";
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

export default function ReviewPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
            <p className="text-sm text-gray-500 mt-1">
              Batch: {manifest.batch.id} &middot; Generated{" "}
              {new Date(manifest.batch.generatedAt).toLocaleString()} &middot;
              Trigger: {manifest.batch.trigger}
            </p>
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
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {generating ? "Generating..." : "Generate New Batch"}
          </button>
        </div>
      </div>

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

      {/* Filter tabs */}
      {manifest && (
        <div className="flex gap-2 mb-6">
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
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {label} ({statusCounts[key]})
            </button>
          ))}
        </div>
      )}

      {/* Image grid */}
      {manifest && (
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
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm text-gray-700 line-clamp-2 mb-1">
                      &ldquo;{image.quote}&rdquo;
                    </p>
                    <p className="text-xs text-gray-400 mb-3">
                      Template: {image.template}
                    </p>

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
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
