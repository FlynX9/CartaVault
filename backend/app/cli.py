from __future__ import annotations

import argparse
import getpass
import os
import sys

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

import app.models  # noqa: F401

from app.auth.models import User
from app.auth.security import hash_password, normalize_email
from app.config import security_settings
from app.database import SessionLocal
from app.maps.models import MapMembership, PoiMap


def create_admin(email: str | None = None, name: str | None = None, password: str | None = None) -> int:
    email = normalize_email(email or input("Email: "))
    name = (name or input("Display name: ")).strip()
    password = password or getpass.getpass("Password: ")
    if len(password) < security_settings.password_min_length:
        print(f"Password must contain at least {security_settings.password_min_length} characters.", file=sys.stderr)
        return 2
    with SessionLocal() as session:
        try:
            if session.scalar(select(User).where(User.email == email)) is not None:
                print("A user with this email already exists.", file=sys.stderr)
                return 1
            user = User(email=email, display_name=name, password_hash=hash_password(password), is_admin=True, is_active=True)
            session.add(user)
            session.flush()
            orphan_maps = session.scalars(select(PoiMap).where(PoiMap.owner_id.is_(None))).all()
            for poi_map in orphan_maps:
                poi_map.owner_id = user.id
                session.add(MapMembership(map_id=poi_map.id, user_id=user.id, role="owner"))
            session.commit()
        except SQLAlchemyError:
            session.rollback()
            print("Administrator creation failed; no changes were saved.", file=sys.stderr)
            return 1
        print(f"Administrator created: {email}; {len(orphan_maps)} orphan map(s) assigned.")
    return 0


def bootstrap_from_environment() -> int:
    values = (
        os.getenv("CARTAVAULT_BOOTSTRAP_ADMIN_EMAIL"),
        os.getenv("CARTAVAULT_BOOTSTRAP_ADMIN_NAME"),
        os.getenv("CARTAVAULT_BOOTSTRAP_ADMIN_PASSWORD"),
    )
    if not all(values):
        print("Bootstrap variables are incomplete.", file=sys.stderr)
        return 2
    with SessionLocal() as session:
        if (session.scalar(select(func.count()).select_from(User)) or 0) > 0:
            print("Bootstrap skipped: at least one user already exists.")
            return 0
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
