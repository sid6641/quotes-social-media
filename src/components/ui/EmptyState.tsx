import React from "react";

interface EmptyStateProps {
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: React.ReactNode;
}

export function EmptyState({ message, action, children }: EmptyStateProps) {
  return (
    <div className="text-center py-20 text-gray-500">
      <p className="mb-4">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          {action.label}
        </button>
      )}
      {children}
    </div>
  );
}
