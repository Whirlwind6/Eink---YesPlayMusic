import Vue from 'vue';
import VueGtag from 'vue-gtag';
import App from './App.vue';
import router from './router';
import store from './store';
import i18n from '@/locale';
import '@/assets/icons';
import '@/utils/filters';
import './registerServiceWorker';
import { dailyTask } from '@/utils/common';
import '@/assets/css/global.scss';
// 【墨水屏】适配样式层，全部规则挂在 html.eink 下；必须排在 global.scss 之后，
// 才能覆盖同优先级的变量与组件样式。
import '@/assets/css/eink.scss';
import { EINK, resolveZoomFactor } from '@/utils/eink';
import NProgress from 'nprogress';
import '@/assets/css/nprogress.css';

window.resetApp = () => {
  localStorage.clear();
  indexedDB.deleteDatabase('yesplaymusic');
  document.cookie.split(';').forEach(function (c) {
    document.cookie = c
      .replace(/^ +/, '')
      .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
  });
  return '已重置应用，请刷新页面（按Ctrl/Command + R）';
};
console.log(
  '如出现问题，可尝试在本页输入 %cresetApp()%c 然后按回车重置应用。',
  'background: #eaeffd;color:#335eea;padding: 4px 6px;border-radius:3px;',
  'background:unset;color:unset;'
);

Vue.use(
  VueGtag,
  {
    config: { id: 'G-KMJJCFZDKF' },
  },
  router
);
Vue.config.productionTip = false;

// 【墨水屏】给根元素打标记，CSS 层全部挂在 html.eink 下。
// 放在这里（而不是 index.html）是为了让开关仍由 JS 常量控制。
if (EINK) document.documentElement.classList.add('eink');

/**
 * 【墨水屏】启动即应用界面缩放。
 *
 * 用 webFrame 而不是改 CSS zoom：webFrame 是 Chromium 原生缩放，会同时缩
 * 字体、间距、图标，且不产生额外的层叠上下文（CSS zoom 会让 position:fixed
 * 的顶栏/底栏定位错位）。必须在 Vue 挂载前调用，否则会先按 100% 画一帧再跳变。
 */
if (EINK && process.env.IS_ELECTRON === true) {
  try {
    window.require('electron').webFrame.setZoomFactor(resolveZoomFactor());
  } catch (e) {
    console.warn('[eink] 界面缩放初始化失败，保持默认比例', e);
  }
}

NProgress.configure({ showSpinner: false, trickleSpeed: 100 });
dailyTask();

new Vue({
  i18n,
  store,
  router,
  render: h => h(App),
}).$mount('#app');
