// 文件路径: pages/trash/trash.js
const app = getApp();
const { encrypt, decrypt } = require('../../utils/crypto-helper.js');

Page({
  data: {
    deletedItems: []
  },

  onShow() {
    // 使用 onShow 是为了每次进入页面都能刷新数据
    this.loadTrashItems();
  },

  loadTrashItems() {
    const sessionKey = app.globalData.sessionKey;
    if (!sessionKey) {
      wx.showToast({ title: '会话已过期', icon: 'none' });
      return;
    }

    try {
      const encryptedVault = wx.getStorageSync('vault');
      if (encryptedVault) {
        const decryptResult = decrypt(encryptedVault, sessionKey);
        if (!decryptResult.success) {
          console.error("解密失败:", decryptResult.message);
          wx.showToast({ title: `数据解密失败: ${decryptResult.message}`, icon: 'error' });
          return;
        }

        let vault = [];
        try {
          vault = JSON.parse(decryptResult.data || '[]');
        } catch (parseError) {
          console.error('解析密码库数据失败:', parseError);
          wx.showToast({ title: '数据解析失败', icon: 'error' });
          return;
        }

        const deleted = vault
          .filter(item => item.status === 'deleted')
          .map(item => {
            // [优化] 格式化删除时间，方便显示
            item.formattedDeletedAt = new Date(item.deletedAt).toLocaleString();
            return item;
          });

        this.setData({ deletedItems: deleted });
      }
    } catch (e) {
      console.error("加载回收站失败:", e);
      wx.showToast({ title: '加载数据出错', icon: 'error' });
    }
  },

  // 核心操作：恢复
  onRestore(e) {
    const id = e.currentTarget.dataset.id;
    this._updateVault(id, 'restore');
  },

  // 核心操作：彻底删除
  onPermanentlyDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '此操作将永久删除该条目，无法恢复。您确定吗？',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          this._updateVault(id, 'delete');
        }
      }
    });
  },

  // 私有辅助函数，用于统一处理数据更新和保存
  _updateVault(itemId, action) {
    const sessionKey = app.globalData.sessionKey;
    if (!sessionKey) return;

    wx.showLoading({ title: '处理中...' });

    try {
      const encryptedVault = wx.getStorageSync('vault');
      if (!encryptedVault) {
        wx.hideLoading();
        wx.showToast({ title: '数据不存在', icon: 'none' });
        return;
      }

      const decryptResult = decrypt(encryptedVault, sessionKey);
      if (!decryptResult.success) {
        wx.hideLoading();
        console.error("解密失败:", decryptResult.message);
        wx.showToast({ title: `数据解密失败: ${decryptResult.message}`, icon: 'error' });
        return;
      }

      let vault = [];
      try {
        vault = JSON.parse(decryptResult.data || '[]');
      } catch (parseError) {
        wx.hideLoading();
        console.error('解析密码库数据失败:', parseError);
        wx.showToast({ title: '数据解析失败', icon: 'error' });
        return;
      }

      let newVault;
      if (action === 'restore') {
        newVault = vault.map(item => {
          if (item.id === itemId) {
            // 改回 active 状态，并清空删除标记
            return { ...item, status: 'active', deletedAt: null };
          }
          return item;
        });
      } else if (action === 'delete') {
        newVault = vault.filter(item => item.id !== itemId);
      }

      const newEncryptedVault = encrypt(JSON.stringify(newVault), sessionKey);
      wx.setStorageSync('vault', newEncryptedVault);

      wx.hideLoading();
      wx.showToast({ title: '操作成功', icon: 'success' });

      // 记录审计日志
      const item = this.data.deletedItems.find(item => item.id === itemId);
      if (item) {
        const itemTitle = item.title || '未命名项目';
        if (action === 'restore') {
          app.addAuditLog('restore_item', `从回收站恢复了项目: ${itemTitle}`);
        } else if (action === 'delete') {
          app.addAuditLog('permanently_delete_item', `彻底删除了项目: ${itemTitle}`);
        }
      }

      // [核心] 操作成功后，立即刷新当前页面的列表，无需重新从storage读取
      const updatedDeletedItems = this.data.deletedItems.filter(item => item.id !== itemId);
      this.setData({ deletedItems: updatedDeletedItems });

      // [新增] 设置全局刷新标志，让首页能够检测到数据变更
      if (app.globalData.needsRefresh && app.globalData.needsRefresh.index) {
        if (action === 'restore') {
          // 恢复操作相当于新增操作
          console.log('设置恢复操作刷新标志');
          app.globalData.needsRefresh.index.add.needed = true;
          app.globalData.needsRefresh.index.add.timestamp = Date.now();
        } else if (action === 'delete') {
          // 彻底删除操作
          console.log('设置彻底删除操作刷新标志');
          app.globalData.needsRefresh.index.delete.needed = true;
          app.globalData.needsRefresh.index.delete.timestamp = Date.now();
        }
      }

    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'error' });
      console.error("更新Vault失败:", err);
    }
  }
});
