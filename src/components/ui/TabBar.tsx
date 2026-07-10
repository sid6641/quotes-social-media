"use client";

import React from "react";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  selected: string;
  onChange: (key: string) => void;
}

export function TabBar({ tabs, selected, onChange }: TabBarProps) {
  return (
    <div className="flex gap-2 mb-6">
      {tabs.map(({ key, label, count }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selected === key
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {label}
          {count !== undefined && (
            <span className="ml-1.5 text-xs opacity-70">({count})</span>
          )}
        </button>
      ))}
    </div>
  );
}
