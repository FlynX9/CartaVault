import { describe, expect, it } from "vitest";

import type { PoiMap } from "../types/map";
import { deriveNavigationMode } from "./navigationMode";

const map = (id: string) => ({ id } as PoiMap);

describe("deriveNavigationMode", () => {
  const maps = [map("map-1"), map("map-2")];

  it.each(["/dashboard", "/maps", "/medias", "/trash"]) (
    "returns GLOBAL_MODE for %s",
    (pathname) => {
      expect(
        deriveNavigationMode({
          pathname,
          maps,
          rememberedMapId: "map-1",
          activeTrip: null,
        }),
      ).toEqual({ kind: "GLOBAL_MODE", rememberedMapId: "map-1" });
    },
  );

  it("returns MAP_MODE for an accessible map route", () => {
    expect(
      deriveNavigationMode({
        pathname: "/maps/map-2/places",
        maps,
        rememberedMapId: "map-1",
        activeTrip: null,
      }),
    ).toEqual({ kind: "MAP_MODE", map: maps[1], mapId: "map-2" });
  });

  it("keeps the map trip catalog in MAP_MODE", () => {
    expect(
      deriveNavigationMode({
        pathname: "/maps/map-2/trips",
        maps,
        rememberedMapId: "map-1",
        activeTrip: null,
      }),
    ).toEqual({ kind: "MAP_MODE", map: maps[1], mapId: "map-2" });
  });

  it.each(["/maps/unknown", "/maps/map-3/places"]) (
    "returns GLOBAL_MODE for an inaccessible map route %s",
    (pathname) => {
      expect(
        deriveNavigationMode({
          pathname,
          maps,
          rememberedMapId: "map-1",
          activeTrip: null,
        }),
      ).toEqual({ kind: "GLOBAL_MODE", rememberedMapId: "map-1" });
    },
  );

  it("does not infer MAP_MODE while a trip is loading", () => {
    expect(
      deriveNavigationMode({
        pathname: "/travels/trip-1",
        maps,
        rememberedMapId: "map-2",
        activeTrip: null,
      }),
    ).toEqual({ kind: "GLOBAL_MODE", rememberedMapId: "map-2" });
  });

  it("returns MAP_MODE after a loaded trip is validated against its map", () => {
    expect(
      deriveNavigationMode({
        pathname: "/travels/trip-1",
        maps,
        rememberedMapId: null,
        activeTrip: { id: "trip-1", map_id: "map-2" },
      }),
    ).toEqual({ kind: "MAP_MODE", map: maps[1], mapId: "map-2" });
  });

  it("returns GLOBAL_MODE when a loaded trip points to an inaccessible map", () => {
    expect(
      deriveNavigationMode({
        pathname: "/travels/trip-1",
        maps,
        rememberedMapId: "map-1",
        activeTrip: { id: "trip-1", map_id: "unknown" },
      }),
    ).toEqual({ kind: "GLOBAL_MODE", rememberedMapId: "map-1" });
  });

  it("does not reuse a loaded trip after navigating away from its route", () => {
    expect(
      deriveNavigationMode({
        pathname: "/medias",
        maps,
        rememberedMapId: "map-1",
        activeTrip: { id: "trip-1", map_id: "map-2" },
      }),
    ).toEqual({ kind: "GLOBAL_MODE", rememberedMapId: "map-1" });
  });

  it("uses the map route instead of stale trip data", () => {
    expect(
      deriveNavigationMode({
        pathname: "/maps/map-1",
        maps,
        rememberedMapId: "map-2",
        activeTrip: { id: "trip-1", map_id: "map-2" },
      }),
    ).toEqual({ kind: "MAP_MODE", map: maps[0], mapId: "map-1" });
  });
});
