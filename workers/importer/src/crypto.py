import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class EncryptionService:
    def __init__(self) -> None:
        self.key = base64.b64decode(os.environ["PII_ENCRYPTION_KEY"])
        if len(self.key) != 32:
            raise ValueError("PII_ENCRYPTION_KEY must decode to 32 bytes")

    def encrypt(self, value: str) -> str:
        nonce = os.urandom(12)
        encrypted_with_tag = AESGCM(self.key).encrypt(nonce, value.encode(), None)
        ciphertext, tag = encrypted_with_tag[:-16], encrypted_with_tag[-16:]
        encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b"=").decode()
        return f"v1.{encode(nonce)}.{encode(tag)}.{encode(ciphertext)}"
