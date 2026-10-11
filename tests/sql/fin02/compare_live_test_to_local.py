#!/usr/bin/env python3
"""Compare read-only TEST object signatures against ephemeral LOCAL replay.

This is a *drift detector*, not proof of identical SQL permissions,
roles/claims, datasets, cron jobs, or complete TEST E2E.
"""
import json
import sys
from pathlib import Path

EXPECTED = Path("tests/sql/fin02/test_schema_fingerprint_20261011.json")
CURRENT = Path("/tmp/fin02-local-schema-fingerprint.json")

expected = json.loads(EXPECTED.read_text())
local = json.loads(CURRENT.read_text())
discrepancies = []
matches = 0

for entity in ("tables", "rls_policy_fingerprints", "functions"):
    ref = expected[entity]
    observed = local.get(entity) or {}
    for name, expected_props in sorted(ref.items()):
        # FIN02 replaces these two procedures in the expected migration;
        # assert their new guard/marker in full_schema_probe.sql instead.
        if entity == "functions" and name in (
            "award_deal_proposal", "close_renewal_core"
        ):
            continue
        actual_props = observed.get(name)
        if actual_props is None:
            discrepancies.append(f"{entity}.{name}: object not present")
            continue
        for field, value in expected_props.items():
            actual = actual_props.get(field)
            if actual == value:
                matches += 1
            else:
                discrepancies.append(
                    f"{entity}.{name}.{field}: TEST={value!r}, LOCAL={actual!r}"
                )

print(f"Compared {matches + len(discrepancies)} TEST vs LOCAL structural attributes")
if discrepancies:
    print("FIN02-SCHEMA-DRIFT DETECTED; a successful migration replay is NOT TEST parity.")
    for item in discrepancies:
        print(f"  - {item}")
    sys.exit(1)
print("Selected table signatures, unchanged functions and RLS policy definitions match TEST.")
print("LIMITATION: does not cover all TEST objects, runtime grants, Auth/RLS sessions or full E2E.")
