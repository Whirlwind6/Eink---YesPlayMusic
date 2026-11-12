# YesPlayMusic 墨水屏（E-Ink）适配说明

版本 `0.4.11-eink.4`｜源码目录 `ypm-eink/`｜产物 `YesPlayMusic-EInk-0.4.11-eink.4-win-x64.zip`

本轮三件事：

| 反馈 | 处理 | 涉及文件 |
|---|---|---|
| 连不上网：首页没歌单、登录不了 | **根因：请求 baseURL 是空的**，所有接口在发出前就抛错。已加 `/api` 兜底 | `src/utils/request.js`、`src/background.js` |
| 去掉 rust-napi 解锁模块 | 整条解灰链路、依赖、CI 步骤、设置页 UI 全部移除 | 11 个文件，-576 行 |
| 只出 zip | 上一轮已完成，本轮不变 | — |

> **先纠正上一轮的判断。** 上次你说二维码不显示，我归因于「蓝色 SVG 在灰阶屏上看不清」，改成了纯黑白 PNG。那个改动是必要的，但**不是根因**——这一轮才查清楚：**整个应用的请求一条都没发出去**，二维码只是最先暴露的地方。所以上一版改完二维码你还是登不上，因为取码请求本身就失败了。

---

## 一、真正的原因：所有接口都没发出去

`src/utils/request.js` 里：

```js
let baseURL = '';
if (process.env.IS_ELECTRON) {
  if (process.env.NODE_ENV === 'production') {
    baseURL = process.env.VUE_APP_ELECTRON_API_URL;   // ← 构建时注入，可能是 undefined
  }
  ...
}
```

`VUE_APP_ELECTRON_API_URL` 不是运行时读的配置，是 **webpack 在打包时把字面量烧进代码**的。而这个仓库的 `.gitignore` 里写着 `.env`（上游为了不泄露 Last.fm key 一直这么做），所以只要构建环境没显式传这个变量，表达式就会变成 `baseURL = undefined`。

接下来是致命的一步——请求拦截器：

```js
if (baseURL.length) {   // undefined.length → TypeError
```

axios 的请求拦截器里抛错，**请求根本不会发出去**，异常直接被 reject 回调用方。于是：

| 页面 | 表现 |
|---|---|
| 首页 | `getPersonalizedPlaylist` 全部失败 → 一个歌单都没有 |
| 搜索 | 无结果 |
| 登录页 | 取不到 `unikey` → 二维码空白 |
| 设置页 | 正常（不联网） |

这跟你描述的完全一致：「不仅无法登录，似乎也连接不上网络，主界面完全没有歌单」。而你下载的原版正常，是因为官方 release 是在带 `env:` 的 CI 里构建的，那个值烧进去的是 `/api`。

### 改法

```js
baseURL = process.env.VUE_APP_ELECTRON_API_URL || '/api';
```

`'/api'` 在这里永远正确：窗口本身就是由主进程里那个 express 在 `127.0.0.1:27232` 提供的，它把 `/api` 反代到 `127.0.0.1:10754` 的 NCM 服务。用相对路径还能顺带免疫端口被改的情况。dev 分支和 web 分支也各加了兜底，避免同一个坑再踩一次。

另外给主进程的 API 启动挂了 `catch`：

```js
this.neteaseMusicAPI = startNeteaseMusicApi()
  .then(() => log('NCM API ready on 127.0.0.1:10754'))
  .catch(err => log(`NCM API failed to start: ${err?.message ?? err}`));
```

原来这行是裸调用，服务起不来只会变成一条 unhandled rejection，日志里什么都看不到——排查时会误以为是网络问题。现在启动成功或失败都有一行明确的日志。

### 怎么验证的

这次构建**故意把 `.env` 移走、`VUE_APP_*` 一个都不传**，然后按应用的方式把产物挂起来跑：

```bash
node -e "require('@neteaseapireborn/api/server').serveNcmApi({port:10754, moduleDefs: require('./src/ncmModDef')})"
# express 静态托管 dist + /api 反代到 10754
```

结果首页歌单、每日推荐、私人 FM 全部正常，登录页二维码正常出图（见 `首页-歌单正常.png`、`登录页-二维码效果.png`）。也就是说：**即使构建环境一个变量都没给，包也能用**。

## 二、二维码（上一轮的改动，保留）

虽然根因在上面，这两个改动仍然必要：

