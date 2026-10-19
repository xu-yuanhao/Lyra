import type {
  LocalizedText,
  ProviderRecord
} from "./types";

const text = (en: string, zh: string): LocalizedText => ({
  "en-US": en,
  "zh-CN": zh
});

const cloudAi = (
  id: string,
  provider: string,
  privacyUrl: string | null
): ProviderRecord => ({
  id,
  provider,
  service: text(
    "Selectable cloud AI model endpoint",
    "可选择的云端 AI 模型端点"
  ),
  data: text(
    "Prompts and the Agent/model context selected or assembled for a turn, which can include content, tools, derived Persona, device/screen/timezone context, and authorized location labels.",
    "为轮次选择或组装的提示词与 Agent/模型上下文，可能包括内容、工具、推导 Persona、设备/屏幕/时区上下文及经授权的位置标签。"
  ),
  region: text(
    "Chosen by the user and controlled by the selected provider, account, product, endpoint, and region configuration; Lyra does not make one provider-wide location promise.",
    "由用户选择，并由所选服务商、账户、产品、端点及地区配置控制；Lyra 不作覆盖所有服务商的统一地点承诺。"
  ),
  privacyUrl,
  trainingAndRetention: text(
    "Depends on the provider product, account tier, endpoint and user settings; Lyra has not verified a release-wide no-training or retention commitment.",
    "取决于服务商产品、账户层级、端点及用户设置；Lyra 尚未核验覆盖发布版本的“不训练”或保留承诺。"
  ),
  dpaStatus: text(
    "User-selected/BYOK destination. The user or organization must review the provider terms, DPA, retention, training, and transfer settings that apply to the selected account before sending data.",
    "用户选择/BYOK 目的地。用户或其组织在发送数据前须审阅适用于所选账户的服务商条款、DPA、保留、训练及跨境设置。"
  ),
  reviewStatus: "user-configured"
});

