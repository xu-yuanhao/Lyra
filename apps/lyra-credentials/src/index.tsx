import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createFirstPartyAppModule,
  useFirstPartyWorkbenchChrome,
  type FirstPartySurfaceProps
} from "@lyra/first-party-app-kit";

import { resolveMessages } from "./l10n/resolve";
import { parseCredentialsSnapshot } from "./parse";
import { CredentialsEmbeddedChrome } from "./surface";
import type {
  CredentialsMessages,
  CredentialsSection,
  CredentialsSnapshot,
  CredentialSession,
  StoredCredential
} from "./types";

const COMMANDS = {
  read: "lyra.core.credentials.read",
  deleteCredential: "lyra.core.credentials.delete",
  copyCredential: "lyra.core.credentials.copy",
  fillCredential: "lyra.core.credentials.fill",
  clearSite: "lyra.core.credentials.clear-site",
  navigate: "lyra.core.navigate"
} as const;
const CREDENTIALS_CHANGED_EVENT = "lyra.core.credentials-changed";
const OWNER_ID = "lyra.credentials";
const SECTION_COMMANDS: Readonly<Record<CredentialsSection, string>> = {
  sessions: "lyra.credentials.show-sessions",
  review: "lyra.credentials.show-review",
  credentials: "lyra.credentials.show-passwords"
};

export { parseCredentialsSnapshot } from "./parse";
export type { CredentialsSnapshot } from "./types";

const normalize = (value: string): string => value.trim().toLocaleLowerCase();

const SECTIONS: readonly CredentialsSection[] = ["sessions", "review", "credentials"];
const SECTION_LABELS: Readonly<
  Record<CredentialsSection, (labels: CredentialsMessages) => string>
> = {
  sessions: (labels) => labels.sessionsTab,
  review: (labels) => labels.reviewTab,
  credentials: (labels) => labels.credentialsTab
};

/**
 * The address band owns the list switch, so its buttons must reach the mounted
 * surface without a second Core round trip. One Logins page is mounted at a
 * time; a broadcast keeps every listener consistent if that changes.
 */
const sectionStore = (() => {
  let section: CredentialsSection = "sessions";
  const listeners = new Set<() => void>();
  return {
    read: (): CredentialsSection => section,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: CredentialsSection): void => {
      if (next === section) return;
      section = next;
      for (const listener of listeners) listener();
    }
  };
})();

const sectionCommandHandler = (section: CredentialsSection) =>
  (): null => {
    sectionStore.set(section);
    return null;
  };

const sessionSearchText = (session: CredentialSession): string =>
  normalize([
    session.hostname,
    session.origin,
    session.title,
    session.address,
    session.accountHint,
    session.authMethod.label,
    session.authMethod.providerDomain,
    session.notes
  ].filter(Boolean).join(" "));

const credentialSearchText = (credential: StoredCredential): string =>
  normalize([
    credential.hostname,
    credential.origin,
    credential.username,
    credential.usernameLabel,
    credential.authMethod.label,
    credential.authMethod.providerDomain
  ].filter(Boolean).join(" "));

