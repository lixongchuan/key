const app = getApp();

Page({
  data: {
    issueList: [],
    issueType: '',
    issueTitle: ''
  },

  onLoad(options) {
    const { type, title } = options;
    const list = app.globalData.issueList || [];
    
    this.setData({
      issueList: list,
      issueType: type,
      issueTitle: title
    });
    
    wx.setNavigationBarTitle({
      title: title || '问题列表'
    });
  },

  onUnload() {
    // 页面卸载时清空全局变量，避免数据污染
    app.globalData.issueList = null;
  },

  goToEdit(e) {
    const id = e.currentTarget.dataset.id;
    // 设置刷新标志，以便从编辑页返回时，报告页和首页都能刷新
    app.globalData.needsRefresh.securityReport = true;
    // 导航到编辑页面，编辑页会根据操作类型设置正确的刷新标志
    wx.navigateTo({
      url: `/pages/edit/edit?id=${id}`
    });
  }
});
