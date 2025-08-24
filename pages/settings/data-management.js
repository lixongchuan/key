/* 数据管理页面 - 苹果风格现代化重塑 */
const app = getApp();
const { decrypt, encrypt, deriveKey } = require('../../utils/crypto-helper.js');
const exportHelper = require('../../utils/export-helper.js');

Page({
  data: {
    // 数据列表
    vault: [],
    selectedItems: [],
    isAllSelected: false,

    // 导出相关
    exportPwd: '',
    exportPwdVisible: false,
    exportStatus: null, // 导出状态信息

    // 导入相关
    importMeta: null,
    importRawText: '',
    importReadyForPwd: false,
    importPwd: '',
    importPwdVisible: false
  },

  onLoad() {
    console.log('=== 数据管理页面加载 ===');
    this.loadVaultData();
  },

  onShow() {
    console.log('=== 数据管理页面显示 ===');
    console.log('页面数据状态:', this.data);

    // [新增] 页面显示时检查并清理选择状态（防呆机制）
    if (this.data.selectedItems && this.data.selectedItems.length > 0) {
      console.log('检测到遗留的选择状态，自动清理');
      this.clearSelectionState();
    }
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab && tab !== this.data.tab) {
      this.setData({ tab });
    }
  },

  loadVaultData() {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const encryptedVault = wx.getStorageSync('vault');
      if (!encryptedVault) {
        this.setData({
          vault: [],
          isAllSelected: false
        });
        wx.hideLoading();
        return;
      }

      const decryptResult = decrypt(encryptedVault, app.globalData.sessionKey);
      if (!decryptResult.success) {
        console.error("解密失败:", decryptResult.message);
        wx.showToast({ title: `数据解密失败: ${decryptResult.message}`, icon: 'error' });
        wx.hideLoading();
        return;
      }

      let vault = [];
      try {
        vault = JSON.parse(decryptResult.data || '[]').filter(i => i.status === 'active');
      } catch (parseError) {
        console.error('解析密码库数据失败:', parseError);
        wx.showToast({ title: '数据解析失败', icon: 'error' });
        wx.hideLoading();
        return;
      }

      const selectedSet = new Set(this.data.selectedItems);
      vault = vault.map(it => ({ ...it, selected: selectedSet.has(it.id) }));
      this.setData({
        vault,
        isAllSelected: vault.length > 0 && selectedSet.size === vault.length
      });
    } catch (e) {
      console.error('加载密码库数据失败:', e);
      wx.showToast({ title: '数据加载失败', icon: 'error' });
    } finally {
      wx.hideLoading();
    }
  },

  onExportPwdInput(e) { this.setData({ exportPwd: e.detail.value }); },
  toggleExportPwdVisible() { this.setData({ exportPwdVisible: !this.data.exportPwdVisible }); },

  onToggleSelectAll(e) {
    const isAllSelected = e.detail.value.length > 0;
    const vault = this.data.vault.map(item => ({ ...item, selected: isAllSelected }));
    const selectedItems = isAllSelected ? vault.map(it => it.id) : [];
    this.setData({ isAllSelected, vault, selectedItems });
    this.updateExportPreviewLength();
  },

  onItemSelect(e) {
    const selectedIds = e.detail.value || [];
    const vault = this.data.vault.map(it => ({ ...it, selected: selectedIds.includes(it.id) }));
    this.setData({
      vault,
      selectedItems: selectedIds,
      isAllSelected: selectedIds.length === this.data.vault.length && this.data.vault.length > 0
    });
    this.updateExportPreviewLength();
  },

  updateExportPreviewLength() {
    try {
      const items = this.data.vault.filter(it => it.selected);
      this.setData({ exportedPreviewLength: JSON.stringify(items).length });
    } catch {
      this.setData({ exportedPreviewLength: 0 });
    }
  },

  ensureExportPwdAndSelected() {
    if (this.data.vault.filter(it => it.selected).length === 0) {
      wx.showToast({ title: '请选择至少一条记录', icon: 'none' });
      return false;
    }
    if (!this.data.exportPwd) {
      wx.showToast({ title: '请先在上方输入临时密码', icon: 'none' });
      return false;
    }
    return true;
  },

  buildExportPayloadStringWithPwd() {
    try {
      const items = this.data.vault.filter(it => it.selected);
      const itemsJson = JSON.stringify(items);
      const saltBytes = new Uint8Array(16);
      for (let i = 0; i < saltBytes.length; i++) saltBytes[i] = Math.floor(Math.random() * 256);
      const saltBase64 = wx.arrayBufferToBase64(saltBytes.buffer);
      const tempKey = deriveKey(this.data.exportPwd, saltBase64);
      const transit = encrypt(itemsJson, tempKey);
      return exportHelper.makeExportJson({ salt: saltBase64, iv: '', encryptedData: transit });
    } catch (e) {
      console.error('buildExportPayloadString failed', e);
      wx.showToast({ title: '导出失败：' + (e.message || '请重试'), icon: 'error' });
      return null;
    }
  },

  // 导出文件功能
  doExportFile() {
    console.log('=== 开始导出操作 ===');
    console.log('当前数据状态:', {
      selectedItems: this.data.selectedItems,
      exportPwd: this.data.exportPwd,
      vault: this.data.vault
    });

    // 检查导出条件
    if (!this.ensureExportPwdAndSelected()) {
      console.log('导出条件检查失败');
      return;
    }

    console.log('导出条件检查通过');

    const selectedCount = this.data.selectedItems.length;
    console.log('选中条目数量:', selectedCount);

    const exportedDataString = this.buildExportPayloadStringWithPwd();
    if (!exportedDataString) {
      console.log('构建导出数据失败');
      return;
    }

    console.log('导出数据构建成功，长度:', exportedDataString.length);

    wx.showLoading({ title: '正在加密导出...', mask: true });

    const fs = wx.getFileSystemManager();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = `${wx.env.USER_DATA_PATH}/codesafe_export_${timestamp}.json`;

    console.log('文件路径:', filePath);

    fs.writeFile({
      filePath,
      data: exportedDataString,
      encoding: 'utf8',
      success: (res) => {
        console.log('文件写入成功:', res);
        wx.hideLoading();
        this.showExportSuccess(filePath, selectedCount);
      },
      fail: (err) => {
        console.error('文件写入失败:', err);
        wx.hideLoading();
        this.showExportError('写入文件失败，请重试');
      }
    });
  },

  // 显示导出成功状态（仅在文件生成后显示）
  showExportSuccess(filePath, count) {
    console.log('=== 显示导出成功状态 ===');
    console.log('文件路径:', filePath);
    console.log('导出条目数量:', count);

    // 记录导出操作的审计日志
    app.addAuditLog('export_data', `导出了 ${count} 条数据到文件`);

    // [关键修复] 导出成功后立即清空所有选择状态
    this.clearSelectionState();
    console.log('导出成功：已清空数据管理页选择状态');

    // 使用全局选择状态管理器清空所有页面状态
    if (app.selectionStateManager) {
      app.selectionStateManager.clearAllSelectionStates();
      console.log('导出成功：已调用全局选择状态管理器');
    }

    this.setData({
      exportStatus: {
        type: 'success',
        title: '文件已生成',
        message: `已成功导出 ${count} 条密码数据到文件`,
        icon: '/images/icon-shield-check.png'
      }
    });

    // 自动消失状态提示（1.5秒后）
    this.autoHideStatus();

    // 立即显示分享选项（移除延迟）
    console.log('准备显示分享选项...');
    this.showShareOptions(filePath, count);
  },

  // 直接显示文件位置信息
  showShareOptions(filePath, count) {
    console.log('=== 显示分享选项 ===');
    console.log('文件路径:', filePath);
    console.log('条目数量:', count);

    wx.showModal({
      title: '文件已导出',
      content: `已成功导出 ${count} 条密码数据到文件\n\n文件位置：${filePath}\n\n您可以通过手机系统文件管理器找到此文件。`,
      confirmText: '复制路径',
      cancelText: '其他应用',
      success: (res) => {
        console.log('用户选择结果:', res);
        if (res.confirm) {
          console.log('用户选择复制路径');
          this.copyFilePath(filePath);
        } else if (res.cancel) {
          console.log('用户选择使用其他应用打开');
          this.shareWithOtherApp(filePath, count);
        }
      },
      fail: (err) => {
        console.error('显示分享选项失败:', err);
      }
    });
  },



  // 使用其他应用打开
  openWithOtherApp(filePath) {
    wx.showModal({
      title: '打开文件',
      content: '将尝试使用系统默认应用打开文件',
      success: (res) => {
        if (res.confirm) {
          wx.openDocument({
            filePath,
            showMenu: true,
            success: () => {
              wx.showToast({ title: '文件已打开', icon: 'success' });
            },
            fail: (err) => {
              console.error('打开文件失败:', err);
              this.showFileLocation(filePath);
            }
          });
        }
      }
    });
  },

  // 显示文件位置
  showFileLocation(filePath) {
    wx.showModal({
      title: '文件已保存',
      content: `文件位置：\n${filePath}\n\n您可以在手机文件管理器中找到此文件。`,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 使用其他应用分享（直接打开，无需确认弹窗）
  shareWithOtherApp(filePath, count) {
    this.openWithOtherApp(filePath);
  },

  // 复制文件路径
  copyFilePath(filePath) {
    wx.setClipboardData({
      data: filePath,
      success: () => {
        wx.showToast({ title: '文件路径已复制', icon: 'success' });
      }
    });
  },

  // 显示错误状态
  showExportError(message) {
    this.setData({
      exportStatus: {
        type: 'error',
        title: '导出失败',
        message: message,
        icon: '/images/icon-alert.png'
      }
    });

    // 自动消失状态提示（2秒后）
    this.autoHideStatus(2000);
  },

  // 自动隐藏状态提示
  autoHideStatus(delay = 1500) {
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
    }

    this.statusTimer = setTimeout(() => {
      this.setData({
        exportStatus: null
      });
    }, delay);
  },

  // [新增] 清空选择状态方法
  clearSelectionState() {
    console.log('数据管理页：清空选择状态');
    this.setData({
      selectedItems: [],
      isAllSelected: false,
      vault: this.data.vault.map(item => ({ ...item, selected: false }))
    });
  },

  // 页面卸载时清理定时器
  onUnload() {
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
    }
  },
  
  // 导入文件功能
  importFromFile() {
    wx.showLoading({ title: '选择文件', mask: true });

    const handleRead = (path) => {
      wx.getFileSystemManager().readFile({
        filePath: path,
        encoding: 'utf8',
        success: (res) => {
          wx.hideLoading();
          this.afterImportRawLoaded(res.data);
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({ title: '文件读取失败', icon: 'error' });
          console.error('读取文件失败:', err);
        }
      });
    };

    // 优先使用 chooseMessageFile（支持更多文件类型）
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        if (res.tempFiles && res.tempFiles[0]) {
          handleRead(res.tempFiles[0].path);
        } else {
          wx.hideLoading();
          wx.showToast({ title: '未选择文件', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.log('选择文件失败:', err);

        // 后备方案：使用 chooseFile
        if (wx.chooseFile) {
          wx.chooseFile({
            count: 1,
            type: 'file',
            extension: ['.json'],
            success: (res) => {
              if (res.tempFiles && res.tempFiles[0]) {
                handleRead(res.tempFiles[0].path);
              } else {
                wx.showToast({ title: '未选择文件', icon: 'none' });
              }
            },
            fail: () => {
              wx.showToast({ title: '无法选择文件，请重试', icon: 'none' });
            }
          });
        } else {
          wx.showToast({ title: '文件选择已取消', icon: 'none' });
        }
      }
    });
  },

  afterImportRawLoaded(text) {
    try {
      const chk = exportHelper.parseAndValidateImport(text);
      if (!chk.valid) return wx.showToast({ title: chk.error || '文件格式无效', icon: 'none' });
      this.setData({
        importRawText: text,
        importMeta: chk.data,
        importReadyForPwd: true,
        importPwd: ''
      });
      wx.showToast({ title: '已载入，请输入密码', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: '文件解析失败', icon: 'error' });
    }
  },

  onImportPwdInput(e) { this.setData({ importPwd: e.detail.value }); },
  toggleImportPwdVisible() { this.setData({ importPwdVisible: !this.data.importPwdVisible }); },

  confirmImport() {
    if (!this.data.importReadyForPwd) return wx.showToast({ title: '请先选择文件/扫码', icon: 'none' });
    if (!this.data.importPwd) return wx.showToast({ title: '请输入临时密码', icon: 'none' });

    wx.showLoading({ title: '导入中', mask: true });
    try {
      const chk = exportHelper.parseAndValidateImport(this.data.importRawText);
      if (!chk.valid) throw new Error(chk.error);

      const { salt, encryptedData } = chk.data;
      const tempKey = deriveKey(this.data.importPwd, salt);
      const decryptResult = decrypt(encryptedData, tempKey);
      if (!decryptResult.success) {
        throw new Error(decryptResult.message || '密码错误或数据已损坏');
      }

      let importedItems;
      try {
        importedItems = JSON.parse(decryptResult.data);
      } catch (parseError) {
        throw new Error('数据解析失败：' + parseError.message);
      }

      if (!Array.isArray(importedItems)) throw new Error('密文内容格式错误');

      this.previewAndConfirmMerge(importedItems);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '导入失败：' + e.message, icon: 'error' });
    }
  },

  previewAndConfirmMerge(importedItems) {
    wx.hideLoading();
    try {
      const encryptedVault = wx.getStorageSync('vault');
      let current = [];

      if (encryptedVault) {
        const decryptResult = decrypt(encryptedVault, app.globalData.sessionKey);
        if (decryptResult.success && decryptResult.data) {
          try {
            current = JSON.parse(decryptResult.data);
          } catch (parseError) {
            console.error('解析当前密码库数据失败:', parseError);
            current = [];
          }
        } else {
          console.error('解密当前密码库失败:', decryptResult?.message || '未知错误');
          current = [];
        }
      }

      const idSet = new Set(current.map(i => i.id));
      let newCnt = 0, updCnt = 0;
      importedItems.forEach(it => {
        if (it && it.id) {
          idSet.has(it.id) ? updCnt++ : newCnt++;
        }
      });

      if (newCnt === 0 && updCnt === 0) return wx.showToast({ title: '没有可导入的新数据', icon: 'none' });

      wx.showModal({
        title: '确认导入',
        content: `即将新增 ${newCnt} 条，覆盖 ${updCnt} 条记录。是否继续？`,
        success: (res) => {
          if (res.confirm) this.performMerge(importedItems, current);
          else wx.showToast({ title: '已取消导入', icon: 'none' });
        }
      });
    } catch (e) {
      console.error('预览导入失败:', e);
      wx.showToast({ title: '预览导入失败', icon: 'error' });
    }
  },

  performMerge(importedItems, currentVault) {
    try {
      // [关键修复] 清理导入数据项的选择状态
      console.log('清理导入数据项的选择状态');
      const cleanedImportedItems = importedItems.map(item => {
        if (item && typeof item === 'object') {
          // 创建干净的数据项，移除所有选择相关属性
          const cleanedItem = { ...item };
          delete cleanedItem.selected;        // 删除选择状态
          delete cleanedItem.selectionMode;   // 删除选择模式
          delete cleanedItem.showBatchToolbar; // 删除批量工具栏状态

          // 确保状态为未选择
          cleanedItem.selected = false;

          console.log(`清理数据项 ${item.id}:`, {
            原始: { selected: item.selected },
            清理后: { selected: cleanedItem.selected }
          });

          return cleanedItem;
        }
        return item;
      });

      // [关键修复] 同时清理当前密码库数据的选择状态
      console.log('清理当前密码库数据的选择状态');
      const cleanedCurrentVault = currentVault.map(item => {
        if (item && typeof item === 'object') {
          const cleanedItem = { ...item };
          delete cleanedItem.selected;
          delete cleanedItem.selectionMode;
          delete cleanedItem.showBatchToolbar;
          cleanedItem.selected = false;
          return cleanedItem;
        }
        return item;
      });

      const vaultMap = new Map(cleanedCurrentVault.map(item => [item.id, item]));
      cleanedImportedItems.forEach(item => {
        if (item && item.id) vaultMap.set(item.id, { ...(vaultMap.get(item.id) || {}), ...item });
      });
      const newVault = Array.from(vaultMap.values());

      // 加密并保存合并后的数据
      const encryptedData = encrypt(JSON.stringify(newVault), app.globalData.sessionKey);
      wx.setStorageSync('vault', encryptedData);

      // 记录导入操作的审计日志
      const importCount = importedItems.length;
      app.addAuditLog('import_data', `导入了 ${importCount} 条数据`);

      // [新增] 设置全局刷新标志，让首页能够检测到数据变更
      if (app.globalData.needsRefresh && app.globalData.needsRefresh.index) {
        console.log('设置导入操作刷新标志');
        app.globalData.needsRefresh.index.add.needed = true;
        app.globalData.needsRefresh.index.add.timestamp = Date.now();
      }

      // [修复] 彻底重置所有选择状态，避免蓝边问题
      this.setData({
        importMeta: null,
        importRawText: '',
        importReadyForPwd: false,
        importPwd: '',
        selectedItems: [], // 清空选中项
        isAllSelected: false, // 重置全选状态
        vault: [] // 清空当前数据，强制重新加载
      });

      wx.showToast({ title: '导入成功！', icon: 'success' });
      this.loadVaultData(); // 重新加载数据，确保所有状态正确

      // [关键修复] 强制更新首页的选择状态
      setTimeout(() => {
        const pages = getCurrentPages();
        const indexPage = pages.find(page => page.route === 'pages/index/index');
        if (indexPage && indexPage.clearSelectionState) {
          console.log('强制清除首页选择状态');
          indexPage.clearSelectionState();
        }
      }, 300);

      this.setData({ tab: 'export' });
    } catch (e) {
      console.error('数据合并失败:', e);
      wx.showToast({ title: '数据合并失败', icon: 'error' });
    }
  }
});
