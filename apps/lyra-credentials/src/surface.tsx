import {
  useEffect,
  useState,
  type ReactNode
} from "react";
import { LyraAppState } from "@lyra/first-party-app-kit";
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Fingerprint,
  Globe,
  HelpCircle,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  Search,
  ShieldAlert,
  Trash2
} from "@lyra/icons";

import type {
  AuthMethodKind,
  CredentialSession,
  CredentialsMessages,
  CredentialsSection,
  StoredCredential
} from "./types";

const methodIcon = (kind: AuthMethodKind, size = 14): ReactNode => {
  if (kind === "password") return <KeyRound size={size} />;
  if (kind === "passkey") return <Fingerprint size={size} />;
  if (kind === "oauth") return <Link2 size={size} />;
  if (kind === "sso") return <Building2 size={size} />;
  if (kind === "magic_link") return <Mail size={size} />;
  if (kind === "site_session") return <Globe size={size} />;
  return <HelpCircle size={size} />;
};

const SiteIcon = ({
  faviconUrl,
  fallback,
  size = 14
}: {
  readonly faviconUrl: string | undefined;
  readonly fallback: ReactNode;
  readonly size?: number;
}): ReactNode => {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [faviconUrl]);
  if (faviconUrl !== undefined && faviconUrl.trim().length > 0 && !failed) {
    return (
      <img
        src={faviconUrl}
        alt=""
        aria-hidden="true"
        className="lyra-login-manager-site-favicon"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return <>{fallback}</>;
};

const formatTime = (value: string | undefined, locale: string): string => {
  if (value === undefined || value.trim().length === 0) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date.getTime());
};

const IconButton = ({
  label,
  tone,
  disabled,
  onClick,
  children
}: {
  readonly label: string;
  readonly tone?: "danger";
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}): ReactNode => (
  <button
    type="button"
    className="lyra-ui-button lyra-ui-button-ghost lyra-ui-button-size-icon lyra-app-icon-button lyra-app-sidebar-row-action lyra-login-manager-row-action"
    aria-label={label}
    title={label}
    disabled={disabled}
    data-tone={tone ?? "default"}
    onClick={onClick}
  >
    {children}
  </button>
);

const ObjectRow = ({
  icon,
  title,
  meta,
  actions
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly meta: string;
  readonly actions: ReactNode;
}): ReactNode => (
  <div
    className="lyra-app-object-row lyra-app-sidebar-row lyra-login-manager-row lyra-login-manager-embedded-row"
    data-has-icon="true"
    data-has-actions="true"
  >
    <span className="lyra-app-object-row-icon" aria-hidden="true">{icon}</span>
    <span className="lyra-app-object-row-main">
      <span className="lyra-app-object-row-head">
        <span className="lyra-app-object-row-title">{title}</span>
        {meta.length > 0 ? (
          <span className="lyra-app-object-row-meta">{meta}</span>
        ) : null}
      </span>
    </span>
    <span
      className="lyra-app-object-row-actions"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {actions}
    </span>
  </div>
);

