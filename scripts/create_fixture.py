"""Generate a small, synthetic XLSB fixture; contains no uploaded/user data."""
from pathlib import Path
from struct import pack
from zipfile import ZipFile, ZIP_DEFLATED
from pyxlsb import biff12 as b

def rec(kind, data=b''):
    k=kind.to_bytes((kind.bit_length()+7)//8 or 1,'little')
    n=len(data); size=bytearray()
    while n>127: size.append((n&127)|128); n>>=7
    size.append(n)
    return k+size+data

def string(s): return pack('<I',len(s))+s.encode('utf-16le')
rows=[['EMAIL','NOME SERVIDOR','CPF','NOME ORGÃO','MARGEM CONSIGNÁVEL'],['teste@example.invalid','Pessoa Fixture','52998224725','Órgão Fixture','350,50'],['teste@example.invalid','Pessoa Fixture','52998224725','Órgão Fixture','350,50'],['erro@example.invalid','Inválido','00000000000','Órgão Fixture','0']]
strings=list(dict.fromkeys(v for row in rows for v in row));lookup={s:i for i,s in enumerate(strings)}
workbook=rec(b.WORKBOOK)+rec(b.SHEETS)+rec(b.SHEET,pack('<II',0,1)+string('rId1')+string('Dados'))+rec(b.SHEETS_END)
sheet=rec(b.WORKSHEET)+rec(b.DIMENSION,pack('<IIII',0,len(rows)-1,0,1305))+rec(b.SHEETDATA)
for i,row in enumerate(rows):
    sheet+=rec(b.ROW,pack('<I',i))
    for j,value in enumerate(row): sheet+=rec(b.STRING,pack('<III',j,0,lookup[value]))
sheet+=rec(b.SHEETDATA_END)+rec(b.WORKSHEET_END)
sst=rec(b.SST,pack('<II',sum(map(len,rows)),len(strings)))+b''.join(rec(b.SI,b'\0'+string(s)) for s in strings)+rec(b.SST_END)
path=Path(__file__).resolve().parents[1]/'fixtures/leads-synthetic.xlsb';path.parent.mkdir(exist_ok=True)
with ZipFile(path,'w',ZIP_DEFLATED) as z:
    z.writestr('xl/workbook.bin',workbook);z.writestr('xl/worksheets/sheet1.bin',sheet);z.writestr('xl/sharedStrings.bin',sst)
    z.writestr('xl/_rels/workbook.bin.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.bin" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>')
    z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/></Types>')
print(path)