export const PROVIDER_RECORDS: readonly ProviderRecord[] = [
  {
    id: "cloudflare",
    provider: "Cloudflare",
    service: text(
      "Website and documentation static hosting, edge delivery, transport security, abuse protection, and website redirect Worker execution",
      "官网与文档静态托管、边缘分发、传输安全、滥用防护及官网重定向 Worker 执行"
    ),
    data: text(
      "Visitor IP address; requested hostname, URL path and query; HTTP headers such as user agent, referrer, locale and any cookies sent with the request; network, TLS, routing and security metadata; and, for website redirect Worker requests, invocation, error and diagnostic logs.",
      "访问者 IP 地址；请求的主机名、URL 路径与查询参数；User-Agent、来源页面、区域语言及请求所携带 Cookie 等 HTTP 请求头；网络、TLS、路由与安全元数据；以及官网重定向 Worker 请求的调用、错误和诊断日志。"
    ),
    region: text(
      "Cloudflare-controlled global edge infrastructure. The lyra.ltd zone is active on the Cloudflare Free plan; requests can be routed through geographically distributed locations. Current subprocessors are listed by Cloudflare rather than selected by Lyra.",
      "由 Cloudflare 控制的全球边缘基础设施。lyra.ltd zone 当前使用 Cloudflare Free 套餐；请求可能经由分布在不同地区的节点处理。当前子处理者由 Cloudflare 列示，并非 Lyra 选定。"
    ),
    privacyUrl: "https://www.cloudflare.com/privacypolicy/",
    trainingAndRetention: text(
      "Used to deliver, secure, operate and diagnose the website and documentation. The lyra-site redirect Worker has persistent invocation logs enabled at 10% head sampling, no traces, no Logpush and no tail consumer. The lyra-docs static asset Worker has no observability configuration and no Logpush. Cloudflare currently documents three-day Workers Logs retention for the Free plan; security and other provider logs can follow separate controls.",
      "用于分发、保护、运行官网与文档并进行故障诊断。lyra-site 重定向 Worker 已启用持久化调用日志，头部采样率为 10%，未启用 trace、Logpush 或 tail consumer。lyra-docs 静态资源 Worker 未配置可观测性且未启用 Logpush。Cloudflare 当前文档说明 Free 套餐的 Workers Logs 保留期为 3 天；安全及其他服务商日志可能使用独立控制。"
    ),
    dpaStatus: text(
      "Verified 2026-08-02 against the authenticated Free-plan account and Cloudflare Customer DPA Version 6.4, effective 2026-04-03. The DPA states that it forms part of the Self-Serve Subscription Agreement or other Main Agreement and publishes the current subprocessor list. No custom data-location promise is claimed.",
      "已于 2026-08-02 根据已登录的 Free 套餐账户及 2026-04-03 生效的 Cloudflare Customer DPA Version 6.4 核验。该 DPA 声明其构成 Self-Serve Subscription Agreement 或其他主协议的一部分，并公布当前子处理者清单。不声称存在定制数据地点承诺。"
    ),
    reviewStatus: "verified"
  },
  {
    id: "supabase",
    provider: "Supabase",
    service: text(
      "Authentication, profile, and session backend",
      "身份认证、profile 与会话后端"
    ),
    data: text(
      "User and session identifiers, Google-linked email/name/avatar, locale, theme, onboarding state, and authentication metadata.",
      "用户与会话标识符、Google 关联邮箱/姓名/头像、语言、主题、引导状态和认证元数据。"
    ),
    region: text(
      "Project region identifier us-west-2, verified through the authenticated Supabase Management API on 2026-08-01.",
      "项目地区标识符为 us-west-2，已于 2026-08-01 通过经认证的 Supabase Management API 核验。"
    ),
    privacyUrl: "https://supabase.com/privacy",
    trainingAndRetention: text(
      "Controlled by project configuration, the Supabase Terms and DPA, backups, and retention practices; Lyra's production end-to-end deletion test remains pending.",
      "由项目配置、Supabase 条款与 DPA、备份及保留做法控制；Lyra 的生产端到端删除测试仍待完成。"
    ),
    dpaStatus: text(
      "Verified 2026-08-02 in the authenticated organization dashboard: DPA Version 1 dated 2026-08-01 is automatically incorporated into the Supabase Terms for all organizations and requires no separate signature. Current official subprocessor list dated 2026-06-01: https://supabase.com/legal/customer-resources/subprocessor-list",
      "已于 2026-08-02 通过已登录的组织控制台核验：日期为 2026-08-01 的 DPA Version 1 自动并入所有组织适用的 Supabase 条款，无需另行签署。日期为 2026-06-01 的官方现行子处理者清单：https://supabase.com/legal/customer-resources/subprocessor-list"
    ),
    reviewStatus: "verified"
  },
  {
    id: "google-oauth",
    provider: "Google",
    service: text("OAuth sign-in", "OAuth 登录"),
    data: text(
      "OAuth identifiers and scopes, email, display name, avatar, and ordinary sign-in request metadata.",
      "OAuth 标识符与 scope、邮箱、显示名称、头像及通常登录请求元数据。"
    ),
    region: text(
      "Google-controlled global infrastructure; exact locations are not selected by Lyra.",
      "由 Google 控制的全球基础设施；确切地点并非由 Lyra 选择。"
    ),
    privacyUrl: "https://policies.google.com/privacy",
    trainingAndRetention: text(
      "The production project currently uses an external OAuth client backed by the current Supabase callback. Only the ordinary OpenID Connect identity fields used by Lyra are requested; the authenticated Google Auth Platform review found no separately configured sensitive or restricted scopes. Google account, OAuth, security, and retention policies still apply.",
      "生产项目当前使用外部 OAuth 客户端，并指向现行 Supabase 回调。Lyra 仅请求其使用的通常 OpenID Connect 身份字段；通过已登录的 Google Auth Platform 核验，未发现另行配置的敏感或受限 scope。仍适用 Google 账户、OAuth、安全及保留政策。"
    ),
    dpaStatus: text(
      "Authenticated review on 2026-08-06 confirmed External user type, In production publishing status, a 1/100 OAuth user count, the public Lyra home/privacy/terms URLs, lyra.ltd plus the two current Supabase authorized domains, and no configured sensitive or restricted scopes. Sign-in is user-initiated and Google controls global processing under its published privacy policy. No Lyra-specific Google DPA or data-residency promise is claimed. Google branding re-verification remains a separate provider-approval and presentation item.",
      "已于 2026-08-06 通过登录后的项目核验：用户类型为 External，发布状态为 In production，OAuth 用户数为 1/100，已填写 Lyra 公开主页、隐私政策和用户协议 URL，并配置 lyra.ltd 及两个现行 Supabase 授权域名，且未配置敏感或受限 scope。登录由用户主动发起，全球处理由 Google 依其公开隐私政策控制。不声称存在 Lyra 专属 Google DPA 或数据驻留保证。Google 品牌重新验证仍属于独立的服务商审批与展示事项。"
    ),
    reviewStatus: "verified"
  },
  cloudAi(
    "openai",
    "OpenAI",
    "https://openai.com/policies/privacy-policy/"
  ),
  cloudAi(
    "anthropic",
    "Anthropic",
    "https://www.anthropic.com/legal/privacy"
  ),
  cloudAi(
    "aws-bedrock",
    "Amazon Web Services (Bedrock)",
    "https://aws.amazon.com/privacy/"
  ),
  cloudAi(
    "google-gemini",
    "Google (Gemini API)",
    "https://policies.google.com/privacy"
  ),
  cloudAi(
    "openrouter",
    "OpenRouter",
    "https://openrouter.ai/privacy"
  ),
  cloudAi("deepseek", "DeepSeek", null),
  cloudAi("zhipu-glm", "Zhipu AI / Z.ai (GLM)", null),
  cloudAi("moonshot", "Moonshot AI / Kimi", null),
  cloudAi("volcengine-ark", "Volcengine Ark (Volcano Engine)", null),
  cloudAi(
    "nvidia-nim",
    "NVIDIA NIM",
    "https://www.nvidia.com/en-us/about-nvidia/privacy-policy/"
  ),
  cloudAi(
    "amd-radeon-cloud",
    "AMD Radeon Cloud",
    "https://www.amd.com/en/legal/privacy.html"
  ),
  cloudAi("b-ai", "B.AI", "https://b.ai/privacy"),
  cloudAi("atria-asi", "Atria ASI", null),
  cloudAi(
    "intern-token-plan",
    "Shanghai AI Laboratory (Intern InkStone TokenPlan)",
    "https://www.shlab.org.cn/agreement/privacy"
  ),
  cloudAi("poolside", "Poolside", "https://poolside.ai/privacy"),
  cloudAi(
    "xiaomi-mimo",
    "Xiaomi MiMo",
    "https://privacy.mi.com/all/en_US/"
  ),
  cloudAi("ollama-cloud", "Ollama Cloud", "https://ollama.com/privacy"),
  cloudAi("xai", "xAI", "https://x.ai/legal/privacy-policy"),
  cloudAi("mistral", "Mistral AI", "https://mistral.ai/terms#privacy-policy"),
  cloudAi("groq", "Groq", "https://groq.com/privacy-policy/"),
  cloudAi("cerebras", "Cerebras", null),
  cloudAi("cohere", "Cohere", "https://cohere.com/privacy"),
  cloudAi(
    "together-ai",
    "Together AI",
    "https://www.together.ai/privacy"
  ),
  cloudAi(
    "perplexity",
    "Perplexity",
    "https://www.perplexity.ai/hub/legal/privacy-policy"
  ),
  cloudAi("alibaba", "Alibaba Cloud / DashScope", null),
  cloudAi("deepinfra", "DeepInfra", "https://deepinfra.com/privacy"),
  cloudAi(
    "venice",
    "Venice",
    "https://venice.ai/legal/privacy-policy"
  ),
  {
    id: "custom-ai-endpoints",
    provider: "User-configured compatible endpoint",
    service: text(
      "Custom OpenAI-compatible or Anthropic-compatible model endpoint",
      "自定义 OpenAI-compatible 或 Anthropic-compatible 模型端点"
    ),
    data: text(
      "The same model request boundary described for cloud AI, plus configured headers and authentication data sent to the chosen endpoint.",
      "与云端 AI 相同的模型请求边界，以及发送至所选端点的已配置请求头和认证数据。"
    ),
    region: text(
      "Chosen and controlled by the user or endpoint operator; Lyra cannot determine it.",
      "由用户或端点运营者选择并控制；Lyra 无法确定。"
    ),
    privacyUrl: null,
    trainingAndRetention: text(
      "Entirely determined by the endpoint operator and configuration.",
      "完全由端点运营者及配置决定。"
    ),
    dpaStatus: text(
      "User responsibility; no Lyra DPA.",
      "由用户负责；不存在 Lyra DPA。"
    ),
    reviewStatus: "user-configured"
  },
  {
    id: "local-ai-runtimes",
    provider: "Ollama / LM Studio / llama.cpp / vLLM / local-compatible runtime",
    service: text("Local model runtime", "本地模型运行时"),
    data: text(
      "Model requests and context sent to the configured local address.",
      "发送至所配置本地地址的模型请求与上下文。"
    ),
    region: text(
      "Local only when the configured runtime/address truly remains on the device or trusted local network.",
      "仅当所配置运行时/地址确实位于设备或可信本地网络时才属于本地。"
    ),
    privacyUrl: null,
    trainingAndRetention: text(
      "Controlled by the selected local runtime, model, logging, and network configuration.",
      "由所选本地运行时、模型、日志及网络配置控制。"
    ),
    dpaStatus: text("Not applicable to Lyra.", "不适用于 Lyra。"),
    reviewStatus: "user-configured"
  },
  {
    id: "google-suggest",
    provider: "Google Suggest",
    service: text("Disabled search-suggestion integration", "已停用的搜索联想集成"),
    data: text(
      "No query is sent to Google Suggest while typing in the current release.",
      "当前版本在输入时不会向 Google Suggest 发送查询。"
    ),
    region: text("Google-controlled global infrastructure.", "Google 控制的全球基础设施。"),
    privacyUrl: "https://policies.google.com/privacy",
    trainingAndRetention: text(
      "No current requests. A future opt-in integration would require a new review.",
      "当前无请求。未来如以选择开启方式重新集成，须重新审阅。"
    ),
    dpaStatus: text(
      "Not applicable while disabled.",
      "停用期间不适用。"
    ),
    reviewStatus: "verified"
  },
  {
    id: "wikipedia",
    provider: "Wikimedia Foundation (Wikipedia) (disabled)",
    service: text("Disabled Wikipedia search integration", "已停用的 Wikipedia 搜索集成"),
    data: text(
      "No query is sent to Wikipedia by Lyra Desktop in the current release.",
      "当前版本的 Lyra Desktop 不会向 Wikipedia 发送查询。"
    ),
    region: text("Wikimedia-controlled infrastructure.", "Wikimedia 控制的基础设施。"),
    privacyUrl: "https://foundation.wikimedia.org/wiki/Policy:Privacy_policy",
    trainingAndRetention: text(
      "No current requests. A future integration would require a new implementation and provider review.",
      "当前无请求。未来如重新集成，须另行完成实现及服务商审阅。"
    ),
    dpaStatus: text(
      "Not applicable while disabled.",
      "停用期间不适用。"
    ),
    reviewStatus: "verified"
  },
  {
    id: "web-search-and-sites",
    provider: "Configured search service and visited websites",
    service: text("Web search and browsing", "网页搜索与浏览"),
    data: text(
      "Submitted queries, URLs, page requests, cookies/session data for the active profile, and ordinary network metadata.",
      "已提交查询、URL、网页请求、当前 profile 的 Cookie/会话数据及通常网络元数据。"
    ),
    region: text(
      "Controlled by each configured search provider and visited site.",
      "由各所配置搜索服务商及访问网站控制。"
    ),
    privacyUrl: null,
    trainingAndRetention: text(
      "Varies by provider and site; consult each destination.",
      "因服务商及网站而异；请查阅各目的地政策。"
    ),
    dpaStatus: text(
      "No general Lyra DPA; user-selected destinations.",
      "不存在通用 Lyra DPA；目的地由用户选择。"
    ),
    reviewStatus: "user-configured"
  },
  {
    id: "nominatim",
    provider: "OpenStreetMap Foundation public Nominatim service (disabled)",
    service: text("Disabled reverse-geocoding integration", "已停用的逆地理编码集成"),
    data: text(
      "No Lyra Desktop data is sent to this service in the current release.",
      "当前版本不会向该服务发送 Lyra Desktop 数据。"
    ),
    region: text(
      "Not applicable while the integration is disabled.",
      "集成停用期间不适用。"
    ),
    privacyUrl: "https://osmfoundation.org/wiki/Privacy_Policy",
    trainingAndRetention: text(
      "No current requests. The integration was disabled because the public usage policy says clients must not submit personal or confidential data.",
      "当前无请求。由于公共使用政策要求客户端不得提交个人或机密数据，该集成已停用。"
    ),
    dpaStatus: text(
      "Not applicable while disabled; any future activation requires a new provider and consent review.",
      "停用期间不适用；未来如启用，须重新审阅服务商及同意机制。"
    ),
    reviewStatus: "verified"
  },
  {
    id: "mcp-servers",
    provider: "User-configured MCP servers",
    service: text("Local or remote tools over MCP", "通过 MCP 提供的本地或远程工具"),
    data: text(
      "Server configuration, request headers/environment values, tool schemas, arguments, results, and any data a tool accesses.",
      "服务器配置、请求头/环境变量、工具 schema、参数、结果及工具访问的任何数据。"
    ),
    region: text(
      "Chosen by the user/server operator; can be local or remote.",
      "由用户/服务器运营者选择；可位于本地或远程。"
    ),
    privacyUrl: null,
    trainingAndRetention: text(
      "Determined by the server. Secrets are stored in a local JSON registry with UI redaction, not keychain encryption.",
      "由服务器决定。密钥保存在本机 JSON 注册表中，仅界面脱敏，并非钥匙串加密。"
    ),
    dpaStatus: text("User responsibility.", "由用户负责。"),
    reviewStatus: "user-configured"
  },
  {
    id: "skills-sources",
    provider: "claude-plugins.dev / skills.sh / clawhub.ai / api.clawhub.ai / GitHub and archive hosts",
    service: text("Skills discovery and installation", "Skills 发现与安装"),
    data: text(
      "Search queries, package identifiers, download requests, request metadata, installed code, and data accessed when a Skill runs.",
      "搜索查询、包标识符、下载请求、请求元数据、已安装代码以及 Skill 运行时访问的数据。"
    ),
    region: text(
      "Controlled by each catalog, repository, archive host, and destination reached by installed code.",
      "由各目录、仓库、压缩包托管方及已安装代码访问的目的地控制。"
    ),
    privacyUrl: null,
    trainingAndRetention: text(
      "Varies by source. Skill permission fields are declarative metadata, not a general enforcement sandbox.",
      "因来源而异。Skill 权限字段为声明性元数据，并非通用强制执行沙箱。"
    ),
    dpaStatus: text(
      "The fixed discovery endpoints were code-audited on 2026-08-06. Requests occur only after the user submits a Skills search or chooses an installation; no background query is sent. No Lyra-specific DPA, fixed processing region, or complete catalog-wide privacy assurance is claimed. Users should avoid personal or confidential search text and review the selected source before installation. This disclosed limitation is an accepted Preview risk, not a provider certification.",
      "已于 2026-08-06 对代码中的固定发现端点完成核验。仅当用户提交 Skills 搜索或选择安装时才会发出请求，不会在后台发送查询。不声称存在 Lyra 专属 DPA、固定处理地区或覆盖全部目录的隐私保障。用户不应在搜索词中填写个人或机密信息，并应在安装前审阅所选来源。该已披露限制属于 Preview 接受的风险，并非对服务商的认证。"
    ),
    reviewStatus: "verified"
  },
  {
    id: "github-updates",
    provider: "GitHub",
    service: text(
      "Application updates, releases, repositories, and package downloads",
      "应用更新、版本、仓库与包下载"
    ),
    data: text(
      "App version/platform, update and download requests, repository interactions, IP address, and ordinary request metadata.",
      "应用版本/平台、更新与下载请求、仓库交互、IP 地址及通常请求元数据。"
    ),
    region: text("GitHub-controlled global infrastructure.", "GitHub 控制的全球基础设施。"),
    privacyUrl: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
    trainingAndRetention: text(
      "Governed by GitHub account, repository, security, and log-retention policies.",
      "依 GitHub 账户、仓库、安全及日志保留政策。"
    ),
    dpaStatus: text(
      "No Lyra-specific DPA is claimed for public release downloads. The fixed GitHub destination and published privacy policy were verified; GPL/LGPL source-delivery duties remain in the separate copyleft release gate.",
      "对于公开版本下载，不声称存在 Lyra 专属 DPA。固定 GitHub 目的地及已公布隐私政策已核验；GPL/LGPL 源码交付义务仍由独立 copyleft 发布门禁管理。"
    ),
    reviewStatus: "verified"
  },
  {
    id: "language-packs",
    provider: "GitHub (petehsu/Lyra-Language-Packs)",
    service: text("Language catalog and pack delivery", "语言目录与语言包交付"),
    data: text(
      "Requested locale/catalog/pack, app compatibility version, IP address, and ordinary request metadata.",
      "所请求语言/目录/语言包、应用兼容版本、IP 地址及通常请求元数据。"
    ),
    region: text(
      "GitHub-controlled global infrastructure. The official repository and release-asset destination are fixed in the application.",
      "由 GitHub 控制的全球基础设施。应用已固定官方仓库及 Release asset 目的地。"
    ),
    privacyUrl: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
    trainingAndRetention: text(
      "Governed by GitHub's request, security, and log-retention practices. Language-pack authenticity is checked with the embedded Lyra Ed25519 public key.",
      "依 GitHub 的请求、安全及日志保留做法处理。语言包真实性由 Lyra 内嵌的 Ed25519 公钥核验。"
    ),
    dpaStatus: text(
      "No Lyra-specific DPA is claimed for public release downloads. The fixed destination and public privacy policy were verified; the first production asset download remains a release smoke test.",
      "对于公开 Release 下载，不声称存在 Lyra 专属 DPA。固定目的地及公开隐私政策已核验；首个生产 asset 下载仍属于发布 smoke test。"
    ),
    reviewStatus: "verified"
  }
] as const;
