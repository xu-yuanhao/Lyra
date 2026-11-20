import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";

import { enUS } from "./src/l10n/en-US.ts";
import { CredentialsEmbeddedChrome } from "./src/surface.tsx";
import type { CredentialSession, CredentialsSection, StoredCredential } from "./src/types.ts";

const session: CredentialSession = {
  id: "session-1",
  origin: "https://example.com",
  hostname: "example.com",
  authMethod: { kind: "password", label: "Password", source: "observed" },
  authMethodSource: "observed",
  lastSeenAt: "2026-07-31T00:00:00.000Z"
};

const credential: StoredCredential = {
  id: "credential-1",
  origin: "https://example.com",
  hostname: "example.com",
  username: "pete@example.com",
  authMethod: { kind: "password", label: "Password", source: "observed" },
  passwordAvailable: true,
  updatedAt: "2026-07-31T00:00:00.000Z"
};

const walk = (node: ReactNode, visit: (element: ReactElement) => void): void => {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!isValidElement(node)) return;
  visit(node);
  // Local components pass rendered rows through named props (`actions`,
  // `icon`), so descend every prop that holds React nodes, not just children.
  for (const value of Object.values(node.props as Record<string, unknown>)) {
    if (Array.isArray(value) || isValidElement(value)) {
      walk(value as ReactNode, visit);
    }
  }
};

const inspect = (
  section: CredentialsSection
): { readonly classes: string; readonly text: string; readonly labels: string } => {
  const tree = CredentialsEmbeddedChrome({
    labels: enUS,
    locale: "en-US",
    section,
    sessions: [session],
    reviewSessions: [session],
    credentials: [credential],
    query: "",
    error: null,
    busyKey: null,
    onQueryChange: () => undefined,
    onOpenSite: () => undefined,
    onLogoutSite: () => undefined,
    onFillCredential: () => undefined,
    onCopyCredential: () => undefined,
    onDeleteCredential: () => undefined
  });
  const classes: string[] = [];
  const text: string[] = [];
  const labels: string[] = [];
  walk(tree, (element) => {
    const props = element.props as {
      className?: string;
      placeholder?: string;
      label?: string;
      "aria-label"?: string;
      children?: ReactNode;
    };
    if (typeof props.className === "string") classes.push(props.className);
    if (typeof props.placeholder === "string") text.push(props.placeholder);
    if (typeof props.label === "string") labels.push(props.label);
    if (typeof props.title === "string") text.push(props.title);
    if (typeof props["aria-label"] === "string") labels.push(props["aria-label"]);
    if (typeof props.children === "string") text.push(props.children);
  });
  return {
    classes: classes.join(" "),
    text: text.join(" "),
    labels: labels.join("|")
  };
};

test("embedded chrome keeps the Core Logins class tree and copy", () => {
  const { classes, text } = inspect("sessions");
  assert.match(classes, /lyra-login-manager lyra-login-manager-embedded/u);
  assert.match(classes, /lyra-login-manager-embedded-list/u);
  assert.match(classes, /lyra-app-search-field lyra-login-manager-search/u);
  assert.match(text, /Search sites, accounts, methods, or notes/u);
  assert.match(text, /example\.com/u);
  assert.equal(classes.includes("lyra-login-manager-collapse-head"), false);
  assert.equal(text.includes("Reveal"), false);
  assert.equal(text.includes("Saved credentials"), false);
});

test("each section renders only its own list", () => {
  const sessions = inspect("sessions");
  assert.match(sessions.labels, /Sessions/u);
  assert.equal(sessions.labels.includes("Passwords"), false);
  assert.equal(sessions.labels.includes("Log out site"), true);
  assert.equal(sessions.labels.includes("Fill"), false);

  const review = inspect("review");
  assert.match(review.labels, /Review/u);
  assert.equal(review.labels.includes("Sessions"), false);

  const passwords = inspect("credentials");
  assert.match(passwords.labels, /Passwords/u);
  assert.match(passwords.labels, /Fill/u);
  assert.equal(passwords.labels.includes("Log out site"), false);
});

test("an empty section renders the shared empty state", () => {
  const tree = CredentialsEmbeddedChrome({
    labels: enUS,
    locale: "en-US",
    section: "credentials",
    sessions: [],
    reviewSessions: [],
    credentials: [],
    query: "",
    error: null,
    busyKey: null,
    onQueryChange: () => undefined,
    onOpenSite: () => undefined,
    onLogoutSite: () => undefined,
    onFillCredential: () => undefined,
    onCopyCredential: () => undefined,
    onDeleteCredential: () => undefined
  });
  const classes: string[] = [];
  const text: string[] = [];
  const stateTitles: string[] = [];
  walk(tree, (element) => {
    const props = element.props as { className?: string; children?: ReactNode; title?: ReactNode };
    if (typeof props.className === "string") classes.push(props.className);
    if (typeof props.children === "string") text.push(props.children);
    if (typeof props.title === "string") stateTitles.push(props.title);
  });
  assert.match(classes.join(" "), /lyra-login-manager-section/u);
  assert.deepEqual(stateTitles, ["No saved passwords"]);
  assert.equal(text.includes("Fill"), false);
});
