// 文件路径: app.js
App({
  globalData: {
    sessionKey: null,
    isLocked: true,
    biometricsEnabled: false, // 新增：生物识别是否开启的全局状态
    // [新增] 生物识别状态管理
    biometricUnlockCompleted: false, // 是否已完成生物识别解锁
    biometricCheckInProgress: false, // 是否正在进行生物识别检查
    unlockPageReady: false, // 解锁页面是否已准备就绪
    isNavigatingToHome: false, // [新增] 是否正在跳转到首页，防止重复检查
    // [优化] 智能刷新系统，区分操作类型和时间戳
    needsRefresh: {
      index: {
        add: { needed: false, timestamp: 0 },      // 新增操作
        edit: { needed: false, timestamp: 0 },     // 编辑操作
        delete: { needed: false, timestamp: 0 },   // 删除操作
        viewOnly: { needed: false, timestamp: 0 }  // 只查看，不需要刷新
      },
      trash: false,
      securityReport: false, // 新增：安全报告页刷新标志
      userProfile: false, // 新增：用户资料刷新标志
    }
  },

  // [新增] 全局选择状态管理器 - 彻底解决蓝边问题
  selectionStateManager: {
    // 清空所有页面的选择状态
    clearAllSelectionStates() {
      console.log('全局选择状态管理器：开始清空所有页面选择状态');
      const pages = getCurrentPages();

      pages.forEach(page => {
        const route = page.route;
        console.log(`处理页面: ${route}`);

        // 首页
        if (route === 'pages/index/index' && page.clearSelectionState) {
          page.clearSelectionState();
          console.log('首页选择状态已清空');
        }

        // 数据管理页
        if (route === 'pages/settings/data-management' && page.clearSelectionState) {
          page.clearSelectionState();
          console.log('数据管理页选择状态已清空');
        }

        // 设置页面的选择状态
        if (page.setData) {
          page.setData({
            selectionMode: false,
            selectedItems: [],
            showBatchToolbar: false,
            isAllSelected: false
          });
        }
      });

      console.log('全局选择状态管理器：所有页面选择状态已清空');
    },

    // 验证所有页面状态
    validateSelectionStates() {
      const pages = getCurrentPages();
      let hasSelectionState = false;

      pages.forEach(page => {
        if (page.data) {
          if (page.data.selectionMode || (page.data.selectedItems && page.data.selectedItems.length > 0)) {
            hasSelectionState = true;
            console.log(`页面 ${page.route} 仍有选择状态:`, {
              selectionMode: page.data.selectionMode,
              selectedItems: page.data.selectedItems
            });
          }
        }
      });

      return !hasSelectionState;
    },

    // 强制同步所有页面状态
    forceSyncSelectionStates() {
      console.log('强制同步所有页面选择状态');
      this.clearAllSelectionStates();

      // 延迟验证
      setTimeout(() => {
        const isClean = this.validateSelectionStates();
        console.log(`选择状态同步结果: ${isClean ? '成功' : '仍有残留'}`);
      }, 100);
    }
  },

  // [优化] 生物识别状态管理器 - 增强版，支持取消后的持久禁用
  biometricStateManager: {
    // 获取App实例，确保globalData可用
    getApp() {
      const app = getApp();
      if (!app || !app.globalData) {
        console.error('生物识别状态管理器：无法获取App实例或globalData');
        return null;
      }
      return app;
    },

    // 重置生物识别状态（用于新解锁会话）
    resetBiometricState() {
      console.log('生物识别状态管理器：重置状态');
      const app = this.getApp();
      if (!app) return;

      app.globalData.biometricUnlockCompleted = false;
      app.globalData.biometricCheckInProgress = false;
      app.globalData.unlockPageReady = false;
    },

    // 标记生物识别解锁已完成
    markBiometricUnlockCompleted() {
      console.log('生物识别状态管理器：标记解锁完成');
      const app = this.getApp();
      if (!app) return;

      app.globalData.biometricUnlockCompleted = true;
      app.globalData.biometricCheckInProgress = false;
      // 解锁成功后清除用户取消记录
      wx.removeStorageSync('biometric_user_cancelled');
      wx.removeStorageSync('biometric_cancel_timestamp');
    },

    // 检查是否可以进行生物识别（增强版）
    canPerformBiometricCheck(ignoreCancelCheck = false) {
      console.log('生物识别状态管理器：检查是否可以进行生物识别', { ignoreCancelCheck });

      const app = this.getApp();
      if (!app) {
        console.log('生物识别状态管理器：无法获取App实例');
        return false;
      }

      // [关键修复] 0. 首先检查是否在解锁页面 - 首页绝对不允许
      if (!this.isOnUnlockPage()) {
        console.log('生物识别状态管理器：不在解锁页面，绝对禁止生物识别');
        return false;
      }

      // [新增] 安全检查：如果全局防护标志已设置，绝对禁止
      if (app.globalData.biometricUnlockCompleted === true &&
          app.globalData.isLocked === false &&
          app.globalData.biometricCheckInProgress === false) {
        console.log('生物识别状态管理器：检测到首页防护标志，绝对禁止生物识别');
        return false;
      }

      // 1. 检查应用是否已解锁
      if (!app.globalData.isLocked) {
        console.log('生物识别状态管理器：应用已解锁，跳过生物识别');
        return false;
      }

      // 2. 检查生物识别是否已完成
      if (app.globalData.biometricUnlockCompleted) {
        console.log('生物识别状态管理器：生物识别已完成，跳过');
        return false;
      }

      // 3. 检查是否正在进行中
      if (app.globalData.biometricCheckInProgress) {
        console.log('生物识别状态管理器：正在进行中，跳过');
        return false;
      }

      // 4. 检查用户是否取消了生物识别（30分钟内不再弹窗）
      if (!ignoreCancelCheck) {
        const cancelTimestamp = wx.getStorageSync('biometric_cancel_timestamp');
        if (cancelTimestamp) {
          const now = Date.now();
          const timeDiff = now - cancelTimestamp;
          const thirtyMinutes = 30 * 60 * 1000;

          if (timeDiff < thirtyMinutes) {
            console.log('生物识别状态管理器：用户最近取消，跳过弹窗');
            return false;
          } else {
            // 30分钟后清除记录
            wx.removeStorageSync('biometric_user_cancelled');
            wx.removeStorageSync('biometric_cancel_timestamp');
          }
        }
      }

      console.log('生物识别状态管理器：可以执行生物识别');
      return true;
    },

    // 开始生物识别检查
    startBiometricCheck() {
      console.log('生物识别状态管理器：开始检查');
      const app = this.getApp();
      if (!app) return;

      app.globalData.biometricCheckInProgress = true;
    },

    // 结束生物识别检查
    endBiometricCheck() {
      console.log('生物识别状态管理器：结束检查');
      const app = this.getApp();
      if (!app) return;

      app.globalData.biometricCheckInProgress = false;
    },

    // 标记解锁页面准备就绪
    markUnlockPageReady() {
      console.log('生物识别状态管理器：解锁页面准备就绪');
      const app = this.getApp();
      if (!app) return;

      app.globalData.unlockPageReady = true;
    },

    // 检查是否在解锁页面
    isOnUnlockPage() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      return currentPage && currentPage.route === 'pages/unlock/unlock';
    },

    // [新增] 记录用户取消生物识别
    recordUserCancelledBiometric() {
      console.log('生物识别状态管理器：记录用户取消');
      const now = Date.now();
      wx.setStorageSync('biometric_user_cancelled', true);
      wx.setStorageSync('biometric_cancel_timestamp', now);
    },

    // [新增] 检查是否应该自动弹窗（结合页面级状态）
    shouldAutoShowBiometricPrompt(pageInstance, ignoreCancelCheck = false) {
      console.log('生物识别状态管理器：检查是否应该自动弹窗', { ignoreCancelCheck });

      // 1. 全局条件检查
      if (!this.canPerformBiometricCheck(ignoreCancelCheck)) {
        return false;
      }

      // 2. 页面级条件检查
      if (!pageInstance || !pageInstance.data || !pageInstance.data.pageReady) {
        console.log('生物识别状态管理器：页面未渲染完成');
        return false;
      }

      if (pageInstance.data.isAutoTriedBio) {
        console.log('生物识别状态管理器：已尝试过自动弹窗');
        return false;
      }

      if (pageInstance.data.biometricCompleted) {
        console.log('生物识别状态管理器：生物识别已完成');
        return false;
      }

      // 3. 检查生物识别开关
      const biometricsEnabled = wx.getStorageSync('biometrics_enabled');
      if (!biometricsEnabled) {
        console.log('生物识别状态管理器：生物识别未启用');
        return false;
      }

      console.log('生物识别状态管理器：应该自动弹窗');
      return true;
    }
  },

  // 初始化刷新标志
  initRefreshFlags() {
    this.globalData.needsRefresh = {
      index: {
        add: { needed: false, timestamp: 0 },
        edit: { needed: false, timestamp: 0 },
        delete: { needed: false, timestamp: 0 },
        viewOnly: { needed: false, timestamp: 0 }
      },
      trash: false,
      securityReport: false,
      userProfile: false,
    };
  },

  onLaunch() {
    // 读取生物识别状态
    this.globalData.biometricsEnabled = wx.getStorageSync('biometrics_enabled') !== null ? wx.getStorageSync('biometrics_enabled') : true;

    // 检查是否已初始化
    const isInitialized = wx.getStorageSync('is_initialized');
    if (!isInitialized) {
      wx.redirectTo({ url: '/pages/setup/setup' });
      return; // 阻止后续逻辑执行
    }

    // 启动后统一跳转到解锁页（移除任何对 test-qr 的潜在间接引用）
    wx.redirectTo({ url: '/pages/unlock/unlock' });
  },

  onShow() {
    // 每次从后台唤醒时，如果应用未锁定且不是在解锁页，则检查是否需要锁定
    // 锁定逻辑主要在 unlock 页的 onShow 中处理，这里只做跳转判断
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    if (this.globalData.isLocked && currentPage && currentPage.route !== 'pages/unlock/unlock') {
      wx.redirectTo({ url: '/pages/unlock/unlock' });
    }
  },

  // 【修复】全局审计日志记录函数 - 适配新的解密格式
  addAuditLog(action, details = '') {
    const { encrypt, decrypt } = require('./utils/crypto-helper.js'); // 动态引入，避免循环依赖
    const sessionKey = this.globalData.sessionKey;

    if (!sessionKey) {
      console.warn("SessionKey not available, cannot record encrypted audit log.");
      return;
    }

    try {
      const encryptedLogs = wx.getStorageSync('audit_log');
      let logs = [];
      if (encryptedLogs) {
        const decryptResult = decrypt(encryptedLogs, sessionKey);
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
      }

      const newLog = {
        timestamp: new Date().toISOString(),
        action: action,
        details: details
      };
      logs.push(newLog);

      const newEncryptedLogs = encrypt(JSON.stringify(logs), sessionKey);
      wx.setStorageSync('audit_log', newEncryptedLogs);
    } catch (e) {
      console.error("记录审计日志失败:", e);
    }
  },

  // ===== 紧急数据恢复功能 =====

  // 检查是否存在数据恢复备份
  checkDataRecoveryBackup() {
    try {
      const backupData = wx.getStorageSync('__migration_backup__');
      const recoveryMeta = wx.getStorageSync('__recovery_meta__');

      if (backupData && recoveryMeta) {
        console.log('检测到数据恢复备份，准备恢复选项');
        return { hasBackup: true, backupData, recoveryMeta };
      }

      return { hasBackup: false };
    } catch (e) {
      console.error('检查恢复备份失败:', e);
      return { hasBackup: false };
    }
  },

  // 提供数据恢复选项
  offerDataRecovery() {
    const recovery = this.checkDataRecoveryBackup();

    if (!recovery.hasBackup) {
      console.log('没有找到数据恢复备份');
      return;
    }

    wx.showModal({
      title: '数据恢复检测',
      content: '检测到您有数据修改失败的备份。是否要恢复之前的数据？',
      confirmText: '恢复数据',
      cancelText: '稍后再说',
      success: (res) => {
        if (res.confirm) {
          this.performDataRecovery(recovery.backupData, recovery.recoveryMeta);
        }
      }
    });
  },

  // 执行数据恢复
  performDataRecovery(backupData, recoveryMeta) {
    wx.showLoading({
      title: '正在恢复数据...',
      mask: true
    });

    try {
      const backup = JSON.parse(backupData);
      const meta = JSON.parse(recoveryMeta);

      // 恢复数据
      let recoveredCount = 0;
      for (const [key, value] of Object.entries(backup)) {
        if (value) {
          wx.setStorageSync(key, value);
          recoveredCount++;
        }
      }

      // 恢复元信息
      if (meta.originalMeta) {
        wx.setStorageSync('vault_meta', JSON.stringify(meta.originalMeta));
      }

      // 恢复sessionKey
      if (meta.sessionKey) {
        this.globalData.sessionKey = meta.sessionKey;
        wx.setStorageSync('current_session_key', meta.sessionKey);
      }

      // 清理备份
      wx.removeStorageSync('__migration_backup__');
      wx.removeStorageSync('__recovery_meta__');

      wx.hideLoading();
      wx.showToast({
        title: `成功恢复 ${recoveredCount} 项数据`,
        icon: 'success',
        duration: 3000
      });

      // 提示用户重新启动应用
      setTimeout(() => {
        wx.showModal({
          title: '恢复完成',
          content: '数据已恢复完成，请重新启动应用以确保一切正常工作。',
          showCancel: false,
          confirmText: '我知道了'
        });
      }, 3500);

    } catch (e) {
      wx.hideLoading();
      console.error('数据恢复失败:', e);
      wx.showToast({
        title: '恢复失败，请联系技术支持',
        icon: 'none',
        duration: 3000
      });
    }
  },

  // 在应用启动时检查恢复选项
  checkRecoveryOnLaunch() {
    setTimeout(() => {
      this.offerDataRecovery();
    }, 2000);
  }
});
