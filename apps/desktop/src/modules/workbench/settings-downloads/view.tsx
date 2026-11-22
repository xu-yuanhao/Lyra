import { useEffect, useState } from "react";

import { FolderOpen } from "@lyra/icons";

import type {
  DownloadManagerSettings,
  DownloadManagerUpdateSettingsRequest
} from "../../../shared/download-manager";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import {
  AppIconButton,
  AppInput,
  AppSelect,
  AppSettingsRow,
  AppSettingsSection,
  AppSwitch,
  AppTextarea
} from "@renderer/ui/components";
import type { SettingsDownloadsLabels } from "./types";
import {
  ST_DOWNLOADS_GRID_CLASS,
  ST_INLINE_INPUT_CLASS,
  ST_ROW_BLOCK_CONTROL_CLASS
} from "../browser-tabs/settings-classes";

type Props = {
  readonly desktopApi: LyraDesktopApi | null;
  readonly labels: SettingsDownloadsLabels;
  readonly onChooseDirectory: () => Promise<string | null>;
};

const parseNonNegativeInt = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const SettingsDownloadsView = ({ desktopApi, labels, onChooseDirectory }: Props) => {
  const downloads = desktopApi?.downloads;
  const [settings, setSettings] = useState<DownloadManagerSettings | null>(null);
  const [proxyUrlDraft, setProxyUrlDraft] = useState("");
  const [seedTimeDraft, setSeedTimeDraft] = useState("0");
  const [trackersDraft, setTrackersDraft] = useState("");

  useEffect(() => {
    if (downloads === undefined) {
      return;
    }
    let cancelled = false;
    downloads.readSettings()
      .then((next) => {
        if (cancelled) {
          return;
        }
        setSettings(next);
        setProxyUrlDraft(next.proxy.url ?? "");
        setSeedTimeDraft(String(next.bt.seedTimeMinutes));
        setTrackersDraft(next.bt.trackerUrls.join("\n"));
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [downloads]);

  if (downloads === undefined) {
    return (
      <AppSettingsSection label={labels.title}>
        <AppSettingsRow title={labels.unavailable} />
      </AppSettingsSection>
    );
  }

  const update = async (request: DownloadManagerUpdateSettingsRequest): Promise<void> => {
    const next = await downloads.updateSettings(request);
    setSettings(next);
    setProxyUrlDraft(next.proxy.url ?? "");
    setSeedTimeDraft(String(next.bt.seedTimeMinutes));
    setTrackersDraft(next.bt.trackerUrls.join("\n"));
  };

  if (settings === null) {
    return (
      <AppSettingsSection label={labels.title}>
        <AppSettingsRow title={labels.unavailable} />
      </AppSettingsSection>
    );
  }

  const chooseDefaultDirectory = (): void => {
    void onChooseDirectory()
      .then((path) => {
        if (path !== null && path !== (settings.defaultDirectory ?? "")) {
          void update({ defaultDirectory: path });
        }
      })
      .catch(() => undefined);
  };

  const commitProxyUrl = (): void => {
    const trimmed = proxyUrlDraft.trim();
    if (trimmed !== (settings.proxy.url ?? "")) {
      void update({ proxy: { ...settings.proxy, url: trimmed.length === 0 ? undefined : trimmed } });
    }
  };

  const commitSeedTime = (): void => {
    const next = parseNonNegativeInt(seedTimeDraft, settings.bt.seedTimeMinutes);
    if (next !== settings.bt.seedTimeMinutes) {
      void update({ bt: { ...settings.bt, seedTimeMinutes: next } });
    }
  };

  const commitTrackers = (): void => {
    const urls = trackersDraft
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (urls.join("\n") !== settings.bt.trackerUrls.join("\n")) {
      void update({ bt: { ...settings.bt, trackerUrls: urls } });
    }
  };

  return (
    <div className={ST_DOWNLOADS_GRID_CLASS}>
      <AppSettingsSection label={labels.title}>
        <AppSettingsRow
          title={labels.defaultDirectory}
          description={settings.defaultDirectory ?? labels.defaultDirectorySystem}
          control={(
            <AppIconButton
              type="button"
              aria-label={labels.chooseDirectory}
              title={labels.chooseDirectory}
              onClick={chooseDefaultDirectory}
            >
              <FolderOpen size={14} aria-hidden="true" />
            </AppIconButton>
          )}
        />
      </AppSettingsSection>
      <AppSettingsSection label={labels.proxySection}>
        <AppSettingsRow
          title={labels.proxyMode}
          control={(
            <AppSelect
              ariaLabel={labels.proxyMode}
              className="lyra-settings-select"
              contentClassName="lyra-settings-select-content"
              value={settings.proxy.mode}
              options={[
                { value: "system", label: labels.proxyModeSystem },
                { value: "direct", label: labels.proxyModeDirect },
                { value: "http", label: labels.proxyModeHttp },
                { value: "socks5", label: labels.proxyModeSocks5 }
              ]}
              onValueChange={(mode) => {
                if (mode !== settings.proxy.mode) {
                  void update({ proxy: { mode, url: settings.proxy.url } });
                }
              }}
            />
          )}
        />
        {settings.proxy.mode === "http" || settings.proxy.mode === "socks5" ? (
          <AppSettingsRow
            title={labels.proxyUrl}
            control={(
              <AppInput
                aria-label={labels.proxyUrl}
                className={`lyra-settings-input ${ST_INLINE_INPUT_CLASS}`}
                value={proxyUrlDraft}
                placeholder={labels.proxyUrlPlaceholder}
                onChange={(event) => {
                  setProxyUrlDraft(event.target.value);
                }}
                onBlur={commitProxyUrl}
              />
            )}
          />
        ) : null}
      </AppSettingsSection>
      <AppSettingsSection label={labels.btSection}>
        <AppSettingsRow
          title={labels.btDht}
          control={(
            <AppSwitch
              checked={settings.bt.dhtEnabled}
              aria-label={labels.btDht}
              onCheckedChange={(dhtEnabled) => {
                void update({ bt: { ...settings.bt, dhtEnabled } });
              }}
            />
          )}
        />
        <AppSettingsRow
          title={labels.btPeerExchange}
          control={(
            <AppSwitch
              checked={settings.bt.peerExchangeEnabled}
              aria-label={labels.btPeerExchange}
              onCheckedChange={(peerExchangeEnabled) => {
                void update({ bt: { ...settings.bt, peerExchangeEnabled } });
              }}
            />
          )}
        />
        <AppSettingsRow
          title={labels.btLocalPeerDiscovery}
          control={(
            <AppSwitch
              checked={settings.bt.localPeerDiscoveryEnabled}
              aria-label={labels.btLocalPeerDiscovery}
              onCheckedChange={(localPeerDiscoveryEnabled) => {
                void update({ bt: { ...settings.bt, localPeerDiscoveryEnabled } });
              }}
            />
          )}
        />
        <AppSettingsRow
          title={labels.btSeedTime}
          control={(
            <AppInput
              aria-label={labels.btSeedTime}
              className={`lyra-settings-input ${ST_INLINE_INPUT_CLASS}`}
              inputMode="numeric"
              value={seedTimeDraft}
              onChange={(event) => {
                setSeedTimeDraft(event.target.value);
              }}
              onBlur={commitSeedTime}
            />
          )}
        />
        <AppSettingsRow
          className={ST_ROW_BLOCK_CONTROL_CLASS}
          title={labels.btTrackers}
          control={(
            <AppTextarea
              aria-label={labels.btTrackers}
              className="lyra-settings-textarea"
              value={trackersDraft}
              placeholder={labels.btTrackersPlaceholder}
              onChange={(event) => {
                setTrackersDraft(event.target.value);
              }}
              onBlur={commitTrackers}
            />
          )}
        />
      </AppSettingsSection>
    </div>
  );
};