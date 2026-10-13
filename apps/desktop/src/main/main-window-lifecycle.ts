/** User-facing window ownership is independent of hidden helper windows. */
export type MainWindowHandle = {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  destroy(): void;
  once(event: "closed", listener: () => void): unknown;
};

export const createMainWindowLifecycle = <T extends MainWindowHandle>(host: {
  readonly isQuitting: () => boolean;
  readonly create: () => T;
  readonly publish: (window: T | null) => void;
  readonly onClosed: () => void;
}) => {
  let current: T | null = null;
  const open = (): T | null => {
    if (host.isQuitting()) return null;
    if (current !== null && !current.isDestroyed()) return current;
    const window = host.create();
    current = window;
    host.publish(window);
    window.once("closed", () => {
      if (current !== window) return;
      current = null;
      host.publish(null);
      host.onClosed();
    });
    return window;
  };
  return {
    open,
    activate: (): void => {
      const existing = current !== null && !current.isDestroyed();
      const window = open();
      if (window === null || !existing) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    },
    reopen: (window: T): void => {
      if (host.isQuitting() || current !== window) return;
      // Transfer ownership before destroying the dead window; its closed
      // callback cannot clear the replacement or quit the application.
      current = null;
      open();
      if (!window.isDestroyed()) window.destroy();
    }
  };
};
