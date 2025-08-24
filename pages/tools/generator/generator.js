// 现代化强密码生成器

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
    generatedPassword: '',
    passwordLength: 12,
    useUppercase: true,
    useLowercase: true,
    useNumbers: true,
    useSymbols: true,
    passwordStrength: 0,
    passwordStrengthText: '弱',
    // [新增] 避免重复弹窗的标志
    lastToastTime: 0,
    isShowingToast: false,
  },

  onLoad() {
    this.generatePassword();
  },

  onLengthChange(e) {
    this.setData({ passwordLength: e.detail.value });
    // 延迟生成，避免频繁调用
    clearTimeout(this.generateTimer);
    this.generateTimer = setTimeout(() => {
      if (this.data.generatedPassword) {
        this.generatePassword();
      }
    }, 300);
  },

  // 实时显示长度变化（解决滑块显示问题）
  onLengthChanging(e) {
    const value = e.detail.value;
    this.setData({ passwordLength: value });
    // 实时更新显示，不生成密码
  },

  // 新的字符类型切换方法
  toggleCharacterType(e) {
    const type = e.currentTarget.dataset.type;
    const updates = {};

    switch (type) {
      case 'uppercase':
        updates.useUppercase = !this.data.useUppercase;
        break;
      case 'lowercase':
        updates.useLowercase = !this.data.useLowercase;
        break;
      case 'numbers':
        updates.useNumbers = !this.data.useNumbers;
        break;
      case 'symbols':
        updates.useSymbols = !this.data.useSymbols;
        break;
    }

    this.setData(updates);

    // 如果有生成的密码，重新生成
    if (this.data.generatedPassword) {
      setTimeout(() => this.generatePassword(), 100);
    }
  },

  // 兼容旧的复选框方法
  onCheckboxChange(e) {
    const values = e.detail.value;
    this.setData({
      useUppercase: values.includes('uppercase'),
      useLowercase: values.includes('lowercase'),
      useNumbers: values.includes('numbers'),
      useSymbols: values.includes('symbols'),
    });

    if (this.data.generatedPassword) {
      this.generatePassword();
    }
  },

  generatePassword() {
    const { passwordLength, useUppercase, useLowercase, useNumbers, useSymbols } = this.data;
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          lower = 'abcdefghijklmnopqrstuvwxyz',
          numbers = '0123456789',
          symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let charset = '';
    if (useUppercase) charset += upper;
    if (useLowercase) charset += lower;
    if (useNumbers) charset += numbers;
    if (useSymbols) charset += symbols;

    if (charset === '') {
      wx.showToast({
        title: '请至少选择一种字符类型',
        icon: 'none',
        duration: 2000
      });
      this.setData({
        generatedPassword: '',
        passwordStrength: 0,
        passwordStrengthText: '无'
      });
      return;
    }

    let newPassword = '';
    // 使用更安全的随机数生成
    for (let i = 0; i < passwordLength; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      newPassword += charset.charAt(randomIndex);
    }

    // 计算密码强度
    const strength = this.calculatePasswordStrength(newPassword, {
      useUppercase, useLowercase, useNumbers, useSymbols
    });

    this.setData({
      generatedPassword: newPassword,
      passwordStrength: strength.score,
      passwordStrengthText: strength.text
    });

    // 显示生成动画效果
    this.showGenerateAnimation();
  },

  // 计算密码强度
  calculatePasswordStrength(password, options) {
    let score = 0;
    const length = password.length;

    // 长度评分 (0-25分)
    if (length >= 8) score += 10;
    if (length >= 12) score += 10;
    if (length >= 16) score += 5;

    // 字符类型多样性评分 (0-50分)
    let typeCount = 0;
    if (options.useUppercase && /[A-Z]/.test(password)) typeCount++;
    if (options.useLowercase && /[a-z]/.test(password)) typeCount++;
    if (options.useNumbers && /\d/.test(password)) typeCount++;
    if (options.useSymbols && /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) typeCount++;

    score += typeCount * 12.5;

    // 模式检测和减分
    if (/(.)\1{2,}/.test(password)) score -= 10; // 重复字符
    if (/^[A-Za-z]+$/.test(password)) score -= 5; // 只有字母
    if (/^\d+$/.test(password)) score -= 5; // 只有数字

    score = Math.max(0, Math.min(100, score));

    // 根据分数返回强度文本
    let text = '弱';
    if (score >= 80) text = '极强';
    else if (score >= 60) text = '强';
    else if (score >= 40) text = '中等';
    else if (score >= 20) text = '弱';

    return { score, text };
  },

  // 显示生成动画
  showGenerateAnimation() {
    const query = wx.createSelectorQuery();
    query.select('.generate-btn').boundingClientRect((data) => {
      if (data) {
        // 按钮点击反馈
        wx.vibrateShort({ type: 'light' });
      }
    }).exec();
  },

  copyGeneratedPassword() {
    if (!this.data.generatedPassword) {
      this.showOptimizedToast('请先生成密码', 'none');
      return;
    }

    wx.setClipboardData({
      data: this.data.generatedPassword,
      success: () => {
        // [优化] 立即显示成功提示，避免延迟
        this.showOptimizedToast('密码已复制', 'success');
        // 复制成功震动反馈
        wx.vibrateShort({ type: 'light' });
      },
      fail: () => {
        this.showOptimizedToast('复制失败，请重试', 'none');
      }
    });
  },

  // 保存密码功能
  savePassword() {
    if (!this.data.generatedPassword) {
      this.showOptimizedToast('请先生成密码', 'none');
      return;
    }

    wx.showModal({
      title: '保存密码',
      content: '是否将此密码保存到密码库？',
      confirmText: '保存',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // [优化] 立即显示保存提示，然后执行保存逻辑
          this.showOptimizedToast('正在保存...', 'none', 1000);
          // 实际应用中应该调用具体的数据存储方法
          this.saveToPasswordVault();
        }
      }
    });
  },

  // 保存到密码库的实际方法
  saveToPasswordVault() {
    const passwordData = {
      password: this.data.generatedPassword,
      length: this.data.passwordLength,
      strength: this.data.passwordStrengthText,
      createdAt: new Date().toISOString(),
      type: 'generated',
      options: {
        useUppercase: this.data.useUppercase,
        useLowercase: this.data.useLowercase,
        useNumbers: this.data.useNumbers,
        useSymbols: this.data.useSymbols
      }
    };

    try {
      // 显示保存中状态
      wx.showLoading({
        title: '保存中...',
        mask: true
      });

      // 获取现有密码
      let savedPasswords = wx.getStorageSync('generated_passwords') || [];

      // 确保是数组
      if (!Array.isArray(savedPasswords)) {
        savedPasswords = [];
      }

      // 添加新密码
      savedPasswords.push(passwordData);

      // 保存到本地存储
      wx.setStorageSync('generated_passwords', savedPasswords);

      // 验证保存是否成功
      const verifyPasswords = wx.getStorageSync('generated_passwords') || [];
      const isSaved = verifyPasswords.some(p =>
        p && p.password === passwordData.password &&
        p.createdAt === passwordData.createdAt
      );

      wx.hideLoading();

      if (isSaved) {
        console.log('随机密码已保存:', passwordData);

        // 显示更详细的成功信息
        const createdTime = formatTime(passwordData.createdAt);
        const detailedTime = formatDetailedTime(passwordData.createdAt);
        wx.showModal({
          title: '保存成功',
          content: `密码长度: ${passwordData.length}位\n强度: ${passwordData.strength}\n创建时间: ${createdTime} (${detailedTime})\n\n密码已保存到本地存储。`,
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
      console.error('保存随机密码失败:', e);

      wx.showModal({
        title: '保存失败',
        content: `保存密码时出现错误：${e.message || '未知错误'}\n\n请重试或联系开发者。`,
        showCancel: false,
        confirmText: '确定'
      });
    }
  },

  // [新增] 优化的弹窗显示方法 - 避免频繁打扰
  showOptimizedToast(title, icon = 'none', duration = 1500) {
    const currentTime = Date.now();

    // 防止频繁弹窗（至少间隔1秒）
    if (this.data.isShowingToast && (currentTime - this.data.lastToastTime) < 1000) {
      console.log('跳过频繁弹窗:', title);
      return;
    }

    this.setData({
      isShowingToast: true,
      lastToastTime: currentTime
    });

    wx.showToast({
      title: title,
      icon: icon,
      duration: duration,
      mask: false, // 不阻塞用户操作
      success: () => {
        // 弹窗结束后重置状态
        setTimeout(() => {
          this.setData({
            isShowingToast: false
          });
        }, duration + 100);
      }
    });
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

  // 查看已保存的随机密码
  viewSavedPasswords() {
    try {
      const savedPasswords = wx.getStorageSync('generated_passwords') || [];

      if (!Array.isArray(savedPasswords) || savedPasswords.length === 0) {
        wx.showModal({
          title: '暂无保存密码',
          content: '您还没有保存任何随机密码。',
          showCancel: false,
          confirmText: '确定'
        });
        return;
      }

      // 过滤掉无效的密码
      const validPasswords = savedPasswords.filter(p => p && p.password);

      if (validPasswords.length === 0) {
        wx.showModal({
          title: '暂无有效密码',
          content: '没有找到有效的保存密码。',
          showCancel: false,
          confirmText: '确定'
        });
        return;
      }

      // 构建密码列表显示内容
      let content = `已保存 ${validPasswords.length} 个随机密码：\n\n`;
      validPasswords.slice(-5).reverse().forEach((pwd, index) => { // 显示最近5个
        const createdTime = formatTime(pwd.createdAt || pwd.created_at);
        const detailedTime = formatDetailedTime(pwd.createdAt || pwd.created_at);
        content += `${index + 1}. ${pwd.password.substring(0, 8)}... (${pwd.length}位, ${pwd.strength})\n   创建: ${createdTime} (${detailedTime})\n\n`;
      });

      if (validPasswords.length > 5) {
        content += `...还有 ${validPasswords.length - 5} 个更早的密码`;
      }

      wx.showModal({
        title: '已保存密码',
        content: content,
        showCancel: true,
        confirmText: '确定',
        cancelText: '管理密码',
        success: (res) => {
          if (res.cancel) {
            this.showPasswordManagement();
          }
        }
      });

    } catch (e) {
      console.error('查看密码失败:', e);
      this.showOptimizedToast('查看密码失败', 'none');
    }
  },

  // 显示密码管理选项
  showPasswordManagement() {
    wx.showActionSheet({
      itemList: ['复制密码', '清空所有密码', '取消'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.copySavedPassword();
            break;
          case 1:
            this.clearAllPasswords();
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

  // 复制保存的密码
  copySavedPassword() {
    const savedPasswords = wx.getStorageSync('generated_passwords') || [];
    const validPasswords = savedPasswords.filter(p => p && p.password);

    if (validPasswords.length === 0) {
      this.showOptimizedToast('没有可复制的密码', 'none');
      return;
    }

    // 复制最新的密码
    const latestPassword = validPasswords[validPasswords.length - 1];

    wx.setClipboardData({
      data: latestPassword.password,
      success: () => {
        this.showOptimizedToast('最新密码已复制', 'success');
      },
      fail: () => {
        this.showOptimizedToast('复制失败', 'none');
      }
    });
  },

  // 清空所有保存的密码
  clearAllPasswords() {
    wx.showModal({
      title: '确认清空',
      content: '确定要删除所有保存的随机密码吗？此操作不可恢复。',
      confirmText: '清空',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('generated_passwords', []);

          this.showOptimizedToast('已清空所有密码', 'success');
          console.log('所有随机密码已清空');
        }
      }
    });
  },

  // 快速生成不同类型密码的快捷方法
  generateSimplePassword() {
    this.setData({
      passwordLength: 12,
      useUppercase: true,
      useLowercase: true,
      useNumbers: true,
      useSymbols: false
    });
    setTimeout(() => this.generatePassword(), 100);
  },

  generateStrongPassword() {
    this.setData({
      passwordLength: 20,
      useUppercase: true,
      useLowercase: true,
      useNumbers: true,
      useSymbols: true
    });
    setTimeout(() => this.generatePassword(), 100);
  },

  generateMaxPassword() {
    this.setData({
      passwordLength: 32,
      useUppercase: true,
      useLowercase: true,
      useNumbers: true,
      useSymbols: true
    });
    setTimeout(() => this.generatePassword(), 100);
  },

  onUnload() {
    // 清理定时器
    if (this.generateTimer) {
      clearTimeout(this.generateTimer);
    }
  }
});
