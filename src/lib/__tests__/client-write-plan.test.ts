import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { createClientWritePlan } from "../client-write-plan";
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ error: null }); });
describe("related client write transaction", () => {
  it("does not write until commit, and preserves generated relational IDs", async () => {
    const plan = createClientWritePlan();
    const { data: client } = await plan.insert("clients", { commercial_name: "Test" });
    await plan.insert("licenses", { client_id: client.id, product: "Business KeepIT" });
    expect(rpc).not.toHaveBeenCalled();
    await plan.commit();
    expect(rpc).toHaveBeenCalledTimes(1);
    const rows = rpc.mock.calls[0][1].p_rows;
    expect(rows[1].row.client_id).toBe(rows[0].row.id);
    expect(rows[0].row.id).toBeTruthy();
  });
  it("surfaces a failed transaction rather than returning success", async () => {
    const error = { message: "Permission denied" };
    rpc.mockResolvedValue({ error });
    const plan = createClientWritePlan();
    await plan.insert("clients", { commercial_name: "Test" });
    await expect(plan.commit()).rejects.toEqual(error);
  });
});
