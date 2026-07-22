"use client";

import { useCallback, useEffect, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type {
  ApiTokenRecord,
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
  const toast = useToast();
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
  const [tokens, setTokens] = useState<ApiTokenRecord[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [minted, setMinted] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const canManage = myRole === "owner" || myRole === "admin";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      // clipboard blocked — ignore
    }
  }

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ name: string; token: string }>("/api/tokens", {
        method: "POST",
        body: { name: tokenName.trim() },
      });
      setMinted({ name: data.name, token: data.token });
      setTokenName("");
      await loadTokens();
      toast.success("Access token created");
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't create the token.");
      setError(message);
      toast.error("Couldn't create token", { description: message });
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/tokens/${id}`, { method: "DELETE" });
      await loadTokens();
      toast.success("Token revoked");
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't revoke the token.");
      setError(message);
      toast.error("Couldn't revoke token", { description: message });
    } finally {
      setBusy(false);
    }
  }

  const loadTokens = useCallback(async () => {
    const data = await apiFetch<{ tokens: ApiTokenRecord[] }>("/api/tokens");
    setTokens(data.tokens);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgsData, membersData] = await Promise.all([
        apiFetch<{ organizations: OrganizationRecord[]; activeOrgId: string | null }>("/api/orgs"),
        apiFetch<{ members: MemberRecord[]; invites: PendingInviteRecord[]; role: OrgRole }>("/api/orgs/members"),
        loadTokens(),
      ]);
      setOrgs(orgsData.organizations);
      setActiveOrgId(orgsData.activeOrgId);
      setMembers(membersData.members);
      setInvites(membersData.invites);
      setMyRole(membersData.role);
    } finally {
      setLoading(false);
    }
  }, [loadTokens]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Switching or creating a workspace changes every record on screen, so reload.
  async function switchTo(orgId: string) {
    if (orgId === activeOrgId) return;
    setBusy(true);
    try {
      await apiFetch("/api/orgs/switch", { method: "POST", body: { orgId } });
      toast.success("Workspace switched");
      window.location.reload();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't switch workspace.");
      setError(message);
      toast.error("Couldn't switch workspace", { description: message });
      setBusy(false);
    }
  }

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/api/orgs", { method: "POST", body: { name: newOrgName.trim() } });
      toast.success("Workspace created");
      window.location.reload();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't create the workspace.");
      setError(message);
      toast.error("Couldn't create workspace", { description: message });
      setBusy(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await apiFetch<{ status?: string }>("/api/orgs/members", {
        method: "POST",
        body: { email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail("");
      const notice =
        data.status === "added"
          ? "Added to the workspace."
          : data.status === "already_member"
            ? "They're already a member."
            : "Invite sent — they'll join when they sign up.";
      setNotice(notice);
      toast.success(notice);
      await load();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't send invite.");
      setError(message);
      toast.error("Couldn't send invite", { description: message });
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/orgs/members/${userId}`, { method: "DELETE" });
      toast.success("Member removed");
      await load();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't remove member.");
      setError(message);
      toast.error("Couldn't remove member", { description: message });
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, role: OrgRole) {
    setBusy(true);
    try {
      await apiFetch(`/api/orgs/members/${userId}`, {
        method: "PATCH",
        body: { role },
      });
      toast.success(`Role changed to ${ROLE_LABEL[role]}`);
      await load();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't change role.");
      setError(message);
      toast.error("Couldn't change role", { description: message });
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvite(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/orgs/invites/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't cancel invite.");
      setError(message);
      toast.error("Couldn't cancel invite", { description: message });
    } finally {
      setBusy(false);
    }
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

          {/* Maps & GIS — read-only GeoJSON export for QGIS etc. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Maps &amp; GIS (QGIS)
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              Load this workspace&apos;s map as a live GeoJSON layer in QGIS or any GIS
              tool. In QGIS: <span className="font-medium">Layer → Add Layer → Add Vector
              Layer → Protocol: HTTP(S)</span>, paste a URL below, and add the header{" "}
              <code className="rounded bg-stone-100 px-1">Authorization: Bearer …</code> with
              an access token (or append <code className="rounded bg-stone-100 px-1">?token=…</code>).
            </p>

            <div className="mt-2 space-y-1.5">
              {[
                { label: "Locations", path: "/api/export/locations.geojson" },
                { label: "Paddocks", path: "/api/export/paddocks.geojson" },
              ].map((row) => {
                const url = `${origin}${row.path}`;
                return (
                  <div
                    key={row.path}
                    className="flex items-center gap-2 rounded-xl border border-stone-100 px-3 py-2"
                  >
                    <span className="w-16 shrink-0 text-xs font-medium text-stone-600">
                      {row.label}
                    </span>
                    <code className="min-w-0 flex-1 truncate text-xs text-stone-500">{url}</code>
                    <button
                      type="button"
                      onClick={() => copy(url, row.path)}
                      aria-label={`Copy ${row.label} URL`}
                      className="shrink-0 rounded-lg p-1 text-stone-400 active:text-emerald-600"
                    >
                      <Icon name={copied === row.path ? "check" : "copy"} size={15} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Just-minted token — shown once. */}
            {minted && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-medium text-emerald-900">
                  Token “{minted.name}” created — copy it now, you won&apos;t see it again.
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-xs text-stone-700">
                    {minted.token}
                  </code>
                  <Button size="sm" onClick={() => copy(minted.token, "minted")}>
                    {copied === "minted" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}

            {/* Existing tokens */}
            {tokens.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {tokens.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-xl border border-stone-100 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-stone-700">{t.name}</span>
                      <span className="block text-xs text-stone-400">
                        {t.prefix}… ·{" "}
                        {t.lastUsedAt
                          ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                          : "never used"}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Revoke ${t.name}`}
                      disabled={busy}
                      onClick={() => revokeToken(t.id)}
                      className="shrink-0 rounded-lg p-1 text-stone-400 active:text-red-600"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={createToken} className="mt-3 flex gap-2">
              <Input
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="Token name (e.g. QGIS laptop)"
                className="flex-1"
              />
              <Button type="submit" leftIcon="plus" loading={busy} disabled={!tokenName.trim()}>
                Create
              </Button>
            </form>
          </section>
        </div>
      )}
    </BottomSheet>
  );
}
