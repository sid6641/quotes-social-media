"use client";

import { Modal, ModalHeader, ModalFooter } from "@/components/ui";

interface CreateAccountForm {
  id: string;
  name: string;
  igUserId: string;
  igAccessToken: string;
  igPageId: string;
}

interface CreateAccountModalProps {
  form: CreateAccountForm;
  onChange: (form: CreateAccountForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CreateAccountModal({ form, onChange, onClose, onSubmit }: CreateAccountModalProps) {
  const update = (partial: Partial<CreateAccountForm>) =>
    onChange({ ...form, ...partial });

  return (
    <Modal open={true} onClose={onClose}>
      <ModalHeader title="Create Account" onClose={onClose} />
      <div className="px-6 py-4 space-y-4">
        <fieldset>
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Identity
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Account ID *</label>
              <input
                value={form.id}
                onChange={(e) => update({ id: e.target.value })}
                placeholder="e.g., mybrand"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Display Name</label>
              <input
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="My Brand"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Instagram API{" "}
            <span className="text-gray-300 font-normal lowercase">(optional — add later)</span>
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">IG User ID</label>
              <input
                value={form.igUserId}
                onChange={(e) => update({ igUserId: e.target.value })}
                placeholder="dummy-ig-user-id"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">IG Access Token</label>
              <input
                value={form.igAccessToken}
                onChange={(e) => update({ igAccessToken: e.target.value })}
                placeholder="dummy-access-token"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-xs text-gray-500 mb-1">Facebook Page ID</label>
            <input
              value={form.igPageId}
              onChange={(e) => update({ igPageId: e.target.value })}
              placeholder="dummy-page-id"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </fieldset>
      </div>
      <ModalFooter>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={!form.id.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          Create Account
        </button>
      </ModalFooter>
    </Modal>
  );
}
