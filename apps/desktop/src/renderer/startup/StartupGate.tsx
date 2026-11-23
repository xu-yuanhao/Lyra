import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AuthLocalePreference,
  AuthLocalIdentity,
  AuthSnapshot,
  AuthUser
} from "../../shared/auth";
import type {
  InstalledLanguagePack,
  OfficialLanguagePackCatalogEntry
} from "../../shared/language-packs";
import type { WorkbenchThemeId } from "@workbench/theme";
import {
  createTranslator,
  setWorkbenchLocale,
  useWorkbenchLocaleSnapshot
} from "@workbench/i18n";
import { AppButton, AppShimmer } from "@renderer/ui/components";
import { getDesktopApi } from "@workbench/shell/service";
import { writeClipboardText } from "../../shared/clipboard";
import {
  hasCompletedLocalStartup,
  markLocalStartupComplete,
  persistStartupPreferences,
  readStoredStartupTheme,
  resolveStartupRequestedLocale
} from "./startup-preferences";
import { resolveStartupLocale } from "./startup-locale";
import {
  hasAcceptedCurrentLegalDocuments,
  recordLegalAcceptance
} from "./startup-legal";
import { dismissLyraBootstrapScreen } from "./bootstrap-screen";
import {
  AnimatedAsciiLogo,
  AnimatedStartupCopy,
  StartupFrame,
  StartupTagline,
  useStartupTheme,
  type StartupAudioState
} from "./startup-chrome";
import {
  STARTUP_ACTIONS_CLASS,
  STARTUP_AUTH_COPY_CLASS,
  STARTUP_AVATAR_CLASS,
  STARTUP_AVATAR_FALLBACK_CLASS,
  STARTUP_BACK_CLASS,
  STARTUP_BRAND_CLASS,
  STARTUP_CANCEL_CLASS,
  STARTUP_CHOICE_CLASS,
  STARTUP_CHOICE_LIST_CLASS,
  STARTUP_ERROR_CLASS,
  STARTUP_HERO_CLASS,
  STARTUP_LEGAL_BUTTON_CLASS,
  STARTUP_LEGAL_CHECK_CLASS,
  STARTUP_LEGAL_CLASS,
  STARTUP_LEGAL_CONSENT_CLASS,
  STARTUP_LEGAL_DESCRIPTION_CLASS,
  STARTUP_LEGAL_LINKS_CLASS,
  STARTUP_LOCAL_CLASS,
  STARTUP_LOGIN_AVATAR_CLASS,
  STARTUP_LOGIN_AVATAR_FALLBACK_CLASS,
  STARTUP_LOGIN_AVATAR_IMAGE_CLASS,
  STARTUP_LOGIN_BUTTON_CLASS,
  STARTUP_LOGO_WRAP_CLASS,
  STARTUP_PANEL_CLASS,
  STARTUP_PREFERENCE_TITLE_CLASS,
  STARTUP_PREFERENCE_TITLE_TRACK_CLASS,
  STARTUP_PREVIEW_BAR_CLASS,
  STARTUP_PREVIEW_BODY_CLASS,
  STARTUP_PREVIEW_CONTENT_CLASS,
  STARTUP_PREVIEW_SIDEBAR_CLASS,
  STARTUP_STATUS_CLASS,
  STARTUP_THEME_CARD_CLASS,
  STARTUP_THEME_CARD_LABEL_CLASS,
  STARTUP_THEME_GRID_CLASS,
  STARTUP_THEME_PREVIEW_BASE_CLASS,
  STARTUP_THEME_PREVIEW_DARK_CLASS,
  STARTUP_THEME_PREVIEW_SYSTEM_CLASS,
  STARTUP_WELCOME_CLASS
} from "./classes";

type StartupGateProps = {
  readonly onReady: () => void;
};

type StartupView =
  | "loading"
  | "legal"
  | "landing"
  | "authenticating"
  | "welcome-signup"
  | "welcome-login"
  | "language"
  | "theme";

type LocaleChoice = {
  readonly id: string;
  readonly label: string;
  readonly preference: AuthLocalePreference;
};

type StartupHoverIntent =
  | "default"
  | "terms"
  | "privacy"
  | "local"
  | "login"
  | "signup"
  | "tagline"
  | "audio"
  | "logo"
  | "brand";

