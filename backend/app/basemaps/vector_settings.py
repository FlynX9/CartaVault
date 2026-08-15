from __future__ import annotations

from dataclasses import asdict, dataclass

from sqlalchemy.orm import Session

from app.admin.models import SystemSetting


SETTING_KEY = "vector_basemap"


@dataclass(frozen=True, slots=True)
class VectorBasemapPolicy:
    enabled: bool = True
    preparation_policy: str = "on_first_cartavault_use"
    update_policy: str = "disabled"
    min_zoom: int = 0
    max_zoom: int = 14
    offline_min_zoom: int = 5
    offline_max_zoom: int = 14
    offline_padding_km: int = 20
    offline_max_tiles: int = 25_000


def _normalized(value: dict[str, object] | None) -> VectorBasemapPolicy:
    raw = value or {}
    preparation = str(raw.get("preparation_policy", "on_first_cartavault_use"))
    update = str(raw.get("update_policy", "disabled"))
    if preparation not in {"on_map_creation", "on_first_cartavault_use", "on_first_offline_use", "manual"}:
        preparation = "on_first_cartavault_use"
    if update not in {"disabled", "monthly", "quarterly"}:
        update = "disabled"
    min_zoom = max(0, min(14, int(raw.get("min_zoom", 0))))
    max_zoom = max(min_zoom, min(16, int(raw.get("max_zoom", 14))))
    offline_min = max(min_zoom, min(max_zoom, int(raw.get("offline_min_zoom", 5))))
    offline_max = max(offline_min, min(max_zoom, int(raw.get("offline_max_zoom", 14))))
    return VectorBasemapPolicy(
        enabled=bool(raw.get("enabled", True)), preparation_policy=preparation, update_policy=update,
        min_zoom=min_zoom, max_zoom=max_zoom, offline_min_zoom=offline_min, offline_max_zoom=offline_max,
        offline_padding_km=max(0, min(500, int(raw.get("offline_padding_km", 20)))),
        offline_max_tiles=max(100, min(250_000, int(raw.get("offline_max_tiles", 25_000)))),
    )


def get_vector_basemap_policy(session: Session) -> VectorBasemapPolicy:
    setting = session.get(SystemSetting, SETTING_KEY)
    return _normalized(setting.value if setting else None)


def set_vector_basemap_policy(session: Session, policy: VectorBasemapPolicy) -> VectorBasemapPolicy:
    normalized = _normalized(asdict(policy))
    setting = session.get(SystemSetting, SETTING_KEY)
    if setting is None:
        session.add(SystemSetting(key=SETTING_KEY, value=asdict(normalized)))
    else:
        setting.value = asdict(normalized)
    session.commit()
    return normalized
