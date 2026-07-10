"use client";

import React from "react";

interface BannerProps {
  variant: "success" | "error" | "warning";
  message: string | null;
  onDismiss: () => void;
}

const VARIANT_STYLES: Record<
  "success" | "error" | "warning",
  string
> = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
};

export function Banner({ variant, message, onDismiss }: BannerProps) {
  if (!message) return null;

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-lg border mb-4 text-sm ${VARIANT_STYLES[variant]}`}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-3 flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
