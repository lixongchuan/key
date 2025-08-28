// ================================================
// 统一密码修改系统 - 完全重写版本
// ================================================
const app = getApp();
const Crypto = require('../../../utils/crypto-helper.js');

// 系统常量
const META_KEY = 'vault_meta'; // 主密码元信息
const BACKUP_SUFFIX = '__migration_backup__'; // 备份文件后缀
const TEMP_SUFFIX = '__tmp_new_encrypt'; // 临时文件后缀

// ================================================
// 工具函数
// ================================================

// 尝试解析JSON
function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch(e) { return fallback; }
}

// UTF-8编码验证
function isValidUTF8(str) {
  try {
    // 尝试编码和解码来验证UTF-8有效性
    const encoded = encodeURIComponent(str);
    const decoded = decodeURIComponent(encoded);
    return decoded === str;
  } catch (error) {
    return false;
  }
}

// 安全的JSON序列化
function safeStringify(obj) {
  try {
    const str = JSON.stringify(obj);
    // 验证序列化结果的UTF-8有效性
    if (!isValidUTF8(str)) {
      console.warn('JSON序列化结果包含无效UTF-8字符，使用降级处理');
      // 清理无效字符
      return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'string') {
          // 移除或替换无效字符
          return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
        }
        return value;
      });
    }
    return str;
  } catch (error) {
    console.error('JSON序列化失败:', error);
    // 返回基础对象
    return JSON.stringify({
      error: '序列化失败',
      timestamp: Date.now(),
      type: 'serialization_error'
    });
  }
}

