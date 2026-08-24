import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useModalFocus } from "../../hooks/useModalFocus";

interface OrganizationDialogProps {
  label: string;
  children: ReactNode;
  onClose: () => void;
}

export function OrganizationDialog({ label, children, onClose }: OrganizationDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useModalFocus({ dialogRef, onEscape: onClose });

  return createPortal(
    <div className="cv-overlay organization-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="cv-modal organization-dialog" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>,
    document.body,
  );
}
