# BJUT-MC

北京工业大学 Minecraft 社区服务器网站：共享公告、版本与玩法统计、服务器状态。

前端是纯 HTML / CSS / JS，统计后端使用 Node.js 内置模块，**没有第三方依赖**。

![BJUT-MC 首页](preview/light-hero.png)

![公告与统计](preview/dark-notices.png)

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

## 目录

```text
.
├── index.html          页面结构
├── styles.css          页面样式
├── script.js           主题、公告弹窗、统计交互
├── server.js           静态文件服务 + 统计 API
├── favicon.svg
├── data/votes.json     运行时生成，不提交到 Git
└── preview/            预览截图
```

## 本地运行

需要 Node.js 18 或更高版本。

```powershell
npm start
```

打开 <http://127.0.0.1:8787>。

> 不要直接双击 `index.html`。静态页面能打开，但统计接口不可用，必须通过 `server.js` 访问。

环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 对外提供服务时可设为 `0.0.0.0` |
| `DATA_FILE` | `data/votes.json` | 投票数据文件路径 |

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

用于确认服务是否在运行。

## 部署说明

**GitHub Pages 只能托管静态文件，无法运行 `server.js`，因此统计功能不可用。** 需要部署到支持 Node.js 的平台或自己的服务器，例如 VPS、Railway、Render 等。

部署时注意：

1. 设置 `HOST=0.0.0.0`，否则外部无法访问。
2. 为 `data/` 挂载持久磁盘，或把 `DATA_FILE` 指向持久目录；否则平台重新部署后会丢失投票数据。
3. 正式环境建议放在 Nginx / Caddy 后面并启用 HTTPS。
4. 如果访问量变大，可以把 JSON 存储替换为 SQLite 或 PostgreSQL。

## 数据与隐私

- 只保存随机生成的无意义浏览器 ID，不采集姓名、学号或 IP 到数据文件。
- 用户填写的「其它版本」名称会公开展示在统计明细中，请勿填写个人信息。
- 重置统计：停止服务，删除 `data/votes.json`，重新启动。

## 后续接入 MSPT

目前「服务器情况」明确显示暂无已开放世界，没有伪造在线数据。后续可由 Minecraft 服务端 mod 定时上报：

1. 每次上报写入各服务器的 TPS、在线人数、每小时 MSPT 聚合值。
2. 在本服务增加服务器状态 API，并由前端轮询。
3. 将状态区从空状态切换为多服务器列表。

## License

未指定。公开使用前请补充 LICENSE。
