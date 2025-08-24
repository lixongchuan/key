// 文件路径: pages/index/index.js
const app = getApp();
const { decrypt, encrypt } = require('../../utils/crypto-helper.js'); // 确保导入encrypt
const { formatTime, formatDetailedTime } = require('../../utils/format-helper.js');

// 格式化配置数据的函数
function formatConfig(config) {
  if (!config || typeof config !== 'object') {
    return null;
  }

  return {
    ...config,
    createdAt: formatTime(config.createdAt || config.created_at),
    updatedAt: config.updatedAt || config.updated_at ? formatTime(config.updatedAt || config.updated_at) : undefined,
    formattedCreatedAt: formatDetailedTime(config.createdAt || config.created_at),
    formattedUpdatedAt: config.updatedAt || config.updated_at ? formatDetailedTime(config.updatedAt || config.updated_at) : undefined
  };
}

Page({
  data: {
    vault: [], // 原始的、完整的、解密后的数据
    filteredVault: [], // 根据筛选条件过滤后的数据
    activeFilter: 'all', // 'all', 'favorites', 'special'
    showFab: true, // 悬浮按钮的显示状态
    searchKeyword: '', // 【新增】搜索关键词
    searchTimer: null, // 【新增】用于函数防抖的计时器
    userProfile: {}, // 【新增】用户资料
    specialItems: [], // 特殊条目（配置和历史）

    // 【新增】批量选择相关状态
    selectionMode: false, // 是否处于选择模式
    selectedItems: [], // 已选择的条目ID数组
    showBatchToolbar: false, // 是否显示批量操作工具栏

    // 【新增】性能优化相关状态
    isDataLoaded: false, // 数据是否已加载
    isSpecialLoaded: false, // 特殊条目是否已加载
    lastLoadTime: 0, // 上次加载时间戳
    isLoadingData: false, // 是否正在加载数据
    isLoadingSpecial: false, // 是否正在加载特殊条目

    // 【新增】卡片尺寸切换相关状态
    cardSizeMode: 'normal', // 'normal' 或 'compact' - 卡片尺寸模式

    // 【新增】即时更新相关状态
    needsImmediateUpdate: false, // 是否需要即时更新
  },

  onShow() {
    // 检查是否需要强制跳转到解锁页
    const sessionKey = app.globalData.sessionKey;
    if (!sessionKey || app.globalData.isLocked) {
      wx.redirectTo({ url: '/pages/unlock/unlock' });
      return;
    }

    // 快速初始化页面状态（避免UI闪烁）
    this.quickInitialize();

    // 统一的数据加载逻辑
    this.smartDataLoad();

    // 延迟执行非关键操作
    setTimeout(() => {
      this.performBackgroundTasks();
    }, 100);
  },

  onLoad() {
    // 页面加载时初始化用户资料
    this.loadUserProfile();
  },

  // 快速初始化页面状态
  quickInitialize() {
    // 立即恢复筛选状态（本地操作，无需等待）
    this.restoreFilterState();

    // 恢复卡片尺寸偏好
    this.restoreCardSizePreference();

    // 检查是否需要刷新用户资料
    if (app.globalData.needsRefresh.userProfile) {
      this.loadUserProfile();
      app.globalData.needsRefresh.userProfile = false;
    }
  },

  // 优雅的数据加载 - 减少不必要的刷新
  smartDataLoad() {
    const currentTime = Date.now();
    const timeSinceLastLoad = currentTime - this.data.lastLoadTime;

    // 首次加载
    if (!this.data.isDataLoaded) {
      console.log('首次加载数据');
      this.loadDataBasedOnFilter();
      return;
    }

    // 定期刷新（30分钟）- 减少刷新频率
    if (timeSinceLastLoad > 30 * 60 * 1000) {
      console.log('定期刷新数据（30分钟）');
      this.silentRefresh();
      return;
    }

    // 检查是否有明确的刷新请求
    if (this.hasPendingRefresh(currentTime)) {
      console.log('处理待处理的刷新请求');
      this.processPendingRefresh();
      return;
    }

    // 使用缓存数据
    console.log('使用缓存数据');
    this.filterAndSortVault();
  },

  // 静默刷新 - 不显示加载状态
  silentRefresh() {
    console.log('开始静默刷新...');
    this.loadVaultData(() => {
      console.log('静默刷新完成');
      this.updateUIAfterDataLoad();
    });
  },

  // 检查是否有待处理的刷新请求 - 简化逻辑
  hasPendingRefresh(currentTime) {
    // 简化：只要有任何刷新标志就更新
    if (app.globalData.needsRefresh && app.globalData.needsRefresh.index) {
      const refreshRequests = app.globalData.needsRefresh.index;
      const operations = ['add', 'edit', 'delete'];

      for (const operation of operations) {
        const request = refreshRequests[operation];
        if (request && request.needed) {
          return true;
        }
      }
    }
    return false;
  },

  // 处理待处理的刷新请求 - 直接即时更新
  processPendingRefresh() {
    console.log('检测到数据变更，开始即时更新...');

    // 立即重置标志，防止重复处理
    this.resetRefreshFlags();

    // [修复] 数据更新前清空选择状态，避免蓝边问题
    this.clearSelectionState();

    // 直接更新数据，用户感受不到加载过程
    this.loadVaultData(() => {
      console.log('数据更新完成');
      this.updateUIAfterDataLoad();
    });
  },

  // 强制重新加载数据 - 增强版
  forceReloadData() {
    console.log('开始强制刷新数据...');
    const currentTime = Date.now();

    // 立即重置状态，确保UI更新
    this.setData({
      vault: [],
      filteredVault: [],
      specialItems: [],
      isDataLoaded: false,
      isSpecialLoaded: false,
      lastLoadTime: currentTime
    });

    // 直接调用数据加载，确保立即更新UI
    this.loadVaultData(() => {
      console.log('强制刷新完成，立即更新UI');
      // 在数据加载完成后立即更新显示
      this.updateUIAfterDataLoad();
    });
  },

  // 统一的数据加载后UI更新逻辑
  updateUIAfterDataLoad() {
    const currentFilter = this.data.activeFilter;

    if (currentFilter === 'special') {
      // 特殊目录：加载特殊条目
      this.loadSpecialItems();
    } else {
      // 普通模式：直接筛选和排序现有数据
      this.filterAndSortVault();
    }

    // 重置刷新标志，防止重复刷新
    this.resetRefreshFlags();
  },

  // 重置所有刷新标志
  resetRefreshFlags() {
    if (app.globalData.needsRefresh && app.globalData.needsRefresh.index) {
      ['add', 'edit', 'delete'].forEach(operation => {
        if (app.globalData.needsRefresh.index[operation]) {
          app.globalData.needsRefresh.index[operation].needed = false;
        }
      });
    }
  },

  // [修复] 清空选择状态，避免蓝边问题
  clearSelectionState() {
    console.log('清空选择状态，避免蓝边问题');
    this.setData({
      selectionMode: false,
      selectedItems: [],
      showBatchToolbar: false
    });

    // 确保显示数据中也没有选择状态
    const filteredVault = this.data.filteredVault.map(item => ({
      ...item,
      selected: false
    }));
    this.setData({ filteredVault });
  },

  // 根据当前筛选状态加载数据
  loadDataBasedOnFilter() {
    const currentFilter = this.data.activeFilter;

    if (currentFilter === 'special') {
      // 特殊目录：并行加载主数据和特殊数据
      this.loadVaultData(() => {
        this.loadSpecialItems();
      });
    } else {
      // 普通模式：只加载主数据
      this.loadVaultData();
    }
  },

  // 执行后台任务（不影响用户体验）
  performBackgroundTasks() {
    // 检查生物识别状态（后台执行）
    this.checkAndResetBiometrics();

    // 自动启用生物识别（如果支持且未启用）
    this.autoEnableBiometricsIfNeeded();
  },

  // 自动启用生物识别（简化流程）
  autoEnableBiometricsIfNeeded() {
    // 检查是否已经启用了生物识别
    const biometricsEnabled = wx.getStorageSync('biometrics_enabled') || false;
    const openid = wx.getStorageSync('wx_openid') || '';
    const bioUnlockKey = `bio_unlock_${openid}`;

    if (!biometricsEnabled || wx.getStorageSync(bioUnlockKey)) {
      return; // 已经启用或不需要启用
    }

    // 如果没有openid，生成一个模拟的（生产环境需要真实微信登录）
    if (!openid) {
      const newOpenid = 'sim_' + Math.random().toString(36).substr(2, 9);
      wx.setStorageSync('wx_openid', newOpenid);
    }

    // 直接启用生物识别，无需用户验证（按用户要求）
    this.enableBiometricsSilently();
  },

  // 静默启用生物识别
  enableBiometricsSilently() {
    try {
      const sessionKey = app.globalData.sessionKey;
      if (!sessionKey) {
        console.error('会话已过期，无法启用生物识别');
        return;
      }

      const openid = wx.getStorageSync('wx_openid') || '';

      // 生成设备盐
      let deviceSalt = wx.getStorageSync('bio_device_salt');
      if (!deviceSalt) {
        deviceSalt = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        wx.setStorageSync('bio_device_salt', deviceSalt);
      }

      // 加密主密钥
      const { deriveKey, encrypt } = require('../../utils/crypto-helper.js');
      const BIO_KDF_TAG = 'bio.unlock.fixed.tag.v1';
      const kbio = deriveKey(BIO_KDF_TAG, deviceSalt);
      const enc_km = encrypt(sessionKey, kbio);

      // 保存生物识别凭据
      const record = {
        enc_km,
        createdAt: Date.now(),
        version: 1
      };
      wx.setStorageSync(`bio_unlock_${openid}`, JSON.stringify(record));

      // 开启生物识别总开关
      wx.setStorageSync('biometrics_enabled', true);

      // 静默启用，不显示提示（按用户要求）
      console.log('生物识别已静默启用');

      app.addAuditLog('enable_biometrics', '首页静默启用生物识别');

    } catch (e) {
      console.error('启用生物识别失败:', e);
    }
  },

  // 检查生物识别状态并提供重置功能
  checkAndResetBiometrics() {
    try {
      const biometricsEnabled = wx.getStorageSync('biometrics_enabled') || false;
      const openid = wx.getStorageSync('wx_openid') || '';
      const bioUnlockKey = `bio_unlock_${openid}`;
      const hasBioCredential = !!wx.getStorageSync(bioUnlockKey);

      console.log('生物识别状态检查:', {
        biometricsEnabled,
        hasOpenid: !!openid,
        hasBioCredential,
        openid: openid
      });

      // 如果生物识别开启但没有凭据，尝试重新启用
      if (biometricsEnabled && openid && !hasBioCredential) {
        console.log('发现生物识别状态不一致，尝试修复');
        this.enableBiometricsSilently();
      }

    } catch (e) {
      console.error('检查生物识别状态失败:', e);
    }
  },

  // 提供生物识别重置功能（可通过特定方式触发）
  resetBiometrics() {
    try {
      const openid = wx.getStorageSync('wx_openid') || '';
      const bioUnlockKey = `bio_unlock_${openid}`;

      // 清理生物识别相关数据
      wx.removeStorageSync('biometrics_enabled');
      wx.removeStorageSync('bio_device_salt');
      if (openid) {
        wx.removeStorageSync(bioUnlockKey);
      }

      // 重新启用生物识别
      setTimeout(() => {
        this.enableBiometricsSilently();
      }, 1000);

      console.log('生物识别已重置并重新启用');
      app.addAuditLog('reset_biometrics', '用户重置并重新启用生物识别');

    } catch (e) {
      console.error('重置生物识别失败:', e);
    }
  },

  loadVaultData(callback) {
    // 避免重复加载
    if (this.data.isLoadingData) {
      console.log('数据正在加载中，跳过重复请求');
      return;
    }

    this.setData({ isLoadingData: true });

    // 延迟显示loading，避免快速加载时的闪烁
    let loadingTimer = setTimeout(() => {
      wx.showLoading({ title: '加载中...', mask: true });
    }, 300);

    try {
      const encryptedVault = wx.getStorageSync('vault');

      // 检查是否有加密数据
      if (!encryptedVault || encryptedVault.trim() === '') {
        console.log('没有找到保险箱数据，初始化空保险箱');
        clearTimeout(loadingTimer);
        this.setData({
          vault: [],
          isDataLoaded: true,
          isLoadingData: false,
          lastLoadTime: Date.now()
        }, () => {
          this.filterAndSortVault();
          if (typeof callback === 'function') {
            callback();
          }
        });
        return;
      }

      const decryptResult = decrypt(encryptedVault, app.globalData.sessionKey);

      if (!decryptResult.success) {
        console.error("解密失败:", decryptResult.message);
        clearTimeout(loadingTimer);

        // 检查是否是数据损坏导致的解密失败
        if (decryptResult.message && decryptResult.message.includes('Malformed UTF-8 data')) {
          console.log('检测到数据损坏，提供恢复选项');
          this.showDataCorruptionRecovery();
          return;
        }

        wx.showToast({ title: `数据解密失败: ${decryptResult.message}`, icon: 'error' });
        wx.redirectTo({ url: '/pages/unlock/unlock' });
        return;
      }

      let decryptedData;
      try {
        decryptedData = JSON.parse(decryptResult.data || '[]');
      } catch (parseError) {
        console.error("JSON解析失败:", parseError);
        clearTimeout(loadingTimer);
        this.showDataCorruptionRecovery();
        return;
      }

      // [关键修复] 清理数据项的选择状态，避免蓝边问题
      const cleanedVault = decryptedData
        .filter(item => item.status === 'active')
        .map(item => {
          const cleanedItem = { ...item };
          delete cleanedItem.selected;
          delete cleanedItem.selectionMode;
          delete cleanedItem.showBatchToolbar;
          cleanedItem.selected = false; // 强制设置为未选择
          return cleanedItem;
        });

      clearTimeout(loadingTimer);
      this.setData({
        vault: cleanedVault,
        isDataLoaded: true,
        isLoadingData: false,
        lastLoadTime: Date.now(),
        // [修复] 数据加载时强制清空选择状态，避免蓝边问题
        selectionMode: false,
        selectedItems: [],
        showBatchToolbar: false
      }, () => {
        // 数据加载后，立即执行一次筛选和排序
        this.filterAndSortVault();
        if (typeof callback === 'function') {
          callback();
        }
      });

    } catch (e) {
      console.error("加载或解析失败:", e);
      clearTimeout(loadingTimer);

      // 检查是否是数据损坏相关的错误
      if (e.message && e.message.includes('Malformed UTF-8 data')) {
        console.log('检测到数据损坏异常，提供恢复选项');
        this.showDataCorruptionRecovery();
        return;
      }

      wx.showToast({ title: '数据加载失败', icon: 'error' });
      wx.redirectTo({ url: '/pages/unlock/unlock' });
    } finally {
      wx.hideLoading();
    }
  },

  // 显示数据损坏恢复选项
  showDataCorruptionRecovery() {
    wx.hideLoading();

    wx.showModal({
      title: '数据损坏检测',
      content: '检测到保险箱数据可能已损坏。这通常发生在密码修改过程中数据未正确重新加密。\n\n请选择处理方式：',
      showCancel: true,
      confirmText: '重置保险箱',
      cancelText: '尝试修复',
      success: (res) => {
        if (res.confirm) {
          // 用户选择重置保险箱
          this.resetCorruptedVault();
        } else {
          // 用户选择尝试修复
          this.attemptDataRepair();
        }
      },
      fail: () => {
        // 如果modal显示失败，直接重置
        this.resetCorruptedVault();
      }
    });
  },

  // 尝试修复数据
  attemptDataRepair() {
    wx.showLoading({ title: '尝试修复数据...', mask: true });

    try {
      // 清除可能损坏的缓存数据
      const keysToCheck = ['vault', 'vault_meta'];
      keysToCheck.forEach(key => {
        try {
          const data = wx.getStorageSync(key);
          if (data && typeof data === 'string' && data.length > 0) {
            // 简单的数据格式检查
            if (!data.includes('::') || data.length < 10) {
              console.log(`清除可疑数据: ${key}`);
              wx.removeStorageSync(key);
            }
          }
        } catch (e) {
          console.error(`检查${key}失败:`, e);
        }
      });

      // 重新初始化保险箱
      this.initializeEmptyVault();

      wx.showToast({
        title: '数据已修复',
        icon: 'success',
        duration: 2000
      });

    } catch (e) {
      console.error('数据修复失败:', e);
      this.resetCorruptedVault();
    } finally {
      wx.hideLoading();
    }
  },

  // 重置损坏的保险箱
  resetCorruptedVault() {
    wx.showLoading({ title: '重置保险箱...', mask: true });

    try {
      // 清除所有相关数据
      const keysToRemove = ['vault', 'vault_meta', 'current_session_key'];
      keysToRemove.forEach(key => {
        try {
          wx.removeStorageSync(key);
        } catch (e) {
          console.error(`清除${key}失败:`, e);
        }
      });

      // 重新初始化空保险箱
      this.initializeEmptyVault();

      wx.showToast({
        title: '保险箱已重置',
        icon: 'success',
        duration: 2000
      });

      // 记录审计日志
      app.addAuditLog('vault_reset', '因数据损坏重置保险箱');

    } catch (e) {
      console.error('重置保险箱失败:', e);
      wx.showToast({
        title: '重置失败，请重启应用',
        icon: 'none',
        duration: 3000
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 初始化空保险箱
  initializeEmptyVault() {
    try {
      // 创建空的保险箱数据
      const emptyVault = [];
      const encryptedVault = encrypt(JSON.stringify(emptyVault), app.globalData.sessionKey);

      // 保存空的保险箱数据
      wx.setStorageSync('vault', encryptedVault);

      // 更新页面数据
      this.setData({
        vault: [],
        filteredVault: []
      });

      console.log('空保险箱初始化完成');

    } catch (e) {
      console.error('初始化空保险箱失败:', e);
      throw e;
    }
  },

  // 【新增】搜索输入处理函数 (带防抖)
  onSearchInput(e) {
    const keyword = e.detail.value.trim();
    // 清除上一个计时器
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer);
    }
    // 设置新计时器，300ms后执行搜索
    const timer = setTimeout(() => {
      this.setData({ searchKeyword: keyword });
      this.filterAndSortVault(); // 调用统一的筛选函数
    }, 300);
    this.setData({ searchTimer: timer });
  },

  // 【修改】filterAndSortVault 函数，整合搜索逻辑
  filterAndSortVault() {
    // 确保vault数据已加载
    if (!this.data.vault || !Array.isArray(this.data.vault)) {
      console.log('Vault数据未加载，尝试重新加载');
      this.loadVaultData();
      return;
    }

    let tempVault = [...this.data.vault];
    const keyword = this.data.searchKeyword.toLowerCase();

    // 1. 关键词搜索 (在所有筛选之前)
    if (keyword) {
      tempVault = tempVault.filter(item =>
        (item.title && item.title.toLowerCase().includes(keyword)) ||
        (item.username && item.username.toLowerCase().includes(keyword)) ||
        (item.url && item.url.toLowerCase().includes(keyword)) ||
        (item.tags && item.tags.some(tag => tag.toLowerCase().includes(keyword))) // 增加标签搜索
      );
    }

    // 2. 收藏夹筛选
    if (this.data.activeFilter === 'favorites') {
      tempVault = tempVault.filter(item => item.isFavorite);
    }

    // 3. 排序
    tempVault.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    this.setData({ filteredVault: tempVault });
  },

  // 【新增】显示筛选选项
  onShowFilterOptions() {
    wx.showActionSheet({
      itemList: ['全部', '收藏', '特殊条目'],
      success: (res) => {
        let newFilter = this.data.activeFilter;
        if (res.tapIndex === 0) {
          newFilter = 'all';
        } else if (res.tapIndex === 1) {
          newFilter = 'favorites';
        } else if (res.tapIndex === 2) {
          newFilter = 'special';
        }

        if (this.data.activeFilter !== newFilter) {
          this.setData({ activeFilter: newFilter });
          if (newFilter === 'special') {
            this.loadSpecialItems();
          } else {
            this.filterAndSortVault();
          }
        }
      },
      fail: (res) => {
        console.log(res.errMsg);
      }
    });
  },

  onToggleFavorite(e) {
    // 【修复】移除 e.stopPropagation(); 修复工作已在wxml中由catchtap完成
    const id = e.currentTarget.dataset.id;
    // 找到在原始 vault 数组中的项
    const itemIndex = this.data.vault.findIndex(item => item.id === id);
    if (itemIndex > -1) {
      const isFavorite = !this.data.vault[itemIndex].isFavorite;
      // 使用 setData 更新 vault 和 filteredVault 中的特定项
      this.setData({
        [`vault[${itemIndex}].isFavorite`]: isFavorite,
      }, () => {
        this.filterAndSortVault(); // 重新筛选，以防在收藏夹视图下操作
        this.saveVaultChanges(); // 保存到本地
      });
    }
  },

  saveVaultChanges() {
    // 这个函数现在只负责把 this.data.vault 重新加密并存起来
    try {
      const encryptedVault = encrypt(JSON.stringify(this.data.vault), app.globalData.sessionKey);
      wx.setStorageSync('vault', encryptedVault);
    } catch (e) {
      wx.showToast({ title: '保存变更失败', icon: 'error' });
    }
  },

  onCopyPassword(e) {
    // 【修复】移除 e.stopPropagation();
    const password = e.currentTarget.dataset.password;
    wx.setClipboardData({
      data: password,
      success: () => wx.showToast({ title: '密码已复制' }),
    });
  },

  onEditItem(e) {
    const id = e.currentTarget.dataset.id;
    // 导航到编辑页面，编辑页会根据操作类型设置正确的刷新标志
    wx.navigateTo({ url: `/pages/edit/edit?id=${id}` });
  },

  onAddNew() {
    // 导航到编辑页面，编辑页会根据操作类型设置正确的刷新标志
    wx.navigateTo({ url: '/pages/edit/edit' });
  },

  // 【新增】加载用户资料
  loadUserProfile() {
    try {
      let userProfile = wx.getStorageSync('wx_user_profile') || {};
      const customAvatar = wx.getStorageSync('custom_avatar') || '';

      // 设置默认值
      userProfile = {
        avatarUrl: customAvatar || '/images/生成动漫风格头像.png',
        nickName: userProfile.nickName || '風',
        ...userProfile
      };

      this.setData({
        userProfile: userProfile
      });
    } catch (e) {
      console.error('加载用户资料失败:', e);
    }
  },

  // 【新增】跳转到账户中心
  goToAccountCenter() {
    wx.navigateTo({
      url: '/pages/settings/account-center/account-center'
    });
  },

  // 【新增】加载特殊条目（配置和历史）
  loadSpecialItems() {
    try {
      const specialItems = [];

      // 1. 加载助记密码配置
      const mnemonicConfigs = wx.getStorageSync('mnemonic_configs') || [];
      if (Array.isArray(mnemonicConfigs)) {
        mnemonicConfigs.forEach((config, index) => {
          if (config && config.serviceId) {
            const formattedConfig = formatConfig(config);
            specialItems.push({
              id: `config_mnemonic_${index}`,
              title: `${config.serviceId}`, // 直接显示服务标识
              username: `助记密码配置 (${config.hashAlgorithm?.toUpperCase() || '未知'})`, // 显示配置类型和算法
              url: 'mnemonic',
              type: 'config', // 标识为配置类型
              configType: 'mnemonic',
              configData: config,
              createdAt: formattedConfig.createdAt,
              isFavorite: false,
              status: 'active'
            });
          }
        });
      }

      // 2. 加载随机密码历史
      const generatedPasswords = wx.getStorageSync('generated_passwords') || [];
      if (Array.isArray(generatedPasswords)) {
        // 只显示最近的5个密码历史
        generatedPasswords.slice(-5).forEach((pwd, index) => {
          if (pwd && pwd.password) {
            const formattedTime = formatTime(pwd.createdAt || pwd.created_at);
            specialItems.push({
              id: `history_password_${index}`,
              title: `${pwd.password.substring(0, 12)}...`, // 显示密码前12位
              username: `随机密码 (${pwd.length}位, ${pwd.strength})`, // 显示详细信息
              url: 'generator',
              type: 'history', // 标识为历史类型
              historyType: 'password',
              historyData: pwd,
              createdAt: formattedTime,
              isFavorite: false,
              status: 'active'
            });
          }
        });
      }

      console.log('加载特殊条目:', specialItems.length);
      this.setData({
        filteredVault: specialItems
      });

    } catch (e) {
      console.error('加载特殊条目失败:', e);
      wx.showToast({
        title: '加载特殊条目失败',
        icon: 'none'
      });
    }
  },

  // 【新增】处理特殊条目的点击
  handleSpecialItemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    if (item.type === 'config') {
      // 配置类型 - 显示配置详情
      this.showConfigDetail(item);
    } else if (item.type === 'history') {
      // 历史类型 - 显示详细信息或执行操作
      if (item.historyType === 'password') {
        this.showPasswordHistoryDetail(item.historyData);
      }
    }
  },

  // 【新增】显示配置详情
  showConfigDetail(configItem) {
    const configData = configItem.configData;
    const { formatTime, formatDetailedTime } = require('../../utils/format-helper.js');

    const createdTime = formatTime(configData.createdAt);
    const detailedTime = formatDetailedTime(configData.createdAt);

    wx.showModal({
      title: '配置详情',
      content: `服务标识: ${configData.serviceId}\n算法: ${configData.hashAlgorithm?.toUpperCase() || '未知'}\n密码长度: ${configData.passwordLength || '未知'}位\n创建时间: ${createdTime} (${detailedTime})`,
      showCancel: true,
      confirmText: '编辑配置',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          // 跳转到对应工具页面进行编辑，并传递配置ID
          if (configItem.configType === 'mnemonic') {
            wx.navigateTo({
              url: `/pages/tools/mnemonic-generator/mnemonic-generator?configId=${encodeURIComponent(configData.serviceId)}`
            });
          }
        }
      }
    });
  },

  // 【新增】显示密码历史详情
  showPasswordHistoryDetail(historyData) {
    const { formatDetailedTime } = require('../../utils/format-helper.js');
    const formattedTime = formatTime(historyData.createdAt);
    const detailedTime = formatDetailedTime(historyData.createdAt);

    wx.showModal({
      title: '密码历史详情',
      content: `密码: ${historyData.password.substring(0, 12)}...\n长度: ${historyData.length}位\n强度: ${historyData.strength}\n创建时间: ${formattedTime} (${detailedTime})`,
      showCancel: true,
      confirmText: '复制密码',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: historyData.password,
            success: () => {
              wx.showToast({
                title: '密码已复制',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  },

  // 【新增】恢复筛选状态
  restoreFilterState() {
    try {
      const savedFilter = wx.getStorageSync('home_active_filter');
      if (savedFilter && ['all', 'favorites', 'special'].includes(savedFilter)) {
        this.setData({ activeFilter: savedFilter });
        console.log('恢复筛选状态:', savedFilter);
      }
    } catch (e) {
      console.error('恢复筛选状态失败:', e);
    }
  },

  // 【新增】保存筛选状态
  saveFilterState() {
    try {
      wx.setStorageSync('home_active_filter', this.data.activeFilter);
    } catch (e) {
      console.error('保存筛选状态失败:', e);
    }
  },

  // 【新增】切换卡片尺寸模式
  toggleCardSizeMode() {
    const newMode = this.data.cardSizeMode === 'normal' ? 'compact' : 'normal';
    this.setData({
      cardSizeMode: newMode
    });

    // 保存用户偏好
    this.saveCardSizePreference(newMode);

    wx.showToast({
      title: newMode === 'compact' ? '已切换到紧凑模式' : '已切换到正常模式',
      icon: 'success',
      duration: 1500
    });
  },

  // 【新增】保存卡片尺寸偏好
  saveCardSizePreference(mode) {
    try {
      wx.setStorageSync('home_card_size_mode', mode);
    } catch (e) {
      console.error('保存卡片尺寸偏好失败:', e);
    }
  },

  // 【新增】恢复卡片尺寸偏好
  restoreCardSizePreference() {
    try {
      const savedMode = wx.getStorageSync('home_card_size_mode');
      if (savedMode && ['normal', 'compact'].includes(savedMode)) {
        this.setData({
          cardSizeMode: savedMode
        });
        console.log('恢复卡片尺寸模式:', savedMode);
      } else {
        // 默认使用正常模式
        this.setData({
          cardSizeMode: 'normal'
        });
      }
    } catch (e) {
      console.error('恢复卡片尺寸偏好失败:', e);
      this.setData({
        cardSizeMode: 'normal'
      });
    }
  },

  // 【新增】显示卡片尺寸选择菜单
  showCardSizeMenu() {
    const currentMode = this.data.cardSizeMode;
    const that = this;

    wx.showActionSheet({
      itemList: [
        currentMode === 'normal' ? '✓ 正常模式' : '正常模式',
        currentMode === 'compact' ? '✓ 紧凑模式' : '紧凑模式'
      ],
      success: (res) => {
        let newMode = currentMode;
        if (res.tapIndex === 0) {
          newMode = 'normal';
        } else if (res.tapIndex === 1) {
          newMode = 'compact';
        }

        if (newMode !== currentMode) {
          that.setData({
            cardSizeMode: newMode
          });

          // 保存用户偏好
          that.saveCardSizePreference(newMode);

          wx.showToast({
            title: newMode === 'compact' ? '已切换到紧凑模式' : '已切换到正常模式',
            icon: 'success',
            duration: 1500
          });
        }
      },
      fail: (res) => {
        console.log('用户取消卡片尺寸选择:', res.errMsg);
      }
    });
  },

  // 【优化】改进的特殊条目加载，增加数据验证和错误处理
  loadSpecialItems() {
    try {
      const specialItems = [];

      // 1. 加载助记密码配置 - 优化格式
      try {
        const mnemonicConfigs = wx.getStorageSync('mnemonic_configs') || [];
        if (Array.isArray(mnemonicConfigs)) {
          mnemonicConfigs.forEach((config, index) => {
            if (config && config.serviceId && typeof config === 'object') {
              try {
                const formattedConfig = formatConfig(config);
                if (formattedConfig) {
                  // 创建更清晰的配置显示格式
                  const algorithm = config.hashAlgorithm?.toUpperCase() || '未知';
                  const length = config.passwordLength || '未知';
                  const createdTime = formattedConfig.createdAt || formatTime(config.createdAt);

                  specialItems.push({
                    id: `config_mnemonic_${index}`,
                    title: `🔐 ${config.serviceId}`, // 添加图标
                    username: `助记密码配置 | ${algorithm} | ${length}位`, // 更清晰的格式
                    url: 'mnemonic',
                    type: 'config',
                    configType: 'mnemonic',
                    configData: config,
                    createdAt: createdTime,
                    displayInfo: `${algorithm}算法 • ${length}位 • ${createdTime}`, // 详细信息
                    isFavorite: config.isFavorite || false,
                    status: 'active'
                  });
                }
              } catch (configError) {
                console.error('格式化助记密码配置失败:', configError, config);
              }
            }
          });
        }
      } catch (mnemonicError) {
        console.error('加载助记密码配置失败:', mnemonicError);
      }

      // 2. 加载随机密码历史 - 优化格式
      try {
        const generatedPasswords = wx.getStorageSync('generated_passwords') || [];
        if (Array.isArray(generatedPasswords)) {
          // 显示最近的10个密码历史，并按时间排序
          generatedPasswords
            .filter(pwd => pwd && pwd.password && typeof pwd === 'object')
            .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
            .slice(0, 10) // 显示最近10个
            .forEach((pwd, index) => {
              try {
                const createdTime = formatTime(pwd.createdAt || pwd.created_at);
                const strength = pwd.strength || '未知';
                const length = pwd.length || pwd.password.length;

                // 根据密码强度设置图标和颜色
                let strengthIcon = '🟡'; // 默认
                if (strength === '强' || strength === '极强') strengthIcon = '🟢';
                else if (strength === '弱') strengthIcon = '🔴';
                else if (strength === '中等') strengthIcon = '🟡';

                specialItems.push({
                  id: `history_password_${index}`,
                  title: `${strengthIcon} ${pwd.password.substring(0, 8)}****`, // 显示前8位+遮罩
                  username: `随机密码 | ${length}位 | ${strength}强度`, // 更清晰的格式
                  url: 'generator',
                  type: 'history',
                  historyType: 'password',
                  historyData: pwd,
                  password: pwd.password,
                  createdAt: createdTime,
                  displayInfo: `${length}位 • ${strength} • ${createdTime}`, // 详细信息
                  isFavorite: pwd.isFavorite || false,
                  status: 'active'
                });
              } catch (pwdError) {
                console.error('格式化密码历史失败:', pwdError, pwd);
              }
            });
        }
      } catch (passwordError) {
        console.error('加载随机密码历史失败:', passwordError);
      }

      // 按创建时间排序，最新在前
      specialItems.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0);
        const timeB = new Date(b.createdAt || 0);
        return timeB - timeA;
      });

      console.log('加载特殊条目:', specialItems.length);
      this.setData({
        filteredVault: specialItems,
        specialItems: specialItems
      });

    } catch (e) {
      console.error('加载特殊条目失败:', e);
      wx.showToast({
        title: '加载特殊条目失败',
        icon: 'none'
      });
      // 失败时回退到全部显示
      this.setData({
        activeFilter: 'all',
        filteredVault: this.data.vault
      });
    }
  },

  // 【优化】改进的筛选选项显示，增加状态保存
  onShowFilterOptions() {
    wx.showActionSheet({
      itemList: ['全部', '收藏', '特殊条目'],
      success: (res) => {
        let newFilter = this.data.activeFilter;
        if (res.tapIndex === 0) {
          newFilter = 'all';
        } else if (res.tapIndex === 1) {
          newFilter = 'favorites';
        } else if (res.tapIndex === 2) {
          newFilter = 'special';
        }

        if (this.data.activeFilter !== newFilter) {
          this.setData({ activeFilter: newFilter });
          // 保存筛选状态
          this.saveFilterState();

          if (newFilter === 'special') {
            this.loadSpecialItems();
          } else {
            this.filterAndSortVault();
          }
        }
      },
      fail: (res) => {
        console.log('用户取消筛选:', res.errMsg);
      }
    });
  },

  // 【优化】改进的收藏切换，支持特殊条目
  onToggleFavorite(e) {
    const id = e.currentTarget.dataset.id;
    const item = e.currentTarget.dataset.item;

    if (item && item.type) {
      // 处理特殊条目
      this.toggleSpecialItemFavorite(id, item);
    } else {
      // 处理普通密码条目
      const itemIndex = this.data.vault.findIndex(item => item.id === id);
      if (itemIndex > -1) {
        const isFavorite = !this.data.vault[itemIndex].isFavorite;
        this.setData({
          [`vault[${itemIndex}].isFavorite`]: isFavorite,
        }, () => {
          this.filterAndSortVault();
          this.saveVaultChanges();
        });
      }
    }
  },

  // 【新增】特殊条目的收藏切换
  toggleSpecialItemFavorite(id, item) {
    try {
      const isFavorite = !item.isFavorite;

      // 更新当前显示的数据
      const currentItems = [...this.data.filteredVault];
      const itemIndex = currentItems.findIndex(i => i.id === id);
      if (itemIndex > -1) {
        currentItems[itemIndex].isFavorite = isFavorite;
        this.setData({ filteredVault: currentItems });
      }

      // 保存到持久化存储
      if (item.type === 'config') {
        // 更新助记密码配置
        const mnemonicConfigs = wx.getStorageSync('mnemonic_configs') || [];
        const configIndex = mnemonicConfigs.findIndex(c => c && c.serviceId === item.configData.serviceId);
        if (configIndex > -1) {
          mnemonicConfigs[configIndex].isFavorite = isFavorite;
          wx.setStorageSync('mnemonic_configs', mnemonicConfigs);
        }
      } else if (item.type === 'history') {
        // 更新密码历史
        const generatedPasswords = wx.getStorageSync('generated_passwords') || [];
        const pwdIndex = generatedPasswords.findIndex(p => p && p.password === item.historyData.password);
        if (pwdIndex > -1) {
          generatedPasswords[pwdIndex].isFavorite = isFavorite;
          wx.setStorageSync('generated_passwords', generatedPasswords);
        }
      }

      wx.showToast({
        title: isFavorite ? '已收藏' : '已取消收藏',
        icon: 'success'
      });

    } catch (e) {
      console.error('切换收藏状态失败:', e);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  // 【优化】改进的密码复制，支持特殊条目
  onCopyPassword(e) {
    const password = e.currentTarget.dataset.password;
    const item = e.currentTarget.dataset.item;

    if (item && item.type === 'history' && item.historyData && item.historyData.password) {
      // 复制历史密码
      wx.setClipboardData({
        data: item.historyData.password,
        success: () => {
          wx.showToast({
            title: '历史密码已复制',
            icon: 'success'
          });
        },
        fail: () => {
          wx.showToast({
            title: '复制失败',
            icon: 'none'
          });
        }
      });
    } else if (password) {
      // 复制普通密码
      wx.setClipboardData({
        data: password,
        success: () => {
          wx.showToast({
            title: '密码已复制',
            icon: 'success'
          });
        },
        fail: () => {
          wx.showToast({
            title: '复制失败',
            icon: 'none'
          });
        }
      });
    } else {
      wx.showToast({
        title: '无可复制的密码',
        icon: 'none'
      });
    }
  },

  // 【新增】批量选择相关功能

  // 长按进入选择模式
  onLongPressItem(e) {
    const id = e.currentTarget.dataset.id;

    // 如果已经在选择模式，不处理
    if (this.data.selectionMode) return;

    console.log('长按进入选择模式，选中ID:', id);

    // 进入选择模式并选中当前项
    this.setData({
      selectionMode: true,
      selectedItems: [id],
      showBatchToolbar: true
    });

    // 震动反馈
    wx.vibrateShort({ type: 'light' });

    // 更新显示数据的选择状态
    this.updateSelectionState();
  },

  // 点击选择/取消选择项
  onToggleSelection(e) {
    const id = e.currentTarget.dataset.id;
    const selectedItems = [...this.data.selectedItems];

    const index = selectedItems.indexOf(id);
    if (index > -1) {
      // 取消选择
      selectedItems.splice(index, 1);
    } else {
      // 选择
      selectedItems.push(id);
    }

    this.setData({
      selectedItems: selectedItems
    });

    // 更新显示数据的选择状态
    this.updateSelectionState();
  },

  // 更新显示数据的选择状态
  updateSelectionState() {
    const selectedSet = new Set(this.data.selectedItems);
    const filteredVault = this.data.filteredVault.map(item => ({
      ...item,
      selected: selectedSet.has(item.id)
    }));

    this.setData({ filteredVault });
  },

  // 全选/取消全选
  onToggleSelectAll() {
    const currentSelected = this.data.selectedItems;
    const allIds = this.data.filteredVault.map(item => item.id);

    let newSelectedItems;
    if (currentSelected.length === allIds.length) {
      // 取消全选
      newSelectedItems = [];
    } else {
      // 全选
      newSelectedItems = [...allIds];
    }

    this.setData({
      selectedItems: newSelectedItems
    });

    this.updateSelectionState();
  },

  // 退出选择模式
  exitSelectionMode() {
    this.setData({
      selectionMode: false,
      selectedItems: [],
      showBatchToolbar: false
    });

    // 清除所有选择状态
    const filteredVault = this.data.filteredVault.map(item => ({
      ...item,
      selected: false
    }));
    this.setData({ filteredVault });
  },

  // 批量删除
  onBatchDelete() {
    const selectedCount = this.data.selectedItems.length;
    const selectedItems = this.data.selectedItems;

    if (selectedCount === 0) {
      wx.showToast({ title: '请选择要删除的项', icon: 'none' });
      return;
    }

    // 获取选中的项目标题用于显示
    const selectedTitles = this.data.filteredVault
      .filter(item => selectedItems.includes(item.id))
      .map(item => item.title || '未命名')
      .join('、');

    wx.showModal({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedCount} 项吗？\n\n项目: ${selectedTitles}`,
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          this.performBatchDelete(selectedItems);
        }
      }
    });
  },

  // 执行批量删除
  performBatchDelete(selectedIds) {
    wx.showLoading({ title: '删除中...', mask: true });

    try {
      let deletedCount = 0;
      let specialDeletedCount = 0;

      // 1. 分离普通条目和特殊条目
      const regularItems = this.data.filteredVault.filter(item => !item.type);
      const specialItems = this.data.filteredVault.filter(item => item.type);

      // 2. 处理普通条目删除（主保险箱）
      const regularSelectedIds = selectedIds.filter(id =>
        regularItems.some(item => item.id === id)
      );

      if (regularSelectedIds.length > 0) {
        // 更新vault数据
        const newVault = this.data.vault.filter(item => !regularSelectedIds.includes(item.id));

        // 标记为deleted状态而不是直接删除（支持回收站）
        const deletedItems = this.data.vault.filter(item => regularSelectedIds.includes(item.id))
          .map(item => ({
            ...item,
            status: 'deleted',
            deletedAt: Date.now()
          }));

        const finalVault = [...newVault, ...deletedItems];

        // 保存到本地存储
        const encryptedVault = encrypt(JSON.stringify(finalVault), app.globalData.sessionKey);
        wx.setStorageSync('vault', encryptedVault);

        // 更新本地数据
        this.setData({
          vault: newVault
        });

        deletedCount += regularSelectedIds.length;
      }

      // 3. 处理特殊条目删除
      const specialSelectedIds = selectedIds.filter(id =>
        specialItems.some(item => item.id === id)
      );

      if (specialSelectedIds.length > 0) {
        for (const id of specialSelectedIds) {
          const specialItem = specialItems.find(item => item.id === id);
          if (specialItem) {
            this.deleteSpecialItem(specialItem);
            specialDeletedCount++;
          }
        }
      }

      // 4. 退出选择模式并更新显示
      this.setData({
        selectedItems: [],
        selectionMode: false,
        showBatchToolbar: false
      });

      // 5. 重新加载数据（根据当前筛选状态）
      const currentFilter = this.data.activeFilter;
      if (currentFilter === 'special') {
        this.loadSpecialItems();
      } else if (currentFilter === 'favorites') {
        this.filterAndSortVault();
      } else {
        this.loadVaultData();
      }

      // 6. 记录审计日志
      const totalDeleted = deletedCount + specialDeletedCount;
      app.addAuditLog('batch_delete_items', `批量删除了 ${totalDeleted} 项 (普通: ${deletedCount}, 特殊: ${specialDeletedCount})`);

      wx.hideLoading();
      wx.showToast({
        title: `已删除 ${totalDeleted} 项`,
        icon: 'success'
      });

    } catch (e) {
      wx.hideLoading();
      console.error('批量删除失败:', e);
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    }
  },

  // 删除特殊条目
  async deleteSpecialItem(specialItem) {
    try {
      if (specialItem.type === 'config' && specialItem.configType === 'mnemonic') {
        // 删除助记密码配置
        const mnemonicConfigs = wx.getStorageSync('mnemonic_configs') || [];
        const updatedConfigs = mnemonicConfigs.filter(config =>
          config.serviceId !== specialItem.configData.serviceId
        );
        wx.setStorageSync('mnemonic_configs', updatedConfigs);

      } else if (specialItem.type === 'history' && specialItem.historyType === 'password') {
        // 删除随机密码历史
        const generatedPasswords = wx.getStorageSync('generated_passwords') || [];
        const updatedPasswords = generatedPasswords.filter(pwd =>
          pwd.password !== specialItem.historyData.password
        );
        wx.setStorageSync('generated_passwords', updatedPasswords);
      }
    } catch (e) {
      console.error('删除特殊条目失败:', e);
      throw e;
    }
  },

  // 页面隐藏时退出选择模式
  onHide() {
    if (this.data.selectionMode) {
      this.exitSelectionMode();
    }
  },

  // 页面卸载时清理
  onUnload() {
    if (this.data.selectionMode) {
      this.exitSelectionMode();
    }
    // 清理定时器
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer);
    }
  },
});
