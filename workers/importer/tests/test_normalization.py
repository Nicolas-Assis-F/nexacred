from src.normalization import identity_hmac, normalize_cpf, normalize_email, normalize_phone

def test_cpf_validation():
    assert normalize_cpf("529.982.247-25") == "52998224725"
    assert normalize_cpf("111.111.111-11") is None

def test_contact_normalization():
    assert normalize_phone("(62) 99999-1234") == "+5562999991234"
    assert normalize_email(" TEST@Example.COM ") == "test@example.com"

def test_hmac_is_deterministic_and_secret_keyed():
    assert identity_hmac("value", "secret") == identity_hmac("value", "secret")
    assert identity_hmac("value", "secret") != identity_hmac("value", "other")

def test_numeric_excel_cells_preserve_cpf():
    assert normalize_cpf(52998224725.0) == '52998224725'

def test_ddd55_is_national():
    assert normalize_phone('55999998888') == '+5555999998888'
