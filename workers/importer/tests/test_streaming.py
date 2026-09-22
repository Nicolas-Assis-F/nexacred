from pathlib import Path
from zipfile import ZipExtFile
from src.streaming_workbook import StreamingWorkbook
from src.importer import XlsbImporter

FIXTURE=Path(__file__).resolve().parents[3]/'fixtures/leads-synthetic.xlsb'

def test_wide_xlsb_never_reads_whole_zip_part(monkeypatch):
    original=ZipExtFile.read
    def bounded(self,n=-1):
        assert n>=0, 'Unbounded archive read'
        return original(self,n)
    monkeypatch.setattr(ZipExtFile,'read',bounded)
    with StreamingWorkbook(FIXTURE) as book:
        assert book.sheets==['Dados']
        with book.get_sheet('Dados') as sheet:
            rows=list(sheet.rows())
            assert len(rows)==4
            assert len(rows[0])==1306
            assert rows[1][2].v=='52998224725'

def test_mapping_reads_headers_not_fixed_positions():
    importer=object.__new__(XlsbImporter)
    rows=list(importer._rows(FIXTURE,'Dados'))
    assert rows[0][1]['CPF']=='52998224725'
    assert rows[0][1]['EMAIL']=='teste@example.invalid'
