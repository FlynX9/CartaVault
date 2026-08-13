import { Lock, LockOpen } from "lucide-react";
import { useContext } from "react";

import { FloatingPanelWindowContext } from "./FloatingPanelWindow";

export function PanelLayoutLockButton() {
  const floatingWindow = useContext(FloatingPanelWindowContext);
  if (!floatingWindow) return null;

  const label = floatingWindow.locked ? "Déverrouiller la disposition du panneau" : "Verrouiller la disposition du panneau";

  return (
    <button className={`panel-icon-button desktop-panel-layout-reset${floatingWindow.locked ? " is-locked" : ""}`} type="button" aria-label={label} title={label} aria-pressed={floatingWindow.locked} onClick={floatingWindow.toggleLock}>
      {floatingWindow.locked ? <Lock size={18} aria-hidden="true" /> : <LockOpen size={18} aria-hidden="true" />}
    </button>
  );
}
