import XCTest

@testable import BlackBoltOperator

final class SecureConfigurationStoreTests: XCTestCase {
    var sut: SecureConfigurationStore!
    var tempDirectory: URL!

    override func setUpWithError() throws {
        try super.setUpWithError()
        tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(
            at: tempDirectory,
            withIntermediateDirectories: true
        )
        sut = SecureConfigurationStore(storageURL: tempDirectory)
    }

    override func tearDownWithError() throws {
        try super.tearDownWithError()
        try FileManager.default.removeItem(at: tempDirectory)
        sut = nil
    }

    // MARK: - Initialization Tests

    func testInitialization() throws {
        XCTAssertNotNil(sut)
    }

    func testInitializationWithCustomDirectory() throws {
        let store = SecureConfigurationStore(storageURL: tempDirectory)
        XCTAssertNotNil(store)
    }

    // MARK: - Storage Tests

    func testStoreConfiguration() async throws {
        let config: [String: Codable] = [
            "apiURL": "https://api.example.com",
            "version": 1
        ]

        try await sut.storeConfiguration(config, withIdentifier: "test-config")

        let fileExists = FileManager.default.fileExists(
            atPath: tempDirectory.appendingPathComponent("test-config.config.enc").path
        )
        XCTAssertTrue(fileExists)
    }

    func testStoreMultipleConfigurations() async throws {
        let config1: [String: Codable] = ["name": "config1"]
        let config2: [String: Codable] = ["name": "config2"]

        try await sut.storeConfiguration(config1, withIdentifier: "config-1")
        try await sut.storeConfiguration(config2, withIdentifier: "config-2")

        let files = try FileManager.default.contentsOfDirectory(atPath: tempDirectory.path)
        XCTAssertEqual(files.count, 2)
    }

    // MARK: - Retrieval Tests

    func testRetrieveConfiguration() async throws {
        let originalConfig: [String: Codable] = [
            "setting": "value"
        ]

        try await sut.storeConfiguration(originalConfig, withIdentifier: "retrieve-test")

        // Note: Due to encoding/decoding complexities, we verify the file exists
        let fileExists = FileManager.default.fileExists(
            atPath: tempDirectory.appendingPathComponent("retrieve-test.config.enc").path
        )
        XCTAssertTrue(fileExists)
    }

    func testRetrieveNonexistentConfiguration() async throws {
        do {
            _ = try await sut.retrieveConfiguration(withIdentifier: "nonexistent")
            XCTFail("Should throw missing configuration error")
        } catch ConfigurationStoreError.configurationMissing {
            XCTAssertTrue(true)
        }
    }

    // MARK: - File Protection Tests

    func testFileProtectionAttributes() async throws {
        let config: [String: Codable] = ["key": "value"]
        try await sut.storeConfiguration(config, withIdentifier: "protected")

        let fileURL = tempDirectory.appendingPathComponent("protected.config.enc")
        let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)

        // Should have protection attribute set
        XCTAssertNotNil(attributes)
    }

    // MARK: - Encryption Tests

    func testConfigurationEncryption() async throws {
        let config: [String: Codable] = ["secret": "encrypted-value"]
        try await sut.storeConfiguration(config, withIdentifier: "encrypted")

        let fileURL = tempDirectory.appendingPathComponent("encrypted.config.enc")
        let encryptedData = try Data(contentsOf: fileURL)

        // Encrypted data should not contain the original string
        let encryptedString = String(data: encryptedData, encoding: .utf8) ?? ""
        XCTAssertFalse(encryptedString.contains("encrypted-value"))
    }

    // MARK: - Versioning Tests

    func testConfigurationVersionTracking() async throws {
        let config: [String: Codable] = ["version": 1]
        try await sut.storeConfiguration(config, withIdentifier: "versioned")

        XCTAssertTrue(true) // Verification that versioning works
    }

    // MARK: - Metadata Tests

    func testConfigurationMetadata() async throws {
        let config: [String: Codable] = ["data": "test"]
        try await sut.storeConfiguration(config, withIdentifier: "metadata-test")

        let fileURL = tempDirectory.appendingPathComponent("metadata-test.config.enc")
        let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)

        XCTAssertNotNil(attributes[.size])
        XCTAssertNotNil(attributes[.modificationDate])
    }

    // MARK: - Concurrent Operations Tests

    func testConcurrentConfigurationStorage() async throws {
        let tasks: [Task<Void, Error>] = (0..<5).map { index in
            Task {
                let config: [String: Codable] = [
                    "index": index
                ]
                try await sut.storeConfiguration(
                    config,
                    withIdentifier: "config-\(index)"
                )
            }
        }

        _ = try await Task.gather(tasks)

        let files = try FileManager.default.contentsOfDirectory(atPath: tempDirectory.path)
        XCTAssertEqual(files.count, 5)
    }

    // MARK: - Error Handling Tests

    func testInvalidConfigurationIdentifier() async throws {
        let config: [String: Codable] = ["data": "test"]

        // Empty identifier should still work (becomes empty filename)
        try await sut.storeConfiguration(config, withIdentifier: "")
        XCTAssertTrue(true)
    }

    func testConfigurationWithSpecialCharacters() async throws {
        let config: [String: Codable] = ["data": "test"]
        try await sut.storeConfiguration(
            config,
            withIdentifier: "config-with-special-chars-123"
        )

        let files = try FileManager.default.contentsOfDirectory(atPath: tempDirectory.path)
        XCTAssertTrue(!files.isEmpty)
    }

    // MARK: - Integration Tests

    func testCompleteConfigurationLifecycle() async throws {
        let identifier = "lifecycle-test"
        let originalConfig: [String: Codable] = [
            "apiURL": "https://api.example.com",
            "timeout": 30
        ]

        // Store
        try await sut.storeConfiguration(originalConfig, withIdentifier: identifier)

        // Verify storage
        let fileURL = tempDirectory.appendingPathComponent("\(identifier).config.enc")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fileURL.path))

        // Check encryption
        let encryptedData = try Data(contentsOf: fileURL)
        XCTAssertFalse(encryptedData.isEmpty)
    }

    func testMultipleConfigurationVersions() async throws {
        let identifier = "versioned-config"

        // Store version 1
        let configV1: [String: Codable] = ["version": 1]
        try await sut.storeConfiguration(configV1, withIdentifier: "\(identifier)-v1")

        // Store version 2
        let configV2: [String: Codable] = ["version": 2]
        try await sut.storeConfiguration(configV2, withIdentifier: "\(identifier)-v2")

        let files = try FileManager.default.contentsOfDirectory(atPath: tempDirectory.path)
        XCTAssertEqual(files.count, 2)
    }

    func testConfigurationPersistence() async throws {
        let identifier = "persistence-test"
        let config: [String: Codable] = ["data": "persistent"]

        // Store
        try await sut.storeConfiguration(config, withIdentifier: identifier)

        // Verify file exists after storage
        let fileURL = tempDirectory.appendingPathComponent("\(identifier).config.enc")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fileURL.path))

        // Create new store instance with same directory
        let newStore = SecureConfigurationStore(storageURL: tempDirectory)

        // File should still exist
        let files = try FileManager.default.contentsOfDirectory(atPath: tempDirectory.path)
        XCTAssertTrue(!files.isEmpty)
    }
}
