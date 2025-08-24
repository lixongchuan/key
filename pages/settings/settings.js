// 文件路径: pages/settings/settings.js (重构版)
const app = getApp(); // 获取App实例，用于全局变量通信

Page({
  data: {
    biometricsEnabled: false,
    canUseBiometric: false,
    enrolled: false
  },
  onShow() {
    // 读取生物识别开关
    const enabled = wx.getStorageSync('biometrics_enabled') || false;
    this.setData({ biometricsEnabled: !!enabled });

    // 检测设备支持与是否已录入
    wx.checkIsSupportSoterAuthentication({
      success: (res) => {
        const modes = res.supportMode || [];
        const canUse = modes.length > 0;
        if (!canUse) {
          this.setData({ canUseBiometric: false, enrolled: false });
          return;
        }
        const mode = modes[0];
        wx.checkIsSoterEnrolledInDevice({
          checkAuthMode: mode,
          success: (r) => this.setData({ canUseBiometric: true, enrolled: !!r.isEnrolled }),
          fail: () => this.setData({ canUseBiometric: true, enrolled: false })
        });
      },
      fail: () => this.setData({ canUseBiometric: false, enrolled: false })
    });
    this.setData({
      biometricsEnabled: wx.getStorageSync('biometrics_enabled') || false
    });
  },

  // 设置页开关回调（wxml 中 switch 的 bindchange 指向此函数）
  onToggleBiometrics(e) {
    const wantEnable = !!e.detail.value;
    const openid = wx.getStorageSync('wx_openid') || '';

    // 基本校验：需要设备支持且已录入
    if (!this.data.canUseBiometric) {
      wx.showToast({ title: '设备不支持生物识别', icon: 'none' });
      this.setData({ biometricsEnabled: false });
      wx.setStorageSync('biometrics_enabled', false);
      return;
    }
    if (!this.data.enrolled) {
      wx.showToast({ title: '请先在系统录入指纹/面容', icon: 'none' });
      this.setData({ biometricsEnabled: false });
      wx.setStorageSync('biometrics_enabled', false);
      return;
    }

    if (wantEnable) {
      if (!openid) {
        // 如果没有openid，生成一个模拟的（生产环境需要真实微信登录）
        const newOpenid = 'sim_' + Math.random().toString(36).substr(2, 9);
        wx.setStorageSync('wx_openid', newOpenid);
      }

      // 检查是否已经启用过生物识别
      const bioUnlockKey = `bio_unlock_${openid}`;
      const existingBioUnlock = wx.getStorageSync(bioUnlockKey);

      if (existingBioUnlock) {
        // 已经启用过了，只需要打开总开关
        wx.setStorageSync('biometrics_enabled', true);
        this.setData({ biometricsEnabled: true });
        wx.showToast({ title: '生物识别解锁已开启', icon: 'success' });
      } else {
        // 尚未启用，静默启用（按用户要求）
        this.enableBiometricsSilently();
      }
    } else {
      // 关闭：清理持久凭据与会话密钥
      try {
        if (openid) wx.removeStorageSync(`bio_unlock_${openid}`);
        wx.removeStorageSync('current_session_key');
      } catch (e) {}
      wx.setStorageSync('biometrics_enabled', false);
      this.setData({ biometricsEnabled: false });
      wx.showToast({ title: '已关闭生物解锁', icon: 'none' });
    }
  },

  // 静默启用生物识别（不弹出验证窗口，不跳转页面）
  enableBiometricsSilently() {
    try {
      const sessionKey = app.globalData.sessionKey;
      if (!sessionKey) {
        wx.showToast({ title: '会话已过期，请重新登录', icon: 'none' });
        // 不跳转，让用户手动处理
        return;
      }

      const openid = wx.getStorageSync('wx_openid') || '';

      // 生成设备盐
      let deviceSalt = wx.getStorageSync('bio_device_salt');
      if (!deviceSalt) {
        deviceSalt = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        wx.setStorageSync('bio_device_salt', deviceSalt);
      }

      // 加密主密钥
      const { deriveKey, encrypt } = require('../../utils/crypto-helper.js');
      const BIO_KDF_TAG = 'bio.unlock.fixed.tag.v1';
      const kbio = deriveKey(BIO_KDF_TAG, deviceSalt);
      const enc_km = encrypt(sessionKey, kbio);

      // 保存生物识别凭据
      const record = {
        enc_km,
        createdAt: Date.now(),
        version: 1
      };
      wx.setStorageSync(`bio_unlock_${openid}`, JSON.stringify(record));

      // 开启生物识别总开关
      wx.setStorageSync('biometrics_enabled', true);
      this.setData({ biometricsEnabled: true });

      wx.showToast({ title: '生物识别解锁已开启', icon: 'success' });

    } catch (e) {
      console.error('启用生物识别失败:', e);
      wx.showToast({ title: '启用失败，请重试', icon: 'none' });
    }
  },
  
  // 【已实现】账户中心入口
  goToAccountCenter() {
    wx.navigateTo({ url: '/pages/settings/account-center/account-center' });
  },

  // 【已实现】修改主密码入口
  goToSecurityPage() {
    wx.navigateTo({ url: '/pages/settings/change-master/change-master' });
  },

  goToDataManagement() {
    // 将goToDataManagement指向新的数据管理页面
    wx.navigateTo({ url: '/pages/settings/data-management' });
  },
  goToTrashPage() {
    wx.navigateTo({ url: '/pages/trash/trash' });
  },
  goToAboutPage() {
    wx.navigateTo({ url: '/pages/settings/about/about' });
  }
});
