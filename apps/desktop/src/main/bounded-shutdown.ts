/** Freeze producers before this barrier. Flush queued writes with one deadline. */
export const createBoundedShutdown = (host: {
  readonly flush: () => Promise<void>;
  readonly dispose: () => void;
  readonly exit: () => void;
  readonly reportFailure: (error: unknown) => void;
  readonly timeoutMs?: number;
}) => {
  let pending: Promise<void> | null = null;
  return {
    run: (): Promise<void> => {
      if (pending !== null) return pending;
      pending = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            Promise.resolve().then(host.flush),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error("Timed out saving workbench state during shutdown")), host.timeoutMs ?? 5_000);
            })
          ]);
        } catch (error) {
          host.reportFailure(error);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          try { host.dispose(); }
          catch (error) { host.reportFailure(error); }
          finally { host.exit(); }
        }
      })();
      return pending;
    }
  };
};
