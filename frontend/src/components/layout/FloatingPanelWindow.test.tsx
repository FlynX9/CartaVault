import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dockSplitStorageKey, FloatingPanelWindow, PANEL_LAYOUT, panelStateStorageKey, readPanelState } from "./FloatingPanelWindow";
import { PanelWindowControls } from "./PanelWindowControls";

const geometry = { x: 24, y: 24, width: 420, height: 560 };

function renderPanel(maxWidth?: number) {
  return render(
    <section className="map-workspace">
      <FloatingPanelWindow kind="workspace" label="Navigation" storageKey="test:panel" initialGeometry={geometry} minWidth={320} maxWidth={maxWidth} resetVersion={0} active onActivate={vi.fn()}>
        <aside>
          <header className="cv-workspace-panel__header">Navigation <PanelWindowControls /></header>
        </aside>
      </FloatingPanelWindow>
    </section>,
  );
}

function setWorkspaceDimensions(panel: HTMLElement, width = 1000, height = 800) {
  const workspace = panel.closest<HTMLElement>(".map-workspace")!;
  Object.defineProperty(workspace, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(workspace, "clientHeight", { configurable: true, value: height });
  return workspace;
}

function dockedResizeHandle(storageKey: string, edge: "e" | "w") {
  return document.querySelector<HTMLElement>(`[data-panel-resize-owner='${storageKey}'] [data-resize-edge='${edge}']`)!;
}

describe("FloatingPanelWindow", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("uses the three explicit modes and persists transitions", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    expect(dockedResizeHandle("test:panel", "e").querySelector("[data-resize-visibility='persistent']")).toBeInTheDocument();

    const detachButton = screen.getByRole("button", { name: "Détacher le panneau" });
    expect(detachButton.querySelector("[data-panel-attachment-icon='detach']")).toHaveClass("tabler-icon-magnet-off");
    fireEvent.click(detachButton);
    expect(panel).toHaveAttribute("data-panel-mode", "floating");
    expect(panel.querySelectorAll(".cv-floating-panel-window__resize-indicator")).toHaveLength(4);
    const attachButton = screen.getByRole("button", { name: "Attacher le panneau" });
    expect(attachButton).toHaveAttribute("title", "Attacher le panneau");
    expect(attachButton.querySelector("[data-panel-attachment-icon='attach']")).toHaveClass("tabler-icon-magnet");
    expect(screen.getAllByRole("separator", { name: "Redimensionner Navigation" })).toHaveLength(8);

    fireEvent.click(attachButton);
    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    const redockedDetachButton = screen.getByRole("button", { name: "Détacher le panneau" });
    expect(redockedDetachButton).toHaveAttribute("title", "Détacher le panneau");
    expect(redockedDetachButton.querySelector("[data-panel-attachment-icon='detach']")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Réduire le panneau" }));
    expect(panel).toHaveAttribute("data-panel-mode", "collapsed");
    expect(panel.querySelectorAll(".cv-floating-panel-window__resize-indicator")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Attacher le panneau" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Détacher le panneau" })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Redimensionner Navigation" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Déployer le panneau" }));
    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    expect(JSON.parse(window.localStorage.getItem(panelStateStorageKey("test:panel")) ?? "{}").mode).toBe("docked");
  });

  it("does not detach before the drag threshold", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    const header = screen.getByText("Navigation", { selector: "header" });
    fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(panel, { pointerId: 1, clientX: 103, clientY: 22 });
    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    fireEvent.pointerMove(panel, { pointerId: 1, clientX: 118, clientY: 26 });
    expect(panel).toHaveAttribute("data-panel-mode", "floating");
  });

  it("locks the timeline layout without move or resize affordances", () => {
    const view = (layoutLocked: boolean) => (
      <section className="map-workspace">
        <FloatingPanelWindow kind="timeline" label="Chronologie" storageKey="test:timeline" initialGeometry={geometry} minWidth={320} defaultMode="floating" layoutLocked={layoutLocked} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="trip-panel-header">Chronologie <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
      </section>
    );
    const { rerender } = render(view(false));
    const panel = screen.getByLabelText("Chronologie");
    const initialStyle = panel.getAttribute("style");
    rerender(view(true));
    expect(panel).toHaveClass("cv-floating-panel-window--timeline", "is-layout-locked");
    expect(screen.queryByRole("separator", { name: "Redimensionner Chronologie" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attacher le panneau" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Détacher le panneau" })).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText("Chronologie", { selector: "header" }), { button: 0, pointerId: 91, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(panel, { pointerId: 91, clientX: 220, clientY: 120 });
    fireEvent.pointerUp(panel, { pointerId: 91, clientX: 220, clientY: 120 });
    expect(panel).toHaveAttribute("style", initialStyle);
    rerender(view(false));
    expect(panel).not.toHaveClass("is-layout-locked");
    expect(panel).toHaveAttribute("style", initialStyle);
  });

  it("hides a docked panel resize portal without changing its geometry", () => {
    const view = (hidden: boolean) => (
      <section className="map-workspace">
        <FloatingPanelWindow kind="workspace" label="Navigation" storageKey="test:hidden-panel" initialGeometry={geometry} minWidth={320} hidden={hidden} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="cv-workspace-panel__header">Navigation</header></aside>
        </FloatingPanelWindow>
      </section>
    );
    const { rerender } = render(view(false));
    const panel = screen.getByLabelText("Navigation");
    const initialStyle = panel.getAttribute("style");
    expect(document.querySelector("[data-panel-resize-owner='test:hidden-panel']")).toBeInTheDocument();

    rerender(view(true));
    expect(panel).toHaveClass("is-hidden");
    expect(document.querySelector("[data-panel-resize-owner='test:hidden-panel']")).not.toBeInTheDocument();

    rerender(view(false));
    expect(panel).not.toHaveClass("is-hidden");
    expect(panel).toHaveAttribute("style", initialStyle);
    expect(document.querySelector("[data-panel-resize-owner='test:hidden-panel']")).toBeInTheDocument();
  });

  it("does not start a panel drag from an attachment button", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    const detachButton = screen.getByRole("button", { name: "Détacher le panneau" });

    fireEvent.pointerDown(detachButton, { button: 0, pointerId: 2, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(panel, { pointerId: 2, clientX: 180, clientY: 80 });

    expect(panel).toHaveAttribute("data-panel-mode", "docked");
  });

  it("suppresses a drag handle click after moving the panel", () => {
    const onImageClick = vi.fn();
    render(
      <section className="map-workspace">
        <FloatingPanelWindow kind="detail" label="Fiche" storageKey="test:drag-handle" initialGeometry={geometry} minWidth={320} defaultMode="floating" dockable={false} resetVersion={0} active onActivate={vi.fn()}>
          <button type="button" data-panel-drag-handle onClick={(event) => { if (!event.currentTarget.dataset.panelDragMoved) onImageClick() }}>Image</button>
        </FloatingPanelWindow>
      </section>,
    );
    const panel = screen.getByLabelText("Fiche");
    const image = screen.getByRole("button", { name: "Image" });

    fireEvent.pointerDown(image, { button: 0, pointerId: 23, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(panel, { pointerId: 23, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(panel, { pointerId: 23, clientX: 140, clientY: 120 });
    fireEvent.click(image);

    expect(onImageClick).not.toHaveBeenCalled();
  });

  it("preserves a drag handle click when the pointer does not move", () => {
    const onImageClick = vi.fn();
    render(
      <section className="map-workspace">
        <FloatingPanelWindow kind="detail" label="Fiche" storageKey="test:click-handle" initialGeometry={geometry} minWidth={320} defaultMode="floating" dockable={false} resetVersion={0} active onActivate={vi.fn()}>
          <button type="button" data-panel-drag-handle onClick={onImageClick}>Image</button>
        </FloatingPanelWindow>
      </section>,
    );
    const image = screen.getByRole("button", { name: "Image" });

    fireEvent.pointerDown(image, { button: 0, pointerId: 24, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(image, { pointerId: 24, clientX: 100, clientY: 100 });
    fireEvent.click(image);

    expect(onImageClick).toHaveBeenCalledOnce();
  });

  it("attaches a floating panel when it is dragged to the left edge", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    setWorkspaceDimensions(panel);
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const header = screen.getByText("Navigation", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 3, clientX: 120, clientY: 30 });
    fireEvent.pointerMove(panel, { pointerId: 3, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(panel, { pointerId: 3, clientX: 20, clientY: 30 });

    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    expect(panel).toHaveAttribute("data-dock-slot", "top");
    expect(screen.getByRole("button", { name: "Détacher le panneau" })).toBeInTheDocument();
  });

  it.each([
    ["top", 40, "Moitié haute · gauche"],
    ["full", 400, "Toute la hauteur · gauche"],
    ["bottom", 760, "Moitié basse · gauche"],
  ] as const)("previews and persists the %s dock zone from the pointer height", (slot, clientY, previewLabel) => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    setWorkspaceDimensions(panel);
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const header = screen.getByText("Navigation", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 31, clientX: 120, clientY: 200 });
    fireEvent.pointerMove(panel, { pointerId: 31, clientX: 20, clientY });
    expect(screen.getByText(previewLabel)).toBeInTheDocument();
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", slot);
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveStyle({ height: slot === "full" ? "800px" : "400px" });
    fireEvent.pointerUp(panel, { pointerId: 31, clientX: 20, clientY });

    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    expect(panel).toHaveAttribute("data-dock-side", "left");
    expect(panel).toHaveAttribute("data-dock-column", "0");
    expect(panel).toHaveAttribute("data-dock-slot", slot);
    expect(panel).toHaveStyle({ height: "100%" });
    expect(JSON.parse(window.localStorage.getItem(panelStateStorageKey("test:panel")) ?? "{}").dockPlacement).toEqual({ side: "left", column: 0, slot });
  });

  it("keeps the upper dock target within the top fifth on both sides", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    setWorkspaceDimensions(panel);
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const header = screen.getByText("Navigation", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 36, clientX: 120, clientY: 200 });
    fireEvent.pointerMove(panel, { pointerId: 36, clientX: 20, clientY: 161 });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-side", "left");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", "full");

    fireEvent.pointerMove(panel, { pointerId: 36, clientX: 980, clientY: 161 });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-side", "right");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", "full");
    fireEvent.pointerUp(panel, { pointerId: 36, clientX: 980, clientY: 161 });
  });

  it("starts the lower dock target within the bottom two fifths on both sides", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    setWorkspaceDimensions(panel);
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const header = screen.getByText("Navigation", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 37, clientX: 120, clientY: 200 });
    fireEvent.pointerMove(panel, { pointerId: 37, clientX: 20, clientY: 481 });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-side", "left");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", "bottom");

    fireEvent.pointerMove(panel, { pointerId: 37, clientX: 980, clientY: 481 });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-side", "right");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", "bottom");
    fireEvent.pointerUp(panel, { pointerId: 37, clientX: 980, clientY: 481 });
  });

  it("keeps half-height previews at an exact visual 50/50 split", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    const workspace = setWorkspaceDimensions(panel);
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      x: 200,
      y: 100,
      left: 200,
      top: 100,
      right: 1000,
      bottom: 700,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const header = screen.getByText("Navigation", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 38, clientX: 320, clientY: 300 });
    fireEvent.pointerMove(panel, { pointerId: 38, clientX: 990, clientY: 581 });

    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-side", "right");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", "bottom");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveStyle({
      left: "652.8px",
      top: "400px",
      width: "347.2px",
      height: "300px",
    });
    fireEvent.pointerUp(panel, { pointerId: 38, clientX: 990, clientY: 581 });
  });

  it("docks a second full-height panel in the column next to an occupied dock", () => {
    render(
      <section className="map-workspace">
        <FloatingPanelWindow kind="workspace" label="Navigation" storageKey="test:first" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="cv-workspace-panel__header">Navigation <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
        <FloatingPanelWindow kind="trips" label="Sortie" storageKey="test:second" initialGeometry={geometry} minWidth={320} defaultMode="floating" resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="trip-panel-header">Sortie <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
      </section>,
    );
    const first = screen.getByLabelText("Navigation");
    const second = screen.getByLabelText("Sortie");
    setWorkspaceDimensions(first);
    Object.defineProperty(first, "offsetWidth", { configurable: true, value: geometry.width });
    const header = screen.getByText("Sortie", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 32, clientX: 650, clientY: 200 });
    fireEvent.pointerMove(second, { pointerId: 32, clientX: geometry.width + 20, clientY: 400 });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-column", "1");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", "full");
    fireEvent.pointerUp(second, { pointerId: 32, clientX: geometry.width + 20, clientY: 400 });

    expect(first).toHaveAttribute("data-dock-column", "0");
    expect(second).toHaveAttribute("data-panel-mode", "docked");
    expect(second).toHaveAttribute("data-dock-side", "left");
    expect(second).toHaveAttribute("data-dock-column", "1");
    expect(second).toHaveAttribute("data-dock-slot", "full");
  });

  it("stacks top and bottom docked panels in the same column", () => {
    window.localStorage.setItem(panelStateStorageKey("test:first-half"), JSON.stringify({ mode: "docked", floatingGeometry: geometry, dockedWidth: geometry.width, dockPlacement: { side: "left", column: 0, slot: "top" } }));
    render(
      <section className="map-workspace">
        <FloatingPanelWindow kind="workspace" label="Navigation" storageKey="test:first-half" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="cv-workspace-panel__header">Navigation <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
        <FloatingPanelWindow kind="trips" label="Sortie" storageKey="test:second-half" initialGeometry={geometry} minWidth={320} defaultMode="floating" resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="trip-panel-header">Sortie <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
      </section>,
    );
    const first = screen.getByLabelText("Navigation");
    const second = screen.getByLabelText("Sortie");
    setWorkspaceDimensions(first);
    const header = screen.getByText("Sortie", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 33, clientX: 650, clientY: 200 });
    fireEvent.pointerMove(second, { pointerId: 33, clientX: 20, clientY: 760 });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-column", "0");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", "bottom");
    fireEvent.pointerUp(second, { pointerId: 33, clientX: 20, clientY: 760 });

    expect(first).toHaveAttribute("data-dock-slot", "top");
    expect(second).toHaveAttribute("data-dock-column", "0");
    expect(second).toHaveAttribute("data-dock-slot", "bottom");
  });

  it.each([
    ["left", 20, 40, "top", "bottom"],
    ["right", 980, 760, "bottom", "top"],
  ] as const)("splits an existing full-height %s dock when a second panel targets one half", (side, clientX, clientY, secondSlot, firstSlot) => {
    window.localStorage.setItem(panelStateStorageKey("test:split-first"), JSON.stringify({
      mode: "docked",
      floatingGeometry: geometry,
      dockedWidth: geometry.width,
      dockPlacement: { side, column: 0, slot: "full" },
    }));
    render(
      <section className="map-workspace">
        <FloatingPanelWindow kind="workspace" label="Navigation" storageKey="test:split-first" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="cv-workspace-panel__header">Navigation <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
        <FloatingPanelWindow kind="trips" label="Sortie" storageKey="test:split-second" initialGeometry={geometry} minWidth={320} defaultMode="floating" resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="trip-panel-header">Sortie <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
      </section>,
    );
    const first = screen.getByLabelText("Navigation");
    const second = screen.getByLabelText("Sortie");
    setWorkspaceDimensions(first);
    Object.defineProperty(first, "offsetWidth", { configurable: true, value: geometry.width });

    fireEvent.pointerDown(screen.getByText("Sortie", { selector: "header" }), { button: 0, pointerId: 39, clientX: 650, clientY: 300 });
    fireEvent.pointerMove(second, { pointerId: 39, clientX, clientY });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-side", side);
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-column", "0");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", secondSlot);
    fireEvent.pointerUp(second, { pointerId: 39, clientX, clientY });

    expect(first).toHaveAttribute("data-dock-side", side);
    expect(first).toHaveAttribute("data-dock-column", "0");
    expect(first).toHaveAttribute("data-dock-slot", firstSlot);
    expect(second).toHaveAttribute("data-panel-mode", "docked");
    expect(second).toHaveAttribute("data-dock-side", side);
    expect(second).toHaveAttribute("data-dock-column", "0");
    expect(second).toHaveAttribute("data-dock-slot", secondSlot);
    expect(second).toHaveStyle({ width: `${geometry.width}px` });
    expect(JSON.parse(window.localStorage.getItem(panelStateStorageKey("test:split-first")) ?? "{}").dockPlacement.slot).toBe(firstSlot);
  });

  it.each([
    ["top", 40],
    ["full", 400],
    ["bottom", 760],
  ] as const)("docks a panel in the %s zone on the right edge", (slot, clientY) => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    setWorkspaceDimensions(panel);
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const header = screen.getByText("Navigation", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 34, clientX: 120, clientY: 200 });
    fireEvent.pointerMove(panel, { pointerId: 34, clientX: 980, clientY });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-side", "right");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-slot", slot);
    fireEvent.pointerUp(panel, { pointerId: 34, clientX: 980, clientY });

    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    expect(panel).toHaveAttribute("data-dock-side", "right");
    expect(panel).toHaveAttribute("data-dock-column", "0");
    expect(panel).toHaveAttribute("data-dock-slot", slot);
    expect(dockedResizeHandle("test:panel", "w").querySelector("[data-resize-visibility='persistent']")).toBeInTheDocument();
    expect(document.querySelector("[data-panel-resize-owner='test:panel']")).toHaveAttribute("data-dock-slot", slot);
    if (slot !== "full") expect(screen.queryByRole("separator", { name: "Redimensionner la séparation des panneaux" })).not.toBeInTheDocument();
  });

  it("keeps a left panel unchanged when the other panel is docked on the right", () => {
    window.localStorage.setItem(panelStateStorageKey("test:left-fixed"), JSON.stringify({
      mode: "docked",
      floatingGeometry: geometry,
      dockedWidth: geometry.width,
      dockPlacement: { side: "left", column: 0, slot: "full" },
    }));
    render(
      <section className="map-workspace">
        <FloatingPanelWindow kind="workspace" label="Navigation" storageKey="test:left-fixed" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="cv-workspace-panel__header">Navigation <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
        <FloatingPanelWindow kind="trips" label="Sortie" storageKey="test:right-target" initialGeometry={geometry} minWidth={320} defaultMode="floating" resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="trip-panel-header">Sortie <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
      </section>,
    );
    const first = screen.getByLabelText("Navigation");
    const second = screen.getByLabelText("Sortie");
    setWorkspaceDimensions(first);
    const firstState = window.localStorage.getItem(panelStateStorageKey("test:left-fixed"));

    fireEvent.pointerDown(screen.getByText("Sortie", { selector: "header" }), { button: 0, pointerId: 41, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(second, { pointerId: 41, clientX: 980, clientY: 400 });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-side", "right");
    fireEvent.pointerUp(second, { pointerId: 41, clientX: 980, clientY: 400 });

    expect(first).toHaveAttribute("data-panel-mode", "docked");
    expect(first).toHaveAttribute("data-dock-side", "left");
    expect(first).toHaveAttribute("data-dock-column", "0");
    expect(first).toHaveAttribute("data-dock-slot", "full");
    expect(window.localStorage.getItem(panelStateStorageKey("test:left-fixed"))).toBe(firstState);
    expect(second).toHaveAttribute("data-panel-mode", "docked");
    expect(second).toHaveAttribute("data-dock-side", "right");
    expect(second).toHaveAttribute("data-dock-column", "0");
    expect(second).toHaveAttribute("data-dock-slot", "full");
  });

  it("docks on the right when the panel edge reaches the workspace before the pointer", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    setWorkspaceDimensions(panel);
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const header = screen.getByText("Navigation", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 35, clientX: 120, clientY: 200 });
    fireEvent.pointerMove(panel, { pointerId: 35, clientX: 700, clientY: 400 });

    expect(panel).toHaveStyle({ left: "568px" });
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveAttribute("data-dock-side", "right");
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveStyle({ left: "566px", top: "0px" });
    fireEvent.pointerUp(panel, { pointerId: 35, clientX: 700, clientY: 400 });

    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    expect(panel).toHaveAttribute("data-dock-side", "right");
    expect(panel).toHaveAttribute("data-dock-slot", "full");
  });

  it("reveals cardinal handles and keeps the active edge visible during resize", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const right = panel.querySelector<HTMLElement>("[data-resize-edge='e']")!;
    const bottom = panel.querySelector<HTMLElement>("[data-resize-edge='s']")!;
    const corner = panel.querySelector<HTMLElement>("[data-resize-edge='se']")!;

    expect(right.querySelector(".cv-floating-panel-window__resize-indicator")).toBeInTheDocument();
    expect(bottom.querySelector(".cv-floating-panel-window__resize-indicator")).toBeInTheDocument();
    expect(corner.querySelector(".cv-floating-panel-window__resize-indicator")).not.toBeInTheDocument();

    fireEvent.pointerEnter(right, { pointerId: 4 });
    expect(right).toHaveClass("is-hovered");
    expect(panel).toHaveAttribute("data-resize-hovered-edge", "e");
    fireEvent.pointerDown(right, { button: 0, pointerId: 4, clientX: 420, clientY: 200 });
    expect(document.body).toHaveAttribute("data-cv-panel-resize-edge", "e");
    fireEvent.pointerLeave(right, { pointerId: 4 });
    expect(right).not.toHaveClass("is-hovered");
    expect(right).toHaveClass("is-active");
    expect(panel).toHaveAttribute("data-resize-active-edge", "e");

    fireEvent.pointerMove(panel, { pointerId: 4, clientX: 480, clientY: 200 });
    expect(panel).toHaveStyle({ width: "380px" });
    fireEvent.pointerUp(panel, { pointerId: 4, clientX: 480, clientY: 200 });
    expect(right).not.toHaveClass("is-active");
    expect(panel).not.toHaveAttribute("data-resize-active-edge");
    expect(document.body).not.toHaveAttribute("data-cv-panel-resize-edge");

    fireEvent.pointerDown(bottom, { button: 0, pointerId: 7, clientX: 200, clientY: 560 });
    fireEvent.pointerCancel(panel, { pointerId: 7, clientX: 200, clientY: 560 });
    expect(bottom).not.toHaveClass("is-active");
    expect(panel).not.toHaveAttribute("data-resize-active-edge");
  });

  it("offers only a persistent right resize handle while docked", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    const handles = document.querySelectorAll<HTMLElement>("[data-panel-resize-owner='test:panel'] [data-resize-edge]");

    expect([...handles].map((handle) => handle.dataset.resizeEdge)).toEqual(["e"]);
    expect(handles[0]).toHaveAttribute("aria-orientation", "vertical");
    expect(handles[0].querySelector("[data-resize-visibility='persistent']")).toBeInTheDocument();
    expect(panel).toHaveStyle({ "--cv-panel-resize-hit-zone": `${PANEL_LAYOUT.resizeHitZone}px`, "--cv-panel-docked-grip-width": `${PANEL_LAYOUT.dockedGripWidth}px`, "--cv-panel-docked-grip-height": `${PANEL_LAYOUT.dockedGripHeight}px` });
  });

  it("keeps docked pointer and keyboard resize within min and max width without moving the panel", () => {
    renderPanel(500);
    const panel = screen.getByLabelText("Navigation");
    const workspace = panel.closest<HTMLElement>(".map-workspace")!;
    Object.defineProperty(workspace, "clientWidth", { configurable: true, value: 1000 });
    Object.defineProperty(workspace, "clientHeight", { configurable: true, value: 800 });
    const right = dockedResizeHandle("test:panel", "e");

    fireEvent.pointerDown(right, { button: 0, pointerId: 8, clientX: 420, clientY: 200 });
    fireEvent.pointerMove(right, { pointerId: 8, clientX: 900, clientY: 200 });
    fireEvent.pointerUp(right, { pointerId: 8, clientX: 900, clientY: 200 });
    expect(panel).toHaveStyle({ left: "0px", width: "514px" });

    fireEvent.keyDown(right, { key: "ArrowRight", shiftKey: true });
    expect(panel).toHaveStyle({ width: "514px" });
    for (let index = 0; index < 5; index += 1) fireEvent.keyDown(right, { key: "ArrowLeft", shiftKey: true });
    expect(panel).toHaveStyle({ left: "0px", width: "334px" });
  });

  it("resizes stacked panel heights with one shared horizontal separator", async () => {
    window.localStorage.setItem(panelStateStorageKey("test:split-top"), JSON.stringify({ mode: "docked", floatingGeometry: geometry, dockedWidth: geometry.width, dockPlacement: { side: "left", column: 0, slot: "top" } }));
    window.localStorage.setItem(panelStateStorageKey("test:split-bottom"), JSON.stringify({ mode: "docked", floatingGeometry: geometry, dockedWidth: geometry.width, dockPlacement: { side: "left", column: 0, slot: "bottom" } }));
    render(
      <section className="map-workspace">
        <FloatingPanelWindow kind="workspace" label="Navigation" storageKey="test:split-top" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="cv-workspace-panel__header">Navigation <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
        <FloatingPanelWindow kind="trips" label="Sortie" storageKey="test:split-bottom" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="trip-panel-header">Sortie <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
      </section>,
    );
    const top = screen.getByLabelText("Navigation");
    const workspace = setWorkspaceDimensions(top);
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) });
    const separator = await screen.findByRole("separator", { name: "Redimensionner la séparation des panneaux" });
    expect(separator.querySelector(".cv-floating-panel-window__resize-indicator")).toBeInTheDocument();

    fireEvent.pointerDown(separator, { button: 0, pointerId: 52, clientY: 400 });
    fireEvent.pointerMove(separator, { pointerId: 52, clientY: 520 });
    fireEvent.pointerUp(separator, { pointerId: 52, clientY: 520 });

    expect(workspace.style.getPropertyValue("--cv-dock-split-top")).toBe("65%");
    expect(window.localStorage.getItem(dockSplitStorageKey("left", 0))).toBe("0.65");
    fireEvent.keyDown(separator, { key: "ArrowUp" });
    expect(workspace.style.getPropertyValue("--cv-dock-split-top")).toBe("62.5%");
    fireEvent.doubleClick(separator);
    expect(workspace.style.getPropertyValue("--cv-dock-split-top")).toBe("50%");
    expect(separator).toHaveAttribute("aria-valuenow", "50");
    expect(window.localStorage.getItem(dockSplitStorageKey("left", 0))).toBe("0.5");
    const lowerHitArea = document.querySelector<HTMLElement>(".cv-floating-panel-window__dock-split-hit-complement")!;
    fireEvent.pointerDown(lowerHitArea, { button: 0, pointerId: 56, clientY: 400 });
    fireEvent.pointerMove(lowerHitArea, { pointerId: 56, clientY: 440 });
    fireEvent.pointerUp(lowerHitArea, { pointerId: 56, clientY: 440 });
    expect(workspace.style.getPropertyValue("--cv-dock-split-top")).toBe("55.00000000000001%");
    expect(separator).toHaveAttribute("aria-valuenow", "55");
    fireEvent.doubleClick(lowerHitArea);
    expect(workspace.style.getPropertyValue("--cv-dock-split-top")).toBe("50%");
  });

  it("keeps the width of vertically stacked panels synchronized", () => {
    window.localStorage.setItem(panelStateStorageKey("test:width-top"), JSON.stringify({ mode: "docked", floatingGeometry: geometry, dockedWidth: geometry.width, dockPlacement: { side: "left", column: 0, slot: "top" } }));
    window.localStorage.setItem(panelStateStorageKey("test:width-bottom"), JSON.stringify({ mode: "docked", floatingGeometry: geometry, dockedWidth: geometry.width, dockPlacement: { side: "left", column: 0, slot: "bottom" } }));
    render(
      <section className="map-workspace">
        <FloatingPanelWindow kind="workspace" label="Navigation" storageKey="test:width-top" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="cv-workspace-panel__header">Navigation <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
        <FloatingPanelWindow kind="trips" label="Sortie" storageKey="test:width-bottom" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="trip-panel-header">Sortie <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
      </section>,
    );
    const top = screen.getByLabelText("Navigation");
    const bottom = screen.getByLabelText("Sortie");
    setWorkspaceDimensions(top);
    const handle = dockedResizeHandle("test:width-top", "e");
    expect(document.querySelectorAll(".cv-docked-track-resize-overlay[data-dock-side='left'][data-dock-column='0']")).toHaveLength(1);
    expect(document.querySelector(".cv-docked-track-resize-overlay[data-panel-resize-owner='test:width-top']")).toHaveAttribute("data-dock-stacked", "true");

    fireEvent.pointerDown(handle, { button: 0, pointerId: 53, clientX: 420, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 53, clientX: 500, clientY: 200 });
    fireEvent.pointerUp(handle, { pointerId: 53, clientX: 500, clientY: 200 });

    expect(top).toHaveStyle({ width: "514px" });
    expect(bottom).toHaveStyle({ width: "514px" });
    expect(JSON.parse(window.localStorage.getItem(panelStateStorageKey("test:width-bottom")) ?? "{}").dockedWidth).toBe(500);
  });

  it("resizes panels on opposite sides independently", () => {
    window.localStorage.setItem(panelStateStorageKey("test:width-left"), JSON.stringify({ mode: "docked", floatingGeometry: geometry, dockedWidth: geometry.width, dockPlacement: { side: "left", column: 0, slot: "full" } }));
    window.localStorage.setItem(panelStateStorageKey("test:width-right"), JSON.stringify({ mode: "docked", floatingGeometry: geometry, dockedWidth: geometry.width, dockPlacement: { side: "right", column: 0, slot: "full" } }));
    render(
      <section className="map-workspace">
        <FloatingPanelWindow kind="workspace" label="Navigation" storageKey="test:width-left" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="cv-workspace-panel__header">Navigation <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
        <FloatingPanelWindow kind="trips" label="Sortie" storageKey="test:width-right" initialGeometry={geometry} minWidth={320} resetVersion={0} active onActivate={vi.fn()}>
          <aside><header className="trip-panel-header">Sortie <PanelWindowControls /></header></aside>
        </FloatingPanelWindow>
      </section>,
    );
    const left = screen.getByLabelText("Navigation");
    const right = screen.getByLabelText("Sortie");
    setWorkspaceDimensions(left);

    const leftHandle = dockedResizeHandle("test:width-left", "e");
    fireEvent.pointerDown(leftHandle, { button: 0, pointerId: 54, clientX: 420, clientY: 200 });
    fireEvent.pointerMove(leftHandle, { pointerId: 54, clientX: 480, clientY: 200 });
    fireEvent.pointerUp(leftHandle, { pointerId: 54, clientX: 480, clientY: 200 });
    expect(left).toHaveStyle({ width: "494px" });
    expect(right).toHaveStyle({ width: "434px" });

    const rightHandle = dockedResizeHandle("test:width-right", "w");
    fireEvent.pointerDown(rightHandle, { button: 0, pointerId: 55, clientX: 580, clientY: 200 });
    fireEvent.pointerMove(rightHandle, { pointerId: 55, clientX: 520, clientY: 200 });
    fireEvent.pointerUp(rightHandle, { pointerId: 55, clientX: 520, clientY: 200 });
    expect(left).toHaveStyle({ width: "494px" });
    expect(right).toHaveStyle({ width: "494px" });
  });

  it("keeps floating resize within the configured min and max width", () => {
    renderPanel(600);
    const panel = screen.getByLabelText("Navigation");
    const workspace = panel.closest<HTMLElement>(".map-workspace")!;
    Object.defineProperty(workspace, "clientWidth", { configurable: true, value: 1000 });
    Object.defineProperty(workspace, "clientHeight", { configurable: true, value: 800 });
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const right = panel.querySelector<HTMLElement>("[data-resize-edge='e']")!;

    fireEvent.pointerDown(right, { button: 0, pointerId: 5, clientX: 420, clientY: 200 });
    fireEvent.pointerMove(panel, { pointerId: 5, clientX: -100, clientY: 200 });
    fireEvent.pointerUp(panel, { pointerId: 5, clientX: -100, clientY: 200 });
    expect(panel).toHaveStyle({ width: "320px" });

    fireEvent.pointerDown(right, { button: 0, pointerId: 6, clientX: 320, clientY: 200 });
    fireEvent.pointerMove(panel, { pointerId: 6, clientX: 900, clientY: 200 });
    fireEvent.pointerUp(panel, { pointerId: 6, clientX: 900, clientY: 200 });
    expect(panel).toHaveStyle({ width: "600px" });
  });

  it("rejects an invalid stored state", () => {
    window.localStorage.setItem(panelStateStorageKey("broken"), JSON.stringify({ mode: "locked", floatingGeometry: { x: "bad" } }));
    expect(readPanelState("broken", geometry, "docked")).toEqual({ mode: "docked", floatingGeometry: geometry });
  });
});
