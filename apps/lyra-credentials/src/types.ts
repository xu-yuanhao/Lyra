export type AuthMethodKind =
  | "site_session"
  | "password"
  | "passkey"
  | "oauth"
  | "sso"
  | "magic_link"
  | "unknown";

export type FactSource = "observed" | "inferred" | "manual" | "unknown";

export type AuthMethod = {
  readonly kind: AuthMethodKind;
  readonly label: string;
  readonly source: FactSource;
  readonly providerDomain?: string;
};

export type CredentialSession = {
  readonly id: string;
  readonly origin: string;
  readonly hostname: string;
  readonly faviconUrl?: string;
  readonly title?: string;
  readonly address?: string;
  readonly accountHint?: string;
  readonly notes?: string;
  readonly authMethod: AuthMethod;
  readonly authMethodSource: FactSource;
  readonly lastSeenAt?: string;
};

export type StoredCredential = {
  readonly id: string;
  readonly origin: string;
  readonly hostname: string;
  readonly faviconUrl?: string;
  readonly username: string;
  readonly usernameLabel?: string;
  readonly authMethod: AuthMethod;
  readonly passwordAvailable: boolean;
  readonly updatedAt?: string;
};

export type CredentialsSnapshot = {
  readonly sessions: readonly CredentialSession[];
  readonly credentials: readonly StoredCredential[];
};

/**
 * The three lists the Logins page shows. The address band owns the switch, so
 * the page renders one list at a time instead of stacking collapsible sections.
 */
export type CredentialsSection = "sessions" | "review" | "credentials";

export type CredentialsMessages = {
  readonly searchPlaceholder: string;
  readonly sessionsTab: string;
  readonly reviewTab: string;
  readonly credentialsTab: string;
  readonly sectionsLabel: string;
  readonly emptySessions: string;
  readonly emptyReview: string;
  readonly emptyCredentials: string;
  readonly openSite: string;
  readonly logoutSite: string;
  readonly deleteCredential: string;
  readonly copy: string;
  readonly fill: string;
};
