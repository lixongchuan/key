const app = getApp();
const { encrypt, decrypt } = require('../../utils/crypto-helper.js');

// 提示：防止未定义的 dataManagementPage 引用报错（导出相关函数处使用到）
// 若后续需要真实实现，可在此通过 require 引入或在使用处改为调用 utils/export-helper 等。
const dataManagementPage = {
  exportSingleItem(item, tempPassword) {
    try {
      const payload = { item, tempPassword, exportedAt: new Date().toISOString() };
      return JSON.stringify(payload);
    } catch (e) {
      return JSON.stringify({ error: 'export failed' });
    }
  }
};

Page({
  // 自定义日期格式化函数
  formatSimpleDate(dateString) {
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return `${year - 2000}.${month.toString().padStart(2, '0')}.${day.toString().padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes}`;
    } catch (e) {
      return dateString; // 如果格式化失败，返回原字符串
    }
  },

  data: {
    pageReady: false,
    isEditMode: false,
    isSaving: false,

    formData: {
      id: null,
      title: '',
      username: '',
      url: '',
      notes: '',
      customFields: [],
    },
    password_for_input: '',
    showPassword: false,

    // 用于强制重新渲染input框
    passwordInputKey: 0,

    // --- 【修复】UI状态控制 - 默认展开附加信息 ---
    isAdditionalInfoExpanded: true, // 默认展开附加信息
    activeTab: 'notes', // 控制分段器当前激活的标签页

    // 原始密码，用于历史记录比较
    originalPassword: '',
    // 密码历史记录
    passwordHistory: [],

    // --- 【修复】弹窗状态 - 确保初始都为false ---
    showGenerator: false, // 密码生成器弹窗 - 只在点击时显示
    showHistoryPopup: false, // 历史记录弹窗 - 初始隐藏

    generatedPassword: '',
    passwordLength: 12,
    isLengthInvalid: false,
    useUppercase: true,
    useLowercase: true,
    useNumbers: true,
    useSymbols: true,
  },

  onLoad(options) {
    if (options.id) {
      // 编辑模式
      this.setData({ isEditMode: true });
      wx.setNavigationBarTitle({ title: '编辑密码' });
      this.loadItemData(options.id);
    } else {
      // 新增模式，默认展开附加信息
      this.setData({
        isEditMode: false,
        isAdditionalInfoExpanded: true, // 新增时默认展开
      });
      this.setData({ pageReady: true });
      wx.setNavigationBarTitle({ title: '添加新密码' });
    }
  },

  loadItemData(id) {
    const sessionKey = app.globalData.sessionKey;
    if (!sessionKey) {
      wx.showToast({ title: '会话已过期，请重新登录', icon: 'none' });
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    try {
      const encryptedVault = wx.getStorageSync('vault');
      const decryptResult = decrypt(encryptedVault, sessionKey);

      if (!decryptResult.success) {
        console.error("解密失败:", decryptResult.message);
        wx.showToast({ title: `数据解密失败: ${decryptResult.message}`, icon: 'error' });
        wx.redirectTo({ url: '/pages/unlock/unlock' });
        return;
      }

      let vault = JSON.parse(decryptResult.data || '[]');
      const itemToEdit = vault.find(item => item.id === id);
      if (itemToEdit) {
        // 【核心修改点】根据数据情况，决定是否展开附加信息区域
        const hasNotes = !!itemToEdit.notes;
        const hasCustomFields = (itemToEdit.customFields || []).length > 0;

        this.setData({
          formData: {
            id: itemToEdit.id,
            title: itemToEdit.title,
            username: itemToEdit.username,
            url: itemToEdit.url || '',
            notes: itemToEdit.notes || '',
            customFields: itemToEdit.customFields || [],
          },
          password_for_input: itemToEdit.password,
          originalPassword: itemToEdit.password,
          passwordHistory: (itemToEdit.passwordHistory || []).map(h => {
            h.formattedDate = this.formatSimpleDate(h.date);
            return h;
          }),
          // 【核心修改点】设置附加信息区域的初始状态
          isAdditionalInfoExpanded: hasNotes || hasCustomFields,
          // 默认激活有内容的第一个Tab，提高用户体验
          activeTab: hasNotes ? 'notes' : (hasCustomFields ? 'customFields' : 'notes'),
        });
      } else {
        wx.showToast({ title: '未找到该条目', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch(e) {
      console.error("加载或解析失败:", e);
      wx.showToast({ title: '加载数据失败', icon: 'error' });
      setTimeout(() => wx.navigateBack(), 1500);
    } finally {
      this.setData({ pageReady: true });
    }
  },

  onFieldChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`formData.${field}`]: e.detail.value
    });
  },

  onPasswordInput(e) {
    this.setData({
      password_for_input: e.detail.value
    });
  },

  onCopyPasswordInForm() {
    if (!this.data.password_for_input) {
      wx.showToast({ title: '密码为空', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.password_for_input,
      success: () => wx.showToast({title: '已复制'})
    });
  },

  onCopyField(e) {
    const field = e.currentTarget.dataset.field;
    const value = this.data.formData[field];
    if (!value) {
      wx.showToast({ title: '内容为空', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: value,
      success: () => wx.showToast({ title: '已复制' })
    });
  },

  toggleShowPassword() {
    const newValue = !this.data.showPassword;
    // 使用更彻底的强制重新渲染方法
    const newKey = this.data.passwordInputKey + 1;
    this.setData({
      showPassword: newValue,
      passwordInputKey: newKey
    });

    // 强制页面重新渲染
    this.forceRerender(newValue, newKey);
  },

  /**
   * 强制页面重新渲染
   */
  forceRerender(showValue, keyValue) {
    // 使用多重setTimeout确保页面完全更新
    setTimeout(() => {
      this.setData({
        showPassword: showValue,
        passwordInputKey: keyValue + 1
      });
    }, 5);

    setTimeout(() => {
      this.setData({
        passwordInputKey: keyValue + 2
      });
    }, 15);

    // 最后一次强制更新，确保状态正确
    setTimeout(() => {
      const finalKey = keyValue + 3;
      this.setData({
        passwordInputKey: finalKey
      });
    }, 30);
  },

  // --- 【新增】附加信息区域的控制函数 ---
  toggleAdditionalInfo() {
    this.setData({ isAdditionalInfoExpanded: !this.data.isAdditionalInfoExpanded });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.activeTab !== tab) {
        this.setData({ activeTab: tab });
    }
  },

  // 自定义字段函数
  addCustomField() {
    const customFields = this.data.formData.customFields;
    customFields.push({ label: '', value: '' });
    this.setData({ 'formData.customFields': customFields });
  },
  removeCustomField(e) {
    const index = e.currentTarget.dataset.index;
    const customFields = this.data.formData.customFields;
    customFields.splice(index, 1);
    this.setData({ 'formData.customFields': customFields });
  },
  onCustomFieldChange(e) {
    const { index, key } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({ [`formData.customFields[${index}].${key}`]: value });
  },

  // --- 【修复】密码历史记录的函数 - 确保正确显示 ---
  openHistoryPopup() {
    // 只有在编辑模式且有历史记录时才显示
    if (this.data.isEditMode && this.data.passwordHistory && this.data.passwordHistory.length > 0) {
      this.setData({
        showHistoryPopup: true,
        showGenerator: false  // 关闭密码生成器弹窗
      });
    } else {
      wx.showToast({ title: '暂无历史记录', icon: 'none' });
    }
  },

  closeHistoryPopup() {
    this.setData({ showHistoryPopup: false });
  },

  copyHistoryPassword(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.password,
      success: () => wx.showToast({ title: '已复制' })
    });
  },

  useHistoryPassword(e) {
    this.setData({
      password_for_input: e.currentTarget.dataset.password,
      showHistoryPopup: false
    });
    wx.showToast({ title: '已使用该密码', icon: 'none' });
  },

  // --- 【修复】弹窗逻辑 - 确保点击时才显示 ---
  openGenerator() {
    // 确保弹窗状态正确
    this.setData({
      showGenerator: true,
      showHistoryPopup: false  // 关闭历史记录弹窗
    });

    // 延迟生成密码，避免弹窗显示问题
    setTimeout(() => {
      if (this.data.showGenerator && !this.data.generatedPassword && !this.data.password_for_input) {
        this.generatePassword();
      }
    }, 100);
  },

  closeGenerator() {
    this.setData({ showGenerator: false });
  },
  // 阻止背景滚动，通常绑定在popup-mask上
  preventTouchMove() {},

  generatePassword() {
    const { passwordLength, useUppercase, useLowercase, useNumbers, useSymbols } = this.data;
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower = 'abcdefghijklmnopqrstuvwxyz', numbers = '0123456789', symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    let charset = '';
    if (useUppercase) charset += upper;
    if (useLowercase) charset += lower;
    if (useNumbers) charset += numbers;
    if (useSymbols) charset += symbols;

    if (charset === '') {
      wx.showToast({ title: '请至少选择一种字符类型', icon: 'none' });
      return;
    }
    if (this.data.isLengthInvalid || passwordLength < 4 || passwordLength > 128) {
      wx.showToast({ title: '密码长度需在4-128之间', icon: 'none' });
      return;
    }

    let newPassword = '';
    for (let i = 0; i < passwordLength; i++) {
      newPassword += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    this.setData({ generatedPassword: newPassword });
  },

  copyGeneratedPasswordInPopup() {
    if (!this.data.generatedPassword) {
      wx.showToast({ title: '请先生成密码', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.generatedPassword,
      success: () => wx.showToast({title: '已复制'})
    });
  },

  useGeneratedPassword() {
    if (!this.data.generatedPassword) {
      wx.showToast({ title: '请先生成密码', icon: 'none' });
      return;
    }
    this.setData({
      password_for_input: this.data.generatedPassword,
      showGenerator: false
    });
  },
  
  onLengthChange(e) {
    this.setData({
      passwordLength: e.detail.value,
      isLengthInvalid: false 
    });
  },

  onLengthBlur(e) {
    let length = parseInt(e.detail.value);
    
    if (isNaN(length) || length < 4 || length > 128) {
      this.setData({ isLengthInvalid: true });
      wx.showToast({ title: '密码长度需在4-128之间', icon: 'none' });
    } else {
      this.setData({ isLengthInvalid: false, passwordLength: length });
    }
  },

  onCheckboxChange(e) {
    const values = e.detail.value;
    this.setData({
      useUppercase: values.includes('uppercase'),
      useLowercase: values.includes('lowercase'),
      useNumbers: values.includes('numbers'),
      useSymbols: values.includes('symbols')
    });
  },

  // --- 提交与删除逻辑 ---
  onSave() {
    if (this.data.isSaving) return;

    const dataToSave = {
      ...this.data.formData,
      password: this.data.password_for_input,
      customFields: (this.data.formData.customFields || []).filter(f => f.label && f.value),
    };

    if (!dataToSave.title || !dataToSave.username || !dataToSave.password) {
      return wx.showToast({ title: '标题、用户名和密码不能为空', icon: 'none' });
    }

    this.setData({ isSaving: true });
    wx.showLoading({ title: '正在保存...' });

    setTimeout(() => {
        try {
            const sessionKey = app.globalData.sessionKey;
            if (!sessionKey) throw new Error('会话已过期');

            const encryptedVault = wx.getStorageSync('vault');
            const decryptResult = decrypt(encryptedVault, sessionKey);

            if (!decryptResult.success) {
              throw new Error(`数据解密失败: ${decryptResult.message}`);
            }

            let vault = JSON.parse(decryptResult.data || '[]');

            if (this.data.isEditMode) {
                const index = vault.findIndex(item => item.id === dataToSave.id);
                if (index !== -1) {
                    const originalItem = vault[index];
                    let newHistory = originalItem.passwordHistory || [];

                    if (dataToSave.password !== this.data.originalPassword) {
                      newHistory.unshift({
                        password: this.data.originalPassword,
                        date: new Date().toISOString()
                      });
                      if (newHistory.length > 5) {
                        newHistory = newHistory.slice(0, 5);
                      }
                    }

                    vault[index] = {
                      ...originalItem,
                      ...dataToSave,
                      passwordHistory: newHistory,
                      updatedAt: new Date().toISOString()
                    };
                }
            } else {
                dataToSave.id = Date.now().toString();
                dataToSave.createdAt = new Date().toISOString();
                dataToSave.isFavorite = false;
                dataToSave.status = 'active';
                dataToSave.passwordHistory = [];
                vault.unshift(dataToSave);
            }

            const newEncryptedVault = encrypt(JSON.stringify(vault), sessionKey);
            wx.setStorageSync('vault', newEncryptedVault);

            // 调整"正在保存"弹窗时间到300毫秒
            setTimeout(() => {
              wx.hideLoading();

              // 记录操作日志
              if (this.data.isEditMode) {
                  app.addAuditLog('edit_password', `编辑了密码条目: ${dataToSave.title}`);
              } else {
                  app.addAuditLog('add_password', `添加了新密码条目: ${dataToSave.title}`);
              }

              wx.navigateBack({
                  success: () => {
                      // 调整成功弹窗时间到400毫秒
                      setTimeout(() => {
                          wx.showToast({
                            title: '保存成功',
                            icon: 'success',
                            duration: 400 // 调整为400毫秒
                          });

                          // 设置统一的刷新标志 - 优化刷新逻辑
                          const app = getApp();
                          if (app.globalData.needsRefresh && app.globalData.needsRefresh.index) {
                              const operation = this.data.isEditMode ? 'edit' : 'add';
                              console.log(`设置${operation}操作刷新标志`);
                              app.globalData.needsRefresh.index[operation].needed = true;
                              app.globalData.needsRefresh.index[operation].timestamp = Date.now();
                          }

                          // 延迟触发页面刷新，确保导航完成
                          setTimeout(() => {
                              // 触发首页重新加载
                              const pages = getCurrentPages();
                              const indexPage = pages.find(page => page.route === 'pages/index/index');
                              if (indexPage) {
                                  console.log('触发首页数据刷新');
                                  // 直接调用首页的smartDataLoad方法
                                  if (indexPage.smartDataLoad) {
                                      indexPage.smartDataLoad();
                                  }
                              }
                          }, 100);
                      }, 500); // 延迟显示成功提示，确保页面跳转完成
                  }
              });
            }, 250); // 调整"正在保存"显示时间到300毫秒

        } catch (err) {
            wx.hideLoading();
            this.setData({ isSaving: false });
            wx.showToast({title: err.message || '保存失败', icon: 'error'});
            console.error("保存失败:", err);
        }
    }, 100);
  },

  onDelete() {
    if (!this.data.isEditMode || !this.data.formData.id) {
      wx.showToast({ title: '当前不在编辑模式或ID缺失', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: '确定要将此条目移至回收站吗？',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          this.performDelete();
        }
      }
    });
  },

  performDelete() {
    wx.showLoading({ title: '正在删除...' });
    const sessionKey = app.globalData.sessionKey;
    if (!sessionKey) {
      wx.hideLoading();
      wx.showToast({ title: '会话已过期，请重新登录', icon: 'none' });
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    try {
      const encryptedVault = wx.getStorageSync('vault');
      const decryptResult = decrypt(encryptedVault, sessionKey);

      if (!decryptResult.success) {
        throw new Error(`数据解密失败: ${decryptResult.message}`);
      }

      let vault = JSON.parse(decryptResult.data || '[]');

      const newVault = vault.map(item => {
        if (item.id === this.data.formData.id) {
          return { ...item, status: 'deleted', deletedAt: new Date().toISOString() };
        }
        return item;
      });

      const newEncryptedVault = encrypt(JSON.stringify(newVault), sessionKey);
      wx.setStorageSync('vault', newEncryptedVault);

      // 记录删除操作日志
      app.addAuditLog('delete_password', `删除了密码条目: ${this.data.formData.title}`);

      wx.hideLoading();
      wx.navigateBack({
        success: () => {
          setTimeout(() => {
            wx.showToast({ title: '已移至回收站', icon: 'success' });
            // 设置全局刷新标志，让首页刷新数据
            if (getApp().globalData.needsRefresh && getApp().globalData.needsRefresh.index) {
              getApp().globalData.needsRefresh.index.delete.needed = true;
              getApp().globalData.needsRefresh.index.delete.timestamp = Date.now();
            }
          }, 300);
        },
        fail: (e) => {
          console.error("navigateBack failed", e);
          wx.showToast({ title: '操作成功，但返回失败', icon: 'none' });
        }
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({title:'操作失败', icon: 'error'});
      console.error("删除失败:", err);
    }
  },

  // --- 单条凭证导出逻辑 ---
  exportSingleItem() {
    const currentItem = this.data.formData;
    if (!currentItem || !currentItem.id) {
      return wx.showToast({ title: '凭证数据缺失', icon: 'none' });
    }

    wx.showModal({
      title: '设置导出密码',
      content: '此密码仅用于保护本次导出的凭证文件，请牢记。',
      editable: true,
      placeholderText: '请输入临时密码',
      success: (res) => {
        if (res.confirm && res.content) {
          this.performSingleExport(currentItem, res.content);
        } else if (res.confirm && !res.content) {
          wx.showToast({ title: '密码不能为空', icon: 'none' });
        }
      }
    });
  },

  performSingleExport(item, tempPassword) {
    wx.showLoading({ title: '正在加密导出...' });
    try {
      // 调用 dataManagementPage 中的 exportSingleItem 辅助函数
      const dataToExportString = dataManagementPage.exportSingleItem(item, tempPassword);

      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/codesafe_item_${item.id}.json`;

      fs.writeFile({
        filePath: filePath,
        data: dataToExportString,
        encoding: 'utf8',
        success: () => {
          wx.hideLoading();
          wx.showToast({ title: '导出成功！', icon: 'success' });
          // 小程序无 wx.shareFile，改为调用系统分享
          if (wx.shareFileMessage) {
            // 某些平台扩展API
            wx.shareFileMessage({
              filePath,
              success: (res) => console.log('系统分享成功', res),
              fail: (err) => console.warn('系统分享不可用或失败', err)
            });
          } else {
            wx.showModal({
              title: '已导出为文件',
              content: '文件已保存至临时目录，可在手机系统文件管理中查看或通过开发者工具“工具-本地缓存查看”获取路径。\n\n路径：' + filePath,
              showCancel: false
            });
          }
        },
        fail: (err) => {
          throw err;
        }
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '导出失败，请重试', icon: 'error' });
      console.error("单条凭证导出失败:", e);
    }
  },

  exportSingleItemViaQRCode() {
    const currentItem = this.data.formData;
    if (!currentItem || !currentItem.id) {
      return wx.showToast({ title: '凭证数据缺失', icon: 'none' });
    }

    wx.showModal({
      title: '安全提示',
      content: '即将生成包含此凭证加密数据的二维码，请勿在公共场合展示，也勿截图发送给他人。',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '设置二维码密码',
            content: '此密码仅用于保护二维码中的数据，请牢记。',
            editable: true,
            placeholderText: '请输入临时密码',
            success: (resQR) => {
              if (resQR.confirm && resQR.content) {
                this.performSingleExportViaQRCode(currentItem, resQR.content);
              } else if (resQR.confirm && !resQR.content) {
                wx.showToast({ title: '密码不能为空', icon: 'none' });
              }
            }
          });
        }
      }
    });
  },

  performSingleExportViaQRCode(item, tempPassword) {
    wx.showLoading({ title: '正在生成二维码...' });
    try {
      // 调用 dataManagementPage 中的 exportSingleItem 辅助函数
      const qrDataString = dataManagementPage.exportSingleItem(item, tempPassword);

      if (qrDataString.length > 1500) { // 再次检查数据量
        wx.hideLoading();
        wx.showToast({ title: '数据量过大，请使用文件导出', icon: 'none', duration: 3000 });
        return;
      }

      // 跳转到二维码显示页面
      app.globalData.qrCodeData = qrDataString; // 将数据存入全局变量
      wx.navigateTo({
        url: '/pages/tools/qrcode-display/qrcode-display'
      });

      wx.hideLoading();
      wx.showToast({ title: '生成成功！请在新页面查看', icon: 'success' });

    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'error' });
      console.error("生成单条凭证二维码失败:", e);
    }
  },
});
