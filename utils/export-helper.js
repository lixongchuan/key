// 文件路径: utils/export-helper.js
const { encrypt, deriveKey } = require('./crypto-helper.js');

/**
 * 导出选中的凭证数据。
 * 将凭证数组用临时密码加密，并封装成统一的导出格式。
 * @param {Array} items - 要导出的凭证对象数组。
 * @param {string} tempPassword - 用于加密的临时密码。
 * @returns {string} - 加密并格式化后的JSON字符串。
 */
function exportItems(items, tempPassword) {
  if (!items || items.length === 0 || !tempPassword) {
    throw new Error("凭证和密码不能为空");
  }
  try {
    const itemsJson = JSON.stringify(items); // 将凭证数组JSON化
    const salt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const tempKey = deriveKey(tempPassword, salt);
    const dataToExport = {
      dataType: 'codesafe_vault_export', // 验明正身，确保是我们的文件
      version: '1.0',                   // 版本号，便于未来升级
      salt: salt,                       // 用于临时密码的盐
      encryptedData: encrypt(itemsJson, tempKey), // 加密的核心内容
    };
    return JSON.stringify(dataToExport);
  } catch (e) {
    console.error("导出凭证失败:", e);
    throw new Error("导出凭证失败");
  }
}

/**
 * 统一导出结构与容错校验工具
 * 结构：
 * {
 *   version: "1.0.0",
 *   dataType: "vault",
 *   salt: "<base64>",
 *   iv: "<base64>",
 *   encryptedData: "<base64>",
 *   createdAt: "<ISO8601>"
 * }
 */
const VERSION = '1.0.0';
const DATA_TYPE = 'vault';

function isBase64(str) {
  if (typeof str !== 'string') return false;
  // 允许末尾有 = 填充，且只包含标准 Base64 字符
  return /^[A-Za-z0-9+/]+={0,2}$/.test(str);
}

function buildExportPayload({ salt, iv, encryptedData }) {
  return {
    version: VERSION,
    dataType: DATA_TYPE,
    salt,
    iv,
    encryptedData,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 生成导出 JSON 字符串（统一结构 + 基础校验）
 * 入参均需为 Base64 字符串
 */
function makeExportJson({ salt, iv, encryptedData }) {
  // 允许 iv 为空字符串，但字段必须存在；salt/encryptedData 必须为非空 Base64
  if (typeof salt !== 'string' || typeof iv !== 'string' || typeof encryptedData !== 'string') {
    throw new Error('导出失败：salt/iv/密文缺失');
  }
  if (!isBase64(salt)) {
    throw new Error('导出失败：salt 格式错误（需为Base64）');
  }
  // 密文格式是 IV::Cipher, 不再校验 Base64
  if (typeof encryptedData !== 'string' || encryptedData.indexOf('::') === -1) {
    throw new Error('导出失败：密文格式错误');
  }
  // iv 可为空字符串（当前加密流程未使用 IV），如果非空则必须是 Base64
  if (iv !== '' && !isBase64(iv)) {
    throw new Error('导出失败：iv 格式错误（需为Base64或空字符串）');
  }
  const payload = buildExportPayload({ salt, iv, encryptedData });
  return JSON.stringify(payload, null, 2);
}

/**
 * 解析并校验导入的 JSON 字符串
 * 返回 { valid: boolean, error?: string, data?: payload }
 */
function parseAndValidateImport(jsonText) {
  if (!jsonText || typeof jsonText !== 'string') {
    return { valid: false, error: '文件内容为空或类型错误' };
  }
  let obj = null;
  try {
    obj = JSON.parse(jsonText);
  } catch (e) {
    return { valid: false, error: 'JSON 解析失败，文件格式不正确' };
  }

  // 必填字段与类型
  const fields = ['version', 'dataType', 'salt', 'iv', 'encryptedData', 'createdAt'];
  for (const f of fields) {
    if (!(f in obj)) return { valid: false, error: `缺少必要字段：${f}` };
    if (typeof obj[f] !== 'string') return { valid: false, error: `字段类型错误：${f} 必须为字符串` };
  }
  // 值域校验
  if (obj.dataType !== DATA_TYPE) {
    return { valid: false, error: `dataType 非法，应为 ${DATA_TYPE}` };
  }
  if (!isBase64(obj.salt) || (obj.iv !== '' && !isBase64(obj.iv))) {
    return { valid: false, error: 'salt/iv 格式错误（需为Base64）' };
  }
  // 密文格式是 IV::Cipher, 不再校验 Base64
  if (typeof obj.encryptedData !== 'string' || obj.encryptedData.indexOf('::') < 0) {
    return { valid: false, error: '密文格式不正确' };
  }
  if (!obj.version) {
    return { valid: false, error: '版本号缺失' };
  }

  return { valid: true, data: obj };
}

module.exports = {
  VERSION,
  DATA_TYPE,
  makeExportJson,
  parseAndValidateImport,
  isBase64,
  buildExportPayload,
  exportItems, // 导出原有的导出函数
};
