import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA_PRACTICES,
  LEGAL_DOCUMENTS,
  LEGAL_HISTORY,
  LEGAL_LOCALES,
  LEGAL_META,
  LEGAL_RELEASE_GATES,
  PROVIDER_RECORDS,
  STATUS_LABEL,
  type LegalBlock,
  type LocalizedText
} from "../lib/legal/index";
import { OPERATOR_PERSONAL_EMAIL } from "../lib/contact";
import {
  combinedNoticeText,
  groupThirdPartyNotices,
  httpSourceUrl,
  type ThirdPartyNotices
} from "../lib/legal/notices";

const siteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const repositoryRoot = path.resolve(siteRoot, "../..");
const releaseMode = process.argv.includes("--release");
const errors: string[] = [];

const desktopLegalAcceptanceSource = readFileSync(
  path.join(
    repositoryRoot,
    "apps/desktop/src/renderer/startup/startup-legal.ts"
  ),
  "utf8"
);

const check = (condition: unknown, message: string) => {
  if (!condition) errors.push(message);
};

check(
  desktopLegalAcceptanceSource.includes(
    `LEGAL_DOCUMENT_VERSION = ${JSON.stringify(LEGAL_META.version)}`
  ),
  "Desktop click-through version does not match the legal document version"
);

const checkLocalized = (value: LocalizedText, label: string) => {
  for (const locale of LEGAL_LOCALES) {
    check(
      typeof value[locale] === "string" &&
        value[locale].trim().length > 0,
      `${label} is missing ${locale}`
    );
  }
};

const checkBlock = (block: LegalBlock, label: string) => {
  if (block.kind === "list") {
    check(block.items.length > 0, `${label} has an empty list`);
    block.items.forEach((item, index) =>
      checkLocalized(item, `${label}.items[${index}]`)
    );
    return;
  }
  checkLocalized(block.text, `${label}.${block.kind}`);
};

type PublicationMetadataShape = {
  readonly status: string;
  readonly version: string;
  readonly effectiveDate: string | null;
};

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const semanticVersionParts = (
  value: string
): { readonly prerelease: readonly string[] } | null => {
  const match = SEMANTIC_VERSION_PATTERN.exec(value);
  if (match === null) return null;
  const prerelease = match[4]?.split(".") ?? [];
  if (
    prerelease.some(
      (identifier) =>
        /^\d+$/.test(identifier) &&
        identifier.length > 1 &&
        identifier.startsWith("0")
    )
  ) {
    return null;
  }
  return { prerelease };
};

const isRealCalendarDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const lastDayOfMonth = new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();
  return day <= lastDayOfMonth;
};

const isReasonableReleaseEmail = (
  value: string
): boolean => {
  const candidate = value.trim();
  if (
    candidate !== value ||
    candidate.length < 6 ||
    candidate.length > 254
  ) {
    return false;
  }
  const separator = candidate.lastIndexOf("@");
  if (separator <= 0 || separator !== candidate.indexOf("@")) {
    return false;
  }
  const local = candidate.slice(0, separator);
  const domain = candidate.slice(separator + 1).toLowerCase();
  if (
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
  ) {
    return false;
  }
  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length < 1 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  ) {
    return false;
  }
  return !new Set([
    "example.com",
    "example.net",
    "example.org",
    "invalid",
    "localhost"
  ]).has(domain);
};

const isReasonableServiceAddress = (
  value: string
): boolean => {
  const candidate = value.trim();
  if (
    candidate !== value ||
    candidate.length < 20 ||
    candidate.length > 500 ||
    /https?:\/\/|@/iu.test(candidate) ||
    /\b(?:tbd|todo|pending|placeholder|unknown|not set|to be confirmed)\b|待定|待填写|未填写|待确认|占位/iu.test(
      candidate
    )
  ) {
    return false;
  }
  const meaningfulCharacters =
    candidate.match(/[\p{L}\p{N}]/gu) ?? [];
  return (
    meaningfulCharacters.length >= 12 &&
    new Set(
      meaningfulCharacters.map((character) =>
        character.toLocaleLowerCase()
      )
    ).size >= 5
  );
};

