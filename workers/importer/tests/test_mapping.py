from zipfile import BadZipFile
import pytest
from src.importer import XlsbImporter, header_key
from src.errors import ImportInputError, describe_error
from test_streaming import FIXTURE

def test_case_and_whitespace_in_sheet_and_headers():
    importer = object.__new__(XlsbImporter)
    importer.hmac_secret = 'synthetic-test-secret'
    mapping = {'cpf': ' cpf ', 'name': 'nome servidor'}
    rows = list(importer._rows(FIXTURE, ' dados ', mapping))
    result, error = importer._normalize(rows[0][1], mapping)
    assert error is None
    assert result['cpf'] == '52998224725'
    assert header_key('  MARGEM  CONSIGNÁVEL ') == 'MARGEM CONSIGNAVEL'

def test_missing_sheet_is_actionable():
    importer = object.__new__(XlsbImporter)
    with pytest.raises(ImportInputError, match='aba informada não existe'):
        list(importer._rows(FIXTURE, 'missing'))

def test_missing_required_header_rejected_before_rows():
    importer = object.__new__(XlsbImporter)
    with pytest.raises(ImportInputError, match='Cabeçalho obrigatório'):
        list(importer._rows(FIXTURE, None, {'cpf':'missing','name':'NOME SERVIDOR'}))

def test_errors_never_expose_input_or_connection_secrets():
    assert 'secret' not in describe_error(RuntimeError('secret cell or password'))
    assert 'XLSB' in describe_error(BadZipFile('secret'))
