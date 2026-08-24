import { Children, createContext, isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PanelMode = "docked" | "floating" | "collapsed";
export type DockSide = "left" | "right";
export type DockSlot = "full" | "top" | "bottom";
export interface DockPlacement { side: DockSide; column: number; slot: DockSlot }
export interface FloatingPanelGeometry { x: number; y: number; width: number; height: number }
interface PersistedPanelState { mode: PanelMode; floatingGeometry: FloatingPanelGeometry; dockedWidth?: number; dockPlacement?: DockPlacement }

export const PANEL_LAYOUT = { viewportMargin: 12, headerHeight: 56, collapsedWidth: 68, dragThreshold: 6, dockSnapDistance: 52, dockTopThreshold: 0.2, dockBottomThreshold: 0.4, minDockSplitRatio: 0.25, maxDockSplitRatio: 0.75, minimumMapWidth: 200, maxDockColumns: 2, resizeHitZone: 10, dockedGripWidth: 8, dockedGripHeight: 32, dockedResizeGutter: 14, dockedMaxWidthRatio: 0.62 } as const;
const DEFAULT_DOCK_PLACEMENT: DockPlacement = { side: "left", column: 0, slot: "full" };
export const panelStateStorageKey = (storageKey: string) => `${storageKey}:panel-state`;
export const dockSplitStorageKey = (side: DockSide, column: number) => `cartavault:dock-split:${side}:${column}`;
const hasPanelState = (storageKey: string) => { try { return window.localStorage.getItem(panelStateStorageKey(storageKey)) !== null } catch { return false } };
const clampDockSplitRatio = (value: number) => Math.min(PANEL_LAYOUT.maxDockSplitRatio, Math.max(PANEL_LAYOUT.minDockSplitRatio, value));
const readDockSplitRatio = (side: DockSide, column: number) => {
  try {
    const value = Number.parseFloat(window.localStorage.getItem(dockSplitStorageKey(side, column)) ?? "");
    return Number.isFinite(value) ? clampDockSplitRatio(value) : 0.5;
  } catch { return 0.5 }
};
const validMode = (value: unknown): value is PanelMode => value === "docked" || value === "floating" || value === "collapsed";
const validDockSide = (value: unknown): value is DockSide => value === "left" || value === "right";
const validDockSlot = (value: unknown): value is DockSlot => value === "full" || value === "top" || value === "bottom";
function parseDockPlacement(value: unknown): DockPlacement | undefined {
  if (!value || typeof value !== "object") return undefined;
  const placement = value as Partial<DockPlacement>;
  if (!Number.isInteger(placement.column) || Number(placement.column) < 0 || Number(placement.column) >= PANEL_LAYOUT.maxDockColumns || !validDockSlot(placement.slot)) return undefined;
  if (placement.side !== undefined && !validDockSide(placement.side)) return undefined;
  return { side: placement.side ?? "left", column: Number(placement.column), slot: placement.slot };
}
function validGeometry(value: unknown): value is FloatingPanelGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as Partial<FloatingPanelGeometry>;
  return [geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isFinite);
}
export function readPanelState(storageKey: string, fallback: FloatingPanelGeometry, defaultMode: PanelMode): PersistedPanelState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(panelStateStorageKey(storageKey)) ?? "") as Partial<PersistedPanelState>;
    if (validMode(parsed.mode) && validGeometry(parsed.floatingGeometry)) return { mode: parsed.mode, floatingGeometry: parsed.floatingGeometry, dockedWidth: Number.isFinite(parsed.dockedWidth) ? parsed.dockedWidth : undefined, dockPlacement: parseDockPlacement(parsed.dockPlacement) };
    const legacy = JSON.parse(window.localStorage.getItem(storageKey) ?? "");
    if (validGeometry(legacy)) return { mode: defaultMode, floatingGeometry: legacy };
  } catch { /* Invalid storage falls back safely. */ }
  return { mode: defaultMode, floatingGeometry: fallback };
}

export const FloatingPanelWindowContext = createContext<{
  desktop: boolean; dockable: boolean; mode: PanelMode; maximized: boolean;
  dock: () => void; detach: () => void; collapse: () => void; expand: () => void; toggleMaximize: () => void;
} | null>(null);

interface Props {
  kind: "workspace" | "trips" | "timeline" | "detail" | "editor" | "tools" | "legend"; label: string; storageKey: string;
  initialGeometry: FloatingPanelGeometry; minWidth: number; maxWidth?: number; minHeight?: number;
  fitContentSelector?: string; fitContentMaxHeight?: number; fitContentOnce?: boolean; defaultMode?: PanelMode; mode?: PanelMode; dockable?: boolean;
  collapsedWidth?: number; resetVersion: number; active: boolean; hidden?: boolean; layoutLocked?: boolean; onActivate: () => void;
  onModeChange?: (mode: PanelMode) => void; onGeometryCommit?: (geometry: FloatingPanelGeometry) => void; onDockedWidthChange?: (width: number) => void; children: ReactNode;
}
type ResizeEdge = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type Interaction = { pointerId: number; startX: number; startY: number; geometry: FloatingPanelGeometry; mode: "move" | ResizeEdge; started: boolean; dragHandle: HTMLElement | null };
type DockTarget = { placement: DockPlacement; x: number; y: number; width: number; height: number; dockedWidth: number };
const PANEL_DOCK_PLACEMENT_EVENT = "cartavault:panel-dock-placement";
const PANEL_DOCK_WIDTH_EVENT = "cartavault:panel-dock-width";
const PANEL_DOCK_SPLIT_EVENT = "cartavault:panel-dock-split";
const cardinalResizeEdges = new Set<ResizeEdge>(["n", "e", "s", "w"]);
let panelMountSequence = 0;

