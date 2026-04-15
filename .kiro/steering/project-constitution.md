---
inclusion: always
---

# 星聚项目宪法 — 不可违反的铁律

本文件是星聚（StarHub）项目的最高规范。所有代码修改、功能开发、架构决策都必须遵守以下规则。违反任何一条都必须立即修正。

---

## 第一章：禁止 Emoji

**代码中所有图标一律用 SVG（Lucide React 组件或 Font Awesome），绝对禁止 Unicode Emoji。**

---

## 第二章：安全 — NAS 隐身

**核心原则：NAS 零公网端口，所有流量走 Cloudflare，真实 IP 永远不可见。禁止让运营商读到我数据量过大防止被检测**

- 路径：`用户 → Cloudflare CDN → Cloudflare Tunnel → NAS`
- 禁止：端口转发、硬编码 IP、代码中出现内网地址
- 密钥全部走 Cloudflare Workers Secrets，前端代码零敏感信息
- 认证 API 必须用 `requireAuth()`，密码 bcrypt 哈希存储

---

## 第三章：架构

**前端 Cloudflare Pages + 后端 Pages Functions，前端 `/api/xxx` 自动路由到后端，同源无需 CORS。**

- 前端：Next.js 14 App Router + Tailwind CSS + `useAuth()` + `fetchWithAuth()`
- 后端：`functions/api/` 目录，D1 数据库，KV 缓存，R2 文件存储
- 每个页面必须有 `<Header />`，移动端适配 safe-area

---

## 第四章：UI

**深色主题，主色 `#3ea6ff`，背景 `#0f0f0f`，图标用 SVG 不用 emoji，移动优先响应式。**

---

## 第五章：游戏

**15 款精品游戏，必须 Canvas 渲染、完整游戏循环、键盘+触摸支持，禁止同质化水货。**

经典模拟器用 EmulatorWrapper + Nostalgist，ROM 存 IndexedDB，Homebrew 页提供合法免费下载链接。

---

## 第六章：部署

**Cloudflare Pages 部署前端+API，NAS 仅通过 Tunnel 连接，DNS 只用 CNAME 开橙色云。**

---

## 第七章：Git

**.gitignore 必须包含 `.env*`、`*.token`、`*.secret`、`cloudflared*.yml`，禁止提交任何密钥。**

---

## 第八章：语言与国际化

**默认中文，支持 i18n 多语言切换。**

- 所有 UI 文本、按钮、提示、页面标题、游戏界面默认使用中文
- 支持语言切换（中文/英文/日文等），但默认语言必须是中文
- 技术术语（Canvas、API、WebRTC 等）可保留英文
- 代码变量名可以用英文，但所有面向用户的字符串默认中文
- 新增页面和组件时，用户可见文本优先写中文版本

---

以上规则即日生效，所有后续开发必须严格遵守。
