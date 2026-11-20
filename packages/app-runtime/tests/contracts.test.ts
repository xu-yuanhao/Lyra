import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalChannelCatalogPayloadV1,
  canonicalJson,
  canonicalReleaseKeyringPayloadV1,
  canonicalReleaseBomComponentV1,
  canonicalReleaseBomV1,
  validateComponentManifestV1,
  validateLyraAppModule,
  validateLyraNestedAppCreateRequestV1,
  validateWorkbenchChromeContributionV1,
  validateWorkbenchChromeScopeV1,
  validateWorkbenchChromeSlotV1,
  validateReleaseBomV1,
  workbenchChromeScopeKey,
  validateSignedChannelCatalogV1,
  validateSignedReleaseKeyringV1,
  validateWorkspaceTabV2,
  type ComponentManifestV1,
  type ReleaseBomComponentV1,
  type ReleaseBomV1,
  type SignedChannelCatalogV1
} from "../src/index.ts";

const HASH = "a".repeat(64);
const SIGNATURE = "A".repeat(86) + "==";
const PUBLIC_KEY = "A".repeat(43) + "=";
const TARGET = "darwin-arm64" as const;

const component = (
  componentId: string,
  kind: ReleaseBomComponentV1["kind"],
  activation: ReleaseBomComponentV1["activation"]
): ReleaseBomComponentV1 => ({
  componentId,
  kind,
  version: "1.0.0",
  target: TARGET,
  url: `https://github.com/petehsu/lyra-releases/releases/download/v1/${componentId}.zip`,
  size: 128,
  sha256: HASH,
  signature: SIGNATURE,
  keyId: "release-1",
  entry: `components/${componentId}.js`,
  ...(kind === "app" ? { executionClass: "first-party-shared-renderer" as const } : {}),
  activation,
  delivery: componentId === "lyra.browser" ? "on-demand" : "required"
});

const components = [
  component("lyra.core", "core", "core-restart"),
  component("lyra.runtime", "runtime", "runtime-idle"),
  component("lyra.browser", "app", "module-idle")
] as const;

const bom: ReleaseBomV1 = {
  schemaVersion: 1,
  releaseVersion: "1.0.0-preview.1",
  channel: "preview",
  target: TARGET,
  coreVersion: "1.0.0",
  hostApiVersion: "1.0.0",
  components
};

const catalog: SignedChannelCatalogV1 = {
  schemaVersion: 1,
  keyring: {
    schemaVersion: 1,
    payload: {
      sequence: 3,
      generatedAt: "2026-07-29T00:00:00.000Z",
      expiresAt: "2026-09-30T00:00:00.000Z",
      keys: [{
        keyId: "release-1",
        publicKey: PUBLIC_KEY,
        publisher: "Lyra",
        channels: ["preview"],
        componentKinds: ["core", "runtime", "app", "resource", "extension"],
        componentIdPrefixes: ["lyra."],
        executionClasses: [
          "first-party-shared-renderer",
          "sandboxed-web",
          "sandboxed-web-wasi"
        ],
        validFrom: "2026-07-29T00:00:00.000Z",
        validUntil: "2026-09-30T00:00:00.000Z"
      }],
      revokedKeyIds: []
    },
    signature: { algorithm: "ed25519", keyId: "root-1", value: SIGNATURE }
  },
  payload: {
    sequence: 7,
    channel: "preview",
    generatedAt: "2026-07-30T00:00:00.000Z",
    expiresAt: "2026-08-30T00:00:00.000Z",
    minimumSafeCoreVersion: "1.0.0",
    revocations: [],
    releases: [{
      version: bom.releaseVersion,
      bomUrl: "https://github.com/petehsu/lyra-releases/releases/download/v1/bom.json",
      bomSha256: HASH,
      bomSignature: SIGNATURE,
      keyId: "release-1"
    }]
  },
  signature: { algorithm: "ed25519", keyId: "release-1", value: SIGNATURE }
};

