import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ContractLineDeleteDialog } from "@/components/clients/ContractLineDeleteDialog";

const line = { id: "line-1", description: "S&AT", amount: 2301.6, currency: "EUR" };

function Harness({ onConfirm }: { onConfirm: (l: any) => Promise<void> | void }) {
  const [open, setOpen] = useState(true);
  return (
    <ContractLineDeleteDialog line={line} open={open} onOpenChange={setOpen} onConfirm={onConfirm} />
  );
}

describe("ContractLineDeleteDialog", () => {
  it("shows the line description and warns it is a financial element", () => {
    render(<Harness onConfirm={vi.fn()} />);
    expect(screen.getByText("S&AT")).toBeInTheDocument();
    expect(screen.getByText(/financial element of the contract/i)).toBeInTheDocument();
  });

  it("(g) cancelling never calls the mutation", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("(g) confirming calls the mutation exactly once", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /remove line/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(line);
  });

  it("blocks double-clicks and shows progress while deleting", async () => {
    let release: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => { release = () => r(); }));
    render(<Harness onConfirm={onConfirm} />);
    const btn = screen.getByRole("button", { name: /remove line/i });
    await userEvent.click(btn);
    expect(await screen.findByText(/removing/i)).toBeInTheDocument();
    await userEvent.click(btn).catch(() => {});
    expect(onConfirm).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.queryByText(/removing/i)).not.toBeInTheDocument());
  });
});

describe("ContractLineDeleteDialog — failed deletion", () => {
  it("(2D) stays open, resets the button and allows a retry", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("delete failed"))
      .mockResolvedValueOnce(undefined);
    render(<Harness onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: /remove line/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

    // (a) dialog still open, (b) button back out of "Removing…"
    await waitFor(() => expect(screen.queryByText(/removing/i)).not.toBeInTheDocument());
    const retry = await screen.findByRole("button", { name: /remove line/i });
    expect(retry).toBeEnabled();
    expect(screen.getByText(/financial element of the contract/i)).toBeInTheDocument();

    // (c) retry works and closes on success
    await userEvent.click(retry);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText(/financial element of the contract/i)).not.toBeInTheDocument()
    );
  });
});
