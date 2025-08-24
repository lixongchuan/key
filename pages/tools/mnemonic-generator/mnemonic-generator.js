const crypto = require('crypto-js');

// 修复模块导入和降级方案
const formatTime = (dateString) => {
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) return '未知时间';
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year - 2000}.${month}.${day}.${hours.toString().padStart(2, '0')}.${minutes}`;
  } catch (e) {
    return '格式错误';
  }
};

const formatDetailedTime = (dateString) => {
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) return '未知时间';
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch (e) {
    return '格式错误';
  }
};

Page({
  data: {
    masterKey: '',
    serviceId: '',
    resultPassword: '',
    showMasterKey: false,
    passwordLength: 16,
    hashAlgorithm: 'sha256'
  },

  onLoad(options) {
    // 页面加载时的初始化
    this.showSecurityTips();

    // 检查是否有配置ID参数，用于编辑配置
    if (options && options.configId) {
      this.loadConfigForEdit(options.configId);
    }
  },

  // 加载配置进行编辑
  loadConfigForEdit(configId) {
    try {
      const savedConfigs = wx.getStorageSync('mnemonic_configs') || [];
      const config = savedConfigs.find(c => c && c.serviceId === configId);

      if (config) {
        this.setData({
          serviceId: config.serviceId,
          hashAlgorithm: config.hashAlgorithm,
          passwordLength: config.passwordLength,
          resultPassword: '' // 清空密码，提示用户重新生成
        });

        wx.showToast({
          title: '配置已加载',
          icon: 'success',
          duration: 2000
        });
      } else {
        wx.showToast({
          title: '配置未找到',
          icon: 'none'
        });
      }
    } catch (e) {
      console.error('加载配置失败:', e);
      wx.showToast({
        title: '加载配置失败',
        icon: 'none'
      });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;

    this.setData({ [field]: value });

    // 只有在输入完成后，用户主动点击生成按钮时才生成密码
    // 移除自动生成逻辑，避免在输入时频繁生成
    if (this.data.resultPassword && field !== 'resultPassword') {
      // 清空之前的密码，提示用户需要重新生成
      this.setData({ resultPassword: '' });
    }
  },

  // 切换主口令可见性
  toggleMasterKeyVisibility() {
    this.setData({
      showMasterKey: !this.data.showMasterKey
    });
  },

  // 生成密码
  generate() {
    if (!this.data.masterKey || !this.data.serviceId) {
      wx.showToast({
        title: '请填写主口令和服务标识',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    try {
      // 根据选择的算法生成密码
      let hash;
      switch (this.data.hashAlgorithm) {
        case 'sha256':
          hash = crypto.HmacSHA256(this.data.serviceId, this.data.masterKey);
          break;
        case 'sha512':
          hash = crypto.HmacSHA512(this.data.serviceId, this.data.masterKey);
          break;
        case 'md5':
          hash = crypto.HmacMD5(this.data.serviceId, this.data.masterKey);
          break;
        default:
          hash = crypto.HmacSHA256(this.data.serviceId, this.data.masterKey);
      }

      // 转换为Base64并截取指定长度
      const password = crypto.enc.Base64.stringify(hash).substring(0, this.data.passwordLength);

      this.setData({ resultPassword: password });

      // 显示成功提示
      wx.showToast({
        title: '密码生成成功',
        icon: 'success',
        duration: 1500
      });

      // 震动反馈
      wx.vibrateShort({ type: 'light' });

    } catch (error) {
      console.error('密码生成失败:', error);
      wx.showToast({
        title: '生成失败，请重试',
        icon: 'none'
      });
    }
  },

  // 复制结果
  copyResult() {
    if (!this.data.resultPassword) {
      wx.showToast({
        title: '请先生成密码',
        icon: 'none'
      });
      return;
    }

    wx.setClipboardData({
      data: this.data.resultPassword,
      success: () => {
        wx.showToast({
          title: '密码已复制到剪贴板',
          icon: 'success',
          duration: 2000
        });
        wx.vibrateShort({ type: 'light' });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  // 保存结果
  saveResult() {
    if (!this.data.resultPassword) {
      wx.showToast({
        title: '请先生成密码',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '保存密码',
      content: `是否保存此服务标识的密码配置？\n\n服务: ${this.data.serviceId}\n算法: ${this.data.hashAlgorithm.toUpperCase()}`,
      confirmText: '保存',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.saveConfiguration();
        }
      }
    });
  },

  // 保存配置到本地存储
  saveConfiguration() {
    const config = {
      serviceId: this.data.serviceId,
      hashAlgorithm: this.data.hashAlgorithm,
      passwordLength: this.data.passwordLength,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 显示保存中状态
    wx.showLoading({
      title: '保存中...',
      mask: true
    });

    try {
      // 获取现有配置
      let savedConfigs = wx.getStorageSync('mnemonic_configs') || [];

      // 确保savedConfigs是数组
      if (!Array.isArray(savedConfigs)) {
        savedConfigs = [];
      }

      // 检查是否已存在相同服务标识的配置
      const existingIndex = savedConfigs.findIndex(c => c && c.serviceId === config.serviceId);

      let isUpdate = false;
      if (existingIndex >= 0) {
        // 更新现有配置
        savedConfigs[existingIndex] = { ...savedConfigs[existingIndex], ...config };
        isUpdate = true;
      } else {
        // 添加新配置
        savedConfigs.push(config);
      }

      // 保存到本地存储
      const saveResult = wx.setStorageSync('mnemonic_configs', savedConfigs);

      // 验证保存是否成功
      const verifyConfigs = wx.getStorageSync('mnemonic_configs') || [];
      const isSaved = verifyConfigs.some(c =>
        c && c.serviceId === config.serviceId &&
        c.hashAlgorithm === config.hashAlgorithm &&
        c.passwordLength === config.passwordLength
      );

      wx.hideLoading();

      if (isSaved) {
        console.log('助记密码配置已保存:', config);

        // 显示更详细的成功信息
        wx.showModal({
          title: '保存成功',
          content: `服务标识: ${config.serviceId}\n算法: ${config.hashAlgorithm.toUpperCase()}\n长度: ${config.passwordLength}位\n\n${isUpdate ? '配置已更新' : '新配置已添加'}`,
          showCancel: false,
          confirmText: '确定'
        });

        // 添加保存状态的视觉反馈
        this.showSaveAnimation();

      } else {
        throw new Error('保存验证失败');
      }

    } catch (e) {
      wx.hideLoading();
      console.error('保存配置失败:', e);

      wx.showModal({
        title: '保存失败',
        content: `保存配置时出现错误：${e.message || '未知错误'}\n\n请重试或联系开发者。`,
        showCancel: false,
        confirmText: '确定'
      });
    }
  },

  // 显示保存动画效果
  showSaveAnimation() {
    const query = wx.createSelectorQuery();
    query.select('.save-btn').boundingClientRect((data) => {
      if (data) {
        // 按钮点击反馈
        wx.vibrateShort({ type: 'light' });
      }
    }).exec();
  },

  // 查看已保存的配置
  viewSavedConfigs() {
    try {
      const savedConfigs = wx.getStorageSync('mnemonic_configs') || [];

      if (!Array.isArray(savedConfigs) || savedConfigs.length === 0) {
        wx.showModal({
          title: '暂无保存配置',
          content: '您还没有保存任何助记密码配置。',
          showCancel: false,
          confirmText: '确定'
        });
        return;
      }

      // 过滤掉无效的配置
      const validConfigs = savedConfigs.filter(c => c && c.serviceId);

      if (validConfigs.length === 0) {
        wx.showModal({
          title: '暂无有效配置',
          content: '没有找到有效的保存配置。',
          showCancel: false,
          confirmText: '确定'
        });
        return;
      }

      // 构建配置列表显示内容
      let content = `已保存 ${validConfigs.length} 个配置：\n\n`;
      validConfigs.forEach((config, index) => {
        const createdTime = formatTime(config.createdAt || config.created_at);
        const detailedTime = formatDetailedTime(config.createdAt || config.created_at);
        content += `${index + 1}. ${config.serviceId}\n   算法: ${config.hashAlgorithm?.toUpperCase() || '未知'}\n   长度: ${config.passwordLength || '未知'}位\n   创建: ${createdTime} (${detailedTime})\n\n`;
      });

      wx.showModal({
        title: '已保存配置',
        content: content,
        showCancel: true,
        confirmText: '确定',
        cancelText: '管理配置',
        success: (res) => {
          if (res.cancel) {
            this.showConfigManagement();
          }
        }
      });

    } catch (e) {
      console.error('查看配置失败:', e);
      wx.showToast({
        title: '查看配置失败',
        icon: 'none'
      });
    }
  },

  // 显示配置管理选项
  showConfigManagement() {
    wx.showActionSheet({
      itemList: ['删除配置', '清空所有配置', '取消'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.deleteSingleConfig();
            break;
          case 1:
            this.clearAllConfigs();
            break;
          case 2:
            // 取消，不做任何操作
            break;
        }
      },
      fail: (res) => {
        console.log('用户取消操作:', res.errMsg);
      }
    });
  },

  // 删除单个配置
  deleteSingleConfig() {
    const savedConfigs = wx.getStorageSync('mnemonic_configs') || [];
    const validConfigs = savedConfigs.filter(c => c && c.serviceId);

    if (validConfigs.length === 0) {
      wx.showToast({
        title: '没有可删除的配置',
        icon: 'none'
      });
      return;
    }

    // 构建选项列表
    const options = validConfigs.map(c => `${c.serviceId} (${c.hashAlgorithm?.toUpperCase()})`);

    wx.showActionSheet({
      itemList: [...options, '取消'],
      success: (res) => {
        if (res.tapIndex < options.length) {
          const selectedConfig = validConfigs[res.tapIndex];
          const confirmDelete = () => {
            // 从数组中移除选中的配置
            const newConfigs = savedConfigs.filter(c =>
              !(c && c.serviceId === selectedConfig.serviceId)
            );

            wx.setStorageSync('mnemonic_configs', newConfigs);

            wx.showToast({
              title: '配置已删除',
              icon: 'success'
            });

            console.log('配置已删除:', selectedConfig.serviceId);
          };

          wx.showModal({
            title: '确认删除',
            content: `确定要删除服务 "${selectedConfig.serviceId}" 的配置吗？`,
            success: (modalRes) => {
              if (modalRes.confirm) {
                confirmDelete();
              }
            }
          });
        }
      }
    });
  },

  // 清空所有配置
  clearAllConfigs() {
    wx.showModal({
      title: '确认清空',
      content: '确定要删除所有保存的助记密码配置吗？此操作不可恢复。',
      confirmText: '清空',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('mnemonic_configs', []);

          wx.showToast({
            title: '已清空所有配置',
            icon: 'success'
          });

          console.log('所有助记密码配置已清空');
        }
      }
    });
  },

  // 清空输入
  clearInputs() {
    wx.showModal({
      title: '清空输入',
      content: '确定要清空所有输入内容吗？',
      confirmText: '清空',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            masterKey: '',
            serviceId: '',
            resultPassword: '',
            showMasterKey: false
          });
          wx.showToast({
            title: '已清空',
            icon: 'success'
          });
        }
      }
    });
  },

  // 粘贴服务标识
  pasteServiceId() {
    wx.getClipboardData({
      success: (res) => {
        const text = res.data;
        if (text) {
          // 简单的URL清理
          let cleanedText = text.trim();
          cleanedText = cleanedText.replace(/^https?:\/\//, ''); // 移除协议
          cleanedText = cleanedText.replace(/\/.*$/, ''); // 移除路径
          cleanedText = cleanedText.toLowerCase(); // 转为小写

          this.setData({ serviceId: cleanedText });
          wx.showToast({
            title: '已粘贴服务标识',
            icon: 'success'
          });
        } else {
          wx.showToast({
            title: '剪贴板为空',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.showToast({
          title: '无法访问剪贴板',
          icon: 'none'
        });
      }
    });
  },

  // 切换哈希算法
  changeAlgorithm() {
    const algorithms = ['sha256', 'sha512', 'md5'];
    const currentIndex = algorithms.indexOf(this.data.hashAlgorithm);
    const nextIndex = (currentIndex + 1) % algorithms.length;

    this.setData({
      hashAlgorithm: algorithms[nextIndex]
    });

    wx.showToast({
      title: `已切换到 ${algorithms[nextIndex].toUpperCase()}`,
      icon: 'none',
      duration: 1500
    });

    // 如果有结果，重新生成
    if (this.data.resultPassword && this.data.masterKey && this.data.serviceId) {
      setTimeout(() => this.generate(), 100);
    }
  },

  // 显示安全提示
  showSecurityTips() {
    // 延时显示安全提示
    setTimeout(() => {
      if (!wx.getStorageSync('mnemonic_security_tips_shown')) {
        wx.showModal({
          title: '安全使用提示',
          content: '助记密码生成器会根据您输入的主口令和服务标识生成确定性密码。相同输入总是产生相同输出，请妥善保管主口令。',
          showCancel: false,
          confirmText: '我知道了',
          success: () => {
            wx.setStorageSync('mnemonic_security_tips_shown', true);
          }
        });
      }
    }, 2000);
  },

  // 页面卸载时的清理
  onUnload() {
    if (this.generateTimer) {
      clearTimeout(this.generateTimer);
    }
  }
});
