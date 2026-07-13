"""normalize countries maps and places

Revision ID: 6f2d8a4c91b0
Revises: 00e9ed556b82
Create Date: 2026-07-13 18:30:00
"""

from collections.abc import Sequence
import unicodedata
from uuid import UUID, uuid5

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.countries.catalog import load_country_catalog


revision: str = "6f2d8a4c91b0"
down_revision: str | Sequence[str] | None = "00e9ed556b82"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MAP_NAMESPACE = UUID("b63a5ca5-9e71-5dbf-a3ea-8ecfe136c09a")
EXPLICIT_COUNTRY_ALIASES = {
    "french republic": "FRA",
    "republique francaise": "FRA",
}


def normalize_country(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.strip().casefold())
    return " ".join(
        "".join(character for character in decomposed if not unicodedata.combining(character)).split()
    )


def build_country_lookup(catalog: tuple[dict[str, object], ...]) -> dict[str, dict[str, object]]:
    lookup: dict[str, dict[str, object]] = {}
    for country in catalog:
        for value in (country["name"], country["iso_alpha2"], country["iso_alpha3"]):
            key = normalize_country(str(value))
            if key in lookup and lookup[key]["iso_alpha3"] != country["iso_alpha3"]:
                raise RuntimeError(f"Ambiguous country catalogue key: {value!r}")
            lookup[key] = country
    by_iso3 = {str(country["iso_alpha3"]): country for country in catalog}
    for alias, iso_alpha3 in EXPLICIT_COUNTRY_ALIASES.items():
        lookup[normalize_country(alias)] = by_iso3[iso_alpha3]
    return lookup


def upgrade() -> None:
    op.create_table(
        "countries",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("iso_alpha2", sa.String(length=2), nullable=False),
        sa.Column("iso_alpha3", sa.String(length=3), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("center_latitude", sa.Float(), nullable=False),
        sa.Column("center_longitude", sa.Float(), nullable=False),
        sa.Column("default_zoom", sa.SmallInteger(), nullable=False),
        sa.Column("min_latitude", sa.Float(), nullable=True),
        sa.Column("max_latitude", sa.Float(), nullable=True),
        sa.Column("min_longitude", sa.Float(), nullable=True),
        sa.Column("max_longitude", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("iso_alpha2 = upper(iso_alpha2)", name="countries_iso_alpha2_uppercase"),
        sa.CheckConstraint("iso_alpha3 = upper(iso_alpha3)", name="countries_iso_alpha3_uppercase"),
        sa.CheckConstraint("center_latitude BETWEEN -90 AND 90", name="countries_center_latitude_range"),
        sa.CheckConstraint("center_longitude BETWEEN -180 AND 180", name="countries_center_longitude_range"),
        sa.CheckConstraint("default_zoom BETWEEN 1 AND 18", name="countries_default_zoom_range"),
        sa.CheckConstraint("(min_latitude IS NULL AND max_latitude IS NULL AND min_longitude IS NULL AND max_longitude IS NULL) OR (min_latitude IS NOT NULL AND max_latitude IS NOT NULL AND min_longitude IS NOT NULL AND max_longitude IS NOT NULL AND min_latitude BETWEEN -90 AND 90 AND max_latitude BETWEEN -90 AND 90 AND min_longitude BETWEEN -180 AND 180 AND max_longitude BETWEEN -180 AND 180 AND min_latitude < max_latitude AND min_longitude < max_longitude)", name="countries_bounds_consistency"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("iso_alpha2"),
        sa.UniqueConstraint("iso_alpha3"),
        sa.UniqueConstraint("name"),
    )

    catalog = load_country_catalog()
    country_table = sa.table(
        "countries",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("iso_alpha2", sa.String()),
        sa.column("iso_alpha3", sa.String()),
        sa.column("name", sa.String()),
        sa.column("center_latitude", sa.Float()),
        sa.column("center_longitude", sa.Float()),
        sa.column("default_zoom", sa.SmallInteger()),
    )
    op.bulk_insert(country_table, [dict(country) for country in catalog])

    op.create_table(
        "poi_maps",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("country_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("center_latitude", sa.Float(), nullable=True),
        sa.Column("center_longitude", sa.Float(), nullable=True),
        sa.Column("default_zoom", sa.SmallInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("(center_latitude IS NULL AND center_longitude IS NULL) OR (center_latitude IS NOT NULL AND center_longitude IS NOT NULL AND center_latitude BETWEEN -90 AND 90 AND center_longitude BETWEEN -180 AND 180)", name="poi_maps_center_consistency"),
        sa.CheckConstraint("default_zoom IS NULL OR default_zoom BETWEEN 1 AND 18", name="poi_maps_default_zoom_range"),
        sa.ForeignKeyConstraint(["country_id"], ["countries.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("country_id", name="poi_maps_country_id_key"),
    )
    op.add_column("places", sa.Column("map_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("places_map_id_fkey", "places", "poi_maps", ["map_id"], ["id"], ondelete="RESTRICT")
    op.create_index("places_map_id_idx", "places", ["map_id"], unique=False)

    connection = op.get_bind()
    raw_countries = [row[0] for row in connection.execute(sa.text("SELECT DISTINCT country FROM places ORDER BY country NULLS FIRST"))]
    lookup = build_country_lookup(catalog)
    mappings: dict[str, dict[str, object]] = {}
    unknown: list[str | None] = []
    for raw_country in raw_countries:
        if raw_country is None or not raw_country.strip():
            unknown.append(raw_country)
            continue
        country = lookup.get(normalize_country(raw_country))
        if country is None:
            unknown.append(raw_country)
        else:
            mappings[raw_country] = country

    if unknown:
        raise RuntimeError(f"Cannot migrate places.country values: {unknown!r}")

    for raw_country, country in mappings.items():
        map_id = uuid5(MAP_NAMESPACE, str(country["iso_alpha3"]))
        connection.execute(
            sa.text("INSERT INTO poi_maps (id, name, country_id) VALUES (:id, :name, :country_id) ON CONFLICT (country_id) DO NOTHING"),
            {"id": map_id, "name": country["name"], "country_id": country["id"]},
        )
        connection.execute(
            sa.text("UPDATE places SET map_id = :map_id WHERE country = :country"),
            {"map_id": map_id, "country": raw_country},
        )

    remaining = connection.scalar(sa.text("SELECT count(*) FROM places WHERE map_id IS NULL"))
    if remaining:
        raise RuntimeError(f"Cannot finish map migration: {remaining} place(s) remain without a map")

    op.alter_column("places", "map_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_column("places", "country")


def downgrade() -> None:
    op.add_column("places", sa.Column("country", sa.String(length=100), nullable=True))
    op.execute(sa.text("UPDATE places SET country = countries.name FROM poi_maps, countries WHERE places.map_id = poi_maps.id AND poi_maps.country_id = countries.id"))
    op.drop_index("places_map_id_idx", table_name="places")
    op.drop_constraint("places_map_id_fkey", "places", type_="foreignkey")
    op.drop_column("places", "map_id")
    op.drop_table("poi_maps")
    op.drop_table("countries")
