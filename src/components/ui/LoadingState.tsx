import React from "react";

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Loading..." }: LoadingStateProps) {
  return (
    <div className="text-center py-20 text-gray-500">{label}</div>
  );
}
