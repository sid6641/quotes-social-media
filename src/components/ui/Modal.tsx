"use client";

import React from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  scrollable?: boolean;
}

export function Modal({
  open,
  onClose,
  children,
  width = "max-w-lg",
  scrollable = false,
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${width} mx-4${
          scrollable ? " max-h-[90vh] overflow-y-auto" : " overflow-hidden"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
}

export function ModalHeader({ title, onClose }: ModalHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 text-lg leading-none"
      >
        ✕
      </button>
    </div>
  );
}

interface ModalFooterProps {
  children: React.ReactNode;
}

export function ModalFooter({ children }: ModalFooterProps) {
  return (
    <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
      {children}
    </div>
  );
}