test("validates component manifests and blocks unsafe package paths", () => {
  const manifest: ComponentManifestV1 = {
    schemaVersion: 1,
    componentId: "lyra.browser",
    kind: "app",
    version: "1.0.0",
    target: TARGET,
    entry: "apps/browser.js",
    executionClass: "first-party-shared-renderer",
    activation: "module-idle",
    hostApiRange: { minInclusive: "1.0.0", maxExclusive: "2.0.0" },
    dataSchema: { readerMin: 1, readerMax: 1, writer: 1 },
    permissions: ["browser:navigate"],
    publisher: "Lyra",
    files: [{ path: "apps/browser.js", size: 42, sha256: HASH }],
    keyId: "release-1",
    signature: SIGNATURE
  };

  assert.equal(validateComponentManifestV1(manifest), true);
  assert.equal(validateComponentManifestV1({
    ...manifest,
    entry: "../escape.js",
    files: [{ path: "../escape.js", size: 42, sha256: HASH }]
  }), false);
  assert.equal(validateComponentManifestV1({
    ...manifest,
    permissions: ["files:read", "files:read"]
  }), false);
});

test("validates the release BOM and signed catalog wire shapes", () => {
  assert.equal(validateReleaseBomV1(bom), true);
  assert.equal(validateSignedReleaseKeyringV1(catalog.keyring), true);
  assert.equal(validateSignedChannelCatalogV1(catalog), true);
  assert.equal(validateReleaseBomV1({
    ...bom,
    coreVersion: "2.0.0"
  }), false);
  assert.equal(validateSignedChannelCatalogV1({
    ...catalog,
    payload: { ...catalog.payload, expiresAt: catalog.payload.generatedAt }
  }), false);
  const { executionClasses: _legacyMissingScope, ...legacyReleaseKey } =
    catalog.keyring.payload.keys[0]!;
  assert.equal(validateSignedReleaseKeyringV1({
    ...catalog.keyring,
    payload: {
      ...catalog.keyring.payload,
      keys: [legacyReleaseKey]
    }
  }), false);
  const { componentKinds: _legacyMissingKinds, ...missingKinds } =
    catalog.keyring.payload.keys[0]!;
  assert.equal(validateSignedReleaseKeyringV1({
    ...catalog.keyring,
    payload: {
      ...catalog.keyring.payload,
      keys: [missingKinds]
    }
  }), false);
  const { componentIdPrefixes: _legacyMissingPrefixes, ...missingPrefixes } =
    catalog.keyring.payload.keys[0]!;
  assert.equal(validateSignedReleaseKeyringV1({
    ...catalog.keyring,
    payload: {
      ...catalog.keyring.payload,
      keys: [missingPrefixes]
    }
  }), false);
});

test("canonicalizes each signature boundary deterministically", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.equal(canonicalChannelCatalogPayloadV1(catalog), canonicalJson(catalog.payload));
  assert.equal(canonicalReleaseKeyringPayloadV1(catalog.keyring), canonicalJson(catalog.keyring.payload));
  assert.equal(canonicalReleaseBomV1(bom), canonicalJson(bom));

  const signed = components[2];
  assert.ok(signed);
  const canonicalComponent = canonicalReleaseBomComponentV1(signed);
  assert.equal(canonicalComponent.includes("signature"), false);
  assert.equal(canonicalComponent.includes("keyId"), true);
  assert.notEqual(
    canonicalComponent,
    canonicalReleaseBomComponentV1({ ...signed, keyId: "rotated-release-key" })
  );
  assert.throws(() => canonicalJson({ invalid: undefined }), TypeError);
});

test("preserves opaque workspace state and rejects non-JSON values", () => {
  const tab = {
    schemaVersion: 2,
    appId: "third-party.notes",
    appVersion: "1.2.3",
    instanceId: "tab-1",
    route: "/note/42",
    opaqueState: { selection: [1, 2], futureField: { kept: true } }
  };
  assert.equal(validateWorkspaceTabV2(tab), true);
  assert.equal(validateWorkspaceTabV2({ ...tab, opaqueState: { invalid: undefined } }), false);
});

test("validates version-pinned nested application create requests", () => {
  assert.equal(validateLyraNestedAppCreateRequestV1({
    appId: "lyra.editor",
    appVersion: "1.2.3",
    instanceId: "parent-1:editor",
    route: "/document"
  }), true);
  assert.equal(validateLyraNestedAppCreateRequestV1({
    appId: "lyra.editor",
    instanceId: "parent-1:editor",
    route: "/document"
  }), true);
  assert.equal(validateLyraNestedAppCreateRequestV1({
    appId: "lyra.editor",
    appVersion: "latest",
    instanceId: "parent-1:editor",
    route: "/document"
  }), false);
  assert.equal(validateLyraNestedAppCreateRequestV1({
    appId: "lyra.editor",
    instanceId: "",
    route: "/document"
  }), false);
});

