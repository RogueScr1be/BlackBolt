import Foundation
import Security
import CryptoKit

/// Error types for certificate pinning operations
enum CertificatePinningError: Error, Equatable {
    case noCertificatesFound
    case certificateValidationFailed(String)
    case invalidCertificateFormat
    case publicKeyExtractionFailed
    case pinningPolicyNotSet
}

/// Certificate pinning implementation using public key pinning
/// Provides SSL/TLS certificate validation and certificate chain verification
actor CertificatePinning {
    /// Public key hashes to pin for certificate validation
    /// Format: SHA256 hash of the public key in base64
    private let pinnedPublicKeyHashes: Set<String>

    /// Whether to allow certificate chain validation
    private let allowsCertificateChainValidation: Bool

    /// Whether pinning is enabled (for fallback scenarios)
    private let isPinningEnabled: Bool

    /// Initialize with pinned public key hashes
    /// - Parameters:
    ///   - pinnedHashes: Set of SHA256 hashes of public keys to trust
    ///   - allowChainValidation: Whether to validate certificate chain (default: true)
    ///   - enabled: Whether pinning enforcement is enabled (default: true)
    init(
        pinnedHashes: Set<String>,
        allowChainValidation: Bool = true,
        enabled: Bool = true
    ) {
        self.pinnedPublicKeyHashes = pinnedHashes
        self.allowsCertificateChainValidation = allowChainValidation
        self.isPinningEnabled = enabled
    }

    /// Validate a certificate against pinned keys
    /// - Parameters:
    ///   - certificate: SecCertificate to validate
    ///   - challenge: URLAuthenticationChallenge for additional context
    /// - Returns: True if certificate passes pinning validation
    /// - Throws: CertificatePinningError if validation fails
    nonisolated func validateCertificate(
        _ certificate: SecCertificate,
        challenge: URLAuthenticationChallenge?
    ) throws -> Bool {
        guard isPinningEnabled else {
            return true
        }

        // Extract public key from certificate
        let publicKey = try extractPublicKey(from: certificate)

        // Calculate SHA256 hash of public key
        let keyHash = calculatePublicKeyHash(publicKey)

        // Check if hash matches any pinned key
        guard pinnedPublicKeyHashes.contains(keyHash) else {
            throw CertificatePinningError.certificateValidationFailed(
                "Public key hash \(keyHash) not found in pinned keys"
            )
        }

        // Optionally validate certificate chain
        if allowsCertificateChainValidation {
            try validateCertificateChain(certificate)
        }

        return true
    }

    /// Validate certificate chain integrity
    /// - Parameter certificate: Certificate to validate
    /// - Throws: CertificatePinningError if chain validation fails
    private nonisolated func validateCertificateChain(_ certificate: SecCertificate) throws {
        var trust: SecTrust?
        let policy = SecPolicyCreateSSL(true, nil)

        let status = SecTrustCreateWithCertificates(
            certificate as CFTypeRef,
            policy,
            &trust
        )

        guard status == errSecSuccess, let trust = trust else {
            throw CertificatePinningError.certificateValidationFailed(
                "Failed to create trust object"
            )
        }

        // Evaluate trust
        let trustStatus = SecTrustEvaluateWithError(trust, nil)

        guard trustStatus else {
            throw CertificatePinningError.certificateValidationFailed(
                "Certificate chain validation failed"
            )
        }
    }

    /// Extract public key from certificate
    /// - Parameter certificate: SecCertificate to extract key from
    /// - Returns: SecKey representing the public key
    /// - Throws: CertificatePinningError if extraction fails
    private nonisolated func extractPublicKey(from certificate: SecCertificate) throws -> SecKey {
        var publicKey: SecKey?
        let policy = SecPolicyCreateBasicX509()
        var trust: SecTrust?

        let status = SecTrustCreateWithCertificates(
            certificate as CFTypeRef,
            policy,
            &trust
        )

        guard status == errSecSuccess, let trust = trust else {
            throw CertificatePinningError.publicKeyExtractionFailed
        }

        publicKey = SecTrustCopyKey(trust)

        guard let key = publicKey else {
            throw CertificatePinningError.publicKeyExtractionFailed
        }

        return key
    }

    /// Calculate SHA256 hash of public key
    /// - Parameter publicKey: SecKey to hash
    /// - Returns: Base64-encoded SHA256 hash of the key
    private nonisolated func calculatePublicKeyHash(_ publicKey: SecKey) -> String {
        guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
            return ""
        }
        // Calculate SHA256 hash of public key data
        let digest = SHA256.hash(data: publicKeyData)
        let hashData = Data(digest)
        return hashData.base64EncodedString()
    }
}

/// URLSessionDelegate for certificate pinning validation
final class CertificatePinningDelegate: NSObject, URLSessionDelegate {
    private let certificatePinning: CertificatePinning

    init(certificatePinning: CertificatePinning) {
        self.certificatePinning = certificatePinning
        super.init()
    }

    /// Handle authentication challenge with certificate pinning validation
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        guard let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Get certificate from trust
        guard let certificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        do {
            let isValid = try certificatePinning.validateCertificate(
                certificate,
                challenge: challenge
            )

            if isValid {
                let credential = URLCredential(trust: serverTrust)
                completionHandler(.useCredential, credential)
            } else {
                completionHandler(.cancelAuthenticationChallenge, nil)
            }
        } catch {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}
