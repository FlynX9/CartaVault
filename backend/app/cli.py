from __future__ import annotations

import argparse
import getpass
import os
import sys

from sqlalchemy import MetaData, Table, func, insert, or_, select, update
from sqlalchemy.exc import SQLAlchemyError

import app.models  # noqa: F401
from app.auth.security import hash_password, normalize_email
from app.config import security_settings
from app.database import SessionLocal
from app.places.models import Place
from app.places.reverse_geocoding import (
    ReverseGeocodingError,
    apply_region_resolution,
    get_reverse_geocoder,
)
from app.quotas.models import UNLIMITED_PROFILE_ID


def _bootstrap_tables(bind):
    metadata = MetaData()
    return (
        Table("users", metadata, autoload_with=bind),
        Table("poi_maps", metadata, autoload_with=bind),
        Table("map_memberships", metadata, autoload_with=bind),
    )


def create_admin(email: str | None = None, name: str | None = None, password: str | None = None) -> int:
    email = normalize_email(email or input("Email: "))
    name = (name or input("Display name: ")).strip()
    password = password or getpass.getpass("Password: ")
    if len(password) < security_settings.password_min_length:
        print(f"Password must contain at least {security_settings.password_min_length} characters.", file=sys.stderr)
        return 2
    with SessionLocal() as session:
        try:
            users, poi_maps, map_memberships = _bootstrap_tables(session.get_bind())
            if session.scalar(select(users.c.id).where(users.c.email == email)) is not None:
                print("A user with this email already exists.", file=sys.stderr)
                return 1
            user_values = {
                "email": email,
                "display_name": name,
                "password_hash": hash_password(password),
                "is_admin": True,
                "is_active": True,
            }
            if "quota_profile_id" in users.c:
                user_values["quota_profile_id"] = UNLIMITED_PROFILE_ID
            user_id = session.scalar(
                insert(users).values(**user_values).returning(users.c.id)
            )
            orphan_map_ids = session.scalars(
                select(poi_maps.c.id).where(poi_maps.c.owner_id.is_(None))
            ).all()
            for map_id in orphan_map_ids:
                session.execute(
                    update(poi_maps)
                    .where(poi_maps.c.id == map_id)
                    .values(owner_id=user_id)
                )
                session.execute(
                    insert(map_memberships).values(
                        map_id=map_id,
                        user_id=user_id,
                        role="owner",
                    )
                )
            session.commit()
        except SQLAlchemyError:
            session.rollback()
            print("Administrator creation failed; no changes were saved.", file=sys.stderr)
            return 1
        print(f"Administrator created: {email}; {len(orphan_map_ids)} orphan map(s) assigned.")
    return 0


def bootstrap_from_environment(*, allow_missing: bool = False) -> int:
    with SessionLocal() as session:
        users, _, _ = _bootstrap_tables(session.get_bind())
        active_administrator_count = session.scalar(
            select(func.count())
            .select_from(users)
            .where(users.c.is_admin.is_(True), users.c.is_active.is_(True))
        ) or 0
        if active_administrator_count > 0:
            print("Bootstrap skipped: an active administrator already exists.")
            return 0
        if (session.scalar(select(func.count()).select_from(users)) or 0) > 0:
            print(
                "Bootstrap refused: users exist but no active administrator is available.",
                file=sys.stderr,
            )
            return 1
    values = (
        os.getenv("CARTAVAULT_BOOTSTRAP_ADMIN_EMAIL"),
        os.getenv("CARTAVAULT_BOOTSTRAP_ADMIN_NAME"),
        os.getenv("CARTAVAULT_BOOTSTRAP_ADMIN_PASSWORD"),
    )
    if not all(values):
        if allow_missing:
            print(
                "Bootstrap deferred: no active administrator exists and the "
                "initial setup wizard will create one."
            )
            return 0
        print(
            "Bootstrap variables are required when no active administrator exists.",
            file=sys.stderr,
        )
        return 2
    return create_admin(*values)


def refresh_missing_regions(limit: int, *, include_existing: bool = False) -> int:
    """Progressively enrich places that have not been resolved; safe to rerun."""

    geocoder = get_reverse_geocoder()
    resolved = failed = 0
    with SessionLocal() as session:
        pending_resolution = Place.region_resolved_at.is_(None)
        if not include_existing:
            pending_resolution = (
                pending_resolution
                & Place.region_manually_overridden.is_(False)
                & or_(Place.region.is_(None), func.btrim(Place.region) == "")
            )
        rows = session.execute(
            select(
                Place,
                func.ST_Y(Place.location).label("latitude"),
                func.ST_X(Place.location).label("longitude"),
            )
            .where(
                Place.deleted_at.is_(None),
                Place.location.is_not(None),
                pending_resolution,
            )
            .order_by(Place.created_at, Place.id)
            .limit(limit)
        ).all()
        for place, latitude, longitude in rows:
            try:
                apply_region_resolution(
                    place,
                    geocoder.reverse(float(latitude), float(longitude)),
                )
                session.commit()
                resolved += 1
            except ReverseGeocodingError as error:
                session.rollback()
                failed += 1
                print(
                    f"Region refresh skipped for {place.id}: {error.code}",
                    file=sys.stderr,
                )
    print(f"Region refresh complete: {resolved} resolved, {failed} failed.")
    return 0 if failed == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    subcommands = parser.add_subparsers(dest="command", required=True)
    create = subcommands.add_parser("create-admin")
    create.add_argument("--email")
    create.add_argument("--name")
    subcommands.add_parser("bootstrap-admin")
    refresh = subcommands.add_parser("refresh-regions")
    refresh.add_argument("--limit", type=int, default=100)
    refresh.add_argument(
        "--all",
        action="store_true",
        help=(
            "also resolve legacy/manual regions that have never been resolved "
            "automatically"
        ),
    )
    args = parser.parse_args()
    if args.command == "create-admin":
        return create_admin(args.email, args.name)
    if args.command == "refresh-regions":
        if args.limit <= 0:
            print("--limit must be a positive integer", file=sys.stderr)
            return 2
        return refresh_missing_regions(args.limit, include_existing=args.all)
    return bootstrap_from_environment()


if __name__ == "__main__":
    raise SystemExit(main())
