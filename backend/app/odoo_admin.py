"""Private operator CLI. No API keys or upstream tracebacks are printed."""
import argparse
import asyncio
import json

from .odoo_client import OdooClient, RESOURCES


async def run(args):
    client = OdooClient()
    if args.action == "connection":
        context = await client.call("res.users", "context_get")
        result = {"authenticated": True, "user_id": context.get("uid"),
                  "allowed_company_ids": context.get("allowed_company_ids", [])}
    elif args.action == "check":
        result = await client.bridge("capabilities")
    elif args.action == "schema":
        result = {"model": RESOURCES[args.resource], "fields": await client.call(RESOURCES[args.resource],
            "fields_get", attributes=["string", "type", "relation", "required", "readonly"])}
    else:
        if args.resource == "products":
            result = await client.bridge("publish_catalogue", after=args.after, limit=args.limit)
        elif args.resource == "riders":
            result = await client.bridge("publish_riders")
        else:
            result = await client.bridge("publish_resource", resource=args.resource, after=args.after, limit=args.limit)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("connection", "check", "schema", "publish"))
    parser.add_argument("--resource", choices=sorted(RESOURCES), default="products")
    parser.add_argument("--after", type=int, default=0)
    parser.add_argument("--limit", type=int, choices=range(1, 101), default=25)
    try:
        asyncio.run(run(parser.parse_args()))
    except Exception as error:
        from fastapi import HTTPException
        message = error.detail if isinstance(error, HTTPException) else type(error).__name__
        raise SystemExit(f"Odoo operation failed: {message}") from None
