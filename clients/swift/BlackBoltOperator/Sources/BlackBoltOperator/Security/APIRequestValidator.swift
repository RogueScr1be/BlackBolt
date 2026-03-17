import Foundation
import CryptoKit
import Security

/// Error types for API request validation
enum APIRequestValidationError: Error, Equatable {
    case invalidSignature
    case timestampExpired
    case invalidNonce
    case signingFailed
    case missingRequiredHeader(String)
}

/// HMAC-SHA256 request signing and validation
/// Prevents replay attacks and ensures request integrity
actor APIRequestValidator {
    /// Secret key for HMAC signing
    private let secretKey: SymmetricKey

    /// Timestamp tolerance in seconds (default: 300 seconds = 5 minutes)
    private let timestampToleranceSeconds: TimeInterval

    /// Nonce cache for replay attack prevention
    /// Maps nonce -> expiration timestamp
    private var nonceCache: [String: TimeInterval] = [:]

    /// Initialize with secret key
    /// - Parameters:
    ///   - secretKey: Secret key for HMAC-SHA256 signing
    ///   - timestampTolerance: Allowed clock skew in seconds (default: 300)
    init(
        secretKey: SymmetricKey,
        timestampTolerance: TimeInterval = 300
    ) {
        self.secretKey = secretKey
        self.timestampToleranceSeconds = timestampTolerance
    }

    /// Initialize with hex-encoded secret key
    /// - Parameters:
    ///   - secretKeyHex: Hex-encoded secret key string
    ///   - timestampTolerance: Allowed clock skew in seconds (default: 300)
    init?(
        secretKeyHex: String,
        timestampTolerance: TimeInterval = 300
    ) {
        guard let keyData = Data(hexString: secretKeyHex) else {
            return nil
        }
        self.secretKey = SymmetricKey(data: keyData)
        self.timestampToleranceSeconds = timestampTolerance
    }

    /// Sign a request with HMAC-SHA256
    /// Adds X-Signature, X-Timestamp, and X-Nonce headers
    /// - Parameter request: URLRequest to sign
    /// - Returns: Signed URLRequest with authentication headers
    func signRequest(_ request: URLRequest) throws -> URLRequest {
        var signedRequest = request

        // Generate timestamp
        let timestamp = String(Int(Date().timeIntervalSince1970))

        // Generate nonce
        let nonce = generateNonce()

        // Build signing payload
        let method = request.httpMethod ?? "GET"
        let path = request.url?.path ?? "/"
        let body = request.httpBody ?? Data()

        let payload = "\(method)\n\(path)\n\(timestamp)\n\(nonce)\n\(body.base64EncodedString())"

        // Calculate HMAC-SHA256 signature
        let signature = calculateSignature(payload)

        // Add headers
        signedRequest.setValue(signature, forHTTPHeaderField: "X-Signature")
        signedRequest.setValue(timestamp, forHTTPHeaderField: "X-Timestamp")
        signedRequest.setValue(nonce, forHTTPHeaderField: "X-Nonce")

        return signedRequest
    }

    /// Validate a signed request
    /// - Parameter request: URLRequest to validate
    /// - Returns: True if request signature is valid
    /// - Throws: APIRequestValidationError if validation fails
    func validateRequest(_ request: URLRequest) throws -> Bool {
        guard let signature = request.value(forHTTPHeaderField: "X-Signature") else {
            throw APIRequestValidationError.missingRequiredHeader("X-Signature")
        }

        guard let timestampStr = request.value(forHTTPHeaderField: "X-Timestamp") else {
            throw APIRequestValidationError.missingRequiredHeader("X-Timestamp")
        }

        guard let nonce = request.value(forHTTPHeaderField: "X-Nonce") else {
            throw APIRequestValidationError.missingRequiredHeader("X-Nonce")
        }

        // Validate timestamp
        try validateTimestamp(timestampStr)

        // Validate nonce (prevent replay attacks)
        try validateNonce(nonce)

        // Verify signature
        let method = request.httpMethod ?? "GET"
        let path = request.url?.path ?? "/"
        let body = request.httpBody ?? Data()

        let payload = "\(method)\n\(path)\n\(timestampStr)\n\(nonce)\n\(body.base64EncodedString())"
        let calculatedSignature = calculateSignature(payload)

        guard signature == calculatedSignature else {
            throw APIRequestValidationError.invalidSignature
        }

        return true
    }

    /// Validate timestamp is within acceptable range
    /// - Parameter timestampStr: Timestamp string from request
    /// - Throws: APIRequestValidationError if timestamp is expired
    private func validateTimestamp(_ timestampStr: String) throws {
        guard let timestamp = TimeInterval(timestampStr) else {
            throw APIRequestValidationError.timestampExpired
        }

        let now = Date().timeIntervalSince1970
        let timeDelta = abs(now - timestamp)

        guard timeDelta <= timestampToleranceSeconds else {
            throw APIRequestValidationError.timestampExpired
        }
    }

    /// Validate nonce to prevent replay attacks
    /// - Parameter nonce: Nonce to validate
    /// - Throws: APIRequestValidationError if nonce already seen
    private func validateNonce(_ nonce: String) throws {
        let now = Date().timeIntervalSince1970

        // Clean expired nonces
        nonceCache = nonceCache.filter { $0.value > now }

        // Check if nonce already used
        guard nonceCache[nonce] == nil else {
            throw APIRequestValidationError.invalidNonce
        }

        // Add nonce with expiration time
        let expirationTime = now + timestampToleranceSeconds + 60 // 60 seconds buffer
        nonceCache[nonce] = expirationTime
    }

    /// Calculate HMAC-SHA256 signature
    /// - Parameter payload: Payload to sign
    /// - Returns: Base64-encoded HMAC signature
    private func calculateSignature(_ payload: String) -> String {
        guard let payloadData = payload.data(using: .utf8) else {
            return ""
        }

        let hmac = HMAC<SHA256>.authenticationCode(for: payloadData, using: secretKey)
        return Data(hmac).base64EncodedString()
    }

    /// Generate a cryptographically secure random nonce
    /// - Returns: Hex-encoded random string
    private func generateNonce() -> String {
        var nonceBytes = [UInt8](repeating: 0, count: 16)
        let status = SecRandomCopyBytes(kSecRandomDefault, nonceBytes.count, &nonceBytes)
        guard status == errSecSuccess else {
            // Fallback to weaker randomness if secure random fails
            return UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(32).description
        }
        return nonceBytes.map { String(format: "%02x", $0) }.joined()
    }

    /// Clear expired nonces from cache
    func cleanExpiredNonces() async {
        let now = Date().timeIntervalSince1970
        nonceCache = nonceCache.filter { $0.value > now }
    }
}

/// Extension to convert hex string to Data
extension Data {
    init?(hexString: String) {
        let hexString = hexString.lowercased()
        let chars = Array(hexString)
        var bytes: [UInt8] = []

        for i in stride(from: 0, to: chars.count, by: 2) {
            guard i + 1 < chars.count else { return nil }
            let hexByte = String([chars[i], chars[i + 1]])
            guard let byte = UInt8(hexByte, radix: 16) else { return nil }
            bytes.append(byte)
        }

        self.init(bytes)
    }
}

/// URLRequest extension for signing and validation
extension URLRequest {
    /// Sign this request with HMAC-SHA256
    /// - Parameter validator: APIRequestValidator to use for signing
    /// - Returns: Signed URLRequest
    mutating func sign(with validator: APIRequestValidator) async throws {
        self = try await validator.signRequest(self)
    }

    /// Validate this request's signature
    /// - Parameter validator: APIRequestValidator to use for validation
    /// - Returns: True if signature is valid
    mutating func validate(with validator: APIRequestValidator) async throws -> Bool {
        return try await validator.validateRequest(self)
    }
}
