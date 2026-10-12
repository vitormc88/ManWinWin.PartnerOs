#!/usr/bin/env python3
"""Compare a financial schema-only metadata snapshot (PROD or a local baseline)
to the previously verified read-only TEST state.

This is a pre-migration compatibility gate, not a substitute for actual
TEST row-lock, RLS, rollback and renewal E2E. Never dump customer records.
"""
import json
import sys
from pathlib import Path

REFERENCE = Path("tests/sql/fin02/test_schema_fingerprint_20261011.json")

def comparison(reference, candidate):
    differences = []
    tables = candidate.get("tables") or {}
    actual_functions = candidate.get("functions") or {}

    for name, expected in sorted(reference["tables"].items()):
        found = tables.get(name)
        if not found:
            differences.append(f"table {name}: missing from candidate")
            continue
        for src, dst in (("columns", "columns"),
                         ("column_signature_md5", "column_signature_md5")):
            if found.get(dst) != expected[src]:
                differences.append(
                    f"table {name} {src}: TEST={expected[src]!r}, "
                    f"CANDIDATE={found.get(dst)!r}"
                )
        if found.get("rls_enabled") is not True:
            differences.append(f"table {name}: RLS disabled in candidate")

    for name, policy in sorted(reference["rls_policy_fingerprints"].items()):
        found = tables.get(name)
        if not found:
            continue
        if found.get("policies") != policy["count"]:
            differences.append(
                f"policy {name}: TEST count {policy['count']}, "
                f"candidate {found.get('policies')}"
            )
        if found.get("policy_signature_md5") != policy["definition_md5"]:
            differences.append(f"policy {name}: definitions differ from TEST")

    for name, expected in sorted(reference["functions"].items()):
        matches = [d for k, d in actual_functions.items()
                   if k.startswith(name+"(")]
        if len(matches) != 1:
            differences.append(f"function {name}: expected one signature, found {len(matches)}")
            continue
        found = matches[0]
        if found.get("body_md5") != expected["definition_md5"]:
            differences.append(f"function {name}: function body differs from TEST")
        if found.get("security_definer") != expected["security_definer"]:
            differences.append(f"function {name}: SECURITY DEFINER differs from TEST")
    return differences

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: compare_baseline_to_test.py candidate_schema_inventory.json")
    ref = json.loads(REFERENCE.read_text(encoding="utf-8"))
    path = Path(sys.argv[1])
    if path.resolve() == REFERENCE.resolve():
        sys.exit("Input must be an independently captured candidate, not the TEST reference")
    observed = json.loads(path.read_text(encoding="utf-8"))
    if observed.get("scope") != "FIN02 read-only financial metadata":
        sys.exit("Input was not produced by the approved catalog-only inventory query")
    differences = comparison(ref, observed)
    print(f"FIN02 read-only PROD/TEST candidate comparison: {len(differences)} differences")
    for d in differences:
        print(" - " + d)
    if differences:
        sys.exit("NO-GO: candidate is NOT an identical TEST financial baseline.")
    print("Selected financial columns, RLS policies, function bodies and definer flags match TEST.")
    print("This is NOT yet SQL-GATE-2: real RPCs and Supabase role/transaction E2E remain outstanding.")
