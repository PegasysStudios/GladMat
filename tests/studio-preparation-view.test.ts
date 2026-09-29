import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioPreparation } from "@/components/studio/studio-preparation";
import { INITIAL_STUDIO_PREPARATION, failStudioPreparation, studioRecoveryLabel, type StudioFailure } from "@/lib/studio-protocol";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("Studio loading and error presentation", () => {
  it("puts selection before background and names the actual final work", () => {
    const html = renderToStaticMarkup(createElement(StudioPreparation, { preparation: INITIAL_STUDIO_PREPARATION, failure: null, onRetry: vi.fn() }));
    expect(html.indexOf("Preparing artwork")).toBeLessThan(html.indexOf("Selecting editable elements"));
    expect(html.indexOf("Selecting editable elements")).toBeLessThan(html.indexOf("Creating background"));
    expect(html).toContain("Building and verifying canvas");
  });

  it("highlights a missing selection instead of blaming background, and displays recovery", () => {
    const failure: StudioFailure = { code: "STUDIO_SELECTIONS_MISSING", message: "Select Artist before creating the background.", retryable: true,
      stage: "extracting", recovery: "retry-preparation", layerIds: ["artist"], requestId: "issue-123" };
    const state = failStudioPreparation({ ...INITIAL_STUDIO_PREPARATION, analyzing: "complete", extracting: "complete", background: "working", completedLayers: 2, totalLayers: 2 }, failure);
    expect(state).toMatchObject({ extracting: "error", background: "pending", completedLayers: 1 });
    const html = renderToStaticMarkup(createElement(StudioPreparation, { preparation: state, failure, onRetry: vi.fn() }));
    expect(html).toContain('aria-label="Selecting editable elements: error"');
    expect(html).toContain('aria-label="Creating background: pending"');
    expect(html).toContain(failure.message); expect(html).toContain("issue-123"); expect(html).toContain("Retry preparation");
  });

  it.each(["analyzing", "extracting", "background", "composition"] as const)("marks only %s as the failed stage", (stage) => {
    const failure: StudioFailure = { code: "STUDIO_FAILED", message: "Please retry.", retryable: true, stage };
    const state = failStudioPreparation(INITIAL_STUDIO_PREPARATION, failure);
    expect(Object.entries(state).filter(([, value]) => value === "error").map(([key]) => key)).toEqual([stage]);
  });

  it("offers the action appropriate to the error", () => {
    expect(studioRecoveryLabel("reload")).toBe("Reload Studio");
    expect(studioRecoveryLabel("retry-loading")).toBe("Retry loading canvas");
    expect(studioRecoveryLabel("regenerate")).toBe("Back to GladMat");
    expect(studioRecoveryLabel("check-configuration")).toBe("Back to GladMat");
  });
});
