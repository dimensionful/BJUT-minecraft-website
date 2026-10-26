# BJUT-MC

北京工业大学 Minecraft 社区服务器网站：共享公告、版本与玩法统计、服务器状态。

**线上地址：<https://bjutcraft.online>**

备用地址：<https://bjut-minecraft-website.waibi-babo.workers.dev>

前端是纯 HTML / CSS / JS；统计后端运行在 **Cloudflare Workers**，数据存储在 **Cloudflare D1**，没有第三方前端依赖。

`bjutcraft.online` 已通过 Cloudflare Custom Domain 绑定到 Worker。中国大陆网络若访问不到，先检查本地 DNS 是否仍缓存旧名称服务器，可临时改用 `223.5.5.5` / `119.29.29.29` 后刷新 DNS。

![BJUT-MC 首页](preview/light-hero.png)

![公告与统计](preview/dark-notices.png)

> 预览截图中的票数为示例数据，实际统计从 0 开始。

## 功能

- 浅色 / 深色主题，跟随系统并记住手动选择
- 共享公告，点击卡片查看完整内容
- 意愿统计：`26.3 原版生存`、`1.21.1 整合包：航空学`、`其它版本`
- 玩法统计：`休闲养老`、`生电`、`小游戏`、`整合包`
- 每题最多选 2 项；选择「其它版本」后可自行填写版本名
- 版本名最长 32 个字符，相同名称会合并统计
- 匿名投票：HttpOnly Cookie 标识浏览器，同一浏览器再次提交会更新选择
- 服务器状态区目前明确显示「暂无」已开放世界，不生成虚构数据
- 响应式布局，适配桌面、平板和手机

![自定义其它版本](preview/custom-version-card.png)

## 架构

```text
浏览器
  ├── 静态文件  →  Worker Assets (index.html / styles.css / script.js)
  └── /api/*    →  Cloudflare Worker  →  D1 (SQLite)
```

- `worker.js`：API 与静态资源入口
- `wrangler.jsonc`：Workers、静态资源、D1 绑定配置
- `migrations/`：D1 表结构迁移
- `preview/`：README 截图，不部署到网站

## 本地开发

需要 Node.js 20+。

```powershell
npm install
npm run db:migrate:local
npm run dev
```

打开 Wrangler 输出的本地地址（通常是 <http://127.0.0.1:8787>）。

本地 D1 数据保存在 `.wrangler/`，与线上数据库完全隔离。

## 部署到 Cloudflare

当前 D1 数据库：

- 名称：`bjut-mc-polls`
- Binding：`DB`
- 数据库 ID 已写入 `wrangler.jsonc`

首次部署或修改表结构时：

```powershell
npx wrangler login
npm run db:migrate
npm run deploy
```

发布纯代码更新：

```powershell
npm run deploy
```

### 在 Cloudflare 控制台连接 GitHub

如果要在每次 push 后自动部署，在 Cloudflare 的 Workers 构建页面填写：

| 字段 | 值 |
| --- | --- |
| 项目名称 | `bjut-minecraft-website` |
| 构建命令 | `npm install` |
| 部署命令 | `npx wrangler deploy` |

前提：

1. D1 数据库 `bjut-mc-polls` 已存在于同一个 Cloudflare 账户；
2. `wrangler.jsonc` 中的 `database_id` 与该数据库一致；
3. 已执行过一次 `npm run db:migrate`。

## 目录

```text
.
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   ├── favicon.svg
│   └── _headers
├── worker.js              Cloudflare Worker API
├── wrangler.jsonc         Worker / Assets / D1 配置
├── migrations/            D1 迁移 SQL
├── preview/               README 截图（不部署到网站）
├── package.json
└── package-lock.json
```

## API

### `GET /api/polls`

返回两项统计的选项、票数、百分比、参与人数、当前浏览器的选择，以及「其它版本」填写明细。

```json
{
  "polls": {
    "version": {
      "maxSelections": 2,
      "totalVoters": 0,
      "options": [
        {
          "id": "vanilla-26-3",
          "label": "26.3 原版生存",
          "count": 0,
          "percent": 0
        }
      ],
      "customVersions": [],
      "myVotes": [],
      "myCustomVersion": ""
    }
  },
  "updatedAt": "2026-10-26T00:00:00.000Z"
}
```

`customVersions` 是用户填写的「其它版本」名称汇总：

```json
[
  { "label": "1.20.1 Forge", "count": 2, "percent": 40 }
]
```

### `POST /api/polls/:pollId/vote`

`pollId` 为 `version` 或 `playstyle`。

```json
{
  "options": ["other-version", "vanilla-26-3"],
  "customVersion": "1.20.1 Forge"
}
```

- `options` 需为 1 至 2 个、不可重复
- 仅 `version` 统计接受 `customVersion`
- 选择 `other-version` 时必须提供 1 至 32 个字符的版本名称
- 成功后会返回该统计的最新状态

### `GET /api/health`

用于确认 Worker 与 D1 是否正常。

## 重置线上统计

```powershell
npx wrangler d1 execute bjut-mc-polls --remote --command="DELETE FROM votes"
```

## 数据与隐私

- 只使用随机生成的浏览器 ID，不采集姓名、学号或 IP 到数据表。
- 用户填写的「其它版本」名称会公开展示在统计明细中，请勿填写个人信息。
- 票数保存在 Cloudflare D1，不依赖本地文件。

## 后续接入 MSPT

目前「服务器情况」明确显示暂无已开放世界，没有伪造在线数据。后续可由 Minecraft 服务端 mod 定时上报：

1. 每次上报写入各服务器的 TPS、在线人数、每小时 MSPT 聚合值。
2. 在 Worker 中增加服务器状态 API，并由前端轮询。
3. 将状态区从空状态切换为多服务器列表。

## License

未指定。公开使用前请补充 LICENSE。
