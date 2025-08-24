// 文件：pages/settings/about/about.js
Page({
  data: {
    repoUrl: 'https://github.com/your-repo', // GitHub仓库地址
    version: '1.0.0', // 应用版本
    buildTime: '' // 构建时间
  },
  onLoad() {
    // 设置构建时间（当前时间作为示例）
    const now = new Date();
    const buildTime = now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    this.setData({ buildTime });

    // 可在此读取远端配置或本地 storage 的仓库地址
    // const url = wx.getStorageSync('repo_url') || 'https://github.com/your-repo';
    // this.setData({ repoUrl: url });
  },
  copyEmail() {
    wx.setClipboardData({
      data: 'lixongchuan@outlook.com',
      success: () => wx.showToast({ title: '邮箱已复制', icon: 'success' })
    });
  },
  // 暂时禁用复制功能
  /*
  copyRepo() {
    const url = this.data.repoUrl || 'https://github.com/your-repo';
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '仓库地址已复制', icon: 'success' })
    });
  },
  copyProductUrl() {
    wx.setClipboardData({
      data: '117.72.52.104:5000',
      success: () => wx.showToast({ title: '地址已复制', icon: 'success' })
    });
  }
  */

  // 占位函数，防止调用错误
  copyRepo() {
    wx.showToast({ title: '功能暂时不可用', icon: 'none' });
  },
  copyProductUrl() {
    wx.showToast({ title: '功能暂时不可用', icon: 'none' });
  }
});
