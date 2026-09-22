class ImportInputError(ValueError):
    """Safe, actionable error text. Never interpolate cell values or credentials."""


def describe_error(error):
    from botocore.exceptions import ClientError, EndpointConnectionError
    from zipfile import BadZipFile
    import psycopg
    if isinstance(error, ImportInputError):
        return str(error)
    if isinstance(error, BadZipFile):
        return "Arquivo inválido: envie uma planilha XLSB íntegra, sem senha."
    if isinstance(error, (ClientError, EndpointConnectionError)):
        return "Não foi possível ler o arquivo no MinIO. Verifique o armazenamento e a retenção."
    if isinstance(error, psycopg.Error):
        return "Falha ao salvar o lote. Verifique o PostgreSQL e se as migrations foram aplicadas."
    return "Não foi possível processar a planilha. Verifique o formato XLSB, a aba e os cabeçalhos."
