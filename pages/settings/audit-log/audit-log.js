const app = getApp();
const { decrypt } = require('../../../utils/crypto-helper.js');

Page({
  data: {
    auditLogs: [],
  },

  onShow() {
    this.loadAuditLogs();
  },

  loadAuditLogs() {
    wx.showLoading({ title: '加载日志中...' });
    try {
      const encryptedLogs = wx.getStorageSync('audit_log');
      if (!encryptedLogs) {
        this.setData({ auditLogs: [] });
        wx.hideLoading();
        return;
      }

      const sessionKey = app.globalData.sessionKey;
      if (!sessionKey) {
        wx.hideLoading();
        wx.showToast({ title: '会话已过期，无法加载日志', icon: 'none' });
        return;
      }

      const decryptResult = decrypt(encryptedLogs, sessionKey);
      let logs = [];
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

      // 格式化时间为简洁格式
      logs.forEach(log => {
        const date = new Date(log.timestamp);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const year = date.getFullYear().toString().slice(2);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        log.formattedTime = `${year}.${month}.${day} ${hours}:${minutes}`;
      });

      this.setData({ auditLogs: logs.reverse() }); // 最新日志在前
      wx.hideLoading();

    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '加载日志失败', icon: 'error' });
      console.error("加载审计日志失败:", e);
    }
  },

  // 获取操作类型的中文描述
  getActionText(action) {
    const actionMap = {
      'login_success': '登录成功',
      'login_fail': '登录失败',
      'export_full': '导出完整库',
      'import_single': '导入单条',
      'export_single_item_qrcode': '导出二维码',
      'change_master_password': '修改主密码',
      'enable_biometrics': '启用生物识别',
      'disable_biometrics': '关闭生物识别',
      // 新增密码管理相关操作
      'add_password': '添加密码',
      'delete_password': '删除密码',
      'edit_password': '编辑密码',
      'copy_password': '复制密码',
      'generate_password': '生成密码',
      'view_password_history': '查看密码历史',
      // 新增用户相关操作
      'update_profile': '更新资料',
      'change_avatar': '更换头像',
      'view_security_report': '查看安全报告',
      'export_audit_log': '导出操作日志',
      'clear_audit_log': '清空操作日志'
    };
    return actionMap[action] || action;
  },

  // 获取最近N天的日志数量
  getRecentLogs(days) {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);

    return this.data.auditLogs.filter(log => new Date(log.timestamp) >= cutoff);
  },

  // 导出日志功能
  exportLogs() {
    const logs = this.data.auditLogs;
    if (logs.length === 0) {
      wx.showToast({ title: '暂无日志可导出', icon: 'none' });
      return;
    }

    const logText = logs.map(log => {
      return `${log.formattedTime} - ${this.getActionText(log.action)} - ${log.details}`;
    }).join('\n');

    wx.setClipboardData({
      data: logText,
      success: () => {
        wx.showToast({ title: '日志已复制到剪贴板', icon: 'success' });
        // 记录导出操作
        app.addAuditLog('export_audit_log', `导出了${logs.length}条日志`);
      }
    });
  },

  // 清空日志功能
  clearLogs() {
    wx.showModal({
      title: '清空日志',
      content: '确定要清空所有审计日志吗？此操作不可恢复。',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          const logCount = this.data.auditLogs.length;
          wx.removeStorageSync('audit_log');
          this.setData({ auditLogs: [] });
          wx.showToast({ title: '日志已清空', icon: 'success' });
          // 记录清空操作
          app.addAuditLog('clear_audit_log', `清空了${logCount}条日志`);
        }
      }
    });
  }
});
