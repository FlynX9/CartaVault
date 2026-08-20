interface PanelAttachmentIconProps {
  mode: "attach" | "detach";
  size?: number;
  className?: string;
}

export function PanelAttachmentIcon({ mode, size = 18, className }: PanelAttachmentIconProps) {
  const attaching = mode === "attach";

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-panel-attachment-icon={mode}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M4 4v16" />
      <rect x={attaching ? 14 : 6} y="6" width="6" height="12" rx="1.5" />
      {attaching ? (
        <>
          <path d="M12 12H7" />
          <path d="m9 10-2 2 2 2" />
        </>
      ) : (
        <>
          <path d="M14 12h6" />
          <path d="m18 10 2 2-2 2" />
        </>
      )}
    </svg>
  );
}
