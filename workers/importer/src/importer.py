import json
import os
import tempfile
import uuid
import unicodedata
from pathlib import Path
from typing import Any, Iterator
import boto3
import psycopg
from .streaming_workbook import StreamingWorkbook as open_workbook
from .crypto import EncryptionService
from .errors import ImportInputError, describe_error
from .normalization import identity_hmac, normalize_cpf, normalize_decimal, normalize_email, normalize_name, normalize_phone

DEFAULT_MAPPING = {
    "cpf": "CPF", "name": "NOME SERVIDOR", "phone1": "TELEFONE", "phone2": "TELEFONE 2", "email1": "EMAIL", "email2": "EMAIL 2",
    "organizationCode": "ORG", "organization": "NOME ORGÃO", "employmentCode": "COD VINC", "position": "CARGO PRINCIPAL",
    "employmentStatus": "DESC SIT FUNCIONAL", "marginBase": "BASE CALCULO MARGEM CONSIG", "availableMargin": "MARGEM CONSIGNÁVEL",
    "contractsCount": "QUANTIDADES CONTRATOS CONSIG", "currentLoanDiscount": "TOTAL DESCONTADO EMPRÉSTIMO",
}

def header_key(value):
    return " ".join(unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode().upper().split())

class XlsbImporter:
    def __init__(self) -> None:
        self.batch_size = min(2000, max(500, int(os.getenv("IMPORT_BATCH_SIZE", "1000"))))
        self.hmac_secret = os.environ["PII_HMAC_SECRET"]
        self.crypto = EncryptionService()
        self.connection_string = os.environ["DATABASE_URL"].replace("?schema=public", "")
        self.s3 = boto3.client("s3", endpoint_url=f"http{'s' if os.getenv('MINIO_USE_SSL') == 'true' else ''}://{os.getenv('MINIO_ENDPOINT', 'minio')}:{os.getenv('MINIO_PORT', '9000')}", aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"), aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"), region_name="us-east-1")

    def _rows(self, path: Path, sheet_name: str | None, mapping=None) -> Iterator[tuple[int, dict[str, Any]]]:
        with open_workbook(str(path)) as workbook:
            if not workbook.sheets: raise ImportInputError('A planilha não possui abas.')
            requested = (sheet_name or '').strip()
            selected = next((s for s in workbook.sheets if s.casefold() == requested.casefold()), None) if requested else workbook.sheets[0]
            if selected is None: raise ImportInputError('A aba informada não existe. Confira o nome da aba no Excel.')
            with workbook.get_sheet(selected) as sheet:
                iterator = sheet.rows()
                header_row = next(iterator, None)
                if header_row is None:
                    raise ImportInputError('A aba selecionada está vazia.')
                headers = {cell.c: str(cell.v or "").strip() for cell in header_row}
                keys = [header_key(h) for h in headers.values() if h]
                if mapping:
                    for field in ('cpf', 'name'):
                        key = header_key(mapping[field])
                        if key not in keys: raise ImportInputError(f'Cabeçalho obrigatório de {field} não encontrado. Corrija o mapeamento e envie novamente.')
                        if keys.count(key) > 1: raise ImportInputError(f'Existem cabeçalhos duplicados para {field}. Renomeie a coluna na planilha.')
                for row_number, row in enumerate(iterator, start=2):
                    yield row_number, {headers[cell.c]: cell.v for cell in row if cell.c in headers and headers[cell.c]}

    def _value(self, row: dict[str, Any], mapping: dict[str, str], field: str) -> Any:
        header = mapping.get(field)
        if not header: return None
        key = header_key(header)
        return row.get(key)

    def _normalize(self, row: dict[str, Any], mapping: dict[str, str]) -> tuple[dict[str, Any] | None, str | None]:
        row = {header_key(name): value for name, value in row.items()}
        cpf = normalize_cpf(self._value(row, mapping, "cpf"))
        name = normalize_name(self._value(row, mapping, "name"))
        if not cpf: return None, "CPF inválido"
        if not name: return None, "Nome ausente"
        contacts: list[tuple[str, str]] = []
        for field in ("phone1", "phone2"):
            phone = normalize_phone(self._value(row, mapping, field))
            if phone and ("PHONE", phone) not in contacts: contacts.append(("PHONE", phone))
        for field in ("email1", "email2"):
            email = normalize_email(self._value(row, mapping, field))
            if email and ("EMAIL", email) not in contacts: contacts.append(("EMAIL", email))
        return {
            "name": name, "cpf": cpf, "cpf_hash": identity_hmac(cpf, self.hmac_secret), "cpf_last4": cpf[-4:], "contacts": contacts,
            "organization": normalize_name(self._value(row, mapping, "organization")) or None,
            "organization_code": normalize_name(self._value(row, mapping, "organizationCode")) or None,
            "employment_code": normalize_name(self._value(row, mapping, "employmentCode")) or None,
            "position": normalize_name(self._value(row, mapping, "position")) or None,
            "employment_status": normalize_name(self._value(row, mapping, "employmentStatus")) or None,
            "margin_base": normalize_decimal(self._value(row, mapping, "marginBase")),
            "available_margin": normalize_decimal(self._value(row, mapping, "availableMargin")),
            "contracts_count": max(0, int(float(self._value(row, mapping, "contractsCount") or 0))),
            "current_loan_discount": normalize_decimal(self._value(row, mapping, "currentLoanDiscount")),
        }, None

    def _persist_batch(self, conn: psycopg.Connection[Any], import_id: str, batch: list[tuple[int, dict[str, Any]]]) -> int:
        duplicates = 0
        with conn.transaction(), conn.cursor() as cursor:
            for row_number, lead in batch:
                lead_id = str(uuid.uuid4())
                cursor.execute('SELECT id FROM "Lead" WHERE "cpfHash"=%s', (lead["cpf_hash"],))
                existing = cursor.fetchone()
                if existing:
                    lead_id = str(existing[0]); duplicates += 1
                if existing and os.getenv("IMPORT_UPDATE_POLICY", "replace") == "preserve":
                    cursor.execute('INSERT INTO "LeadSource" (id,"leadId","importId","sourceRow","seenAt") VALUES (%s,%s,%s,%s,now()) ON CONFLICT DO NOTHING', (str(uuid.uuid4()), lead_id, import_id, row_number))
                    continue
                cursor.execute('''INSERT INTO "Lead" (id,name,"cpfEncrypted","cpfHash","cpfLast4",organization,"organizationCode","employmentCode",position,"employmentStatus","marginBase","availableMargin","contractsCount","currentLoanDiscount","sourceImportId","sourceRow",status,"createdAt","updatedAt")
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ACTIVE',now(),now())
                    ON CONFLICT ("cpfHash") DO UPDATE SET name=EXCLUDED.name, organization=EXCLUDED.organization, position=EXCLUDED.position,"employmentStatus"=EXCLUDED."employmentStatus","marginBase"=EXCLUDED."marginBase","availableMargin"=EXCLUDED."availableMargin","contractsCount"=EXCLUDED."contractsCount","currentLoanDiscount"=EXCLUDED."currentLoanDiscount","sourceImportId"=EXCLUDED."sourceImportId","sourceRow"=EXCLUDED."sourceRow","updatedAt"=now() RETURNING id''',
                    (lead_id, lead["name"], self.crypto.encrypt(lead["cpf"]), lead["cpf_hash"], lead["cpf_last4"], lead["organization"], lead["organization_code"], lead["employment_code"], lead["position"], lead["employment_status"], lead["margin_base"], lead["available_margin"], lead["contracts_count"], lead["current_loan_discount"], import_id, row_number))
                lead_id = str(cursor.fetchone()[0])
                cursor.execute('INSERT INTO "LeadSource" (id,"leadId","importId","sourceRow","seenAt") VALUES (%s,%s,%s,%s,now()) ON CONFLICT DO NOTHING', (str(uuid.uuid4()), lead_id, import_id, row_number))
                for index, (kind, value) in enumerate(lead["contacts"]):
                    value_hash = identity_hmac(value, self.hmac_secret)
                    masked = f"{value[:5]}*****{value[-2:]}" if kind == "PHONE" else f"{value[:2]}***@{value.split('@')[-1]}"
                    cursor.execute('''INSERT INTO "LeadContact" (id,"leadId",type,"valueEncrypted","valueHash","maskedValue",status,"isPrimary","createdAt","updatedAt") VALUES (%s,%s,%s,%s,%s,%s,'VALID',%s,now(),now()) ON CONFLICT ("leadId",type,"valueHash") DO UPDATE SET "updatedAt"=now()''', (str(uuid.uuid4()), lead_id, kind, self.crypto.encrypt(value), value_hash, masked, index == 0))
        return duplicates

    def run(self, import_id: str, storage_key: str) -> dict[str, int]:
        stats = {"processed": 0, "valid": 0, "invalid": 0, "duplicates": 0}
        with psycopg.connect(self.connection_string, autocommit=True) as conn:
            # Protect retries or duplicate jobs from importing the same file concurrently.
            with conn.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_lock(hashtext(%s))", (import_id,))
                cursor.execute('SELECT mapping,"sheetName",status,"processedRows","validRows","invalidRows","duplicateRows" FROM "Import" WHERE id=%s', (import_id,))
                result = cursor.fetchone()
                if not result: raise ValueError("Import not found")
                if result[2] == "COMPLETED": return stats
                mapping = {**DEFAULT_MAPPING, **result[0]}
                stats = dict(zip(stats, result[3:]))
                skip_rows = stats["processed"]
                cursor.execute('UPDATE "Import" SET status=\'PROCESSING\',"startedAt"=coalesce("startedAt",now()),"errorMessage"=NULL WHERE id=%s', (import_id,))
            try:
                with tempfile.TemporaryDirectory(prefix="nexacred-import-") as directory:
                    path = Path(directory) / "source.xlsb"
                    self.s3.download_file(os.getenv("MINIO_BUCKET", "imports"), storage_key, str(path))
                    batch = []
                    errors = []
                    def flush():
                        # Data, errors and checkpoint commit atomically per bounded batch.
                        with conn.transaction(), conn.cursor() as cursor:
                            stats["duplicates"] += self._persist_batch(conn, import_id, batch)
                            cursor.executemany('INSERT INTO "ImportError" (id,"importId","rowNumber",reason,"createdAt") VALUES (%s,%s,%s,%s,now()) ON CONFLICT ("importId","rowNumber") DO NOTHING', errors)
                            cursor.execute('UPDATE "Import" SET "processedRows"=%s,"validRows"=%s,"invalidRows"=%s,"duplicateRows"=%s WHERE id=%s', (stats["processed"],stats["valid"],stats["invalid"],stats["duplicates"],import_id))
                        batch.clear(); errors.clear()
                    for row_number, row in self._rows(path, result[1], mapping):
                        if row_number - 1 <= skip_rows: continue
                        stats["processed"] += 1
                        try:
                            normalized, error = self._normalize(row, mapping)
                        except (ValueError, TypeError, OverflowError):
                            normalized, error = None, "Formato inválido em campo numérico"
                        if normalized is None:
                            stats["invalid"] += 1
                            errors.append((str(uuid.uuid4()), import_id, row_number, error))
                        else:
                            stats["valid"] += 1
                            batch.append((row_number, normalized))
                        if len(batch)+len(errors) >= self.batch_size: flush()
                    flush()
                    with conn.transaction(), conn.cursor() as cursor:
                        cursor.execute('UPDATE "Import" SET status=\'COMPLETED\',"totalRows"=%s,"completedAt"=now() WHERE id=%s', (stats["processed"], import_id))
                        cursor.execute('INSERT INTO "AuditLog" (id,action,"entityType","entityId","createdAt") VALUES (%s,\'IMPORT_COMPLETED\',\'Import\',%s,now())', (str(uuid.uuid4()),import_id))
                if int(os.getenv("STORAGE_RETENTION_DAYS", "7")) == 0:
                    self.s3.delete_object(Bucket=os.getenv("MINIO_BUCKET", "imports"), Key=storage_key)
            except Exception as error:
                with conn.cursor() as cursor:
                    cursor.execute('UPDATE "Import" SET status=\'FAILED\',"errorMessage"=%s WHERE id=%s', (describe_error(error), import_id))
                raise RuntimeError("Import failed; see import status") from None
        return stats
