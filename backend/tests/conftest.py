import os
import tempfile
from pathlib import Path

_test_database = tempfile.TemporaryDirectory(prefix="cakecity-tests-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(_test_database.name) / "test.db").as_posix()
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ENVIRONMENT"] = "test"


def pytest_sessionfinish(session, exitstatus):
    from app.db import engine
    engine.dispose()
    _test_database.cleanup()