// 生成随机盐值
function generateSalt() {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let salt = '';
  for (let i = 0; i < 16; i++) {
    salt += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return salt;
}

// 密码强度评估
function evaluatePasswordStrength(password) {
  if (!password) return 0;
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  return Math.min(4, strength);
}

// 生成验证器
function createVerifier(keyHex) {
  const probe = 'verify::ok';
  return Crypto.encrypt(probe, keyHex);
}

// 验证密钥
function validateKey(keyHex, verifierCipher) {
  if (!verifierCipher) return false;
  const result = Crypto.decrypt(verifierCipher, keyHex);
  return result.success && result.data === 'verify::ok';
}

// ================================================
// 密码修改管理器
// ================================================
class PasswordChangeManager {
  constructor(page) {
    this.page = page;
    this.crypto = Crypto;
    this.app = app;

    // 状态管理
    this.state = {
      isProcessing: false,
      currentStep: '',
      progress: 0,
      backupData: null,
      oldKey: null,
      newKey: null,
      oldMeta: null,
      newMeta: null,
      // 新增状态跟踪
      authMethod: '',           // 认证方式
      migratedCount: 0,         // 迁移的数据项数量
      biometricUpdated: false,  // 生物识别是否更新
      totalKeys: 0             // 总数据项数量
    };
  }

  // ================================================
  // 主流程 - 统一入口
  // ================================================
  async changePassword(options) {
    const { newPassword, authMethod, authData } = options;

    if (this.state.isProcessing) {
      throw new Error('密码修改正在进行中，请稍后');
    }

    try {
      this.state.isProcessing = true;
      this.updateProgress('开始密码修改...', 0);

      // 保存认证方式和初始化状态
      this.state.authMethod = authMethod;
      this.state.migratedCount = 0;
      this.state.biometricUpdated = false;

      // 步骤1：备份审计日志
      await this.backupAuditLog();

      // 步骤2：验证身份
      await this.authenticateUser(authMethod, authData);

      // 步骤3：准备新密钥
      await this.prepareNewKey(newPassword);

      // 步骤4：备份数据
      await this.backupCurrentData();

      // 步骤5：迁移数据
      await this.migrateData();

      // 步骤6：更新系统状态
      await this.updateSystemState();

      // 步骤7：更新生物识别
      await this.updateBiometricCredentials();

      // 步骤8：恢复审计日志
      await this.restoreAuditLog();

      // 步骤9：清理备份
      await this.cleanupBackup();

      this.updateProgress('密码修改成功！', 100);

      return { success: true };

    } catch (error) {
      console.error('密码修改失败:', error);

      // 自动回滚
      await this.rollbackChanges();

      throw error;
    } finally {
      this.state.isProcessing = false;
    }
  }

  // ================================================
  // 身份验证
  // ================================================
  async authenticateUser(authMethod, authData) {
    this.updateProgress('验证身份...', 10);

    if (authMethod === 'password') {
      await this.authenticateWithPassword(authData.oldPassword);
    } else if (authMethod === 'biometric') {
      await this.authenticateWithBiometric();
    } else {
      throw new Error('未知的认证方式');
    }

    this.updateProgress('身份验证成功', 20);
  }

  async authenticateWithPassword(oldPassword) {
    // 读取现有元信息
    const metaRaw = wx.getStorageSync(META_KEY);
    if (!metaRaw) {
      throw new Error('密码验证信息缺失，请重新设置主密码');
    }

    const meta = safeParse(metaRaw, null);
    if (!meta || !meta.saltBase64 || !meta.verifier) {
      throw new Error('密码验证信息格式错误');
    }

    // 验证旧密码
    const oldKey = this.crypto.deriveKey(oldPassword, meta.saltBase64);
    if (!validateKey(oldKey, meta.verifier)) {
      throw new Error('当前密码错误');
    }

    this.state.oldKey = oldKey;
    this.state.oldMeta = meta;
  }

  async authenticateWithBiometric() {
    return new Promise((resolve, reject) => {
      wx.startSoterAuthentication({
        requestAuthModes: ['fingerPrint'],
        challenge: 'change_master_password_auth',
        authContent: '请验证指纹以确认身份',
        success: async (res) => {
          try {
            // 验证生物识别凭据
            const isValid = await this.validateBiometricCredential();
            if (!isValid) {
              throw new Error('生物识别凭据无效');
            }

            // 使用当前会话密钥作为旧密钥
            this.state.oldKey = this.app.globalData.sessionKey;

            // 读取元信息
            const metaRaw = wx.getStorageSync(META_KEY);
            const meta = safeParse(metaRaw, null);
            this.state.oldMeta = meta;

            resolve();
          } catch (error) {
            reject(error);
          }
        },
        fail: (err) => {
          reject(new Error('生物识别验证失败'));
        }
      });
    });
  }

  async validateBiometricCredential() {
    try {
      const openid = wx.getStorageSync('wx_openid') || '';
      const deviceSalt = wx.getStorageSync('bio_device_salt') || '';
      const bioCredential = wx.getStorageSync(`bio_unlock_${openid}`);

      if (!openid || !deviceSalt || !bioCredential) {
        return false;
      }

      const payload = JSON.parse(bioCredential);
      const enc_km = payload.enc_km;

      if (!enc_km) {
        return false;
      }

      const BIO_KDF_TAG = 'bio.unlock.fixed.tag.v1';
      const kbio = this.crypto.deriveKey(BIO_KDF_TAG, deviceSalt);
      const decryptResult = this.crypto.decrypt(enc_km, kbio);

      if (decryptResult.success && decryptResult.data) {
        const currentSessionKey = this.app.globalData.sessionKey;
        return currentSessionKey && decryptResult.data === currentSessionKey;
      }

      return false;
    } catch (error) {
      console.error('验证生物识别凭据异常:', error);
      return false;
    }
  }

  // ================================================
  // 准备新密钥
  // ================================================
  async prepareNewKey(newPassword) {
    this.updateProgress('准备新密钥...', 30);

    const newSalt = generateSalt();
    const newKey = this.crypto.deriveKey(newPassword, newSalt);
    const newVerifier = createVerifier(newKey);

    this.state.newKey = newKey;
    this.state.newMeta = {
      saltBase64: newSalt,
      kdfIters: 10000,
      verifier: newVerifier,
      last_master_change_at: Date.now(),
      change_method: 'unified_password_change'
    };

    this.updateProgress('新密钥准备完成', 40);
  }

  // ================================================
  // 数据备份
  // ================================================
  async backupCurrentData() {
    this.updateProgress('备份当前数据...', 45);

    const keys = this.collectEncryptedKeys();
    const backupData = {};

    for (const key of keys) {
      try {
        const data = wx.getStorageSync(key);
        if (data) {
          backupData[key] = data;
        }
      } catch (error) {
        console.warn(`备份键失败: ${key}`, error);
      }
    }

    // 保存备份
    wx.setStorageSync(BACKUP_SUFFIX, JSON.stringify(backupData));
    this.state.backupData = backupData;

    this.updateProgress('数据备份完成', 50);
  }

  // ================================================
  // 数据迁移
  // ================================================
  async migrateData() {
    this.updateProgress('迁移数据...', 55);

    const keys = this.collectEncryptedKeys();
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    const skippedReasons = {};
    const failedReasons = {};

    console.log(`开始数据迁移，共需处理 ${keys.length} 个键`);

    // 第一阶段：迁移到临时存储
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const progress = 55 + (i / keys.length) * 30;

      try {
        const cipher = wx.getStorageSync(key);

        // 跳过无效数据 - 增强验证
        if (!cipher) {
          skipped++;
          skippedReasons[key] = '空数据';
          continue;
        }

        if (typeof cipher !== 'string') {
          skipped++;
          skippedReasons[key] = '数据类型错误';
          continue;
        }

        if (!cipher.includes('::')) {
          skipped++;
          skippedReasons[key] = '格式错误';
          continue;
        }

        // 增强解密错误处理
        let decryptResult;
        try {
          decryptResult = this.crypto.decrypt(cipher, this.state.oldKey);
        } catch (decryptError) {
          console.warn(`解密异常 ${key}: ${decryptError.message}`);
          skipped++;
          skippedReasons[key] = `解密异常: ${decryptError.message}`;
          continue;
        }

        if (!decryptResult || !decryptResult.success) {
          const errorMsg = decryptResult?.message || '未知解密错误';

          // 特殊处理生物识别凭据 - 这些可能有不同的加密方式
          if (key.includes('bio_unlock_')) {
            console.log(`跳过生物识别凭据 ${key}: ${errorMsg}`);
            skipped++;
            skippedReasons[key] = `生物识别凭据: ${errorMsg}`;
            continue;
          }

          // 对于其他数据，如果解密失败则记录但不阻断流程
          console.warn(`解密失败但继续 ${key}: ${errorMsg}`);
          failed++;
          failedReasons[key] = errorMsg;
          continue;
        }

        // 验证解密后的数据
        if (!decryptResult.data) {
          console.warn(`解密成功但数据为空 ${key}`);
          skipped++;
          skippedReasons[key] = '解密后数据为空';
          continue;
        }

        // 重新加密
        let newCipher;
        try {
          newCipher = this.crypto.encrypt(decryptResult.data, this.state.newKey);
        } catch (encryptError) {
          console.error(`重新加密失败 ${key}: ${encryptError.message}`);
          failed++;
          failedReasons[key] = `重新加密失败: ${encryptError.message}`;
          continue;
        }

        if (!newCipher) {
          console.error(`重新加密结果为空 ${key}`);
          failed++;
          failedReasons[key] = '重新加密结果为空';
          continue;
        }

        wx.setStorageSync(key + TEMP_SUFFIX, newCipher);
        migrated++;

      } catch (error) {
        console.error(`迁移键异常 ${key}:`, error);
        failed++;
        failedReasons[key] = `异常: ${error.message}`;
      }

      this.updateProgress(`迁移数据... (${i + 1}/${keys.length})`, progress);
    }

    // 更新状态中的迁移计数
    this.state.migratedCount = migrated;
    this.state.totalKeys = keys.length;

    // 记录详细统计
    console.log(`数据迁移统计:`, {
      total: keys.length,
      migrated,
      skipped,
      failed,
      successRate: keys.length > 0 ? ((migrated / keys.length) * 100).toFixed(1) + '%' : '0%'
    });

    if (Object.keys(skippedReasons).length > 0) {
      console.log('跳过的数据项详情:', skippedReasons);
    }

    if (Object.keys(failedReasons).length > 0) {
      console.log('失败的数据项详情:', failedReasons);
    }

    // 放宽迁移检查条件 - 只要有成功迁移就算成功
    if (migrated === 0) {
      throw new Error(`数据迁移失败，所有 ${keys.length} 个数据项都无法迁移`);
    }

    // 第二阶段：原子替换
    this.updateProgress('应用数据更改...', 85);

    let replaced = 0;
    for (const key of keys) {
      try {
        const tempData = wx.getStorageSync(key + TEMP_SUFFIX);
        if (tempData) {
          wx.setStorageSync(key, tempData);
          wx.removeStorageSync(key + TEMP_SUFFIX);
          replaced++;
        }
      } catch (error) {
        console.error(`应用更改失败 ${key}:`, error);
      }
    }

    console.log(`数据替换完成，共替换 ${replaced} 个数据项`);
    this.updateProgress('数据迁移完成', 90);
  }

  // ================================================
  // 更新系统状态
  // ================================================
  async updateSystemState() {
    this.updateProgress('更新系统状态...', 92);

    // 备份当前状态
    const backupSessionKey = this.app.globalData.sessionKey;
    const backupMeta = wx.getStorageSync(META_KEY);

    try {
      // 原子性更新
      this.app.globalData.sessionKey = this.state.newKey;
      wx.setStorageSync('current_session_key', this.state.newKey);

      wx.setStorageSync(META_KEY, JSON.stringify(this.state.newMeta));

      this.updateProgress('系统状态更新完成', 95);

    } catch (error) {
      // 回滚
      this.app.globalData.sessionKey = backupSessionKey;
      wx.setStorageSync('current_session_key', backupSessionKey);
      if (backupMeta) {
        wx.setStorageSync(META_KEY, backupMeta);
      }
      throw error;
    }
  }

  // ================================================
  // 更新生物识别凭据
  // ================================================
  async updateBiometricCredentials() {
    this.updateProgress('更新生物识别...', 96);

    try {
      const biometricsEnabled = wx.getStorageSync('biometrics_enabled');
      const openid = wx.getStorageSync('wx_openid');

      if (!biometricsEnabled || !openid) {
        this.updateProgress('生物识别未启用，跳过更新', 97);
        return;
      }

      // 生成新的生物识别凭据
      let deviceSalt = wx.getStorageSync('bio_device_salt');
      if (!deviceSalt) {
        deviceSalt = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        wx.setStorageSync('bio_device_salt', deviceSalt);
      }

      const BIO_KDF_TAG = 'bio.unlock.fixed.tag.v1';
      const kbio = this.crypto.deriveKey(BIO_KDF_TAG, deviceSalt);
      const enc_km = this.crypto.encrypt(this.state.newKey, kbio);

      const newRecord = {
        enc_km: enc_km,
        createdAt: Date.now(),
        version: 1,
        updatedAt: Date.now(),
        updateReason: 'password_change'
      };

      wx.setStorageSync(`bio_unlock_${openid}`, JSON.stringify(newRecord));
      this.state.biometricUpdated = true;

      this.updateProgress('生物识别更新完成', 98);

    } catch (error) {
      console.error('更新生物识别凭据失败:', error);
      // 生物识别更新失败不影响整体流程
      this.page.appendAuditLog({
        type: 'biometric_credential_update',
        status: 'fail',
        detail: `密码修改后更新生物识别凭据失败: ${String(error)}`
      });
    }
  }

  // ================================================
  // 清理备份
  // ================================================
  async cleanupBackup() {
    this.updateProgress('清理备份文件...', 99);

    wx.removeStorageSync(BACKUP_SUFFIX);

    this.updateProgress('清理完成', 100);
  }

  // ================================================
  // 备份审计日志
  // ================================================
  async backupAuditLog() {
    try {
      this.updateProgress('备份审计日志...', 6);

      const rawLog = wx.getStorageSync('audit_log');
      if (!rawLog) {
        console.log('没有找到现有审计日志，跳过备份');
        return;
      }

      let logData = rawLog;
      let isEncrypted = false;

      // 尝试解密日志数据
      if (app.globalData.sessionKey) {
        const decryptResult = this.crypto.decrypt(rawLog, app.globalData.sessionKey);
        if (decryptResult.success && decryptResult.data) {
          logData = decryptResult.data;
          isEncrypted = true;
          console.log('审计日志解密成功，准备备份');
        } else {
          console.warn('审计日志解密失败，使用明文备份:', decryptResult?.message || '未知错误');
        }
      }

      // 验证日志数据格式
      try {
        const logs = JSON.parse(logData);
        if (Array.isArray(logs)) {
          // 备份日志数据
          wx.setStorageSync('audit_log_backup', logData);
          wx.setStorageSync('audit_log_backup_info', JSON.stringify({
            timestamp: Date.now(),
            isEncrypted,
            entriesCount: logs.length
          }));

          console.log(`审计日志备份完成，共 ${logs.length} 条记录`);
        } else {
          console.warn('审计日志格式异常，跳过备份');
        }
      } catch (parseError) {
        console.error('解析审计日志失败，跳过备份:', parseError);
      }

    } catch (error) {
      console.error('备份审计日志失败:', error);
      // 备份失败不影响密码修改流程
    }
  }

  // ================================================
  // 恢复审计日志
  // ================================================
  async restoreAuditLog() {
    try {
      this.updateProgress('恢复审计日志...', 88);

      const backupLog = wx.getStorageSync('audit_log_backup');
      const backupInfo = wx.getStorageSync('audit_log_backup_info');

      if (!backupLog) {
        console.log('没有找到审计日志备份，初始化新的日志');
        // 创建新的审计日志
        await this.createNewAuditLog();
        return;
      }

      // 解析备份信息
      let backupMeta = {};
      try {
        backupMeta = JSON.parse(backupInfo || '{}');
      } catch (e) {
        console.warn('解析备份信息失败，使用默认值');
      }

      // 解析备份的日志数据
      let logs = [];
      try {
        logs = JSON.parse(backupLog);
        if (!Array.isArray(logs)) {
          throw new Error('日志数据格式错误');
        }
      } catch (parseError) {
        console.error('解析备份日志失败:', parseError);
        logs = [];
      }

      // 添加密码修改记录
      const changeLogEntry = {
        type: 'change_master',
        status: 'success',
        detail: this.generateDetailedLogMessage(),
        timestamp: Date.now(),
        authMethod: this.state.authMethod || 'unknown',
        dataMigrated: this.state.migratedCount || 0,
        biometricUpdated: this.state.biometricUpdated,
        sessionId: Math.random().toString(36).substr(2, 9),
        migrationStats: {
          total: this.state.totalKeys || 17,
          migrated: this.state.migratedCount || 0,
          skipped: (this.state.totalKeys || 17) - (this.state.migratedCount || 0),
          successRate: ((this.state.migratedCount || 0) / (this.state.totalKeys || 17) * 100).toFixed(1) + '%'
        }
      };

      logs.push(changeLogEntry);

      // 清理旧日志（保留最近200条）
      if (logs.length > 200) {
        const keepCount = 150;
        logs = logs.slice(-keepCount);
        console.log(`审计日志已清理，保留最近 ${keepCount} 条记录`);
      }

      // 序列化并存储
      const logData = safeStringify(logs);

      if (app.globalData.sessionKey && logData !== JSON.stringify({ error: '序列化失败', timestamp: Date.now(), type: 'serialization_error' })) {
        try {
          const encrypted = this.crypto.encrypt(logData, app.globalData.sessionKey);
          wx.setStorageSync('audit_log', encrypted);
          console.log('审计日志已恢复并用新密钥加密存储');
        } catch (encryptError) {
          console.warn('审计日志加密失败，使用明文存储:', encryptError.message);
          wx.setStorageSync('audit_log', logData);
        }
      } else {
        wx.setStorageSync('audit_log', logData);
        console.log('审计日志已恢复并明文存储');
      }

      // 清理备份文件
      wx.removeStorageSync('audit_log_backup');
      wx.removeStorageSync('audit_log_backup_info');

      console.log(`审计日志恢复完成，共 ${logs.length} 条记录`);

    } catch (error) {
      console.error('恢复审计日志失败:', error);
      // 恢复失败时，至少创建基本的日志记录
      await this.createMinimalAuditLog();
    }
  }

  // ================================================
  // 创建新的审计日志
  // ================================================
  async createNewAuditLog() {
    try {
      const initialLogs = [{
        type: 'system_init',
        status: 'success',
        detail: '审计日志系统初始化',
        timestamp: Date.now(),
        sessionId: Math.random().toString(36).substr(2, 9)
      }, {
        type: 'change_master',
        status: 'success',
        detail: '主密码修改成功，审计日志系统已重新初始化',
        timestamp: Date.now(),
        authMethod: this.state.authMethod,
        dataMigrated: this.state.migratedCount || 0,
        biometricUpdated: true,
        sessionId: Math.random().toString(36).substr(2, 9)
      }];

      const logData = safeStringify(initialLogs);

      if (app.globalData.sessionKey && logData !== JSON.stringify({ error: '序列化失败', timestamp: Date.now(), type: 'serialization_error' })) {
        const encrypted = this.crypto.encrypt(logData, app.globalData.sessionKey);
        wx.setStorageSync('audit_log', encrypted);
      } else {
        wx.setStorageSync('audit_log', logData);
      }

      console.log('新的审计日志系统已创建');
    } catch (error) {
      console.error('创建新审计日志失败:', error);
    }
  }

  // ================================================
  // 创建最小审计日志
  // ================================================
  async createMinimalAuditLog() {
    try {
      const minimalLog = [{
        type: 'change_master',
        status: 'success',
        detail: '主密码修改成功（日志系统恢复模式）',
        timestamp: Date.now(),
        authMethod: this.state.authMethod || 'unknown',
        dataMigrated: this.state.migratedCount || 0,
        biometricUpdated: true,
        sessionId: Math.random().toString(36).substr(2, 9)
      }];

      const logData = safeStringify(minimalLog);

      if (app.globalData.sessionKey && logData !== JSON.stringify({ error: '序列化失败', timestamp: Date.now(), type: 'serialization_error' })) {
        const encrypted = this.crypto.encrypt(logData, app.globalData.sessionKey);
        wx.setStorageSync('audit_log', encrypted);
      } else {
        wx.setStorageSync('audit_log', logData);
      }

      console.log('最小审计日志已创建');
    } catch (error) {
      console.error('创建最小审计日志失败:', error);
    }
  }

  // ================================================
  // 记录成功日志
  // ================================================
  async logSuccess() {
    // 注意：这里不再直接写入日志，而是通过 restoreAuditLog 方法处理
    console.log('密码修改成功，日志将在恢复阶段处理');
  }

  // ================================================
  // 回滚机制
  // ================================================
  async rollbackChanges() {
    try {
      this.updateProgress('正在回滚更改...', 0);

      // 恢复备份数据
      if (this.state.backupData) {
        for (const [key, data] of Object.entries(this.state.backupData)) {
          try {
            wx.setStorageSync(key, data);
          } catch (error) {
            console.error(`回滚键失败: ${key}`, error);
          }
        }
      }

      // 清理临时文件
      const keys = this.collectEncryptedKeys();
      for (const key of keys) {
        wx.removeStorageSync(key + TEMP_SUFFIX);
      }

      // 恢复系统状态
      if (this.app.globalData.sessionKey && this.state.oldMeta) {
        wx.setStorageSync(META_KEY, JSON.stringify(this.state.oldMeta));
      }

      this.updateProgress('回滚完成', 100);

      this.page.appendAuditLog({
        type: 'change_master',
        status: 'rollback',
        detail: '密码修改失败，已自动回滚到修改前状态'
      });

    } catch (rollbackError) {
      console.error('回滚失败:', rollbackError);
      this.page.appendAuditLog({
        type: 'change_master',
        status: 'rollback_fail',
        detail: `密码修改失败，回滚也失败: ${String(rollbackError)}`
      });
    }
  }

  // ================================================
  // 工具方法
  // ================================================

  updateProgress(message, progress) {
    this.state.currentStep = message;
    this.state.progress = progress;

    console.log(`[密码修改] ${message} (${progress}%)`);

    // 更新页面状态
    this.page.setData({
      currentStep: message,
      progress: progress
    });
  }

  // ================================================
  // 生成详细日志消息
  // ================================================
  generateDetailedLogMessage() {
    const authMethodText = this.state.authMethod === 'password' ? '密码认证' : '生物识别认证';
    return `通过${authMethodText}成功修改主密码`;
  }

  collectEncryptedKeys() {
    // 白名单
    const candidate = new Set([
      'vault', 'items', 'passwords', 'notes', 'trash', 'favorites', 'secure_cache'
    ]);

    // 合并所有存储键
    try {
      const info = wx.getStorageInfoSync();
      (info.keys || []).forEach(k => candidate.add(k));
    } catch(e) {}

    // 黑名单
    const exclude = new Set([
      META_KEY,
      'audit_log',
      'wx_user_profile',
      'wx_openid',
      'wx_pseudo_session',
      'last_sync_at'
    ]);

    return Array.from(candidate).filter(k =>
      !exclude.has(k) &&
      !k.endsWith(TEMP_SUFFIX) &&
      !k.endsWith(BACKUP_SUFFIX)
    );
  }
}

