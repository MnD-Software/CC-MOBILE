"""Operator-only command. Never exposed as an HTTP role-grant endpoint."""
import argparse
from sqlalchemy import select
from .db import SessionLocal
from .models import Customer


def main():
    parser = argparse.ArgumentParser(description="Assign a Cake City staff role to an existing app account")
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", choices=["staff", "admin", "customer"], default="staff")
    args = parser.parse_args()
    with SessionLocal() as db:
        customer = db.scalar(select(Customer).where(Customer.email == args.email.strip().lower()).with_for_update())
        if not customer:
            raise SystemExit("Account not found. Register in the app first.")
        customer.role = args.role
        db.commit()
    print("Role updated. Sign out and sign in again to refresh account navigation.")


if __name__ == "__main__":
    main()
