// 文件路径: utils/crypto-helper.js
// 这是针对小程序环境的【终极究极解决方案】版本

const CryptoJS = require('./crypto-js.js');

const PBKDF2_ITERATIONS = 10000;

// [终极解决方案] 1. 新增一个在小程序环境中绝对可靠的随机字符串生成器
/**
 * 生成一个指定长度的随机字符串，用于IV
 * @param {number} length - 需要的字符串长度
 * @returns {string} - 生成的随机字符串
 */
function generateRandomString(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

/**
 * 派生密钥函数 (***已更新为终极解决方案***)
 * @param {string} masterPassword - 用户输入的主密码
 * @param {string} saltBase64 - Base64编码的盐
 * @returns {string} - 派生出的密钥（Hex格式）
 */
function deriveKey(masterPassword, saltBase64) {
  // [终极解决方案] 4. 盐（salt）必须从Base64正确解析，而不是依赖不稳定的字符串转换
  const salt = CryptoJS.enc.Base64.parse(saltBase64);

  const key = CryptoJS.PBKDF2(masterPassword, salt, {
    keySize: 256 / 32,
    iterations: PBKDF2_ITERATIONS
  });
  return key.toString(CryptoJS.enc.Hex);
}

/**
 * 加密数据 (***已更新为终极解决方案***)
 */
function encrypt(data, key) {
  // [终极解决方案] 2. 使用我们自己的随机生成器创建IV，不再依赖crypto-js
  const randomString = generateRandomString(16); // IV需要16字节
  const iv = CryptoJS.enc.Utf8.parse(randomString);

  const parsedKey = CryptoJS.enc.Hex.parse(key);
  const encrypted = CryptoJS.AES.encrypt(data, parsedKey, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  // 拼接IV和密文。我们将原始的随机字符串（而不是WordArray对象）存起来。
  const transitmessage = randomString + "::" + encrypted.toString();
  return transitmessage;
}

/**
 * 解密数据 (***已更新为终极解决方案***)
 */
function decrypt(transitmessage, key) {
  if (!transitmessage || transitmessage.indexOf("::") === -1) {
    console.error("解密失败：传入的数据格式不正确。");
    return { success: false, error: "INVALID_FORMAT", message: "数据格式不正确" };
  }

  try {
    // [终极解决方案] 3. 使用同样的方式分离出我们的随机字符串作为IV
    const parts = transitmessage.split("::");
    const ivString = parts[0];
    const ciphertext = parts[1];

    const iv = CryptoJS.enc.Utf8.parse(ivString);
    const parsedKey = CryptoJS.enc.Hex.parse(key);

    const decrypted = CryptoJS.AES.decrypt(ciphertext, parsedKey, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const originalText = decrypted.toString(CryptoJS.enc.Utf8);
    if (!originalText) {
      console.error("解密失败：可能密钥错误或数据已损坏。");
      return { success: false, error: "DECRYPTION_FAILED", message: "密钥错误或数据已损坏" };
    }

    // 尝试验证解密后的数据是否为有效JSON（如果期望是JSON）
    try {
      JSON.parse(originalText);
      return { success: true, data: originalText };
    } catch (jsonError) {
      // 如果不是JSON，直接返回原文
      return { success: true, data: originalText };
    }

  } catch (e) {
    console.error("解密过程中发生严重错误:", e);
    return { success: false, error: "DECRYPTION_ERROR", message: `解密错误: ${e.message}` };
  }
}

/**
 * 兼容旧版本的解密函数 - 返回原始字符串或null
 */
function decryptLegacy(transitmessage, key) {
  const result = decrypt(transitmessage, key);
  return result.success ? result.data : null;
}

module.exports = {
  deriveKey,
  encrypt,
  decrypt,
  decryptLegacy
};
