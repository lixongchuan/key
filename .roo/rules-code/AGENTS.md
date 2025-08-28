# Project Coding Rules (Non-Obvious Only)

## Encryption & Security
- **Custom AES Format**: Always use `utils/crypto-helper.js` encrypt/decrypt functions instead of direct crypto-js calls
- **IV::Cipher Format**: Encrypted data uses `randomString::encryptedData` format - never use standard crypto-js patterns
- **Error Handling**: Crypto operations return structured objects `{success, data, error, message}` instead of throwing exceptions
- **Legacy Compatibility**: Use `decryptLegacy()` for old format data, `decrypt()` for new format

## State Management
- **Global Selection Manager**: Call `app.selectionStateManager.clearAllSelectionStates()` before any navigation to prevent blue border UI issues
- **Refresh Flags**: Always reset `app.globalData.needsRefresh.index[operation].needed = false` after processing
- **Biometric State**: Never trigger biometric prompts on non-unlock pages - complex conditions prevent this

## Data Validation
- **Base64 Validation**: Use custom `isBase64()` function for all encrypted component validation
- **Export Format**: Custom export includes `dataType: 'codesafe_vault_export'` for validation
- **Data Corruption**: Check for `Malformed UTF-8 data` patterns to detect corruption
- **JSON Parsing**: Always wrap JSON.parse in try-catch with corruption recovery options

## Storage Patterns
- **Audit Logging**: All operations must be logged encrypted using `app.addAuditLog(action, details)`
- **Session Key**: Always validate `app.globalData.sessionKey` exists before crypto operations
- **Device Salt**: Biometric operations use device-specific salts with fixed KDF tag `'bio.unlock.fixed.tag.v1'`

## UI Patterns
- **Debouncing**: Search operations use 300ms debounce to prevent excessive filtering
- **Long Press**: Enters selection mode for batch operations
- **Card Size**: Support 'normal'/'compact' modes stored in `home_card_size_mode`
- **Toast Feedback**: Always provide user feedback for mode changes and operations

## Special Item Handling
- **Config Items**: Mnemonic configs from `mnemonic_configs` storage support favorites and batch operations
- **History Items**: Password generation history from `generated_passwords` storage
- **Different Behavior**: Special items handled differently from regular vault items in batch operations