const CredentialsSurface = ({
  host,
  presentation
}: FirstPartySurfaceProps) => {
  const labels = useMemo(
    () => resolveMessages(presentation.locale),
    [presentation.locale]
  );
  const [snapshot, setSnapshot] = useState<CredentialsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [section, setSection] = useState<CredentialsSection>(sectionStore.read);

  useEffect(() => sectionStore.subscribe(() => setSection(sectionStore.read())), []);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(parseCredentialsSnapshot(await host.executeCommand(COMMANDS.read, {})));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [host]);

  useEffect(() => {
    void refresh();
    try {
      const subscription = host.subscribeEvent(CREDENTIALS_CHANGED_EVENT, async () => refresh());
      return () => subscription.dispose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return undefined;
    }
  }, [host, refresh]);

  const sessions = snapshot?.sessions ?? [];
  const credentials = snapshot?.credentials ?? [];
  const filteredSessions = useMemo(() => {
    const text = normalize(query);
    if (text.length === 0) return sessions;
    return sessions.filter((session) => sessionSearchText(session).includes(text));
  }, [query, sessions]);
  const filteredReviewSessions = useMemo(() => {
    const reviewSessions = sessions.filter((session) => session.authMethodSource !== "manual");
    const text = normalize(query);
    if (text.length === 0) return reviewSessions;
    return reviewSessions.filter((session) => sessionSearchText(session).includes(text));
  }, [query, sessions]);
  const filteredCredentials = useMemo(() => {
    const text = normalize(query);
    if (text.length === 0) return credentials;
    return credentials.filter((credential) => credentialSearchText(credential).includes(text));
  }, [credentials, query]);

  const run = useCallback(async (key: string, work: () => Promise<unknown>) => {
    setBusyKey(key);
    try {
      await work();
      await refresh();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyKey(null);
    }
  }, [refresh]);

  const buildChrome = useCallback(() => ({
    toolbarContext: {
      ariaLabel: labels.sectionsLabel,
      actions: SECTIONS.map((id, index) => ({
        id: `show-${id}`,
        label: SECTION_LABELS[id](labels),
        commandId: SECTION_COMMANDS[id],
        order: index,
        display: "text" as const,
        active: id === section
      }))
    }
  }), [labels, section]);

  useFirstPartyWorkbenchChrome(OWNER_ID, buildChrome, [buildChrome]);

  return (
    <CredentialsEmbeddedChrome
      labels={labels}
      locale={presentation.locale}
      section={section}
      sessions={filteredSessions}
      reviewSessions={filteredReviewSessions}
      credentials={filteredCredentials}
      query={query}
      error={error}
      busyKey={busyKey}
      onQueryChange={setQuery}
      onOpenSite={(url, title) => {
        void host.executeCommand(COMMANDS.navigate, {
          address: url,
          ...(title === undefined ? {} : { title })
        });
      }}
      onLogoutSite={(session) => {
        void run(`session:${session.id}`, () => host.executeCommand(COMMANDS.clearSite, {
          sessionId: session.id
        }));
      }}
      onFillCredential={(credential) => {
        void run(`credential:${credential.id}`, () => host.executeCommand(COMMANDS.fillCredential, {
          credentialId: credential.id,
          reason: "user-fill"
        }));
      }}
      onCopyCredential={(credential) => {
        void host.executeCommand(COMMANDS.copyCredential, {
          credentialId: credential.id,
          reason: "user-copy"
        }).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : String(cause));
        });
      }}
      onDeleteCredential={(credential) => {
        void run(`credential:${credential.id}`, () => host.executeCommand(COMMANDS.deleteCredential, {
          credentialId: credential.id
        }));
      }}
    />
  );
};

export const lyraAppModule = createFirstPartyAppModule({
  componentId: "lyra.credentials",
  version: __LYRA_APP_VERSION__,
  contributions: {
    commands: [
      { id: "lyra.credentials.refresh", title: "Refresh logins" },
      { id: SECTION_COMMANDS.sessions, title: "Show login sessions" },
      { id: SECTION_COMMANDS.review, title: "Show login sessions to review" },
      { id: SECTION_COMMANDS.credentials, title: "Show saved passwords" }
    ],
    settings: [
      { id: "lyra.credentials.settings", title: "Logins", route: "/credentials" }
    ],
    status: [
      { id: "lyra.credentials.status", title: "Logins" }
    ]
  },
  commandHandlers: {
    "lyra.credentials.refresh": (host) => host.executeCommand(COMMANDS.read, {}),
    [SECTION_COMMANDS.sessions]: sectionCommandHandler("sessions"),
    [SECTION_COMMANDS.review]: sectionCommandHandler("review"),
    [SECTION_COMMANDS.credentials]: sectionCommandHandler("credentials")
  },
  surfaces: {
    "login-manager": {
      title: "Logins",
      description: "Review locally encrypted captured sign-in data.",
      component: CredentialsSurface
    }
  }
});
export default lyraAppModule;
