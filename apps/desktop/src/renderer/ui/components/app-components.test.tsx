import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Moon } from "@lyra/icons";

import {
  AppBadge,
  AppButton,
  AppDialog,
  AppErrorBoundary,
  AppEmptyState,
  AppErrorState,
  AppIconButton,
  AppInput,
  AppLoadingState,
  AppObjectRow,
  AppSearchField,
  AppSelect,
  AppSettingsSection,
  AppShimmer,
  AppStatusMessage,
  AppSwitch,
  AppTabs,
  AppTooltip,
  AppToast,
  AppToastProvider,
  AppToastViewport,
  AppToolbarButton,
  AppWindowButton,
} from ".";

describe("Lyra App UI components", () => {
  test("renders buttons through the Lyra wrapper surface", () => {
    render(<AppButton variant="outline">Open</AppButton>);

    const button = screen.getByRole("button", { name: "Open" });
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveAttribute("data-variant", "outline");
  });

  test("wraps form controls and settings sections with stable classes", () => {
    render(
      <AppSettingsSection label="Appearance">
        <AppInput aria-label="Name" />
        <AppSelect
          ariaLabel="Theme"
          value="dark"
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark", description: "Low light", icon: <Moon aria-hidden="true" /> }
          ]}
          onValueChange={vi.fn()}
        />
        <AppSwitch aria-label="Enabled" />
      </AppSettingsSection>
    );

    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveClass("border-input");
    expect(screen.getByRole("button", { name: "Theme" })).toHaveClass(
      "lyra-ui-select-trigger",
      "lyra-ui-select-trigger-with-icon"
    );
    expect(screen.getByRole("switch", { name: "Enabled" })).toHaveAttribute("data-slot", "switch");
  });

  test("toggles AppSelect from its own trigger and switches with one click", async () => {
    const user = userEvent.setup();
    const onFirstChange = vi.fn();
    const onSecondChange = vi.fn();
    render(
      <>
        <AppSelect
          ariaLabel="First"
          value="a1"
          options={[
            { value: "a1", label: "A One", description: "First option" },
            { value: "a2", label: "A Two" }
          ]}
          onValueChange={onFirstChange}
        />
        <AppSelect
          ariaLabel="Second"
          value="b1"
          options={[
            { value: "b1", label: "B One" },
            { value: "b2", label: "B Two" }
          ]}
          onValueChange={onSecondChange}
        />
      </>
    );

    await user.click(screen.getByRole("button", { name: "First" }));
    expect(screen.getByRole("menuitemradio", { name: "A One" })).toBeInTheDocument();
    expect(screen.getByText("First option")).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "B One" })).not.toBeInTheDocument();

    // Clicking the open trigger closes its own menu.
    await user.click(screen.getByRole("button", { name: "First" }));
    expect(screen.queryByRole("menuitemradio", { name: "A One" })).not.toBeInTheDocument();

    // One click on the other trigger closes the first menu and opens the next.
    await user.click(screen.getByRole("button", { name: "First" }));
    await user.click(screen.getByRole("button", { name: "Second" }));
    expect(screen.queryByRole("menuitemradio", { name: "A One" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "B One" })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitemradio", { name: "B Two" }));
    expect(onSecondChange).toHaveBeenCalledWith("b2");
    expect(onFirstChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitemradio", { name: "B One" })).not.toBeInTheDocument();
  });

  test("renders AppShimmer text once with active state on the wrapper", () => {
    const { rerender } = render(<AppShimmer text="Running" />);
    const shimmer = screen.getByLabelText("Running");
    expect(shimmer).toHaveClass("lyra-ui-shimmer");
    expect(shimmer).toHaveAttribute("data-active", "true");
    expect(shimmer).toHaveAttribute("data-text", "Running");
    expect(screen.getByText("Running")).toBe(shimmer.firstElementChild);

    rerender(<AppShimmer text="Running" active={false} />);
    expect(screen.getByLabelText("Running")).toHaveAttribute("data-active", "false");
  });

  test("exports shell-ready toolbar, search, and tab components", async () => {
    const onSearch = vi.fn();
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <AppIconButton aria-label="Refresh">
          <Moon aria-hidden="true" />
        </AppIconButton>
        <AppToolbarButton aria-label="Open" label="Open">
          <Moon aria-hidden="true" />
        </AppToolbarButton>
        <AppWindowButton action="close" aria-label="Close">
          <Moon aria-hidden="true" />
        </AppWindowButton>
        <AppSearchField
          ariaLabel="Search"
          value="lyra"
          submitLabel="Run search"
          onValueChange={onSearch}
          onSubmit={vi.fn()}
        />
        <AppTabs
          ariaLabel="Scope"
          value="all"
          options={[
            { value: "all", label: "All" },
            { value: "local", label: "Local" }
          ]}
          onValueChange={onTabChange}
        />
      </>
    );

    expect(screen.getByRole("button", { name: "Refresh" })).toHaveClass("lyra-app-icon-button");
    expect(screen.getByRole("button", { name: "Open" })).toHaveClass("lyra-app-toolbar-button");
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("lyra-app-window-button");
    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("data-window-action", "close");
    expect(screen.getByLabelText("Search")).toHaveClass("lyra-app-search-field-input");
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "agents" } });
    expect(onSearch).toHaveBeenCalledWith("agents");
    await user.click(screen.getByRole("tab", { name: "Local" }));
    expect(onTabChange).toHaveBeenCalledWith("local");
    onTabChange.mockClear();
    screen.getByRole("tab", { name: "All" }).focus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "All" }), { key: "ArrowRight" });
    await waitFor(() => expect(onTabChange).toHaveBeenCalledWith("local"));
  });

  test("renders reusable object rows, badges, and status messages", () => {
    const onOpen = vi.fn();
    const onAction = vi.fn();
    render(
      <>
        <AppObjectRow
          as="div"
          role="button"
          tabIndex={0}
          active
          aria-label="Open package"
          icon={<Moon aria-hidden="true" />}
          title="Package"
          description="Reusable store row"
          badges={<AppBadge tone="success">Active</AppBadge>}
          actions={(
            <button type="button" onClick={onAction}>
              Row action
            </button>
          )}
          onClick={onOpen}
        />
        <AppStatusMessage tone="error">Operation failed</AppStatusMessage>
      </>
    );

    const row = screen.getByRole("button", { name: "Open package" });
    expect(row).toHaveClass("lyra-app-object-row");
    expect(row).toHaveAttribute("data-active", "true");
    expect(row).toHaveAttribute("data-has-actions", "true");
    expect(screen.getByText("Row action").closest(".lyra-app-object-row-actions")).not.toBeNull();
    expect(screen.getByText("Active")).toHaveClass("lyra-app-badge-success");
    expect(screen.getByText("Operation failed").closest("p")).toHaveClass(
      "lyra-app-status-message-error"
    );

    fireEvent.click(screen.getByRole("button", { name: "Row action" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(row, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  test("renders unified app states with the Lyra logo", () => {
    render(
      <>
        <AppEmptyState title="No files" />
        <AppLoadingState title="Loading files" />
        <AppErrorState title="Could not load" />
      </>
    );

    expect(document.querySelectorAll(".lyra-app-state-logo")).toHaveLength(3);
    expect(screen.getByText("No files")).toBeInTheDocument();
    expect(screen.getByText("Loading files").closest(".lyra-app-state")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Could not load")).toBeInTheDocument();
  });

  test("renders app error boundary fallback", () => {
    const Broken = () => {
      throw new Error("boom");
    };

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <AppErrorBoundary title="Interface error">
        <Broken />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Interface error");
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    consoleError.mockRestore();
  });

  test("renders tooltips through the Lyra wrapper surface", async () => {
    render(
      <AppTooltip content="Refresh workspace" delayDuration={0}>
        <button type="button">Refresh</button>
      </AppTooltip>
    );

    const trigger = screen.getByRole("button", { name: "Refresh" });
    fireEvent.focus(trigger);

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Refresh workspace");
  });

  test("renders dialogs through the Lyra wrapper surface", () => {
    const onOpenChange = vi.fn();
    render(
      <AppDialog
        open
        onOpenChange={onOpenChange}
        title="Confirm action"
        description="This action updates the workspace."
        footer={<AppButton size="sm">Apply</AppButton>}
      >
        Dialog content
      </AppDialog>
    );

    expect(screen.getByRole("dialog")).toHaveClass("lyra-app-dialog");
    expect(screen.getByRole("heading", { name: "Confirm action" })).toBeInTheDocument();
    expect(screen.getByText("Dialog content").closest(".lyra-app-dialog-body")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("renders toast rows through the Lyra wrapper surface", () => {
    render(
      <AppToastProvider>
        <AppToast open tone="success" title="Saved" description="Preferences updated." />
        <AppToastViewport />
      </AppToastProvider>
    );

    const toast = screen.getByText("Saved").closest(".lyra-app-toast");
    expect(toast).not.toBeNull();
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("Preferences updated.")).toHaveClass("lyra-ui-toast-description");
  });

  test("renders empty, loading, and error states with stable classes", () => {
    render(
      <>
        <AppEmptyState title="No packages" description="Install one to continue." />
        <AppLoadingState title="Loading packages" description="Checking local state." />
        <AppErrorState
          title="Could not load"
          description="Try again."
          actions={<AppButton size="sm">Retry</AppButton>}
        />
      </>
    );

    expect(screen.getByText("No packages").closest(".lyra-app-state"))
      .toHaveClass("lyra-app-state-empty");
    expect(screen.getByText("Loading packages").closest(".lyra-app-state"))
      .toHaveClass("lyra-app-state-loading");
    expect(screen.getByText("Could not load").closest(".lyra-app-state"))
      .toHaveClass("lyra-app-state-error", "lyra-app-state-tone-error");
    expect(screen.getByRole("button", { name: "Retry" }))
      .toHaveAttribute("data-slot", "button");
  });
});
