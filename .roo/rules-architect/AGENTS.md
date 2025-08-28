# Project Architecture Rules (Non-Obvious Only)

## Security Architecture Constraints
- **Single Master Password**: All data protected by one password - architectural decision affects all data flow design
- **Session-Based Access**: Every operation requires valid session key - forces unlock page as single entry point
- **Encrypted Audit Trail**: All operations logged encrypted - architectural requirement for compliance

## State Management Architecture
- **Global Selection State Manager**: Prevents cross-page UI conflicts - architectural pattern for maintaining consistency
- **Operation-Specific Refresh Flags**: Timestamp-based system prevents unnecessary reloads while ensuring UI consistency
- **Biometric State Complexity**: Multiple interlocking flags prevent duplicate prompts - requires careful state orchestration

## Data Architecture Patterns
- **Custom Encryption Format**: IV::Cipher format instead of standard patterns - architectural decision for Mini Program compatibility
- **Corruption Recovery System**: Built-in detection and recovery mechanisms - architectural resilience pattern
- **Special Items Integration**: Configuration and history items treated as first-class data alongside passwords

## Component Interaction Architecture
- **Cross-Page State Coordination**: Complex coordination between unlock page and main pages for biometric flow
- **Navigation Guards**: Automatic redirects to unlock page on app launch/background resume
- **Batch Operation Architecture**: Long press triggers selection mode with different handling for different item types

## Storage Architecture Decisions
- **WeChat Storage API**: Uses synchronous storage API with encrypted data persistence
- **Device-Specific Biometric Salts**: Per-device salts with fixed KDF tags for biometric credential security
- **Versioned Export Format**: Custom export format with dataType validation for compatibility

## Error Handling Architecture
- **Structured Error Responses**: Crypto operations return structured objects instead of exceptions - consistent error handling pattern
- **Graceful Degradation**: Biometric fallback to password, data corruption recovery to empty vault
- **Automatic State Cleanup**: Page lifecycle management prevents state leaks and UI inconsistencies

## Performance Architecture Considerations
- **300ms Search Debounce**: Prevents excessive filtering operations - architectural performance optimization
- **Smart Data Loading**: Conditional loading based on timestamps and user actions - prevents unnecessary work
- **UI State Optimization**: Immediate UI updates with background data synchronization

## Platform-Specific Architectural Decisions
- **WeChat Mini Program Constraints**: Vanilla JavaScript with WeChat APIs - no modern framework dependencies
- **Biometric API Integration**: Complex state management around WeChat biometric APIs with timeout handling
- **Storage Limitations**: Encrypted data storage with size and performance considerations