# YesPlayMusic 墨水屏（E-Ink）适配说明

版本 `0.4.11-eink.3`｜源码目录 `ypm-eink/`｜产物 `YesPlayMusic-EInk-0.4.11-eink.3-win-x64.zip`

本轮只解决四件事，其余部分与上一版一致：

| 反馈 | 处理 | 涉及文件 |
|---|---|---|
| 只留 zip 产物 | `win.target` 只保留 `zip`，CI 只归档 zip | `vue.config.js`、`.github/workflows/build.yaml` |
| 扫码登录显示不出二维码 | 二维码改 PNG 纯黑白、固定尺寸、失败可重试；补上 `os=pc` 设备标识 | `views/loginAccount.vue`、`api/auth.js` |
| 去掉「默认关闭 Apple Music 歌单」 | 默认值、首页条件、设置页 getter 全部回滚，并清掉上一版写进存档的 `false` | `store/*`、`views/home.vue`、`views/settings.vue` |
| 内存占用偏大 | 关 GPU 加速、关拼写检查、跳过封面取色（三处低风险改动） | `background.js`、`FMCard.vue`、`lyrics.vue` |

---

## 一、二维码为什么显示不出来

先做了路径排查：把 NCM API 单进程起在 10754、按应用的方式套一层 `express-http-proxy`，用应用里一模一样的请求打 `/api/login/qr/key`，返回是正常的：

```json
{"data":{"code":200,"unikey":"a8b9ed95-…"},"code":200}
```

把渲染层单独构建出来在 Chromium 里跑，二维码**能**画出来，但你那版画出来是这个样子：`#335eea` 的蓝色码点，压在 `#ededed` 的浅灰卡片上，`192px`、SVG 里是 **1px 描边**画出来的格子。灰度墨水屏上蓝色只剩三成黑，再叠一层抗锯齿，就是一片看不清的灰。所以问题不是「没生成」，而是「生成了，但在你的屏幕上看不见」。

另外查到一个更要命的问题：网易云在 2025 年中改过扫码接口，请求里不带设备标识时，轮询接口 `/login/qr/check` 直接返回 `404 Not Found`——**手机扫了也不会有任何反应**。带上 `os=pc` 就正常返回 `801 等待扫码`：

```
GET /login/qr/check?key=…&cookie=os%3Dpc                       → {"code":404,"msg":"Not Found"}
GET /login/qr/check?key=…&cookie=os%3Dpc%3B%20appver%3D8.9.70  → {"code":801,"message":"等待扫码"}
```

也就是说，上一版即使二维码看得见，扫码也是白扫。两处都改了。

### 改法

`api/auth.js`——key 和 check 用同一串设备 cookie，否则会话对不上：

```js
const QR_DEVICE_COOKIE = 'os=pc; appver=8.9.70';
```

`views/loginAccount.vue`——`QRCode.toString`（SVG）换成 `QRCode.toDataURL`（PNG）：

| | 上一版 | 现在 |
|---|---|---|
| 格式 | SVG data URI，1px 描边 | PNG，440px 位图 |
| 颜色 | `#335eea` 蓝 / 透明底 | `#000000` 纯黑 / `#ffffff` 纯白 |
| 白边 | `margin: 0`（没有静区） | `margin: 4`（4 个模块的静区，扫码器需要） |
| 显示尺寸 | 192px，`loading="lazy"` | 220px，固定宽高，随页面缩放 |
| 失败时 | 空白灰框，控制台一行错误 | 灰框里给「获取失败，点击重试」按钮 + 文字提示 |

顺手补了两处：取码失败后切到手机登录再切回来会重新取码（原来只重启轮询，永远好不了）；`checkQrCodeLogin` 只在拿到 key 之后才启动。

> 实测截图见 `登录页-二维码效果.png`。这是构建产物在 Chromium 里的实际渲染，不是设计稿。

## 二、只出 zip

`vue.config.js`：

```js
win: {
  target: [{ target: 'zip', arch: ['x64'] }],
  artifactName: 'YesPlayMusic-EInk-${version}-win-${arch}.${ext}',
}
```

`portable` 和 `nsis` 都从 target 里拿掉了（`nsis` 配置块留着，要恢复安装包把它加回 target 即可）。

CI 的归档步骤同步收窄：

```yaml
- name: 归档
  uses: actions/upload-artifact@v6
  with:
    name: YesPlayMusic-EInk-win-zip
    path: dist_electron/*-win-x64.zip
```

产物 `YesPlayMusic-EInk-0.4.11-eink.3-win-x64.zip` 解压后直接双击里面的 `YesPlayMusic.exe`，不写注册表、不建快捷方式，也不往 `%TEMP%` 解压自身，所以启动比单文件版快。

## 三、Apple Music 歌单恢复默认显示

上一版加的「默认关闭」整个去掉了，四处全部回滚到上游：

| 位置 | 现在 |
|---|---|
| `store/initLocalStorage.js` | `showPlaylistsByAppleMusic: true` |
| `views/home.vue` | `v-if="settings.showPlaylistsByAppleMusic !== false"` |
| `views/settings.vue` | getter 缺省值 `true` |
| `store/index.js` | 删掉强制关闭的迁移 |

设置页里那个开关保留，你想关随时关。

**额外处理了一个坑**：上一版会把 `false` 写进 localStorage 并且打上 `einkDefaultsApplied` 标记。只改默认值的话，你机器上那份存档仍然是 `false`，首页还是不出来。所以留了六行一次性清理：看到那个标记且值是 `false`，就把这条设置删掉、让默认值生效，然后销毁标记。只认这个标记，不会动更早版本里你自己关掉的值。

## 四、内存占用

