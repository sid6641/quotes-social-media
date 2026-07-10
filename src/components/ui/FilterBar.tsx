"use client";

import React from "react";

interface FilterOption<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

interface FilterBarProps<K extends string = string> {
  options: readonly FilterOption<K>[];
  selected: K;
  onChange: (key: K) => void;
}

export function FilterBar<K extends string = string>({ options, selected, onChange }: FilterBarProps<K>) {
  return (
    <div className="flex items-center gap-2">
      {options.map(({ key, label, count }) => (
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
