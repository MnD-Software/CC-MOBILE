"""Run separately: python -m app.odoo_worker [--loop]."""
import argparse
import asyncio

from .db import SessionLocal
from .odoo_client import connection_settings
from .odoo_sync import drain, pull


async def run(loop=False, direction="both"):
    connection_settings()
    while True:
        try:
            with SessionLocal() as db:
                if direction != "pull":
                    print({"push": await drain(db)}, flush=True)
                for _ in range(100 if direction != "push" else 0):
                    result = await pull(db)
                    print({"pull": result}, flush=True)
                    if not result["has_more"]:
                        break
        except Exception as error:
            print({"status": "retry_required", "error_type": type(error).__name__}, flush=True)
            if not loop:
                raise SystemExit(1) from None
        if not loop:
            return
        await asyncio.sleep(30)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--direction", choices=("both", "pull", "push"), default="both")
    args = parser.parse_args()
    asyncio.run(run(args.loop, args.direction))
