<template>
  <div class="login">
    <div class="login-container">
      <div class="section-1">
        <img src="/img/logos/netease-music.png" />
      </div>
      <div class="title">{{ $t('login.loginText') }}</div>
      <div class="section-2">
        <div v-show="mode === 'phone'" class="input-box">
          <div
            class="container"
            :class="{ active: ['phone', 'countryCode'].includes(inputFocus) }"
          >
            <svg-icon icon-class="mobile" />
            <div class="inputs">
              <input
                id="countryCode"
                v-model="countryCode"
                :placeholder="
                  inputFocus === 'countryCode' ? '' : $t('login.countryCode')
                "
                @focus="inputFocus = 'countryCode'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
              <input
                id="phoneNumber"
                v-model="phoneNumber"
                :placeholder="inputFocus === 'phone' ? '' : $t('login.phone')"
                @focus="inputFocus = 'phone'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
            </div>
          </div>
        </div>

        <div v-show="mode === 'email'" class="input-box">
          <div class="container" :class="{ active: inputFocus === 'email' }">
            <svg-icon icon-class="mail" />
            <div class="inputs">
              <input
                id="email"
                v-model="email"
                type="email"
                :placeholder="inputFocus === 'email' ? '' : $t('login.email')"
                @focus="inputFocus = 'email'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
            </div>
          </div>
        </div>
        <div v-show="mode !== 'qrCode'" class="input-box">
          <div class="container" :class="{ active: inputFocus === 'password' }">
            <svg-icon icon-class="lock" />
            <div class="inputs">
              <input
                id="password"
                v-model="password"
                type="password"
                :placeholder="
                  inputFocus === 'password' ? '' : $t('login.password')
                "
                @focus="inputFocus = 'password'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
            </div>
          </div>
        </div>

        <div v-show="mode == 'qrCode'">
          <div v-show="qrCodeImage" class="qr-code-container">
            <!-- 用 PNG 而不是 SVG data URI：上游那版是 1px 描边的 SVG，
                 缩放后容易被抗锯齿糊掉；墨水屏上更需要实心黑块 + 纯白底。
                 尺寸固定 220，不随窗口变化，扫码成功率才稳。 -->
            <img
              class="qr-code-image"
              :src="qrCodeImage"
              width="220"
              height="220"
            />
          </div>
          <div v-show="!qrCodeImage" class="qr-code-container qr-code-empty">
            <button
              class="qr-code-retry"
              :disabled="qrCodeLoading"
              @click="getQrCodeKey"
            >
              {{ qrCodeLoading ? '正在获取二维码…' : '获取失败，点击重试' }}
            </button>
          </div>
          <div class="qr-code-info">
            {{ qrCodeInformation }}
          </div>
        </div>
      </div>
      <div v-show="mode !== 'qrCode'" class="confirm">
        <button v-show="!processing" @click="login">
          {{ $t('login.login') }}
        </button>
        <button v-show="processing" class="loading" disabled>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
      <div class="other-login">
        <a v-show="mode !== 'email'" @click="changeMode('email')">{{
          $t('login.loginWithEmail')
        }}</a>
        <span v-show="mode === 'qrCode'">|</span>
        <a v-show="mode !== 'phone'" @click="changeMode('phone')">{{
          $t('login.loginWithPhone')
        }}</a>
        <span v-show="mode !== 'qrCode'">|</span>
        <a v-show="mode !== 'qrCode'" @click="changeMode('qrCode')">
          二维码登录
        </a>
      </div>
      <!-- 下面是 locale 里的静态文案（内含 <br /> 与源码仓库链接），不含任何用户输入，
           拆成结构化节点要同步改四种语言、收益不抵成本，故按可信模板处理。 -->
      <!-- eslint-disable vue/no-v-html -->
      <div
        v-show="mode !== 'qrCode'"
        class="notice"
        v-html="isElectron ? $t('login.noticeElectron') : $t('login.notice')"
      ></div>
      <!-- eslint-enable vue/no-v-html -->
    </div>
  </div>
</template>

<script>
import QRCode from 'qrcode';
import md5 from 'crypto-js/md5';
import NProgress from 'nprogress';
import { mapMutations } from 'vuex';
import { setCookies } from '@/utils/auth';
import nativeAlert from '@/utils/nativeAlert';
import {
  loginWithPhone,
  loginWithEmail,
  loginQrCodeKey,
  loginQrCodeCheck,
} from '@/api/auth';

