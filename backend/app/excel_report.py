"""Small dependency-free XLSX response writer for operational tables.

Text is always inline text, never interpreted as an Excel formula.
"""
from io import BytesIO
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape
from fastapi import Response


def workbook_response(name, headers, rows):
    def col(index):
        value = ""
        while index:
            index, digit = divmod(index - 1, 26)
            value = chr(65 + digit) + value
        return value
    table = []
    for number, row in enumerate([headers, *rows], 1):
        cells = []
        for index, value in enumerate(row, 1):
            address = f"{col(index)}{number}"
            if isinstance(value, (int, float)):
                cells.append(f'<c r="{address}" s="{0 if number > 1 else 1}"><v>{value}</v></c>')
            else:
                value = ''.join(c for c in str(value or "") if ord(c) >= 32 or c in '\t\n\r')
                cells.append(f'<c r="{address}" t="inlineStr" s="{0 if number > 1 else 1}"><is><t xml:space="preserve">{escape(value)}</t></is></c>')
        table.append(f'<row r="{number}">{"".join(cells)}</row>')
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
        archive.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        archive.writestr('xl/styles.xml', '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF612044"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>')
        archive.writestr('xl/worksheets/sheet1.xml', f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="{len(headers)}" width="24" customWidth="1"/></cols><sheetData>{"".join(table)}</sheetData><autoFilter ref="A1:{col(len(headers))}{len(rows)+1}"/></worksheet>')
    return Response(output.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{name}.xlsx"', "Cache-Control": "private, no-store"})
