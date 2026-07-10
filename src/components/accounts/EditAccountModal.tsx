"use client";

import { Modal, ModalHeader, ModalFooter } from "@/components/ui";

interface EditAccountData {
  id: string;
  name: string;
  description: string;
  scope: string;
  enabled: boolean;
  cooldownDays: string;
  scheduleTime: string;
  scheduleTimezone: string;
  postsPerDay: string;
  igUserId: string;
  igAccessToken: string;
  igPageId: string;
}

interface EditAccountModalProps {
  account: EditAccountData;
  onChange: (account: EditAccountData) => void;
  onClose: () => void;
  onSave: () => void;
}

export function EditAccountModal({ account, onChange, onClose, onSave }: EditAccountModalProps) {
  const update = (partial: Partial<EditAccountData>) =>
    onChange({ ...account, ...partial });

  return (
    <Modal open={true} onClose={onClose} scrollable>
      <ModalHeader title={`${account.id} — Settings`} onClose={onClose} />
      <div className="px-6 py-4 space-y-4">
        {/* Identity */}
        <fieldset>
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Identity
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Account ID</label>
              <input
                value={account.id}
                disabled
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Display Name</label>
              <input
                value={account.name}
                onChange={(e) => update({ name: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <input
              value={account.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="What's this account about?"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </fieldset>

        {/* Content */}
        <fieldset>
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Content
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cooldown (days)</label>
              <input
                type="number"
                min={1}
                value={account.cooldownDays}
                onChange={(e) => update({ cooldownDays: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        </fieldset>

        {/* Schedule */}
        <fieldset>
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Publish Schedule
          </legend>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Time</label>
              <input
                type="time"
                value={account.scheduleTime}
                onChange={(e) => update({ scheduleTime: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Timezone</label>
              <select
                value={account.scheduleTimezone}
                onChange={(e) => update({ scheduleTimezone: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {ZONES.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Posts/day</label>
              <input
                type="number"
                min={1}
                max={10}
                value={account.postsPerDay}
                onChange={(e) => update({ postsPerDay: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        </fieldset>

        {/* Instagram Auth */}
        <fieldset>
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Instagram API
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">IG User ID</label>
              <input
                value={account.igUserId}
                onChange={(e) => update({ igUserId: e.target.value })}
                placeholder="From Meta Graph API"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Facebook Page ID</label>
              <input
                value={account.igPageId}
                onChange={(e) => update({ igPageId: e.target.value })}
                placeholder="Linked page ID"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-xs text-gray-500 mb-1">Access Token</label>
            <input
              value={account.igAccessToken}
              onChange={(e) => update({ igAccessToken: e.target.value })}
              placeholder="IG Graph API access token"
              type="password"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </fieldset>

        {/* Status */}
        <fieldset>
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Status
          </legend>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={account.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Account enabled</span>
          </label>
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
          onClick={onSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Save Changes
        </button>
      </ModalFooter>
    </Modal>
  );
}

const ZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Tokyo", label: "Tokyo" },
];
