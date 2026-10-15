import { describe, expect, it } from "vitest";
import { formatAuditMoney, partnerClientScope, AWARDED_REVENUE_NOTE } from "../ux-presentation";
import { LIFETIME_REVENUE_LABEL, REVENUE_YTD_LABEL } from "../revenue-metrics";
import { selectFocusContexts } from "../task-focus-context";
import type { UnifiedTask } from "@/hooks/useTasks";

describe("P1 presentation", () => {
  it("does not round positive small values to zero or show fractional cents", () => {
    expect(formatAuditMoney(444, true)).toBe("€444");
    expect(formatAuditMoney(3897.225)).toBe("€3,897.23");
    expect(formatAuditMoney(1265000, true)).toBe("€1,265k");
    expect(formatAuditMoney(NaN)).toBe("Unavailable");
  });
  it("names commercial awards without claiming invoices", () => {
    expect(LIFETIME_REVENUE_LABEL).toContain("Awarded");
    expect(REVENUE_YTD_LABEL).toContain("Awarded");
    expect(AWARDED_REVENUE_NOTE).toContain("not invoices or payments");
  });
  it("explains all linked clients without trusting a second metric", () => {
    expect(partnerClientScope([{status:"Active"}, {status:"Inactive"}, {status:"Archived"}])).toEqual({current:2,active:1,archived:1});
    expect(partnerClientScope([])).toEqual({current:0,active:0,archived:0});
  });
  it("groups only exact renewal destinations, without mutating or dropping list records", () => {
    const item = (id: string, score: number, route: string | null, source = "renewal") => ({ task: {id,source,related_route:route} as UnifiedTask, score, reason:"overdue" });
    const rows = [item("one",100,"/renewals?renewal=a"),item("two",90,"/renewals?renewal=a"),item("three",80,"/renewals?renewal=b"),item("four",70,null)];
    const focus = selectFocusContexts(rows);
    expect(focus.map(x => x.task.id)).toEqual(["one","three","four"]);
    expect(focus[0].relatedCount).toBe(2);
    expect(rows).toHaveLength(4);
    expect(selectFocusContexts([item("a",1,"/clients/a","manual"),item("b",2,"/clients/a","manual")])).toHaveLength(2);
  });
});
