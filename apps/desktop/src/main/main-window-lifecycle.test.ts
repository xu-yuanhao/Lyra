import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { createMainWindowLifecycle } from "./main-window-lifecycle";

const windowHandle = () => Object.assign(new EventEmitter(), {
  isDestroyed: vi.fn(() => false), isMinimized: vi.fn(() => false),
  restore: vi.fn(), show: vi.fn(), focus: vi.fn(), destroy: vi.fn()
});
test("Dock activation reopens the main window independently of auxiliary windows", () => {
  const first = windowHandle(); const next = windowHandle();
  const create = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(next);
  const lifecycle = createMainWindowLifecycle({ create, publish: vi.fn(), isQuitting: () => false, onClosed: vi.fn() });
  lifecycle.open(); first.emit("closed");
  // A hidden helper is irrelevant: the controller owns only the main window.
  lifecycle.activate();
  expect(create).toHaveBeenCalledTimes(2);
  lifecycle.activate(); expect(next.show).toHaveBeenCalledOnce(); expect(next.focus).toHaveBeenCalledOnce();
});
test("a delayed closed event cannot erase a reopened window or quit the app", () => {
  const first = windowHandle(); const next = windowHandle(); const closed = vi.fn();
  const lifecycle = createMainWindowLifecycle({ create: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(next),
    publish: vi.fn(), isQuitting: () => false, onClosed: closed });
  lifecycle.open(); lifecycle.reopen(first); first.emit("closed"); lifecycle.activate();
  expect(closed).not.toHaveBeenCalled(); expect(next.show).toHaveBeenCalledOnce();
});
test("activation cannot create a window during shutdown", () => {
  const create = vi.fn();
  const lifecycle = createMainWindowLifecycle({ create, publish: vi.fn(), isQuitting: () => true, onClosed: vi.fn() });
  lifecycle.activate(); expect(create).not.toHaveBeenCalled();
});
