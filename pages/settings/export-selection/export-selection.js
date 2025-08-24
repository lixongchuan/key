/* 文件路径: pages/settings/export-selection/export-selection.js */
const app = getApp();
const { decrypt, deriveKey, encrypt } = require('../../utils/crypto-helper.js');
const {
  makeExportJson,
  buildExportPayload
} = require('../../utils/export-helper.js'); // 统一导出结构/校验
const drawQrcode = require('weapp-qrcode');

Page({
  data: {
    vault: [], // 原始的、解密后的所有凭证数据
    selectedItems: [], // 存储被选中的凭证ID
    isAllSelected: false, // 是否全选
    
    showExportPasswordPopup: false, // 控制导出密码弹窗
    tempExportPassword: '', // 临时导出密码

    // 二维码显示弹窗 (用于导出后显示二维码)
    showQRCodeDisplayPopup: false,
    qrCodeValue: '', // 用于存储二维码的内容
  },

  onLoad() {
    this.loadVaultData();
  },

  loadVaultData() {
    wx.showLoading({ title: '加载中...', mask: true });
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
        wx.redirectTo({ url: '/pages/unlock/unlock' }); // 失败则跳转到解锁页
        return;
      }

      let vault = [];
      try {
        vault = JSON.parse(decryptResult.data || '[]')
          .filter(item => item.status === 'active'); // 只显示 active 状态的凭证
      } catch (parseError) {
        console.error('解析密码库数据失败:', parseError);
        wx.showToast({ title: '数据解析失败', icon: 'error' });
        wx.redirectTo({ url: '/pages/unlock/unlock' }); // 失败则跳转到解锁页
        return;
      }

      // 为每个凭证添加 selected 状态，并根据之前选中的ID恢复选中状态
      const selectedIdsSet = new Set(this.data.selectedItems);
      vault = vault.map(item => ({ ...item, selected: selectedIdsSet.has(item.id) }));

      this.setData({
        vault,
        isAllSelected: vault.length > 0 && selectedIdsSet.size === vault.length // 更新全选状态
      });
    } catch (e) {
      console.error("加载或解密失败:", e);
      wx.showToast({ title: '数据加载失败', icon: 'error' });
      wx.redirectTo({ url: '/pages/unlock/unlock' }); // 失败则跳转到解锁页
    } finally {
      wx.hideLoading();
    }
  },

  onToggleSelectAll(e) {
    const isAllSelected = e.detail.value.length > 0;
    const vault = this.data.vault.map(item => ({ ...item, selected: isAllSelected }));
    const selectedItems = isAllSelected ? vault.map(item => item.id) : [];
    this.setData({ vault, selectedItems, isAllSelected });
  },

  onItemSelect(e) {
    const selectedIds = e.detail.value; // 当前所有被选中的checkbox的value (即id)
    const vault = this.data.vault.map(item => ({
      ...item,
      selected: selectedIds.includes(item.id)
    }));
    this.setData({
      vault,
      selectedItems: selectedIds,
      isAllSelected: selectedIds.length === this.data.vault.length && this.data.vault.length > 0
    });
  },

  onExport() {
    this.setData({ showExportPasswordPopup: true });
  },

  confirmExport() {
    if (!this.data.tempExportPassword) {
      return wx.showToast({ title: '密码不能为空', icon: 'none' });
    }
    wx.showLoading({ title: '正在加密导出...' });

    try {
      const itemsToExport = this.data.vault.filter(item => item.selected);
      if (itemsToExport.length === 0) {
        wx.hideLoading();
        return wx.showToast({ title: '请选择至少一项凭证', icon: 'none' });
      }

      // 统一导出结构：用临时密码派生 key，加密所选 items
      const itemsJson = JSON.stringify(itemsToExport);
      const salt = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const tempKey = deriveKey(this.data.tempExportPassword, salt);
      const encryptedData = encrypt(itemsJson, tempKey);
      // 兼容将来扩展 iv，如无 iv 则置空字符串
      const iv = '';

      // 生成导出 JSON（含 version/dataType/salt/iv/encryptedData/createdAt）
      const exportedDataString = makeExportJson({ salt, iv, encryptedData });

      // 导出为文件
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/codesafe_export_${Date.now()}.json`;

      fs.writeFile({
        filePath,
        data: exportedDataString,
        encoding: 'utf8',
        success: () => {
          wx.hideLoading();
          this.closeExportPasswordPopup();
          wx.showToast({ title: '导出成功！', icon: 'success' });
          wx.shareFile({
            filePath,
            success: (res) => console.log('分享成功', res),
            fail: (err) => console.error('分享取消或失败', err)
          });
        },
        fail: (err) => {
          throw err;
        }
      });

      // 同时提供生成二维码的选项 (如果数据量允许)
      if (exportedDataString.length <= 1500) {
        this.showQRCode(exportedDataString);
      } else {
        wx.showToast({ title: '数据量过大，无法生成二维码，已导出为文件', icon: 'none', duration: 3000 });
      }

    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '导出失败，请重试', icon: 'error' });
      console.error('导出凭证失败:', e);
    }
  },

  closeExportPasswordPopup() {
    this.setData({
      showExportPasswordPopup: false,
      tempExportPassword: ''
    });
  },

  onPopupInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  // --- 二维码显示和复制逻辑 (集成到本页面) ---
  showQRCode(qrDataString) {
    this.setData({ qrCodeValue: qrDataString, showQRCodeDisplayPopup: true });
    wx.nextTick(() => {
      const query = wx.createSelectorQuery().in(this);
      query.select('#qrcode-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            wx.showToast({ title: 'Canvas 渲染失败', icon: 'error' });
            console.error("Canvas node not found.");
            return;
          }
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          drawQrcode({
            canvas: canvas,
            ctx: ctx,
            width: 250,
            height: 250,
            text: this.data.qrCodeValue,
          });
        });
    });
  },

  closeQRCodeDisplayPopup() {
    this.setData({
      showQRCodeDisplayPopup: false,
      qrCodeValue: ''
    });
  },

  copyQRCodeData() {
    if (!this.data.qrCodeValue) {
      wx.showToast({ title: '无二维码数据可复制', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.qrCodeValue,
      success: () => wx.showToast({ title: '二维码数据已复制' }),
      fail: (err) => console.error("复制失败", err)
    });
  }
});
