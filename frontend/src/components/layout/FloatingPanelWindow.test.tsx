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
    fireEvent.click(screen.getByRole("button", { name: "Détacher le panneau" }));
    const header = screen.getByText("Navigation", { selector: "header" });

    fireEvent.pointerDown(header, { button: 0, pointerId: 3, clientX: 120, clientY: 30 });
    fireEvent.pointerMove(panel, { pointerId: 3, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(panel, { pointerId: 3, clientX: 20, clientY: 30 });

    expect(panel).toHaveAttribute("data-panel-mode", "docked");
    expect(screen.getByRole("button", { name: "Détacher le panneau" })).toBeInTheDocument();
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
