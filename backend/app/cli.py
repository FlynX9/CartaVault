from __future__ import annotations

import argparse
import getpass
import os
import sys

from sqlalchemy import MetaData, Table, func, insert, select, update
from sqlalchemy.exc import SQLAlchemyError

from app.auth.security import hash_password, normalize_email
from app.config import security_settings
from app.database import SessionLocal
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


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    subcommands = parser.add_subparsers(dest="command", required=True)
    create = subcommands.add_parser("create-admin")
    create.add_argument("--email")
    create.add_argument("--name")
    subcommands.add_parser("bootstrap-admin")
    args = parser.parse_args()
    if args.command == "create-admin":
        return create_admin(args.email, args.name)
    return bootstrap_from_environment()


if __name__ == "__main__":
    raise SystemExit(main())
