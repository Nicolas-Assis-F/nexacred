import math
import hashlib
import hmac
import re
from decimal import Decimal, InvalidOperation
from typing import Any
import phonenumbers

def digits(value: Any) -> str:
    if isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer(): return ""
        value = int(value)
    return re.sub(r"\D", "", str(value or ""))

def valid_cpf(value: Any) -> bool:
    cpf = digits(value).zfill(11)
    if len(cpf) != 11 or len(set(cpf)) == 1:
        return False
    for length in (9, 10):
        total = sum(int(cpf[index]) * (length + 1 - index) for index in range(length))
        result = (total * 10) % 11
        expected = 0 if result == 10 else result
        if expected != int(cpf[length]):
            return False
    return True

def normalize_cpf(value: Any) -> str | None:
    cpf = digits(value).zfill(11)
    return cpf if valid_cpf(cpf) else None

def normalize_phone(value: Any) -> str | None:
    raw = digits(value)
    if not raw:
        return None
    try:
        international = len(raw) in (12,13) and raw.startswith("55")
        parsed = phonenumbers.parse(f"+{raw}" if international else raw, None if international else "BR")
        if not phonenumbers.is_valid_number(parsed) or parsed.country_code != 55:
            return None
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        return None

def normalize_email(value: Any) -> str | None:
    email = str(value or "").strip().lower()
    return email if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) else None

def normalize_name(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())

def normalize_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    text = str(value).strip().replace("R$", "").strip()
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        result = Decimal(text).quantize(Decimal("0.01"))
        return result if result.is_finite() else None
    except InvalidOperation:
        return None

def identity_hmac(value: str, secret: str) -> str:
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()