1. **格式**：`QRCode.toString`（SVG，1px 描边）换成 `QRCode.toDataURL`（PNG，440px、纯黑 `#000000`、纯白底、`margin: 4` 静区），显示固定 220px。灰阶屏上 1px 描边的 SVG 会糊成一片灰。
2. **设备标识**：网易云 2025 年中改过扫码接口，不带设备标识时轮询直接 404：

```
GET /login/qr/check?key=…&cookie=os%3Dpc                       → {"code":404,"msg":"Not Found"}
GET /login/qr/check?key=…&cookie=os%3Dpc%3B%20appver%3D8.9.70  → {"code":801,"message":"等待扫码"}
```

`src/api/auth.js` 里的 `QR_DEVICE_COOKIE = 'os=pc; appver=8.9.70'`，key 和 check 用同一串，否则会话对不上。

失败时灰框里给「获取失败，点击重试」按钮，切换登录方式再切回来也会重新取码。

## 三、去掉 rust-napi 解锁模块

原版的「解除网易云音乐限制」（灰歌换音源）靠 `@unblockneteasemusic/rust-napi`——一个几十兆的原生 `.node`，由主进程常驻加载。

### 删了什么

| 位置 | 内容 |
|---|---|
| `src/electron/ipcMain.js` | `import UNM`、`new UNM.Executor()`、`ipcMain.handle('unblock-music')` 整个 handler，以及只服务于它的 `toBuffer` / `getBiliVideoFile` / `parseSourceStringToList`（-127 行） |
| `src/utils/Player.js` | `_getAudioSourceFromUnblockMusic()` 整个方法，播放源回退链去掉这一环（-81 行） |
| `package.json` | `@unblockneteasemusic/rust-napi` 依赖 |
| `vue.config.js` | `externals` 里的对应项 |
| `.github/workflows/build.yaml` | 「补装 Windows 版解锁模块」整个步骤（原来要给 CI 单独装 `win32-x64-msvc` 变体） |
| `src/views/settings.vue` | UnblockNeteaseMusic 整块配置 UI（音源、FLAC、搜索模式、joox/QQ cookie、yt-dlp、代理），以及 8 个 computed（-272 行） |
| `src/store/initLocalStorage.js` | `enableUnblockNeteaseMusic` 默认值 |

`yarn.lock` 同步更新，`@unblockneteasemusic/rust-napi` 已经一处不剩（`grep -c` 为 0）。

### 影响

- **灰歌**（无版权 / VIP 专属）不再找替代音源，直接试听片段或者跳过。列表里这类歌会显示成灰色，`TrackListItem.vue` 的判断已改成恒 `true`（原来依赖那个被删掉的设置项）。
- 设置页不再有 UnblockNeteaseMusic 区块，其余设置项位置不变。
- `@neteaseapireborn/api` 自己还依赖一个**纯 JS** 的 `@unblockneteasemusic/server`（2MB），但它只在你显式传 `unblock=true` 时才会被 require，且已不再拉 rust-napi。留着不影响内存，删了反而可能要改 API 包的内部逻辑，所以没动。

## 四、只出 zip（上一轮已完成）

```js
win: {
  target: [{ target: 'zip', arch: ['x64'] }],
  artifactName: 'YesPlayMusic-EInk-${version}-win-${arch}.${ext}',
}
```

`portable` 和 `nsis` 都从 target 里拿掉了（`nsis` 配置块留着，要恢复安装包把它加回 target 即可）。CI 归档只收 `dist_electron/*-win-x64.zip`。

解压后直接双击 `YesPlayMusic.exe`，不写注册表、不建快捷方式，也不往 `%TEMP%` 解压自身。

## 五、内存占用

### 已经做了的

| 改动 | 估计省 | 副作用 |
|---|---|---|
| `app.disableHardwareAcceleration()`，Windows 上少一个 GPU 进程（5 → 4） | 80–150MB | MV 走软解，CPU 略高 |
| `webPreferences.spellcheck: false`，不加载 hunspell 词典 | 30–60MB | 无（只有搜索框和登录框） |
| `FMCard` / `lyrics` 跳过 `node-vibrant` 取色 | 30–50MB | 无（那两处渐变早已被 CSS 关成纯白） |
| **去掉 rust-napi 原生模块**（本轮） | 50–100MB | 灰歌不能换源 |

合计估计 **180–300MB**。这个数是按 Electron 进程结构估的，不是在你机器上实测——我这边没有 Windows 环境。