type ProviderReviewShape = {
  readonly id: string;
  readonly provider: string;
  readonly reviewStatus: string;
};

const pendingProviderReleaseBlockers = (
  status: string,
  providers: readonly ProviderReviewShape[]
): string[] =>
  status === "effective"
    ? providers
        .filter((provider) => provider.reviewStatus === "pending")
        .map(
          (provider) =>
            `provider-review-${provider.id}: ${provider.provider} review is pending`
        )
    : [];

const publicationMetadataErrors = (
  metadata: PublicationMetadataShape
): string[] => {
  const shapeErrors: string[] = [];
  if (
    metadata.status !== "pending" &&
    metadata.status !== "effective"
  ) {
    shapeErrors.push("Legal status must be pending or effective");
    return shapeErrors;
  }
  const semanticVersion = semanticVersionParts(metadata.version);
  if (semanticVersion === null) {
    shapeErrors.push(
      "Legal version must use valid Semantic Versioning"
    );
  }
  if (metadata.status === "pending") {
    if (metadata.effectiveDate !== null) {
      shapeErrors.push(
        "Pending legal content must not have an effective date"
      );
    }
    if (!metadata.version.endsWith("-draft")) {
      shapeErrors.push("Pending legal version must end in -draft");
    }
    return shapeErrors;
  }
  if (
    metadata.effectiveDate === null ||
    !isRealCalendarDate(metadata.effectiveDate)
  ) {
    shapeErrors.push(
      "Effective legal content must have a real YYYY-MM-DD effective date"
    );
  }
  if (metadata.version.toLowerCase().includes("-draft")) {
    shapeErrors.push(
      "Effective legal version must not be marked draft"
    );
  }
  return shapeErrors;
};

const requiredSectionIds = {
  terms: [
    "draft-status-and-acceptance",
    "operator-and-eligibility",
    "beta-and-market-scope",
    "software-license",
    "accounts-credentials-and-backups",
    "user-content-and-ai-output",
    "agents-and-automation",
    "third-party-services-and-extensions",
    "acceptable-use",
    "updates-availability-and-changes",
    "suspension-and-termination",
    "disclaimers",
    "limitation-of-liability",
    "governing-law-and-disputes",
    "agreement-changes-and-contact"
  ],
  privacy: [
    "draft-status-controller-and-scope",
    "local-first-not-entirely-local",
    "data-inventory",
    "agent-model-boundary",
    "persona-and-local-identity-signals",
    "browser-profiles-and-credentials",
    "search-web-and-location",
    "accounts-and-authentication",
    "extensions-and-integrations",
    "first-party-analytics",
    "retention-and-deletion",
    "rights-and-choices",
    "security",
    "international-processing",
    "age",
    "policy-changes-and-contact"
  ]
} as const;

for (const document of LEGAL_DOCUMENTS) {
  checkLocalized(document.title, `${document.id}.title`);
  checkLocalized(document.description, `${document.id}.description`);
  const ids = document.sections.map((section) => section.id);
  check(
    new Set(ids).size === ids.length,
    `${document.id} contains duplicate section IDs`
  );
  for (const requiredId of requiredSectionIds[document.id]) {
    check(
      ids.includes(requiredId),
      `${document.id} is missing required section ${requiredId}`
    );
  }
  document.sections.forEach((section, sectionIndex) => {
    check(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.id),
      `${document.id}.sections[${sectionIndex}] has an invalid ID`
    );
    checkLocalized(
      section.heading,
      `${document.id}.sections.${section.id}.heading`
    );
    check(
      section.blocks.length > 0,
      `${document.id}.sections.${section.id} has no content`
    );
    section.blocks.forEach((block, blockIndex) =>
      checkBlock(
        block,
        `${document.id}.sections.${section.id}.blocks[${blockIndex}]`
      )
    );
  });
}

