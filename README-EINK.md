# YesPlayMusic 墨水屏（E-Ink）适配说明

基于 YesPlayMusic **v0.4.11**（Vue 2 + Electron 13），当前版本号 `0.4.11-eink.2`。

---

## 一、这一版（第二轮）改了什么

| 你提的问题 | 原因 | 处理 |
|---|---|---|
| 主界面没有登录和设置入口 | `eink.scss` 里 `.avatar { display: none }`，而头像是上游**唯一**的用户菜单入口，隐藏后连带把登录/设置一起藏了 | 顶栏右侧补一排文字按钮：`登录`（已登录时变 `登出`）+ `设置` |
| 编译后必须安装 | 你跑的是上游 `Release` 工作流，它只归档 `*Setup*.exe`，那是 NSIS 安装包（`oneClick + perMachine`，默认装进 Program Files） | `win.target` 只留 `portable` + `zip`，删掉 `nsis`；CI 只出便携版 |
| 构建告警一堆 | 下游 action 仍跑 Node 20；第三方打包 action 用了废弃的 `::set-output`；3 处 `v-html`、4 处 prop 缺默认值 | 逐条处理，见第五节；现在 `eslint` 零告警 |
| Apple Music 歌单默认展示 | 上游默认 `showPlaylistsByAppleMusic: true` | 默认改 `false`，并做一次性迁移覆盖老存档 |

---

## 二、先说结论：封面可以直接去掉，不会留空

你担心"去掉封面后两个歌单间距变大"，这个担心成立，但原因不是封面本身。

YesPlayMusic 的封面全部是 `<img>` **用宽高比撑出来的**：

```scss
/* Cover.vue */
img { width: 100%; aspect-ratio: 1 / 1; }
```

外层 `.cover` / `.cover-container` 都没有写死高度。所以 `display: none` 之后容器会**自然塌陷为 0**，不会留下一个空白方块——这正是"只留文字"能成立的原因。

真正让间距显大的是两处固定值，已经一并收紧：

| 位置 | 上游 | 现在 |
|---|---|---|
| `CoverRow` 的 `gap` | `44px 24px`（给"封面 + 两行文字"留的呼吸） | `12px 20px` |
| 首页每个区块 `.index-row` | `margin-top: 54px` | `26px` |

> **没有选择"把封面占位调小"**：那需要把每个网格项从"上封面下文字"改成"左小图右文字"，等于重排 `CoverRow` 及其 10 个调用页面的布局，风险远高于收益。而"完全去掉 + 收紧间距"只动 CSS，一行结构都没改。

---

## 三、需求落地方式

### 1. 去深色

YesPlayMusic 的主题是 CSS 变量驱动（`:root` 浅色 / `[data-theme='dark']` 深色）。做法是三层：

- **JS 层**：`changeAppearance()` 里强制 `appearance = 'light'`，任何路径（系统深色、设置页选深色）都落回浅色；
- **变量层**：`eink.scss` 里把 `--color-body-bg` 等一组变量钉成纯白/纯黑，并额外覆盖 `body[data-theme='dark']` 与 `.lyrics-page[data-theme='dark']`（歌词页自己设了主题属性）；
- **设置页**：把已失效的"外观"和"主题颜色"两个下拉隐藏，避免用户以为坏了。

强调色从 `#335eea` 蓝改成 **纯黑**：6 套主题色在 16 级灰阶上都会被压成同一片中灰，白字压中灰对比度不足。

### 2. 去封面

| 位置 | 处理 |
|---|---|
| `Cover.vue`（首页/探索/歌手/专辑/搜索的封面网格，10 个页面共用） | `.cover { display: none }` 一处生效 |
| 曲目列表左侧缩略图（`TrackListItem`） | `.track > img` 隐藏，行高缩到文字高度 |
| 底部播放条 46px 封面 | 隐藏，歌名左移（连带清掉 `margin-left: 12px`） |
| 全屏播放页大封面（`lyrics.vue`） | 隐藏，同时关掉三种封面背景：模糊、旋转、取色渐变 |
| 专辑/歌手详情页头图 | 隐藏，清掉为它预留的 `margin-left: 56px` |
| 每日推荐 / 私人 FM 卡片 | 封面隐藏后卡片会变纯白「消失」，补 1px 描边 |

