import { useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  AgentImportDetection,
  AgentImportPreferences,
  AgentImportSource,
  AgentImportSourceId
} from "../../../shared/agent";
import type {
  BrowserImportBrowserId,
  BrowserImportProfile,
  BrowserImportResult
} from "../../../shared/browser-import";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import braveIconUrl from "@renderer/assets/import-sources/brave.svg";
import chromeIconUrl from "@renderer/assets/import-sources/chrome.svg";
import chromiumIconUrl from "@renderer/assets/import-sources/chromium.svg";
import claudeIconUrl from "@renderer/assets/import-sources/claude.svg";
import codexIconUrl from "@renderer/assets/import-sources/codex.svg";
import cursorIconUrl from "@renderer/assets/import-sources/cursor.svg";
import edgeIconUrl from "@renderer/assets/import-sources/edge.svg";
import firefoxIconUrl from "@renderer/assets/import-sources/firefox.svg";
import openCodeIconUrl from "@renderer/assets/provider-icons/opencode.svg";
import vivaldiIconUrl from "@renderer/assets/import-sources/vivaldi.svg";
import zedIconUrl from "@renderer/assets/import-sources/zed.svg";
import {
  AppButton,
  AppSettingsRow,
  AppSettingsSection,
  AppSubPageBack,
  AppSwitch
} from "@renderer/ui/components";
import { IdentityIconView } from "../identity";

export type SettingsImportLabels = {
  readonly title: string;
  readonly description: string;
  readonly detect: string;
  readonly sync: string;
  readonly synced: string;
  readonly needsAttention: string;
  readonly noContent: string;
  readonly skills: string;
  readonly mcp: string;
  readonly back: string;
  readonly loading: string;
  readonly unavailable: string;
  readonly browsersDescription: string;
  readonly browserImport: string;
  readonly browserEmpty: string;
  readonly cookies: string;
  readonly sites: string;
  readonly browserIssueKeyring: string;
  readonly browserIssueAppBound: string;
  readonly browserIssueGeneric: string;
};

type Props = {
  readonly desktopApi: LyraDesktopApi | null;
  readonly labels: SettingsImportLabels;
};

const sourceIconUrls: Readonly<Record<AgentImportSourceId, string>> = {
  claude: claudeIconUrl,
  cursor: cursorIconUrl,
  codex: codexIconUrl,
  opencode: openCodeIconUrl,
  zed: zedIconUrl
};

const monochromeSourceIds: readonly AgentImportSourceId[] = ["cursor", "codex", "zed"];

/** Chrome's channels ship the same mark, so one asset covers every Chrome install. */
const browserIconUrls: Readonly<Record<BrowserImportBrowserId, string>> = {
  chrome: chromeIconUrl,
  "chrome-beta": chromeIconUrl,
  "chrome-dev": chromeIconUrl,
  "chrome-canary": chromeIconUrl,
  chromium: chromiumIconUrl,
  brave: braveIconUrl,
  edge: edgeIconUrl,
  vivaldi: vivaldiIconUrl,
  firefox: firefoxIconUrl
};

/** The account picture of a profile, sitting on the browser mark's bottom-right
 * corner. The account initial stands in when the browser cached no picture. */
const accountBadge = (profile: BrowserImportProfile): ReactNode => {
  const initial = profile.accountEmail?.trim().charAt(0).toLocaleUpperCase();
  if (initial === undefined && profile.avatarDataUrl === undefined) return null;
  return (
    <IdentityIconView
      className="lyra-settings-import-source-avatar"
      iconUrl={profile.avatarDataUrl}
      fallback={initial ?? ""}
    />
  );
};

const ImportSourceIcon = ({
  src,
  monochrome = false,
  badge
}: {
  readonly src: string;
  readonly monochrome?: boolean;
  readonly badge?: ReactNode;
}) => (
  <span className="lyra-settings-import-source-icon-frame">
    <img
      alt=""
      aria-hidden="true"
      className="lyra-settings-import-source-icon"
      data-monochrome={monochrome ? "true" : undefined}
      src={src}
    />
    {badge}
  </span>
);

const SourceTitle = ({ source }: { readonly source: AgentImportSource }) => (
  <span className="lyra-settings-import-source-title">
    <ImportSourceIcon
      monochrome={monochromeSourceIds.includes(source.id)}
      src={sourceIconUrls[source.id]}
    />
    <span>{source.label}</span>
  </span>
);

const BrowserTitle = ({ profile }: { readonly profile: BrowserImportProfile }) => (
  <span className="lyra-settings-import-source-title">
    <ImportSourceIcon badge={accountBadge(profile)} src={browserIconUrls[profile.browser]} />
    <span>{`${profile.browserLabel} · ${profile.profileName}`}</span>
  </span>
);