const requiredPracticeIds = [
  "website-cloudflare-infrastructure",
  "local-workspace-data",
  "browser-data",
  "files-terminal-downloads",
  "logs-and-extension-data",
  "persona-signals",
  "model-requests",
  "account-data",
  "credentials",
  "search-data",
  "location",
  "mcp-and-skills",
  "uiux",
  "updates-and-language-packs"
];
const practiceIds = DATA_PRACTICES.map((practice) => practice.id);
check(
  new Set(practiceIds).size === practiceIds.length,
  "Data-practice IDs are not unique"
);
for (const id of requiredPracticeIds) {
  check(practiceIds.includes(id), `Missing data practice ${id}`);
}
for (const practice of DATA_PRACTICES) {
  checkLocalized(practice.category, `practice.${practice.id}.category`);
  checkLocalized(
    practice.fieldsAndSource,
    `practice.${practice.id}.fieldsAndSource`
  );
  checkLocalized(practice.purpose, `practice.${practice.id}.purpose`);
  checkLocalized(
    practice.legalBasis,
    `practice.${practice.id}.legalBasis`
  );
  checkLocalized(
    practice.recipientAndRegion,
    `practice.${practice.id}.recipientAndRegion`
  );
  checkLocalized(practice.retention, `practice.${practice.id}.retention`);
  checkLocalized(practice.deletion, `practice.${practice.id}.deletion`);
}

const requiredProviderIds = [
  "cloudflare",
  "supabase",
  "google-oauth",
  "openai",
  "anthropic",
  "aws-bedrock",
  "google-gemini",
  "openrouter",
  "deepseek",
  "zhipu-glm",
  "moonshot",
  "volcengine-ark",
  "nvidia-nim",
  "amd-radeon-cloud",
  "b-ai",
  "atria-asi",
  "intern-token-plan",
  "poolside",
  "xiaomi-mimo",
  "ollama-cloud",
  "xai",
  "mistral",
  "groq",
  "cerebras",
  "cohere",
  "together-ai",
  "perplexity",
  "alibaba",
  "deepinfra",
  "venice",
  "custom-ai-endpoints",
  "local-ai-runtimes",
  "google-suggest",
  "wikipedia",
  "web-search-and-sites",
  "nominatim",
  "mcp-servers",
  "skills-sources",
  "github-updates",
  "language-packs"
];
const providerIds = PROVIDER_RECORDS.map((provider) => provider.id);
check(
  new Set(providerIds).size === providerIds.length,
  "Provider IDs are not unique"
);
for (const id of requiredProviderIds) {
  check(providerIds.includes(id), `Missing provider record ${id}`);
}
for (const provider of PROVIDER_RECORDS) {
  check(provider.provider.trim().length > 0, `${provider.id} has no name`);
  checkLocalized(provider.service, `provider.${provider.id}.service`);
  checkLocalized(provider.data, `provider.${provider.id}.data`);
  checkLocalized(provider.region, `provider.${provider.id}.region`);
  checkLocalized(
    provider.trainingAndRetention,
    `provider.${provider.id}.trainingAndRetention`
  );
  checkLocalized(provider.dpaStatus, `provider.${provider.id}.dpaStatus`);
  check(
    provider.privacyUrl === null ||
      httpSourceUrl(provider.privacyUrl) !== null,
    `${provider.id} has an unsafe privacy URL`
  );
}
check(
  pendingProviderReleaseBlockers("pending", [
    {
      id: "probe",
      provider: "Probe Provider",
      reviewStatus: "pending"
    }
  ]).length === 0 &&
    pendingProviderReleaseBlockers("effective", [
      {
        id: "probe",
        provider: "Probe Provider",
        reviewStatus: "pending"
      },
      {
        id: "verified-probe",
        provider: "Verified Probe",
        reviewStatus: "verified"
      }
    ]).join("\n") ===
      "provider-review-probe: Probe Provider review is pending",
  "Provider review blockers must be itemized only for effective publication"
);
const pendingProviderRecords = PROVIDER_RECORDS.filter(
  (provider) => provider.reviewStatus === "pending"
);
const effectiveProviderBlockerProbe =
  pendingProviderReleaseBlockers(
    "effective",
    PROVIDER_RECORDS
  );
