"""Controlled public-read benchmark. Never generates orders or payments.

python tests/load_catalogue.py --base-url http://127.0.0.1:8095 --rpm 5000 --seconds 60 --output ../artifacts/catalogue-load.json
"""
import argparse
import asyncio
import json
from pathlib import Path
from time import perf_counter

import httpx


async def benchmark(args):
    durations = []
    failures = 0
    scheduled = 0
    semaphore = asyncio.Semaphore(100)
    async with httpx.AsyncClient(base_url=args.base_url, timeout=20, limits=httpx.Limits(max_connections=100, max_keepalive_connections=100)) as client:
        warm = await client.get("/v1/catalogue/products?per_page=24")
        warm.raise_for_status()
        assert isinstance(warm.json(), list) and warm.json(), "A real populated catalogue is required"
        async def read():
            nonlocal failures
            begin = perf_counter()
            async with semaphore:
                try:
                    response = await client.get("/v1/catalogue/products?per_page=24")
                    if response.status_code != 200 or not isinstance(response.json(), list):
                        failures += 1
                except (httpx.HTTPError, ValueError):
                    failures += 1
            durations.append((perf_counter()-begin)*1000)

        begin = perf_counter()
        tasks = []
        interval = 60/args.rpm
        while scheduled*interval < args.seconds:
            target = begin+scheduled*interval
            await asyncio.sleep(max(0, target-perf_counter()))
            tasks.append(asyncio.create_task(read()))
            scheduled += 1
        await asyncio.gather(*tasks)
        elapsed = perf_counter()-begin
    durations.sort()
    percentile = lambda value: durations[min(len(durations)-1, int(len(durations)*value))]
    report = {"scope": "Warm cached public catalogue, single local API instance; not a production or authenticated-write capacity test",
        "base_url": args.base_url, "target_rpm": args.rpm, "scheduled_seconds": args.seconds,
        "requests": len(durations), "elapsed_seconds": round(elapsed, 2),
        "achieved_rpm": round(len(durations)/elapsed*60, 1), "failures": failures,
        "error_rate": failures/len(durations), "p50_ms": round(percentile(.50), 2),
        "p95_ms": round(percentile(.95), 2), "p99_ms": round(percentile(.99), 2)}
    report["passed"] = report["error_rate"] < .005 and report["p95_ms"] < 300 and report["achieved_rpm"] >= args.rpm*.95
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--rpm", type=int, default=5000)
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.rpm < 1 or args.seconds < 1:
        parser.error("rpm and seconds must be positive")
    asyncio.run(benchmark(args))