**没有做图片请求拦截**（区别于安卓版）：Electron 里封面是 `<img>`，`display:none` 后浏览器不会解码，但**仍会发请求**。彻底拦截要改 `utils/filters` 的 `resizeImage`，会波及登录二维码等本地图，本版没做。

### 3. 默认缩放 90%

```js
// background.js：窗口创建时就按 90% 排版，避免先画一帧 100% 再跳
webPreferences: { zoomFactor: 0.9 }

// main.js：Vue 挂载前再应用一次用户自定义值（存在 settings.zoomFactor）
webFrame.setZoomFactor(resolveZoomFactor())
```

用 `webFrame` 而不是 CSS `zoom`：前者是 Chromium 原生缩放，字体/间距/图标一起缩，且不会让 `position: fixed` 的顶栏底栏重新定位。

### 4. 缩放按钮

做成 **设置页 → 界面缩放** 下拉，5 档：80% / 90% / 100% / 110% / 125%，值写进 `settings.zoomFactor` 持久化。

没做顶栏 ± 按钮：会挤占导航区，且与窗口拖动区（`-webkit-app-region: drag`）冲突。

### 5. 登录 / 设置入口（本轮新增）

问题出在"头像被隐藏"这一步：上游把设置、登录、登出、GitHub 全塞在头像弹出的 `ContextMenu` 里，头像一 `display:none`，这个菜单就再也点不到了。

`Navbar.vue` 右侧新增一组文字按钮（只在 `EINK` 为真时渲染，非墨水屏构建完全不受影响）：

```
[搜索框]  昵称  登出  设置
```

- 未登录：`登录`（Electron 下进邮箱/手机号登录页，Web 下进账号页）；
- 已登录：显示昵称 + `登出`（点完会二次确认）；
- `设置` 常驻，直接进设置页；
- 按钮是 1px 黑描边 + 透明底，hover 只换成浅灰底，不加过渡动画（墨水屏上的动画会糊成灰影）。

### 6. 首页默认不显示 "by Apple Music"（本轮新增）

四处联动，缺一处都会漏：

| 位置 | 改动 |
|---|---|
| `store/initLocalStorage.js` | 默认值 `true` → `false` |
| `views/home.vue` | `v-if="settings.showPlaylistsByAppleMusic !== false"` → `=== true` |
| `views/settings.vue` | 开关的 getter 缺省值 `true` → `false` |
| `store/index.js` | **一次性迁移**：老版本已把 `true` 写进 localStorage，只改默认值对升级用户无效，所以首次启动强制置 `false` 并写 `einkDefaultsApplied` 标记，之后用户在设置里手动打开不会被反复覆盖 |

设置页里那个开关仍保留，想开随时能开。

---

## 四、便携版是怎么来的（本轮）

### 根因不在代码，在工作流

