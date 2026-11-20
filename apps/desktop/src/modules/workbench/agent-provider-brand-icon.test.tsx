import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AgentProviderBrandIcon } from "./agent-provider-brand-icon";

const resolveProviderIconMock = vi.hoisted(() => vi.fn());

vi.mock("./shell/service", () => ({
  getDesktopApi: () => ({
    agent: { resolveProviderIcon: resolveProviderIconMock }
  })
}));

afterEach(() => {
  resolveProviderIconMock.mockReset();
});

describe("AgentProviderBrandIcon", () => {
  test("marks dark mono brand colors so theme CSS can invert them", () => {
    const { container } = render(<AgentProviderBrandIcon provider="openai" label="GPT" />);
    const icon = container.querySelector(".lyra-agent-provider-brand-icon");
    const svg = icon?.querySelector("svg");

    expect(icon).toHaveAttribute("data-lyra-brand-luma", "dark");
    expect(svg).toHaveStyle({ color: "#000" });
  });

  test("marks light mono brand colors so theme CSS can invert them", () => {
    const { container } = render(<AgentProviderBrandIcon provider="xai" label="Grok" />);
    const icon = container.querySelector(".lyra-agent-provider-brand-icon");
    const svg = icon?.querySelector("svg");

    expect(icon).toHaveAttribute("data-lyra-brand-luma", "light");
    expect(svg).toHaveStyle({ color: "#fff" });
  });

  test("uses the bundled official OpenCode mark instead of resolving a site icon", () => {
    const { container } = render(
      <AgentProviderBrandIcon
        baseUrl="https://opencode.ai/zen/v1"
        providerId="opencode_zen"
        routeId="opencode_zen"
        label="OpenCode Zen"
      />
    );

    expect(container.querySelector(".lyra-agent-provider-brand-icon-image"))
      .toHaveAttribute("src", expect.stringContaining("opencode.svg"));
    expect(resolveProviderIconMock).not.toHaveBeenCalled();
  });

  test("renders the IPC-resolved site icon for custom providers", async () => {
    resolveProviderIconMock.mockResolvedValue({
      iconUrl: "lyra-file://preview?path=%2Fx&contentType=image/png"
    });
    const { container } = render(
      <AgentProviderBrandIcon
        baseUrl="https://api.example.com/v1"
        providerId="custom_endpoint"
        label="Custom"
      />
    );

    const image = await waitFor(() => {
      const el = container.querySelector(".lyra-agent-provider-brand-icon-image");
      if (!el) throw new Error("site icon not rendered yet");
      return el;
    });
    expect(image).toHaveAttribute(
      "src",
      "lyra-file://preview?path=%2Fx&contentType=image/png"
    );
    expect(resolveProviderIconMock).toHaveBeenCalledWith({
      baseUrl: "https://api.example.com/v1"
    });
  });

  test("resolves a site icon for a remote MCP server when requested", async () => {
    resolveProviderIconMock.mockResolvedValue({
      iconUrl: "lyra-file://preview?path=%2Fmcp.ico&contentType=image/x-icon"
    });
    const { container } = render(
      <AgentProviderBrandIcon
        baseUrl="https://mcp.example.com/sse"
        providerId="remote-tools"
        label="Remote Tools"
        modelId="https://mcp.example.com/sse"
        resolveSiteIcon
      />
    );

    const image = await waitFor(() => {
      const el = container.querySelector(".lyra-agent-provider-brand-icon-image");
      if (!el) throw new Error("MCP site icon not rendered yet");
      return el;
    });
    expect(image).toHaveAttribute(
      "src",
      "lyra-file://preview?path=%2Fmcp.ico&contentType=image/x-icon"
    );
    expect(resolveProviderIconMock).toHaveBeenCalledWith({
      baseUrl: "https://mcp.example.com/sse"
    });
  });

  test("does not probe a site icon for a stdio-style MCP server", () => {
    const { container } = render(
      <AgentProviderBrandIcon
        baseUrl={null}
        providerId="local-tools"
        label="Local Tools"
        modelId="npx @example/mcp-server"
        resolveSiteIcon={false}
      />
    );

    expect(resolveProviderIconMock).not.toHaveBeenCalled();
    expect(container.querySelector(".lyra-agent-provider-brand-icon-initials"))
      .toHaveTextContent("LT");
  });

  test("falls back to a model brand when the custom provider icon cannot be resolved", async () => {
    resolveProviderIconMock.mockResolvedValue({ iconUrl: null });
    const { container } = render(
      <AgentProviderBrandIcon
        baseUrl="https://api.example.com/v1"
        providerId="custom_endpoint"
        label="Custom"
        modelId="deepseek-chat"
      />
    );

    await waitFor(() => {
      if (!resolveProviderIconMock.mock.calls.length) throw new Error("not called yet");
    });
    await waitFor(() => {
      if (!container.querySelector("svg")) {
        throw new Error("model brand fallback not rendered yet");
      }
    });
    expect(container.querySelector(".lyra-agent-provider-brand-icon-image")).toBeNull();
    expect(container.querySelector(".lyra-agent-provider-brand-icon-initials")).toBeNull();
  });

  test("falls back to initials when neither site nor model brand can be resolved", async () => {
    resolveProviderIconMock.mockResolvedValue({ iconUrl: null });
    const { container } = render(
      <AgentProviderBrandIcon
        baseUrl="http://23.95.18.10:22217/v1"
        providerId="custom_endpoint"
        label="Custom"
        modelId="private-model"
      />
    );

    await waitFor(() => {
      if (!resolveProviderIconMock.mock.calls.length) throw new Error("not called yet");
    });
    expect(container.querySelector(".lyra-agent-provider-brand-icon-initials"))
      .toHaveTextContent("C");
  });
});
