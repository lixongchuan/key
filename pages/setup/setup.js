// 文件路径: pages/setup/setup.js
// 这是确保功能正常的最终版本

const app = getApp(); // 确保app对象被正确引用
const { deriveKey, encrypt } = require('../../utils/crypto-helper.js');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // UI 状态
    showPassword: false,
    showConfirmPassword: false,
    canSubmit: false, // 满足最低规则后启用按钮（最佳实践）

    // 用于强制重新渲染input框
    passwordInputKey: 0,
    confirmPasswordInputKey: 0,

    // 实时规则提示
    strengthSuggestions: [
      { text: '长度至少8位', satisfied: false },
      { text: '包含数字 (0-9)', satisfied: false },
      { text: '包含小写字母 (a-z)', satisfied: false },
      { text: '包含大写字母 (A-Z)', satisfied: false },
      { text: '包含特殊符号 (!@#$)', satisfied: false }
    ],
    strengthLevel: '', // weak/medium/strong

    // 双输入绑定，便于即时校验
    masterPassword: '',
    confirmPassword: ''
  },

  /**
   * 切换密码输入框的显示/隐藏状态
   */
  toggleShowPassword() {
    const newValue = !this.data.showPassword;
    // 使用更彻底的强制重新渲染方法
    const newKey = this.data.passwordInputKey + 1;
    this.setData({
      showPassword: newValue,
      passwordInputKey: newKey
    });

    // 强制页面重新渲染
    this.forceRerender('password', newValue, newKey);
  },

  toggleShowConfirm() {
    const newValue = !this.data.showConfirmPassword;
    // 使用更彻底的强制重新渲染方法
    const newKey = this.data.confirmPasswordInputKey + 1;
    this.setData({
      showConfirmPassword: newValue,
      confirmPasswordInputKey: newKey
    });

    // 强制页面重新渲染
    this.forceRerender('confirm', newValue, newKey);
  },

  /**
   * 强制页面重新渲染
   */
  forceRerender(type, showValue, keyValue) {
    // 使用多重setTimeout确保页面完全更新
    setTimeout(() => {
      this.setData({
        [type === 'password' ? 'showPassword' : 'showConfirmPassword']: showValue,
        [type === 'password' ? 'passwordInputKey' : 'confirmPasswordInputKey']: keyValue + 1
      });
    }, 5);

    setTimeout(() => {
      this.setData({
        [type === 'password' ? 'passwordInputKey' : 'confirmPasswordInputKey']: keyValue + 2
      });
    }, 15);

    // 最后一次强制更新，确保状态正确
    setTimeout(() => {
      const finalKey = keyValue + 3;
      this.setData({
        [type === 'password' ? 'passwordInputKey' : 'confirmPasswordInputKey']: finalKey
      });
    }, 30);
  },

  /**
   * 密码输入框内容变化时触发，实时评估密码强度并更新建议
   */
  onPasswordInput(e) {
    const password = e.detail.value;
    this.setData({ masterPassword: password });
    this.evaluateStrengthAndToggle(password);
  },

  onConfirmInput(e) {
    this.setData({ confirmPassword: e.detail.value });
    // 同步更新可提交态
    this.evaluateStrengthAndToggle(this.data.masterPassword);
  },

  evaluateStrengthAndToggle(password) {
    const suggestions = this.data.strengthSuggestions.map(s => ({ ...s }));
    suggestions[0].satisfied = password.length >= 8;
    suggestions[1].satisfied = /[0-9]/.test(password);
    suggestions[2].satisfied = /[a-z]/.test(password);
    suggestions[3].satisfied = /[A-Z]/.test(password);
    suggestions[4].satisfied = /[^a-zA-Z0-9]/.test(password);

    const satisfiedCount = suggestions.filter(s => s.satisfied).length;
    let strengthLevel = '';
    if (!password) strengthLevel = '';
    else if (satisfiedCount < 3) strengthLevel = 'weak';
    else if (satisfiedCount < 5) strengthLevel = 'medium';
    else strengthLevel = 'strong';

    // 创建按钮放宽为：长度>=8 且 两次一致（按你的新要求）
    const basicOk = suggestions[0].satisfied;
    const confirmOk = this.data.confirmPassword && this.data.confirmPassword === password;

    this.setData({
      strengthSuggestions: suggestions,
      strengthLevel,
      canSubmit: !!(basicOk && confirmOk)
    });
  },

  /**
   * 表单提交事件
   * (此函数逻辑无变化)
   */
  handleSetup(e) {
    // 采用受控数据，避免需失焦才生效的问题
    const masterPassword = this.data.masterPassword;
    const confirmPassword = this.data.confirmPassword;

    if (!masterPassword || !confirmPassword) {
      return wx.showToast({ title: '密码不能为空', icon: 'none' });
    }
    if (masterPassword.length < 8) {
      return wx.showToast({ title: '密码长度至少8位', icon: 'none' });
    }
    if (masterPassword !== confirmPassword) {
      return wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
    }

    if (this.data.strengthLevel === 'weak') {
      wx.showModal({
        title: '密码较弱',
        content: '建议使用更复杂的密码以提升安全性。是否继续创建？',
        success: (res) => {
          if (res.confirm) this.performSetup(masterPassword);
        }
      });
    } else {
      this.performSetup(masterPassword);
    }
  },

  /**
   * 执行实际的密码库设置和加密存储操作
   * (此函数逻辑无变化)
   */
  performSetup(masterPassword) {
    wx.showLoading({ title: '正在创建加密库...' });

    // 我们使用上一轮修复后的加密逻辑
    const salt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const encryptionKey = deriveKey(masterPassword, salt);
    const validatorText = "CODE_SAFE_VALIDATOR_TEXT";
    const encryptedValidator = encrypt(validatorText, encryptionKey);
    const initialVault = encrypt(JSON.stringify([]), encryptionKey);

    try {
      // 兼容旧键（仍写入，避免其它页面尚在读取）
      wx.setStorageSync('user_salt', salt);
      wx.setStorageSync('validator', encryptedValidator);
      wx.setStorageSync('vault', initialVault);
      wx.setStorageSync('is_initialized', true);

      // 写入统一元信息（供解锁页使用）
      const meta = {
        saltBase64: salt,               // 与 deriveKey 使用的盐一致
        kdfIters: 10000,
        verifier: encrypt('verify::ok', encryptionKey),
        last_master_change_at: Date.now()
      };
      wx.setStorageSync('vault_meta', JSON.stringify(meta));

      app.globalData.sessionKey = encryptionKey; // 将会话密钥存入全局变量
      app.globalData.isLocked = false; // 标记为已解锁

      wx.hideLoading();
      app.addAuditLog('change_master_password', '首次设置主密码'); // 记录日志

      // 默认开启生物识别总开关（开箱即用），后续将引导完成启用流程
      wx.setStorageSync('biometrics_enabled', true);

      // 创建成功后：直接进入首页，在首页自动启用生物识别
      wx.showToast({
        title: '创建成功！',
        icon: 'success',
        duration: 1200,
        mask: true,
        complete: () => {
          setTimeout(() => {
            wx.switchTab({ url: '/pages/index/index' });
          }, 900);
        }
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '加密失败，请重试', icon: 'error' });
      console.error("初始化存储失败: ", err);
      app.addAuditLog('login_fail', '主密码设置失败'); // 记录失败日志
    }
  }
});