check(
  effectiveProviderBlockerProbe.length ===
    pendingProviderRecords.length &&
    pendingProviderRecords.every((provider) =>
      effectiveProviderBlockerProbe.some((blocker) =>
        blocker.startsWith(`provider-review-${provider.id}:`)
      )
    ),
  "Effective publication must itemize every pending provider review"
);

for (const metadataError of publicationMetadataErrors(LEGAL_META)) {
  errors.push(metadataError);
}
check(
  publicationMetadataErrors({
    status: "pending",
    version: "1.0.0-draft",
    effectiveDate: null
  }).length === 0 &&
    publicationMetadataErrors({
      status: "effective",
      version: "1.0.0",
      effectiveDate: "2026-08-01"
    }).length === 0,
  "Metadata validator must accept structurally valid pending and effective states"
);
check(
  semanticVersionParts("1.0.0") !== null &&
    semanticVersionParts("1.0.0-draft") !== null &&
    semanticVersionParts("1.0.0-rc.1+build.7") !== null &&
    semanticVersionParts("01.0.0") === null &&
    semanticVersionParts("1.0") === null &&
    semanticVersionParts("1.0.0-01") === null,
  "Semantic-version validator accepts or rejects known cases incorrectly"
);
check(
  isRealCalendarDate("2024-02-29") &&
    !isRealCalendarDate("2026-02-29") &&
    !isRealCalendarDate("2026-02-30") &&
    !isRealCalendarDate("2026-13-01"),
  "Calendar-date validator accepts or rejects known cases incorrectly"
);
check(
  isReasonableReleaseEmail("privacy@lyra.ltd") &&
    !isReasonableReleaseEmail("privacy@example.com") &&
    !isReasonableReleaseEmail("privacy @lyra.ltd") &&
    !isReasonableReleaseEmail("privacy@localhost"),
  "Release-email validator accepts or rejects known cases incorrectly"
);
check(
  LEGAL_META.contact.privacyEmail === OPERATOR_PERSONAL_EMAIL &&
    LEGAL_META.contact.supportEmail === OPERATOR_PERSONAL_EMAIL &&
    isReasonableReleaseEmail(OPERATOR_PERSONAL_EMAIL),
  "Published privacy/support email must match the valid personal contact source"
);
check(
  isReasonableServiceAddress(
    "中国上海市浦东新区世纪大道100号第20层法律文件送达处"
  ) &&
    !isReasonableServiceAddress("Shanghai") &&
    !isReasonableServiceAddress(
      "Pending service address to be confirmed"
    ),
  "Service-address validator accepts or rejects known cases incorrectly"
);
check(
  isRealCalendarDate(LEGAL_META.lastVerified),
  "Implementation last-verified date is not a real calendar date"
);
check(LEGAL_META.equalAuthority, "Bilingual texts must have equal authority");
for (const record of LEGAL_HISTORY) {
  check(
    record.date === null || isRealCalendarDate(record.date),
    `History ${record.version} has an invalid calendar date`
  );
}
check(
  LEGAL_HISTORY.some(
    (record) =>
      record.version === LEGAL_META.version &&
      record.status === LEGAL_META.status &&
      record.date === LEGAL_META.effectiveDate
  ),
  "History does not contain the current version/status/effective-date tuple"
);

const requiredGateIds = [
  "contact-channels",
  "service-address",
  "supabase-assurance",
  "rights-channel",
  "high-risk-feature-review",
  "international-mechanisms",
  "copyleft-obligations",
  "final-publication-record"
];
const gateIds = LEGAL_RELEASE_GATES.map((gate) => gate.id);
check(
  new Set(gateIds).size === gateIds.length,
  "Release-gate IDs are not unique"
);
for (const id of requiredGateIds) {
  check(gateIds.includes(id), `Missing release gate ${id}`);
}
for (const gate of LEGAL_RELEASE_GATES) {
  checkLocalized(gate.label, `gate.${gate.id}.label`);
  checkLocalized(gate.detail, `gate.${gate.id}.detail`);
}

