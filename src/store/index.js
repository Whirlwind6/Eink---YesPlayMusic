import Vue from 'vue';
import Vuex from 'vuex';
import state from './state';
import mutations from './mutations';
import actions from './actions';
import { changeAppearance, changeThemeColor } from '@/utils/common';
import { EINK } from '@/utils/eink';
import Player from '@/utils/Player';
// vuex 自定义插件
import saveToLocalStorage from './plugins/localStorage';
import { getSendSettingsPlugin } from './plugins/sendSettings';

Vue.use(Vuex);

let plugins = [saveToLocalStorage];
if (process.env.IS_ELECTRON === true) {
  let sendSettings = getSendSettingsPlugin();
  plugins.push(sendSettings);
}
const options = {
  state,
  mutations,
  actions,
  plugins,
};

const store = new Vuex.Store(options);

// 【墨水屏】首页 "by Apple Music" 歌单默认关闭。
// 新装用户由 initLocalStorage 的默认值兜住；但老版本已经把 true 写进 localStorage，
// 直接改默认值对升级用户无效，所以这里做一次性迁移：
//   首次启动 → 强制关掉并打标记；之后用户在设置里手动打开，不会被再次覆盖。
if (EINK && localStorage.getItem('einkDefaultsApplied') !== '1') {
  if (store.state.settings.showPlaylistsByAppleMusic !== false) {
    store.commit('updateSettings', {
      key: 'showPlaylistsByAppleMusic',
      value: false,
    });
  }
  localStorage.setItem('einkDefaultsApplied', '1');
}

if ([undefined, null].includes(store.state.settings.lang)) {
  const defaultLang = 'en';
  const langMapper = new Map()
    .set('zh', 'zh-CN')
    .set('zh-TW', 'zh-TW')
    .set('en', 'en')
    .set('tr', 'tr');
  store.state.settings.lang =
    langMapper.get(
      langMapper.has(navigator.language)
        ? navigator.language
        : navigator.language.slice(0, 2)
    ) || defaultLang;
  localStorage.setItem('settings', JSON.stringify(store.state.settings));
}

changeAppearance(store.state.settings.appearance);
changeThemeColor(store.state.settings.themeColor);

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (store.state.settings.appearance === 'auto') {
      changeAppearance(store.state.settings.appearance);
      changeThemeColor(store.state.settings.themeColor);
    }
  });

let player = new Player();
player = new Proxy(player, {
  set(target, prop, val) {
    // console.log({ prop, val });
    target[prop] = val;
    if (prop === '_howler') return true;
    target.saveSelfToLocalStorage();
    target.sendSelfToIpcMain();
    return true;
  },
});
store.state.player = player;

export default store;