export const CredentialsEmbeddedChrome = ({
  labels,
  locale,
  section,
  sessions,
  reviewSessions,
  credentials,
  query,
  error,
  busyKey,
  onQueryChange,
  onOpenSite,
  onLogoutSite,
  onFillCredential,
  onCopyCredential,
  onDeleteCredential
}: {
  readonly labels: CredentialsMessages;
  readonly locale: string;
  readonly section: CredentialsSection;
  readonly sessions: readonly CredentialSession[];
  readonly reviewSessions: readonly CredentialSession[];
  readonly credentials: readonly StoredCredential[];
  readonly query: string;
  readonly error: string | null;
  readonly busyKey: string | null;
  readonly onQueryChange: (value: string) => void;
  readonly onOpenSite: (url: string, title?: string) => void;
  readonly onLogoutSite: (session: CredentialSession) => void;
  readonly onFillCredential: (credential: StoredCredential) => void;
  readonly onCopyCredential: (credential: StoredCredential) => void;
  readonly onDeleteCredential: (credential: StoredCredential) => void;
}): ReactNode => {
  const sessionActions = (session: CredentialSession): ReactNode => (
    <>
      <IconButton
        label={labels.openSite}
        onClick={() => onOpenSite(session.address ?? session.origin, session.title ?? session.hostname)}
      >
        <ExternalLink size={14} aria-hidden="true" />
      </IconButton>
      <IconButton
        label={labels.logoutSite}
        tone="danger"
        disabled={busyKey === `session:${session.id}`}
        onClick={() => onLogoutSite(session)}
      >
        <LogOut size={14} aria-hidden="true" />
      </IconButton>
    </>
  );
  const credentialActions = (credential: StoredCredential): ReactNode => (
    <>
      <IconButton
        label={labels.openSite}
        onClick={() => onOpenSite(credential.origin, credential.hostname)}
      >
        <ExternalLink size={14} aria-hidden="true" />
      </IconButton>
      <IconButton
        label={labels.fill}
        disabled={!credential.passwordAvailable || busyKey === `credential:${credential.id}`}
        onClick={() => onFillCredential(credential)}
      >
        <Check size={14} aria-hidden="true" />
      </IconButton>
      <IconButton
        label={labels.copy}
        disabled={!credential.passwordAvailable}
        onClick={() => onCopyCredential(credential)}
      >
        <Copy size={14} aria-hidden="true" />
      </IconButton>
      <IconButton
        label={labels.deleteCredential}
        tone="danger"
        disabled={busyKey === `credential:${credential.id}`}
        onClick={() => onDeleteCredential(credential)}
      >
        <Trash2 size={14} aria-hidden="true" />
      </IconButton>
    </>
  );

  return (
    <section
      className="lyra-login-manager lyra-login-manager-embedded"
      data-lyra-component="lyra.credentials"
      aria-label="credentials-surface"
    >
      {error === null ? null : (
        <p className="lyra-app-status-message lyra-app-status-message-error lyra-login-manager-error">
          <span className="lyra-app-status-message-icon" aria-hidden="true">
            <ShieldAlert size={14} />
          </span>
          <span className="lyra-app-status-message-content">{error}</span>
        </p>
      )}
      <form className="lyra-login-manager-embedded-toolbar" onSubmit={(event) => event.preventDefault()}>
        <div className="lyra-app-search-field lyra-login-manager-search">
          <span className="lyra-app-search-field-leading" aria-hidden="true">
            <Search size={15} />
          </span>
          <input
            className="lyra-ui-input lyra-app-search-field-input"
            aria-label={labels.searchPlaceholder}
            placeholder={labels.searchPlaceholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </form>
      <div className="lyra-login-manager-embedded-list">
        {section === "sessions" ? (
          <section className="lyra-login-manager-section" aria-label={labels.sessionsTab}>
            {sessions.length === 0 ? (
              <LyraAppState kind="empty" title={labels.emptySessions} />
            ) : sessions.map((session) => (
              <ObjectRow
                key={session.id}
                icon={(
                  <SiteIcon
                    faviconUrl={session.faviconUrl}
                    fallback={methodIcon(session.authMethod.kind)}
                  />
                )}
                title={session.hostname}
                meta={formatTime(session.lastSeenAt, locale)}
                actions={sessionActions(session)}
              />
            ))}
          </section>
        ) : section === "review" ? (
          <section className="lyra-login-manager-section" aria-label={labels.reviewTab}>
            {reviewSessions.length === 0 ? (
              <LyraAppState kind="empty" title={labels.emptyReview} />
            ) : reviewSessions.map((session) => (
              <ObjectRow
                key={session.id}
                icon={(
                  <SiteIcon
                    faviconUrl={session.faviconUrl}
                    fallback={methodIcon(session.authMethod.kind)}
                  />
                )}
                title={session.hostname}
                meta={formatTime(session.lastSeenAt, locale)}
                actions={sessionActions(session)}
              />
            ))}
          </section>
        ) : (
          <section className="lyra-login-manager-section" aria-label={labels.credentialsTab}>
            {credentials.length === 0 ? (
              <LyraAppState kind="empty" title={labels.emptyCredentials} />
            ) : credentials.map((credential) => (
              <ObjectRow
                key={credential.id}
                icon={(
                  <SiteIcon
                    faviconUrl={credential.faviconUrl}
                    fallback={methodIcon(credential.authMethod.kind)}
                  />
                )}
                title={credential.hostname}
                meta={formatTime(credential.updatedAt, locale)}
                actions={credentialActions(credential)}
              />
            ))}
          </section>
        )}
      </div>
    </section>
  );
};
