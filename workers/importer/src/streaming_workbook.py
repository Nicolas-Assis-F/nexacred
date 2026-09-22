"""Bounded XLSB extraction and disk-backed shared strings using pyxlsb's parser.

pyxlsb.open_workbook 1.0.10 calls ZipExtFile.read() for entire sheet parts.
This adapter deliberately avoids that method and its in-memory string table.
"""
import contextlib
import os
import sqlite3
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath
from pyxlsb import biff12
from pyxlsb.reader import BIFF12Reader
from pyxlsb.worksheet import Worksheet

class DiskStrings:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute('CREATE TABLE strings (id INTEGER PRIMARY KEY, value TEXT)')

    def load(self, stream):
        batch = []
        index = 0
        for kind, item in BIFF12Reader(stream):
            if kind == biff12.SI:
                batch.append((index, item.t)); index += 1
                if len(batch) >= 1000:
                    self.db.executemany('INSERT INTO strings VALUES (?,?)', batch); batch.clear()
        self.db.executemany('INSERT INTO strings VALUES (?,?)', batch)
        self.db.commit()

    def __getitem__(self, index):
        row = self.db.execute('SELECT value FROM strings WHERE id=?', (index,)).fetchone()
        if row is None: raise ValueError('Invalid string reference')
        return row[0]

    def close(self): self.db.close()

class StreamingWorkbook:
    def __init__(self, path):
        self.stack = contextlib.ExitStack()
        try:
            self.directory = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
            self.archive = self.stack.enter_context(zipfile.ZipFile(path))
            max_size = int(os.getenv('XLSB_MAX_UNCOMPRESSED_BYTES', str(8*1024**3)))
            if sum(i.file_size for i in self.archive.infolist()) > max_size: raise ValueError('Workbook too large')
            with self.archive.open('xl/_rels/workbook.bin.rels') as stream:
                rels = {e.attrib['Id']: e.attrib['Target'] for _, e in ET.iterparse(stream) if 'Id' in e.attrib}
            self._sheets = []
            with self.archive.open('xl/workbook.bin') as stream:
                for kind, item in BIFF12Reader(stream):
                    if kind == biff12.SHEET: self._sheets.append((item.name, rels[item.rId]))
            self.strings = DiskStrings(self.directory/'strings.db')
            self.stack.callback(self.strings.close)
            if 'xl/sharedStrings.bin' in self.archive.namelist():
                with self.archive.open('xl/sharedStrings.bin') as stream: self.strings.load(stream)
        except Exception:
            self.stack.close(); raise

    @property
    def sheets(self): return [name for name, _ in self._sheets]

    def get_sheet(self, name):
        target = next(target for sheet, target in self._sheets if sheet.lower() == str(name).lower())
        member = str(PurePosixPath('xl')/target) if not target.startswith('/') else target.lstrip('/')
        # Fixed local name prevents zip path traversal; copying never uses read(-1).
        path = self.directory/'sheet.bin'
        with self.archive.open(member) as source, path.open('wb') as destination:
            while chunk := source.read(1024*1024): destination.write(chunk)
        stream = path.open('rb')
        try: return Worksheet(str(name), stream, stringtable=self.strings)
        except Exception: stream.close(); raise

    def __enter__(self): return self
    def __exit__(self, *_): self.stack.close()
