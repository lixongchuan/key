// 文件路径: pages/tools/index.js
Page({
  navigateTo(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
  }
});