const requiredRoutes = [
  "app/legal/page.tsx",
  "app/legal/[locale]/page.tsx",
  "app/legal/terms/page.tsx",
  "app/legal/terms/[locale]/page.tsx",
  "app/legal/privacy/page.tsx",
  "app/legal/privacy/[locale]/page.tsx",
  "app/legal/licenses/page.tsx",
  "app/legal/licenses/[locale]/page.tsx",
  "app/legal/providers/page.tsx",
  "app/legal/providers/[locale]/page.tsx",
  "app/legal/history/page.tsx",
  "app/legal/history/[locale]/page.tsx"
];
for (const route of requiredRoutes) {
  check(existsSync(path.join(siteRoot, route)), `Missing route ${route}`);
}

const retiredStaticFiles = [
  "legal/index.html",
  "legal/legal.js",
  "legal/styles.css",
  "legal/terms/index.html",
  "legal/privacy/index.html",
  "legal/licenses/index.html",
  "legal/licenses/licenses.js",
  "public/legal/index.html",
  "public/legal/legal.js",
  "public/legal/styles.css",
  "public/legal/terms/index.html",
  "public/legal/privacy/index.html",
  "public/legal/licenses/index.html",
  "public/legal/licenses/licenses.js",
  "public/legal/licenses/notices.json"
];
for (const retired of retiredStaticFiles) {
  check(
    !existsSync(path.join(siteRoot, retired)),
    `Retired duplicate still exists: ${retired}`
  );
}

const legalCodeFiles = [
  ...requiredRoutes,
  "app/legal/content.tsx",
  "app/legal/terms/content.tsx",
  "app/legal/privacy/content.tsx",
  "app/legal/providers/content.tsx",
  "app/legal/history/content.tsx",
  "app/legal/layout.tsx",
  "components/legal/legal-shell.tsx",
  "components/legal/legal-document.tsx",
  "components/legal/data-practice-table.tsx",
  "components/legal/legal-contact-details.tsx"
];
for (const file of legalCodeFiles) {
  const source = readFileSync(path.join(siteRoot, file), "utf8");
  check(
    !source.includes('"use client"') &&
      !source.includes("'use client'"),
    `${file} must remain server-rendered without a client boundary`
  );
}

const contactDetailsSource = readFileSync(
  path.join(
    siteRoot,
    "components/legal/legal-contact-details.tsx"
  ),
  "utf8"
);
for (const field of [
  "privacyEmail",
  "supportEmail",
  "serviceAddress"
] as const) {
  check(
    contactDetailsSource.includes(
      `LEGAL_META.contact.${field}`
    ),
    `Legal contact component does not consume ${field}`
  );
}
check(
  contactDetailsSource.includes("mailto:${value}") &&
    contactDetailsSource.includes(
      'data-contact-state="pending"'
    ) &&
    contactDetailsSource.includes("<address") &&
    contactDetailsSource.includes("#contact") &&
    contactDetailsSource.includes("personalNotice"),
  "Legal contact component must render mailto links, personal-channel guidance, pending state, and service address"
);
const publicContactSource = readFileSync(
  path.join(siteRoot, "components/contact-section.tsx"),
  "utf8"
);
check(
  publicContactSource.includes("OPERATOR_PERSONAL_EMAIL") &&
    publicContactSource.includes("PERSONAL_CONTACT_CHANNELS") &&
    publicContactSource.includes("copy.personalNotice"),
  "Official-site contact section must use the shared personal contact sources and notice"
);
const termsPageSource = readFileSync(
  path.join(siteRoot, "app/legal/terms/content.tsx"),
  "utf8"
);
check(
  termsPageSource.includes(
    'id: "agreement-changes-and-contact"'
  ) &&
    termsPageSource.includes('variant="terms"'),
  "Terms contact section does not render legal contact details"
);
const privacyPageSource = readFileSync(
  path.join(siteRoot, "app/legal/privacy/content.tsx"),
  "utf8"
);
check(
  privacyPageSource.includes('id: "rights-and-choices"') &&
    privacyPageSource.includes('variant="privacy"'),
  "Privacy rights section does not render privacy contact details"
);

