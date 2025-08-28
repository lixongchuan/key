# Project Debug Rules (Non-Obvious Only)

## Biometric Debugging
- **State Complexity**: Biometric unlock uses complex state management across pages - trace `biometricCompleted`, `isAutoTriedBio`, `pageReady`
- **Timeout Issues**: 15-second timeouts for biometric operations - check `biometricTimeout` and `_biometricRenderTimer`
- **Credential Validation**: Biometric credentials stored as `bio_unlock_${openid}` - validate with device salt `bio_device_salt`
- **KDF Tag**: Fixed KDF tag `'bio.unlock.fixed.tag.v1'` must match exactly for credential decryption

## State Management Debugging
- **Global Selection States**: Blue border issues caused by uncleaned selection states - check all pages for `selectionMode`, `selectedItems`
- **Refresh Flags**: Debug refresh issues by tracing `app.globalData.needsRefresh.index.{add,edit,delete,viewOnly}.needed`
- **Session Key**: Always verify `app.globalData.sessionKey` exists before crypto operations

## Data Corruption Debugging
- **UTF-8 Pattern**: Look for `Malformed UTF-8 data` in error messages indicating data corruption
- **Recovery Flow**: Test corruption recovery by checking `vault_meta` and `vault` storage integrity
- **Legacy Compatibility**: Test both old and new encryption formats when debugging decryption failures

## UI State Debugging
- **Search Debounce**: 300ms debounce may cause delayed search results - check search timer state
- **Batch Operations**: Long press detection may conflict with scroll gestures - verify touch event handling
- **Card Size Mode**: Check `home_card_size_mode` storage for layout issues

## Storage Debugging
- **Audit Logs**: All operations logged encrypted in `audit_log` - decrypt with session key to trace user actions
- **Special Items**: Debug special filter by checking `mnemonic_configs` and `generated_passwords` storage
- **Export Format**: Validate exports with `dataType: 'codesafe_vault_export'` and Base64 format checking

## Error Pattern Recognition
- **INVALID_FORMAT**: Transit message format error - check `randomString::encryptedData` format
- **DECRYPTION_FAILED**: Wrong key or corrupted data - verify session key and data integrity
- **DECRYPTION_ERROR**: General decryption failure - check error details in structured response