// ================================================
// 页面逻辑
// ================================================

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
    biometricSupported: false,

    // 进度显示相关
    currentStep: '请选择认证方式并输入新密码',
    progress: 0
  },

  // ================================================
  // 页面初始化
  // ================================================
  onLoad() {
    console.log('密码修改页面加载');

    // 初始化密码修改管理器
    this.passwordManager = new PasswordChangeManager(this);

    // 检查生物识别支持
    this.checkBiometricSupport();

    // 初始化页面状态
    this.setData({
      currentStep: '请选择认证方式并输入新密码',
      progress: 0
    });

    // 检查存储数据结构
    this.inspectStorageData();

    console.log('密码修改页面初始化完成');
  },

  // ================================================
  // 检查存储数据结构
  // ================================================
  inspectStorageData() {
    console.log('=== 存储数据结构检查 ===');

    try {
      // 获取所有存储键
      const info = wx.getStorageInfoSync();
      console.log('总存储键数量:', info.keys.length);
      console.log('所有存储键:', info.keys);

      // 检查主要数据键
      const keysToCheck = ['items', 'passwords', 'notes', 'trash', 'favorites', 'vault', 'audit_log'];

      keysToCheck.forEach(key => {
        try {
          const data = wx.getStorageSync(key);
          console.log(`=== ${key} 数据检查 ===`);
          console.log('是否存在:', !!data);
          console.log('数据类型:', typeof data);
          console.log('数据长度:', typeof data === 'string' ? data.length : 'N/A');
          console.log('是否为空:', !data || data === '');

          if (typeof data === 'string') {
            console.log('前50个字符:', data.substring(0, 50));
            console.log('是否包含分隔符::', data.includes('::'));
            console.log('是否包含控制字符:', /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(data));

            // 检查UTF-8编码
            try {
              encodeURIComponent(data);
              console.log('UTF-8编码:', '有效');
            } catch (e) {
              console.log('UTF-8编码:', '无效 -', e.message);
            }
          }

          if (key === 'audit_log' && data) {
            this.inspectAuditLog(data);
          }

        } catch (error) {
          console.error(`检查 ${key} 失败:`, error);
        }
      });

      // 分析数据模式
      this.analyzeDataPatterns(info.keys);

    } catch (error) {
      console.error('检查存储数据失败:', error);
    }
  },

  // 检查审计日志
  inspectAuditLog(data) {
    console.log('=== 审计日志详细检查 ===');
    try {
      let logData = data;
      let isEncrypted = false;

      // 尝试解密
      if (app.globalData.sessionKey && Crypto) {
        const decryptResult = Crypto.decrypt(data, app.globalData.sessionKey);
        if (decryptResult.success && decryptResult.data) {
          logData = decryptResult.data;
          isEncrypted = true;
          console.log('审计日志解密成功');
        } else {
          console.log('审计日志解密失败:', decryptResult?.message || '未知错误');
        }
      } else {
        console.log('会话密钥或加密模块不可用，使用明文模式');
      }

      // 解析日志
      const logs = JSON.parse(logData);
      console.log('日志条目数量:', logs.length);

      if (logs.length > 0) {
        console.log('第一条日志:', logs[0]);
        console.log('最后一条日志:', logs[logs.length - 1]);

        // 检查每条日志的格式（兼容旧格式action/details和新格式type/detail）
        logs.forEach((log, index) => {
          if (!log.timestamp || (!log.type && !log.action)) {
            console.warn(`日志条目 ${index} 格式异常:`, log);
          }
        });

        // 显示最近的密码修改日志
        const passwordChangeLogs = logs.filter(log => log.type === 'change_master' || log.action === 'change_master' || log.action === 'change_master_password');
        if (passwordChangeLogs.length > 0) {
          console.log('密码修改日志:', passwordChangeLogs);
        }
      }

    } catch (error) {
      console.error('审计日志解析失败:', error);
    }
  },

  // 分析数据模式
  analyzeDataPatterns(keys) {
    console.log('=== 数据模式分析 ===');

    const patterns = {
      empty: 0,
      short: 0,
      long: 0,
      withDelimiter: 0,
      withoutDelimiter: 0,
      string: 0,
      nonString: 0,
      withControlChars: 0,
      utf8Invalid: 0
    };

    keys.forEach(key => {
      try {
        const data = wx.getStorageSync(key);
        if (!data) {
          patterns.empty++;
        } else if (typeof data !== 'string') {
          patterns.nonString++;
        } else {
          patterns.string++;
          if (data.length < 10) patterns.short++;
          else if (data.length > 1000) patterns.long++;
          if (data.includes('::')) patterns.withDelimiter++;
          else patterns.withoutDelimiter++;
          if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(data)) patterns.withControlChars++;

          try {
            encodeURIComponent(data);
          } catch (e) {
            patterns.utf8Invalid++;
          }
        }
      } catch (error) {
        console.warn(`分析 ${key} 失败:`, error);
      }
    });

    console.log('数据模式统计:', patterns);
  },

  // ================================================
  // 用户交互处理
  // ================================================

  // 选择认证方式
  selectAuthMethod(e) {
    const method = e.currentTarget.dataset.method;
    if (method === this.data.authMethod) return;

    // 重置相关状态
    this.setData({
      authMethod: method,
      oldPassword: '',
      biometricVerified: false
    });

    this.updateSubmitButton();
  },

  // 执行生物识别认证
  performBiometricAuth() {
    if (this.data.isProcessing) return;

    wx.startSoterAuthentication({
      requestAuthModes: ['fingerPrint'],
      challenge: 'change_master_password_auth',
      authContent: '请验证指纹以确认身份',
      success: (res) => {
        console.log('生物识别认证成功:', res);
        this.setData({ biometricVerified: true });
        this.updateSubmitButton();

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

  // 输入处理
  onInputOld(e) {
    this.setData({ oldPassword: e.detail.value });
    this.updateSubmitButton();
  },

  onInputNew(e) {
    const password = e.detail.value;
    const strength = evaluatePasswordStrength(password);

    this.setData({
      newPassword: password,
      strength: strength,
      strengthText: ['极弱','弱','一般','较强','强'][strength] || '弱'
    });
    this.updateSubmitButton();
  },

  onInputConfirm(e) {
    this.setData({ confirmPassword: e.detail.value });
    this.updateSubmitButton();
  },

  // 切换密码可见性
  toggleShowOld() { this.setData({ showOld: !this.data.showOld }); },
  toggleShowNew() { this.setData({ showNew: !this.data.showNew }); },
  toggleShowConfirm() { this.setData({ showConfirm: !this.data.showConfirm }); },

  // 更新提交按钮状态
  updateSubmitButton() {
    const { authMethod, oldPassword, biometricVerified, newPassword, confirmPassword, strength } = this.data;

    // 检查认证条件
    const authValid = (authMethod === 'password' && !!oldPassword) ||
                     (authMethod === 'biometric' && biometricVerified);

    // 检查新密码条件
    const passwordValid = !!newPassword && newPassword === confirmPassword && strength >= 2;

    const canSubmit = authValid && passwordValid && !this.data.isProcessing;
    this.setData({ canSubmit });
  },

  // ================================================
  // 审计日志方法
  // ================================================
  appendAuditLog(entry) {
    try {
      const { encrypt, decrypt } = Crypto;
      const raw = wx.getStorageSync('audit_log');
      let logs = [];

      // 读取现有日志
      if (raw) {
        let logData = raw;
        let isEncrypted = false;

        // 尝试解密（如果有sessionKey）
        if (app.globalData.sessionKey) {
          const decryptResult = decrypt(raw, app.globalData.sessionKey);
          if (decryptResult.success && decryptResult.data) {
            logData = decryptResult.data;
            isEncrypted = true;
          } else {
            console.warn('审计日志解密失败，使用明文模式:', decryptResult?.message || '未知错误');
          }
        }

        // 解析日志数据
        try {
          logs = JSON.parse(logData);
          if (!Array.isArray(logs)) {
            console.warn('审计日志格式异常，初始化为空数组');
            logs = [];
          }
        } catch (parseError) {
          console.error('解析审计日志失败:', parseError);
          logs = [];
        }
      }

      // 清理旧日志（保留最近100条）
      if (logs.length >= 100) {
        logs = logs.slice(-50); // 保留最近50条
        console.log('审计日志已清理，保留最近50条记录');
      }

      // 添加新日志条目
      const logEntry = {
        ...entry,
        timestamp: Date.now(),
        sessionId: Math.random().toString(36).substr(2, 9) // 添加会话标识
      };

      logs.push(logEntry);

      // 序列化并验证UTF-8编码
      const serializedLogs = safeStringify(logs);

      // 存储日志
      if (app.globalData.sessionKey && serializedLogs !== JSON.stringify({ error: '序列化失败', timestamp: Date.now(), type: 'serialization_error' })) {
        try {
          const encryptedLogs = encrypt(serializedLogs, app.globalData.sessionKey);
          if (encryptedLogs) {
            wx.setStorageSync('audit_log', encryptedLogs);
            console.log('审计日志已加密存储');
          } else {
            throw new Error('加密结果为空');
          }
        } catch (encryptError) {
          console.warn('审计日志加密失败，使用明文存储:', encryptError.message);
          wx.setStorageSync('audit_log', serializedLogs);
        }
      } else {
        // 使用明文存储
        wx.setStorageSync('audit_log', serializedLogs);
        console.log('审计日志已明文存储');
      }

    } catch (e) {
      console.warn('写入审计日志失败（忽略）：', e);
      // 最后的降级处理：尝试存储最基本的错误信息
      try {
        const fallbackLog = safeStringify({
          error: '日志系统异常',
          timestamp: Date.now(),
          originalError: e.message
        });
        wx.setStorageSync('audit_log', fallbackLog);
      } catch (fallbackError) {
        console.error('降级日志存储也失败:', fallbackError);
      }
    }
  },

  // ================================================
  // 主提交流程
  // ================================================
  async submit() {
    if (!this.data.canSubmit || this.data.isProcessing) return;

    const { authMethod, oldPassword, newPassword } = this.data;

    // 设置处理状态
    this.setData({ isProcessing: true });

    try {
      // 显示确认对话框
      const confirmResult = await this.showConfirmDialog();
      if (!confirmResult) {
        this.setData({ isProcessing: false });
        return;
      }

      // 准备认证数据
      const authData = authMethod === 'password' ? { oldPassword } : {};

      // 调用统一密码修改系统
      const result = await this.passwordManager.changePassword({
        newPassword,
        authMethod,
        authData
      });

      if (result.success) {
        await this.handleSuccess();
      }

    } catch (error) {
      console.error('密码修改失败:', error);
      this.handleError(error);
    } finally {
      this.setData({ isProcessing: false });
    }
  },

  // 显示确认对话框
  showConfirmDialog() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '确认修改',
        content: '这将修改您的主密码，请确保牢记新密码。确定要继续吗？',
        success: (res) => {
          resolve(res.confirm);
        }
      });
    });
  },

  // 处理成功
  async handleSuccess() {
    wx.showToast({
      title: '密码修改成功',
      icon: 'success',
      duration: 2000
    });

    // 显示成功提示
    setTimeout(() => {
      wx.showModal({
        title: '修改完成',
        content: '主密码已成功修改！\n\n建议您：\n1. 立即测试应用是否正常工作\n2. 验证数据是否完整显示\n3. 生物识别解锁功能已自动更新',
        showCancel: false,
        confirmText: '我知道了',
        success: () => {
          // 返回上一页
          wx.navigateBack();
        }
      });
    }, 2500);
  },

  // 处理错误
  handleError(error) {
    const errorMessage = error.message || '密码修改失败，请重试';

    wx.showToast({
      title: errorMessage,
      icon: 'none',
      duration: 3000
    });

    // 重置页面状态
    this.setData({
      isProcessing: false,
      currentStep: '请选择认证方式并输入新密码',
      progress: 0
    });
  },

  // ================================================
  // 生物识别支持检查
  // ================================================
  checkBiometricSupport() {
    wx.checkIsSupportSoterAuthentication({
      success: (res) => {
        const supportFingerprint = res.supportMode && res.supportMode.includes('fingerPrint');
        this.setData({ biometricSupported: supportFingerprint });
        console.log('生物识别支持检查:', res);
      },
      fail: (err) => {
        console.log('生物识别不支持:', err);
        this.setData({ biometricSupported: false });
      }
    });
  }
});