### 没做的

| 想法 | 能省 | 为什么不动 |
|---|---|---|
| 干掉内置的 NCM API 服务 | 200–300MB | 它承载所有在线功能，删了等于只能听本地文件 |
| 路由懒加载、组件按需引入 | 20–40MB | 要动几十个文件，回归风险不成比例 |
| 限制 V8 堆大小 | 0 | 只是把 OOM 提前 |

如果关掉 GPU 加速后觉得渲染有异常，删掉 `background.js` 里 `app.disableHardwareAcceleration()` 那一行就回原状，其余几处没有可见副作用。

## 六、前面几轮已经做过的（保持不动）

- **去封面**：`.cover` 等 8 类元素 `display:none`，容器没有固定高度会自然塌陷，不留空位；网格间距从 `44px` 收到 `12px`。
- **去深色**：`appearance` 锁 `light`，`data-theme="dark"` 的局部变量统一覆盖；弹层改成白底黑边、去掉毛玻璃。
- **默认缩放 90%**：`webPreferences.zoomFactor` 给初值，避免先画 100% 再跳变。
- **设置页缩放控件**：80/90/100/110/125 五档，存 `settings.zoomFactor`。
- **登录 / 设置入口**：`.avatar` 被隐藏后原版菜单没有入口，顶栏右侧补了文字按钮（未登录「登录」、已登录「昵称 / 登出」，右侧固定「设置」）。
- **关掉自动更新**：`EINK_BUILD` 时跳过 `checkForUpdates()`。
- **Apple Music 歌单默认显示**（上一轮回滚）。

## 七、改动清单（相对上一版 eink.3）

```
.github/workflows/build.yaml     |  11 +-     删掉补装解锁模块的步骤
package.json                     |   3 +-     0.4.11-eink.4，删 rust-napi
src/background.js                |  11 +-     API 启动加 then/catch 日志
src/components/TrackListItem.vue |   5 +-     灰歌样式恒显示
src/electron/ipcMain.js          | 127 +----   删 unblock-music
src/store/initLocalStorage.js    |   1 -      删 enableUnblockNeteaseMusic
src/utils/Player.js              |  81 +----   删解灰链路
src/utils/request.js             |  20 ++-    baseURL 兜底
src/views/settings.vue           | 272 +-----  删 UnblockNeteaseMusic 配置区
vue.config.js                    |   1 -      删 externals
yarn.lock                        |  84 +----   同步
```

补丁：`ypm-eink-round4.patch`（相对 eink.3 的增量，11 文件 +40/-576）、`ypm-eink.patch`（相对上游 master 的全量）。
两个都做过 `git apply` + 全目录 `diff` 比对，与 `ypm-eink/` 逐字节一致。

## 八、构建

推到自己的仓库，**Actions → Build Windows Zip (E-Ink) → Run workflow**（push 任意分支也会自动跑），跑完在 Artifacts 里下 `YesPlayMusic-EInk-win-zip`。

- 只跑 `windows-latest`，不需要 mac / ubuntu
- 用 `yarn electron:build-win`，不依赖那个已经停更的第三方打包 action
- 工作流里仍然用 `env:` 给了 `VUE_APP_ELECTRON_API_URL=/api` 等几个变量（Last.fm 需要 key），但**现在即使漏了也不会白屏**，只是 Last.fm 授权会失效

本地（Windows / Node 16）也可以：

```bash
yarn install
yarn electron:build-win
# 产物：dist_electron/YesPlayMusic-EInk-0.4.11-eink.4-win-x64.zip
```

## 九、已知限制

- **灰歌不能播放**：这是本轮去掉 rust-napi 的代价，无解。
- 封面只是**不显示**，网络请求还在发（`node-vibrant` 那两处已跳过取色，其余列表页仍会下载封面图）。
- 列表项 hover 的 0.3s 过渡没关，墨水屏上是一道灰影，不影响使用。
- 二维码建议把前光调亮再扫，这是墨水屏的固有问题。
- 网易云接口随时可能再变。扫码若再失效，先用「手机 / 邮箱登录」顶一下；`os=pc` 这串在 `src/api/auth.js` 的 `QR_DEVICE_COOKIE`，改一处即可。
- 如果哪天又出现「页面全空」，先看主进程日志有没有 `NCM API ready on 127.0.0.1:10754`；没有就是端口被占或服务起不来，不是网络问题。
