# BlackBolt Operator Swift macOS Security Guide

## Table of Contents
1. [Security Architecture Overview](#security-architecture-overview)
2. [Credential Management](#credential-management)
3. [API Security](#api-security)
4. [Data Encryption](#data-encryption)
5. [Memory Safety](#memory-safety)
6. [Code Security](#code-security)
7. [Sandbox and Permissions](#sandbox-and-permissions)
8. [Incident Response](#incident-response)
9. [Security Checklist](#security-checklist)
10. [Third-Party Dependencies](#third-party-dependencies)

## Security Architecture Overview

### Threat Model

BlackBolt Operator faces the following threat categories:

**Network Threats**:
- Man-in-the-middle (MITM) attacks
- Network eavesdropping
- Request forgery/replay attacks
- Certificate spoofing
- Downgrade attacks

**Local Threats**:
- Unauthorized credential access
- Memory disclosure
- Disk/memory snooping
- Debugger attachment
- Sandbox escape attempts

**Application Threats**:
- Insecure deserialization
- Input validation bypass
- Privilege escalation
- Information disclosure
- Configuration tampering

### Defense Mechanisms

**Defensive Strategy**: Defense-in-Depth with multiple overlapping security controls:

```
External Threat
    ↓
Network Layer (TLS 1.3+, HTTPS-only)
    ↓
Certificate Pinning (MITM prevention)
    ↓
Request Signing (Authentication/Integrity)
    ↓
Input Validation (Prevent injection)
    ↓
Keychain (Secure storage)
    ↓
Memory Safety (Automatic zeroing)
    ↓
Audit & Detection (Startup checks)
```

### Risk Assessment

| Threat | Severity | Mitigation | Status |
|--------|----------|-----------|--------|
| MITM Attack | Critical | TLS 1.3 + Cert Pinning | ✅ Implemented |
| Request Forgery | Critical | HMAC-SHA256 Signing | ✅ Implemented |
| Credential Theft | Critical | Keychain + AES-GCM | ✅ Implemented |
| Code Injection | High | Input validation | ✅ Implemented |
| Memory Disclosure | High | SecureString | ✅ Implemented |
| Debugger Bypass | Medium | Startup detection | ✅ Implemented |
| Info Disclosure | Medium | Secure logging | ✅ Implemented |

## Credential Management

### Keychain Usage and Best Practices

**Access Control Level**:
```swift
// Device unlock required, no biometric fallback
let attributes: [String: Any] = [
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
]
```

This means:
- Credentials only accessible when device is unlocked
- User's device passcode (Touch ID/Face ID not sufficient)
- Credentials locked after screen sleep
- Decrypted only in Secure Enclave

**Keychain Operations**:

```swift
// Store credential
func storeCredential(_ credential: String) throws {
    let data = credential.data(using: .utf8)!
    
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: "operator_key",
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        kSecValueData as String: data,
        kSecAttrCreationDate as String: Date()
    ]
    
    SecItemDelete(query as CFDictionary)
    
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
        throw KeychainError.storeFailed(status)
    }
}

// Retrieve credential
func retrieveCredential() throws -> String {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: "operator_key",
        kSecReturnData as String: kCFBooleanTrue,
        kSecMatchLimit as String: kSecMatchLimitOne
    ]
    
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    
    guard status == errSecSuccess,
          let data = result as? Data,
          let credential = String(data: data, encoding: .utf8) else {
        throw KeychainError.retrieveFailed(status)
    }
    
    return credential
}
```

### Credential Storage Requirements

**Mandatory Storage via Keychain**:
- API keys and tokens
- Operator credentials
- Secrets and passwords
- Encryption keys for sensitive data

**Never Store Plaintext**:
- ❌ UserDefaults (unencrypted)
- ❌ Local files without encryption
- ❌ In-app configuration files
- ❌ Plist files
- ❌ Memory without SecureString

**Encrypted Storage Alternative**:
For non-interactive credentials, use SecureConfigurationStore:
```swift
let store = SecureConfigurationStore()
try await store.store(config)  // AES-GCM encrypted
```

### Credential Rotation Procedures

**Automated Rotation** (90-day expiry):

```swift
// Check at app launch
@MainActor
func validateCredentials() {
    let lastRotation = UserDefaults.standard.object(
        forKey: "lastCredentialRotation"
    ) as? Date ?? Date(timeIntervalSince1970: 0)
    
    let daysSinceRotation = Calendar.current.dateComponents(
        [.day],
        from: lastRotation,
        to: Date()
    ).day ?? 0
    
    if daysSinceRotation >= 90 {
        presentCredentialRotationFlow()
    }
}

// Perform rotation
func rotateCredential(newKey: String) async throws {
    // 1. Validate new key format
    guard newKey.count >= 32 else {
        throw CredentialError.invalidKeyFormat
    }
    
    // 2. Test new key with API
    let testValidator = APIRequestValidator(secretKeyHex: newKey)
    _ = try await testRequest(with: testValidator)
    
    // 3. Update in Keychain
    let keychain = Keychain()
    try await keychain.store(newKey)
    
    // 4. Update configuration
    try await configStore.updateKey(newKey)
    
    // 5. Log rotation
    SecurityAudit.logEvent("credential_rotation", severity: .info)
}
```

### Credential Cleanup on Logout

```swift
@MainActor
func logout() async {
    do {
        // Clear credentials from memory
        store.clearCredentials()
        
        // Clear from Keychain
        let keychain = Keychain()
        try await keychain.clearAll()
        
        // Clear cached authentication state
        runtimeConfig.clearAuthState()
        
        // Clear sensitive memory
        approvals = []
        campaigns = []
        
        // Log logout
        SecurityAudit.logEvent("logout", severity: .info)
        
        // Return to lock screen
        presentOperatorLock()
    } catch {
        // Log error but ensure UI returns to lock
        logError(error)
        presentOperatorLock()
    }
}
```

### Access Control Requirements

**Device-Unlock-Only Access**:
```swift
kSecAttrAccessibleWhenUnlockedThisDeviceOnly
```

**What this prevents**:
- ✅ Access before device is unlocked
- ✅ Access with locked device
- ✅ Access via biometric fallback alone
- ✅ Extraction via forensics (requires device unlock)

**Implementation Verification**:
```swift
// Verify access control during security audit
func verifyKeychainAccessControl() throws {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: "operator_key",
        kSecReturnAttributes as String: kCFBooleanTrue
    ]
    
    var result: AnyObject?
    SecItemCopyMatching(query as CFDictionary, &result)
    
    guard let attributes = result as? [String: Any],
          let accessible = attributes[kSecAttrAccessible as String] as? String else {
        throw SecurityAuditError.keychainAccessControlNotVerified
    }
    
    if accessible != kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String {
        throw SecurityAuditError.keychainAccessControlMismatch
    }
}
```

## API Security

### HMAC-SHA256 Request Signing

**Algorithm**:
```
Signature = HMAC-SHA256(SecretKey, CanonicalRequest)

CanonicalRequest = Method + "\n" +
                   Path + "\n" +
                   Timestamp + "\n" +
                   Nonce + "\n" +
                   BodyHash
                   
BodyHash = SHA256(RequestBody)
```

**Implementation**:
```swift
actor APIRequestValidator {
    let secretKey: [UInt8]
    let nonceCache: NSCache<NSString, NSString>
    
    func signRequest(_ request: URLRequest) async throws -> URLRequest {
        // 1. Generate timestamp and nonce
        let timestamp = String(Int(Date().timeIntervalSince1970))
        let nonce = generateNonce()
        
        // 2. Check nonce not reused
        if nonceCache.object(forKey: nonce as NSString) != nil {
            throw SecurityError.nonceAlreadyUsed
        }
        nonceCache.setObject(nonce as NSString, forKey: nonce as NSString)
        
        // 3. Calculate request body hash
        let body = request.httpBody ?? Data()
        let bodyHash = calculateSHA256(body)
        
        // 4. Build canonical request
        let method = request.httpMethod ?? "GET"
        let path = request.url?.path ?? "/"
        let canonical = "\(method)\n\(path)\n\(timestamp)\n\(nonce)\n\(bodyHash)"
        
        // 5. Calculate HMAC-SHA256
        let signature = calculateHMAC(canonical, key: secretKey)
        
        // 6. Add signature headers
        var signedRequest = request
        signedRequest.setValue(timestamp, forHTTPHeaderField: "X-Timestamp")
        signedRequest.setValue(nonce, forHTTPHeaderField: "X-Nonce")
        signedRequest.setValue(signature, forHTTPHeaderField: "X-Signature")
        
        return signedRequest
    }
    
    func validateRequest(_ request: URLRequest) throws {
        // Validate timestamp (within 5 minutes)
        guard let timestamp = request.value(forHTTPHeaderField: "X-Timestamp"),
              let tsValue = Int(timestamp) else {
            throw SecurityError.missingTimestamp
        }
        
        let now = Int(Date().timeIntervalSince1970)
        if abs(now - tsValue) > 300 {  // 5 minutes
            throw SecurityError.timestampExpired
        }
        
        // Validate nonce never used
        guard let nonce = request.value(forHTTPHeaderField: "X-Nonce") else {
            throw SecurityError.missingNonce
        }
        
        if nonceCache.object(forKey: nonce as NSString) != nil {
            throw SecurityError.nonceAlreadyUsed
        }
        
        // Validate signature
        guard let signature = request.value(forHTTPHeaderField: "X-Signature") else {
            throw SecurityError.missingSignature
        }
        
        let body = request.httpBody ?? Data()
        let bodyHash = calculateSHA256(body)
        let method = request.httpMethod ?? "GET"
        let path = request.url?.path ?? "/"
        let canonical = "\(method)\n\(path)\n\(timestamp)\n\(nonce)\n\(bodyHash)"
        
        let expectedSignature = calculateHMAC(canonical, key: secretKey)
        
        // Constant-time comparison to prevent timing attacks
        guard constantTimeEqual(signature, expectedSignature) else {
            throw SecurityError.invalidSignature
        }
    }
}
```

### Request Validation Process

**Pre-Request Validation**:
```swift
// Validate URL before request
func validateRequestURL(_ url: URL) throws {
    // 1. Verify HTTPS scheme
    guard url.scheme == "https" else {
        throw SecurityError.insecureScheme(url.scheme ?? "nil")
    }
    
    // 2. Verify host is configured
    guard url.host == runtimeConfig.apiHost else {
        throw SecurityError.untrustedHost(url.host ?? "nil")
    }
    
    // 3. Verify no suspicious paths
    let path = url.path
    if path.contains("..") || path.contains("\\") {
        throw SecurityError.suspiciousPath(path)
    }
}
```

**Post-Response Validation**:
```swift
// Validate response before processing
func validateResponse(_ response: URLResponse) throws {
    guard let httpResponse = response as? HTTPURLResponse else {
        throw SecurityError.invalidResponse
    }
    
    // 1. Verify HTTPS
    guard httpResponse.url?.scheme == "https" else {
        throw SecurityError.responseNotHTTPS
    }
    
    // 2. Check security headers
    if let cacheControl = httpResponse.value(forHTTPHeaderField: "Cache-Control"),
       cacheControl.contains("no-store") {
        // Good, response should not be cached
    }
    
    // 3. Verify content-type if applicable
    if httpResponse.statusCode == 200 {
        if let contentType = httpResponse.value(forHTTPHeaderField: "Content-Type") {
            guard contentType.contains("application/json") else {
                throw SecurityError.unexpectedContentType(contentType)
            }
        }
    }
}
```

### Certificate Pinning

**Implementation**:
```swift
class CertificatePinning {
    let pinnedHashes: [String]
    
    func validate(certificates: [SecCertificate]) throws {
        // Extract public key from each certificate
        for cert in certificates {
            guard let publicKey = extractPublicKey(from: cert) else {
                continue
            }
            
            let keyData = publicKeyToData(publicKey)
            let hash = calculateSHA256(keyData)
            
            // Check against pinned hashes
            if pinnedHashes.contains(hash) {
                return  // Valid pin found
            }
        }
        
        // No matching pin found
        throw SecurityError.certificatePinningFailed
    }
    
    private func extractPublicKey(from cert: SecCertificate) -> SecKey? {
        var secTrust: SecTrust?
        let policy = SecPolicyCreateBasicX509()
        
        SecTrustCreateWithCertificates(
            cert as CFTypeRef,
            policy,
            &secTrust
        )
        
        guard let trust = secTrust else { return nil }
        return SecTrustCopyKey(trust)
    }
}
```

**Certificate Pinning Configuration**:
```swift
// API should provide these hashes
let certificatePinning = CertificatePinning(pinnedHashes: [
    "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",  // Production
    "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",  // Backup
])
```

### TLS 1.3+ Enforcement

**URLSession Configuration**:
```swift
static var secure: URLSession {
    var config = URLSessionConfiguration.default
    
    // Enforce TLS 1.3
    config.tlsMinimumSupportedProtocolVersion = .TLSv13
    config.tlsMaximumSupportedProtocolVersion = .TLSv13
    
    // Strong cipher suites only (macOS applies automatically with TLS 1.3)
    
    // Disable cookie storage
    config.httpShouldSetCookies = false
    config.httpCookiePolicy = .never
    config.httpShouldUsePipelining = true
    
    // Disable credential storage
    config.urlCredentialStorage = nil
    
    return URLSession(configuration: config)
}
```

### HTTPS-Only Communication

**Enforcement Points**:

1. **URL Construction**:
```swift
func buildRequest(path: String) throws -> URLRequest {
    var urlComponents = URLComponents()
    urlComponents.scheme = "https"  // Force HTTPS
    urlComponents.host = runtimeConfig.apiHost
    urlComponents.path = path
    
    guard let url = urlComponents.url else {
        throw SecurityError.invalidURL
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    return request
}
```

2. **Configuration Validation**:
```swift
func validateConfiguration() throws {
    // Verify API base URL is HTTPS
    guard runtimeConfig.apiBaseUrl.hasPrefix("https://") else {
        throw ConfigurationError.insecureAPIUrl
    }
    
    // Parse URL to verify valid
    guard let url = URL(string: runtimeConfig.apiBaseUrl),
          url.scheme == "https" else {
        throw ConfigurationError.invalidAPIUrl
    }
}
```

3. **Request Interception**:
```swift
func performRequest<T: Decodable>(
    _ request: URLRequest
) async throws -> T {
    // Final validation before sending
    try validateRequestURL(request.url!)
    
    let data = try await session.data(for: request)
    try validateResponse(data.1)
    
    return try JSONDecoder().decode(T.self, from: data.0)
}
```

### Rate Limiting Considerations

**Client-Side Rate Limiting**:
```swift
actor RateLimiter {
    var requestTimestamps: [Date] = []
    let maxRequestsPerMinute = 60
    
    func checkRateLimit() throws {
        // Remove old timestamps (older than 1 minute)
        let cutoff = Date(timeIntervalSinceNow: -60)
        requestTimestamps.removeAll { $0 < cutoff }
        
        // Check limit
        if requestTimestamps.count >= maxRequestsPerMinute {
            throw RateLimitError.limitExceeded
        }
        
        requestTimestamps.append(Date())
    }
}

// Before each request
try await rateLimiter.checkRateLimit()
```

**Server Response Handling**:
```swift
// Handle 429 Too Many Requests
if httpResponse.statusCode == 429 {
    // Extract retry-after header
    if let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After"),
       let seconds = Int(retryAfter) {
        try await Task.sleep(nanoseconds: UInt64(seconds) * 1_000_000_000)
        // Retry request
    }
}
```

## Data Encryption

### AES-GCM Encryption for Configuration

**Algorithm Details**:
- **Algorithm**: AES-256-GCM (Advanced Encryption Standard)
- **Key Size**: 256 bits (32 bytes)
- **IV Size**: 96 bits (12 bytes) - GCM recommended
- **Auth Tag**: 128 bits (16 bytes)
- **Mode**: Galois/Counter Mode (authenticated encryption)

**Implementation**:
```swift
actor SecureConfigurationStore {
    func encrypt(
        _ plaintext: Data,
        key: [UInt8]
    ) throws -> EncryptedData {
        // 1. Generate random IV
        var iv = [UInt8](repeating: 0, count: 12)
        let ivResult = SecRandomCopyBytes(kSecRandomDefault, 12, &iv)
        guard ivResult == errSecSuccess else {
            throw EncryptionError.ivGenerationFailed
        }
        
        // 2. Create cipher
        var sealedBox = try AES.GCM.SealedBox(
            nonce: AES.GCM.Nonce(data: Data(iv))!
        )
        
        // 3. Encrypt
        sealedBox = try AES.GCM.seal(plaintext, using: SymmetricKey(data: Data(key)))
        
        // 4. Combine IV + ciphertext + tag
        var encrypted = Data(iv)
        encrypted.append(sealedBox.ciphertext)
        encrypted.append(sealedBox.tag)
        
        return EncryptedData(data: encrypted, metadata: [...])
    }
    
    func decrypt(
        _ encrypted: Data,
        key: [UInt8]
    ) throws -> Data {
        // 1. Extract IV (first 12 bytes)
        let iv = encrypted.prefix(12)
        
        // 2. Extract tag (last 16 bytes)
        let tag = encrypted.suffix(16)
        
        // 3. Extract ciphertext (middle portion)
        let ciphertext = encrypted.dropFirst(12).dropLast(16)
        
        // 4. Create sealed box
        let nonce = try AES.GCM.Nonce(data: iv)
        let sealedBox = try AES.GCM.SealedBox(
            nonce: nonce,
            ciphertext: ciphertext,
            tag: tag
        )
        
        // 5. Decrypt
        let plaintext = try AES.GCM.open(
            sealedBox,
            using: SymmetricKey(data: Data(key))
        )
        
        return plaintext
    }
}
```

### Key Management

**Key Derivation**:
```swift
// For configuration encryption key
func deriveConfigKey() throws -> [UInt8] {
    // Use PBKDF2 with device-specific salt
    let salt = try getDeviceSpecificSalt()
    let password = try getOperatorPassword()
    
    var derivedKey = [UInt8](repeating: 0, count: 32)
    let result = CCKeyDerivationPBKDF(
        kCCPBKDF2,
        password,
        password.count,
        salt,
        salt.count,
        CCPBKDFAlgorithm(kCCPRFHmacAlgSHA256),
        100_000,  // iterations
        &derivedKey,
        32
    )
    
    guard result == kCCSuccess else {
        throw KeyDerivationError.failed
    }
    
    return derivedKey
}
```

**Key Rotation**:
```swift
// Rotate configuration encryption key
func rotateConfigurationKey(newPassword: String) async throws {
    // 1. Decrypt all configs with old key
    let oldKey = try deriveConfigKey()
    let configs = try await listAll()
    
    var decryptedConfigs: [String: Data] = [:]
    for config in configs {
        let plaintext = try decrypt(config.data, key: oldKey)
        decryptedConfigs[config.id] = plaintext
    }
    
    // 2. Delete old encrypted configs
    for config in configs {
        try await delete(config.id)
    }
    
    // 3. Store new password (in Keychain)
    try await keychain.store(newPassword)
    
    // 4. Encrypt with new key
    for (id, plaintext) in decryptedConfigs {
        try await store(id: id, data: plaintext)
    }
}
```

### Initialization Vector Handling

**IV Generation**:
```swift
// Use cryptographically secure random IV
func generateIV() throws -> Data {
    var ivBytes = [UInt8](repeating: 0, count: 12)
    let result = SecRandomCopyBytes(kSecRandomDefault, 12, &ivBytes)
    
    guard result == errSecSuccess else {
        throw EncryptionError.ivGenerationFailed
    }
    
    return Data(ivBytes)
}
```

**IV Storage**:
- ✅ Store IV with ciphertext (IV does not need to be secret)
- ✅ Use fresh IV for each encryption
- ✅ Never reuse IV with same key
- ❌ Do not derive IV from plaintext
- ❌ Do not use predictable IVs

### Encrypted Storage Verification

**Integrity Verification**:
```swift
func verifyStoredConfiguration() async throws {
    let configFile = FileManager.default.urls(
        for: .applicationSupportDirectory,
        in: .userDomainMask
    )[0].appendingPathComponent("config.enc")
    
    // 1. Verify file exists and is readable
    guard FileManager.default.fileExists(atPath: configFile.path) else {
        throw VerificationError.configNotFound
    }
    
    // 2. Read encrypted file
    let encryptedData = try Data(contentsOf: configFile)
    
    // 3. Verify minimum size (IV + ciphertext + tag)
    guard encryptedData.count >= 28 else {  // 12 + 0 + 16
        throw VerificationError.corruptedData
    }
    
    // 4. Attempt decryption (validates authentication tag)
    let key = try deriveConfigKey()
    let plaintext = try decrypt(encryptedData, key: key)
    
    // 5. Verify plaintext structure
    let config = try JSONDecoder().decode(OperatorRuntimeConfig.self, from: plaintext)
    return
}
```

## Memory Safety

### Secure String Handling

**SecureString Implementation**:
```swift
struct SecureString {
    private var data: [UInt8]
    private let byteCount: Int
    
    init(_ string: String) {
        guard let stringData = string.data(using: .utf8) else {
            self.data = []
            self.byteCount = 0
            return
        }
        self.data = [UInt8](stringData)
        self.byteCount = self.data.count
    }
    
    // Safe comparison without leaking length
    static func constantTimeEqual(_ lhs: SecureString, _ rhs: SecureString) -> Bool {
        guard lhs.byteCount == rhs.byteCount else { return false }
        
        var result: UInt8 = 0
        for i in 0..<lhs.byteCount {
            result |= lhs.data[i] ^ rhs.data[i]
        }
        
        return result == 0
    }
    
    // Use without exposing to memory
    func withUnsafeBytes<R>(_ body: (UnsafeRawBufferPointer) throws -> R) throws -> R {
        return try data.withUnsafeBytes(body)
    }
    
    // Automatic memory zeroing on deallocation
    deinit {
        // Overwrite memory before deallocation
        data.withUnsafeMutableBytes { buffer in
            memset(buffer.baseAddress, 0, buffer.count)
        }
    }
}
```

**Usage Example**:
```swift
// ✅ Correct - uses SecureString
let password = SecureString(userInput)
let isValid = try await authenticateWith(password)
// password automatically zeroed when out of scope

// ❌ Incorrect - leaks password in memory
let password = userInput  // String
let isValid = try await authenticateWith(password)
// password remains in memory (even if unused)
```

### Automatic Memory Zeroing

**Zeroing Guarantees**:
- Credentials in SecureString/SecureData automatically zeroed on deallocation
- Never convert to String or Data for logging
- Always pass sensitive data via SecureString

**Implementation**:
```swift
deinit {
    // XOR with random data before zeroing
    for i in 0..<data.count {
        data[i] ^= UInt8.random(in: 0...255)
    }
    // Zero the memory
    data.withUnsafeMutableBytes { buffer in
        memset(buffer.baseAddress, 0, buffer.count)
    }
}
```

### Stack vs Heap Considerations

**Stack Allocation** (Preferred for small sensitive data):
```swift
// Stack allocated - automatically freed
var tempKey = [UInt8](repeating: 0, count: 32)
// Use tempKey
// Automatically deallocated and potentially zeroed
```

**Heap Allocation** (For large sensitive data):
```swift
// Heap allocated - manual zeroing required
let largeData = try decryptLargeFile()
defer {
    // Ensure zeroing
    largeData.withUnsafeMutableBytes { buffer in
        memset(buffer.baseAddress, 0, buffer.count)
    }
}
// Use largeData
```

### Buffer Overflow Prevention

**String Length Validation**:
```swift
// Validate input lengths
func validateCredential(_ credential: String) throws {
    guard credential.count >= 32 else {
        throw ValidationError.credentialTooShort
    }
    guard credential.count <= 256 else {
        throw ValidationError.credentialTooLong
    }
}
```

**Fixed-Size Buffers**:
```swift
// Use fixed-size arrays instead of dynamic buffers
let hashBuffer = [UInt8](repeating: 0, count: 32)  // SHA256 always 32 bytes
let hmacBuffer = [UInt8](repeating: 0, count: 32)  // HMAC-SHA256 always 32 bytes
```

## Code Security

### Input Validation Requirements

**Validation at Entry Points**:
```swift
// Validate all external inputs
func processApprovalRequest(_ request: ApprovalRequest) throws {
    // 1. Validate ID format
    guard request.id.count == 36 && isValidUUID(request.id) else {
        throw ValidationError.invalidID
    }
    
    // 2. Validate action
    guard ["approve", "reject", "escalate"].contains(request.action) else {
        throw ValidationError.invalidAction
    }
    
    // 3. Validate reason length
    guard request.reason.count <= 500 else {
        throw ValidationError.reasonTooLong
    }
    
    // 4. Sanitize reason (prevent injection)
    let sanitized = request.reason.trimmingCharacters(in: .whitespaces)
    guard sanitized.count > 0 else {
        throw ValidationError.emptyReason
    }
}
```

**Whitelist Validation** (Preferred):
```swift
// Use enum for valid values
enum ApprovalAction: String, Codable {
    case approve
    case reject
    case escalate
}

// Decoding automatically validates
let action = try JSONDecoder().decode(ApprovalAction.self, from: data)
```

### Output Encoding

**Prevent Information Disclosure**:
```swift
// ❌ Bad - exposes system details
catch {
    print("Error: \(error)")  // Might reveal paths, keys, etc.
}

// ✅ Good - generic error message
catch {
    logDetailedError(error)  // Log internally
    throw AppError.operationFailed  // Generic to user
}
```

**Safe Error Messages**:
```swift
enum AppError: LocalizedError {
    case operationFailed
    case invalidInput
    case networkUnavailable
    case serverError
    
    var errorDescription: String? {
        switch self {
        case .operationFailed:
            return "Operation failed. Please try again."
        case .invalidInput:
            return "Invalid input provided."
        case .networkUnavailable:
            return "Network connection unavailable."
        case .serverError:
            return "Server error. Please try again later."
        }
    }
}
```

### Secure Logging (No Sensitive Data)

**Logging Framework Setup**:
```swift
enum LogLevel {
    case debug, info, warning, error
}

func log(_ message: String, level: LogLevel = .info) {
    // NEVER log sensitive data
    #if DEBUG
    print("[\(level)] \(message)")
    #else
    // In production, use secure logging system
    secureLogger.log(message, level: level)
    #endif
}
```

**What NOT to Log**:
```swift
// ❌ Never log these
log("API Key: \(apiKey)")
log("Credential: \(credential)")
log("Full error: \(error)")
log("Response: \(responseData)")
log("User data: \(userData)")

// ✅ Log these safely
log("API request initiated")
log("Authentication failed")
log("Response received with \(dataSize) bytes")
log("Operation completed in \(duration)ms")
```

**Debug Logging in Tests**:
```swift
#if DEBUG
// Only in debug builds
print("DEBUG: Full credentials for testing: \(secret)")
#endif

// Never in release builds
NSLog("User: \(userId)")  // Will be in console logs
```

## Sandbox and Permissions

### Sandbox Entitlements

**Minimal Entitlements**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Enable sandbox -->
    <key>com.apple.security.app-sandbox</key>
    <true/>
    
    <!-- Network communication -->
    <key>com.apple.security.network.client</key>
    <true/>
    
    <!-- Keychain access -->
    <key>com.apple.security.keychain</key>
    <true/>
</dict>
</plist>
```

### Required Capabilities

**Network Client**:
- Enables URLSession to make network requests
- Restricted to non-privileged ports (443, 80)
- Requires HTTPS for most operations

**Keychain Access**:
- Required for credential storage
- Default access without explicit entitlement
- Enforced by macOS Keychain

### File System Access

**Minimal File Access**:
```swift
// Use ~/Library/Application Support for config
let appSupport = FileManager.default.urls(
    for: .applicationSupportDirectory,
    in: .userDomainMask
)[0]

// Avoid accessing sensitive directories
// ❌ /etc, /var, /usr/bin (restricted)
// ✅ ~/Library, ~/Documents (with user consent)
```

**User-Selected Files** (Open/Save dialogs):
```swift
// NSSavePanel for write access
let savePanel = NSSavePanel()
savePanel.canCreateDirectories = true
savePanel.directoryURL = FileManager.default.homeDirectoryForCurrentUser

if savePanel.runModal() == .OK,
   let fileURL = savePanel.url {
    try configData.write(to: fileURL)
}
```

### Network Access

**HTTPS-Only**:
- All API communication via HTTPS
- App requires network.client entitlement
- macOS enforces TLS 1.2+ automatically

**Certificate Pinning**:
- Pinning prevents MITM even with system cert issues
- Backup pins for key rotation

### Code Signing Requirements

**Self-Signed Certificate** (For development):
```bash
# Create self-signed certificate
codesign -s - /path/to/BlackBoltOperator.app

# Verify signature
codesign -v /path/to/BlackBoltOperator.app
codesign -d -v /path/to/BlackBoltOperator.app
```

**Production Code Signing**:
```bash
# Sign with production certificate
codesign -s "Developer ID Application: Company Name" \
  --options runtime \
  /path/to/BlackBoltOperator.app

# Verify runtime hardening
codesign -d -v --requirements - /path/to/BlackBoltOperator.app
```

**Entitlements Configuration** (`entitlements.plist`):
```xml
<key>com.apple.security.cs.allow-unsigned-executable-memory</key>
<false/>
<key>com.apple.security.cs.disable-library-validation</key>
<false/>
<key>com.apple.security.cs.allow-dyld-environment-variables</key>
<false/>
```

## Incident Response

### Security Bug Reporting Process

**Internal Bug Reporting**:
1. Report via secure channel (not public GitHub issues)
2. Include: vulnerability type, affected versions, reproduction steps
3. Do NOT include secrets or sensitive data in report
4. Request immediate response from security team

**Responsible Disclosure** (if third-party code affected):
1. Report to maintainer via security contact
2. Allow 90 days for patch before public disclosure
3. Coordinate disclosure timing
4. Credit reporter (if desired)

### Incident Triage Procedure

**Severity Assessment**:
```
Critical: Allows remote code execution, credential theft, privilege escalation
High: Causes data loss, enables unauthorized access, causes service disruption
Medium: Information disclosure, bypasses security control, reduces security
Low: Improves non-functional property, theoretical vulnerability
```

**Triage Process**:
1. Verify bug is reproducible
2. Assess severity and impact
3. Assign priority (P0-P3)
4. Create security fix branch
5. Review and test fix
6. Plan release

### Remediation Steps

**Emergency Fix Procedure**:
```
1. Create security branch: hotfix/security-issue-#ID
2. Implement minimal fix (avoid scope creep)
3. Add test case (prevent regression)
4. Security review (minimum 2 reviewers)
5. Merge to main
6. Create release candidate
7. Test on target systems
8. Release immediately
```

### Release Process for Security Patches

```
1. Version bump: Increment PATCH version (e.g., 1.0.1)
2. Update CHANGELOG with security fix
3. Create git tag: v1.0.1
4. Build release artifact
5. Code sign artifact
6. Create GitHub Release (mark as pre-release if needed)
7. Notify users via security advisory
8. Monitor for deployment issues
```

## Security Checklist

### Pre-Commit Security Checks

- [ ] No sensitive data committed (credentials, keys, passwords)
- [ ] All secrets moved to environment or Keychain
- [ ] New code follows input validation patterns
- [ ] No plaintext logging of sensitive data
- [ ] Secrets not in string literals or comments
- [ ] New endpoints use HTTPS
- [ ] Request signing implemented if required
- [ ] Error handling does not disclose info
- [ ] Security tests added

**Pre-commit Hook**:
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for secrets
if git diff --cached | grep -iE "password|secret|api.?key|token" > /dev/null; then
    echo "❌ Potential secret committed!"
    exit 1
fi

# Check for debugging code
if git diff --cached | grep "print(" | grep -v "test"; then
    echo "⚠️  Debug print statements found"
fi

exit 0
```

### Pre-Release Security Validation

- [ ] All unit and integration tests passing
- [ ] Security audit checks passing
- [ ] Code coverage > 80%
- [ ] No outstanding security TODOs
- [ ] Certificate pinning configured (if enabled)
- [ ] Request signing configured (if enabled)
- [ ] TLS 1.3+ enforcement verified
- [ ] HTTPS-only validation enabled
- [ ] Keychain access control verified
- [ ] Secure logging configuration verified
- [ ] No debug symbols in release build
- [ ] Code signing certificate valid
- [ ] Sandbox entitlements minimal
- [ ] File permissions correct (0644 for config)

### User Security Guidance

**User Communication**:
```
Security Best Practices for BlackBolt Operator:

1. Keep your device updated (macOS patches)
2. Enable FileVault disk encryption
3. Use strong device passcode
4. Keep credentials confidential
5. Report security issues immediately
6. Update app when security patches released
7. Review approved actions in audit log
8. Logout when finished
```

## Third-Party Dependencies

### Dependency Audit Process

**Initial Review**:
1. Check GitHub repository (stars, contributors, activity)
2. Review LICENSE file (compatible with project)
3. Scan for known vulnerabilities (CVE)
4. Assess code quality (test coverage, documentation)
5. Verify code signing (if applicable)

**Ongoing Monitoring**:
```bash
# Check for vulnerable dependencies
swift package update
# Review Package.resolved changes

# Security advisory checking
# Visit https://security.swift.org/
# Check https://github.com/advisories
```

### Vulnerability Management

**Vulnerability Detection**:
```bash
# Use SwiftPM built-in features
swift package diagnose

# Monitor dependency sources
# - GitHub security advisories
# - NVD (National Vulnerability Database)
# - Vendor security bulletins
```

**Vulnerability Response**:
1. Assess impact on BlackBolt Operator
2. Update to patched version if available
3. Implement workaround if no patch
4. Verify fix via testing
5. Release update to users

### Update Procedures

**Dependency Updates**:
```bash
# Update specific dependency
swift package update BlackBoltAPI

# Review changes
git diff Package.resolved

# Rebuild and test
swift build
swift test

# Commit
git commit -m "Update BlackBoltAPI to v2.1.0"
```

**Security Update SLA**:
- Critical: Update within 24 hours
- High: Update within 1 week
- Medium: Update within 1 month
- Low: Update in next regular release

---

This security guide provides comprehensive guidance for implementing and maintaining security in BlackBolt Operator. For architecture details, see SWIFT_ARCHITECTURE_GUIDE.md. For development instructions, see SWIFT_DEVELOPMENT_GUIDE.md.