export default {
  name: 'Login',
  data() {
    return {
      processing: false,
      mode: 'qrCode',
      countryCode: '+86',
      phoneNumber: '',
      email: '',
      password: '',
      smsCode: '',
      inputFocus: '',
      qrCodeKey: '',
      qrCodeImage: '',
      qrCodeLoading: true,
      qrCodeCheckInterval: null,
      qrCodeInformation: '打开网易云音乐APP扫码登录',
    };
  },
  computed: {
    isElectron() {
      return process.env.IS_ELECTRON;
    },
  },
  created() {
    if (['phone', 'email', 'qrCode'].includes(this.$route.query.mode)) {
      this.mode = this.$route.query.mode;
    }
    this.getQrCodeKey();
  },
  beforeDestroy() {
    clearInterval(this.qrCodeCheckInterval);
  },
  methods: {
    ...mapMutations(['updateData']),
    validatePhone() {
      if (
        this.countryCode === '' ||
        this.phone === '' ||
        this.password === ''
      ) {
        nativeAlert('国家区号或手机号不正确');
        this.processing = false;
        return false;
      }
      return true;
    },
    validateEmail() {
      const emailReg =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      if (
        this.email === '' ||
        this.password === '' ||
        !emailReg.test(this.email)
      ) {
        nativeAlert('邮箱不正确');
        return false;
      }
      return true;
    },
    login() {
      if (this.mode === 'phone') {
        this.processing = this.validatePhone();
        if (!this.processing) return;
        loginWithPhone({
          countrycode: this.countryCode.replace('+', '').replace(/\s/g, ''),
          phone: this.phoneNumber.replace(/\s/g, ''),
          password: 'fakePassword',
          md5_password: md5(this.password).toString(),
        })
          .then(this.handleLoginResponse)
          .catch(error => {
            this.processing = false;
            nativeAlert(`发生错误，请检查你的账号密码是否正确\n${error}`);
          });
      } else {
        this.processing = this.validateEmail();
        if (!this.processing) return;
        loginWithEmail({
          email: this.email.replace(/\s/g, ''),
          password: 'fakePassword',
          md5_password: md5(this.password).toString(),
        })
          .then(this.handleLoginResponse)
          .catch(error => {
            this.processing = false;
            nativeAlert(`发生错误，请检查你的账号密码是否正确\n${error}`);
          });
      }
    },
    handleLoginResponse(data) {
      if (!data) {
        this.processing = false;
        return;
      }
      if (data.code === 200) {
        setCookies(data.cookie);
        this.updateData({ key: 'loginMode', value: 'account' });
        this.$store.dispatch('fetchUserProfile').then(() => {
          this.$store.dispatch('fetchLikedPlaylist').then(() => {
            this.$router.push({ path: '/library' });
          });
        });
      } else {
        this.processing = false;
        nativeAlert(data.msg ?? data.message ?? '账号或密码错误，请检查');
      }
    },
    getQrCodeKey() {
      this.qrCodeLoading = true;
      this.qrCodeImage = '';
      return loginQrCodeKey()
        .then(result => {
          if (result.code !== 200 || !result.data?.unikey) {
            this.qrCodeInformation = '二维码获取失败，请检查网络后重试';
            return;
          }
          this.qrCodeKey = result.data.unikey;
          this.checkQrCodeLogin();
          // 生成位图：宽度给到 440（显示 220 的两倍），高分屏下模块边缘才不糊。
          // 黑白两色是为了墨水屏——上游的 #335eea 在灰度面板上只有三成黑，
          // 扫描器读起来吃力，这里直接钉成纯黑纯白。
          return QRCode.toDataURL(
            `https://music.163.com/login?codekey=${this.qrCodeKey}`,
            {
              width: 440,
              margin: 4,
              errorCorrectionLevel: 'M',
              color: {
                dark: '#000000ff',
                light: '#ffffffff',
              },
            }
          )
            .then(url => {
              this.qrCodeImage = url;
              // 重试成功、或旧码过期换新码之后，把上次的提示语换回正常文案
              this.qrCodeInformation = '打开网易云音乐APP扫码登录';
            })
            .catch(err => {
              console.error(err);
              this.qrCodeInformation = '二维码生成失败，点击重试';
            })
            .finally(() => {
              NProgress.done();
            });
        })
        .catch(err => {
          console.error(err);
          this.qrCodeInformation = '二维码获取失败，请检查网络后重试';
        })
        .finally(() => {
          this.qrCodeLoading = false;
        });
    },
    checkQrCodeLogin() {
      // 清除二维码检测
      clearInterval(this.qrCodeCheckInterval);
      this.qrCodeCheckInterval = setInterval(() => {
        if (this.qrCodeKey === '') return;
        loginQrCodeCheck(this.qrCodeKey).then(result => {
          if (result.code === 800) {
            this.getQrCodeKey(); // 重新生成QrCode
            this.qrCodeInformation = '二维码已失效，请重新扫码';
          } else if (result.code === 802) {
            this.qrCodeInformation = '扫描成功，请在手机上确认登录';
          } else if (result.code === 801) {
            this.qrCodeInformation = '打开网易云音乐APP扫码登录';
          } else if (result.code === 803) {
            clearInterval(this.qrCodeCheckInterval);
            this.qrCodeInformation = '登录成功，请稍等...';
            result.code = 200;
            result.cookie = result.cookie.replaceAll(' HTTPOnly', '');
            this.handleLoginResponse(result);
          }
        });
      }, 1000);
    },
    changeMode(mode) {
      this.mode = mode;
      if (mode === 'qrCode') {
        // 之前没取到图（断网、接口抽风）时，切回来要重新取，不能只重启轮询
        if (this.qrCodeImage) {
          this.checkQrCodeLogin();
        } else {
          this.getQrCodeKey();
        }
      } else {
        clearInterval(this.qrCodeCheckInterval);
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.login {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 32px;
}

.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 48px;
  color: var(--color-text);
}

.section-1 {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  img {
    height: 64px;
    margin: 20px;
    user-select: none;
  }
}

.section-2 {
  display: flex;
  align-items: center;
  flex-direction: column;
}

.input-box {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
  color: var(--color-text);

  .container {
    display: flex;
    align-items: center;
    height: 46px;
    background: var(--color-secondary-bg);
    border-radius: 8px;
    width: 300px;
  }

  .svg-icon {
    height: 18px;
    width: 18px;
    color: #aaaaaa;
    margin: {
      left: 12px;
      right: 6px;
    }
  }

  .inputs {
    display: flex;
    width: 85%;
  }

  input {
    font-size: 20px;
    border: none;
    background: transparent;
    width: 100%;
    font-weight: 600;
    margin-top: -1px;
    color: var(--color-text);
  }

  input::placeholder {
    color: var(--color-text);
    opacity: 0.38;
  }

  input#countryCode {
    flex: 3;
  }
  input#phoneNumber {
    flex: 12;
  }

  .active {
    background: var(--color-primary-bg);
    input,
    .svg-icon {
      color: var(--color-primary);
    }
  }
}

.confirm button {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: 8px;
  margin-top: 24px;
  transition: 0.2s;
  padding: 8px;
  width: 100%;
  width: 300px;
  &:hover {
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.94);
  }
}