const TERMS_URL = "https://lyra.ltd/legal/terms";
const PRIVACY_URL = "https://lyra.ltd/legal/privacy";

const isChinese = (locale: string): boolean => locale.toLowerCase().startsWith("zh");

const userName = (user: AuthUser | null): string =>
  user?.displayName?.trim() || user?.email?.split("@")[0] || "there";

const EASTER_EGG_COPY = {
  zh: "我好累，压力好大，很焦虑",
  en: "I'm so tired, under so much pressure, and really anxious."
} as const;

const StartupPreferenceTitle = ({ text }: { readonly text: string }) => {
  const viewportRef = useRef<HTMLHeadingElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const measure = measureRef.current;
    if (viewport === null || measure === null) {
      return;
    }
    const updateOverflow = (): void => {
      setIsOverflowing(measure.getBoundingClientRect().width > viewport.clientWidth + 1);
    };
    updateOverflow();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateOverflow);
    observer?.observe(viewport);
    observer?.observe(measure);
    return () => observer?.disconnect();
  }, [text]);

  return (
    <h1
      ref={viewportRef}
      className={`lyra-startup-preference-title${isOverflowing ? " is-overflowing" : ""} ${STARTUP_PREFERENCE_TITLE_CLASS}`}
    >
      <span key={text} className={STARTUP_PREFERENCE_TITLE_TRACK_CLASS}>
        <AnimatedStartupCopy text={text} measureRef={measureRef} />
        {isOverflowing ? <AnimatedStartupCopy text={text} ariaHidden /> : null}
      </span>
    </h1>
  );
};

