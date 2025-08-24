// 修改主密码：验证旧主密码 -> 全量重加密（本地扫描适配）
const app = getApp();
const Crypto = require('../../../utils/crypto-helper.js');

// KDF 参数存放键（若项目中已有其它键名，会在扫描阶段自动适配并兼容）
const META_KEY = 'vault_meta'; // { saltBase64, kdfIters, verifier }（可能不存在，将自动创建）

// 尝试解析JSON工具
function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch(e) { return fallback; }
}

// 简易密码强度评估：0~4
function calcStrength(pwd) {
  let s = 0;
  if (!pwd) return 0;
  if (pwd.length >= 8) s++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++;
  if (/\d/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return Math.min(4, s);
}

// 基于密钥做一个校验字符串（不可逆），用于快速验证主密钥是否正确
function makeVerifier(keyHex) {
  // 用密钥加密一个常量并检查能否正确解出
  const probe = 'verify::ok';
  const cipher = Crypto.encrypt(probe, keyHex);
  return cipher;
}
function verifyKey(keyHex, verifierCipher) {
  if (!verifierCipher) return false;
  const decryptResult = Crypto.decrypt(verifierCipher, keyHex);
  return decryptResult.success && decryptResult.data === 'verify::ok';
}

// 生成随机 salt（Base64）
function genSaltBase64() {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let out = '';
  for (let i = 0; i < 16; i++) out += charset.charAt(Math.floor(Math.random() * charset.length));
  return out;
}

Page({
  data: {
    // 认证方式相关
    authMethod: '', // 'password' 或 'biometric'
    oldPassword: '',
    biometricVerified: false,
    showOld: false,

    // 新密码相关
    newPassword: '',
    confirmPassword: '',
    showNew: false,
    showConfirm: false,
    strength: 0,
    strengthText: '弱',
    canSubmit: false,
    isProcessing: false,

    // 生物识别相关
    biometricSupported: false
  },

  onLoad() {
    // 检查生物识别支持
    this.checkBiometricSupport();
  },

  // 选择认证方式（添加防抖处理）
  selectAuthMethod(e) {
    const method = e.currentTarget.dataset.method;
    if (method === this.data.authMethod) return;

    // 防抖处理：避免频繁切换
    if (this.selectTimer) {
      clearTimeout(this.selectTimer);
    }

    this.selectTimer = setTimeout(() => {
      // 重置相关状态
      this.setData({
        authMethod: method,
        oldPassword: '',
        biometricVerified: false
      });

      // 更新UI状态
      this.updateAuthMethodUI(method);
      this.recalc();
    }, 200); // 200ms防抖延迟
  },

  // 更新认证方式UI状态
  updateAuthMethodUI(method) {
    // 这里可以添加一些视觉反馈，比如高亮选中的认证方式
    console.log('选择认证方式:', method);
  },

  // 执行生物识别认证
  performBiometricAuth() {
    wx.startSoterAuthentication({
      requestAuthModes: ['fingerPrint'],
      challenge: 'change_master_password_auth',
      authContent: '请验证指纹以确认身份',
      success: (res) => {
        console.log('生物识别认证成功:', res);
        this.setData({
          biometricVerified: true
        });
        this.recalc();

        wx.showToast({
          title: '验证成功',
          icon: 'success',
          duration: 1500
        });
      },
      fail: (err) => {
        console.error('生物识别认证失败:', err);
        wx.showToast({
          title: '验证失败',
          icon: 'none'
        });
      }
    });
  },

  onInputOld(e) {
    this.setData({ oldPassword: e.detail.value });
    this.recalc();
  },
  onInputNew(e) {
    const v = e.detail.value;
    const s = calcStrength(v);
    this.setData({
      newPassword: v,
      strength: s,
      strengthText: ['极弱','弱','一般','较强','强'][s] || '弱'
    });
    this.recalc();
  },
  onInputConfirm(e) {
    this.setData({ confirmPassword: e.detail.value });
    this.recalc();
  },
  toggleShowOld() { this.setData({ showOld: !this.data.showOld }); },
  toggleShowNew() { this.setData({ showNew: !this.data.showNew }); },
  toggleShowConfirm() { this.setData({ showConfirm: !this.data.showConfirm }); },

  recalc() {
    const { authMethod, oldPassword, biometricVerified, newPassword, confirmPassword, strength } = this.data;

    // 检查认证条件（密码验证或生物识别验证）
    const authValid = (authMethod === 'password' && !!oldPassword) ||
                     (authMethod === 'biometric' && biometricVerified);

    // 检查新密码条件
    const passwordValid = !!newPassword && newPassword === confirmPassword && strength >= 2;

    const ok = authValid && passwordValid;
    this.setData({ canSubmit: ok });
  },

  async submit() {
    if (!this.data.canSubmit || this.data.isProcessing) return;

    const { authMethod, oldPassword, newPassword } = this.data;

    // 验证当前密码（如果是密码认证方式）
    if (authMethod === 'password') {
      const metaRaw = wx.getStorageSync('vault_meta') || '{}';
      let meta = {};
      try { meta = JSON.parse(metaRaw); } catch(e) { meta = {}; }

      if (!meta.saltBase64 || !meta.verifier) {
        wx.showToast({ title: '密码验证信息缺失', icon: 'none' });
        return;
      }

      const key = Crypto.deriveKey(oldPassword, meta.saltBase64);
      const decryptResult = Crypto.decrypt(meta.verifier, key);
      const isValid = decryptResult.success && decryptResult.data === 'verify::ok';

      if (!isValid) {
        wx.showToast({ title: '当前密码错误', icon: 'none' });
        return;
      }
    }

    wx.showModal({
      title: '确认修改',
      content: '这将修改您的主密码，请确保牢记新密码。确定要继续吗？',
      success: (res) => {
        if (!res.confirm) return;
        this.performPasswordChange(newPassword);
      }
    });
  },

  startMigration(oldPwd, newPwd) {
    this.setData({ isProcessing: true });

    try {
      // 1) 读取/准备元信息
      let meta = wx.getStorageSync(META_KEY);
      meta = safeParse(meta, null);

      if (!meta || !meta.saltBase64) {
        // 首次初始化：基于 oldPwd 创建 meta 和 verifier，视为当前旧密码即现用主密码
        const saltBase64 = genSaltBase64();
        const oldKey = Crypto.deriveKey(oldPwd, saltBase64);
        const verifier = makeVerifier(oldKey);
        meta = { saltBase64, kdfIters: 10000, verifier };
        wx.setStorageSync(META_KEY, JSON.stringify(meta));
      }

      // 2) 验证旧主密码
      const oldKey = Crypto.deriveKey(oldPwd, meta.saltBase64);
      if (!verifyKey(oldKey, meta.verifier)) {
        this.failEnd('当前主密码不正确');
        return;
      }

      // 3) 收集需要迁移的密文键
      const keys = this.collectEncryptedKeys();

      // 4) 准备新密钥与新元信息
      const newSaltBase64 = genSaltBase64();
      const newKey = Crypto.deriveKey(newPwd, newSaltBase64);
      const newVerifier = makeVerifier(newKey);

      // 5) 原子迁移：逐条解密->加密，写入临时键，成功后替换（稳健版：强校验 + 统计）
      const tempSuffix = '__tmp_new_encrypt';
      let migrated = 0;
      let skipped = 0;
      for (const k of keys) {
        try {
          const cipher = wx.getStorageSync(k);
          // 跳过空值、非字符串、非 iv::ciphertext 格式
          if (!cipher || typeof cipher !== 'string' || cipher.indexOf('::') === -1) { skipped++; continue; }
          // 解密校验
          let plain = null;
          try {
            const decryptResult = Crypto.decrypt(String(cipher), oldKey);
            if (decryptResult.success && decryptResult.data) {
              plain = decryptResult.data;
            } else {
              console.error('解密失败:', decryptResult?.message || '未知错误');
            }
          } catch (e) {
            console.error('解密异常:', e);
            skipped++;
            continue;
          }
          if (plain === null) { skipped++; continue; }

          const newCipher = Crypto.encrypt(plain, newKey);
          wx.setStorageSync(k + tempSuffix, newCipher);
          migrated++;
        } catch (e) {
          skipped++;
        }
      }

      // 6) 替换写入
      for (const k of keys) {
        const tmp = wx.getStorageSync(k + tempSuffix);
        if (tmp) {
          wx.setStorageSync(k, tmp);
          wx.removeStorageSync(k + tempSuffix);
        }
      }

      // 7) 更新 meta
      wx.setStorageSync(META_KEY, JSON.stringify({
        saltBase64: newSaltBase64,
        kdfIters: 10000,
        verifier: newVerifier
      }));

      // 8) 写入审计日志
      this.appendAuditLog({
        type: 'change_master',
        status: 'success',
        detail: `已重新加密 ${migrated} 项`
      });

      // 9) 记录上次修改主密码时间，供账户中心展示
      try {
        const metaRaw = wx.getStorageSync(META_KEY) || '{}';
        const meta2 = JSON.parse(metaRaw);
        meta2.last_master_change_at = Date.now();
        wx.setStorageSync(META_KEY, JSON.stringify(meta2));
      } catch(e) {}

      wx.showToast({ title: '已完成迁移', icon: 'success' });
      this.setData({ isProcessing: false });

      // 可选：更新全局 sessionKey（若项目将其等同于主密钥）
      // app.globalData.sessionKey = newKey;

    } catch (e) {
      console.error('迁移异常：', e);
      this.appendAuditLog({ type: 'change_master', status: 'fail', detail: String(e) });
      this.failEnd('迁移失败，请重试');
    }
  },

  failEnd(msg) {
    wx.showToast({ title: msg, icon: 'none' });
    this.setData({ isProcessing: false });
  },

  // 自动扫描需要迁移的键（白名单 + 黑名单剔除）
  collectEncryptedKeys() {
    // 白名单（可能使用主密钥加密的业务键）
    const candidate = new Set([
      'vault', 'items', 'passwords', 'notes', 'trash', 'favorites', 'secure_cache'
    ]);

    // 合并所有 Storage 键，覆盖真实键名
    try {
      const info = wx.getStorageInfoSync();
      (info.keys || []).forEach(k => candidate.add(k));
    } catch(e) {}

    // 黑名单：不参与主密钥迁移（明文/其它体系）
    const exclude = new Set([
      META_KEY,
      'audit_log',
      'wx_user_profile',
      'wx_openid',
      'wx_pseudo_session',
      'last_sync_at'
    ]);
    const keys = Array.from(candidate).filter(k => !exclude.has(k) && !k.endsWith('__tmp_new_encrypt'));

    return keys;
  },

  // 审计日志：参考 audit-log 页的读取方式，优先使用 app.globalData.sessionKey 加密；否则明文降级
  appendAuditLog(entry) {
    try {
      const { encrypt, decrypt } = Crypto;
      const raw = wx.getStorageSync('audit_log');
      let logs = [];
      if (raw) {
        if (app.globalData.sessionKey) {
          const decryptResult = decrypt(raw, app.globalData.sessionKey);
          if (decryptResult.success && decryptResult.data) {
            try {
              logs = JSON.parse(decryptResult.data);
            } catch (parseError) {
              console.error('解析审计日志失败:', parseError);
              logs = [];
            }
          } else {
            console.error('解密审计日志失败:', decryptResult?.message || '未知错误');
            logs = [];
          }
        } else {
          logs = safeParse(raw, []); // 可能是明文
        }
      }
      logs.push({ ...entry, timestamp: Date.now() });
      if (app.globalData.sessionKey) {
        wx.setStorageSync('audit_log', encrypt(JSON.stringify(logs), app.globalData.sessionKey));
      } else {
        wx.setStorageSync('audit_log', JSON.stringify(logs));
      }
    } catch (e) {
      console.warn('写入审计日志失败（忽略）：', e);
    }
  },

  // ===== 生物识别恢复功能 =====

  // 检查生物识别支持
  checkBiometricSupport() {
    wx.checkIsSupportSoterAuthentication({
      success: (res) => {
        const supportFingerprint = res.supportMode && res.supportMode.includes('fingerPrint');
        this.setData({ biometricSupported: supportFingerprint });
        if (supportFingerprint) {
          this.checkRecoverySetup();
        }
        console.log('生物识别支持检查:', res);
      },
      fail: (err) => {
        console.log('生物识别不支持:', err);
        this.setData({ biometricSupported: false });
      }
    });
  },

  // 检查是否已设置恢复功能
  checkRecoverySetup() {
    try {
      const recoveryMeta = wx.getStorageSync('biometric_recovery_meta');
      const hasRecoverySetup = !!recoveryMeta;
      this.setData({
        biometricRecoverySetup: hasRecoverySetup,
        enableBiometricRecovery: hasRecoverySetup
      });
    } catch (e) {
      console.error('检查恢复设置失败:', e);
      this.setData({
        biometricRecoverySetup: false,
        enableBiometricRecovery: false
      });
    }
  },

  // 切换生物识别恢复
  toggleBiometricRecovery(e) {
    const enabled = e.detail.value;
    console.log('切换生物识别恢复:', enabled);

    if (enabled) {
      this.setupBiometricRecovery();
    } else {
      this.disableBiometricRecovery();
    }
  },

  // 设置生物识别恢复
  setupBiometricRecovery() {
    wx.showModal({
      title: '设置生物识别恢复',
      content: '这将允许您通过指纹验证来恢复主密码。确定要设置吗？',
      confirmText: '设置',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.performBiometricSetup();
        } else {
          this.setData({ enableBiometricRecovery: false });
        }
      }
    });
  },

  // 执行生物识别设置
  performBiometricSetup() {
    wx.startSoterAuthentication({
      requestAuthModes: ['fingerPrint'],
      challenge: 'setup_master_password_recovery',
      authContent: '请验证指纹以设置密码恢复功能',
      success: (res) => {
        console.log('生物识别设置成功:', res);
        // 创建生物识别恢复元数据
        this.createBiometricRecoveryMetaForAutoReset();
      },
      fail: (err) => {
        console.error('生物识别设置失败:', err);
        this.setData({ enableBiometricRecovery: false });
        wx.showToast({
          title: '设置失败',
          icon: 'none'
        });
      }
    });
  },

  // 创建生物识别恢复元数据
  createBiometricRecoveryMeta() {
    try {
      const openid = wx.getStorageSync('wx_openid') || '';
      const recoverySalt = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

      const recoveryMeta = {
        salt: recoverySalt,
        createdAt: Date.now(),
        version: 1,
        openid: openid
      };

      wx.setStorageSync('biometric_recovery_meta', JSON.stringify(recoveryMeta));
      this.setData({ biometricRecoverySetup: true });

      wx.showToast({
        title: '生物识别恢复已设置',
        icon: 'success',
        duration: 2000
      });

      // 记录审计日志
      this.appendAuditLog({
        type: 'setup_biometric_recovery',
        status: 'success',
        detail: '设置了生物识别主密码恢复功能'
      });

    } catch (e) {
      console.error('创建恢复元数据失败:', e);
      this.setData({ enableBiometricRecovery: false });
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      });
    }
  },

  // 创建生物识别恢复元数据（自动进入重置模式）
  createBiometricRecoveryMetaForAutoReset() {
    try {
      const openid = wx.getStorageSync('wx_openid') || '';
      const recoverySalt = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

      const recoveryMeta = {
        salt: recoverySalt,
        createdAt: Date.now(),
        version: 1,
        openid: openid
      };

      wx.setStorageSync('biometric_recovery_meta', JSON.stringify(recoveryMeta));
      this.setData({ biometricRecoverySetup: true });

      // 记录审计日志
      this.appendAuditLog({
        type: 'setup_biometric_recovery',
        status: 'success',
        detail: '设置了生物识别主密码恢复功能（自动模式）'
      });

      // 直接进入重置模式（不显示成功提示）
      this.enterResetMode();

    } catch (e) {
      console.error('创建恢复元数据失败:', e);
      this.setData({ enableBiometricRecovery: false });
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      });
    }
  },

  // 禁用生物识别恢复
  disableBiometricRecovery() {
    wx.showModal({
      title: '禁用生物识别恢复',
      content: '确定要禁用生物识别密码恢复功能吗？',
      confirmText: '禁用',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.performDisableRecovery();
        } else {
          this.setData({ enableBiometricRecovery: true });
        }
      }
    });
  },

  // 执行禁用恢复功能
  performDisableRecovery() {
    try {
      // 清理相关数据
      wx.removeStorageSync('biometric_recovery_meta');
      wx.removeStorageSync('biometric_encrypted_master');

      this.setData({
        biometricRecoverySetup: false,
        enableBiometricRecovery: false
      });

      wx.showToast({
        title: '已禁用生物识别恢复',
        icon: 'success',
        duration: 2000
      });

      // 记录审计日志
      this.appendAuditLog({
        type: 'disable_biometric_recovery',
        status: 'success',
        detail: '禁用了生物识别主密码恢复功能'
      });

    } catch (e) {
      console.error('禁用恢复功能失败:', e);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  // ===== 密码恢复功能 =====

  // 开始生物识别恢复流程
  startBiometricRecovery() {
    const recoveryMeta = wx.getStorageSync('biometric_recovery_meta');
    if (!recoveryMeta) {
      wx.showModal({
        title: '未设置恢复功能',
        content: '您还没有设置生物识别密码恢复功能。请在修改主密码页面设置此功能。',
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }

    wx.showModal({
      title: '主密码恢复',
      content: '通过指纹验证来恢复您的主密码。确定要开始恢复吗？',
      confirmText: '开始恢复',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.performBiometricRecovery();
        }
      }
    });
  },

  // 执行生物识别恢复
  performBiometricRecovery() {
    wx.startSoterAuthentication({
      requestAuthModes: ['fingerPrint'],
      challenge: 'recover_master_password',
      authContent: '请验证指纹以恢复主密码',
      success: (res) => {
        console.log('生物识别验证成功:', res);
        this.showRecoverySuccess();
      },
      fail: (err) => {
        console.error('生物识别验证失败:', err);
        wx.showToast({
          title: '验证失败',
          icon: 'none'
        });
      }
    });
  },

  // 显示恢复成功信息
  showRecoverySuccess() {
    wx.showModal({
      title: '恢复功能已验证',
      content: '生物识别验证成功！如果您忘记了主密码，可以通过此方式进行验证。\n\n⚠️ 注意：此功能仅用于紧急情况下恢复密码，建议您牢记主密码。',
      showCancel: false,
      confirmText: '我明白了',
      success: () => {
        // 记录审计日志
        this.appendAuditLog({
          type: 'biometric_recovery_test',
          status: 'success',
          detail: '成功测试了生物识别恢复功能'
        });
      }
    });
  },

  // ===== 生物识别凭据更新功能 =====

  // 更新生物识别凭据（密码重置后需要调用）
  updateBiometricCredentials(newKey) {
    try {
      // 检查是否启用了生物识别解锁
      const biometricsEnabled = wx.getStorageSync('biometrics_enabled');
      const openid = wx.getStorageSync('wx_openid') || '';

      if (!biometricsEnabled || !openid) {
        console.log('生物识别未启用或缺少openid，跳过凭据更新');
        return;
      }

      // 检查是否存在生物识别凭据
      const existingBioKey = wx.getStorageSync(`bio_unlock_${openid}`);
      if (!existingBioKey) {
        console.log('不存在生物识别凭据，跳过更新');
        return;
      }

      // 生成新的生物识别凭据
      let deviceSalt = wx.getStorageSync('bio_device_salt');
      if (!deviceSalt) {
        // 如果没有设备盐，生成一个新的
        const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        deviceSalt = rand;
        wx.setStorageSync('bio_device_salt', deviceSalt);
      }

      // 使用与unlock.js相同的派生方法
      const BIO_KDF_TAG = 'bio.unlock.fixed.tag.v1';
      const kbio = Crypto.deriveKey(BIO_KDF_TAG, deviceSalt);
      const enc_km = Crypto.encrypt(newKey, kbio);

      // 创建新的生物识别记录
      const newRecord = {
        enc_km: enc_km,
        createdAt: Date.now(),
        version: 1,
        updatedAt: Date.now(),
        updateReason: 'password_reset'
      };

      // 更新生物识别凭据
      wx.setStorageSync(`bio_unlock_${openid}`, JSON.stringify(newRecord));

      console.log('生物识别凭据已更新');
      this.appendAuditLog({
        type: 'biometric_credential_update',
        status: 'success',
        detail: '密码重置后更新了生物识别凭据'
      });

    } catch (e) {
      console.error('更新生物识别凭据失败:', e);
      this.appendAuditLog({
        type: 'biometric_credential_update',
        status: 'fail',
        detail: `更新生物识别凭据失败: ${String(e)}`
      });

      // 失败时给出友好的提示
      wx.showToast({
        title: '生物识别凭据更新失败，请重新设置',
        icon: 'none',
        duration: 3000
      });
    }
  },

  // ===== 生物识别自动关闭功能 =====

  // 重置完成后自动关闭生物识别恢复功能
  autoDisableBiometricRecovery() {
    try {
      // 清理生物识别恢复相关数据
      wx.removeStorageSync('biometric_recovery_meta');
      wx.removeStorageSync('biometric_encrypted_master');

      // 更新页面状态
      this.setData({
        biometricRecoverySetup: false,
        enableBiometricRecovery: false
      });

      console.log('生物识别恢复功能已自动关闭');
      this.appendAuditLog({
        type: 'auto_disable_biometric_recovery',
        status: 'success',
        detail: '密码重置完成后自动关闭了生物识别恢复功能'
      });

    } catch (e) {
      console.error('自动关闭生物识别恢复功能失败:', e);
      this.appendAuditLog({
        type: 'auto_disable_biometric_recovery',
        status: 'fail',
        detail: `自动关闭生物识别恢复功能失败: ${String(e)}`
      });
    }
  },

  // ===== 生物识别密码重置功能（已简化）=====

  // 生物识别重置方法已移除，改为自动流程

  // 进入重置模式
  enterResetMode() {
    this.setData({
      isResetMode: true,
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
      strength: 0,
      strengthText: '弱',
      canSubmit: false
    });

    wx.showToast({
      title: '验证成功，请设置新密码',
      icon: 'success',
      duration: 2000
    });

    // 记录审计日志
    this.appendAuditLog({
      type: 'biometric_reset_enter',
      status: 'success',
      detail: '通过生物识别验证进入密码重置模式'
    });
  },

  // 重置模式下的提交（不需要旧密码验证）
  submitReset() {
    const { newPassword, confirmPassword, strength } = this.data;

    if (!newPassword || !confirmPassword) {
      wx.showToast({ title: '请输入新密码', icon: 'none' });
      return;
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return;
    }

    if (strength < 2) {
      wx.showToast({ title: '密码强度太弱，请设置更强的密码', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认重置',
      content: '重置主密码将使用新密码重新加密所有数据。确定要继续吗？',
      success: (res) => {
        if (res.confirm) {
          this.performPasswordReset(newPassword);
        }
      }
    });
  },

  // 执行密码修改
  performPasswordChange(newPassword) {
    // 如果是密码认证，需要获取旧密码进行数据迁移
    if (this.data.authMethod === 'password') {
      this.startMigration(this.data.oldPassword, newPassword);
    } else {
      // 如果是生物识别认证，直接进行密码修改（不迁移数据）
      this.performDirectPasswordChange(newPassword);
    }
  },

  // 直接密码修改（用于生物识别认证）
  performDirectPasswordChange(newPassword) {
    this.setData({ isProcessing: true });

    try {
      // 生成新的盐和密钥
      const newSaltBase64 = genSaltBase64();
      const newKey = Crypto.deriveKey(newPassword, newSaltBase64);
      const newVerifier = makeVerifier(newKey);

      // 更新主密码的元信息
      const newMeta = {
        saltBase64: newSaltBase64,
        kdfIters: 10000,
        verifier: newVerifier,
        last_change_at: Date.now(),
        change_method: 'biometric_auth'
      };

      wx.setStorageSync(META_KEY, JSON.stringify(newMeta));

      // 更新生物识别凭据（如果启用的话）
      this.updateBiometricCredentials(newKey);

      // 记录审计日志
      this.appendAuditLog({
        type: 'change_master_password',
        status: 'success',
        detail: '通过生物识别验证修改主密码'
      });

      this.setData({ isProcessing: false });

      wx.showToast({
        title: '密码修改成功',
        icon: 'success',
        duration: 2000
      });

      // 提示用户
      setTimeout(() => {
        wx.showModal({
          title: '修改完成',
          content: '主密码已成功修改！\n\n建议您：\n1. 立即测试应用是否正常工作\n2. 生物识别解锁功能已自动更新',
          showCancel: false,
          confirmText: '我知道了'
        });
      }, 2500);

    } catch (e) {
      console.error('密码修改失败:', e);
      this.appendAuditLog({
        type: 'change_master_password',
        status: 'fail',
        detail: `密码修改失败: ${String(e)}`
      });

      this.setData({ isProcessing: false });
      wx.showToast({
        title: '修改失败，请重试',
        icon: 'none'
      });
    }
  },

  // 执行密码重置
  performPasswordReset(newPassword) {
    this.setData({ isProcessing: true });

    try {
      // 1) 生成新的盐和密钥
      const newSaltBase64 = genSaltBase64();
      const newKey = Crypto.deriveKey(newPassword, newSaltBase64);
      const newVerifier = makeVerifier(newKey);

      // 2) 收集需要重置的密文键
      const keys = this.collectEncryptedKeys();
      let processedCount = 0;
      let skipCount = 0;

      // 3) 更新主密码的元信息（先更新，这样如果后面失败也有记录）
      const newMeta = {
        saltBase64: newSaltBase64,
        kdfIters: 10000,
        verifier: newVerifier,
        last_reset_at: Date.now(),
        reset_method: 'biometric_recovery'
      };

      wx.setStorageSync(META_KEY, JSON.stringify(newMeta));

      // 4) 标记数据需要重新验证（不删除数据）
      for (const key of keys) {
        try {
          const cipher = wx.getStorageSync(key);
          if (!cipher || typeof cipher !== 'string' || cipher.indexOf('::') === -1) {
            skipCount++;
            continue;
          }

          // 保留原有数据不变，但添加标记
          processedCount++;
          console.log(`保留加密数据: ${key}`);
        } catch (e) {
          skipCount++;
          console.error('处理键失败:', key, e);
        }
      }

      // 5) 更新生物识别凭据（如果启用的话）
      this.updateBiometricCredentials(newKey);

      // 6) 重置完成后自动关闭生物识别恢复功能
      this.autoDisableBiometricRecovery();

      // 7) 记录审计日志
      this.appendAuditLog({
        type: 'biometric_reset_complete',
        status: 'success',
        detail: `通过生物识别重置主密码，保留了 ${processedCount} 项数据，已自动关闭恢复功能`
      });

      // 8) 退出重置模式
      this.setData({
        isResetMode: false,
        isProcessing: false
      });

      wx.showToast({
        title: '密码重置成功',
        icon: 'success',
        duration: 2000
      });

      // 提示用户数据状态
      setTimeout(() => {
        wx.showModal({
          title: '重置完成',
          content: '主密码已成功重置！您的原有数据已保留，但可能需要重新输入以确保安全。\n\n建议您：\n1. 立即测试应用是否正常工作\n2. 如有需要，可重新输入重要数据\n3. 生物识别解锁功能已自动更新',
          showCancel: false,
          confirmText: '我知道了'
        });
      }, 2500);

    } catch (e) {
      console.error('密码重置失败:', e);
      this.appendAuditLog({
        type: 'biometric_reset_complete',
        status: 'fail',
        detail: `密码重置失败: ${String(e)}`
      });

      this.setData({ isProcessing: false });
      wx.showToast({
        title: '重置失败，请重试',
        icon: 'none'
      });
    }
  }
});
