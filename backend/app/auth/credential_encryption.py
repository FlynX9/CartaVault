from __future__ import annotations

from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken

from app.config import credential_settings


CURRENT_ENCRYPTION_VERSION = 1


class CredentialEncryptionError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class EncryptedCredential:
    ciphertext: str
    version: int


class CredentialEncryptionService:
    def __init__(self, master_key: str):
        if not master_key:
            raise CredentialEncryptionError("CREDENTIAL_STORAGE_UNAVAILABLE", "Le stockage sécurisé des clés utilisateur n’est pas configuré sur ce serveur.")
        try:
            self._fernet = Fernet(master_key.encode("ascii"))
        except (ValueError, UnicodeEncodeError) as error:
            raise CredentialEncryptionError("CREDENTIAL_STORAGE_UNAVAILABLE", "Le stockage sécurisé des clés utilisateur n’est pas configuré correctement.") from error

    @classmethod
    def configured(cls) -> bool:
        try:
            cls(credential_settings.encryption_key)
        except CredentialEncryptionError:
            return False
        return True

    @classmethod
    def from_settings(cls) -> "CredentialEncryptionService":
        return cls(credential_settings.encryption_key)

    def encrypt(self, plaintext: str) -> EncryptedCredential:
        if not plaintext:
            raise CredentialEncryptionError("CREDENTIAL_VALUE_INVALID", "La clé Google Routes ne peut pas être vide.")
        token = self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")
        return EncryptedCredential(token, CURRENT_ENCRYPTION_VERSION)

    def decrypt(self, ciphertext: str, version: int) -> str:
        if version != CURRENT_ENCRYPTION_VERSION:
            raise CredentialEncryptionError("USER_CREDENTIAL_DECRYPTION_FAILED", "La clé Google enregistrée ne peut plus être utilisée. Veuillez la remplacer.")
        try:
            return self._fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeError, ValueError) as error:
            raise CredentialEncryptionError("USER_CREDENTIAL_DECRYPTION_FAILED", "La clé Google enregistrée ne peut plus être utilisée. Veuillez la remplacer.") from error
