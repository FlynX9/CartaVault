from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class EmailMessage:
    recipients: list[str]
    subject: str
    html: str
    text: str


class EmailProvider(Protocol):
    def send(self, message: EmailMessage) -> str | None: ...


class EmailDeliveryError(RuntimeError):
    def __init__(self, code: str, message: str = "L’envoi de l’email a échoué.") -> None:
        super().__init__(message)
        self.code = code
