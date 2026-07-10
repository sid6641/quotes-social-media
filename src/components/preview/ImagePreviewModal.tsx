"use client";

import { Modal, ModalHeader } from "@/components/ui";

interface CaptionData {
  commentary: string;
  hashtags: string[];
}

interface ImagePreviewModalProps {
  image: {
    id: string;
    filename: string;
    caption?: CaptionData;
  };
  selectedAccount: string;
  copiedId: string | null;
  onClose: () => void;
  onCopyCaption: () => void;
}

export function ImagePreviewModal({
  image,
  selectedAccount,
  copiedId,
  onClose,
  onCopyCaption,
}: ImagePreviewModalProps) {
  return (
    <Modal open={true} onClose={onClose} width="max-w-sm">
      <div className="bg-gray-100 p-4">
        <img
          src={`/api/images/${image.filename}${selectedAccount ? `?account=${selectedAccount}` : ""}`}
          alt="Post preview"
          className="w-full aspect-square rounded-lg object-cover shadow-md"
        />
      </div>
      {image.caption && (
        <div className="p-5">
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {image.caption.commentary}
          </p>
          <div className="flex flex-wrap gap-1 mb-4">
            {image.caption.hashtags.map((tag, ti) => (
              <span
                key={ti}
                className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCopyCaption}
              className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              {copiedId === image.id ? "✅ Copied!" : "📋 Copy Caption"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
