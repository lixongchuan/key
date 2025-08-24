const app = getApp();
const { decrypt } = require('../../../utils/crypto-helper.js');
Page({
  data: {
    score: 100,
    summaryText: '非常安全',
    issues: {
      reused: [], // 重用密码
      weak: [],   // 弱密码
      old: []     // 旧密码
    },
    // 新增统计数据
    totalPasswords: 0,
    weakPasswords: 0,
    reusedPasswords: 0,
    oldPasswords: 0,
    showWeakList: false,
    showReusedList: false
  },
  onShow() { this.analyzeVault(); },
  analyzeVault() {
    wx.showLoading({title: '分析中...'});
    const encryptedVault = wx.getStorageSync('vault');
    if (!encryptedVault) {
      this.setData({
        score: 100,
        summaryText: '暂无密码数据',
        totalPasswords: 0,
        weakPasswords: 0,
        reusedPasswords: 0,
        oldPasswords: 0
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
      vault = JSON.parse(decryptResult.data || '[]')
                .filter(item => item.status === 'active'); // 只分析活跃的密码
    } catch (parseError) {
      console.error('解析密码库数据失败:', parseError);
      wx.showToast({ title: '数据解析失败', icon: 'error' });
      wx.hideLoading();
      return;
    }

    let reusedIssues = [], weakIssues = [], oldIssues = [];

    // 1. 检查密码重用
    const passwordMap = new Map();
    vault.forEach(item => {
      if (item.password) { // 确保密码存在
        if (!passwordMap.has(item.password)) {
          passwordMap.set(item.password, []);
        }
        passwordMap.get(item.password).push(item.id);
      }
    });

    // 收集重用密码的完整条目
    const tempReusedIds = new Set(); // 用于记录已经添加到reusedIssues的id，避免重复
    passwordMap.forEach((ids, password) => {
      if (ids.length > 1) {
        ids.forEach(id => {
          if (!tempReusedIds.has(id)) { // 避免重复添加
            reusedIssues.push(vault.find(item => item.id === id));
            tempReusedIds.add(id);
          }
        });
      }
    });

    // 2. 检查弱密码和旧密码
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    vault.forEach(item => {
      // 弱密码检测 (增强规则)
      if (item.password) { // 确保密码存在
        const password = item.password;
        const isWeakLength = password.length < 8;
        const isCommonWeak = /(123456|password|qwerty|admin|letmein|welcome|monkey|dragon|master|solar|password1|123123)/i.test(password);
        const isSimplePattern = /(.)\1{2,}/.test(password) || /^[a-zA-Z]+$/.test(password) || /^\d+$/.test(password);

        if (isWeakLength || isCommonWeak || isSimplePattern) {
          weakIssues.push(item);
        }
      }

      // 旧密码检测 (超过6个月未更新)
      const lastUpdated = new Date(item.updatedAt || item.createdAt);
      if (lastUpdated < sixMonthsAgo) {
        oldIssues.push(item);
      }
    });

    // 3. 计算分数和总结
    // 增强的分数计算规则
    let score = 100;
    score -= reusedIssues.length * 8; // 每个重用扣8分
    score -= weakIssues.length * 12;  // 每个弱密码扣12分
    score -= oldIssues.length * 3;    // 每个旧密码扣3分

    // 奖励条件
    const hasStrongPasswords = vault.some(item => item.password && item.password.length >= 16);
    const hasUniquePasswords = vault.every(item => item.password && item.password !== vault.find(i => i.id !== item.id)?.password);
    const hasRecentUpdates = vault.some(item => new Date(item.updatedAt || item.createdAt) > sixMonthsAgo);

    if (hasStrongPasswords) score += 10;
    if (hasUniquePasswords && reusedIssues.length === 0) score += 15;
    if (hasRecentUpdates) score += 5;

    score = Math.max(0, Math.min(100, score)); // 确保分数在0-100范围内

    let summaryText = '非常安全';
    if (score < 50) summaryText = '存在严重风险，建议立即处理';
    else if (score < 70) summaryText = '风险较高，需要重点关注';
    else if (score < 85) summaryText = '存在一些风险，建议优化';
    else if (score < 100) summaryText = '基本安全，有提升空间';

    // 计算统计数据
    const totalPasswords = vault.length;
    const weakPasswords = weakIssues.length;
    const reusedPasswords = reusedIssues.length;
    const oldPasswords = oldIssues.length;

    this.setData({
      score: Math.round(score),
      summaryText: summaryText,
      'issues.reused': reusedIssues,
      'issues.weak': weakIssues,
      'issues.old': oldIssues,
      totalPasswords,
      weakPasswords,
      reusedPasswords,
      oldPasswords
    });

    wx.hideLoading();

    // 静默完成，不显示弹窗提示
  },
  goToEdit(e) {
    wx.navigateTo({ url: `/pages/edit/edit?id=${e.currentTarget.dataset.id}` });
  },

  // --- 【新增】跳转到问题列表页的函数 ---
  goToListPage(type, title) {
    const issues = this.data.issues[type];
    if (issues && issues.length > 0) {
      // 将问题列表存入全局变量，避免URL过长
      app.globalData.issueList = issues;
      wx.navigateTo({
        url: `/pages/tools/issue-list/issue-list?type=${type}&title=${title}`
      });
    }
  },

  goToWeakList() {
    this.goToListPage('weak', '弱密码列表');
  },

  goToReusedList() {
    this.goToListPage('reused', '密码重用列表');
  },

  goToOldList() {
    this.goToListPage('old', '旧密码列表');
  },



  // 点击项目处理函数
  onTapWeakItem(e) {
    const id = e.currentTarget.dataset.id;
    this.navigateToEdit(id);
  },

  onTapReusedItem(e) {
    const id = e.currentTarget.dataset.id;
    this.navigateToEdit(id);
  },

  // 导航到编辑页面
  navigateToEdit(id) {
    wx.navigateTo({
      url: `/pages/edit/edit?id=${id}`,
      fail: () => {
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  }
});
