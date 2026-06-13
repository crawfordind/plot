"use client";

import { useState } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import Tooltip from "@/components/ui/Tooltip";

type MobileHeaderProps = {
  userName: string | null;
  dropMode: boolean;
  onToggleDropMode: () => void;
  onOpenRecords: () => void;
  onOpenBuilder: () => void;
  onOpenGrazing: () => void;
  onDrawPaddock: () => void;
  onOpenWorkspace: () => void;
  onHelp: () => void;
  onLogout: () => void;
};

function HeaderAction({
  icon,
  label,
  tooltip,
  active,
  tour,
  onClick,
}: {
  icon: IconName;
  label: string;
  tooltip: string;
  active?: boolean;
  tour?: string;
  onClick: () => void;
}) {
  return (
    <Tooltip text={tooltip} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        data-tour={tour}
        className={`focus-ring flex min-w-[52px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors ${
          active
            ? "bg-emerald-600 text-white"
            : "text-stone-600 active:bg-stone-100"
        }`}
      >
        <Icon name={icon} size={22} />
        <span className="text-[10px] font-semibold">{label}</span>
      </button>
    </Tooltip>
  );
}

function MenuRow({
  icon,
  label,
  description,
  onClick,
  tone = "default",
}: {
  icon: IconName;
  label: string;
  description: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          tone === "danger" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
        }`}
      >
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0">
        <span
          className={`block text-sm font-semibold ${
            tone === "danger" ? "text-red-600" : "text-stone-800"
          }`}
        >
          {label}
        </span>
        <span className="block truncate text-xs text-stone-500">{description}</span>
      </span>
    </button>
  );
}

export default function MobileHeader({
  userName,
  dropMode,
  onToggleDropMode,
  onOpenRecords,
  onOpenBuilder,
  onOpenGrazing,
  onDrawPaddock,
  onOpenWorkspace,
  onHelp,
  onLogout,
}: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="z-20 flex shrink-0 items-center justify-between gap-2 border-b border-emerald-100 bg-white/95 px-safe pt-safe backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-2 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <Icon name="leaf" size={18} />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-tight tracking-tight text-emerald-900">
            Plot
          </h1>
          {userName && (
            <p className="truncate text-[11px] leading-tight text-stone-500">{userName}</p>
          )}
        </div>
      </div>

      <nav className="flex items-center gap-0.5 py-1.5">
        <HeaderAction
          icon="layers"
          label="Build"
          tooltip="Map your farm from a description"
          tour="build"
          onClick={onOpenBuilder}
        />
        <HeaderAction
          icon="mapPin"
          label="Pin"
          tooltip="Drop a spot on the map"
          tour="pin"
          active={dropMode}
          onClick={onToggleDropMode}
        />
        <HeaderAction
          icon="list"
          label="Records"
          tooltip="Browse everything you've logged"
          onClick={onOpenRecords}
        />
        <HeaderAction
          icon="menu"
          label="More"
          tooltip="Grazing, drawing & help"
          tour="more"
          onClick={() => setMenuOpen((v) => !v)}
        />
      </nav>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-3 top-[calc(var(--safe-top)+3.25rem)] z-40 w-72 overflow-hidden rounded-2xl border border-stone-100 bg-white py-1 shadow-xl scale-in">
            <MenuRow
              icon="herd"
              label="Grazing"
              description="Herds, paddocks & NRCS records"
              onClick={() => {
                setMenuOpen(false);
                onOpenGrazing();
              }}
            />
            <MenuRow
              icon="penDraw"
              label="Draw a paddock"
              description="Trace a paddock onto the map"
              onClick={() => {
                setMenuOpen(false);
                onDrawPaddock();
              }}
            />
            <MenuRow
              icon="help"
              label="How Plot works"
              description="Replay the quick tour"
              onClick={() => {
                setMenuOpen(false);
                onHelp();
              }}
            />
            <div className="my-1 border-t border-stone-100" />
            <MenuRow
              icon="users"
              label="Team & workspace"
              description="Switch farm, invite people, manage roles"
              onClick={() => {
                setMenuOpen(false);
                onOpenWorkspace();
              }}
            />
            <div className="my-1 border-t border-stone-100" />
            <MenuRow
              icon="signOut"
              label="Sign out"
              description={userName ?? "End your session"}
              tone="danger"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
            />
          </div>
        </>
      )}
    </header>
  );
}