const emptyPreferences = (): AgentImportPreferences => ({
  sources: {
    claude: { skills: true, mcp: true },
    cursor: { skills: true, mcp: true },
    codex: { skills: true, mcp: true },
    opencode: { skills: true, mcp: true },
    zed: { skills: true, mcp: true }
  }
});

const sourceDescription = (
  detection: AgentImportDetection | undefined,
  labels: SettingsImportLabels
): string | undefined => {
  if (detection === undefined) return undefined;
  const total = detection.candidates.length;
  const conflict = detection.counts.conflict ?? 0;
  const pending = (detection.counts.pending ?? 0) + (detection.counts.update ?? 0);
  if (total === 0 && detection.diagnostics.length > 0) return labels.needsAttention;
  if (total === 0) return labels.noContent;
  if (conflict > 0 && pending === 0) return labels.needsAttention;
  return `${detection.candidates.filter((item) => item.kind === "skill").length} ${labels.skills} · ${detection.candidates.filter((item) => item.kind === "mcp").length} ${labels.mcp}`;
};

const actionState = (
  detection: AgentImportDetection | undefined
): "detect" | "sync" | "synced" | "attention" | "empty" => {
  if (detection === undefined) return "detect";
  if (detection.candidates.length === 0 && detection.diagnostics.length > 0) return "attention";
  if (detection.candidates.length === 0) return "empty";
  if ((detection.counts.pending ?? 0) + (detection.counts.update ?? 0) > 0) return "sync";
  if ((detection.counts.conflict ?? 0) > 0 || detection.diagnostics.length > 0) return "attention";
  return "synced";
};

const browserImportSummary = (
  result: BrowserImportResult,
  labels: SettingsImportLabels
): string => {
  const counts = `${result.cookies.imported} ${labels.cookies} · ${result.localStorage.originsImported} ${labels.sites}`;
  if (result.issue === "system_keyring_unavailable") return `${counts} · ${labels.browserIssueKeyring}`;
  if (result.issue === "windows_app_bound_unsupported") return `${counts} · ${labels.browserIssueAppBound}`;
  if (result.issue === undefined) return counts;
  return `${counts} · ${labels.browserIssueGeneric}`;
};

/**
 * One row per browser profile, so a browser with three profiles shows up three
 * times. The rows join the agent import list: same divider, same row shape.
 */
