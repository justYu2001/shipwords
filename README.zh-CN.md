<div align="center">

<a href="https://shipwords.dev/zh/"><img src="apps/www/public/img/og-zh.jpg" alt="shipwords：一个关键词，一个站。" width="100%"></a>

**新词站群的开源框架：一个下午上一个站，上线当天就能收钱。**

[![CI](https://github.com/shipwords-dev/shipwords/actions/workflows/ci.yml/badge.svg)](https://github.com/shipwords-dev/shipwords/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TanStack Start](https://img.shields.io/badge/TanStack-Start-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/start)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GitHub stars](https://img.shields.io/github/stars/shipwords-dev/shipwords?style=flat&logo=github)](https://github.com/shipwords-dev/shipwords/stargazers)

[English](README.md) · **中文**

</div>

shipwords 是一套免费、MIT 开源的新词站群框架，用来在 Cloudflare 上同时运营很多个 AI 图像和视频站，一个新词一个站。不变的共享：账户、支付、积分和 AI 生成只写一次，所有站共用。变的独立：每个站有自己的页面、外观和域名。官网：[shipwords.dev](https://shipwords.dev/zh/)。

## 为什么用 shipwords

**为新词站群而生。** 每个新词上一个站，起量的继续迭代，没起来的放着不管。公共核心有 bug，修一处，所有站下次部署就能更新。每个站单独部署，有自己的数据库、文件存储和收款账户，上线或下线一个站都不影响其他站。

**内置成熟的 AI 能力。** [tinydeskai.io](https://tinydeskai.io/) 就是用 shipwords 做的，完整源码在 [`sites/tinydeskai-example`](sites/tinydeskai-example)，可以 fork 来做你自己的词。

- **视频模板**：把一条爆款视频做成模板，访客上传照片，就能拿到同款视频。Tiny Desk AI 就是这样做的。
- **成熟的换脸**：整段视频一次换完。每张上传的照片替换一位表演者，脸、发型和衣服都换上，口型仍然跟着节拍。原来的脸还在的话，任务判为失败，积分退回。
- **主流模型，内置可用**：GPT Image、Nano Banana、Seedream、FLUX、Seedance、Veo、Kling、Wan 等，填一个 Yir API key 就能用，按次付费。

**开箱就能收钱。** 每个站都自带：

- Google 和邮箱登录、账户页
- Creem（记录商户）、Stripe 或 PayPal；积分包与订阅、订单与退款
- 邮件通知
- 游客免费试用与防刷（reCAPTCHA v3）
- 隐私、条款、退款、DMCA 页面
- SEO、`sitemap.xml`、`robots.txt`、`llms.txt`、统计

收钱的代码所有站共用，并有测试覆盖：重复扣款、重复或乱序的支付通知、失败任务的退款都测过。

## 让编程 Agent 帮你建站

还没想好做哪个词？[new-term-radar](https://github.com/zhuyansen/new-term-radar)（第三方开源项目）每天从 X、Hugging Face、GitHub 和 sitemap 里抓刚冒头的 AI 新词，比关键词工具早。

把下面这句换成你的关键词，粘贴到 Claude Code、Codex 或 Cursor：

```text
阅读 shipwords.dev/llms.txt，帮我为「你的关键词」做一个站
```

Agent 会克隆仓库、生成站点并在本地跑起来。它遵守的规则写在 [AGENTS.md](AGENTS.md)。

## 快速开始

需要 Node 24（见 `.nvmrc`）、pnpm 10（`corepack enable`），Windows 上用 Git Bash 或 WSL。正式上线还需要 Cloudflare 账号，以及 Creem 账号（或 Stripe、PayPal）。

1. Fork 或克隆本仓库，然后安装依赖：

   ```bash
   pnpm install
   ```

2. 从模板生成第一个站，再安装一次，让新站装上依赖：

   ```bash
   pnpm new-site my-tool --domain my-tool.com
   pnpm install
   ```

3. 本地密钥放在仓库外，再链接进来：

   ```bash
   mkdir -p ~/.config/shipwords
   cp sites/my-tool/.dev.vars.example ~/.config/shipwords/my-tool.dev.vars   # 填入测试 key
   pnpm setup:worktree
   ```

   示例文件不改也能跑：邮箱登录可用（验证码打印在 dev server 的终端里），新账户有注册赠送积分，生成走模拟上游（`UPSTREAM_MOCK=1`），不需要任何模型 key。需要时再补：
   - **真实生成**：填 [Yir API key](https://yir.ai/?utm_source=shipwords&utm_medium=readme)，并关掉 `UPSTREAM_MOCK`。
   - **购买积分**：填 Creem 测试 key（`creem_test_…`），并在 `refs.creem` 里填测试商品；webhook 需要隧道，见[本地开发](docs/local-development.md)。
   - **游客免费试用**：填 reCAPTCHA key。不填的话，访客要先登录才能生成。
   - **Google 登录**：一个以 `http://localhost:<port>` 为来源的 Google OAuth 客户端。可选，不填也能用邮箱登录。

4. 运行：

   ```bash
   cd sites/my-tool
   pnpm db:generate && pnpm db:migrate:local
   pnpm dev
   ```

准备上线时，按 [docs/site-launch.md](docs/site-launch.md) 操作（英文）。

## 要花多少钱

代码免费，MIT 许可，可以商用。你要付的是：

- 域名（Cloudflare Registrar 按成本价出售）。
- Cloudflare 用量费。需要把多段视频拼接起来的站会用到 Cloudflare Containers，要开 Workers Paid 套餐。
- 每笔订单的支付手续费（Creem、Stripe 或 PayPal）。
- Yir 上按次计费的模型费用。每个任务的成本上限在 `src/models.server.ts` 里设定。

## 仓库结构

| 目录                       | 内容                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core`            | D1 + Drizzle、幂等写入的积分账本、Creem、Stripe 与 PayPal 计费（积分包、订阅、退款、争议）、Better Auth、游客配额 + reCAPTCHA v3、SEO/GEO 工具、统计代理、headless React hooks |
| `packages/jobs`            | 基于 Workflows 的生成任务运行时：单向任务状态机、自动退款、上游适配接口、Yir 适配（`@yir-ai/sdk`）、本地开发用的模拟上游、可选的 ffmpeg 拼接容器                               |
| `templates/ai-site`        | 一个完整可用的 AI 图像站，由 `pnpm new-site` 复制：首页、定价、账户、登录、政策页、`sitemap.xml`、`robots.txt`、`llms.txt`                                                     |
| `sites/<site>`             | 你的站，一个关键词一个，各自单独部署                                                                                                                                           |
| `sites/tinydeskai-example` | tinydeskai.io 的完整源码（视频特效：照片槽位、整段一次编辑、结果检查、ffmpeg 拼接、内容页）                                                                                    |
| `apps/<sidecar>`           | 可选的小型 Worker，不属于任何单个站                                                                                                                                            |
| `tools/`                   | `new-site` 脚手架、`check-site` 上线检查、`list-sites`、worktree 初始化、dev 端口、Stripe webhook 转发（只用 Node 内置模块，带测试）                                           |
| `docs/`                    | 架构、本地开发、上线手册（英文）                                                                                                                                               |

每个站是一个 TanStack Start + React 19 应用，跑在独立的 Cloudflare Worker 上，使用 D1、R2 和 Workflows。

## 常用命令

```bash
pnpm new-site <dir> --domain <domain>   # 从模板生成 sites/<dir>
pnpm list-sites                         # 根据各站代码和 README 生成站点列表
pnpm setup:worktree                     # 把本地密钥复制到新 worktree，修正 dev 端口
pnpm --filter "./sites/<site>" dev
pnpm --filter "./sites/<site>" check    # 类型检查 + 构建 + 上线检查
pnpm check:packages                     # core + jobs：类型检查 + 测试
pnpm check:template
pnpm lint && pnpm test:tools
```

## 文档（英文）

- [架构与设计取舍](docs/architecture.md)
- [本地开发](docs/local-development.md)
- [上线手册](docs/site-launch.md)
- [AI 编程 Agent 规则](AGENTS.md)
- [贡献指南](CONTRIBUTING.md) 与 [安全政策](SECURITY.md)

## 社区

提问、想法和你上线的站，发到 [GitHub Discussions](https://github.com/shipwords-dev/shipwords/discussions)：[Q&A](https://github.com/shipwords-dev/shipwords/discussions/categories/q-a)、[Show and tell](https://github.com/shipwords-dev/shipwords/discussions/categories/show-and-tell)、[Ideas](https://github.com/shipwords-dev/shipwords/discussions/categories/ideas)。Bug 请提 [Issues](https://github.com/shipwords-dev/shipwords/issues)。

## 许可

[MIT](LICENSE)
