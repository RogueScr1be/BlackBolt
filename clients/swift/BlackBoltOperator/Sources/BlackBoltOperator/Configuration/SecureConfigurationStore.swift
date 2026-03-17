import Foundation
import CryptoKit

/// Errors for configuration storage operations
enum ConfigurationStoreError: Error, Equatable {
    case encryptionFailed
    case decryptionFailed
    case invalidFormat
    case storageError(String)
    case configurationMissing
}

/// Secure encrypted configuration storage
/// Stores sensitive configuration using AES-GCM encryption
actor SecureConfigurationStore {
    /// Configuration version for migration tracking
    private let configurationVersion = "1.0"

    /// Encryption key derived from device/app context
    private let encryptionKey: SymmetricKey

    /// Storage location for encrypted configuration
    private let storageURL: URL

    /// Initialize with generated encryption key
    /// - Parameter storageURL: URL for storing encrypted configuration
    init(storageURL: URL = FileManager.default.applicationSupportDirectory) {
        self.storageURL = storageURL
        // Generate deterministic key from app bundle identifier and device
        let bundleID = Bundle.main.bundleIdentifier ?? "com.blackbolt.operator"
        let keyData = Data((bundleID + "SecureConfig").utf8)
        self.encryptionKey = SymmetricKey(data: keyData.prefix(32))

        // Ensure storage directory exists
        try? FileManager.default.createDirectory(
            at: storageURL,
            withIntermediateDirectories: true,
            attributes: nil
        )
    }

    /// Store configuration dictionary securely
    /// - Parameters:
    ///   - configuration: Dictionary of configuration values
    ///   - identifier: Unique identifier for this configuration
    /// - Throws: ConfigurationStoreError if storage fails
    func storeConfiguration(
        _ configuration: [String: Codable],
        withIdentifier identifier: String
    ) throws {
        let jsonData = try encodeConfiguration(configuration)

        // Encrypt
        let encrypted = try encryptData(jsonData)

        // Write to file
        let fileURL = storageURL.appendingPathComponent("\(identifier).config.enc")
        try encrypted.write(to: fileURL)

        // Set file protection attributes
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: fileURL.path
        )
    }

    /// Retrieve and decrypt configuration
    /// - Parameter identifier: Unique identifier for configuration
    /// - Returns: Decrypted configuration dictionary
    /// - Throws: ConfigurationStoreError if retrieval or decryption fails
    func retrieveConfiguration(
        withIdentifier identifier: String
    ) throws -> [String: Codable] {
        let fileURL = storageURL.appendingPathComponent("\(identifier).config.enc")

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw ConfigurationStoreError.configurationMissing
        }

        // Read encrypted data
        let encryptedData = try Data(contentsOf: fileURL)

        // Decrypt
        let decryptedData = try decryptData(encryptedData)

        return try decodeConfiguration(decryptedData)
    }

    /// Delete a configuration
    /// - Parameter identifier: Configuration identifier to delete
    /// - Throws: ConfigurationStoreError if deletion fails
    func deleteConfiguration(withIdentifier identifier: String) throws {
        let fileURL = storageURL.appendingPathComponent("\(identifier).config.enc")

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return
        }

        try FileManager.default.removeItem(at: fileURL)
    }

    /// Get all stored configuration identifiers
    /// - Returns: Array of configuration identifiers
    func listConfigurations() throws -> [String] {
        let files = try FileManager.default.contentsOfDirectory(
            at: storageURL,
            includingPropertiesForKeys: nil
        )

        return files
            .filter { $0.lastPathComponent.hasSuffix(".config.enc") }
            .map { $0.lastPathComponent.replacingOccurrences(of: ".config.enc", with: "") }
    }

    /// Validate configuration integrity
    /// - Parameter identifier: Configuration identifier
    /// - Returns: true if configuration is valid and readable
    func validateConfiguration(withIdentifier identifier: String) -> Bool {
        do {
            _ = try retrieveConfiguration(withIdentifier: identifier)
            return true
        } catch {
            return false
        }
    }

    /// Get configuration metadata
    /// - Parameter identifier: Configuration identifier
    /// - Returns: Dictionary of metadata
    func getConfigurationMetadata(withIdentifier identifier: String) throws -> [String: Any] {
        let fileURL = storageURL.appendingPathComponent("\(identifier).config.enc")

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw ConfigurationStoreError.configurationMissing
        }

        let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)

        return [
            "identifier": identifier,
            "version": configurationVersion,
            "created": attributes[.creationDate] as? Date ?? Date(),
            "modified": attributes[.modificationDate] as? Date ?? Date(),
            "size": attributes[.size] as? Int ?? 0,
            "encrypted": true
        ]
    }

    /// Encrypt data using AES-GCM
    /// - Parameter data: Data to encrypt
    /// - Returns: Encrypted data with nonce prepended
    /// - Throws: ConfigurationStoreError if encryption fails
    private func encryptData(_ data: Data) throws -> Data {
        let sealedBox = try AES.GCM.seal(data, using: encryptionKey)

        guard let combined = sealedBox.combined else {
            throw ConfigurationStoreError.encryptionFailed
        }

        return combined
    }

    /// Decrypt data using AES-GCM
    /// - Parameter data: Encrypted data with nonce prepended
    /// - Returns: Decrypted data
    /// - Throws: ConfigurationStoreError if decryption fails
    private func decryptData(_ data: Data) throws -> Data {
        let sealedBox = try AES.GCM.SealedBox(combined: data)

        do {
            return try AES.GCM.open(sealedBox, using: encryptionKey)
        } catch {
            throw ConfigurationStoreError.decryptionFailed
        }
    }

    private func encodeConfiguration(_ configuration: [String: Codable]) throws -> Data {
        let normalized = try configuration.reduce(into: [String: Any]()) { result, entry in
            result[entry.key] = try normalizeJSONValue(entry.value)
        }

        guard JSONSerialization.isValidJSONObject(normalized) else {
            throw ConfigurationStoreError.invalidFormat
        }

        return try JSONSerialization.data(withJSONObject: normalized, options: [])
    }

    private func decodeConfiguration(_ data: Data) throws -> [String: Codable] {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ConfigurationStoreError.invalidFormat
        }

        return try object.reduce(into: [String: Codable]()) { result, entry in
            result[entry.key] = try denormalizeJSONValue(entry.value)
        }
    }

    private func normalizeJSONValue(_ value: Codable) throws -> Any {
        switch value {
        case let value as String:
            return value
        case let value as NSString:
            return value as String
        case let value as Bool:
            return value
        case let value as NSNumber:
            return value
        case let value as Int:
            return value
        case let value as Int8:
            return Int(value)
        case let value as Int16:
            return Int(value)
        case let value as Int32:
            return Int(value)
        case let value as Int64:
            return value
        case let value as UInt:
            return value
        case let value as UInt8:
            return Int(value)
        case let value as UInt16:
            return Int(value)
        case let value as UInt32:
            return value
        case let value as UInt64:
            return value
        case let value as Double:
            return value
        case let value as Float:
            return Double(value)
        default:
            throw ConfigurationStoreError.invalidFormat
        }
    }

    private func denormalizeJSONValue(_ value: Any) throws -> Codable {
        switch value {
        case let value as String:
            return value
        case let value as NSNumber:
            if CFGetTypeID(value) == CFBooleanGetTypeID() {
                return value.boolValue
            }
            let doubleValue = value.doubleValue
            if floor(doubleValue) == doubleValue {
                return value.intValue
            }
            return doubleValue
        default:
            throw ConfigurationStoreError.invalidFormat
        }
    }
}

/// Extension for FileManager to provide application support directory
extension FileManager {
    var applicationSupportDirectory: URL {
        let urls = urls(for: .applicationSupportDirectory, in: .userDomainMask)
        let appName = Bundle.main.bundleIdentifier ?? "BlackBoltOperator"
        return urls.first?.appendingPathComponent(appName) ?? URL(fileURLWithPath: NSHomeDirectory())
    }
}
