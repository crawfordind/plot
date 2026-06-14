"use client";

import Icon, { type IconName } from "@/components/ui/Icon";
import Tooltip from "@/components/ui/Tooltip";

type MapFabClusterProps = {
  hasPlots: boolean;
  locating: boolean;
  dropMode: boolean;
  onFitToData: () => void;
  onCenterGps: () => void;
  // The two "primary" actions live one component up (they open overlays). When a
  // handler is omitted that button isn't rendered.
  onCapturePhoto?: () => void;
  onAskExpert?: () => void;
  // Hide the primary actions while an overlay is open or the map is being
  // manipulated, so they don't float over a sheet or a drag.
  actionsHidden?: boolean;
};

const PRIMARY_FAB =
  "focus-ring pointer-events-auto touch-target flex items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg active:scale-95 active:bg-emerald-700";
const UTILITY_FAB =
  "focus-ring pointer-events-auto touch-target flex items-center justify-center rounded-full border border-white/80 bg-white/95 text-stone-600 shadow-lg backdrop-blur active:scale-95";

function Fab({
  label,
  icon,
  onClick,
  primary,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <Tooltip text={label} side="left">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={primary ? PRIMARY_FAB : UTILITY_FAB}
      >
        <Icon name={icon} size={20} />
      </button>
    </Tooltip>
  );
}

// Every floating map action in ONE bottom-right column. Because they share a
// single flex container (gap-controlled), the buttons can never overlap each
// other no matter which are visible.
export default function MapFabCluster({
  hasPlots,
  locating,
  dropMode,
  onFitToData,
  onCenterGps,
  onCapturePhoto,
  onAskExpert,
  actionsHidden,
}: MapFabClusterProps) {
  return (
    <div className="pointer-events-none absolute bottom-20 right-3 z-20 flex flex-col items-end gap-2">
      {!actionsHidden && onAskExpert && (
        <Fab label="Ask a farm expert" icon="chat" onClick={onAskExpert} primary />
      )}
      {!actionsHidden && onCapturePhoto && (
        <Fab label="Take a farm photo" icon="camera" onClick={onCapturePhoto} primary />
      )}
      {hasPlots && (
        <Fab label="Show all my plots" icon="frame" onClick={onFitToData} />
      )}
      <Tooltip text="Center on my location" side="left">
        <button
          type="button"
          onClick={onCenterGps}
          aria-label="Center on my location"
          className={UTILITY_FAB}
        >
          {locating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />
          ) : (
            <Icon name="gps" size={20} />
          )}
        </button>
      </Tooltip>
      {dropMode && (
        <div className="pointer-events-none flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
          <Icon name="mapPin" size={14} />
          Tap map to drop a pin
        </div>
      )}
    </div>
  );
}
