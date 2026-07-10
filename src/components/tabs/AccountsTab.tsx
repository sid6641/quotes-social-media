"use client";

import { useEffect, useState, useCallback } from "react";
import { CreateAccountModal } from "@/components/accounts/CreateAccountModal";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";

interface Account {
  id: string;
  name: string;
  enabled: boolean;
  cooldownDays?: number;
}

interface EditForm {
  id: string;
  name: string;
  description: string;
  scope: string;
  scheduleTime: string;
  scheduleTimezone: string;
  postsPerDay: string;
  cooldownDays: string;
  igUserId: string;
  igPageId: string;
  igAccessToken: string;
  enabled: boolean;
}

export default function AccountsTab({ onAccountsChanged }: { onAccountsChanged?: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ id: "", name: "", igUserId: "", igAccessToken: "", igPageId: "" });
  const [editingAccount, setEditingAccount] = useState<EditForm | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (data.success) setAccounts(data.accounts || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleCreate = async () => {
    if (!createForm.id.trim()) return;
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: createForm.id.trim(),
          name: createForm.name.trim() || createForm.id.trim(),
          instagram: {
            igUserId: createForm.igUserId.trim() || undefined,
            pageId: createForm.igPageId.trim() || undefined,
            accessToken: createForm.igAccessToken.trim() || undefined,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to create account");
      setShowCreateModal(false);
      setCreateForm({ id: "", name: "", igUserId: "", igAccessToken: "", igPageId: "" });
      await fetchAccounts();
      onAccountsChanged?.();
    } catch {
      // handled by shell
    }
  };

  const openEditor = (a: Account) => {
    setEditingAccount({
      id: a.id,
      name: a.name || "",
      description: (a as any).description || "",
      scope: "",
      scheduleTime: (a as any).schedule?.time || "09:00",
      scheduleTimezone: (a as any).schedule?.timezone || "America/New_York",
      postsPerDay: String((a as any).schedule?.postsPerDay ?? 1),
      cooldownDays: String(a.cooldownDays ?? 30),
      igUserId: (a as any).instagram?.igUserId || "",
      igPageId: (a as any).instagram?.pageId || "",
      igAccessToken: (a as any).instagram?.accessToken || "",
      enabled: a.enabled,
    });
  };

  const handleSave = async () => {
    if (!editingAccount) return;
    const e = editingAccount;
    try {
      const body: Record<string, unknown> = {
        id: e.id,
        name: e.name || e.id,
        description: e.description || undefined,
        scope: e.scope ? e.scope.split(",").map((t) => t.trim()).filter(Boolean) : [],
        schedule: {
          time: e.scheduleTime || "09:00",
          timezone: e.scheduleTimezone || "America/New_York",
          postsPerDay: parseInt(e.postsPerDay) || 1,
          reelsPerWeek: 0,
        },
        instagram: {
          igUserId: e.igUserId || undefined,
          pageId: e.igPageId || undefined,
          accessToken: e.igAccessToken || undefined,
        },
        cooldownDays: parseInt(e.cooldownDays) || 30,
        enabled: e.enabled,
      };
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save account");
      setEditingAccount(null);
      await fetchAccounts();
      onAccountsChanged?.();
    } catch {
      // handled by shell
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error("Failed to update account");
      await fetchAccounts();
    } catch {
      // non-fatal
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete account");
      await fetchAccounts();
      onAccountsChanged?.();
    } catch {
      // non-fatal
    }
  };

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-500 mb-6">
        Manage your Instagram accounts. Each account has its own schedule,
        Instagram auth, and isolated publish queue.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">Accounts</h3>
          <button
            onClick={() => {
              setCreateForm({ id: "", name: "", igUserId: "", igAccessToken: "", igPageId: "" });
              setShowCreateModal(true);
            }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            + Create Account
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-10 text-gray-400">No accounts yet. Create your first one above.</div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">{a.name}</h4>
                  <p className="text-xs text-gray-400">ID: {a.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(a.id, !a.enabled)}
                    className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                      a.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {a.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => openEditor(a)}
                    className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                {a.cooldownDays && <span>Cooldown: {a.cooldownDays}d</span>}
                {(a as any).schedule?.time && <span>Schedule: {(a as any).schedule.time}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateAccountModal
          form={createForm}
          onChange={setCreateForm}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
        />
      )}

      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onChange={setEditingAccount}
          onClose={() => setEditingAccount(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
