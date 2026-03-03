# Swift Security Guide for BlackBolt

This guide provides Swift-specific security practices and recommendations for the BlackBolt Operator application.

## Table of Contents

1. [Secure String Handling](#secure-string-handling)
2. [Common Vulnerabilities](#common-vulnerabilities)
3. [Cryptography Best Practices](#cryptography-best-practices)
4. [Networking Security](#networking-security)
5. [File System Security](#file-system-security)
6. [Memory Safety](#memory-safety)
7. [Input Validation](#input-validation)
8. [Dependency Security](#dependency-security)

## Secure String Handling

### Sensitive Data Storage

Never keep sensitive data in memory longer than necessary:

```swift
// Incorrect: String persists in memory
let password = "userPassword123"
// Password remains in memory until garbage collection

// Correct: Use explicit clearing
var password = "userPassword123"
defer { password = "" }  // Clear on scope exit
// Use password as needed
```

### Keychain Storage

Always use Keychain for sensitive credentials:

```swift
import Security

class KeychainManager {
  static let shared = KeychainManager()

  func storePassword(_ password: String, forAccount account: String) throws {
    let data = password.data(using: .utf8)!
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
      kSecValueData as String: data
    ]

    // Delete existing password if it exists
    SecItemDelete(query as CFDictionary)

    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw KeychainError.storeFailed(status)
    }
  }

  func retrievePassword(forAccount account: String) throws -> String {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true
    ]

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess else {
      throw KeychainError.retrievalFailed(status)
    }

    guard let data = result as? Data,
          let password = String(data: data, encoding: .utf8) else {
      throw KeychainError.decodingFailed
    }

    return password
  }
}
```

### URL Handling

```swift
// Incorrect: URL contains credentials
let url = URL(string: "https://username:password@api.example.com/data")

// Correct: Use separate headers or authentication
var request = URLRequest(url: baseURL.appendingPathComponent("data"))
let authHeader = "Bearer " + authToken
request.setValue(authHeader, forHTTPHeaderField: "Authorization")
```

## Common Vulnerabilities

### 1. SQL Injection Prevention

```swift
// Incorrect: String concatenation
let query = "SELECT * FROM users WHERE id = \(userId)"

// Correct: Use parameterized queries
if let database = try? Database(path: dbPath) {
  try database.prepare("SELECT * FROM users WHERE id = ?").bind(userId)
}
```

### 2. Insecure Deserialization

```swift
// Incorrect: Unsafe decoding
let data = Data()
let user = try? JSONDecoder().decode(User.self, from: data)

// Correct: Validate before decoding
struct User: Codable {
  let id: Int
  let name: String
  let email: String

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let id = try container.decode(Int.self, forKey: .id)
    let name = try container.decode(String.self, forKey: .name)
    let email = try container.decode(String.self, forKey: .email)

    // Validate email format
    guard email.contains("@") && email.count > 5 else {
      throw DecodingError.dataCorruptedError(
        forKey: .email,
        in: container,
        debugDescription: "Invalid email format"
      )
    }

    self.id = id
    self.name = name
    self.email = email
  }
}
```

### 3. Information Disclosure

```swift
// Incorrect: Leaking sensitive information in error messages
print("Database connection failed: \(error.localizedDescription)")

// Correct: Log securely and show generic message to users
logger.error("DB Error: \(error)", metadata: ["sensitive": true])
throw AppError.databaseUnavailable  // Generic user-facing error
```

### 4. Weak Cryptography

```swift
// Incorrect: Using weak hashing
let hash = password.hashValue  // Swift's hashValue is not cryptographic

// Correct: Use proper cryptographic hashing
import CryptoKit

func hashPassword(_ password: String) throws -> String {
  let data = Data(password.utf8)
  let digest = SHA256.hash(data: data)
  return digest.map { String(format: "%02hhx", $0) }.joined()
}
```

## Cryptography Best Practices

### Using CryptoKit

```swift
import CryptoKit

// MARK: - Encryption
class EncryptionManager {
  // Generate a symmetric key
  static func generateKey() -> SymmetricKey {
    return SymmetricKey(size: .bits256)
  }

  // Encrypt data
  static func encrypt(_ plaintext: Data, with key: SymmetricKey) throws -> Data {
    let sealedBox = try AES.GCM.seal(plaintext, using: key)
    guard let combinedData = sealedBox.combined else {
      throw EncryptionError.sealingFailed
    }
    return combinedData
  }

  // Decrypt data
  static func decrypt(_ ciphertext: Data, with key: SymmetricKey) throws -> Data {
    let sealedBox = try AES.GCM(nonce: nil, ciphertext: ciphertext[0..<ciphertext.count-16], tag: ciphertext[ciphertext.count-16...])
    return try AES.GCM.open(sealedBox, using: key)
  }
}

// MARK: - Hashing
func secureHash(_ data: Data) -> String {
  let digest = SHA256.hash(data: data)
  return digest.map { String(format: "%02hhx", $0) }.joined()
}

// MARK: - Digital Signatures
func signData(_ data: Data, with privateKey: P256.Signing.PrivateKey) throws -> Data {
  let signature = try privateKey.signature(for: data)
  return signature.rawRepresentation
}

func verifySignature(_ signature: Data, for data: Data, with publicKey: P256.Signing.PublicKey) -> Bool {
  let sig = try? P256.Signing.ECDSASignature(rawRepresentation: signature)
  return publicKey.isValidSignature(sig ?? P256.Signing.ECDSASignature(rawRepresentation: Data()), for: data)
}
```

### Random Number Generation

```swift
// Always use secure random generation
import CryptoKit

// Correct: Cryptographically secure random
let randomToken = Data((0..<32).map { _ in UInt8.random(in: 0...255) })

// Avoid: Weak random
let weakRandom = Int.random(in: 0...1000)  // Not suitable for security
```

## Networking Security

### Certificate Pinning

```swift
class CertificatePinningDelegate: NSObject, URLSessionDelegate {
  let pinnedCertificates: [SecCertificate]

  init?(certificateNames: [String]) {
    self.pinnedCertificates = []
    super.init()
    // Load certificates from bundle
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    // Validate certificate against pinned certificates
    guard let serverTrust = challenge.protectionSpace.serverTrust,
          SecTrustEvaluateWithError(serverTrust, nil) else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }

    // Check if certificate matches pinned certificates
    var certificateMatches = false
    let certificateCount = SecTrustGetCertificateCount(serverTrust)

    for i in 0..<certificateCount {
      if let certificate = SecTrustGetCertificateAtIndex(serverTrust, i) {
        if pinnedCertificates.contains(where: { $0 == certificate }) {
          certificateMatches = true
          break
        }
      }
    }

    if certificateMatches {
      completionHandler(.useCredential, URLCredential(trust: serverTrust))
    } else {
      completionHandler(.cancelAuthenticationChallenge, nil)
    }
  }
}
```

### TLS Configuration

```swift
// Ensure TLS 1.2 or higher
var configuration = URLSessionConfiguration.default
configuration.tlsMinimumSupportedProtocolVersion = .TLSv12
let session = URLSession(configuration: configuration)

// Set strong cipher suites (if available in your environment)
configuration.waitsForConnectivity = true
configuration.allowsCellularAccess = true
```

### API Token Management

```swift
class APITokenManager {
  private let keychainManager = KeychainManager.shared

  func setToken(_ token: String, refreshToken: String?) throws {
    try keychainManager.storePassword(token, forAccount: "api_token")
    if let refreshToken = refreshToken {
      try keychainManager.storePassword(refreshToken, forAccount: "api_refresh_token")
    }
  }

  func getToken() throws -> String {
    return try keychainManager.retrievePassword(forAccount: "api_token")
  }

  func refreshToken() async throws -> String {
    let refreshToken = try keychainManager.retrievePassword(forAccount: "api_refresh_token")
    let newToken = try await apiClient.refreshToken(refreshToken: refreshToken)
    try setToken(newToken.accessToken, refreshToken: newToken.refreshToken)
    return newToken.accessToken
  }
}
```

## File System Security

### Secure File Storage

```swift
// Store sensitive files in protected container
func saveSecureFile(_ data: Data, fileName: String) throws {
  let fileManager = FileManager.default
  guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
    throw FileError.noDocumentsDirectory
  }

  let fileURL = documentsPath.appendingPathComponent(fileName)

  // Write with protection
  try data.write(to: fileURL, options: [.atomicWrite, .completeFileProtection])
}

// Read secure file
func readSecureFile(_ fileName: String) throws -> Data {
  let fileManager = FileManager.default
  guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
    throw FileError.noDocumentsDirectory
  }

  let fileURL = documentsPath.appendingPathComponent(fileName)
  let data = try Data(contentsOf: fileURL)

  // Verify file protection
  let attributes = try fileManager.attributesOfItem(atPath: fileURL.path)
  guard let protection = attributes[FileAttributeKey.protectionKey] as? String else {
    throw FileError.noProtection
  }

  return data
}

// Securely delete file
func deleteSecureFile(_ fileName: String) throws {
  let fileManager = FileManager.default
  guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
    throw FileError.noDocumentsDirectory
  }

  let fileURL = documentsPath.appendingPathComponent(fileName)

  // Overwrite before deletion for extra security (if needed)
  let randomData = Data((0..<try fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0).map { _ in UInt8.random(in: 0...255) })
  try randomData.write(to: fileURL, options: .atomic)

  try fileManager.removeItem(at: fileURL)
}
```

## Memory Safety

### Avoiding Common Issues

```swift
// 1. Avoid Force Unwrapping
// Incorrect
let value = optionalValue!  // Could crash

// Correct
guard let value = optionalValue else {
  throw ValidationError.missingValue
}

// 2. Use Weak References in Closures
weak var weakSelf = self
let task = apiClient.fetchData { [weak self] result in
  self?.handleResult(result)
}

// 3. Manage Reference Cycles
class Observer {
  weak var delegate: ObserverDelegate?

  deinit {
    delegate = nil  // Explicit cleanup if needed
  }
}

// 4. Value vs Reference Semantics
// Prefer structs for data
struct User {
  let id: Int
  let name: String
}

// Use classes for objects with identity and state
class UserRepository {
  private var cache: [User] = []
}
```

## Input Validation

### Always Validate User Input

```swift
class InputValidator {
  // Email validation
  static func isValidEmail(_ email: String) -> Bool {
    let pattern = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
    let regex = try? NSRegularExpression(pattern: pattern)
    let range = NSRange(email.startIndex..., in: email)
    return regex?.firstMatch(in: email, range: range) != nil
  }

  // URL validation
  static func isValidURL(_ urlString: String) -> Bool {
    guard let url = URL(string: urlString) else { return false }
    return UIApplication.shared.canOpenURL(url)
  }

  // Password validation
  static func isValidPassword(_ password: String) -> Bool {
    // At least 12 characters
    guard password.count >= 12 else { return false }
    // Contains uppercase
    guard password.range(of: "[A-Z]", options: .regularExpression) != nil else { return false }
    // Contains lowercase
    guard password.range(of: "[a-z]", options: .regularExpression) != nil else { return false }
    // Contains number
    guard password.range(of: "[0-9]", options: .regularExpression) != nil else { return false }
    // Contains special character
    guard password.range(of: "[!@#$%^&*]", options: .regularExpression) != nil else { return false }
    return true
  }

  // Sanitize input
  static func sanitizeString(_ input: String) -> String {
    return input.trimmingCharacters(in: .whitespaces)
  }
}
```

## Dependency Security

### Reviewing Dependencies

1. Check dependency sources
2. Verify version pinning
3. Review security advisories regularly
4. Keep dependencies updated

```swift
// In Package.swift, use specific versions
.package(url: "https://github.com/example/library.git", from: "1.0.0")

// Not recommended: flexible versions
.package(url: "https://github.com/example/library.git", branch: "main")
```

### Security Checklist

- [ ] All sensitive data uses Keychain
- [ ] No hardcoded credentials or API keys
- [ ] All network communication uses HTTPS/TLS
- [ ] Input validation is comprehensive
- [ ] Error messages don't leak sensitive information
- [ ] Force unwraps are eliminated
- [ ] Certificate pinning is implemented for critical endpoints
- [ ] Dependencies are regularly audited
- [ ] Secure random generation is used for tokens/keys
- [ ] Cryptographic operations use CryptoKit