test("validates the complete app lifecycle and contribution IDs", () => {
  const module = {
    id: "lyra.browser",
    version: "1.0.0",
    contributions: {
      commands: [{ id: "browser.open", title: "Open" }],
      capabilities: [{ id: "browser.navigate", version: "1.0.0", title: "Navigate" }]
    },
    activate() {},
    create: ({ instanceId }: { instanceId: string }) => ({ instanceId }),
    restore: ({ instanceId }: { instanceId: string }) => ({ instanceId }),
    snapshot: () => null,
    mount() {},
    unmount() {},
    deactivate() {},
    close() {}
  };

  assert.equal(validateLyraAppModule(module), true);
  assert.equal(validateLyraAppModule({ ...module, unmount: undefined }), false);
  assert.equal(validateLyraAppModule({ ...module, close: undefined }), false);
});

test("validates workbench chrome scopes, slots, and contributions", () => {
  assert.equal(
    validateWorkbenchChromeScopeV1({ kind: "workspaceTab", tabId: "tab-1" }),
    true
  );
  assert.equal(
    validateWorkbenchChromeScopeV1({ kind: "aiSession", sessionId: "sess-1" }),
    true
  );
  assert.equal(validateWorkbenchChromeScopeV1({ kind: "global", id: "workbench" }), true);
  assert.equal(validateWorkbenchChromeScopeV1({ kind: "global", id: "other" }), false);
  assert.equal(workbenchChromeScopeKey({ kind: "workspaceTab", tabId: "a" }), "workspaceTab:a");

  assert.equal(validateWorkbenchChromeSlotV1("toolbarContext"), true);
  assert.equal(validateWorkbenchChromeSlotV1("navigation"), true);
  assert.equal(validateWorkbenchChromeSlotV1("composerMeta"), true);
  assert.equal(validateWorkbenchChromeSlotV1("other"), false);

  assert.equal(
    validateWorkbenchChromeContributionV1({
      ariaLabel: "Notifications",
      actions: [{
        id: "mark-all",
        label: "Mark all as read",
        commandId: "lyra.notifications.mark-all-read",
        order: 0,
        iconKey: "check-check",
        tone: "default"
      }],
      chips: [{ id: "count", text: "1 / Unread 1", order: 1 }]
    }),
    true
  );
  assert.equal(
    validateWorkbenchChromeContributionV1({
      navigation: { mode: "hidden" }
    }),
    true
  );
  assert.equal(
    validateWorkbenchChromeContributionV1({
      actions: [{
        id: "show-passwords",
        label: "Passwords",
        commandId: "lyra.credentials.show-passwords",
        order: 2,
        display: "text",
        active: true
      }]
    }),
    true
  );
  assert.equal(
    validateWorkbenchChromeContributionV1({
      actions: [{
        id: "show-passwords",
        label: "Passwords",
        commandId: "lyra.credentials.show-passwords",
        order: 2,
        display: "tabs"
      }]
    }),
    false
  );
  assert.equal(
    validateWorkbenchChromeContributionV1({
      actions: [{
        id: "show-passwords",
        label: "Passwords",
        commandId: "lyra.credentials.show-passwords",
        order: 2,
        active: "yes"
      }]
    }),
    false
  );
  assert.equal(
    validateWorkbenchChromeContributionV1({
      metaItems: [
        { kind: "builtin", id: "projectDir", order: 0 },
        {
          kind: "button",
          id: "extra",
          label: "Extra",
          commandId: "lyra.test.extra",
          order: 10
        }
      ]
    }),
    true
  );

  const moduleWithChrome = {
    id: "lyra.notifications",
    version: "1.0.0",
    contributions: {
      commands: [{ id: "lyra.notifications.refresh", title: "Refresh" }],
      chrome: {
        slots: [{
          slot: "toolbarContext",
          contribution: { ariaLabel: "Notifications" }
        }]
      }
    },
    activate() {},
    create: ({ instanceId }: { instanceId: string }) => ({ instanceId }),
    restore: ({ instanceId }: { instanceId: string }) => ({ instanceId }),
    snapshot: () => null,
    mount() {},
    unmount() {},
    deactivate() {},
    close() {}
  };
  assert.equal(validateLyraAppModule(moduleWithChrome), true);
});
