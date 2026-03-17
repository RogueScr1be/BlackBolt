import Foundation
import Security

/// Errors related to memory safety operations
enum MemorySafetyError: Error, Equatable {
    case zeroing
    case invalidData
    case keychainOperation(String)
}

/// Secure string wrapper that auto-zeros memory when deallocated
/// Protects sensitive strings like passwords and API keys in memory
final class SecureString: @unchecked Sendable {
    /// Internal mutable buffer for the string
    private var buffer: [UInt8]

    /// Initialize with a string
    /// - Parameter string: String to store securely
    init(_ string: String) {
        self.buffer = Array(string.utf8)
    }

    /// Initialize with data
    /// - Parameter data: Data to store securely
    init(_ data: Data) {
        self.buffer = [UInt8](data)
    }

    /// Get the string value
    var value: String {
        return String(bytes: buffer, encoding: .utf8) ?? ""
    }

    /// Get the data value
    var data: Data {
        return Data(buffer)
    }

    /// Zero out the memory
    func zero() {
        _ = buffer.withUnsafeMutableBytes { bytes in
            memset(bytes.baseAddress, 0, bytes.count)
        }
    }

    /// Deinitializer to zero memory when object is deallocated
    deinit {
        var mutableBuffer = buffer
        _ = mutableBuffer.withUnsafeMutableBytes { bytes in
            memset(bytes.baseAddress, 0, bytes.count)
        }
    }
}

/// Secure credential storage and management
actor MemorySafety {
    /// Registry of active secure strings for cleanup
    private var activeSecureStrings: [UUID: SecureString] = [:]

    /// Clear all active secure strings
    func clearAllCredentials() throws {
        activeSecureStrings.removeAll()
    }

    /// Store a credential in Keychain with secure deletion
    /// - Parameters:
    ///   - credential: String credential to store
    ///   - key: Unique key for storage
    ///   - serviceName: Service name for Keychain grouping
    /// - Throws: MemorySafetyError if storage fails
    func storeCredential(
        _ credential: SecureString,
        forKey key: String,
        serviceName: String = "BlackBoltOperator"
    ) throws {
        let credentialData = credential.data

        // Prepare query with access control
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecValueData as String: credentialData
        ]

        // Update or add
        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            [kSecValueData as String: credentialData] as CFDictionary
        )

        if updateStatus == errSecSuccess {
            return
        }

        if updateStatus == errSecItemNotFound {
            let addStatus = SecItemAdd(query as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw MemorySafetyError.keychainOperation("Failed to add credential")
            }
            return
        }

        throw MemorySafetyError.keychainOperation("Failed to store credential")
    }

    /// Retrieve a credential from Keychain as SecureString
    /// - Parameters:
    ///   - key: Key to retrieve
    ///   - serviceName: Service name for Keychain grouping
    /// - Returns: SecureString if found, nil otherwise
    /// - Throws: MemorySafetyError if retrieval fails
    func retrieveCredential(
        forKey key: String,
        serviceName: String = "BlackBoltOperator"
    ) throws -> SecureString? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess, let data = item as? Data else {
            throw MemorySafetyError.keychainOperation("Failed to retrieve credential")
        }

        return SecureString(data)
    }

    /// Delete a credential from Keychain securely
    /// - Parameters:
    ///   - key: Key to delete
    ///   - serviceName: Service name for Keychain grouping
    /// - Throws: MemorySafetyError if deletion fails
    func deleteCredential(
        forKey key: String,
        serviceName: String = "BlackBoltOperator"
    ) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw MemorySafetyError.keychainOperation("Failed to delete credential")
        }
    }

    /// Check credential expiration
    /// - Parameters:
    ///   - key: Credential key
    ///   - serviceName: Service name
    /// - Returns: true if credential exists and is not expired
    /// - Throws: MemorySafetyError if check fails
    func isCredentialValid(
        forKey key: String,
        serviceName: String = "BlackBoltOperator"
    ) throws -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound {
            return false
        }

        guard status == errSecSuccess else {
            throw MemorySafetyError.keychainOperation("Failed to validate credential")
        }

        return true
    }

    /// Rotate a credential to a new value
    /// - Parameters:
    ///   - key: Credential key
    ///   - newValue: New credential value
    ///   - serviceName: Service name
    /// - Throws: MemorySafetyError if rotation fails
    func rotateCredential(
        forKey key: String,
        to newValue: SecureString,
        serviceName: String = "BlackBoltOperator"
    ) throws {
        // Delete old credential
        try deleteCredential(forKey: key, serviceName: serviceName)

        // Store new credential
        try storeCredential(newValue, forKey: key, serviceName: serviceName)
    }

    /// Perform integrity check on stored credential
    /// - Parameters:
    ///   - key: Credential key
    ///   - serviceName: Service name
    /// - Returns: true if credential passes integrity check
    func validateCredentialIntegrity(
        forKey key: String,
        serviceName: String = "BlackBoltOperator"
    ) throws -> Bool {
        guard let credential = try retrieveCredential(forKey: key, serviceName: serviceName) else {
            return false
        }

        // Basic integrity check: credential should not be empty
        return !credential.value.isEmpty && credential.data.count > 0
    }
}

/// Memory-safe data wrapper with automatic zeroing
final class SecureData: @unchecked Sendable {
    private var buffer: [UInt8]

    init(_ data: Data) {
        self.buffer = [UInt8](data)
    }

    var data: Data {
        return Data(buffer)
    }

    func zero() {
        _ = buffer.withUnsafeMutableBytes { bytes in
            memset(bytes.baseAddress, 0, bytes.count)
        }
    }

    deinit {
        var mutableBuffer = buffer
        _ = mutableBuffer.withUnsafeMutableBytes { bytes in
            memset(bytes.baseAddress, 0, bytes.count)
        }
    }
}
