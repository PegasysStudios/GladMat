import { describe, expect, it } from "vitest";
import { buildZipManifest } from "@/lib/zip-manifest";

describe("ZIP manifest", () => {
  it("sanitizes, sorts, and de-duplicates output entries", () => {
    const entries = buildZipManifest("../Night Show.PNG", [
      { requestId: "b", width: 728, height: 90 },
      { requestId: "a", width: 300, height: 250 },
      { requestId: "newer", width: 728, height: 90 },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.filename)).toEqual([
      "night-show_300x250.png",
      "night-show_728x90.png",
    ]);
  });
});