上游 `.github/workflows/build.yaml` 里产物只归档一种文件：

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: YesPlayMusic-win
    path: dist_electron/*Setup*.exe      # ← 只有安装包
```

你截图里的任务名 `release (windows-latest)` 就是这个工作流。`vue.config.js` 里其实一直有 `portable` 目标，只是 CI 没把它传上来，所以你只能拿到 `Setup.exe`（`nsis` 配置是 `oneClick: true, perMachine: true`，双击即静默装进 Program Files，观感就是"必须安装"）。

### 现在

`vue.config.js`：

```js
win: {
  target: [
    { target: 'portable', arch: ['x64'] },   // 单文件 exe，双击即用
    { target: 'zip',      arch: ['x64'] },   // 解压即用目录版，启动更快
  ],
  artifactName: 'YesPlayMusic-EInk-${version}-win-${arch}.${ext}',
}
```

- `nsis` 从 `win.target` 里删掉（配置块留着，加回去就能恢复安装包）；
- 产物名带 `EInk` 和 `win-x64`，不会再和 `Setup` 混在一起。

两个产物的差别：

| 文件 | 行为 |
|---|---|
| `YesPlayMusic-EInk-0.4.11-eink.2-win-x64.exe` | 单个 exe，双击直接跑。首次启动会自解压到 `%TEMP%`，之后复用缓存；不写注册表、不建快捷方式、不需要管理员 |
| `YesPlayMusic-EInk-0.4.11-eink.2-win-x64.zip` | 解压到任意目录，双击里面 `YesPlayMusic.exe`。**启动最快**，适合放固定位置 |

> 设置与歌曲缓存仍在 `%APPDATA%\YesPlayMusic`，不在程序目录——这样换版本不用重新登录。这个应用本身就会往本地缓存歌曲，做成"数据跟着 exe 走"意义不大。

### CI 工作流一并重写

只保留一个 `.github/workflows/build.yaml`：

- 矩阵从 mac/win/linux 三平台收成 `windows-latest` 单平台（mac/Linux 包你用不上，还拖慢 20 分钟）；
- 去掉 `samuelmeuli/action-electron-builder@v1.6.0`，直接 `yarn electron:build-win`（`-p never`，不发布）；
- 删掉 `build-win-eink.yml`（上一轮那个），避免 tag 触发时两个工作流同时跑；
- 删掉 `sync.yml`：它会每小时把上游 `master` 同步过来，一旦你的仓库被识别成 fork 就会**覆盖掉全部墨水屏改动**，对定制版是纯风险。

---

## 五、那 8 条告警逐条销账

| 告警 | 处理 |
|---|---|
| `Node.js 20 is deprecated`（checkout@v3 / setup-node@v3 / upload-artifact@v4 / action-electron-builder@v1.6.0） | 升到跑 Node 24 的主版本：`checkout@v5`、`setup-node@v5`、`upload-artifact@v6`；第三方打包 action 整个删掉。注意 `upload-artifact@v5` 仍声明 node20，必须 v6 |
| `set-output command is deprecated` | 该命令来自 `action-electron-builder` 和自写的 `get_unm_version` 步骤，两者都已删除，不再有 `::set-output` |
| `loginAccount.vue#L108 v-html` | 文案是 locale 里的静态字符串（含 `<br />` 和源码仓库链接），不含用户输入；用 `eslint-disable vue/no-v-html` 包住这一段并注明原因 |
| `CoverRow.vue#L33 v-html` | 副标题里的歌手名原本拼成 `<a href>` 字符串。改成 `artistInfo()` + `<router-link>`，顺带修掉"点歌手整页刷新" |
| `MvRow.vue#L23 v-html` | 同上，改成 `getArtist()` + `<router-link>` |
| `TrackListItem.vue#L100/101 prop 默认值` | `trackProp: { type: Object, default: () => ({}) }`、`trackNo: { type: Number, default: 0 }` |
| `MvRow.vue#L33 mvs 默认值` | `mvs: { type: Array, default: () => [] }` |
| `Modal.vue#L25 close 默认值` | `close: { type: Function, default: () => {} }` |

顺手还清了 6 个 `no-unused-vars` **error**（`background.js` 的 `second-instance` 回调参数、`ipcMain.js` 的 `removeProxy` 回调参数、`services.js` 里只为副作用而引入的 `checkAuthToken`）。这几处不影响 Electron 打包（主进程不走 lint），但会让 `yarn lint` 直接失败，一并处理了。

> 复查结果：`eslint --ext .js,.vue src` → **0 error 0 warning**；`prettier --check` 全过；6 个改动过的 `.vue` 模板用 `vue-template-compiler` 编译无错。

---

## 六、改动清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/utils/eink.js` | 新增 | `EINK` 开关、默认缩放、档位、`resolveZoomFactor()` |
| `src/assets/css/eink.scss` | 新增 | **适配主体**，规则全部挂在 `html.eink` 下 |
| `src/main.js` | 改 | 引入 eink.scss、加 `html.eink` class、启动时应用缩放 |
| `src/utils/common.js` | 改 | 强制浅色、强制纯黑强调色 |
| `src/components/Navbar.vue` | 改（本轮） | 补登录/登出/设置文字入口 + 昵称显示 |
| `src/store/initLocalStorage.js` | 改（本轮） | Apple Music 歌单默认 `false` |
| `src/store/index.js` | 改（本轮） | 老存档的一次性迁移（`einkDefaultsApplied` 标记） |
| `src/views/home.vue` | 改（本轮） | 区块条件改为严格 `=== true` |
| `src/views/settings.vue` | 改 | 隐藏外观/主题色；新增界面缩放；Apple Music 开关缺省值改 `false` |
| `src/views/loginAccount.vue` | 改（本轮） | `v-html` 加范围豁免注释 |
| `src/components/CoverRow.vue` | 改（本轮） | 歌手副标题改 `router-link` |
| `src/components/MvRow.vue` | 改（本轮） | 歌手副标题改 `router-link`；`mvs` 默认值 |
| `src/components/TrackListItem.vue` | 改（本轮） | `trackProp` / `trackNo` 默认值 |
| `src/components/Modal.vue` | 改（本轮） | `close` 默认值 |
| `src/background.js` | 改 | `zoomFactor: 0.9`、白底、关闭更新检查、未使用回调参数 |
| `src/electron/ipcMain.js`、`src/electron/services.js` | 改（本轮） | 清 `no-unused-vars` |
| `src/locale/lang/*.js` | 改 | 四语言补 `settings.zoom.text` |
| `vue.config.js` | 改（本轮） | win 只出 `portable` + `zip`，产物改名 |
| `.github/workflows/build.yaml` | 重写（本轮） | Windows 单平台便携版，替换废弃 action 与 `set-output` |
| `.github/workflows/build-win-eink.yml`、`sync.yml` | 删除（本轮） | 前者与 build.yaml 重复；后者会用上游覆盖定制改动 |
| `package.json` | 改 | 版本号 `0.4.11-eink.2` |

### 为什么关闭自动更新

上游的更新检查是「发现新版 → 弹窗引导去 GitHub 下载**官方安装包**」。本定制版的适配层不在上游里，装回官方版等于把适配整个覆盖掉；版本号也已与上游脱钩，继续比较只会天天弹同一个提示。所以 `checkForUpdates()` 里直接 return。

---

## 七、构建

推代码到任意分支就会自动构建（也可以 **Actions → Build Windows Portable (E-Ink) → Run workflow** 手动触发），跑完在 Artifacts 里下 `YesPlayMusic-EInk-win-portable`，里面就是上面那两个文件。

> 如果你的仓库里还留着上一轮推上去的 `.github/workflows/build-win-eink.yml`，记得删掉——本次源码里已经移除，但旧文件若还在，两个工作流会同时跑。

本地（Windows / Node 16）也可以：

```bash
yarn install
yarn electron:build-win
# 产物：dist_electron/YesPlayMusic-EInk-0.4.11-eink.2-win-x64.exe
#       dist_electron/YesPlayMusic-EInk-0.4.11-eink.2-win-x64.zip
```

> CI 用 Node 16（`engines` 要求 `14 || 16`）。Node 18+ 本地构建要 `yarn --ignore-engines`，并给 `vue-cli-service` 加 `NODE_OPTIONS=--openssl-legacy-provider`（webpack 4 的 md4 哈希在新 Node 上被移除）。

---

## 八、已知限制

1. **封面仍会发网络请求**（只是不解码、不显示）。彻底拦截需要改 `resizeImage`，会波及登录二维码等本地图。
2. **列表 hover 有 0.3s 过渡动画**，墨水屏上会有残影；全局关动效会影响路由转场与播放器反馈，暂未处理。
3. **缩放会同时缩放 1px 描边**（90% 下 0.9px，可能显示为更浅的灰线）。
4. `portable` 版每次启动要从 `%TEMP%` 校验/解压，冷启动比 `zip` 版慢 1~2 秒；在意启动速度就用 zip 版。
5. macOS / Linux 未做专门验证（本次 CI 也不再产出）。