.other-login {
  margin-top: 24px;
  font-size: 13px;
  color: var(--color-text);
  opacity: 0.68;
  a {
    padding: 0 8px;
  }
}

.notice {
  width: 300px;
  border-top: 1px solid rgba(128, 128, 128);
  margin-top: 48px;
  padding-top: 12px;
  font-size: 12px;
  color: var(--color-text);
  opacity: 0.48;
}

@keyframes loading {
  0% {
    opacity: 0.2;
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0.2;
  }
}

button.loading {
  height: 44px;
  cursor: unset;
  &:hover {
    transform: none;
  }
}
.loading span {
  width: 6px;
  height: 6px;
  background-color: var(--color-primary);
  border-radius: 50%;
  margin: 0 2px;
  animation: loading 1.4s infinite both;
}

.loading span:nth-child(2) {
  animation-delay: 0.2s;
}

.loading span:nth-child(3) {
  animation-delay: 0.4s;
}

.qr-code-container {
  background-color: var(--color-primary-bg);
  padding: 24px 24px 21px 24px;
  border-radius: 1.25rem;
  margin-bottom: 12px;
}
/* 二维码本体：固定 220，白底，别让它被压缩或拉伸 */
.qr-code-image {
  display: block;
  width: 220px;
  height: 220px;
  background-color: #ffffff;
}
/* 还没取到图时的占位：尺寸和上面一致，避免加载完成后页面跳一下 */
.qr-code-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 220px;
}
.qr-code-retry {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  background: transparent;
  border: 1px solid var(--color-text);
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}
.qr-code-retry:disabled {
  cursor: default;
  opacity: 0.6;
}
.qr-code-info {
  color: var(--color-text);
  text-align: center;
  margin-bottom: 28px;
}
</style>
