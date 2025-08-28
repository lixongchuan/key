const app = getApp(); // 获取App实例，用于全局变量通信

Page({
  data: {
    biometricsEnabled: false,
    canUseBiometric: false,
    enrolled: false
  },
  onShow() {
    // 读取生物识别开关
    const enabled = wx.getStorageSync('biometrics_enabled') !== null ? wx.getStorageSync('biometrics_enabled') : true;
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
          success: (r) => {
            const enrolled = !!r.isEnrolled;
            this.setData({ canUseBiometric: true, enrolled });

    // 如果开关默认开启且已录入生物信息，必须有sessionKey，但还没有生物识别凭据，则静默启用
    if (enabled && enrolled && app.globalData.sessionKey) {
      const openid = wx.getStorageSync('wx_openid') || '';
      const hasBioCredential = !!wx.getStorageSync(`bio_unlock_${openid}`);

      if (!hasBioCredential) {
        console.log('检测到生物识别开关开启但缺少凭据，开始自动启用...');
        this.autoEnableBiometricsIfNeeded();
      } else {
        console.log('生物识别凭据已存在，无需自动启用');
      }
    }
          },
          fail: () => this.setData({ canUseBiometric: true, enrolled: false })
        });
      },
      fail: () => this.setData({ canUseBiometric: false, enrolled: false })
    });
    this.setData({
      biometricsEnabled: wx.getStorageSync('biometrics_enabled') !== null ? wx.getStorageSync('biometrics_enabled') : true
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

  // 自动检查并静默启用生物识别（当开关默认开启且满足条件时使用）
  autoEnableBiometricsIfNeeded() {
    try {
      console.log('开始检查是否需要自动启用生物识别...');

      const sessionKey = app.globalData.sessionKey;
      if (!sessionKey) {
        console.log('❌ 没有有效的sessionKey，跳过自动启用生物识别');
        return;
      }

      // 确保openid存在，如果不存在则生成一个
      let openid = wx.getStorageSync('wx_openid') || '';
      if (!openid) {
        console.log('📝 openid不存在，生成新的openid');
        openid = 'sim_' + Math.random().toString(36).substr(2, 9);
        wx.setStorageSync('wx_openid', openid);
        console.log('✅ 已生成并保存新的openid:', openid);
      }

      // 检查是否已经存在生物识别凭据
      const existingBioUnlock = wx.getStorageSync(`bio_unlock_${openid}`);
      if (existingBioUnlock) {
        console.log('✅ 生物识别凭据已存在，无需自动启用');
        return;
      }

      console.log('🔄 满足条件，开始自动静默启用生物识别...');

      // 生成设备盐
      let deviceSalt = wx.getStorageSync('bio_device_salt');
      if (!deviceSalt) {
        deviceSalt = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        wx.setStorageSync('bio_device_salt', deviceSalt);
        console.log('📝 已生成新的设备盐');
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

      // 确保总开关也开启
      wx.setStorageSync('biometrics_enabled', true);
      this.setData({ biometricsEnabled: true });

      console.log('✅ 生物识别已自动启用完成');

      // 记录审计日志
      app.addAuditLog('auto_enable_biometrics', '设置页面自动启用生物识别');

    } catch (e) {
      console.error('❌ 自动启用生物识别失败:', e);
      // 静默失败，不打扰用户，但可以重试一次
      setTimeout(() => {
        this.retryAutoEnableBiometrics();
      }, 2000);
    }
  },

  // 重试自动启用生物识别
  retryAutoEnableBiometrics() {
    try {
      console.log('🔄 重试自动启用生物识别...');

      const sessionKey = app.globalData.sessionKey;
      const openid = wx.getStorageSync('wx_openid') || '';

      if (!sessionKey || !openid) {
        console.log('重试条件不满足，放弃重试');
        return;
      }

      const existingBioUnlock = wx.getStorageSync(`bio_unlock_${openid}`);
      if (existingBioUnlock) {
        console.log('重试时发现凭据已存在');
        return;
      }

      // 重新生成设备盐和凭据
      let deviceSalt = wx.getStorageSync('bio_device_salt');
      if (!deviceSalt) {
        deviceSalt = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        wx.setStorageSync('bio_device_salt', deviceSalt);
      }

      const { deriveKey, encrypt } = require('../../utils/crypto-helper.js');
      const BIO_KDF_TAG = 'bio.unlock.fixed.tag.v1';
      const kbio = deriveKey(BIO_KDF_TAG, deviceSalt);
      const enc_km = encrypt(sessionKey, kbio);

      const record = {
        enc_km,
        createdAt: Date.now(),
        version: 1
      };
      wx.setStorageSync(`bio_unlock_${openid}`, JSON.stringify(record));

      wx.setStorageSync('biometrics_enabled', true);
      this.setData({ biometricsEnabled: true });

      console.log('✅ 重试自动启用生物识别成功');

    } catch (e) {
      console.error('❌ 重试自动启用生物识别失败:', e);
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
