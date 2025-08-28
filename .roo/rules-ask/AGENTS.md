# Project Documentation Rules (Non-Obvious Only)

## Architecture Context
- **WeChat Mini Program**: Built with vanilla JavaScript and WeChat APIs - no React/Vue frameworks despite similar patterns
- **Three Main Tabs**: Password Vault (`pages/index`), Tools (`pages/tools`), Settings (`pages/settings`)
- **Encryption First**: All data encrypted with custom AES format - understand IV::Cipher pattern before explaining features

## Security Model Explanation
- **Master Password**: Single password protects all data - explain PBKDF2 derivation with salt/verifier system
- **Biometric Unlock**: Device-specific encrypted credentials using fixed KDF tag `'bio.unlock.fixed.tag.v1'`
- **Session-Based**: All operations require valid session key - explain unlock flow and automatic redirects

## State Management Patterns
- **Global Selection Manager**: Prevents UI conflicts across pages - explain why `clearAllSelectionStates()` is called before navigation
- **Smart Refresh System**: Operation-specific timestamps prevent unnecessary reloads while ensuring consistency
- **Biometric State Complexity**: Multiple flags prevent duplicate prompts - explain `biometricCompleted`, `isAutoTriedBio`, `pageReady`

## Special Features Context
- **Special Filter**: Shows configuration items (`mnemonic_configs`) and password history (`generated_passwords`) alongside regular passwords
- **Batch Operations**: Long press enters selection mode - different handling for regular vs special items
- **Export/Import**: Custom format with `dataType: 'codesafe_vault_export'` validation and version checking

## Data Flow Understanding
- **Unlock Flow**: App redirects to unlock page on launch/background resume with complex biometric conditions
- **Data Corruption Recovery**: Automatic detection and recovery mechanisms for encrypted data corruption
- **Audit Logging**: All operations logged encrypted for security compliance

## Storage Architecture
- **WeChat Storage API**: Uses wx.setStorageSync/wx.getStorageSync for persistent encrypted data
- **Session Management**: Current session key stored separately for convenience but validated against master password
- **Biometric Credentials**: Per-user encrypted credentials using device-specific salts

## Error Handling Patterns
- **Structured Crypto Errors**: All crypto operations return `{success, data, error, message}` objects instead of throwing
- **Recovery Mechanisms**: Data corruption detection with automatic fallback to empty vault initialization
- **Biometric Fallback**: Complex fallback logic when biometric credentials expire or become invalid