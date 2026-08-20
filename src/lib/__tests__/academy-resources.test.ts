import { describe, it, expect } from "vitest";
import { isContentOnlyResource, resourceAction } from "@/lib/academy-resources";

const base = { file_path: null, external_url: null, content: null, is_downloadable: false };

describe("academy resource actions", () => {
  it("treats a content-only checklist as read & print, never a download", () => {
    const checklist = { ...base, content: "# Qualification Checklist\n- [ ] TIMD covered" };
    const action = resourceAction(checklist);
    expect(action.mode).toBe("content");
    expect(action.label).toBe("Read & print");
    expect(action.download).toBe(false);
    expect(isContentOnlyResource(checklist)).toBe(true);
  });

  it("never offers a download when is_downloadable is true but no file exists", () => {
    const lying = { ...base, content: "body", is_downloadable: true };
    expect(resourceAction(lying).mode).toBe("content");
    expect(resourceAction(lying).download).toBe(false);
  });

  it("keeps ordinary file resources unchanged", () => {
    expect(resourceAction({ ...base, file_path: "m5/guide.pdf", is_downloadable: true })).toMatchObject({
      mode: "file",
      label: "Download",
      download: true,
    });
    expect(resourceAction({ ...base, file_path: "m5/guide.pdf" })).toMatchObject({
      mode: "file",
      label: "Open",
      download: false,
    });
  });

  it("prefers a safe external URL and rejects unsafe schemes", () => {
    expect(resourceAction({ ...base, external_url: "https://ok.test/x" })).toMatchObject({
      mode: "external",
      href: "https://ok.test/x",
    });
    // eslint-disable-next-line no-script-url
    expect(resourceAction({ ...base, external_url: "javascript:alert(1)" }).mode).toBe("unavailable");
  });

  it("reports nothing to open when the row is empty", () => {
    expect(resourceAction(base).mode).toBe("unavailable");
    expect(resourceAction({ ...base, content: "   " }).mode).toBe("unavailable");
  });
});
