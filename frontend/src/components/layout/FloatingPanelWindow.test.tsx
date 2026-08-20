import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FloatingPanelWindow, PANEL_LAYOUT, panelStateStorageKey, readPanelState } from "./FloatingPanelWindow";
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

describe("FloatingPanelWindow", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("uses the three explicit modes and persists transitions", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    expect(panel.querySelectorAll(".cv-floating-panel-window__resize-indicator")).toHaveLength(1);
    expect(panel.querySelector("[data-resize-edge='e'] [data-resize-visibility='persistent']")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    expect(panel).toHaveAttribute("data-panel-mode", "floating");
    expect(panel.querySelectorAll(".cv-floating-panel-window__resize-indicator")).toHaveLength(4);
    const attachButton = screen.getByRole("button", { name: "Attacher le panneau" });
    expect(attachButton).toHaveAttribute("title", "Attacher le panneau");
    expect(attachButton.querySelector("[data-panel-attachment-icon='attach']")).toBeInTheDocument();
    expect(screen.getAllByRole("separator", { name: "Redimensionner Navigation" })).toHaveLength(8);

    fireEvent.click(attachButton);
    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    const detachButton = screen.getByRole("button", { name: "Détacher le panneau" });
    expect(detachButton).toHaveAttribute("title", "Détacher le panneau");
    expect(detachButton.querySelector("[data-panel-attachment-icon='detach']")).toBeInTheDocument();

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

  it("does not start a panel drag from an attachment button", () => {
    renderPanel();
    const panel = screen.getByLabelText("Navigation");
    const detachButton = screen.getByRole("button", { name: "Détacher le panneau" });

    fireEvent.pointerDown(detachButton, { button: 0, pointerId: 2, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(panel, { pointerId: 2, clientX: 180, clientY: 80 });

    expect(panel).toHaveAttribute("data-panel-mode", "docked");
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
      left: "664px",
      top: "400px",
      width: "336px",
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
    expect(panel.querySelector("[data-resize-edge='w'] [data-resize-visibility='persistent']")).toBeInTheDocument();
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
    expect(document.querySelector(".cv-panel-dock-preview")).toHaveStyle({ left: "580px", top: "0px" });
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
    const handles = panel.querySelectorAll<HTMLElement>("[data-resize-edge]");

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
    const right = panel.querySelector<HTMLElement>("[data-resize-edge='e']")!;

    fireEvent.pointerDown(right, { button: 0, pointerId: 8, clientX: 420, clientY: 200 });
    fireEvent.pointerMove(panel, { pointerId: 8, clientX: 900, clientY: 200 });
    fireEvent.pointerUp(panel, { pointerId: 8, clientX: 900, clientY: 200 });
    expect(panel).toHaveStyle({ left: "0px", width: "500px" });

    fireEvent.keyDown(right, { key: "ArrowRight", shiftKey: true });
    expect(panel).toHaveStyle({ width: "500px" });
    for (let index = 0; index < 5; index += 1) fireEvent.keyDown(right, { key: "ArrowLeft", shiftKey: true });
    expect(panel).toHaveStyle({ left: "0px", width: "320px" });
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
