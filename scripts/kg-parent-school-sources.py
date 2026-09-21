"""Explicit live source job for bounded KG 2027/28 school-site discovery.

This command is never imported by unit tests and never publishes data. Use
--plan-only for a no-network scope check; the normal invocation is a separate
operator-triggered source job that writes an artifact for later review.
"""
import argparse
import pathlib
import sys

# Running this file directly puts only ``scripts/`` on sys.path. Add the
# repository root so the job uses the same package import as CI/workflow calls.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from scripts.kg_parent.school_sources import TARGET_YEAR, run


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=pathlib.Path, default=pathlib.Path("base/apps/web/dist-production"))
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("captured-parent/school-sources"))
    parser.add_argument("--target-year", type=int, default=TARGET_YEAR)
    parser.add_argument("--plan-only", action="store_true")
    args = parser.parse_args()
    if args.target_year != 2027:
        raise SystemExit("this release accepts only target year 2027; other years need a separately reviewed source cycle")
    report = run(args.base, args.out, args.target_year, args.plan_only)
    print({k: v for k, v in report.items() if k not in ("schools",)})
    return 0


if __name__ == "__main__":
    sys.exit(main())
