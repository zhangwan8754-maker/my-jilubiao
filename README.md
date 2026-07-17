# 留痕 · 个人记录反馈系统

纯记录、零目标压力：随手记一笔，自动写入本地文件并多端同步；复盘页用日历标记点回看每个月的轨迹。

纯静态应用（HTML + CSS + 原生 JS），无构建、无后端、无账号。数据 100% 归你自己。

> 设计稿：[Claude Design · 本地记录同步系统设计](https://claude.ai/design/p/ad8bffad-59a6-4d7e-b038-8219d31ee801)

## 我们的小想法（双人共享，`us/` 子应用）

`us/` 目录是一个独立的小应用：**两个人共用的小想法流**，与留痕的个人数据完全隔离。
部署后访问 `https://<你的用户名>.github.io/my-jilubiao/us/`（本地则 `http://localhost:8000/us/`）。

用法：一人在 Gitee（国内直连）或 GitHub 创建一个只勾 `gists` 权限的令牌，**把同一个令牌发给对方，两人各自粘贴登录**，即共用同一份私密云端数据——都能看到、都能写、都能编辑。首次登录各选一个名字和颜色，想法自动署名；支持 ❤️ 回应、互相回复、编辑删除，手机可「添加到主屏幕」装成独立 App（PWA，离线可用）。

同步规则：想法正文按条「新者胜」，❤️ 按人合并、回复按条合并，两人同时操作互不覆盖；删除走墓碑标记（90 天后清理）。数据存在该账号的私密 Gist（`us-thoughts.json`），与留痕的 `records.json` 互不相干。

## 页面

| 页面 | 功能 |
| --- | --- |
| **今日** | 快速记录：选类别 → 写内容/分钟/指标 → 回车即保存；今日清单、本周点阵、本月小结 |
| **记录表** | 按月浏览，点击任意记录**行内直接编辑**（手机上弹出编辑面板），搜索、按类别筛选、导出 CSV |
| **复盘** | 月/季/年切换：日历标记点（可按类别筛选）、各类别天数与最长连续、近 12 周堆叠时长图、时间占比 |
| **类别** | 增删、改名、选色，默认健身/学习/写作/阅读 |

原则：记录只做反馈——不设目标、不打分、不推送提醒；所有改动**静默自动保存**（防抖 1 秒），界面只显示「已保存」。

## 快速开始

**在线用（推荐）**：仓库开启 GitHub Pages（Settings → Pages → Deploy from a branch → 选分支和 `/ (root)`），然后手机、电脑浏览器打开
`https://<你的用户名>.github.io/my-jilubiao/` 即可。手机上用「添加到主屏幕」可安装为 App（PWA，离线可用）。

**本地用**：目录下执行 `python3 -m http.server 8000`，浏览器打开 `http://localhost:8000`。
（直接双击 index.html 也能用，但 PWA / 本地文件连接等能力需要 http(s) 环境。）

## 数据保存在哪里？如何多设备同步？

数据始终先存在浏览器本地（localStorage），在此之上有三条同步通道，可以只用一条，也可以同时用：

### 1. 浏览器登录同步（推荐，手机电脑通用）

设置（侧栏底部状态区 / 手机端「已保存」标签）→「浏览器登录同步」：

- **Gitee 码云（国内推荐，无需翻墙）**：打开 [gitee.com/profile/personal_access_tokens/new](https://gitee.com/profile/personal_access_tokens/new) 创建私人令牌，**只勾选 `gists` 权限**，复制粘贴到应用里点「登录」即可。
- **GitHub**（适合能访问 GitHub 的环境）：[创建经典令牌](https://github.com/settings/tokens/new?scopes=gist&description=liuhen)，只勾选 `gist` 权限。

登录后数据自动保存到**你自己账号下的私密代码片段（Gist）**，别人看不到；换任何设备打开本页、粘贴同一个令牌登录，就能看到同样的数据。改动后 1 秒内上传，约每分钟自动拉取合并。令牌只保存在各设备浏览器本地。

> 提示：GitHub Pages（github.io）在国内部分网络下访问不稳定；如遇打不开，可把本仓库几个静态文件部署到任何国内可访问的静态空间（无构建步骤，原样上传即可），Gitee 登录同步照常工作。

### 2. 本地文件 records.json（桌面 Chrome / Edge）

侧栏底部 → 「存储与同步」→ 新建或连接 `records.json`。此后每次改动 **1 秒后自动写盘**，无需任何手动操作。

把这个文件放进 **iCloud Drive / 坚果云 / OneDrive / Dropbox 的同步目录**，多台电脑连接同一个文件，即得多设备同步。应用会定时检查文件变化并自动合并。

### 3. WebDAV（坚果云等）

设置里填 WebDAV 文件完整地址 + 账号密码，例如坚果云：

```
地址：https://dav.jianguoyun.com/dav/留痕/records.json
账号：你的坚果云邮箱
密码：坚果云「安全选项」里生成的应用密码
```

所有设备指向同一个文件即可互通。

> 注意：浏览器直连第三方 WebDAV 受 CORS 限制，若控制台提示跨域被拦截，可自建支持 CORS 的 WebDAV（如 [dufs](https://github.com/sigoden/dufs) `--allow-webdav --enable-cors`、alist），或将本应用与 WebDAV 部署在同一域名下。

### 合并规则

单文件 `records.json`；每条记录带 `updatedAt`，多端**按条目「新者胜」自动合并**，互不覆盖；删除通过墓碑标记同步（90 天后清理）。数据模型：

```json
{ "id": "uuid",
  "date": "2026-07-17", "time": "07:20",
  "cat": "健身", "note": "力量训练 · 推日",
  "min": 55, "metric": "卧推 60kg × 5×5",
  "updatedAt": 1784612400000 }
```

### 备份

侧栏「导出备份」随时导出完整 JSON；设置里可导入备份（自动合并，不覆盖）；记录表页可导出当月 CSV。

## 设计 Tokens

纸 `#FAF9F6` · 卡 `#FFFEFB` · 墨 `#1C1A17` · 灰 `#6F6858` · 线 `#EBE5D8`
健身 `#C0502C` · 学习 `#33587A` · 写作 `#4A7051` · 阅读 `#B07C2A`
标题 Noto Serif SC 900 · 正文 Noto Sans SC · 数字 IBM Plex Mono

## 文件结构

```
index.html            应用壳 + 全部样式
app.js                数据/同步引擎 + 四个页面
sw.js                 Service Worker（离线缓存）
manifest.webmanifest  PWA 清单
icons/                应用图标
```
