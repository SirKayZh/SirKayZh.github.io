# SirKayZh.github.io

个人开发者主页：集中展示开源项目并提供安装包下载。

**线上地址**：https://sirkayzh.github.io

## 当前收录

| 项目 | 说明 | 仓库 |
|---|---|---|
| MarkMate | 轻量 WYSIWYG Markdown 编辑器（macOS / Windows） | [SirKayZh/markmate](https://github.com/SirKayZh/markmate) |
| CloudDock | 多账号浏览器，同一网站同时登录多个账号 | [SirKayZh/clouddock](https://github.com/SirKayZh/clouddock) |
| 微信瘦身找回助手 | 微信重复文件清理与误删找回（即将开源） | 私有 |

## 架构（纯静态，零构建）

```
├── index.html                  # 首页：hero + 项目卡片（按访客系统自动匹配下载按钮）
├── projects/<slug>.html        # 详情页薄壳，共用 assets/app.js 渲染
├── assets/                     # 样式 + 渲染脚本 + 图标截图
├── data/
│   ├── projects.json           # 手写项目元信息（介绍/特性/截图/FAQ/下载匹配规则）
│   └── releases.json           # 自动生成：各仓库最新 Release（勿手改）
├── scripts/update_releases.py  # 拉 GitHub API 生成 releases.json（本地/CI 通用）
└── .github/workflows/update-releases.yml  # 每天北京时间 10:17 自动同步
```

## 数据流

1. 在各项目仓库正常发 Release（dmg / exe）
2. 本站 Action 每天（或手动 workflow_dispatch）运行 `update_releases.py`，把最新版本号、资产列表、更新日志写入 `data/releases.json` 并自动 commit
3. 页面 fetch 两个 JSON 渲染 —— **发新版本无需改本仓库任何代码**

新增项目：在 `data/projects.json` 加一条（含 slug / repo / downloads 匹配规则），建 `projects/<slug>.html` 薄壳即可。

## 本地预览

```bash
python3 -m http.server 8765
# 打开 http://localhost:8765
```

## 下载匹配规则

`downloads` 按访客平台（WebGL 探测 Apple Silicon）选主下载资产；`.blockmap`、`latest*.yml`、`*-update.zip`（应用内自更新包）自动排除。

## 注意

- 仓库 Settings → Pages → Source 选 **Deploy from a branch / main / (root)** 即可上线
- 微信瘦身找回助手仓库为私有，其 release 拉取 404 会被脚本容错为 `null`，页面自动显示「即将开源」
