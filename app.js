// 文件路径: app.js
App({
  globalData: {
    sessionKey: null,
    isLocked: true,
    biometricsEnabled: false, // 新增：生物识别是否开启的全局状态
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
    this.globalData.biometricsEnabled = wx.getStorageSync('biometrics_enabled') || false;

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
  }
})
