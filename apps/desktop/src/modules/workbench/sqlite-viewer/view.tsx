import { useEffect, useState } from "react";

import { Button } from "@renderer/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@renderer/ui/components/table";
import type { LyraDesktopApi, SqliteInspectResult } from "../../../shared/desktop-bridge";
import { sqliteTitleFromPath } from "../../../shared/sqlite-documents";

type SqliteViewerStatus = "loading" | "ready" | "error";

export const SqliteViewerSurface = ({
  desktopApi,
  filePath,
  title
}: {
  readonly desktopApi: LyraDesktopApi | null;
  readonly filePath: string;
  readonly title?: string;
}) => {
  const [table, setTable] = useState<string | null>(null);
  const [status, setStatus] = useState<SqliteViewerStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<SqliteInspectResult | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    const sqlite = desktopApi?.sqlite;
    if (sqlite === undefined) {
      setStatus("error");
      setMessage("SQLite preview is unavailable.");
      return undefined;
    }
    let cancelled = false;
    setStatus("loading");
    setMessage(null);
    void sqlite.inspect({ path: filePath, ...(table === null ? {} : { table }) }).then((next) => {
      if (cancelled) {
        return;
      }
      setResult(next);
      setStatus("ready");
    }).catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, [desktopApi, filePath, table, requestKey]);

  const heading = title ?? sqliteTitleFromPath(filePath);
  const shown = result?.rows.length ?? 0;

  return (
    <section
      className="lyra-app-module grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-[var(--lyra-app-panel-bg)] text-[var(--lyra-text-primary)]"
      data-lyra-component="lyra.sqlite"
      aria-label="sqlite-viewer-surface"
    >
      <header className="lyra-app-module-toolbar">
        <strong>{heading}</strong>
      </header>
      <div className="flex gap-[var(--lyra-space-8)] overflow-x-auto border-b border-[var(--lyra-app-border)] px-[var(--lyra-space-12)] py-[var(--lyra-space-8)]">
        {result?.tables.map((entry) => (
          <Button
            key={entry.name}
            type="button"
            size="sm"
            variant={entry.name === result.table ? "secondary" : "ghost"}
            aria-pressed={entry.name === result.table}
            onClick={() => {
              setTable(entry.name);
            }}
          >
            {entry.name}
          </Button>
        ))}
      </div>
      <div className="min-h-0 overflow-auto">
        {result !== null && result.columns.length > 0 ? (
          <Table className="w-max min-w-full border-collapse">
            <TableHeader>
              <TableRow>
                {result.columns.map((column) => (
                  <TableHead
                    key={column}
                    className="max-w-[24rem] overflow-hidden text-ellipsis whitespace-pre border-b border-[var(--lyra-app-border)] px-[var(--lyra-space-8)] py-[var(--lyra-space-8)] text-start"
                  >
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={result.columns[cellIndex] ?? cellIndex}
                      className="max-w-[24rem] overflow-hidden text-ellipsis whitespace-pre border-b border-[var(--lyra-app-border)] px-[var(--lyra-space-8)] py-[var(--lyra-space-8)]"
                    >
                      {cell ?? ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </div>
      <footer className="lyra-app-module-footer">
        <span>
          {status === "error"
            ? message
            : status === "loading"
              ? "Opening…"
              : result?.table === null
                ? "No tables."
                : result?.truncated
                  ? `Showing ${shown} rows. More rows remain.`
                  : `${shown} rows`}
        </span>
        {status === "error" ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => setRequestKey((value) => value + 1)}>
            Retry
          </Button>
        ) : null}
      </footer>
    </section>
  );
};
