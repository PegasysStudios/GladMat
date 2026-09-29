import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultCard } from "@/components/result-card";
import type { GenerationJob } from "@/lib/types";

function renderCard(status: GenerationJob["status"]) {
  const job: GenerationJob = {
    size: { id: "medium", name: "Medium rectangle", width: 300, height: 250 },
    status,
    requestId: `test-${status}`,
  };

  return renderToStaticMarkup(createElement(ResultCard, {
    job,
    onPreview: () => {},
    onDownload: async () => {},
    onRegenerate: () => {},
    onRefreshPreview: () => {},
    onOpenStudio: () => {},
    saved: false,
    onToggleSaved: () => {},
  }));
}

describe("ResultCard loading preview", () => {
  it("shows only the compact queue label inside the preview", () => {
    const markup = renderCard("queued");

    expect(markup).toContain("Queued");
    expect(markup).not.toContain("In queue...");
    expect(markup).not.toContain("We'll start this next.");
  });

  it.each(["generating", "processing"] as const)("shows the compact working label for %s", (status) => {
    const markup = renderCard(status);

    expect(markup).toContain("Working...");
    expect(markup).not.toContain("Creating your ad...");
    expect(markup).not.toContain("This usually takes a few seconds.");
  });
});