const providerPageSource = readFileSync(
  path.join(siteRoot, "app/legal/providers/content.tsx"),
  "utf8"
);
check(
  providerPageSource.includes(
    "https://operations.osmfoundation.org/policies/nominatim/"
  ),
  "Provider page must link the Nominatim usage policy directly"
);
const licensesPageSource = readFileSync(
  path.join(siteRoot, "app/legal/licenses/[locale]/page.tsx"),
  "utf8"
);
check(
  !licensesPageSource.includes("href={source}") &&
    licensesPageSource.includes(
      'href="/legal/third-party-notices.txt"'
    ),
  "Licenses renderer must link the canonical static notice asset"
);

const nextConfigSource = readFileSync(
  path.join(siteRoot, "next.config.mjs"),
  "utf8"
);
check(
  nextConfigSource.includes('source: "/terms"') &&
    nextConfigSource.includes('destination: "/legal/terms"'),
  "Legacy /terms redirect is missing"
);
check(
  nextConfigSource.includes('source: "/privacy"') &&
    nextConfigSource.includes('destination: "/legal/privacy"'),
  "Legacy /privacy redirect is missing"
);
check(
  !nextConfigSource.includes("async rewrites()"),
  "Static legal rewrites must remain retired"
);

const canonicalNoticesPath = path.join(
  repositoryRoot,
  "legal/generated/third-party-notices.json"
);
check(
  existsSync(canonicalNoticesPath),
  "Canonical third-party notices JSON is missing"
);
if (existsSync(canonicalNoticesPath)) {
  const notices = JSON.parse(
    readFileSync(canonicalNoticesPath, "utf8")
  ) as ThirdPartyNotices;
  check(
    notices.packageCount === notices.items.length,
    "Canonical notice packageCount does not match items"
  );
  const groups = groupThirdPartyNotices(notices);
  check(
    groups.reduce((sum, group) => sum + group.items.length, 0) ===
      notices.items.length,
    "Grouped notices do not preserve every canonical item"
  );
  const noticeOnlyOrCombined = notices.items.filter(
    (item) => item.noticeText?.trim()
  );
  for (const item of noticeOnlyOrCombined) {
    check(
      combinedNoticeText(item).includes(item.noticeText!.trim()),
      `${item.name}@${item.version} lost noticeText`
    );
  }
  const missingTextItems = notices.items.filter(
    (item) =>
      !item.noticeText?.trim() && !item.licenseText?.trim()
  );
  for (const item of missingTextItems) {
    check(
      combinedNoticeText(item).startsWith(
        "No license or notice text was captured"
      ),
      `${item.name}@${item.version} lacks explicit uncaptured-text fallback`
    );
  }
  check(
    httpSourceUrl("registry+https://github.com/rust-lang/crates.io-index") ===
      null &&
      httpSourceUrl("third-party/example/Cargo.toml") === null &&
      httpSourceUrl("https://example.com/license") !== null,
    "Source URL validation does not reject non-http identifiers"
  );
}

