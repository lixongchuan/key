// 文件路径: pages/launch/launch.js
Page({
  onLoad: function (options) {
    // 页面加载时立即执行判断
    const isInitialized = wx.getStorageSync('is_initialized');
    
    if (isInitialized) {
      // 如果初始化过，就跳转到解锁页面
      wx.redirectTo({ url: '/pages/unlock/unlock' });
    } else {
      // 如果是第一次使用，就跳转到设置主密码的页面
      wx.redirectTo({ url: '/pages/setup/setup' });
    }
  }
})
