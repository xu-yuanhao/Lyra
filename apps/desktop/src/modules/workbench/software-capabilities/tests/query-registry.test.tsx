import {
  act,
  renderHook
} from "@testing-library/react";
import {
  describe,
  expect,
  test,
  vi
} from "vitest";

import type {
  LyraSoftwareActionHandler,
  LyraSoftwareManifest,
  SoftwareInvokeCapabilityRequest
} from "../../../../shared/desktop-bridge";
import { useSoftwareCapabilitiesQueryRegistry } from "../query-registry";

const externalSoftware: readonly LyraSoftwareManifest[] = [{
  id: "external:acme.tools:mail",
  title: "Mail",
  description: "Mail tools",
  source: "uiux",
  sourceId: "external:acme.tools",
  actions: [{
    id: "external:acme.tools:mail.open",
    title: "Open",
    description: "Open mailbox",
    risk: "navigate",
    inputSchema: {
      type: "object",
      required: ["folder"],
      properties: {
        folder: { type: "string" }
      }
    }
  }]
}];

describe("software capability query registry", () => {
  test("registers and disposes declared external handlers", async () => {
    const externalHandler = vi.fn(() => ({ opened: true }));
    const { result } = renderHook(() => useSoftwareCapabilitiesQueryRegistry({
      activeUiPackId: "external:acme.tools",
      software: externalSoftware,
      builtinHandlers: new Map(),
      readSoftwareState: () => ({ state: { available: true } })
    }));

    expect(await result.current.handleBridgeQuery({
      requestId: "before",
      method: "software.inspectCapability",
      payload: {
        softwareId: "external:acme.tools:mail",
        actionId: "external:acme.tools:mail.open"
      }
    })).toMatchObject({
      ok: true,
      result: {
        handlerRegistered: false
      }
    });

    let dispose: (() => void) | undefined;
    act(() => {
      dispose = result.current.createUiPackCapabilities(
        "external:acme.tools",
        externalSoftware
      ).registerActionHandler("external:acme.tools:mail.open", externalHandler);
    });

    const invoked = await result.current.handleBridgeQuery({
      requestId: "invoke",
      method: "software.invokeCapability",
      payload: {
        softwareId: "external:acme.tools:mail",
        actionId: "external:acme.tools:mail.open",
        input: {
          folder: "Inbox"
        }
      }
    });
    expect(invoked).toMatchObject({
      ok: true,
      result: {
        output: {
          opened: true
        }
      }
    });
    expect(externalHandler).toHaveBeenCalledWith(
      { folder: "Inbox" },
      {
        softwareId: "external:acme.tools:mail",
        actionId: "external:acme.tools:mail.open"
      }
    );

    act(() => {
      dispose?.();
    });
    expect(await result.current.handleBridgeQuery({
      requestId: "after",
      method: "software.inspectCapability",
      payload: {
        softwareId: "external:acme.tools:mail",
        actionId: "external:acme.tools:mail.open"
      }
    })).toMatchObject({
      ok: true,
      result: {
        handlerRegistered: false
      }
    });
  });

  test("prefers builtin handlers and wraps validation failures", async () => {
    const builtinHandler = vi.fn(() => ({ source: "builtin" }));
    const externalHandler = vi.fn(() => ({ source: "external" }));
    const builtinHandlers = new Map<string, LyraSoftwareActionHandler>([
      ["external:acme.tools:mail.open", builtinHandler]
    ]);
    const { result } = renderHook(() => useSoftwareCapabilitiesQueryRegistry({
      activeUiPackId: "external:acme.tools",
      software: externalSoftware,
      builtinHandlers,
      readSoftwareState: () => ({ state: {} })
    }));

    act(() => {
      result.current.createUiPackCapabilities(
        "external:acme.tools",
        externalSoftware
      ).registerActionHandler("external:acme.tools:mail.open", externalHandler);
    });

    const invalid = await result.current.handleBridgeQuery({
      requestId: "invalid",
      method: "software.invokeCapability",
      payload: {
        softwareId: "external:acme.tools:mail",
        actionId: "external:acme.tools:mail.open",
        input: {}
      }
    });
    expect(invalid).toMatchObject({
      requestId: "invalid",
      ok: false,
      error: {
        code: "software_capability_failed",
        message: expect.stringContaining("folder is required")
      }
    });

    const valid = await result.current.handleBridgeQuery({
      requestId: "valid",
      method: "software.invokeCapability",
      payload: {
        softwareId: "external:acme.tools:mail",
        actionId: "external:acme.tools:mail.open",
        input: {
          folder: "Inbox"
        }
      }
    });
    expect(valid).toMatchObject({
      ok: true,
      result: {
        output: {
          source: "builtin"
        }
      }
    });
    expect(builtinHandler).toHaveBeenCalled();
    expect(externalHandler).not.toHaveBeenCalled();
  });

  test("missing or unknown softwareId names the parameter and valid ids", async () => {
    const { result } = renderHook(() => useSoftwareCapabilitiesQueryRegistry({
      activeUiPackId: "external:acme.tools",
      software: externalSoftware,
      builtinHandlers: new Map(),
      readSoftwareState: () => ({ state: { available: true } })
    }));

    const missing = await result.current.handleBridgeQuery({
      requestId: "missing-software-id",
      method: "software.invokeCapability",
      payload: {
        actionId: "external:acme.tools:mail.open",
        input: {}
      } as unknown as SoftwareInvokeCapabilityRequest
    });
    expect(missing).toMatchObject({
      requestId: "missing-software-id",
      ok: false,
      error: {
        code: "software_capability_failed",
        message: expect.stringContaining("softwareId is required")
      }
    });
    expect((missing as { error: { message: string } }).error.message)
      .toContain("external:acme.tools:mail");

    const unknown = await result.current.handleBridgeQuery({
      requestId: "unknown-software-id",
      method: "software.invokeCapability",
      payload: {
        softwareId: "ghost",
        actionId: "external:acme.tools:mail.open",
        input: {}
      }
    });
    expect(unknown).toMatchObject({
      ok: false,
      error: {
        code: "software_capability_failed",
        message: expect.stringContaining('Unknown software id "ghost"')
      }
    });
    expect((unknown as { error: { message: string } }).error.message)
      .toContain("Valid software ids: external:acme.tools:mail");

    const missingAction = await result.current.handleBridgeQuery({
      requestId: "missing-action-id",
      method: "software.invokeCapability",
      payload: {
        softwareId: "external:acme.tools:mail",
        input: {}
      } as unknown as SoftwareInvokeCapabilityRequest
    });
    expect(missingAction).toMatchObject({
      ok: false,
      error: {
        code: "software_capability_failed",
        message: expect.stringContaining("actionId is required")
      }
    });
    expect((missingAction as { error: { message: string } }).error.message)
      .toContain("Valid action ids for external:acme.tools:mail: external:acme.tools:mail.open");
  });
});
