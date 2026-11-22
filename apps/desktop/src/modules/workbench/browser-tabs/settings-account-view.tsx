import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, RefreshCw, Trash2 } from "@lyra/icons";

import type { AgentUsageDailyBucket, AgentUsageStats, LyraDesktopApi } from "../../../shared/desktop-bridge";
import { AppButton, AppEmptyState, AppIconButton, AppInput, AppStatusMessage, AppTooltip } from "@renderer/ui/components";
import { IdentityIconView } from "../identity";
import type { SettingsAccount, SettingsAccountLabels } from "./settings-surface-types";
import { ST_CATEGORY_ACCOUNT_CLASS } from "./settings-classes";

type TokenActivityView = "daily" | "weekly" | "cumulative";

type SettingsAccountPageProps = {
  readonly account: SettingsAccount;
  readonly desktopApi: LyraDesktopApi | null;
  readonly labels: SettingsAccountLabels;
};

const formatCompactNumber = (value: number): string => new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1
}).format(value);

const formatDuration = (seconds: number, labels: SettingsAccountLabels): string => {
  if (seconds < 60) {
    return `${seconds}${labels.secondUnit}`;
  }
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours === 0) {
    return `${minutes}${labels.minuteUnit}`;
  }
  return minutes === 0
    ? `${hours}${labels.hourUnit}`
    : `${hours}${labels.hourUnit} ${minutes}${labels.minuteUnit}`;
};

const tokenLevel = (value: number, maximum: number): number => {
  if (value <= 0 || maximum <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(5, Math.ceil((value / maximum) * 5)));
};

