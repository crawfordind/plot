"use client";

import { useCallback, useEffect, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { Input } from "@/components/ui/Field";
import type {
  MemberRecord,
  OrganizationRecord,
  OrgRole,
  PendingInviteRecord,
} from "@/lib/types";

type WorkspacePanelProps = {
  onClose: () => void;
};

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export default function WorkspacePanel({ onClose }: WorkspacePanelProps) {
  const [orgs, setOrgs] = useState<OrganizationRecord[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [invites, setInvites] = useState<PendingInviteRecord[]>([]);
  const [myRole, setMyRole] = useState<OrgRole>("member");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  const canManage = myRole === "owner" || myRole === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgsRes, membersRes] = await Promise.all([
        fetch("/api/orgs"),
        fetch("/api/orgs/members"),
      ]);
      if (orgsRes.ok) {
        const d = await orgsRes.json();
        setOrgs(d.organizations);
        setActiveOrgId(d.activeOrgId);
      }
      if (membersRes.ok) {
        const d = await membersRes.json();
        setMembers(d.members);
        setInvites(d.invites);
        setMyRole(d.role);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Switching or creating a workspace changes every record on screen, so reload.
  async function switchTo(orgId: string) {
    if (orgId === activeOrgId) return;
    setBusy(true);
    const res = await fetch("/api/orgs/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
    });
    if (res.ok) window.location.reload();
    else setBusy(false);
  }

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setBusy(true);
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newOrgName.trim() }),
    });
    if (res.ok) window.location.reload();
    else {
      setBusy(false);
      setError("Couldn't create the workspace.");
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/orgs/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't invite");
      setInviteEmail("");
      setNotice(
        data.status === "added"
          ? "Added to the workspace."
          : data.status === "already_member"
            ? "They're already a member."
            : "Invite sent — they'll join when they sign up.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't invite");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    setBusy(true);
    const res = await fetch(`/api/orgs/members/${userId}`, { method: "DELETE" });
    if (res.ok) await load();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't remove member");
    }
    setBusy(false);
  }

  async function changeRole(userId: string, role: OrgRole) {
    setBusy(true);
    const res = await fetch(`/api/orgs/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) await load();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't change role");
    }
    setBusy(false);
  }

  async function cancelInvite(id: string) {
    setBusy(true);
    await fetch(`/api/orgs/invites/${id}`, { method: "DELETE" });
    await load();
    setBusy(false);
  }

  return (
    <BottomSheet open onClose={onClose} title="Team & workspace">
      {loading ? (
        <p className="py-4 text-sm text-stone-400">Loading…</p>
      ) : (
        <div className="space-y-5">
          {/* Workspace switcher */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Your workspaces
            </h3>
            <ul className="mt-2 space-y-1.5">
              {orgs.map((o) => {
                const active = o.id === activeOrgId;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => switchTo(o.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${
                        active
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-stone-200 bg-white active:bg-stone-50"
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Icon name="leaf" size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-stone-800">
                          {o.name}
                        </span>
                        <span className="block text-xs text-stone-500">
                          {ROLE_LABEL[o.role]}
                        </span>
                      </span>
                      {active ? (
                        <Icon name="check" size={18} />
                      ) : (
                        <span className="text-xs font-medium text-emerald-700">Switch</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {creating ? (
              <form onSubmit={createWorkspace} className="mt-2 flex gap-2">
                <Input
                  autoFocus
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="New workspace name"
                  className="flex-1"
                />
                <Button type="submit" loading={busy} disabled={!newOrgName.trim()}>
                  Create
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-700 active:text-emerald-900"
              >
                <Icon name="plus" size={16} /> New workspace
              </button>
            )}
          </section>

          {/* Members */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Members ({members.length})
            </h3>
            <ul className="mt-2 space-y-1.5">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center gap-2 rounded-xl border border-stone-100 px-3 py-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold uppercase text-stone-500">
                    {(m.name ?? m.email).slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-800">
                      {m.name ?? m.email}
                      {m.isYou && <span className="text-stone-400"> (you)</span>}
                    </span>
                    <span className="block truncate text-xs text-stone-500">{m.email}</span>
                  </span>
                  {myRole === "owner" && !m.isYou ? (
                    <select
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => changeRole(m.userId, e.target.value as OrgRole)}
                      className="rounded-lg border border-stone-200 px-1.5 py-1 text-xs"
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                      {ROLE_LABEL[m.role]}
                    </span>
                  )}
                  {canManage && !m.isYou && (
                    <button
                      type="button"
                      aria-label={`Remove ${m.email}`}
                      disabled={busy}
                      onClick={() => removeMember(m.userId)}
                      className="shrink-0 rounded-lg p-1 text-stone-400 active:text-red-600"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {invites.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {invites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center gap-2 rounded-xl border border-dashed border-stone-200 px-3 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                      <Icon name="clock" size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-stone-700">{inv.email}</span>
                      <span className="block text-xs text-stone-400">
                        Invited · {ROLE_LABEL[inv.role]} · pending
                      </span>
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        aria-label={`Cancel invite for ${inv.email}`}
                        disabled={busy}
                        onClick={() => cancelInvite(inv.id)}
                        className="shrink-0 rounded-lg p-1 text-stone-400 active:text-red-600"
                      >
                        <Icon name="x" size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canManage && (
              <form onSubmit={invite} className="mt-3 space-y-2">
                <p className="text-xs font-medium text-stone-600">Invite a teammate</p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@email.com"
                    className="flex-1"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                    className="rounded-xl border border-stone-200 px-2 text-sm"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <Button
                  type="submit"
                  fullWidth
                  leftIcon="plus"
                  loading={busy}
                  disabled={!inviteEmail.trim()}
                >
                  Send invite
                </Button>
              </form>
            )}

            {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </section>
        </div>
      )}
    </BottomSheet>
  );
}
