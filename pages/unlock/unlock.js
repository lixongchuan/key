// 文件路径: pages/unlock/unlock.js
const app = getApp(); // 获取App实例，用于全局变量通信
const { deriveKey, decrypt, encrypt } = require('../../utils/crypto-helper.js');

Page({
  data: {
    showBiometricButton: false, // 控制生物识别按钮的显示
    showPassword: false,        // 显示/隐藏密码输入
    isAutoTriedBio: false       // 本次进入是否已自动尝试过生物识别，避免重复弹出
  },

  onShow() {
    // 每次从后台唤醒时，都应该检查是否需要锁定
    if (!app.globalData.isLocked && app.globalData.sessionKey) {
      this.unlockSuccess();
      return;
    }

    // 如果App是锁定状态，重置锁定状态，进入解锁流程
    app.globalData.isLocked = true;

    // 允许外部通过参数触发自动启用或自动解锁
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    const options = (current && current.options) || {};
    const autoEnableBio = options.autoEnableBio === '1';

    // 检查是否显示生物识别按钮，并优先自动尝试
    const biometricsEnabled = wx.getStorageSync('biometrics_enabled');

    // 简化生物识别检查流程，避免复杂的异步嵌套
    this.checkBiometricSupport(biometricsEnabled, autoEnableBio);
  },

  // 简化生物识别支持检查
  checkBiometricSupport(biometricsEnabled, autoEnableBio) {
    wx.checkIsSupportSoterAuthentication({
      success: (res) => {
        const modes = res.supportMode || [];
        if (modes.length === 0) {
          this.setData({ showBiometricButton: false });
          return;
        }

        const mode = modes[0];
        wx.checkIsSoterEnrolledInDevice({
          checkAuthMode: mode,
          success: (resEnroll) => {
            const enrolled = !!resEnroll.isEnrolled;
            this.setData({ showBiometricButton: enrolled });

            // 如果是从设置页开启后跳转来的，且尚未写入持久凭据，则直接走启用流程
            if (autoEnableBio) {
              const openid = wx.getStorageSync('wx_openid') || '';
              if (openid && !(wx.getStorageSync(`bio_unlock_${openid}`))) {
                wx.showToast({ title: '请先输入主密码验证身份', icon: 'none', duration: 2000 });
                return;
              }
            }

            // 默认自动尝试一次生物解锁（优化超时保护）
            if (biometricsEnabled && enrolled && !this.data.isAutoTriedBio) {
              this.setData({ isAutoTriedBio: true });
              console.log('开始生物识别自动尝试...');
              // 设置更合理的超时时间，避免与用户操作冲突
              this.biometricTimeout = setTimeout(() => {
                console.log('生物识别自动尝试超时，跳过（用户可能在操作）');
                // 超时后不重置整个状态，只重置自动尝试标志
                this.setData({ isAutoTriedBio: false });
                if (this.biometricTimeout) {
                  clearTimeout(this.biometricTimeout);
                  this.biometricTimeout = null;
                }
              }, 8000); // 增加到8秒，避免过早超时
              this.tryBiometricUnlock();
            }
          },
          fail: () => {
            console.log('检查生物识别录入状态失败');
            this.setData({ showBiometricButton: false });
          }
        });
      },
      fail: () => {
        console.log('检查生物识别支持失败');
        this.setData({ showBiometricButton: false });
      }
    });
  },

  toggleShowPassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  // 用户点击“解锁”按钮（改为以 vault_meta + verifier 为准）
  handleUnlock(e) {
    const masterPassword = e.detail.value.masterPassword;
    if (!masterPassword) {
      return wx.showToast({ title: '请输入主密码', icon: 'none' });
    }

    wx.showLoading({ title: '正在解锁...' });

    // 以 vault_meta 为唯一可信源
    const metaRaw = wx.getStorageSync('vault_meta') || '{}';
    let meta = {};
    try { meta = JSON.parse(metaRaw); } catch(e) { meta = {}; }
    const saltBase64 = meta.saltBase64;
    const verifier = meta.verifier;

    if (!saltBase64 || !verifier) {
      wx.hideLoading();
      wx.showToast({ title: '密钥元信息缺失，请先设置主密码', icon: 'none' });
      return;
    }

    // 使用输入主密码派生 key，并校验 verifier
    const key = deriveKey(masterPassword, saltBase64);
    const decryptResult = decrypt(verifier, key);
    const ok = decryptResult.success && decryptResult.data === 'verify::ok';
    if (!ok) {
      wx.hideLoading();
      const errorMsg = !decryptResult.success ? `解密错误: ${decryptResult.message}` : '密码错误';
      wx.showToast({ title: errorMsg, icon: 'error' });
      return;
    }

    // 解锁通过
    app.globalData.sessionKey = key;
    app.globalData.isLocked = false;
    // 会话便捷用：当前会话密钥（仅会话层）
    wx.setStorageSync('current_session_key', key);

    wx.hideLoading();
    // 首次创建/首次解锁后的引导：若开启生物识别且已登录但未存过凭据，提示启用
    try {
      const biometricsEnabled = wx.getStorageSync('biometrics_enabled') || false;
      const openid = wx.getStorageSync('wx_openid') || '';
      if (biometricsEnabled && openid && !wx.getStorageSync(`bio_unlock_${openid}`)) {
        wx.showModal({
          title: '启用生物识别解锁',
          content: '已成功解锁，是否启用生物识别以便下次快速解锁？',
          success: (res) => {
            if (res.confirm) {
              this.enableBioUnlock(); // 进入启用流程
            } else {
              this.unlockSuccess();
            }
          }
        });
      } else {
        this.unlockSuccess();
      }
    } catch (e) {
      this.unlockSuccess();
    }
  },

  // 用户点击"生物识别"按钮（也供自动调用）
  tryBiometricUnlock() {
    // 重置尝试标志，避免重复弹出
    this.setData({ isAutoTriedBio: true });

    wx.checkIsSupportSoterAuthentication({
      success: (res) => {
        const modes = res.supportMode || [];
        if (modes.length === 0) {
          wx.showToast({ title: '设备不支持生物识别', icon: 'none' });
          this.resetBiometricState();
          return;
        }

        const mode = modes[0];
        wx.checkIsSoterEnrolledInDevice({
          checkAuthMode: mode,
          success: (resEnroll) => {
            if (!resEnroll.isEnrolled) {
              wx.showToast({ title: '未录入生物信息', icon: 'none' });
              this.resetBiometricState();
              return;
            }

            // 开始生物识别验证，添加合理的超时保护
            const authTimeout = setTimeout(() => {
              console.log('生物识别验证超时，清理状态');
              // 超时后只清理定时器，不显示toast（因为用户可能已经成功了）
              clearTimeout(authTimeout);
              this.resetBiometricState();
            }, 15000); // 15秒超时，减少等待时间

            wx.startSoterAuthentication({
              requestAuthModes: [mode],
              challenge: String(Date.now()),
              authContent: '请验证生物信息以解锁',
              success: (authRes) => {
                clearTimeout(authTimeout);
                if (authRes.errCode === 0) {
                  console.log('生物识别验证成功');
                  // 立即清理自动尝试的超时定时器
                  if (this.biometricTimeout) {
                    clearTimeout(this.biometricTimeout);
                    this.biometricTimeout = null;
                  }
                  // 延迟一小段时间再处理，确保清理完成
                  setTimeout(() => {
                    this.handleBiometricSuccess();
                  }, 100);
                } else {
                  console.log('生物识别验证失败:', authRes);
                  wx.showToast({ title: '生物识别验证失败', icon: 'none' });
                  this.resetBiometricState();
                }
              },
              fail: (err) => {
                clearTimeout(authTimeout);
                console.error('生物识别API调用失败:', err);

                if (err && err.errMsg && err.errMsg.includes('cancel')) {
                  console.log('用户取消生物识别');
                  // 用户取消生物识别，提供更友好的提示和完整的状态重置
                  wx.showToast({
                    title: '已取消生物识别',
                    icon: 'none',
                    duration: 1500,
                    complete: () => {
                      // 确保UI状态正确更新
                      this.setData({
                        showBiometricButton: true,
                        isAutoTriedBio: false
                      }, () => {
                        // 延迟重置状态，确保用户看到提示
                        setTimeout(() => {
                          this.resetBiometricState();
                        }, 300);
                      });
                    }
                  });
                } else {
                  console.log('生物识别API调用失败');
                  wx.showToast({
                    title: '生物识别失败，请使用密码解锁',
                    icon: 'none',
                    duration: 2000
                  });
                  this.resetBiometricState();
                }
              }
            });
          },
          fail: (err) => {
            wx.showToast({ title: '检查录入状态失败', icon: 'none' });
            console.error('检查录入失败:', err);
            this.resetBiometricState();
          }
        });
      },
      fail: (err) => {
        wx.showToast({ title: '获取生物识别能力失败', icon: 'none' });
        console.error('获取生物识别能力失败:', err);
        this.resetBiometricState();
      }
    });
  },

  // 处理生物识别成功 - 使用正确的密钥
  handleBiometricSuccess() {
    console.log('生物识别成功，开始解锁流程');

    // 清理可能的超时定时器
    if (this.biometricTimeout) {
      clearTimeout(this.biometricTimeout);
      this.biometricTimeout = null;
    }

    // 从生物识别凭据中获取正确的sessionKey
    this.getBiometricSessionKey();
  },

  // 从生物识别凭据获取sessionKey
  getBiometricSessionKey() {
    console.log('开始获取生物识别sessionKey...');

    const openid = wx.getStorageSync('wx_openid') || '';
    const deviceSalt = wx.getStorageSync('bio_device_salt') || '';
    const blob = openid ? wx.getStorageSync(`bio_unlock_${openid}`) : null;

    console.log('生物识别凭据信息:', {
      openid: !!openid,
      deviceSalt: !!deviceSalt,
      blob: !!blob
    });

    if (!blob || !deviceSalt) {
      console.log('生物凭据不存在，提示用户使用密码解锁');
      wx.showToast({ title: '生物解锁未启用，请使用密码解锁', icon: 'none' });
      this.resetBiometricState();
      return;
    }

    try {
      const payload = JSON.parse(blob);
      const enc_km = payload.enc_km;

      console.log('解析生物凭据:', {
        enc_km: !!enc_km,
        payloadKeys: Object.keys(payload)
      });

      if (!enc_km) {
        throw new Error('生物凭据缺失enc_km');
      }

      const BIO_KDF_TAG = 'bio.unlock.fixed.tag.v1';
      const kbio = deriveKey(BIO_KDF_TAG, deviceSalt);
      const decryptResult = decrypt(enc_km, kbio);

      console.log('解密sessionKey结果:', {
        kbio: !!kbio,
        decryptResult: decryptResult,
        success: decryptResult.success,
        hasData: !!(decryptResult.success && decryptResult.data)
      });

      if (!decryptResult.success || !decryptResult.data) {
        const errorMsg = decryptResult.success ? '解密数据为空' : (decryptResult.message || 'sessionKey解密失败');
        throw new Error(`生物识别密钥解密失败: ${errorMsg}`);
      }

      const sessionKey = decryptResult.data;

      // 使用获取的sessionKey进行解锁
      this.performUnlock(sessionKey);

    } catch (e) {
      console.error('获取生物识别密钥失败:', e);
      wx.showToast({
        title: '生物解锁失败，请使用密码解锁',
        icon: 'none',
        duration: 2000
      });
      this.resetBiometricState();
    }
  },

  // 直接跳转到首页 - 最简单的方法
  goToHomePage() {
    wx.switchTab({
      url: '/pages/index/index',
      success: () => {
        console.log('指纹解锁成功，进入首页');
        // 延迟显示提示，避免跳转冲突
        setTimeout(() => {
          wx.showToast({
            title: '解锁成功',
            icon: 'success',
            duration: 1000
          });
        }, 300);
      },
      fail: (err) => {
        console.error('跳转失败:', err);
        // 最后的fallback
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
    });
  },

  // 执行解锁操作
  performUnlock(sessionKey) {
    try {
      console.log('开始执行解锁操作...');

      // 1. 尝试验证密钥有效性（如果有元信息的话）
      const metaRaw = wx.getStorageSync('vault_meta') || '{}';
      let meta = {};
      try { meta = JSON.parse(metaRaw); } catch(e) { meta = {}; }

      console.log('验证密钥有效性:', {
        hasMeta: !!(meta.saltBase64 && meta.verifier),
        saltBase64: !!meta.saltBase64,
        verifier: !!meta.verifier,
        metaRawLength: metaRaw.length // 只显示长度，避免泄露敏感信息
      });

      if (meta.saltBase64 && meta.verifier) {
        // 验证密钥是否有效
        const saltBase64 = meta.saltBase64;
        const verifier = meta.verifier;
        const { deriveKey, decrypt } = require('../../utils/crypto-helper.js');

        console.log('开始密钥验证:', {
          saltBase64: saltBase64.substring(0, 20) + '...',
          verifier: verifier.substring(0, 20) + '...',
          sessionKeyLength: sessionKey ? sessionKey.length : 0
        });

        // 修复：直接使用sessionKey而不是重新派生
        // 因为生物识别凭据中存储的就是主密钥本身
        console.log('直接使用生物识别解锁的sessionKey进行验证');

        const decryptResult = decrypt(verifier, sessionKey);

        console.log('密钥验证详细结果:', {
          decryptResult: decryptResult,
          success: decryptResult.success,
          expectedVerifier: 'verify::ok',
          sessionKeySample: sessionKey ? sessionKey.substring(0, 16) + '...' : null
        });

        let isValid = false;
        if (decryptResult.success && decryptResult.data === 'verify::ok') {
          isValid = true;
          console.log('生物识别密钥验证成功');
        } else {
          console.log('生物识别解锁的密钥无效，尝试重新生成');
          const errorMsg = decryptResult.success ? '验证失败' : (decryptResult.message || '解密失败');

          // 记录更详细的错误信息
          wx.showToast({
            title: `生物识别密钥验证失败: ${errorMsg}`,
            icon: 'none',
            duration: 3000
          });

          // 密钥无效，尝试重新从生物凭据获取
          this.handleExpiredBiometricKey();
          return;
        }
      } else {
        console.log('没有找到元信息，跳过密钥验证');
      }

      // 2. 密钥有效或跳过验证，设置全局状态
      console.log('设置解锁状态...');
      app.globalData.sessionKey = sessionKey;
      app.globalData.isLocked = false;

      // 3. 保存会话密钥
      wx.setStorageSync('current_session_key', sessionKey);

      // 4. 清理所有可能的状态
      if (this.biometricTimeout) {
        clearTimeout(this.biometricTimeout);
        this.biometricTimeout = null;
      }

      console.log('解锁状态设置完成，准备跳转...');

      // 5. 强制跳转到首页，添加成功回调
      this.navigateToHome();

    } catch (e) {
      console.error('performUnlock执行失败:', e);
      // 最后的错误处理
      wx.showToast({
        title: '解锁异常，请重试',
        icon: 'none',
        duration: 2000,
        complete: () => {
          // 重置状态让用户可以重试
          this.resetBiometricState();
        }
      });
    }
  },

  // 处理过期的生物识别密钥
  handleExpiredBiometricKey() {
    console.log('处理过期的生物识别密钥...');

    // 重新尝试使用生物凭据解锁（不重新验证指纹）
    const openid = wx.getStorageSync('wx_openid') || '';
    const deviceSalt = wx.getStorageSync('bio_device_salt') || '';
    const blob = openid ? wx.getStorageSync(`bio_unlock_${openid}`) : null;

    console.log('重新获取生物密钥的凭据信息:', {
      openid: !!openid,
      deviceSalt: !!deviceSalt,
      blob: !!blob,
      openidValue: openid,
      deviceSaltLength: deviceSalt ? deviceSalt.length : 0,
      blobLength: blob ? blob.length : 0
    });

    if (!blob || !deviceSalt) {
      console.log('生物凭据不存在或不完整');

      // 提供更详细的错误信息
      const missingParts = [];
      if (!blob) missingParts.push('生物识别凭据');
      if (!deviceSalt) missingParts.push('设备盐值');

      wx.showModal({
        title: '生物识别失效',
        content: `缺少必要信息：${missingParts.join('、')}。请使用主密码解锁，然后重新启用生物识别。`,
        showCancel: false,
        confirmText: '确定'
      });

      this.resetBiometricState();
      return;
    }

    try {
      const payload = JSON.parse(blob);
      const enc_km = payload.enc_km;
      const version = payload.version || 1;

      console.log('解析生物凭据详情:', {
        enc_km: !!enc_km,
        version: version,
        payloadKeys: Object.keys(payload),
        createdAt: payload.createdAt ? new Date(payload.createdAt).toLocaleString() : null
      });

      if (!enc_km) {
        throw new Error('生物凭据中缺少加密的密钥信息');
      }

      // 检查凭据版本兼容性
      if (version < 1) {
        console.log('生物凭据版本过旧，尝试兼容处理');
      }

      const BIO_KDF_TAG = 'bio.unlock.fixed.tag.v1';
      const kbio = deriveKey(BIO_KDF_TAG, deviceSalt);
      const decryptResult = decrypt(enc_km, kbio);

      console.log('重新解密生物密钥结果:', {
        kbio: !!kbio,
        decryptResult: decryptResult,
        success: decryptResult.success,
        hasData: !!(decryptResult.success && decryptResult.data)
      });

      if (!decryptResult.success || !decryptResult.data) {
        const errorMsg = decryptResult.success ? '解密数据为空' : (decryptResult.message || '重新解密生物识别密钥失败');
        throw new Error(`重新解密生物识别密钥失败: ${errorMsg}`);
      }

      const freshKey = decryptResult.data;

      // 验证新密钥是否有效
      const metaRaw = wx.getStorageSync('vault_meta') || '{}';
      const meta = JSON.parse(metaRaw);

      console.log('验证重新获取的密钥:', {
        hasMeta: !!(meta.saltBase64 && meta.verifier),
        saltBase64: !!meta.saltBase64,
        verifier: !!meta.verifier
      });

      if (meta.saltBase64 && meta.verifier) {
        const saltBase64 = meta.saltBase64;
        const verifier = meta.verifier;

        // 修复：直接使用freshKey而不是重新派生
        // 因为freshKey就是从生物识别凭据中解密出的主密钥
        console.log('直接使用重新获取的freshKey进行验证');

        const decryptResult = decrypt(verifier, freshKey);

        console.log('重新获取密钥的验证结果:', {
          freshKey: !!freshKey,
          decryptResult: decryptResult,
          success: decryptResult.success,
          expectedVerifier: 'verify::ok',
          freshKeySample: freshKey ? freshKey.substring(0, 16) + '...' : null
        });

        let isValid = false;
        if (decryptResult.success && decryptResult.data === 'verify::ok') {
          isValid = true;
          console.log('重新获取的密钥验证成功，继续解锁流程');
          // 重新执行解锁流程，但跳过验证（因为已经验证过了）
          this.performUnlockWithVerifiedKey(freshKey);
        } else {
          console.log('重新获取的密钥仍然无效');

          // 记录失败原因
          const failureReason = !decryptResult.success ? '解密失败' : '验证不匹配';

          wx.showModal({
            title: '生物识别密钥异常',
            content: `重新获取的密钥${failureReason}。这通常表明生物识别凭据已损坏或与当前主密码不匹配。建议：\n\n1. 使用主密码解锁\n2. 在设置中重新启用生物识别\n\n是否现在使用主密码解锁？`,
            success: (res) => {
              if (res.confirm) {
                // 用户选择使用密码，显示密码输入框
                this.setData({ showPassword: true });
              } else {
                this.resetBiometricState();
              }
            }
          });
        }
      } else {
        console.log('没有找到元信息，跳过验证直接使用（兼容模式）');
        // 如果没有元信息，直接使用（兼容旧版本）
        this.performUnlockWithVerifiedKey(freshKey);
      }

    } catch (e) {
      console.error('重新获取生物密钥失败:', e);

      // 提供更详细的错误信息和恢复建议
      let errorMessage = '生物解锁已失效，请使用密码解锁';
      let errorDetail = '';

      if (e.message.includes('JSON')) {
        errorMessage = '生物识别凭据格式错误';
        errorDetail = '可能是数据损坏导致的，建议重新启用生物识别';
      } else if (e.message.includes('解密')) {
        errorMessage = '生物识别凭据解密失败';
        errorDetail = '可能是密钥或凭据损坏，建议重新启用生物识别';
      }

      wx.showModal({
        title: errorMessage,
        content: `${errorDetail}\n\n请使用主密码解锁，然后在设置中重新启用生物识别功能。`,
        showCancel: false,
        confirmText: '使用密码解锁'
      });

      this.resetBiometricState();
    }
  },

  // 使用已验证密钥执行解锁（跳过重复验证）
  performUnlockWithVerifiedKey(sessionKey) {
    console.log('使用已验证密钥执行解锁...');

    try {
      // 直接设置全局状态（因为密钥已经验证过了）
      app.globalData.sessionKey = sessionKey;
      app.globalData.isLocked = false;

      // 保存会话密钥
      wx.setStorageSync('current_session_key', sessionKey);

      // 清理所有可能的状态
      if (this.biometricTimeout) {
        clearTimeout(this.biometricTimeout);
        this.biometricTimeout = null;
      }

      console.log('已验证密钥解锁状态设置完成，准备跳转...');

      // 跳转到首页
      this.navigateToHome();

    } catch (e) {
      console.error('performUnlockWithVerifiedKey 执行失败:', e);
      wx.showToast({
        title: '解锁异常，请重试',
        icon: 'none',
        duration: 2000
      });
      this.resetBiometricState();
    }
  },

  // 导航到首页的统一方法
  navigateToHome() {
    wx.switchTab({
      url: '/pages/index/index',
      success: () => {
        console.log('成功跳转到首页');
        // 延迟显示成功提示，避免跳转时的UI冲突
        setTimeout(() => {
          wx.showToast({
            title: '解锁成功',
            icon: 'success',
            duration: 1500
          });
        }, 500);
      },
      fail: (err) => {
        console.error('跳转首页失败:', err);
        // 如果switchTab失败，尝试使用redirectTo
        wx.redirectTo({
          url: '/pages/index/index',
          success: () => {
            console.log('使用redirectTo成功跳转');
            wx.showToast({
              title: '解锁成功',
              icon: 'success',
              duration: 1500
            });
          },
          fail: (err2) => {
            console.error('redirectTo也失败:', err2);
            // 最后的fallback：重新加载当前页面
            wx.reLaunch({
              url: '/pages/index/index'
            });
          }
        });
      }
    });
  },

  // 启用生物识别解锁（首次需要：已登录 + 已解锁或输入主密码）
  enableBioUnlock() {
    const openid = wx.getStorageSync('wx_openid') || '';
    if (!openid) {
      wx.showToast({ title: '请先登录微信账号', icon: 'none' });
      return;
    }
    wx.startSoterAuthentication({
      requestAuthModes: ['fingerPrint','facial','speech'],
      challenge: String(Date.now()),
      authContent: '请验证生物信息以启用生物识别解锁',
      success: () => {
        // 拿到主密钥（优先使用当前会话已解锁的 sessionKey；否则让用户输入主密码）
        let keyHex = app.globalData.sessionKey;
        const ensureKey = () => {
          if (keyHex) return Promise.resolve(keyHex);
          return new Promise((resolve, reject) => {
            // 使用自定义页面来输入密码，避免明文显示
            wx.navigateTo({
              url: '/pages/unlock/unlock?autoEnableBio=1&fromBioEnable=1',
              success: () => {
                // 等待用户在解锁页面输入密码并验证成功
                const checkPassword = setInterval(() => {
                  if (app.globalData.sessionKey && !app.globalData.isLocked) {
                    clearInterval(checkPassword);
                    resolve(app.globalData.sessionKey);
                  }
                }, 1000);

                // 5分钟后超时
                setTimeout(() => {
                  clearInterval(checkPassword);
                  reject('操作超时');
                }, 300000);
              },
              fail: () => {
                reject('页面跳转失败');
              }
            });
          });
        };

        ensureKey().then((k) => {
          keyHex = k;
          // 生成/读取设备盐
          let deviceSalt = wx.getStorageSync('bio_device_salt');
          if (!deviceSalt) {
            // 用随机串构造Base64盐（简化实现）
            const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
            // 加密器的 deriveKey 需要 Base64 盐，这里简单用 btoa 兼容：小程序无 btoa，直接存 rand 作为“Base64-like”
            deviceSalt = rand;
            wx.setStorageSync('bio_device_salt', deviceSalt);
          }
          // 修正：与解锁端一致，使用固定 tag 进行派生，确保可重复解密
          const BIO_KDF_TAG = 'bio.unlock.fixed.tag.v1';
          const kbio = deriveKey(BIO_KDF_TAG, deviceSalt);
          const enc_km = encrypt(keyHex, kbio);
          const record = { enc_km, createdAt: Date.now(), version: 1 };
          wx.setStorageSync(`bio_unlock_${openid}`, JSON.stringify(record));

          // 启用成功：仅提示，如从设置页来则返回设置，不影响解锁流程
          wx.showToast({ title: '已启用生物解锁', icon: 'success' });
          const pages = getCurrentPages();
          const fromSettings = !!(pages && pages.length >= 2 && pages[pages.length - 2].route === 'pages/settings/settings');
          if (fromSettings) {
            setTimeout(() => wx.navigateBack(), 300);
          }
          // 其它情况保持现状：不跳首页，不改变开机解锁流程
        }).catch((err) => {
          wx.showToast({ title: typeof err === 'string' ? err : '启用失败', icon: 'none' });
        });
      },
      fail: () => {
        wx.showToast({ title: '生物验证失败', icon: 'none' });
      }
    });
  },

  // 解锁行为保持原逻辑：解锁即跳首页（不改动开机解锁体验）
  unlockSuccess(opts = {}) {
    wx.showToast({ title: '解锁成功', icon: 'success' });
    if (opts && opts.silent) {
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 重置生物识别相关状态，让用户可以重新操作
  resetBiometricState() {
    console.log('开始重置生物识别状态...');

    // 清理可能的超时定时器
    if (this.biometricTimeout) {
      clearTimeout(this.biometricTimeout);
      this.biometricTimeout = null;
    }

    // 强制重置所有相关状态，确保UI完全恢复
    this.setData({
      isAutoTriedBio: false,
      showPassword: false  // 确保密码输入框也是正确的状态
    }, () => {
      console.log('生物识别状态已重置，UI状态:', {
        isAutoTriedBio: this.data.isAutoTriedBio,
        showPassword: this.data.showPassword,
        showBiometricButton: this.data.showBiometricButton
      });

      // 确保页面UI状态正确
      const biometricsEnabled = wx.getStorageSync('biometrics_enabled');
      if (biometricsEnabled) {
        wx.checkIsSupportSoterAuthentication({
          success: (res) => {
            const modes = res.supportMode || [];
            if (modes.length > 0) {
              const mode = modes[0];
              wx.checkIsSoterEnrolledInDevice({
                checkAuthMode: mode,
                success: (resEnroll) => {
                  const shouldShowButton = !!resEnroll.isEnrolled;
                  this.setData({
                    showBiometricButton: shouldShowButton
                  }, () => {
                    console.log('生物识别按钮状态更新完成:', shouldShowButton);
                  });
                },
                fail: () => {
                  console.log('检查录入状态失败，隐藏生物识别按钮');
                  this.setData({ showBiometricButton: false });
                }
              });
            } else {
              console.log('不支持生物识别，隐藏按钮');
              this.setData({ showBiometricButton: false });
            }
          },
          fail: () => {
            console.log('检查生物识别支持失败，隐藏按钮');
            this.setData({ showBiometricButton: false });
          }
        });
      } else {
        console.log('生物识别未启用，隐藏按钮');
        this.setData({ showBiometricButton: false });
      }
    });
  },

  // 添加页面隐藏时的清理逻辑
  onHide() {
    // 清理可能的超时定时器
    if (this.biometricTimeout) {
      clearTimeout(this.biometricTimeout);
      this.biometricTimeout = null;
    }
  },

  // 添加页面销毁时的清理逻辑
  onUnload() {
    // 清理可能的超时定时器
    if (this.biometricTimeout) {
      clearTimeout(this.biometricTimeout);
      this.biometricTimeout = null;
    }
  }
});
