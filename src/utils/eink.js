/**
 * 墨水屏（E-Ink）适配总开关。
 *
 * 设计原则与安卓版一致：**不重排布局、不动交互**，只做三件减法——
 *   1. 配色：纯白底 + 纯黑字 + 黑色单色强调色；
 *   2. 图片：封面/头像不加载，位置上不留占位块；
 *   3. 效果：关掉模糊、渐变、投影、半透明层（墨水屏上这些都会变成脏灰带）。
 *
 * 关掉本开关即可回到上游原样：`EINK = false`，样式与逻辑同时失效。
 */

export const EINK = true;

/**
 * 默认界面缩放。
 *
 * 墨水屏设备（尤其 10~13 寸）在 100% 下正文 16px 偏大、一屏信息量偏少，
 * 90% 后行距与字号都更接近阅读密度，同时不会让 12px 的次级文字糊掉。
 */
export const EINK_ZOOM_FACTOR = 0.9;

/** 设置页可选的缩放档位。低于 0.8 时 12px 文字会掉到 10px，墨水屏上不可读。 */
export const EINK_ZOOM_OPTIONS = [0.8, 0.9, 1, 1.1, 1.25];

/**
 * 当前应使用的缩放值。
 *
 * 读 localStorage 而不是 store，是因为它要在 `new Vue()` 之前就生效，
 * 否则页面会先按 100% 画一帧再跳变。
 */
export function resolveZoomFactor() {
  if (!EINK) return 1;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem('settings') || '{}'
    )?.zoomFactor;
    if (typeof saved === 'number' && saved > 0.5 && saved < 2) return saved;
  } catch (e) {
    // localStorage 被清空或内容损坏时回落到默认值，不阻断启动
  }
  return EINK_ZOOM_FACTOR;
}
