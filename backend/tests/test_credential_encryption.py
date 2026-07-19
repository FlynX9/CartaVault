from cryptography.fernet import Fernet
import pytest

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService


pytestmark = pytest.mark.unit


def test_credential_encryption_round_trip_is_randomized() -> None:
    service = CredentialEncryptionService(Fernet.generate_key().decode())
    first = service.encrypt("fake-google-key-a")
    second = service.encrypt("fake-google-key-a")
    assert first.ciphertext != "fake-google-key-a"
    assert first.ciphertext != second.ciphertext
    assert service.decrypt(first.ciphertext, first.version) == "fake-google-key-a"


def test_credential_encryption_rejects_tampering_wrong_key_and_unknown_version() -> None:
    service = CredentialEncryptionService(Fernet.generate_key().decode())
    encrypted = service.encrypt("fake-google-key-a")
    for ciphertext, version, decryptor in (
        (encrypted.ciphertext[:-2] + "xx", encrypted.version, service),
        (encrypted.ciphertext, encrypted.version, CredentialEncryptionService(Fernet.generate_key().decode())),
        (encrypted.ciphertext, 999, service),
    ):
        with pytest.raises(CredentialEncryptionError) as captured:
            decryptor.decrypt(ciphertext, version)
        assert captured.value.code == "USER_CREDENTIAL_DECRYPTION_FAILED"
        assert "fake-google-key-a" not in str(captured.value)


def test_credential_encryption_requires_a_valid_master_key() -> None:
    for value in ("", "not-a-fernet-key"):
        with pytest.raises(CredentialEncryptionError) as captured:
            CredentialEncryptionService(value)
        assert captured.value.code == "CREDENTIAL_STORAGE_UNAVAILABLE"
