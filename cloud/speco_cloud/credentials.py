"""Credentials of a connection (spec 019, FR-008). They are encrypted before they reach the database with a key that only the service has
(CREDENTIALS_KEY, a Fernet key), so a copy of the database, a backup or a stray query shows ciphertext. Nothing in here is ever logged or returned."""
from __future__ import annotations

import json

from cryptography.fernet import Fernet, InvalidToken


class SecretsError(Exception):
    pass


class Cipher:
    def __init__(self, key: str):
        try:
            self._f = Fernet(key.encode())
        except (ValueError, TypeError) as e:
            raise SecretsError("CREDENTIALS_KEY must be a Fernet key (32 url-safe base64 bytes)") from e

    def encrypt(self, text: str) -> str:
        return self._f.encrypt(text.encode()).decode()

    def decrypt(self, token: str) -> str:
        try:
            return self._f.decrypt(token.encode()).decode()
        except InvalidToken as e:
            raise SecretsError("a stored credential cannot be decrypted with this key") from e

    def encrypt_json(self, value: dict) -> str:
        return self.encrypt(json.dumps(value, separators=(",", ":")))

    def decrypt_json(self, token: str) -> dict:
        return json.loads(self.decrypt(token))
