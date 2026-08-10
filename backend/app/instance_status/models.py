from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InstanceLog(Base):
    """Sanitised operational events retained for the administration console."""

    __tablename__ = "instance_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
    level: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    component: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    logger: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