function DockPreviewOverlay({ target }: { target: DockTarget }) {
  if (typeof document === "undefined") return null;
  const label = `${target.placement.slot === "full" ? "Toute la hauteur" : target.placement.slot === "top" ? "Moitié haute" : "Moitié basse"} · ${target.placement.side === "left" ? "gauche" : "droite"}`;
  return createPortal(
    <div className="cv-panel-dock-preview" data-dock-side={target.placement.side} data-dock-column={target.placement.column} data-dock-slot={target.placement.slot} style={{ left: target.x, top: target.y, width: target.width, height: target.height }} aria-hidden="true">
      <span>{label}</span>
    </div>,
    document.body,
  );
}

function dockPlacementsConflict(first: DockPlacement, second: DockPlacement): boolean {
  if (first.side !== second.side || first.column !== second.column) return false;
  return first.slot === "full" || second.slot === "full" || first.slot === second.slot;
}

function containsTimeline(node: ReactNode): boolean {
  if (!isValidElement(node)) return false;
  const props = node.props as { tripViewOnly?: boolean; children?: ReactNode };
  return props.tripViewOnly === true || Children.toArray(props.children).some(containsTimeline);
}
function clampGeometry(value: FloatingPanelGeometry, owner: HTMLElement, minWidth: number, maxWidth: number, minHeight: number): FloatingPanelGeometry {
  if (!owner.clientWidth || !owner.clientHeight) return value;
  const margin = PANEL_LAYOUT.viewportMargin, availableWidth = Math.max(1, owner.clientWidth - margin * 2), availableHeight = Math.max(1, owner.clientHeight - margin * 2);
  const width = Math.min(availableWidth, Math.max(Math.min(minWidth, availableWidth), Math.min(maxWidth, value.width)));
  const height = Math.min(availableHeight, Math.max(Math.min(minHeight, availableHeight), value.height));
  return { x: Math.min(Math.max(margin, value.x), Math.max(margin, owner.clientWidth - width - margin)), y: Math.min(Math.max(margin, value.y), Math.max(margin, owner.clientHeight - PANEL_LAYOUT.headerHeight - margin)), width, height };
}
function resizeGeometry(start: FloatingPanelGeometry, edge: ResizeEdge, dx: number, dy: number): FloatingPanelGeometry {
  const next = { ...start };
  if (edge.includes("e")) next.width += dx; if (edge.includes("s")) next.height += dy;
  if (edge.includes("w")) { next.x += dx; next.width -= dx; } if (edge.includes("n")) { next.y += dy; next.height -= dy; }
  return next;
}

