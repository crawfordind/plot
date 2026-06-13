"use client";

import type {
  AttachmentAnalysisStatus,
  PhotoInsightRecord,
} from "@/lib/types";

export const SUBJECT_LABEL: Record<string, string> = {
  crop: "Crop",
  soil: "Soil",
  pest_disease: "Pest / disease",
  weed: "Weed",
  livestock: "Livestock",
  equipment: "Equipment",
  infrastructure: "Infrastructure",
  water: "Water",
  landscape: "Landscape",
  other: "Other",
};

type Geo = {
  lat: number | null;
  lng: number | null;
  heading: number | null;
  placeLabel: string | null;
};

// Shared presentation of one photo's AI read — used in the asset attachments
// panel and the global capture sheet. Always shows *some* state (analyzing,
// failed + retry, or the result) so a read is never silent.
export default function PhotoInsightView({
  insight,
  status,
  analyzing,
  error,
  geo,
  onRetry,
}: {
  insight: PhotoInsightRecord | null;
  status: AttachmentAnalysisStatus;
  analyzing: boolean;
  error?: string | null;
  geo?: Geo;
  onRetry?: () => void;
}) {
  const obs = insight?.observations;
  const showAnalyzing = analyzing || status === "processing" || status === "pending";
  const showFailed = !analyzing && status === "failed";

  const geoBits: string[] = [];
  if (geo && geo.lat !== null && geo.lng !== null) {
    geoBits.push(`${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`);
  }
  if (geo && geo.heading !== null) geoBits.push(`facing ${Math.round(geo.heading)}°`);

  return (
    <div className="text-sm">
      {/* Status / subject row — always present */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {insight && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              {SUBJECT_LABEL[insight.subjectType] ?? insight.subjectType}
            </span>
          )}
          {showAnalyzing && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Analyzing photo…
            </span>
          )}
          {showFailed && (
            <span className="text-xs font-medium text-red-600">
              Analysis {error ? "failed" : "unavailable"}
            </span>
          )}
        </div>
        {showFailed && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-medium text-stone-600 active:bg-stone-100"
          >
            Retry
          </button>
        )}
      </div>

      {showFailed && error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}

      {geoBits.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">📍 {geoBits.join(" · ")}</p>
      )}
      {geo?.placeLabel && (
        <p className="mt-0.5 text-xs text-stone-400">{geo.placeLabel}</p>
      )}

      {insight ? (
        <>
          {insight.summary && (
            <p className="mt-2 text-stone-700">{insight.summary}</p>
          )}

          {insight.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {insight.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] text-stone-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {obs && (
            <dl className="mt-2 space-y-1 text-xs text-stone-600">
              <Field label="Health" value={obs.healthAssessment} />
              <Field label="Growth stage" value={obs.growthStage} />
              <Field label="Soil" value={obs.soilCondition} />
              <Field label="Pests / disease" value={obs.pestsOrDisease} />
              <Field label="Weeds" value={obs.weeds} />
              <Field label="Position notes" value={obs.gridNotes} />
            </dl>
          )}

          {obs && obs.recommendations.length > 0 && (
            <ListBlock label="Recommendations" items={obs.recommendations} />
          )}
          {obs && obs.concerns.length > 0 && (
            <ListBlock label="Watch for" items={obs.concerns} />
          )}
        </>
      ) : (
        !showAnalyzing &&
        !showFailed && (
          <p className="mt-2 text-xs text-stone-400">No analysis yet.</p>
        )
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-medium text-stone-500">{label}:</dt>
      <dd className="text-stone-600">{value}</dd>
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <ul className="mt-0.5 list-disc pl-4 text-xs text-stone-600">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
