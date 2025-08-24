// 账户中心（完全重写版本）
const app = getApp();
const { decrypt, encrypt } = require('../../../utils/crypto-helper.js');

Page({
  data: {
    // 用户资料
    userProfile: {},
    // 头像相关
    avatarOptions: [
      { id: 'avatar1', name: '动漫头像1', path: '/images/生成动漫风格头像.png' },
      { id: 'avatar2', name: '动漫头像2', path: '/images/生成动漫风格头像 (1).png' },
      { id: 'avatar3', name: '动漫头像3', path: '/images/生成动漫风格头像 (2).png' },
      { id: 'avatar4', name: '动漫头像4', path: '/images/生成动漫风格头像 (3).png' },
      { id: 'avatar5', name: '动漫头像5', path: '/images/生成动漫风格头像 (4).png' },
      { id: 'avatar6', name: '动漫头像6', path: '/images/生成动漫风格头像 (5).png' },
      { id: 'avatar7', name: '动漫头像7', path: '/images/生成动漫风格头像 (6).png' },
      { id: 'avatar8', name: '动漫头像8', path: '/images/生成动漫风格头像 (7).png' }
    ],
    // 昵称编辑相关
    isEditingNickname: false,
    editingNickname: '',
    originalNickname: '',
    // 头像选择弹窗
    showAvatarModal: false,
    // 界面状态
    operationLogsCount: 0,
    favoritesCount: 0,
    historyCount: 0
  },

  onLoad() {
    // 页面加载时的初始化
    this.initializeUserProfile();
  },

  onShow() {
    // 页面显示时刷新数据
    this.loadUserData();
  },

  // 初始化用户资料
  initializeUserProfile() {
    let userProfile = wx.getStorageSync('wx_user_profile') || {};
    const customAvatar = wx.getStorageSync('custom_avatar') || '';

    // 设置默认值
    userProfile = {
      avatarUrl: customAvatar || this.data.avatarOptions[0].path,
      nickName: userProfile.nickName || '风',
      ...userProfile
    };

    // 保存到本地存储
    wx.setStorageSync('wx_user_profile', userProfile);
    wx.setStorageSync('custom_avatar', userProfile.avatarUrl);

    this.setData({
      userProfile,
      originalNickname: userProfile.nickName
    });
  },

  // 加载用户数据
  loadUserData() {
    // 读取操作日志数量
    let operationLogsCount = 0;
    try {
      const raw = wx.getStorageSync('audit_log');
      if (raw) {
        let logs = [];
        if (app.globalData.sessionKey) {
          const decryptResult = decrypt(raw, app.globalData.sessionKey);
          if (decryptResult.success && decryptResult.data) {
            try {
              logs = JSON.parse(decryptResult.data);
            } catch (parseError) {
              console.error('解析操作日志失败:', parseError);
              logs = [];
            }
          } else {
            console.error('解密操作日志失败:', decryptResult?.message || '未知错误');
            logs = [];
          }
        } else {
          try {
            logs = JSON.parse(raw);
          } catch (parseError) {
            console.error('解析明文操作日志失败:', parseError);
            logs = [];
          }
        }
        operationLogsCount = logs.length;
      }
    } catch(e) {
      console.log('读取操作日志失败:', e);
    }

    this.setData({
      operationLogsCount,
      favoritesCount: 0,
      historyCount: 0
    });
  },

  // 审计日志追加（使用当前项目的加密约定：以 app.globalData.sessionKey 加密。如无则以明文存储降级）
  appendAuditLog(entry) {
    try {
      const logsCipher = wx.getStorageSync('audit_log');
      let logs = [];
      if (logsCipher) {
        const sessionKey = app.globalData.sessionKey;
        if (sessionKey) {
          const decryptResult = decrypt(logsCipher, sessionKey);
          if (decryptResult.success && decryptResult.data) {
            try {
              logs = JSON.parse(decryptResult.data);
            } catch (parseError) {
              console.error('解析审计日志失败:', parseError);
              logs = [];
            }
          } else {
            console.error('解密审计日志失败:', decryptResult?.message || '未知错误');
            logs = [];
          }
        } else {
          // 无 sessionKey 则尝试当作明文
          try {
            logs = JSON.parse(logsCipher);
          } catch (parseError) {
            console.error('解析明文审计日志失败:', parseError);
            logs = [];
          }
        }
      }
      logs.push({ ...entry, timestamp: Date.now() });

      const sessionKey = app.globalData.sessionKey;
      if (sessionKey) {
        const cipher = encrypt(JSON.stringify(logs), sessionKey);
        wx.setStorageSync('audit_log', cipher);
      } else {
        wx.setStorageSync('audit_log', JSON.stringify(logs));
      }
    } catch (e) {
      console.warn('写入审计日志失败（已忽略）：', e);
    }
  },

  // 本地“备份”占位：记录时间戳即可（后端接入后可上传密文）
  doLocalBackup() {
    const ts = new Date().toLocaleString();
    wx.setStorageSync('last_sync_at', ts);
    this.setData({ lastSyncText: ts });
    this.appendAuditLog({ type: 'local_backup', status: 'success', detail: '手动本地备份时间更新' });
    wx.showToast({ title: '已更新备份时间', icon: 'success' });
  },

  // 选择头像
  chooseAvatar() {
    const that = this;

    // 优先显示预置头像选择，让用户体验更流畅
    wx.showActionSheet({
      itemList: ['选择预置头像', '从相册选择', '拍照'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            that.showPresetAvatars();
            break;
          case 1:
            that.chooseFromAlbum();
            break;
          case 2:
            that.takePhoto();
            break;
        }
      },
      fail: () => {
        // 静默处理，不显示取消提示
        console.log('用户取消头像选择');
      }
    });
  },

  // 显示预置头像选择弹窗
  showPresetAvatars() {
    this.setData({
      showAvatarModal: true
    });
  },

  // 隐藏头像选择弹窗
  hideAvatarModal() {
    this.setData({
      showAvatarModal: false
    });
  },

  // 选择头像
  selectAvatar(e) {
    const { path, name } = e.currentTarget.dataset;
    this.setPresetAvatar({ path, name });
    this.hideAvatarModal();
  },

  // 从相册选择
  chooseFromAlbum() {
    wx.chooseImage({
      count: 1,
      sourceType: ['album'],
      success: (res) => {
        this.updateAvatar(res.tempFilePaths[0]);
      },
      fail: () => {
        wx.showToast({ title: '选择取消', icon: 'none' });
      }
    });
  },

  // 拍照
  takePhoto() {
    wx.chooseImage({
      count: 1,
      sourceType: ['camera'],
      success: (res) => {
        this.updateAvatar(res.tempFilePaths[0]);
      },
      fail: () => {
        wx.showToast({ title: '拍照取消', icon: 'none' });
      }
    });
  },

  // 设置预置头像
  setPresetAvatar(option) {
    this.updateAvatar(option.path, `已选择${option.name}`);
  },

  // 更新头像
  updateAvatar(avatarPath, successMessage = '头像已更新') {
    try {
      // 保存到本地存储
      wx.setStorageSync('custom_avatar', avatarPath);

      // 更新用户资料
      const userProfile = { ...this.data.userProfile, avatarUrl: avatarPath };
      wx.setStorageSync('wx_user_profile', userProfile);

      // 更新页面数据
      this.setData({
        'userProfile.avatarUrl': avatarPath
      });

      // 设置全局刷新标志，让首页更新用户头像
      app.globalData.needsRefresh.userProfile = true;

      // 记录操作日志
      app.addAuditLog('update_avatar', '用户更新了头像');

      wx.showToast({ title: successMessage, icon: 'success' });
    } catch (error) {
      console.error('更新头像失败:', error);
      wx.showToast({ title: '更新失败，请重试', icon: 'none' });
    }
  },

  // 切换编辑昵称模式
  toggleEditNickname() {
    if (this.data.isEditingNickname) {
      // 正在编辑时点击编辑按钮，保存昵称
      this.saveNickname();
    } else {
      // 开始编辑
      this.startEditNickname();
    }
  },

  // 开始编辑昵称
  startEditNickname() {
    const currentNickname = this.data.userProfile.nickName || '';
    this.setData({
      isEditingNickname: true,
      editingNickname: currentNickname,
      originalNickname: currentNickname
    });
  },

  // 输入昵称
  onNicknameInput(e) {
    const value = e.detail.value;
    this.setData({
      editingNickname: value
    });
  },

  // 保存昵称
  saveNickname() {
    const newNickname = this.data.editingNickname.trim();

    // 验证昵称
    if (!newNickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }

    if (newNickname.length > 7) {
      wx.showToast({ title: '昵称不能超过7个字符', icon: 'none' });
      return;
    }

    // 检查是否与原昵称相同
    if (newNickname === this.data.originalNickname) {
      this.cancelEditNickname();
      return;
    }

    // 更新用户资料
    const userProfile = { ...this.data.userProfile, nickName: newNickname };

    try {
      // 保存到本地存储
      wx.setStorageSync('wx_user_profile', userProfile);
      app.globalData.userProfile = userProfile;

      // 更新页面数据
      this.setData({
        userProfile: userProfile,
        isEditingNickname: false,
        editingNickname: '',
        originalNickname: newNickname
      });

      // 记录操作日志
      app.addAuditLog('update_nickname', `用户将昵称从"${this.data.originalNickname}"更改为"${newNickname}"`);

      wx.showToast({ title: '昵称已保存', icon: 'success' });
    } catch (error) {
      console.error('保存昵称失败:', error);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  // 取消编辑昵称
  cancelEditNickname() {
    this.setData({
      isEditingNickname: false,
      editingNickname: '',
      originalNickname: this.data.userProfile.nickName || ''
    });
  },

  // 扫描二维码
  scanQRCode() {
    wx.scanCode({
      onlyFromCamera: true,
      success: (res) => {
        console.log('扫描结果:', res);
        wx.showModal({
          title: '扫描结果',
          content: `扫描到：${res.result}`,
          showCancel: false
        });
      },
      fail: (err) => {
        console.error('扫描失败:', err);
        wx.showToast({ title: '扫描取消', icon: 'none' });
      }
    });
  },

  // 跳转到操作日志
  goToAuditLog() {
    wx.navigateTo({
      url: '/pages/settings/audit-log/audit-log'
    });
  },

  // 跳转到我的收藏（调用首页功能）
  goToFavorites() {
    wx.switchTab({
      url: '/pages/index/index'
    });
    wx.showToast({
      title: '请在首页查看收藏',
      icon: 'none',
      duration: 1500
    });
  },

  // 跳转到设置页面
  goToSettings() {
    wx.switchTab({
      url: '/pages/settings/settings'
    });
  },



  // 跳转到密码生成器
  goToPasswordGenerator() {
    wx.navigateTo({
      url: '/pages/tools/generator/generator'
    });
  },

  // 跳转到安全报告
  goToSecurityReport() {
    wx.navigateTo({
      url: '/pages/tools/security-report/security-report'
    });
  },

  // 显示功能开发中提示
  showComingSoon(e) {
    const feature = e.currentTarget.dataset.feature;
    wx.showToast({
      title: `${feature}功能开发中`,
      icon: 'none',
      duration: 1500
    });
  }


});
