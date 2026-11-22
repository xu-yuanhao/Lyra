import { useState } from "react";

import { t } from "@workbench/i18n";
import type { AgentModelCatalogSnapshot } from "../../../shared/agent";
import { AppButton, AppInput, AppStatusMessage } from "@renderer/ui/components";

import { getDesktopApi } from "../shell/service";
import {
  AI_DISCOVERY_ROW_CLASS,
  AI_FIELD_CLASS,
  AI_FIELD_SPAN2_CLASS,
  AI_INPUT_CLASS,
  AI_ACCOUNT_AVATAR_CLASS,
  AI_DISCOVERED_MODELS_CLASS,
  AI_DISCOVERED_TOOLBAR_CLASS,
  AI_MODEL_ACTIONS_CLASS,
  AI_MODEL_FLOW_CLASS,
  AI_MODEL_LIST_ROWS_CLASS,
  AI_MODEL_LIST_SURFACE_CLASS,
  AI_MODEL_OPTION_CLASS,
  AI_MODEL_OPTION_CURRENT_CLASS,
  AI_MODEL_OPTION_STATIC_CLASS,
  AI_PROVIDER_SEARCH_RESULTS_CLASS,
  AI_PROVIDER_SEARCH_STEP_CLASS,
  AI_PROVIDER_TAB_ACTIVE_CLASS,
  AI_PROVIDER_TAB_CLASS,
  AI_ROW_ACTION_CLASS,
  AI_ROW_DELETE_CLASS,
  AI_VIEW_ALL_MODELS_CLASS,
} from "./classes";

export function SubscriptionRouteLogin({
  routeId,
  baseUrl,
  onConnected,
}: {
  readonly routeId: string;
  readonly baseUrl: string;
  readonly onConnected: (catalog?: AgentModelCatalogSnapshot | null) => void;
}) {
  const desktopApi = getDesktopApi();
  const [flowId, setFlowId] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [loginBaseUrl, setLoginBaseUrl] = useState<string | null>(null);
  const [account, setAccount] = useState("");
  const [callback, setCallback] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [accountAvatar, setAccountAvatar] = useState<string | null>(null);

  if (desktopApi === null || desktopApi.agent === undefined) {
    return null;
  }
  const agentApi = desktopApi.agent;

  const start = () => {
    setBusy(true);
    setMessage("Opening sign-in…");
    void agentApi.startAccountLogin({
      provider: routeId,
      ...(routeId === "snowflake_cortex" && account.trim().length > 0
        ? { account: account.trim() }
        : {}),
    }).then((started) => {
      setFlowId(started.flowId);
      setAuthUrl(started.authUrl ?? null);
      setUserCode(started.userCode ?? null);
      setLoginBaseUrl(started.baseUrl ?? null);
      setMessage(started.instructions);
      if (started.authUrl) {
        void desktopApi.openExternal(started.authUrl);
      }
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : String(error));
    }).finally(() => setBusy(false));
  };

  const complete = (borrow: boolean) => {
    if (flowId === null && !borrow) {
      return;
    }
    setBusy(true);
    setMessage(borrow ? "Checking the local login…" : "Finishing sign-in…");
    void agentApi.completeAccountLogin({
      provider: routeId,
      flowId,
      callbackInput: borrow ? "borrow" : callback,
      baseUrl: loginBaseUrl ?? (baseUrl.trim().length > 0 ? baseUrl.trim() : null),
      setDefault: false,
    }).then((response) => {
      const name = response.displayName ?? response.email ?? null;
      setAccountName(name);
      setAccountAvatar(response.avatarUrl ?? null);
      setMessage(response.message);
      setCallback("");
      onConnected(response.catalog);
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : String(error));
    }).finally(() => setBusy(false));
  };

  return (
    <div className={`${AI_FIELD_CLASS} ${AI_FIELD_SPAN2_CLASS}`}>
      {accountName === null ? null : (
        <span className={AI_DISCOVERY_ROW_CLASS}>
          {accountAvatar === null ? null : (
            <img
              alt=""
              className={AI_ACCOUNT_AVATAR_CLASS}
              src={accountAvatar}
            />
          )}
          <span>{accountName}</span>
        </span>
      )}
      {routeId === "snowflake_cortex" ? (
        <AppInput
          className={AI_INPUT_CLASS}
          aria-label={t("settings.aiSubscriptionAccount")}
          placeholder={t("settings.aiSubscriptionAccount")}
          value={account}
          onChange={(event) => setAccount(event.target.value)}
        />
      ) : null}
      <span className={AI_DISCOVERY_ROW_CLASS}>
        <AppButton
          variant="outline"
          size="md"
          type="button"
          disabled={busy}
          onClick={start}
        >
          {t("settings.aiSubscriptionLogin")}
        </AppButton>
        {routeId === "azure_openai" ? (
          <AppButton
            variant="ghost"
            size="md"
            type="button"
            disabled={busy}
            onClick={() => complete(true)}
          >
            {t("settings.aiSubscriptionBorrow")}
          </AppButton>
        ) : null}
      </span>
      {userCode === null && authUrl === null && flowId === null ? null : (
        <>
          {userCode === null ? null : <strong>{userCode}</strong>}
          {authUrl === null ? null : <span>{authUrl}</span>}
          <AppInput
            className={AI_INPUT_CLASS}
            aria-label={t("settings.aiSubscriptionCallback")}
            placeholder={t("settings.aiSubscriptionCallback")}
            value={callback}
            onChange={(event) => setCallback(event.target.value)}
          />
          <AppButton
            variant="default"
            size="md"
            type="button"
            disabled={busy}
            onClick={() => complete(false)}
          >
            {t("settings.aiSubscriptionConfirm")}
          </AppButton>
        </>
      )}
      {message === null ? null : (
        <AppStatusMessage tone="neutral">{message}</AppStatusMessage>
      )}
    </div>
  );
}