先说结论：**能省一点，但省不到「小一半」那种程度**。这个应用的大头不在界面。

### 做了三件事（都是低风险）

1. **关掉 GPU 硬件加速**（`background.js` 里 `app.disableHardwareAcceleration()`）。Windows 上直接少一个 GPU 进程，任务管理器从 5 个进程变 4 个，通常能省 80–150MB。墨水屏界面全是纯色块、没有动画，软件光栅化完全够用；模糊和半透明在前几轮已经全部去掉了，不依赖 GPU 合成。
   *副作用：MV 走软解，CPU 会高一些。这个设备上基本不看 MV。*
2. **关掉拼写检查**（`webPreferences.spellcheck: false`）。Electron 会为它常驻加载 hunspell 词典，约 30–60MB。这个应用只有搜索框和登录框，用不上。
3. **跳过封面取色**（`FMCard.vue`、`lyrics.vue` 里给 `getColor` / `getCoverColor` 加了 `if (EINK) return`）。`node-vibrant` 每次换歌都会起一个 Web Worker、解一张 512×512 的封面来算渐变色——而这两个地方的渐变早就被 `eink.scss` 关成纯白了，纯属白算。

合计估计 **130–200MB**，占总量两成上下。这个数是按 Electron 进程结构估的，不是在你机器上实测的——我这边没有 Windows 环境跑它。

### 没做的事，以及为什么

| 想法 | 能省 | 为什么不建议 |
|---|---|---|
| 干掉内置的 NCM API 服务 | 200–300MB | 它跑在主进程里，承载所有在线功能。删掉等于只能听本地文件 |
| 去掉 `@unblockneteasemusic/rust-napi` 原生模块 | 50–100MB | 灰歌替换全靠它，去掉后大量歌不能播 |
| 路由改懒加载、组件按需引入 | 20–40MB | 要动几十个文件，收益不成比例，回归风险高 |
| 限制 V8 堆大小 | 0（只是提前 OOM） | 只会让它在大列表页崩掉 |

如果你觉得 130–200MB 这个量级不值得承担「万一把 GPU 关掉有渲染问题」的风险，把 `background.js` 里那行 `app.disableHardwareAcceleration()` 删掉就回到原状，其余两处可以留着——它们没有可见副作用。

---

## 五、前面几轮已经做过的（保持不动）

- **去封面**：`.cover` 等 8 类元素 `display:none`，容器没有固定高度会自然塌陷，不留空位；网格间距从 `44px` 收到 `12px`。
- **去深色**：`appearance` 锁 `light`，`data-theme="dark"` 的局部变量统一覆盖；弹层改成白底黑边、去掉毛玻璃。
- **默认缩放 90%**：`webPreferences.zoomFactor` 给初值，避免先画 100% 再跳变。
- **设置页缩放控件**：80/90/100/110/125 五档，存 `settings.zoomFactor`。
- **登录 / 设置入口**：`.avatar` 被隐藏后原版菜单没有入口，顶栏右侧补了文字按钮（未登录「登录」、已登录「昵称 / 登出」，右侧固定「设置」）。
- **关掉自动更新**：`EINK_BUILD` 时跳过 `checkForUpdates()`。

## 六、改动清单（相对上一版）

```
.github/workflows/build.yaml  |  17 +++----   只归档 zip
package.json                  |   2 +-        0.4.11-eink.3
src/api/auth.js               |  12 +++++     os=pc 设备标识
src/background.js             |  13 +++++     关 GPU 加速、关拼写检查
src/components/FMCard.vue     |   4 ++        跳过封面取色
src/store/index.js            |  16 +++----   删强制关闭，加一次性清理
src/store/initLocalStorage.js |   4 +-        默认值回 true
src/views/home.vue            |   2 +-        条件回滚
src/views/loginAccount.vue    | 104 ++++++++++++++++++++++-----   二维码
src/views/lyrics.vue          |   4 ++        跳过封面取色
src/views/settings.vue        |   3 +-        getter 缺省值回 true
vue.config.js                 |  13 ++----    win.target 只留 zip
```

补丁：`ypm-eink-round3.patch`（相对上一版的增量，12 文件 141 行）、`ypm-eink.patch`（相对上游 master 的全量）。

## 七、构建

推到自己的仓库，**Actions → Build Windows Zip (E-Ink) → Run workflow**（push 任意分支也会自动跑），跑完在 Artifacts 里下 `YesPlayMusic-EInk-win-zip`。

- 只跑 `windows-latest`，不需要 mac / ubuntu
- 用的是 `yarn electron:build-win`，不依赖那个已经停更的第三方打包 action
- 需要 `.env` 里的 `VUE_APP_ELECTRON_API_URL=/api` 等几个变量，工作流里已经用 `env:` 直接给了，不用再 `cp .env.example .env`

本地（Windows / Node 16）也可以：

```bash
yarn install
yarn electron:build-win
# 产物：dist_electron/YesPlayMusic-EInk-0.4.11-eink.3-win-x64.zip
```

## 八、已知限制

- 封面只是**不显示**，网络请求还在发（`node-vibrant` 那两处已经跳过，其余列表页仍会下载封面图）。要彻底不发请求得动图片加载层，收益是流量不是内存。
- 列表项的 hover 过渡（0.3s）没有关，墨水屏上是一道灰影，不影响使用。
- 二维码用手机扫的时候把前光调亮一点成功率更高；这是墨水屏的固有问题，不是二维码本身。
- 网易云接口随时可能再变。如果哪天扫码又不行了，先用「手机 / 邮箱登录」顶一下；`os=pc` 这个标识如果失效，改 `src/api/auth.js` 里的 `QR_DEVICE_COOKIE` 一处即可。
