import { IconMagnet, IconMagnetOff } from "@tabler/icons-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useContext } from "react";

import { FloatingPanelWindowContext } from "./FloatingPanelWindow";

interface PanelWindowControlsProps {
  showCollapse?: boolean;
}

export function PanelWindowControls({ showCollapse = true }: PanelWindowControlsProps) {
  const panel = useContext(FloatingPanelWindowContext);
  if (!panel?.desktop || !panel.dockable) return null;
  const collapsed = panel.mode === "collapsed";
  const floating = panel.mode === "floating";
  const attachmentLabel = floating ? "Attacher le panneau" : "Détacher le panneau";

  return (
    <div className="panel-window-controls" data-panel-no-drag>
      {!collapsed && (
        <button className="panel-icon-button panel-window-mode-toggle" type="button" aria-label={attachmentLabel} title={attachmentLabel} onClick={floating ? panel.dock : panel.detach}>
          {floating
            ? <IconMagnet size={18} aria-hidden="true" data-panel-attachment-icon="attach" />
            : <IconMagnetOff size={18} aria-hidden="true" data-panel-attachment-icon="detach" />}
        </button>
      )}
      {showCollapse && (
        <button className="panel-icon-button panel-window-collapse-toggle" type="button" aria-label={collapsed ? "Déployer le panneau" : "Réduire le panneau"} title={collapsed ? "Déployer le panneau" : "Réduire le panneau"} aria-expanded={!collapsed} onClick={collapsed ? panel.expand : panel.collapse}>
          {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronLeft size={18} aria-hidden="true" />}
        </button>
      )}
    </div>
  )
}
