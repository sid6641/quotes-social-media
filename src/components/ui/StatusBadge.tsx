import React from "react";

type Status =
  | "pending"
  | "approved"
  | "rejected"
  | "queued"
  | "published"
  | "failed"
  | "publishing";

interface StatusBadgeProps {
  status: Status;
  variant?: "pill" | "solid";
  className?: string;
}

const STATUS_STYLES: Record<
  Status,
  { pill: string; solid: string; label: string }
> = {
  pending: {
    pill: "bg-yellow-100 text-yellow-700",
    solid: "bg-yellow-500 text-white",
    label: "Pending",
  },
  approved: {
    pill: "bg-green-100 text-green-700",
    solid: "bg-green-500 text-white",
    label: "Approved",
  },
  rejected: {
    pill: "bg-red-100 text-red-700",
    solid: "bg-red-500 text-white",
    label: "Rejected",
  },
  queued: {
    pill: "bg-blue-100 text-blue-700",
    solid: "bg-blue-500 text-white",
    label: "Queued",
  },
  publishing: {
    pill: "bg-purple-100 text-purple-700",
    solid: "bg-purple-500 text-white",
    label: "Publishing",
  },
  published: {
    pill: "bg-green-100 text-green-700",
    solid: "bg-green-500 text-white",
    label: "Published",
  },
  failed: {
    pill: "bg-red-100 text-red-700",
    solid: "bg-red-500 text-white",
    label: "Failed",
  },
};

export function StatusBadge({
  status,
  variant = "pill",
  className = "",
}: StatusBadgeProps) {
  const styles = STATUS_STYLES[status];

  return (
    <span
      className={`inline-block text-xs font-bold px-2 py-1 rounded ${styles[variant]} ${className}`}
    >
      {variant === "solid" && status === "approved"
        ? "✓ "
        : variant === "solid" && status === "rejected"
          ? "✗ "
          : ""}
      {styles.label}
    </span>
  );
}
