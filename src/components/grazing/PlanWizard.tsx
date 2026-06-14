"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { Input, Select, Textarea } from "@/components/ui/Field";
import HelpTip from "@/components/ui/HelpTip";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type { BalanceResult } from "@/lib/grazing/balance";
import type { LocationRecord } from "@/lib/types";

type PlanResponse = {
  balance?: BalanceResult;
  restTargetDays?: number | null;
  forage?: string | null;
  clarifyingQuestion?: string | null;
};

type PlanWizardProps = {
  locations: LocationRecord[];
  onChanged: () => void;
};

const examples = [
  "6 acres of cool-season grass, 60 sheep about 60 lb, 30-day rest, 2 days per paddock",
  "12 acres, 25 cows at 1100 lb, want a 45 day recovery",
];

export default function PlanWizard({ locations, onChanged }: PlanWizardProps) {
  const toast = useToast();
  const fields = locations.filter((l) => l.type === "field");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);

  // Subdivide state
  const [fieldId, setFieldId] = useState("");
  const [count, setCount] = useState("");
  const [subdividing, setSubdividing] = useState(false);
  const [subMsg, setSubMsg] = useState<string | null>(null);

  async function handlePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch<PlanResponse>("/api/grazing/plan", {
        method: "POST",
        body: { rawText: text.trim() },
      });
      setResult(data);
      // Seed the subdivide count from the recommended paddock count.
      if (data.balance) {
        const target = data.restTargetDays
          ? data.balance.restScenarios.find(
              (s: BalanceResult["restScenarios"][number]) =>
                s.restDays === data.restTargetDays,
            )
          : null;
        const rec = target?.minPaddocks ?? data.balance.restScenarios[1]?.minPaddocks;
        if (rec) setCount(String(rec));
      }
    } catch (err) {
      const message = getErrorMessage(err, "Could not build a plan.");
      setError(message);
      toast.error("Couldn't calculate forage balance", { description: message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubdivide() {
    if (!fieldId || !count) return;
    setSubdividing(true);
    setSubMsg(null);
    setError(null);
    try {
      const data = await apiFetch<{ count?: number }>("/api/grazing/paddocks/subdivide", {
        method: "POST",
        body: {
          fieldId,
          count: Number(count),
          restTargetDays: result?.restTargetDays ?? undefined,
          primaryForage: result?.forage ?? undefined,
        },
      });
      const created = data.count ?? Number(count);
      setSubMsg(`Created ${created} paddocks on the map.`);
      toast.success(`${created} paddocks added to the map`);
      onChanged();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't subdivide the field.");
      setError(message);
      toast.error("Couldn't subdivide field", { description: message });
    } finally {
      setSubdividing(false);
    }
  }

  const b = result?.balance;

  return (
    <div className="space-y-4">
      <form onSubmit={handlePlan} className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Describe your grazing: acres, forage, livestock, target rest…"
        />
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="focus-ring rounded-full border border-stone-200 px-3 py-1.5 text-left text-xs text-stone-600 active:bg-emerald-50"
            >
              {ex}
            </button>
          ))}
        </div>
        <Button
          type="submit"
          size="lg"
          fullWidth
          leftIcon="sparkle"
          loading={loading}
          disabled={loading || !text.trim()}
        >
          Calculate forage balance
        </Button>
      </form>

      {result?.clarifyingQuestion && !b && (
        <Callout tone="warn">{result.clarifyingQuestion}</Callout>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {b && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Animal units"
              value={b.animalUnits.toFixed(1)}
              help="One animal unit = 1,000 lb of live body weight. Your herd's total weight ÷ 1,000."
            />
            <Stat
              label="Stocking rate"
              value={`${b.stockingRate.toFixed(1)} AU/ac`}
              help="Animal units per grazable acre — how densely the land is stocked."
            />
            <Stat
              label="Forage supply"
              value={`${b.forageSupplyTons.toFixed(1)} t`}
              help="Estimated dry-matter the pasture grows in a season that stock can actually harvest."
            />
            <Stat
              label="Forage demand"
              value={`${b.annualDemandTons.toFixed(1)} t`}
              help="Dry-matter your herd eats over the grazing season."
            />
            <Stat
              label="Balance"
              value={`${b.balanceTons >= 0 ? "+" : ""}${b.balanceTons.toFixed(1)} t`}
              tone={b.balanceTons >= 0 ? "good" : "bad"}
              help="Supply minus demand. Negative means you need more acres, fewer animals, or supplemental feed."
            />
            <Stat
              label="Paddock size"
              value={`${b.paddockSizeAcres.toFixed(2)} ac`}
              help="Acres each paddock needs so a move gives the herd one rotation's worth of forage."
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Paddocks needed for a {b.grazeDaysPerPaddock}-day graze
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-400">
                  <th className="py-1 font-medium">Rest</th>
                  <th className="py-1 font-medium">Paddocks</th>
                  <th className="py-1 font-medium">Acres</th>
                </tr>
              </thead>
              <tbody>
                {b.restScenarios.map((s) => {
                  const highlight = s.restDays === result?.restTargetDays;
                  return (
                    <tr
                      key={s.restDays}
                      className={
                        highlight
                          ? "rounded bg-emerald-50 font-semibold text-emerald-900"
                          : "text-stone-700"
                      }
                    >
                      <td className="py-1.5">{s.restDays} days</td>
                      <td className="py-1.5">{s.minPaddocks}</td>
                      <td className="py-1.5">{s.minAcres.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-stone-400">
              Based on {b.acres} grazable acres. Balance is forage supply minus herd demand
              over the season.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
            <p className="text-sm font-semibold text-emerald-900">
              Lay paddocks on the map
            </p>
            {fields.length === 0 ? (
              <p className="mt-1 text-sm text-stone-600">
                Draw a field first (Build a farm), then come back to subdivide it.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Select value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
                    <option value="">Choose field…</option>
                    {fields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    placeholder="# paddocks"
                  />
                </div>
                <Button
                  fullWidth
                  leftIcon="paddock"
                  loading={subdividing}
                  disabled={subdividing || !fieldId || !count}
                  onClick={handleSubdivide}
                >
                  Subdivide into {count || "N"} paddocks
                </Button>
                {subMsg && (
                  <p className="text-sm font-medium text-emerald-700">{subMsg}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  help,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  help?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-100 bg-white px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-stone-400">
        {label}
        {help && <HelpTip text={help} />}
      </p>
      <p
        className={`text-base font-semibold ${
          tone === "good"
            ? "text-emerald-700"
            : tone === "bad"
              ? "text-red-600"
              : "text-stone-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