const BrowserImportRows = ({
  browserImport,
  labels
}: {
  readonly browserImport: NonNullable<LyraDesktopApi["browserImport"]>;
  readonly labels: SettingsImportLabels;
}) => {
  const [profiles, setProfiles] = useState<readonly BrowserImportProfile[] | null>(null);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [results, setResults] = useState<Readonly<Record<string, BrowserImportResult>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void browserImport.listProfiles()
      .then((response) => {
        if (!cancelled) setProfiles(response.profiles);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setProfiles([]);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => { cancelled = true; };
  }, [browserImport]);

  const handleImport = async (profile: BrowserImportProfile): Promise<void> => {
    if (pendingProfileId !== null) return;
    setPendingProfileId(profile.id);
    setError(null);
    try {
      const result = await browserImport.run({ profileId: profile.id });
      setResults((value) => ({ ...value, [profile.id]: result }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPendingProfileId(null);
    }
  };

  return (
    <>
      {profiles === null ? null : profiles.length === 0 ? (
        <AppSettingsRow title={labels.browserEmpty} description={labels.browsersDescription} />
      ) : profiles.map((profile) => {
        const result = results[profile.id];
        return (
          <AppSettingsRow
            key={profile.id}
            title={<BrowserTitle profile={profile} />}
            className="lyra-settings-import-source lyra-settings-import-browser"
            description={result === undefined ? undefined : browserImportSummary(result, labels)}
            control={(
              <AppButton
                type="button"
                variant="outline"
                size="sm"
                className="lyra-settings-ai-action"
                disabled={pendingProfileId !== null}
                onClick={() => void handleImport(profile)}
              >
                {pendingProfileId === profile.id ? labels.loading : labels.browserImport}
              </AppButton>
            )}
          />
        );
      })}
      {error === null ? null : <AppSettingsRow title={labels.needsAttention} description={error} />}
    </>
  );
};

export const SettingsImportView = ({ desktopApi, labels }: Props) => {
  const agent = desktopApi?.agent;
  const [sources, setSources] = useState<readonly AgentImportSource[]>([]);
  const [preferences, setPreferences] = useState<AgentImportPreferences>(emptyPreferences);
  const [detections, setDetections] = useState<Partial<Record<AgentImportSourceId, AgentImportDetection>>>({});
  const [selectedSourceId, setSelectedSourceId] = useState<AgentImportSourceId | null>(null);
  const [pendingSourceId, setPendingSourceId] = useState<AgentImportSourceId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );

  useEffect(() => {
    if (agent === undefined) return;
    let cancelled = false;
    void Promise.all([agent.listImportSources(), agent.getImportPreferences()])
      .then(([sourceResponse, preferenceResponse]) => {
        if (cancelled) return;
        setSources(sourceResponse.sources);
        setPreferences(preferenceResponse);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => { cancelled = true; };
  }, [agent]);

  const updatePreferences = async (request: Parameters<NonNullable<typeof agent>["setImportPreferences"]>[0]) => {
    if (agent === undefined) return;
    const next = await agent.setImportPreferences(request);
    setPreferences(next);
    setDetections({});
  };

  const handleAction = async (source: AgentImportSource): Promise<void> => {
    if (agent === undefined || pendingSourceId !== null) return;
    setPendingSourceId(source.id);
    setError(null);
    try {
      const current = detections[source.id];
      if (actionState(current) === "sync" && current !== undefined) {
        const result = await agent.syncImport({ detectionId: current.detectionId });
        const failures = result.results.filter((item) => item.status === "failed");
        if (failures.length > 0) {
          setError(failures.map((item) => `${item.targetId}: ${item.message ?? labels.needsAttention}`).join("\n"));
        }
      }
      const detection = await agent.detectImport({
        sourceId: source.id
      });
      setDetections((value) => ({ ...value, [source.id]: detection }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPendingSourceId(null);
    }
  };

  if (agent === undefined) {
    return <AppSettingsSection label={labels.title}><AppSettingsRow title={labels.unavailable} /></AppSettingsSection>;
  }

  if (selectedSource !== null) {
    const preference = preferences.sources[selectedSource.id] ?? { skills: true, mcp: true };
    const detection = detections[selectedSource.id];
    return (
      <div className="lyra-settings-import-detail">
        <AppSubPageBack label={labels.back} onClick={() => setSelectedSourceId(null)} />
        <AppSettingsSection label={selectedSource.label}>
          <AppSettingsRow
            title={labels.skills}
            description={detection?.candidates.filter((item) => item.kind === "skill").map((item) => `${item.sourceItemId} · ${item.projectRoot ?? item.sourcePath} · ${item.status}`).join("\n")}
            control={<AppSwitch aria-label={labels.skills} checked={preference.skills} onCheckedChange={(skills) => void updatePreferences({ sourceId: selectedSource.id, skills })} />}
          />
          <AppSettingsRow
            title={labels.mcp}
            description={detection?.candidates.filter((item) => item.kind === "mcp").map((item) => `${item.sourceItemId} · ${item.projectRoot ?? item.sourcePath} · ${item.status}`).join("\n")}
            control={<AppSwitch aria-label={labels.mcp} checked={preference.mcp} onCheckedChange={(mcp) => void updatePreferences({ sourceId: selectedSource.id, mcp })} />}
          />
        </AppSettingsSection>
      </div>
    );
  }

  return (
    <div className="lyra-settings-import">
      <AppSettingsSection label={labels.title} titlePlacement="none">
        <div className="lyra-settings-row-list" role="group" aria-label={labels.title}>
          {sources.map((source) => {
            const state = actionState(detections[source.id]);
            const actionLabel = state === "detect" ? labels.detect : state === "sync" ? labels.sync : state === "synced" ? labels.synced : labels.needsAttention;
            return (
              <AppSettingsRow
                key={source.id}
                title={<SourceTitle source={source} />}
                className="lyra-settings-import-source"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedSourceId(source.id)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedSourceId(source.id); }}
                description={sourceDescription(detections[source.id], labels)}
                control={state === "empty" ? undefined : (
                  <AppButton
                    type="button"
                    variant={state === "sync" ? "default" : "outline"}
                    size="sm"
                    className={state === "sync"
                      ? "lyra-settings-ai-action lyra-settings-ai-action-primary"
                      : "lyra-settings-ai-action"}
                    disabled={pendingSourceId !== null || state === "synced" || state === "attention"}
                    onClick={(event) => { event.stopPropagation(); void handleAction(source); }}
                  >
                    {pendingSourceId === source.id ? labels.loading : actionLabel}
                  </AppButton>
                )}
              />
            );
          })}
          {desktopApi?.browserImport === undefined ? null : (
            <BrowserImportRows browserImport={desktopApi.browserImport} labels={labels} />
          )}
        </div>
        {error === null ? null : <AppSettingsRow title={labels.needsAttention} description={error} />}
      </AppSettingsSection>
    </div>
  );
};
