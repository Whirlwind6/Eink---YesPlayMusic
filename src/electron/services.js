import clc from 'cli-color';
// 这里只为触发副作用：模块加载时会在 tmpdir 建好 anonymous_token 文件，
// NCM API 的接口依赖它存在（上游写成具名导入，变量从未使用，lint 会报未使用变量）
import '../utils/checkAuthToken';
import server from '@neteaseapireborn/api/server';

export async function startNeteaseMusicApi() {
  // Let user know that the service is starting
  console.log(`${clc.redBright('[NetEase API]')} initiating NCM API`);

  // Load the NCM API.
  await server.serveNcmApi({
    port: 10754,
    moduleDefs: require('../ncmModDef'),
  });
}
