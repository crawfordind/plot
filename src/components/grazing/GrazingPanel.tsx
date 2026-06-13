"use client";

import { useState } from "react";
import GrazingAdvisor from "@/components/grazing/GrazingAdvisor";
import GrazingRecords from "@/components/grazing/GrazingRecords";
import HerdManager from "@/components/grazing/HerdManager";
import MoveCapture from "@/components/grazing/MoveCapture";
import PlanWizard from "@/components/grazing/PlanWizard";
import BottomSheet from "@/components/ui/BottomSheet";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { GrazingSnapshot } from "@/lib/grazing/status";
import type {
  GrazingEventRecord,
  HerdRecord,
  LocationRecord,
  PaddockRecord,
} from "@/lib/types";

type Tab = "advisor" | "move" | "herds" | "plan" | "records";

const TABS: { id: Tab; label: string }[] = [
  { id: "advisor", label: "Advisor" },
  { id: "move", label: "Move" },
  { id: "herds", label: "Herds" },
  { id: "plan", label: "Plan" },
  { id: "records", label: "Records" },
];

const TAB_CONTEXT: Record<Tab, string> = {
  advisor: "Your next move, rest tracking, and overgrazing warnings.",
  move: "Move a herd between paddocks — type it or drag a herd chip.",
  herds: "The livestock groups you rotate.",
  plan: "Size paddocks to your herd with the NRCS forage balance.",
  records: "Your NRCS 528 recordkeeping worksheet — export or print.",
};

type GrazingPanelProps = {
  locations: LocationRecord[];
  herds: HerdRecord[];
  paddockConfigs: PaddockRecord[];
  grazingEvents: GrazingEventRecord[];
  snapshot: GrazingSnapshot | null;
  hidden?: boolean;
  onChanged: () => void;
  onClose: () => void;
};

export default function GrazingPanel(props: GrazingPanelProps) {
  const [tab, setTab] = useState<Tab>("advisor");
  const hasHerds = props.herds.length > 0;
  const paddockCount = props.locations.filter((l) => l.type === "paddock").length;

  return (
    <BottomSheet
      open
      onClose={props.onClose}
      fullScreen
      hidden={props.hidden}
      title="Grazing"
      subtitle={`${props.herds.length} herd${props.herds.length === 1 ? "" : "s"} · ${paddockCount} paddock${paddockCount === 1 ? "" : "s"}`}
    >
      <div className="-mt-1 mb-2">
        <SegmentedControl
          options={TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="Grazing sections"
        />
      </div>
      <p className="mb-3 text-xs text-stone-500">{TAB_CONTEXT[tab]}</p>

      {tab === "advisor" && (
        <GrazingAdvisor
          snapshot={props.snapshot}
          paddockConfigs={props.paddockConfigs}
          onChanged={props.onChanged}
          onGoToPlan={() => setTab("plan")}
          onGoToMove={() => setTab("move")}
        />
      )}

      {tab === "move" && (
        <MoveCapture
          herds={props.herds}
          locations={props.locations}
          snapshot={props.snapshot}
          onMoved={props.onChanged}
          onNeedSetup={() => setTab(hasHerds ? "plan" : "herds")}
        />
      )}

      {tab === "herds" && (
        <HerdManager herds={props.herds} onChanged={props.onChanged} />
      )}

      {tab === "plan" && (
        <PlanWizard
          locations={props.locations}
          onChanged={props.onChanged}
        />
      )}

      {tab === "records" && (
        <GrazingRecords
          herds={props.herds}
          locations={props.locations}
          grazingEvents={props.grazingEvents}
          onChanged={props.onChanged}
        />
      )}
    </BottomSheet>
  );
}