const Avatar = ({ user }: { readonly user: AuthUser }) => {
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  const avatarUrl = user.avatarUrl;
  if (avatarUrl === undefined || failedUrl === avatarUrl) {
    return (
      <span className={STARTUP_AVATAR_FALLBACK_CLASS}>
        {userName(user).slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className={STARTUP_AVATAR_CLASS}
      src={avatarUrl}
      alt=""
      onError={() => setFailedUrl(avatarUrl)}
    />
  );
};

const LocalIdentityAvatar = ({ identity }: { readonly identity: AuthLocalIdentity }) => {
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  const avatarUrl = identity.registeredAvatarUrl;
  if (avatarUrl === undefined || failedUrl === avatarUrl) {
    return (
      <span className={STARTUP_LOGIN_AVATAR_FALLBACK_CLASS} aria-hidden="true">
        {(identity.registeredDisplayName ?? identity.displayName).slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className={STARTUP_LOGIN_AVATAR_IMAGE_CLASS}
      src={avatarUrl}
      alt=""
      onError={() => setFailedUrl(avatarUrl)}
    />
  );
};

const ThemePreview = ({
  theme,
  selected,
  label,
  onSelect
}: {
  readonly theme: WorkbenchThemeId;
  readonly selected: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}) => (
  <button
    type="button"
    className={`${STARTUP_THEME_CARD_CLASS}${selected ? " is-selected" : ""}`}
    aria-pressed={selected}
    onClick={onSelect}
  >
    <span className={`${STARTUP_THEME_PREVIEW_BASE_CLASS} lyra-startup-theme-preview-${theme.slice(5)}${theme === "lyra-dark" ? ` ${STARTUP_THEME_PREVIEW_DARK_CLASS}` : theme === "lyra-system" ? ` ${STARTUP_THEME_PREVIEW_SYSTEM_CLASS}` : ""}`}>
      <span className={STARTUP_PREVIEW_BAR_CLASS} />
      <span className={STARTUP_PREVIEW_BODY_CLASS}>
        <span className={STARTUP_PREVIEW_SIDEBAR_CLASS} />
        <span className={STARTUP_PREVIEW_CONTENT_CLASS}>
          <span />
          <span />
          <span />
        </span>
      </span>
    </span>
    <span className={STARTUP_THEME_CARD_LABEL_CLASS}>
      {label}
      {selected ? <span aria-hidden="true">✓</span> : null}
    </span>
  </button>
);

export const StartupGate = ({ onReady }: StartupGateProps) => {
  const desktopApi = getDesktopApi();
  const { locale: activeLocale, revision: localeRevision } = useWorkbenchLocaleSnapshot();
  const [startupLocale, setStartupLocale] = useState(activeLocale);
  const viewRef = useRef<StartupView>("loading");
  const [view, setViewState] = useState<StartupView>("loading");
  const setView = useCallback((nextView: StartupView): void => {
    viewRef.current = nextView;
    setViewState(nextView);
  }, []);
  const [localeChoice, setLocaleChoice] = useState<AuthLocalePreference>({ mode: "system" });
  const [resolvedLocale, setResolvedLocale] = useState("en-US");
  const displayLocale =
    view === "language" || view === "theme"
      ? localeChoice.mode === "explicit"
        ? localeChoice.locale
        : resolvedLocale
      : startupLocale;
  const translate = useMemo(
    () => createTranslator(displayLocale),
    [displayLocale, localeRevision]
  );
  const language = {
    login: translate("startup.action.login"),
    signup: translate("startup.action.signup"),
    local: translate("startup.action.local"),
    terms: translate("startup.action.terms"),
    privacy: translate("startup.action.privacy"),
    downloading: translate("startup.state.downloading"),
    browser: translate("startup.state.browser"),
    cancel: translate("startup.action.cancel"),
    back: translate("startup.action.back"),
    cancelHover: translate("startup.hover.cancel"),
    copyAuthUrl: translate("startup.action.copyAuthUrl"),
    copiedAuthUrl: translate("startup.state.copiedAuthUrl"),
    welcome: translate("startup.welcome.newUser"),
    welcomeBack: (name: string) => translate("startup.welcome.back", { name }),
    chooseLanguage: translate("startup.preference.chooseLanguage"),
    chooseTheme: translate("startup.preference.chooseTheme"),
    followSystem: translate("startup.preference.followSystem"),
    english: translate("startup.preference.english"),
    systemTheme: translate("startup.preference.systemTheme"),
    dark: translate("startup.preference.dark"),
    light: translate("startup.preference.light"),
    continue: translate("startup.action.continue"),
    configured: translate("startup.error.notConfigured"),
    authError: translate("startup.error.authFailed"),
    legalTitle: translate("startup.legal.title"),
    legalDescription: translate("startup.legal.description"),
    legalConsent: translate("startup.legal.consent")
  };
  const configuredErrorRef = useRef(language.configured);
  configuredErrorRef.current = language.configured;
  const startupCopy = {
    slogans: [
      translate("startup.slogan.primary"),
      translate("startup.slogan.possible"),
      translate("startup.slogan.agents"),
      translate("startup.slogan.anywhere")
    ],
    terms: translate("startup.hover.terms"),
    privacy: translate("startup.hover.privacy"),
    local: translate("startup.hover.local"),
    login: translate("startup.hover.login"),
    signup: translate("startup.hover.signup"),
    taglineHover: translate("startup.hover.tagline"),
    audioPlaying: translate("startup.hover.audioPlaying"),
    audioMuted: translate("startup.hover.audioMuted"),
    audioUnavailable: translate("startup.hover.audioUnavailable"),
    logo: translate("startup.hover.logo"),
    brand: translate("startup.hover.brand")
  };
  const [auth, setAuth] = useState<AuthSnapshot | null>(null);
  const [localIdentity, setLocalIdentity] = useState<AuthLocalIdentity | null>(null);
  const [authIntent, setAuthIntent] = useState<"login" | "signup" | "local">("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [isAuthUrlHovered, setIsAuthUrlHovered] = useState(false);
  const [isAuthUrlCopied, setIsAuthUrlCopied] = useState(false);
  const [isCancelHovered, setIsCancelHovered] = useState(false);
  const [startupCatalog, setStartupCatalog] = useState<readonly OfficialLanguagePackCatalogEntry[]>([]);
  const [installedLocales, setInstalledLocales] = useState<readonly string[]>([]);
  const [installingLocale, setInstallingLocale] = useState<string | null>(null);
  const [languagePackError, setLanguagePackError] = useState<string | null>(null);
  const [theme, setTheme] = useState<WorkbenchThemeId>(readStoredStartupTheme);
  const [legalChecked, setLegalChecked] = useState(false);
  const [legalResumeView, setLegalResumeView] = useState<
    "landing" | "welcome-signup" | "ready"
  >("landing");
  const [hoverIntent, setHoverIntent] = useState<StartupHoverIntent>("default");
  const [sloganIndex, setSloganIndex] = useState(0);
  const [isEasterEggActive, setIsEasterEggActive] = useState(false);
  const logoClickCountRef = useRef(0);
  const isFinishingRef = useRef(false);
  const [audioState, setAudioState] = useState<StartupAudioState>({
    isEnabled: true,
    manuallyToggled: false,
    autoplayFailed: false
  });

  useStartupTheme(theme, desktopApi);

  useLayoutEffect(() => {
    if (view !== "loading") {
      dismissLyraBootstrapScreen();
    }
  }, [view]);

  useEffect(() => {
    if (hoverIntent !== "default" || startupCopy.slogans.length < 2) {
      return;
    }
    const timer = window.setInterval(() => {
      setSloganIndex((current) => (current + 1) % startupCopy.slogans.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [hoverIntent, startupCopy.slogans.length]);

  useLayoutEffect(() => {
    const windowMaterialMode = desktopApi?.appMeta.windowMaterialMode ?? "opaque";
    document.documentElement.dataset.lyraWindowMaterial = windowMaterialMode;
    document.documentElement.dataset.lyraMaterialEnabled =
      windowMaterialMode === "native" ? "true" : "false";
  }, [desktopApi]);

  const finish = useCallback(async (isLocal = false): Promise<void> => {
    if (isFinishingRef.current) {
      return;
    }
    isFinishingRef.current = true;
    setAuthError(null);
    try {
      const selectedLocale = localeChoice.mode === "explicit"
        ? localeChoice.locale
        : resolvedLocale;
      persistStartupPreferences({
        locale: selectedLocale,
        localePreference: localeChoice,
        theme
      });
      if (auth?.user !== null && auth?.user !== undefined) {
        const updateProfile = desktopApi?.auth?.updateProfile;
        if (updateProfile === undefined) {
          throw new Error("The Lyra authentication bridge is unavailable.");
        }
        const profile = await updateProfile({
          ...(localIdentity === null ? {} : { displayName: localIdentity.displayName }),
          localePreference: localeChoice,
          themePreference: theme,
          onboardingCompleted: true,
          onboardingVersion: 1
        });
        if (profile.onboardingCompleted !== true) {
          throw new Error("Lyra could not finish saving your onboarding preferences.");
        }
        setAuth((current) => current === null ? current : { ...current, profile });
      }
      if (isLocal) {
        markLocalStartupComplete();
      }
      onReady();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
      setView("theme");
    } finally {
      isFinishingRef.current = false;
    }
  }, [auth?.user, desktopApi?.auth, localeChoice, localIdentity?.displayName, onReady, resolvedLocale, setView, theme]);

  const resolveLanguage = useCallback(async (): Promise<void> => {
    const api = desktopApi;
    if (api === null) {
      setResolvedLocale("en-US");
      setWorkbenchLocale("en-US");
      return;
    }
    setView("loading");
    let catalog: Awaited<ReturnType<typeof api.languagePacks.listCatalog>> = {
      packs: [],
      status: "unavailable"
    };
    try {
      catalog = await api.languagePacks.listCatalog();
    } catch {
      // English remains the startup fallback when the catalog is offline.
    }
    void api.languagePacks.checkForUpdates()
      .then((updated) => {
        setStartupCatalog(updated.packs);
      })
      .catch(() => undefined);
    setStartupCatalog(catalog.packs);
    let installed: readonly InstalledLanguagePack[] = [];
    try {
      installed = await api.languagePacks.listInstalled();
    } catch {
      installed = [];
    }
    setInstalledLocales(installed.map((pack) => pack.locale));
    const systemLocale = api.appMeta.locale ?? navigator.language;
    const result = await resolveStartupLocale({
      requestedLocale: resolveStartupRequestedLocale(systemLocale),
      installed,
      catalog,
      install: (locale) => api.languagePacks.install(locale)
    });
    setResolvedLocale(result.locale);
    if (result.downloadedLocale !== undefined) {
      const downloadedLocale = result.downloadedLocale;
      setInstalledLocales((current) => Array.from(new Set([...current, downloadedLocale])));
    }
    setStartupLocale(result.locale);
    setWorkbenchLocale(result.locale);
  }, [desktopApi]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await resolveLanguage();
      const [snapshot, identity] = await Promise.all([
        desktopApi?.auth?.getSession() ?? Promise.resolve({
          configured: false,
          user: null,
          profile: null
        }),
        desktopApi?.auth?.getLocalIdentity?.() ?? Promise.resolve({
          displayName: "Lyra",
          registered: false
        })
      ]);
      if (!active) return;
      setLocalIdentity(identity);
      setAuth(snapshot);
      if (snapshot.configured === false) {
        setAuthError(configuredErrorRef.current);
      }
      if (snapshot.user !== null && snapshot.profile?.onboardingCompleted !== true) {
        setAuthIntent("signup");
        if (snapshot.profile?.localePreference !== undefined) {
          setLocaleChoice(snapshot.profile.localePreference);
        }
        setTheme((snapshot.profile?.themePreference as WorkbenchThemeId | undefined) ?? "lyra-system");
        if (!hasAcceptedCurrentLegalDocuments()) {
          setLegalResumeView("welcome-signup");
          setView("legal");
          return;
        }
        setView("welcome-signup");
        return;
      }
      if (snapshot.user !== null || hasCompletedLocalStartup()) {
        if (!hasAcceptedCurrentLegalDocuments()) {
          setLegalResumeView("ready");
          setView("legal");
          return;
        }
        onReady();
        return;
      }
      if (!hasAcceptedCurrentLegalDocuments()) {
        setLegalResumeView("landing");
        setView("legal");
        return;
      }
      setView("landing");
    })().catch((error: unknown) => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : String(error));
      setView("landing");
    });
    return () => {
      active = false;
    };
  }, [desktopApi, onReady, resolveLanguage, setView]);

  useEffect(() => {
    const unsubscribe = desktopApi?.auth?.onChanged((snapshot) => {
      setAuth(snapshot);
      if (isFinishingRef.current) {
        return;
      }
      if (snapshot.user === null) {
        if (snapshot.error !== undefined) {
          setAuthError(snapshot.error);
        }
        return;
      }
      if (viewRef.current === "language" || viewRef.current === "theme") {
        return;
      }
      setAuthError(null);
      setView(snapshot.profile?.onboardingCompleted === true ? "welcome-login" : "welcome-signup");
      setTheme((snapshot.profile?.themePreference as WorkbenchThemeId | undefined) ?? "lyra-system");
    });
    return unsubscribe;
  }, [desktopApi]);

  const startLogin = async (intent: "login" | "signup"): Promise<void> => {
    setAuthIntent(intent);
    setAuthError(null);
    setAuthorizationUrl(null);
    setIsAuthUrlCopied(false);
    setView("authenticating");
    try {
      if (desktopApi?.auth === undefined) {
        throw new Error("The Lyra authentication bridge is unavailable.");
      }
      const result = await desktopApi.auth.startGoogleLogin();
      setAuthorizationUrl(result.authorizationUrl);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
      setView("landing");
    }
  };

  const cancelAuth = (): void => {
    setAuthorizationUrl(null);
    setIsAuthUrlHovered(false);
    setIsAuthUrlCopied(false);
    setIsCancelHovered(false);
    setAuthError(null);
    setView("landing");
  };

  const copyAuthorizationUrl = async (): Promise<void> => {
    if (authorizationUrl === null) {
      return;
    }
    if (await writeClipboardText(authorizationUrl)) {
      setIsAuthUrlCopied(true);
      window.setTimeout(() => setIsAuthUrlCopied(false), 1800);
    }
  };

  const localeChoices = useMemo<readonly LocaleChoice[]>(() => {
    const choices: LocaleChoice[] = [
      { id: "system", label: language.followSystem, preference: { mode: "system" } },
      { id: "en-US", label: language.english, preference: { mode: "explicit", locale: "en-US" } }
    ];
    const seen = new Set(choices.map((choice) => choice.id));
    for (const pack of startupCatalog) {
      if (seen.has(pack.locale)) {
        continue;
      }
      choices.push({
        id: pack.locale,
        label: pack.nativeName,
        preference: { mode: "explicit", locale: pack.locale }
      });
      seen.add(pack.locale);
    }
    for (const locale of installedLocales) {
      if (seen.has(locale)) {
        continue;
      }
      choices.push({
        id: locale,
        label: locale,
        preference: { mode: "explicit", locale }
      });
    }
    return choices;
  }, [installedLocales, language.english, language.followSystem, startupCatalog]);

  const selectLocaleChoice = useCallback(async (choice: LocaleChoice): Promise<void> => {
    const nextLocale = choice.preference.mode === "explicit"
      ? choice.preference.locale
      : resolvedLocale;
    const requiresDownload = nextLocale !== "en-US" && installedLocales.includes(nextLocale) === false;
    setLanguagePackError(null);
    if (requiresDownload) {
      const languagePacks = desktopApi?.languagePacks;
      if (languagePacks === undefined) {
        setLanguagePackError("Language packs are unavailable.");
        return;
      }
      setInstallingLocale(nextLocale);
      try {
        await languagePacks.install(nextLocale);
        setInstalledLocales((current) => Array.from(new Set([...current, nextLocale])));
      } catch (error) {
        setLanguagePackError(error instanceof Error ? error.message : String(error));
        return;
      } finally {
        setInstallingLocale(null);
      }
    }
    setLocaleChoice(choice.preference);
    setStartupLocale(nextLocale);
    setWorkbenchLocale(nextLocale);
  }, [desktopApi, installedLocales, resolvedLocale]);

  const openLegal = (url: string): void => {
    void desktopApi?.openExternal(url);
  };

  const acceptLegalDocuments = (): void => {
    if (!legalChecked) {
      return;
    }
    recordLegalAcceptance();
    setLegalChecked(false);
    if (legalResumeView === "ready") {
      onReady();
      return;
    }
    setView(legalResumeView);
  };

  const tagline = (() => {
    if (isEasterEggActive) {
      return isChinese(activeLocale) ? EASTER_EGG_COPY.zh : EASTER_EGG_COPY.en;
    }
    switch (hoverIntent) {
      case "terms":
        return startupCopy.terms;
      case "privacy":
        return startupCopy.privacy;
      case "local":
        return startupCopy.local;
      case "login":
        return localIdentity?.registered
          ? translate("startup.hover.loginKnown", {
              name: localIdentity.registeredDisplayName ?? localIdentity.displayName
            })
          : startupCopy.login;
      case "signup":
        return localIdentity?.registered
          ? translate("startup.hover.signupKnown", {
              name: localIdentity.registeredDisplayName ?? localIdentity.displayName
            })
          : startupCopy.signup;
      case "tagline":
        return startupCopy.taglineHover;
      case "audio":
        return audioState.isEnabled
          ? startupCopy.audioPlaying
          : audioState.manuallyToggled
            ? startupCopy.audioMuted
            : startupCopy.audioUnavailable;
      case "logo":
        return startupCopy.logo;
      case "brand":
        return startupCopy.brand;
      default:
        return startupCopy.slogans[sloganIndex] ?? startupCopy.slogans[0] ?? "";
    }
  })();

  const setHover = (intent: StartupHoverIntent): (() => void) => () => {
    if (isEasterEggActive) {
      return;
    }
    setHoverIntent(intent);
  };

  const handleLogoClick = (): void => {
    logoClickCountRef.current += 1;
    if (logoClickCountRef.current < 8) {
      return;
    }
    logoClickCountRef.current = 0;
    setIsEasterEggActive((active) => !active);
    setHoverIntent("default");
    setSloganIndex(0);
  };

  /*
   * The startup page is intentionally self-contained: the same audio control
   * survives the small auth screens while its state remains local to this gate.
   */
  const audioControlProps = {
    onHover: setHover("audio"),
    onLeave: setHover("default"),
    onStateChange: setAudioState
  };

  if (view === "loading") {
    return null;
  }

  if (view === "legal") {
    return (
      <StartupFrame {...audioControlProps}>
        <div className={`${STARTUP_PANEL_CLASS} ${STARTUP_LEGAL_CONSENT_CLASS}`}>
          <StartupPreferenceTitle text={language.legalTitle} />
          <p className={STARTUP_LEGAL_DESCRIPTION_CLASS}>{language.legalDescription}</p>
          <div className={`${STARTUP_LEGAL_CLASS} ${STARTUP_LEGAL_LINKS_CLASS}`}>
            <button type="button" className={STARTUP_LEGAL_BUTTON_CLASS} onClick={() => openLegal(TERMS_URL)}>
              {language.terms} ↗
            </button>
            <button type="button" className={STARTUP_LEGAL_BUTTON_CLASS} onClick={() => openLegal(PRIVACY_URL)}>
              {language.privacy} ↗
            </button>
          </div>
          <label className={STARTUP_LEGAL_CHECK_CLASS}>
            <input
              type="checkbox"
              checked={legalChecked}
              onChange={(event) => setLegalChecked(event.currentTarget.checked)}
            />
            <span>{language.legalConsent}</span>
          </label>
          <AppButton
            variant="default"
            size="lg"
            disabled={!legalChecked}
            onClick={acceptLegalDocuments}
          >
            {language.continue}
          </AppButton>
        </div>
      </StartupFrame>
    );
  }

  if (view === "authenticating") {
    return (
      <StartupFrame {...audioControlProps}>
        <div className={STARTUP_STATUS_CLASS}>
          <button
            type="button"
            className={STARTUP_AUTH_COPY_CLASS}
            onClick={() => void copyAuthorizationUrl()}
            onMouseEnter={() => setIsAuthUrlHovered(true)}
            onMouseLeave={() => setIsAuthUrlHovered(false)}
            disabled={authorizationUrl === null}
          >
            <AppShimmer
              key={isCancelHovered ? "cancel" : isAuthUrlCopied ? "copied" : isAuthUrlHovered ? "copy" : "browser"}
              text={isCancelHovered
                ? language.cancelHover
                : isAuthUrlCopied
                  ? language.copiedAuthUrl
                  : isAuthUrlHovered
                    ? language.copyAuthUrl
                    : language.browser}
            />
          </button>
          {authError ? <p className={STARTUP_ERROR_CLASS}>{authError}</p> : null}
          <button
            type="button"
            className={`${STARTUP_LOCAL_CLASS} ${STARTUP_CANCEL_CLASS}`}
            onClick={cancelAuth}
            onMouseEnter={() => setIsCancelHovered(true)}
            onMouseLeave={() => setIsCancelHovered(false)}
          >
            {language.cancel}
          </button>
        </div>
      </StartupFrame>
    );
  }

  if (view === "welcome-signup" || view === "welcome-login") {
    const user = auth?.user;
    if (user === null || user === undefined) {
      return <StartupFrame {...audioControlProps}><div className={STARTUP_STATUS_CLASS}><p>{language.authError}</p></div></StartupFrame>;
    }
    return (
      <StartupFrame {...audioControlProps}>
        <div className={STARTUP_WELCOME_CLASS}>
          <Avatar user={user} />
          <h1>{view === "welcome-signup" ? language.welcome : language.welcomeBack(userName(user))}</h1>
          <p>{user.email ?? "Google account"}</p>
          {view === "welcome-signup" ? (
            <AppButton variant="default" size="lg" onClick={() => setView("language")}>{language.continue}</AppButton>
          ) : (
            <AppButton variant="default" size="lg" onClick={() => setView("theme")}>{language.continue}</AppButton>
          )}
        </div>
      </StartupFrame>
    );
  }

  if (view === "language") {
    return (
      <StartupFrame {...audioControlProps}>
        <div className={STARTUP_PANEL_CLASS}>
          <button className={STARTUP_BACK_CLASS} type="button" onClick={() => setView(authIntent === "local" ? "landing" : "welcome-signup")}>
            <span aria-hidden="true">←</span> {language.back}
          </button>
          <StartupPreferenceTitle text={language.chooseLanguage} />
          <div className={STARTUP_CHOICE_LIST_CLASS}>
            {localeChoices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={`${STARTUP_CHOICE_CLASS}${JSON.stringify(localeChoice) === JSON.stringify(choice.preference) ? " is-selected" : ""}`}
                disabled={installingLocale !== null}
                onClick={() => void selectLocaleChoice(choice)}
              >
                <span>{installingLocale === choice.id ? language.downloading : choice.label}</span>
                {JSON.stringify(localeChoice) === JSON.stringify(choice.preference) ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
          </div>
          <AppButton variant="default" size="lg" disabled={installingLocale !== null} onClick={() => setView("theme")}>{language.continue}</AppButton>
          {languagePackError ? <p className={STARTUP_ERROR_CLASS}>{languagePackError}</p> : null}
        </div>
      </StartupFrame>
    );
  }

  if (view === "theme") {
    return (
      <StartupFrame {...audioControlProps}>
        <div className={STARTUP_PANEL_CLASS}>
          <button className={STARTUP_BACK_CLASS} type="button" onClick={() => setView(authIntent === "login" ? "welcome-login" : "language")}>
            <span aria-hidden="true">←</span> {language.back}
          </button>
          <StartupPreferenceTitle text={language.chooseTheme} />
          <div className={STARTUP_THEME_GRID_CLASS}>
            {(["lyra-system", "lyra-dark", "lyra-light"] as const).map((id) => (
              <ThemePreview
                key={id}
                theme={id}
                label={id === "lyra-system" ? language.systemTheme : id === "lyra-dark" ? language.dark : language.light}
                selected={theme === id}
                onSelect={() => setTheme(id)}
              />
            ))}
          </div>
          <AppButton variant="default" size="lg" onClick={() => void finish(authIntent === "local")}>{language.continue}</AppButton>
          {authError ? <p className={STARTUP_ERROR_CLASS}>{authError}</p> : null}
        </div>
      </StartupFrame>
    );
  }

  return (
    <StartupFrame {...audioControlProps}>
      <div className={STARTUP_HERO_CLASS}>
        <div
          className={STARTUP_LOGO_WRAP_CLASS}
          onMouseEnter={setHover("logo")}
          onMouseLeave={setHover("default")}
          onClick={handleLogoClick}
        >
          <AnimatedAsciiLogo />
        </div>
        <h1
          className={STARTUP_BRAND_CLASS}
          onMouseEnter={setHover("brand")}
          onMouseLeave={setHover("default")}
        >
          LYRA
        </h1>
        <StartupTagline
          text={tagline}
          onHover={setHover("tagline")}
          onLeave={setHover("default")}
        />
        <div className={STARTUP_ACTIONS_CLASS}>
          <AppButton
            variant="default"
            size="lg"
            className={STARTUP_LOGIN_BUTTON_CLASS}
            onClick={() => void startLogin("login")}
            onMouseEnter={setHover("login")}
            onMouseLeave={setHover("default")}
          >
            {localIdentity?.registered ? (
              <span className={STARTUP_LOGIN_AVATAR_CLASS} aria-hidden="true">
                <LocalIdentityAvatar identity={localIdentity} />
              </span>
            ) : null}
            {language.login}
          </AppButton>
          <AppButton
            variant="secondary"
            size="lg"
            onClick={() => void startLogin("signup")}
            onMouseEnter={setHover("signup")}
            onMouseLeave={setHover("default")}
          >
            {language.signup}
          </AppButton>
        </div>
        <button
          className={STARTUP_LOCAL_CLASS}
          type="button"
          onClick={() => {
            setAuthIntent("local");
            setView("language");
          }}
          onMouseEnter={setHover("local")}
          onMouseLeave={setHover("default")}
        >
          {language.local}
        </button>
        <div className={STARTUP_LEGAL_CLASS}>
          <button
            type="button"
            onClick={() => openLegal(TERMS_URL)}
            onMouseEnter={setHover("terms")}
            onMouseLeave={setHover("default")}
          >
            {language.terms} ↗
          </button>
          <button
            type="button"
            onClick={() => openLegal(PRIVACY_URL)}
            onMouseEnter={setHover("privacy")}
            onMouseLeave={setHover("default")}
          >
            {language.privacy} ↗
          </button>
        </div>
        {authError ? <p className={STARTUP_ERROR_CLASS}>{authError || (auth?.configured === false ? language.configured : language.authError)}</p> : null}
      </div>
    </StartupFrame>
  );
};
