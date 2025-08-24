// 时间格式化工具函数
const formatHelper = {
  /**
   * 格式化时间为 YY.M.D.H.mm 格式
   * @param {string|Date} dateString - 日期字符串或Date对象
   * @returns {string} 格式化后的时间字符串，如：25.8.23.15.36
   */
  formatTime(dateString) {
    try {
      const date = dateString instanceof Date ? dateString : new Date(dateString);

      if (isNaN(date.getTime())) {
        console.warn('Invalid date:', dateString);
        return '未知时间';
      }

      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return `${year - 2000}.${month}.${day}.${hours.toString().padStart(2, '0')}.${minutes}`;
    } catch (e) {
      console.error('Time formatting error:', e);
      return '格式错误';
    }
  },

  /**
   * 格式化时间为更详细的显示格式
   * @param {string|Date} dateString - 日期字符串或Date对象
   * @returns {string} 格式化后的时间字符串，如：2025-08-23 15:36
   */
  formatDetailedTime(dateString) {
    try {
      const date = dateString instanceof Date ? dateString : new Date(dateString);

      if (isNaN(date.getTime())) {
        return '未知时间';
      }

      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (e) {
      console.error('Detailed time formatting error:', e);
      return '格式错误';
    }
  },

  /**
   * 获取相对时间描述
   * @param {string|Date} dateString - 日期字符串或Date对象
   * @returns {string} 相对时间描述，如：刚刚、5分钟前、1小时前等
   */
  getRelativeTime(dateString) {
    try {
      const date = dateString instanceof Date ? dateString : new Date(dateString);
      const now = new Date();
      const diff = now - date;

      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;

      return this.formatTime(date);
    } catch (e) {
      return '未知时间';
    }
  },

  /**
   * 验证并格式化配置数据
   * @param {Object} config - 配置对象
   * @returns {Object} 格式化后的配置对象
   */
  formatConfig(config) {
    if (!config || typeof config !== 'object') {
      return null;
    }

    return {
      ...config,
      createdAt: this.formatTime(config.createdAt || config.created_at),
      updatedAt: config.updatedAt || config.updated_at ? this.formatTime(config.updatedAt || config.updated_at) : undefined,
      formattedCreatedAt: this.formatDetailedTime(config.createdAt || config.created_at),
      formattedUpdatedAt: config.updatedAt || config.updated_at ? this.formatDetailedTime(config.updatedAt || config.updated_at) : undefined
    };
  },

  /**
   * 验证并格式化密码历史数据
   * @param {Array} history - 密码历史数组
   * @returns {Array} 格式化后的密码历史数组
   */
  formatPasswordHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }

    return history.map(item => ({
      ...item,
      formattedDate: this.formatTime(item.date || item.createdAt),
      detailedDate: this.formatDetailedTime(item.date || item.createdAt),
      relativeTime: this.getRelativeTime(item.date || item.createdAt)
    }));
  }
};

module.exports = formatHelper;
