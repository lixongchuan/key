# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview
This is a WeChat Mini Program password manager with biometric authentication, built using vanilla JavaScript and WeChat Mini Program APIs.

## Critical Non-Obvious Patterns

### 1. Custom AES Encryption Format
- Uses custom IV::Cipher format instead of standard crypto-js patterns
- Encrypted data format: `randomString::encryptedData` where randomString is the IV
- Always use `utils/crypto-helper.js` functions instead of direct crypto-js calls
- Custom random string generation for IV to ensure Mini Program compatibility

### 2. Global Selection State Manager
- Global `app.selectionStateManager` prevents UI issues (blue borders) across pages
- Must call `clearAllSelectionStates()` before any navigation that could cause selection state conflicts
- Selection states are automatically cleaned up on page hide/unload

### 3. Smart Refresh System
- Uses operation-specific timestamps: `needsRefresh.index.{add,edit,delete,viewOnly}`
- Prevents unnecessary data reloads while ensuring UI consistency
- Always reset refresh flags after processing: `app.globalData.needsRefresh.index[operation].needed = false`

### 4. Biometric Authentication
- Device-specific salts with fixed KDF tag: `'bio.unlock.fixed.tag.v1'`
- Complex state management prevents duplicate biometric prompts
- 15-second timeouts for biometric operations
- Silent biometric enable after password unlock (no user verification required)
- Biometric credentials stored as encrypted session keys per WeChat openid

### 5. Data Corruption Recovery
- Automatic detection of corrupted encrypted data (especially during password changes)
- Recovery options: reset vault or attempt data repair
- Data validation checks for `Malformed UTF-8 data` patterns
- Graceful fallback to empty vault initialization

### 6. Special Items System
- "Special" filter shows configuration items and password history (not just passwords)
- Configuration items: mnemonic password configs from `mnemonic_configs` storage
- History items: generated passwords from `generated_passwords` storage
- Both types support favorites and batch operations

### 7. Encrypted Audit Logging
- All operations logged with encryption using session key
- Logs stored as encrypted JSON in `audit_log` storage
- Format: `{timestamp: ISO, action: string, details: string}[]`
- Automatic audit log for: batch_delete, vault_reset, enable_biometrics

### 8. Custom Export Format
- Export format includes `dataType: 'codesafe_vault_export'` for validation
- Versioned format with salt, IV, and encrypted data
- Base64 validation for all encrypted components
- Custom `isBase64()` and `parseAndValidateImport()` functions required

### 9. Search Implementation
- 300ms debounce prevents excessive filtering operations
- Searches across: title, username, url, tags
- Applied before other filters (favorites, special)

### 10. Card Size Preferences
- User preference stored as `home_card_size_mode`: 'normal' or 'compact'
- Automatically restored on page load
- Toast feedback on mode changes

### 11. Batch Operations
- Long press enters selection mode
- Global selection state prevents UI conflicts
- Supports batch delete with confirmation modal
- Special items (configs/history) handled differently from regular vault items

### 12. Navigation Flow
- App always redirects to unlock page on launch/background resume
- Complex conditions prevent biometric prompts on non-unlock pages
- Page lifecycle management critical for biometric state cleanup

## Storage Keys Used
- `vault`: Encrypted main password data
- `vault_meta`: Salt and verifier for password validation
- `biometrics_enabled`: Boolean flag
- `bio_unlock_${openid}`: Encrypted biometric credentials per user
- `bio_device_salt`: Device-specific salt for biometric operations
- `mnemonic_configs`: Mnemonic password generator configurations
- `generated_passwords`: Password generation history
- `audit_log`: Encrypted operation audit trail
- `current_session_key`: Current session encryption key
- `home_active_filter`: Last used filter preference
- `home_card_size_mode`: Card display preference
- `custom_avatar`: User avatar preference
- `wx_user_profile`: WeChat user profile data

## Error Patterns to Handle
- `INVALID_FORMAT`: Transit message format error
- `DECRYPTION_FAILED`: Wrong key or corrupted data
- `DECRYPTION_ERROR`: General decryption failure
- `Malformed UTF-8 data`: Data corruption indicator