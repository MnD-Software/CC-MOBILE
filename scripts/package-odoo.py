"""Build a source-only Odoo addon delivery with structural validation, no secrets."""
import ast
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
ADDON = ROOT / "integrations" / "odoo" / "cakecity_mobile"
OUTPUT = ROOT / "downloads" / "CakeCity-Odoo19-Integration.zip"
manifest = ast.literal_eval((ADDON / "__manifest__.py").read_text(encoding="utf-8"))
assert manifest["version"].startswith("19.0.") and manifest["installable"]
files = {}
for path in sorted(ADDON.rglob("*")):
    if not path.is_file() or "__pycache__" in path.parts or path.suffix not in {".py", ".xml", ".csv", ".rst"}:
        continue
    content = path.read_bytes()
    text = content.decode("utf-8")
    if path.suffix == ".py":
        ast.parse(text, filename=str(path))
    elif path.suffix == ".xml":
        ET.fromstring(text)
    elif path.suffix == ".csv":
        rows = list(csv.reader(io.StringIO(text)))
        assert all(len(row) == len(rows[0]) for row in rows), "Inconsistent ACL columns"
    files["cakecity_mobile/" + path.relative_to(ADDON).as_posix()] = content
for resource in manifest["data"]:
    assert "cakecity_mobile/" + resource in files
for name in ("ODOO19_SETUP.md", "LOGISTICS.md"):
    files[name] = (ROOT / "docs" / name).read_bytes()
files["backend.env.odoo.example"] = (ROOT / "backend" / ".env.odoo.example").read_bytes()
for name, content in files.items():
    assert not re.search(rb"AIza[0-9A-Za-z_-]{30,}|pk\.eyJ[0-9A-Za-z_.-]{20,}|-----BEGIN .*PRIVATE KEY-----", content), "Credential pattern in " + name
files["MANIFEST.json"] = json.dumps({
    "addon": manifest["name"], "version": manifest["version"],
    "validation": "Python syntax, XML parsing, ACL CSV and archive checks only; Odoo runtime tests require staging installation.",
    "files": {name: hashlib.sha256(content).hexdigest() for name, content in files.items()},
}, indent=2).encode()
OUTPUT.parent.mkdir(exist_ok=True)
with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
    for name, content in files.items():
        entry = ZipInfo(name, date_time=(2026, 11, 10, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, content)
with ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(files)
print(json.dumps({"artifact": str(OUTPUT), "files": len(files),
    "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(), "bytes": OUTPUT.stat().st_size}, indent=2))