export function FloatingPanelWindow({ kind, label, storageKey, initialGeometry, minWidth, maxWidth = Infinity, minHeight = 260, fitContentSelector, fitContentMaxHeight = Infinity, fitContentOnce = false, defaultMode = "docked", mode: controlledMode, dockable = true, collapsedWidth = PANEL_LAYOUT.collapsedWidth, resetVersion, active, hidden = false, layoutLocked = false, onActivate, onModeChange, onGeometryCommit, onDockedWidthChange, children }: Props) {
  const frameRef = useRef<HTMLDivElement>(null), interactionRef = useRef<Interaction | null>(null), restoreGeometryRef = useRef<FloatingPanelGeometry | null>(null), resetRef = useRef(resetVersion), splitPointerRef = useRef<number | null>(null), splitKeyRef = useRef<string | null>(null), fitContentCompleteKeyRef = useRef<string | null>(null);
  const mountSequenceRef = useRef(0);
  if (mountSequenceRef.current === 0) mountSequenceRef.current = ++panelMountSequence;
  const hasPersistedStateRef = useRef(typeof window !== "undefined" && hasPanelState(storageKey));
  const initialStateRef = useRef(readPanelState(storageKey, initialGeometry, dockable ? defaultMode : "floating"));
  const [internalMode, setInternalMode] = useState<PanelMode>(dockable ? initialStateRef.current.mode : "floating");
  const mode = dockable ? (controlledMode ?? internalMode) : "floating";
  const modeRef = useRef(mode), geometryRef = useRef(initialStateRef.current.floatingGeometry), dockedWidthRef = useRef(initialStateRef.current.dockedWidth ?? initialGeometry.width);
  const dockPlacementRef = useRef<DockPlacement>(initialStateRef.current.dockPlacement ?? DEFAULT_DOCK_PLACEMENT);
  const [geometry, setGeometry] = useState(geometryRef.current), [dockedWidth, setDockedWidth] = useState(dockedWidthRef.current), [desktop, setDesktop] = useState(() => !window.matchMedia?.("(max-width: 760px)").matches);
  const [dockPlacement, setDockPlacement] = useState(dockPlacementRef.current), [dockPreview, setDockPreview] = useState<DockTarget | null>(null), [maximized, setMaximized] = useState(false), [timelineContent, setTimelineContent] = useState(false);
  const dockPreviewRef = useRef<DockTarget | null>(null);
  const splitRatioRef = useRef(0.5);
  const [splitRatio, setSplitRatio] = useState(0.5), [splitResizing, setSplitResizing] = useState(false);
  const [hoveredResizeEdge, setHoveredResizeEdge] = useState<ResizeEdge | null>(null), [activeResizeEdge, setActiveResizeEdge] = useState<ResizeEdge | null>(null);
  const [dockResizeHost, setDockResizeHost] = useState<HTMLElement | null>(null);
  const [hasStackedDockSibling, setHasStackedDockSibling] = useState(false);
  const effectiveKind = kind === "trips" && (containsTimeline(children) || timelineContent) ? "timeline" : kind;
  const effectiveKey = storageKey;
  const owner = () => frameRef.current?.closest<HTMLElement>(".map-workspace") ?? null;
  useLayoutEffect(() => { setDockResizeHost(owner()) }, [mode, dockPlacement.side, dockPlacement.column, dockPlacement.slot]);
  useEffect(() => {
    const host = owner();
    if (!host || mode !== "docked" || dockPlacement.slot === "full") { setHasStackedDockSibling(false); return }
    const complementarySlot = dockPlacement.slot === "top" ? "bottom" : "top";
    const inspect = () => setHasStackedDockSibling([...host.querySelectorAll<HTMLElement>(":scope > .cv-floating-panel-window.is-docked")].some((panel) => panel !== frameRef.current && panel.dataset.dockSide === dockPlacement.side && Number.parseInt(panel.dataset.dockColumn ?? "0", 10) === dockPlacement.column && panel.dataset.dockSlot === complementarySlot));
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(host, { childList: true, subtree: false, attributes: true, attributeFilter: ["class", "data-dock-side", "data-dock-column", "data-dock-slot"] });
    return () => observer.disconnect();
  }, [mode, dockPlacement]);
  const normalize = (value: FloatingPanelGeometry) => { const host = owner(); return host ? clampGeometry(value, host, minWidth, maxWidth, minHeight) : value };
  const clampDockedWidth = (value: number, placement = dockPlacementRef.current) => {
    const host = owner();
    const hostWidth = host?.clientWidth ?? 1200;
    const occupiedTracks = new Map<string, number>();
    host?.querySelectorAll<HTMLElement>(":scope > .cv-floating-panel-window:is(.is-docked,.is-collapsed)").forEach((panel) => {
      if (panel === frameRef.current) return;
      const side = validDockSide(panel.dataset.dockSide) ? panel.dataset.dockSide : "left";
      const column = Number.parseInt(panel.dataset.dockColumn ?? "0", 10) || 0;
      if (side === placement.side && column === placement.column) return;
      const key = `${side}:${column}`;
      occupiedTracks.set(key, Math.max(occupiedTracks.get(key) ?? 0, panel.offsetWidth));
    });
    const availableWidth = hostWidth - [...occupiedTracks.values()].reduce((total, width) => total + width, 0) - PANEL_LAYOUT.minimumMapWidth - PANEL_LAYOUT.dockedResizeGutter;
    const upperBound = Math.max(minWidth, Math.min(maxWidth, hostWidth * PANEL_LAYOUT.dockedMaxWidthRatio, availableWidth));
    return Math.min(upperBound, Math.max(minWidth, value));
  };
  const siblingDockPlacements = () => {
    const host = owner();
    if (!host) return [];
    return [...host.querySelectorAll<HTMLElement>(":scope > .cv-floating-panel-window:is(.is-docked,.is-collapsed)")]
      .filter((panel) => panel !== frameRef.current)
      .map((panel) => ({
        panel,
        placement: {
          side: validDockSide(panel.dataset.dockSide) ? panel.dataset.dockSide : "left",
          column: Number.parseInt(panel.dataset.dockColumn ?? "0", 10) || 0,
          slot: validDockSlot(panel.dataset.dockSlot) ? panel.dataset.dockSlot : "full",
        } satisfies DockPlacement,
      }));
  };
  const stackedDockSibling = (placement = dockPlacementRef.current) => {
    if (placement.slot === "full") return undefined;
    const complementarySlot: DockSlot = placement.slot === "top" ? "bottom" : "top";
    return siblingDockPlacements().find((entry) => entry.placement.side === placement.side && entry.placement.column === placement.column && entry.placement.slot === complementarySlot);
  };
  const placementAvailable = (placement: DockPlacement) => siblingDockPlacements().every((entry) => {
    if (!dockPlacementsConflict(entry.placement, placement)) return true;
    return entry.placement.side === placement.side
      && entry.placement.column === placement.column
      && entry.placement.slot === "full"
      && placement.slot !== "full";
  });
  const firstAvailableDockPlacement = (): DockPlacement => {
    for (const side of ["left", "right"] as const) {
      for (let column = 0; column < PANEL_LAYOUT.maxDockColumns; column += 1) {
        const placement = { side, column, slot: "full" } satisfies DockPlacement;
        if (placementAvailable(placement)) return placement;
      }
    }
    return DEFAULT_DOCK_PLACEMENT;
  };
  const updateDockPlacement = (next: DockPlacement) => { dockPlacementRef.current = next; setDockPlacement(next) };
  const updateDockPreview = (next: DockTarget | null) => { dockPreviewRef.current = next; setDockPreview(next) };
  const calculateDockTarget = (clientX: number, clientY: number, movingGeometry: FloatingPanelGeometry): DockTarget | null => {
    const host = owner();
    if (!host) return null;
    const hostRect = host.getBoundingClientRect();
    const hostWidth = host.clientWidth || hostRect.width || 1200;
    const hostHeight = host.clientHeight || hostRect.height || 800;
    const visualWidth = hostRect.width || hostWidth;
    const visualHeight = hostRect.height || hostHeight;
    const scaleX = visualWidth / hostWidth;
    const scaleY = visualHeight / hostHeight;
    const localX = (clientX - hostRect.left) / scaleX;
    const localY = Math.min(hostHeight, Math.max(0, (clientY - hostRect.top) / scaleY));
    const boundaries: Array<{ side: DockSide; column: number; edge: number }> = [
      { side: "left", column: 0, edge: 0 },
      { side: "right", column: 0, edge: hostWidth },
    ];
    for (const entry of siblingDockPlacements()) {
      const bounds = entry.panel.getBoundingClientRect();
      const column = entry.placement.column + 1;
      if (column >= PANEL_LAYOUT.maxDockColumns || boundaries.some((candidate) => candidate.side === entry.placement.side && candidate.column === column)) continue;
      const panelWidth = entry.panel.offsetWidth || initialGeometry.width;
      if (entry.placement.side === "left") {
        const right = (bounds.right - hostRect.left) / scaleX;
        boundaries.push({ side: "left", column, edge: right > 0 ? right : column * panelWidth });
      } else {
        const left = (bounds.left - hostRect.left) / scaleX;
        boundaries.push({ side: "right", column, edge: left > 0 ? left : hostWidth - column * panelWidth });
      }
    }
    const distanceToBoundary = (candidate: { side: DockSide; edge: number }) => {
      const panelEdge = candidate.side === "left" ? movingGeometry.x : movingGeometry.x + movingGeometry.width;
      return Math.min(Math.abs(localX - candidate.edge), Math.abs(panelEdge - candidate.edge));
    };
    const ratio = hostHeight > 0 ? localY / hostHeight : 0.5;
    const slot: DockSlot = ratio <= PANEL_LAYOUT.dockTopThreshold ? "top" : ratio >= 1 - PANEL_LAYOUT.dockBottomThreshold ? "bottom" : "full";
    const boundary = boundaries
      .filter((candidate) => distanceToBoundary(candidate) <= PANEL_LAYOUT.dockSnapDistance)
      .filter((candidate) => placementAvailable({ side: candidate.side, column: candidate.column, slot }))
      .sort((first, second) => distanceToBoundary(first) - distanceToBoundary(second))[0];
    if (!boundary) return null;
    const placement = { side: boundary.side, column: boundary.column, slot } satisfies DockPlacement;
    const availableWidth = boundary.side === "left" ? hostWidth - boundary.edge : boundary.edge;
    const fullHeightSibling = siblingDockPlacements().find((entry) => entry.placement.side === placement.side && entry.placement.column === placement.column && entry.placement.slot === "full");
    const preferredWidth = fullHeightSibling ? Math.max(minWidth, fullHeightSibling.panel.offsetWidth - PANEL_LAYOUT.dockedResizeGutter) : geometryRef.current.width;
    const width = Math.min(clampDockedWidth(preferredWidth, placement), Math.max(minWidth, availableWidth));
    const outerWidth = width + PANEL_LAYOUT.dockedResizeGutter;
    const height = slot === "full" ? hostHeight : hostHeight / 2;
    const localTargetX = boundary.side === "left" ? boundary.edge : boundary.edge - outerWidth;
    const localTargetY = slot === "bottom" ? hostHeight / 2 : 0;
    return {
      placement,
      x: hostRect.left + localTargetX * scaleX,
      y: hostRect.top + localTargetY * scaleY,
      width: outerWidth * scaleX,
      height: height * scaleY,
      dockedWidth: width,
    };
  };
  const updateGeometry = (value: FloatingPanelGeometry) => { geometryRef.current = value; setGeometry(value) };
  const persist = (nextMode = modeRef.current, nextGeometry = geometryRef.current, nextWidth = dockedWidthRef.current, nextPlacement = dockPlacementRef.current) => { try { window.localStorage.setItem(panelStateStorageKey(effectiveKey), JSON.stringify({ mode: nextMode, floatingGeometry: nextGeometry, dockedWidth: nextWidth, dockPlacement: nextPlacement } satisfies PersistedPanelState)) } catch { /* optional persistence */ } };
  const commitGeometry = (value: FloatingPanelGeometry) => { const next = normalize(value); updateGeometry(next); persist(modeRef.current, next); onGeometryCommit?.(next) };
  const changeMode = (value: PanelMode) => { const next = dockable ? value : "floating"; modeRef.current = next; if (controlledMode === undefined) setInternalMode(next); persist(next); onModeChange?.(next) };

  useEffect(() => { modeRef.current = mode; persist(mode) }, [mode]);
  useEffect(() => { const query = window.matchMedia?.("(max-width: 760px)"); if (!query) return; const update = () => setDesktop(!query.matches); update(); query.addEventListener?.("change", update); return () => query.removeEventListener?.("change", update) }, []);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const applyPlacement = (event: Event) => {
      const placement = parseDockPlacement((event as CustomEvent<DockPlacement>).detail);
      if (!placement) return;
      updateDockPlacement(placement);
      persist(modeRef.current, geometryRef.current, dockedWidthRef.current, placement);
    };
    frame.addEventListener(PANEL_DOCK_PLACEMENT_EVENT, applyPlacement);
    return () => frame.removeEventListener(PANEL_DOCK_PLACEMENT_EVENT, applyPlacement);
  }, [effectiveKey]);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const applyDockedWidth = (event: Event) => {
      const requestedWidth = (event as CustomEvent<number>).detail;
      if (!Number.isFinite(requestedWidth)) return;
      const width = clampDockedWidth(requestedWidth);
      dockedWidthRef.current = width;
      setDockedWidth(width);
      persist(modeRef.current, geometryRef.current, width, dockPlacementRef.current);
      onDockedWidthChange?.(width);
    };
    frame.addEventListener(PANEL_DOCK_WIDTH_EVENT, applyDockedWidth);
    return () => frame.removeEventListener(PANEL_DOCK_WIDTH_EVENT, applyDockedWidth);
  }, [effectiveKey, maxWidth, minWidth]);
  useEffect(() => {
    const host = owner();
    const frame = frameRef.current;
    if (!host || !frame || mode !== "docked" || dockPlacement.slot !== "top") {
      splitKeyRef.current = null;
      return;
    }
    const inspect = () => {
      const sibling = siblingDockPlacements().find((entry) => entry.placement.side === dockPlacement.side && entry.placement.column === dockPlacement.column && entry.placement.slot === "bottom");
      if (!sibling) {
        splitKeyRef.current = null;
        return;
      }
      sibling.panel.dispatchEvent(new CustomEvent<number>(PANEL_DOCK_WIDTH_EVENT, { detail: dockedWidthRef.current }));
      const splitKey = `${dockPlacement.side}:${dockPlacement.column}`;
      if (splitKeyRef.current === splitKey) return;
      splitKeyRef.current = splitKey;
      const ratio = readDockSplitRatio(dockPlacement.side, dockPlacement.column);
      splitRatioRef.current = ratio;
      setSplitRatio(ratio);
      host.style.setProperty("--cv-dock-split-top", `${ratio * 100}%`);
    };
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-dock-side", "data-dock-column", "data-dock-slot"] });
    return () => observer.disconnect();
  }, [dockPlacement, mode]);
  useEffect(() => {
    const host = owner();
    if (!host || mode !== "docked" || dockPlacement.slot === "full") return;
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ side: DockSide; column: number; ratio: number }>).detail;
      if (!detail || detail.side !== dockPlacement.side || detail.column !== dockPlacement.column) return;
      const ratio = clampDockSplitRatio(detail.ratio);
      splitRatioRef.current = ratio;
      setSplitRatio(ratio);
      host.style.setProperty("--cv-dock-split-top", `${ratio * 100}%`);
    };
    host.addEventListener(PANEL_DOCK_SPLIT_EVENT, sync);
    return () => host.removeEventListener(PANEL_DOCK_SPLIT_EVENT, sync);
  }, [dockPlacement, mode]);
  useEffect(() => { if (kind !== "trips") return; const frame = frameRef.current; if (!frame) return; const inspect = () => setTimelineContent(Boolean(frame.querySelector(".trip-planner-panel--trip-view"))); inspect(); const observer = new MutationObserver(inspect); observer.observe(frame, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] }); return () => observer.disconnect() }, [children, kind]);
  useEffect(() => { const saved = readPanelState(effectiveKey, initialGeometry, dockable ? defaultMode : "floating"); updateGeometry(saved.floatingGeometry); dockedWidthRef.current = saved.dockedWidth ?? initialGeometry.width; setDockedWidth(dockedWidthRef.current); updateDockPlacement(saved.dockPlacement ?? DEFAULT_DOCK_PLACEMENT); if (controlledMode === undefined) changeMode(saved.mode); setMaximized(false) }, [effectiveKey]);
  useLayoutEffect(() => {
    if (hasPersistedStateRef.current) return;
    const frame = frameRef.current;
    const host = owner();
    if (!frame || !host) return;
    const sibling = [...host.querySelectorAll<HTMLElement>(":scope > .cv-floating-panel-window:not(.is-hidden)")]
      .filter((panel) => panel !== frame && Number(panel.dataset.panelMountSequence ?? Number.POSITIVE_INFINITY) < mountSequenceRef.current)
      .at(-1);
    if (!sibling) return;

    if (modeRef.current === "floating") {
      const hostRect = host.getBoundingClientRect();
      const siblingRect = sibling.getBoundingClientRect();
      const scaleX = hostRect.width / (host.clientWidth || hostRect.width || 1);
      const scaleY = hostRect.height / (host.clientHeight || hostRect.height || 1);
      const next = normalize({
        ...geometryRef.current,
        x: (siblingRect.right - hostRect.left) / scaleX + 8,
        y: (siblingRect.top - hostRect.top) / scaleY,
      });
      updateGeometry(next);
      persist("floating", next);
      return;
    }

    if (modeRef.current === "docked") {
      const siblingSide = validDockSide(sibling.dataset.dockSide) ? sibling.dataset.dockSide : "left";
      const siblingColumn = Number.parseInt(sibling.dataset.dockColumn ?? "0", 10) || 0;
      const adjacent = { side: siblingSide, column: Math.min(PANEL_LAYOUT.maxDockColumns - 1, siblingColumn + 1), slot: "full" } satisfies DockPlacement;
      const placement = placementAvailable(adjacent) ? adjacent : firstAvailableDockPlacement();
      updateDockPlacement(placement);
      persist("docked", geometryRef.current, dockedWidthRef.current, placement);
    }
  }, []);
  useEffect(() => { if (resetRef.current === resetVersion) return; resetRef.current = resetVersion; updateGeometry(initialGeometry); dockedWidthRef.current = initialGeometry.width; setDockedWidth(initialGeometry.width); updateDockPlacement(DEFAULT_DOCK_PLACEMENT); setMaximized(false); changeMode(dockable ? defaultMode : "floating") }, [resetVersion]);
  useEffect(() => { if (!fitContentSelector || mode !== "floating") return; const content = frameRef.current?.querySelector<HTMLElement>(fitContentSelector); if (!content) return; const fit = () => { if (fitContentOnce && fitContentCompleteKeyRef.current === effectiveKey) return; if (fitContentOnce && !content.matches('[data-panel-fit-ready]')) return; const measured = Math.max(Math.ceil(content.getBoundingClientRect().height), content.scrollHeight); const host = owner(); const height = Math.min(fitContentMaxHeight, host ? host.clientHeight - PANEL_LAYOUT.viewportMargin * 2 : fitContentMaxHeight, Math.max(minHeight, measured)); if (measured > 0 && Math.abs(geometryRef.current.height - height) >= 1) commitGeometry({ ...geometryRef.current, height }); if (fitContentOnce) fitContentCompleteKeyRef.current = effectiveKey }; fit(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit); observer?.observe(content); return () => observer?.disconnect() }, [effectiveKey, fitContentMaxHeight, fitContentOnce, fitContentSelector, minHeight, mode]);
  useEffect(() => { const host = owner(); if (!host || typeof ResizeObserver === "undefined") return; const keepVisible = () => { if (modeRef.current === "floating") { updateGeometry(normalize(geometryRef.current)); return } if (modeRef.current === "docked") { const width = clampDockedWidth(dockedWidthRef.current); if (Math.abs(width - dockedWidthRef.current) < 1) return; dockedWidthRef.current = width; setDockedWidth(width); persist("docked", geometryRef.current, width); stackedDockSibling()?.panel.dispatchEvent(new CustomEvent<number>(PANEL_DOCK_WIDTH_EVENT, { detail: width })); onDockedWidthChange?.(width) } }; keepVisible(); const observer = new ResizeObserver(keepVisible); observer.observe(host); return () => observer.disconnect() }, [maxWidth, minHeight, minWidth]);
  useEffect(() => () => { document.body.classList.remove("cv-panel-window-moving", "cv-panel-window-resizing", "cv-panel-dock-split-resizing"); delete document.body.dataset.cvPanelResizeEdge }, []);

  const detach = () => { const host = owner(); const next = normalize({ ...geometryRef.current, x: PANEL_LAYOUT.viewportMargin, y: PANEL_LAYOUT.viewportMargin, width: Math.max(minWidth, Math.min(dockedWidthRef.current, (host?.clientWidth ?? 1000) - PANEL_LAYOUT.viewportMargin * 2)), height: Math.min(Math.max(minHeight, geometryRef.current.height), (host?.clientHeight ?? 800) - PANEL_LAYOUT.viewportMargin * 2) }); updateGeometry(next); changeMode("floating"); onActivate() };
  const dock = (target?: DockTarget) => {
    const placement = target?.placement ?? firstAvailableDockPlacement();
    let stackingSibling: ReturnType<typeof stackedDockSibling>;
    if (placement.slot !== "full") {
      const complementarySlot: DockSlot = placement.slot === "top" ? "bottom" : "top";
      stackingSibling = siblingDockPlacements().find((entry) => entry.placement.side === placement.side && entry.placement.column === placement.column && (entry.placement.slot === "full" || entry.placement.slot === complementarySlot));
      if (stackingSibling?.placement.slot === "full") stackingSibling.panel.dispatchEvent(new CustomEvent<DockPlacement>(PANEL_DOCK_PLACEMENT_EVENT, { detail: { ...placement, slot: complementarySlot } }));
    }
    const siblingContentWidth = stackingSibling ? Math.max(minWidth, stackingSibling.panel.offsetWidth - PANEL_LAYOUT.dockedResizeGutter) : 0;
    const nextWidth = clampDockedWidth(siblingContentWidth || target?.dockedWidth || initialGeometry.width, placement);
    updateDockPlacement(placement);
    dockedWidthRef.current = nextWidth;
    setDockedWidth(nextWidth);
    changeMode("docked");
    persist("docked", geometryRef.current, nextWidth, placement);
    onDockedWidthChange?.(nextWidth);
    stackingSibling?.panel.dispatchEvent(new CustomEvent<number>(PANEL_DOCK_WIDTH_EVENT, { detail: nextWidth }));
    onActivate();
  };
  const collapse = () => { changeMode("collapsed"); onActivate() };
  const expand = () => { dockedWidthRef.current = initialGeometry.width; setDockedWidth(initialGeometry.width); changeMode("docked"); onDockedWidthChange?.(initialGeometry.width); onActivate() };
  const beginMove = (event: PointerEvent<HTMLDivElement>) => { if (layoutLocked || event.button !== 0 || !desktop) return; const target = event.target as HTMLElement; const dragHandle = target.closest<HTMLElement>('[data-panel-drag-handle]'); if ((target.closest('button,a,input,select,textarea,[role="button"],[data-panel-no-drag]') && !dragHandle) || (!dragHandle && !target.closest(".cv-workspace-panel__header,.places-redesign-header,.trip-panel-header,.popup-heading,.sidebar-header"))) return; interactionRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, geometry: geometryRef.current, mode: "move", started: false, dragHandle }; onActivate() };
  const beginResize = (event: PointerEvent<HTMLDivElement>, edge: ResizeEdge) => { const dockedResizeEdge = dockPlacementRef.current.side === "left" ? "e" : "w"; if (event.button !== 0 || !desktop || mode === "collapsed" || (mode === "docked" && edge !== dockedResizeEdge)) return; interactionRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, geometry: mode === "docked" ? { x: dockPlacementRef.current.side === "right" ? (owner()?.clientWidth ?? dockedWidthRef.current) - dockedWidthRef.current : 0, y: 0, width: dockedWidthRef.current, height: owner()?.clientHeight ?? geometry.height } : geometryRef.current, mode: edge, started: true, dragHandle: null }; setActiveResizeEdge(edge); try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* Continue with regular pointer bubbling when capture is unavailable. */ } document.body.dataset.cvPanelResizeEdge = edge; document.body.classList.add("cv-panel-window-resizing"); onActivate(); event.preventDefault(); event.stopPropagation() };
  const move = (event: PointerEvent<HTMLDivElement>) => { const interaction = interactionRef.current; if (!interaction || interaction.pointerId !== event.pointerId) return; const dx = event.clientX - interaction.startX, dy = event.clientY - interaction.startY; if (interaction.mode === "move") { if (!interaction.started && Math.hypot(dx, dy) < PANEL_LAYOUT.dragThreshold) return; if (!interaction.started) { interaction.started = true; try { frameRef.current?.setPointerCapture?.(event.pointerId) } catch { /* Continue while the pointer remains over the panel. */ } document.body.classList.add("cv-panel-window-moving"); if (modeRef.current !== "floating") { const host = owner(), width = Math.max(minWidth, dockedWidthRef.current); interaction.geometry = normalize({ x: event.clientX - Math.min(width * .45, 180), y: PANEL_LAYOUT.viewportMargin, width, height: Math.min((host?.clientHeight ?? 800) - 24, Math.max(minHeight, geometry.height)) }); interaction.startX = event.clientX; interaction.startY = event.clientY; changeMode("floating"); updateGeometry(interaction.geometry); updateDockPreview(null); return } } const next = normalize({ ...interaction.geometry, x: interaction.geometry.x + (event.clientX - interaction.startX), y: interaction.geometry.y + (event.clientY - interaction.startY) }); updateGeometry(next); updateDockPreview(dockable ? calculateDockTarget(event.clientX, event.clientY, next) : null); return } const next = resizeGeometry(interaction.geometry, interaction.mode, dx, dy); if (modeRef.current === "docked") { const width = clampDockedWidth(next.width); dockedWidthRef.current = width; setDockedWidth(width); stackedDockSibling()?.panel.dispatchEvent(new CustomEvent<number>(PANEL_DOCK_WIDTH_EVENT, { detail: width })); onDockedWidthChange?.(width) } else updateGeometry(normalize(next)) };
  const finish = (event: PointerEvent<HTMLDivElement>) => { const interaction = interactionRef.current; if (!interaction || interaction.pointerId !== event.pointerId) return; if (interaction.started && interaction.dragHandle) { interaction.dragHandle.dataset.panelDragMoved = "true"; window.setTimeout(() => { delete interaction.dragHandle?.dataset.panelDragMoved }, 0) } interactionRef.current = null; setActiveResizeEdge(null); document.body.classList.remove("cv-panel-window-moving", "cv-panel-window-resizing"); delete document.body.dataset.cvPanelResizeEdge; const target = dockPreviewRef.current; updateDockPreview(null); if (target) dock(target); else if (modeRef.current === "docked") persist("docked", geometryRef.current, dockedWidthRef.current); else commitGeometry(geometryRef.current) };
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>, edge: ResizeEdge) => { const step = event.shiftKey ? 64 : 24, dx = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0, dy = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0; if ((!dx && !dy) || mode === "collapsed") return; if (mode === "docked") { const dockedResizeEdge = dockPlacementRef.current.side === "left" ? "e" : "w"; if (edge !== dockedResizeEdge || !dx) return; const width = clampDockedWidth(dockedWidthRef.current + (dockPlacementRef.current.side === "left" ? dx : -dx)); dockedWidthRef.current = width; setDockedWidth(width); persist("docked", geometryRef.current, width); stackedDockSibling()?.panel.dispatchEvent(new CustomEvent<number>(PANEL_DOCK_WIDTH_EVENT, { detail: width })); onDockedWidthChange?.(width) } else commitGeometry(resizeGeometry(geometryRef.current, edge, dx, dy)); event.preventDefault() };
  const toggleMaximize = () => { const host = owner(); if (!host || mode !== "floating") return; if (maximized) { setMaximized(false); commitGeometry(restoreGeometryRef.current ?? initialGeometry) } else { restoreGeometryRef.current = geometryRef.current; setMaximized(true); commitGeometry({ x: 12, y: 12, width: host.clientWidth - 24, height: host.clientHeight - 24 }) } };
  const updateDockSplit = (clientY: number) => {
    const host = owner();
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    const ratio = clampDockSplitRatio((clientY - bounds.top) / Math.max(1, bounds.height));
    splitRatioRef.current = ratio;
    setSplitRatio(ratio);
    host.style.setProperty("--cv-dock-split-top", `${ratio * 100}%`);
    host.dispatchEvent(new CustomEvent(PANEL_DOCK_SPLIT_EVENT, { detail: { side: dockPlacement.side, column: dockPlacement.column, ratio } }));
  };
  const beginDockSplitResize = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !desktop) return;
    splitPointerRef.current = event.pointerId;
    setSplitResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add("cv-panel-dock-split-resizing");
    onActivate();
    event.preventDefault();
    event.stopPropagation();
  };
  const moveDockSplitResize = (event: PointerEvent<HTMLElement>) => {
    if (splitPointerRef.current !== event.pointerId) return;
    updateDockSplit(event.clientY);
    event.preventDefault();
    event.stopPropagation();
  };
  const finishDockSplitResize = (event: PointerEvent<HTMLElement>) => {
    if (splitPointerRef.current !== event.pointerId) return;
    splitPointerRef.current = null;
    setSplitResizing(false);
    document.body.classList.remove("cv-panel-dock-split-resizing");
    try { window.localStorage.setItem(dockSplitStorageKey(dockPlacement.side, dockPlacement.column), String(splitRatioRef.current)) } catch { /* optional persistence */ }
    event.preventDefault();
    event.stopPropagation();
  };
  const resizeDockSplitWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const step = event.shiftKey ? 0.075 : 0.025;
    const ratio = clampDockSplitRatio(splitRatioRef.current + (event.key === "ArrowDown" ? step : -step));
    splitRatioRef.current = ratio;
    setSplitRatio(ratio);
    owner()?.style.setProperty("--cv-dock-split-top", `${ratio * 100}%`);
    owner()?.dispatchEvent(new CustomEvent(PANEL_DOCK_SPLIT_EVENT, { detail: { side: dockPlacement.side, column: dockPlacement.column, ratio } }));
    try { window.localStorage.setItem(dockSplitStorageKey(dockPlacement.side, dockPlacement.column), String(ratio)) } catch { /* optional persistence */ }
    event.preventDefault();
    event.stopPropagation();
  };
  const resetDockSplit = () => {
    const ratio = 0.5;
    splitRatioRef.current = ratio;
    setSplitRatio(ratio);
    owner()?.style.setProperty("--cv-dock-split-top", "50%");
    owner()?.dispatchEvent(new CustomEvent(PANEL_DOCK_SPLIT_EVENT, { detail: { side: dockPlacement.side, column: dockPlacement.column, ratio } }));
    try { window.localStorage.setItem(dockSplitStorageKey(dockPlacement.side, dockPlacement.column), String(ratio)) } catch { /* optional persistence */ }
  };

  const displayed: { x: number; y: number; width: number; height: number | string } = mode === "floating" ? geometry : { x: 0, y: 0, width: mode === "collapsed" ? collapsedWidth : dockedWidth + PANEL_LAYOUT.dockedResizeGutter, height: "100%" };
  const edges: ResizeEdge[] = mode === "floating" && !layoutLocked ? ["n", "ne", "e", "se", "s", "sw", "w", "nw"] : [];
  const dockedResizeEdge: ResizeEdge = dockPlacement.side === "left" ? "e" : "w";
  const frameStyle = { left: displayed.x, top: displayed.y, width: displayed.width, height: displayed.height, "--cv-panel-resize-hit-zone": `${PANEL_LAYOUT.resizeHitZone}px`, "--cv-panel-resize-hit-offset": `${PANEL_LAYOUT.resizeHitZone / -2}px`, "--cv-panel-docked-grip-width": `${PANEL_LAYOUT.dockedGripWidth}px`, "--cv-panel-docked-grip-height": `${PANEL_LAYOUT.dockedGripHeight}px`, "--cv-panel-docked-resize-gutter": `${PANEL_LAYOUT.dockedResizeGutter}px` } as CSSProperties;
  const renderResizeHandle = (edge: ResizeEdge, dockedTrack = false) => <div key={edge} className={`cv-floating-panel-window__resize cv-floating-panel-window__resize--${edge}${hoveredResizeEdge === edge ? " is-hovered" : ""}${activeResizeEdge === edge ? " is-active" : ""}`} data-panel-no-drag data-docked-track-resize={dockedTrack || undefined} data-resize-edge={edge} role="separator" tabIndex={edge === "e" || edge === "s" || dockedTrack && edge === "w" ? 0 : -1} aria-label={`Redimensionner ${label}`} aria-orientation={edge === "e" || edge === "w" ? "vertical" : edge === "n" || edge === "s" ? "horizontal" : undefined} aria-valuemin={edge === "e" || edge === "w" ? minWidth : minHeight} aria-valuemax={(edge === "e" || edge === "w") && Number.isFinite(maxWidth) ? maxWidth : undefined} aria-valuenow={edge === "e" || edge === "w" ? Math.round(dockedTrack ? dockedWidth : geometry.width) : edge === "n" || edge === "s" ? Math.round(geometry.height) : undefined} onKeyDown={(event) => resizeWithKeyboard(event, edge)} onPointerEnter={() => setHoveredResizeEdge(edge)} onPointerLeave={() => setHoveredResizeEdge((current) => current === edge ? null : current)} onPointerDown={(event) => beginResize(event, edge)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>{cardinalResizeEdges.has(edge) && <span className="cv-floating-panel-window__resize-indicator" data-resize-visibility={dockedTrack ? "persistent" : edge === "e" ? "resting-hint" : "contextual"} aria-hidden="true" />}</div>;
  const dockTrackResizeOverlay = !hidden && !layoutLocked && dockResizeHost && mode === "docked" && (dockPlacement.slot !== "bottom" || !hasStackedDockSibling) ? createPortal(<div className="cv-docked-track-resize-overlay" data-panel-resize-owner={effectiveKey} data-dock-side={dockPlacement.side} data-dock-column={dockPlacement.column} data-dock-slot={dockPlacement.slot} data-dock-stacked={hasStackedDockSibling || undefined} data-resize-active-edge={activeResizeEdge ?? undefined} style={{ "--cv-panel-resize-hit-zone": `${PANEL_LAYOUT.resizeHitZone}px`, "--cv-panel-docked-grip-width": `${PANEL_LAYOUT.dockedGripWidth}px`, "--cv-panel-docked-grip-height": `${PANEL_LAYOUT.dockedGripHeight}px` } as CSSProperties}>{renderResizeHandle(dockedResizeEdge, true)}</div>, dockResizeHost) : null;
  return <><div ref={frameRef} className={`cv-floating-panel-window cv-floating-panel-window--${effectiveKind} is-${mode}${active ? " is-active" : ""}${hidden ? " is-hidden" : ""}${layoutLocked ? " is-layout-locked" : ""}`} data-panel-mode={mode} data-panel-mount-sequence={mountSequenceRef.current} data-dock-side={dockPlacement.side} data-dock-column={dockPlacement.column} data-dock-slot={dockPlacement.slot} data-resize-hovered-edge={hoveredResizeEdge ?? undefined} data-resize-active-edge={activeResizeEdge ?? undefined} aria-label={label} style={frameStyle} onPointerDown={beginMove} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onMouseDown={onActivate}>
    {dockPreview && <DockPreviewOverlay target={dockPreview} />}
    <div className="cv-floating-panel-window__content"><FloatingPanelWindowContext.Provider value={{ desktop, dockable: dockable && !layoutLocked, mode, maximized, dock, detach, collapse, expand, toggleMaximize }}>{children}</FloatingPanelWindowContext.Provider></div>
    {!layoutLocked && mode === "docked" && dockPlacement.slot === "top" && hasStackedDockSibling && <div className={`cv-floating-panel-window__dock-split${splitResizing ? " is-active" : ""}`} data-panel-no-drag role="separator" tabIndex={0} title="Double-cliquer pour rétablir un partage 50/50" aria-label="Redimensionner la séparation des panneaux" aria-orientation="horizontal" aria-valuemin={Math.round(PANEL_LAYOUT.minDockSplitRatio * 100)} aria-valuemax={Math.round(PANEL_LAYOUT.maxDockSplitRatio * 100)} aria-valuenow={Math.round(splitRatio * 100)} onDoubleClick={resetDockSplit} onKeyDown={resizeDockSplitWithKeyboard} onPointerDown={beginDockSplitResize} onPointerMove={moveDockSplitResize} onPointerUp={finishDockSplitResize} onPointerCancel={finishDockSplitResize} onLostPointerCapture={finishDockSplitResize}><span className="cv-floating-panel-window__resize-indicator" data-resize-visibility="persistent" aria-hidden="true" /></div>}
    {!layoutLocked && mode === "docked" && dockPlacement.slot === "bottom" && hasStackedDockSibling && <div className={`cv-floating-panel-window__dock-split-hit-complement${splitResizing ? " is-active" : ""}`} data-panel-no-drag title="Double-cliquer pour rétablir un partage 50/50" onDoubleClick={resetDockSplit} onPointerDown={beginDockSplitResize} onPointerMove={moveDockSplitResize} onPointerUp={finishDockSplitResize} onPointerCancel={finishDockSplitResize} onLostPointerCapture={finishDockSplitResize}><span className="cv-floating-panel-window__resize-indicator cv-floating-panel-window__resize-indicator--dock-split-complement" data-resize-visibility="persistent" aria-hidden="true" /></div>}
    {edges.map((edge) => renderResizeHandle(edge))}
    {mode === "floating" && <span className="cv-floating-panel-window__grip" aria-hidden="true" />}
  </div>{dockTrackResizeOverlay}</>;
}
