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

// 【墨水屏】清理上一版遗留的「默认关闭 Apple Music 歌单」。
// 那个特性已经移除，默认值回到上游的 true。但上一版把 false 写进了 localStorage，
// 只改默认值对已经跑过那一版的人无效——所以看到标记就把这条设置删掉，让默认值生效。
// 只认标记，不会动更早版本里用户自己关掉的值。
if (EINK && localStorage.getItem('einkDefaultsApplied') === '1') {
  if (store.state.settings.showPlaylistsByAppleMusic === false) {
    store.commit('updateSettings', {
      key: 'showPlaylistsByAppleMusic',
      value: undefined,
    });
  }
  localStorage.removeItem('einkDefaultsApplied');
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