const weekGroups = (buckets: readonly AgentUsageDailyBucket[]) => {
  const groups: AgentUsageDailyBucket[][] = [];
  let current: AgentUsageDailyBucket[] = [];
  for (const bucket of buckets) {
    const day = new Date(`${bucket.date}T00:00:00Z`).getUTCDay();
    const mondayIndex = (day + 6) % 7;
    if (mondayIndex === 0 && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(bucket);
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups.slice(-52);
};

const TokenActivityChart = ({
  stats,
  labels
}: {
  readonly stats: AgentUsageStats;
  readonly labels: SettingsAccountLabels;
}) => {
  const [view, setView] = useState<TokenActivityView>("daily");
  const [tooltip, setTooltip] = useState<{
    readonly bucket: AgentUsageDailyBucket;
    readonly left: number;
    readonly top: number;
  } | null>(null);
  const heatmapRegionRef = useRef<HTMLDivElement>(null);
  const weeks = useMemo(() => weekGroups(stats.dailyBuckets), [stats.dailyBuckets]);
  const monthMarkers = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });
    const markers: Array<{ readonly weekIndex: number; readonly label: string }> = [];
    let previousMonth = -1;
    for (const [weekIndex, week] of weeks.entries()) {
      const bucket = week[0];
      if (bucket === undefined) {
        continue;
      }
      const date = new Date(`${bucket.date}T00:00:00Z`);
      const month = date.getUTCMonth();
      if (month !== previousMonth) {
        markers.push({ weekIndex, label: formatter.format(date) });
        previousMonth = month;
      }
    }
    return markers;
  }, [weeks]);
  const dailyMaximum = Math.max(0, ...stats.dailyBuckets.map((bucket) => bucket.reportedTokens));
  const weeklyValues = weeks.map((week) => week.reduce(
    (total, bucket) => total + bucket.reportedTokens,
    0
  ));
  const chartValues = view === "cumulative"
    ? weeklyValues.reduce<number[]>((values, value) => {
      values.push(value + (values.at(-1) ?? 0));
      return values;
    }, [])
    : weeklyValues;
  const chartMaximum = Math.max(0, ...chartValues);

  return (
    <section className="lyra-account-panel lyra-account-token-activity">
      <header className="lyra-account-panel-header">
        <div>
          <h3>{labels.tokenActivity}</h3>
          <span>{labels.lastTwelveMonths}</span>
        </div>
        <div className="lyra-account-chart-tabs" role="group" aria-label={labels.tokenActivity}>
          {([
            ["daily", labels.daily],
            ["weekly", labels.weekly],
            ["cumulative", labels.cumulative]
          ] as const).map(([id, label]) => (
            <AppButton
              key={id}
              variant="ghost"
              size="sm"
              className={view === id ? "lyra-account-chart-tab-active" : undefined}
              onClick={() => setView(id)}
            >
              {label}
            </AppButton>
          ))}
        </div>
      </header>
      {view === "daily" ? (
        <div ref={heatmapRegionRef} className="lyra-account-heatmap-region">
          <div className="lyra-account-heatmap-scroll">
            <div className="lyra-account-heatmap-content">
              <div className="lyra-account-heatmap-months" aria-hidden="true">
                {monthMarkers.map((marker) => (
                  <span
                    key={`${marker.weekIndex}-${marker.label}`}
                    style={{ left: `${weeks.length <= 1 ? 0 : (marker.weekIndex / (weeks.length - 1)) * 100}%` }}
                  >
                    {marker.label}
                  </span>
                ))}
              </div>
              <div className="lyra-account-heatmap" aria-label={labels.daily}>
                {weeks.flatMap((week, weekIndex) => {
                  const firstDay = week[0] === undefined
                    ? 0
                    : (new Date(`${week[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
                  return [
                    ...Array.from({ length: weekIndex === 0 ? firstDay : 0 }, (_, index) => (
                      <span key={`blank-${index}`} className="lyra-account-heatmap-cell lyra-account-heatmap-cell-empty" />
                    )),
                    ...week.map((bucket) => (
                      <span
                        key={bucket.date}
                        className={`lyra-account-heatmap-cell lyra-account-heatmap-level-${tokenLevel(bucket.reportedTokens, dailyMaximum)}`}
                        aria-label={`${bucket.date}: ${formatCompactNumber(bucket.reportedTokens)} ${labels.reportedTokens}`}
                        onMouseEnter={(event) => {
                          const region = heatmapRegionRef.current?.getBoundingClientRect();
                          const cell = event.currentTarget.getBoundingClientRect();
                          if (region === undefined) {
                            return;
                          }
                          setTooltip({
                            bucket,
                            left: cell.left - region.left + (cell.width / 2),
                            top: cell.top - region.top
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    ))
                  ];
                })}
              </div>
            </div>
          </div>
          {tooltip === null ? null : (
            <div
              className="lyra-account-heatmap-tooltip"
              role="tooltip"
              style={{ left: tooltip.left, top: tooltip.top }}
            >
              {new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "numeric",
                timeZone: "UTC"
              }).format(new Date(`${tooltip.bucket.date}T00:00:00Z`))}
              {" · "}
              {formatCompactNumber(tooltip.bucket.reportedTokens)} {labels.reportedTokens}
            </div>
          )}
        </div>
      ) : (
        <div className="lyra-account-week-chart" aria-label={view === "weekly" ? labels.weekly : labels.cumulative}>
          {chartValues.map((value, index) => (
            <span
              key={`${view}-${index}`}
              className="lyra-account-week-bar"
              style={{ height: `${chartMaximum === 0 ? 2 : Math.max(2, (value / chartMaximum) * 100)}%` }}
              title={`${formatCompactNumber(value)}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export const SettingsAccountPage = ({ account, desktopApi, labels }: SettingsAccountPageProps) => {
  const [stats, setStats] = useState<AgentUsageStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(account.displayName);
  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    setDisplayName(account.displayName);
    setAvatarUrl(account.avatarUrl ?? "");
  }, [account.avatarUrl, account.displayName]);

  const loadStats = useCallback(() => {
    const readUsageStats = desktopApi?.agent?.readUsageStats;
    if (readUsageStats === undefined) {
      setStats(null);
      setStatsError(labels.usageUnavailable);
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    setStatsError(null);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    void readUsageStats({ timeZone, rangeDays: 365 })
      .then((value) => {
        setStats(value);
        setStatsLoading(false);
      })
      .catch(() => {
        setStats(null);
        setStatsError(labels.usageUnavailable);
        setStatsLoading(false);
      });
  }, [desktopApi?.agent, labels.usageUnavailable]);

  useEffect(() => {
    loadStats();
    const handleVisibility = (): void => {
      if (document.visibilityState === "visible") {
        loadStats();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadStats]);

  const handleSaveProfile = async (): Promise<void> => {
    const normalizedName = displayName.trim();
    const normalizedAvatarUrl = avatarUrl.trim();
    if (normalizedName.length < 1 || normalizedName.length > 80) {
      setEditError(labels.invalidName);
      return;
    }
    if (normalizedAvatarUrl.length > 0) {
      try {
        if (new URL(normalizedAvatarUrl).protocol !== "https:") {
          setEditError(labels.invalidAvatarUrl);
          return;
        }
      } catch {
        setEditError(labels.invalidAvatarUrl);
        return;
      }
    }
    if (account.onUpdateProfile === undefined) {
      return;
    }
    setProfileSaving(true);
    setEditError(null);
    try {
      await account.onUpdateProfile({
        displayName: normalizedName,
        avatarUrl: normalizedAvatarUrl
      });
      setEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : labels.profileUpdateFailed);
    } finally {
      setProfileSaving(false);
    }
  };

  const coveragePercent = stats === null || stats.coverage.eligibleTurns === 0
    ? 0
    : Math.round((stats.coverage.reportedTurns / stats.coverage.eligibleTurns) * 100);

  return (
    <section className={`lyra-settings-category lyra-settings-category-account ${ST_CATEGORY_ACCOUNT_CLASS}`} aria-labelledby="lyra-settings-account-heading">
      <header className="lyra-settings-category-header">
        <h2 id="lyra-settings-account-heading">{labels.title}</h2>
      </header>
      <div className="lyra-account-profile">
        <IdentityIconView
          className="lyra-account-profile-avatar"
          iconUrl={account.avatarUrl}
          label={account.displayName}
          fallback={account.kind === "local"
            ? <span className="lyra-settings-account-local-logo lyra-settings-nav-logo" />
            : account.displayName.slice(0, 1).toUpperCase()}
        />
        <div className="lyra-account-profile-copy">
          <h3>{account.displayName}</h3>
          {account.email === null || account.email === undefined ? null : <p>{account.email}</p>}
          <span>{account.kind === "signed-in" ? labels.cloudAccount : labels.localAccount} · {labels.deviceScope}</span>
        </div>
        {account.kind === "local" ? (
          <AppButton
            variant="secondary"
            size="sm"
            disabled={account.actionPending}
            onClick={account.onAction}
          >
            {account.actionLabel}
          </AppButton>
        ) : (
          <div className="lyra-account-profile-actions">
            {account.onUpdateProfile === undefined ? null : (
              <AppTooltip content={labels.edit}>
                <AppIconButton
                  aria-label={labels.edit}
                  title={labels.edit}
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={15} aria-hidden="true" />
                </AppIconButton>
              </AppTooltip>
            )}
            {account.deleteAction === undefined ? null : (
              <AppTooltip content={account.deleteAction.label}>
                <AppIconButton
                  aria-label={account.deleteAction.label}
                  title={account.deleteAction.label}
                  tone="danger"
                  disabled={account.deleteAction.pending || account.actionPending}
                  onClick={account.deleteAction.onSelect}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </AppIconButton>
              </AppTooltip>
            )}
          </div>
        )}
      </div>

      {!editing ? null : (
        <section className="lyra-account-panel lyra-account-edit-form">
          <label htmlFor="lyra-account-display-name">
            <span>{labels.displayName}</span>
            <AppInput id="lyra-account-display-name" aria-label={labels.displayName} value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label htmlFor="lyra-account-avatar-url">
            <span>{labels.avatarUrl}</span>
            <AppInput id="lyra-account-avatar-url" aria-label={labels.avatarUrl} value={avatarUrl} placeholder={labels.avatarUrlPlaceholder} onChange={(event) => setAvatarUrl(event.target.value)} />
            <small>{labels.avatarUrlDescription}</small>
          </label>
          {editError === null ? null : (
            <AppStatusMessage className="lyra-account-inline-error" role="alert" tone="error">
              {editError}
            </AppStatusMessage>
          )}
          <div className="lyra-account-edit-actions">
            <AppButton variant="ghost" size="sm" disabled={profileSaving} onClick={() => {
              setEditing(false);
              setEditError(null);
              setDisplayName(account.displayName);
              setAvatarUrl(account.avatarUrl ?? "");
            }}>{labels.cancel}</AppButton>
            <AppButton variant="default" size="sm" disabled={profileSaving} onClick={() => void handleSaveProfile()}>{labels.save}</AppButton>
          </div>
        </section>
      )}

      {statsLoading ? <div className="lyra-account-loading">{labels.loading}</div> : null}
      {!statsLoading && statsError !== null ? (
        <section className="lyra-account-panel lyra-account-error" role="alert">
          <p>{statsError}</p>
          <AppButton variant="secondary" size="sm" onClick={loadStats}>
            <RefreshCw size={14} aria-hidden="true" />
            {labels.retry}
          </AppButton>
        </section>
      ) : null}
      {stats === null ? null : (
        <>
          <div className="lyra-account-summary-grid">
            {[
              [labels.reportedTokens, formatCompactNumber(stats.totals.reportedTokens)],
              [labels.peakDailyTokens, formatCompactNumber(stats.peakDailyTokens)],
              [labels.longestTask, formatDuration(stats.longestTurnSeconds, labels)],
              [labels.currentStreak, `${stats.currentStreakDays} ${labels.dayUnit}`],
              [labels.longestStreak, `${stats.longestStreakDays} ${labels.dayUnit}`]
            ].map(([label, value]) => (
              <div key={label} className="lyra-account-summary-item">
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          {stats.totals.sessions === 0 ? (
            <AppEmptyState
              className="lyra-account-empty"
              data-panel="true"
              density="compact"
              title={labels.noActivity}
            />
          ) : (
            <>
              <TokenActivityChart stats={stats} labels={labels} />
              <div className="lyra-account-detail-grid">
                <section className="lyra-account-panel">
                  <h3>{labels.activityOverview}</h3>
                  <dl className="lyra-account-stat-list">
                    {[
                      [labels.sessions, stats.totals.sessions],
                      [labels.messages, stats.totals.messages],
                      [labels.turns, stats.totals.turns],
                      [labels.activeDays, stats.totals.activeDays],
                      [labels.tokenCoverage, `${coveragePercent}%`]
                    ].map(([label, value]) => (
                      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                    ))}
                  </dl>
                  <p className="lyra-account-coverage-note">
                    {labels.coverageDetail
                      .replace("{reported}", String(stats.coverage.reportedTurns))
                      .replace("{eligible}", String(stats.coverage.eligibleTurns))}
                    {stats.coverage.incompleteTurns === 0 ? "" : ` ${labels.incompleteCoverageDetail.replace("{count}", String(stats.coverage.incompleteTurns))}`}
                  </p>
                </section>
                <section className="lyra-account-panel">
                  <h3>{labels.topModels}</h3>
                  {stats.topModels.length === 0 ? <p className="lyra-account-muted">{labels.noModelActivity}</p> : (
                    <ol className="lyra-account-model-list">
                      {stats.topModels.map((model) => (
                        <li key={`${model.providerId}:${model.modelId}`}>
                          <span><strong>{model.modelId}</strong><small>{model.providerId}</small></span>
                          <span>{model.successfulCalls} {labels.successfulCalls}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}

    </section>
  );
};