if (errors.length > 0) {
  console.error("legal:check failed");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else if (releaseMode) {
  const unresolvedCopyMarkers = [
    "publication-pending",
    "not effective",
    "before publication",
    "before release",
    "release blocker",
    "release blockers",
    "under release review",
    "until that review is complete",
    "this draft",
    "draft status",
    "not yet verified",
    "待发布草案",
    "尚未生效",
    "发布前必须",
    "发布阻断",
    "仍处于发布审阅",
    "在审阅完成前",
    "本草案",
    "草案状态",
    "尚未核验"
  ] as const;
  const localizedCopyValues = LEGAL_DOCUMENTS.flatMap((document) => [
    {
      location: `${document.id}.title`,
      value: document.title
    },
    {
      location: `${document.id}.description`,
      value: document.description
    },
    ...document.sections.flatMap((section) => [
      {
        location: `${document.id}.${section.id}.heading`,
        value: section.heading
      },
      ...section.blocks.flatMap((block, blockIndex) =>
        (block.kind === "list" ? block.items : [block.text]).map(
          (value, valueIndex) => ({
            location:
              `${document.id}.${section.id}.block-${blockIndex}` +
              `-${valueIndex}`,
            value
          })
        )
      )
    ])
  ]);
  const unresolvedCopy =
    LEGAL_META.status === "effective"
      ? localizedCopyValues.flatMap(({ location, value }) =>
          LEGAL_LOCALES.flatMap((locale) => {
            const normalized = value[locale].toLowerCase();
            return unresolvedCopyMarkers
              .filter((marker) =>
                normalized.includes(marker.toLowerCase())
              )
              .map(
                (marker) =>
                  `unresolved-copy: ${location}.${locale} contains "${marker}"`
              );
          })
        )
      : [];
  const providerReviewBlockers =
    pendingProviderReleaseBlockers(
      LEGAL_META.status,
      PROVIDER_RECORDS
    );
  const finalVersionReady =
    semanticVersionParts(LEGAL_META.version) !== null &&
    !LEGAL_META.version.toLowerCase().includes("-draft");
  const effectiveDateReady =
    LEGAL_META.effectiveDate !== null &&
    isRealCalendarDate(LEGAL_META.effectiveDate);
  const privacyEmailBlockers =
    LEGAL_META.contact.privacyEmail === null
      ? ["privacy-email: not verified"]
      : isReasonableReleaseEmail(
            LEGAL_META.contact.privacyEmail
          )
        ? []
        : ["privacy-email: invalid release address"];
  const supportEmailBlockers =
    LEGAL_META.contact.supportEmail === null
      ? ["support-email: not verified"]
      : isReasonableReleaseEmail(
            LEGAL_META.contact.supportEmail
          )
        ? []
        : ["support-email: invalid release address"];
  const serviceAddressBlockers =
    LEGAL_META.contact.serviceAddress === null
      ? ["service-address: not verified"]
      : isReasonableServiceAddress(
            LEGAL_META.contact.serviceAddress
          )
        ? []
        : ["service-address: invalid or incomplete"];
  const englishStatusLabel =
    STATUS_LABEL["en-US"].toLowerCase();
  const chineseStatusLabel = STATUS_LABEL["zh-CN"];
  const effectiveStatusLabelReady =
    englishStatusLabel.includes("effective") &&
    !/(?:pending|not effective|draft)/u.test(
      englishStatusLabel
    ) &&
    chineseStatusLabel.includes("生效") &&
    !/(?:待发布|尚未生效|草案)/u.test(chineseStatusLabel);
  const releaseBlockers = [
    ...LEGAL_RELEASE_GATES.filter((gate) => gate.state !== "complete").map(
      (gate) => `${gate.id}: ${gate.label["en-US"]}`
    ),
    ...unresolvedCopy,
    ...providerReviewBlockers,
    ...(LEGAL_META.status === "effective" &&
    !effectiveStatusLabelReady
      ? ["status-label: visible status label is not effective"]
      : []),
    ...(LEGAL_META.status !== "effective"
      ? ["publication-status: legal status is not effective"]
      : []),
    ...(!finalVersionReady
      ? [
          "final-version: must be valid Semantic Versioning without -draft"
        ]
      : []),
    ...(!effectiveDateReady
      ? ["effective-date: not set or not a real calendar date"]
      : []),
    ...privacyEmailBlockers,
    ...supportEmailBlockers,
    ...serviceAddressBlockers
  ];

  if (releaseBlockers.length > 0) {
    console.error(
      `legal:release-check refused publication (${releaseBlockers.length} blockers)`
    );
    for (const blocker of releaseBlockers) {
      console.error(`- ${blocker}`);
    }
    process.exitCode = 1;
  } else {
    console.log("legal:release-check passed");
  }
} else {
  console.log(
    `legal:check passed: ${LEGAL_DOCUMENTS.length} documents, ` +
      `${DATA_PRACTICES.length} data practices, ` +
      `${PROVIDER_RECORDS.length} provider records, ` +
      `${LEGAL_RELEASE_GATES.length} release gates`
  );
}
