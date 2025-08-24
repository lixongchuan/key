import drawQrcode from 'weapp-qrcode';
const app = getApp();

Page({
  data: {
    qrCodeValue: '',
    showSaveTip: false,
  },

  onLoad() {
    const qrData = app.globalData.qrCodeData;
    if (qrData) {
      this.setData({ qrCodeValue: qrData });
      wx.setNavigationBarTitle({ title: '迁移二维码' });
      this.drawQRCode(qrData);
    } else {
      wx.showToast({ title: '无二维码数据', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  onUnload() {
    // 页面卸载时清空全局数据
    app.globalData.qrCodeData = null;
  },

  drawQRCode(text) {
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
            text: text,
            correctLevel: 2, // 提高纠错等级
          });
          this.setData({ showSaveTip: true }); // 显示保存提示
        });
    });
  },

  saveQRCode() {
    wx.canvasToTempFilePath({
      canvasId: 'qrcode-canvas', // 使用 canvasId
      canvas: wx.createSelectorQuery().select('#qrcode-canvas').node().exec((res) => res[0].node), // 获取canvas实例
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.showToast({ title: '已保存到相册', icon: 'success' });
          },
          fail: (err) => {
            if (err.errMsg === "saveImageToPhotosAlbum:fail auth deny") {
              wx.showModal({
                title: '授权失败',
                content: '请授权保存图片到相册，否则无法保存二维码。',
                showCancel: false,
                confirmText: '去设置',
                success: (res) => {
                  if (res.confirm) {
                    wx.openSetting();
                  }
                }
              });
            } else {
              wx.showToast({ title: '保存失败', icon: 'error' });
              console.error("保存图片失败:", err);
            }
          }
        });
      },
      fail: (err) => {
        wx.showToast({ title: '生成图片失败', icon: 'error' });
        console.error("生成临时文件路径失败:", err);
      }
    }, this);
  }
});
