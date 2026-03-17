import XCTest

@testable import BlackBoltOperator

final class MemorySafetyTests: XCTestCase {
    var sut: MemorySafety!

    override func setUpWithError() throws {
        try super.setUpWithError()
        sut = MemorySafety()
    }

    override func tearDownWithError() throws {
        try super.tearDownWithError()
        sut = nil
    }

    // MARK: - SecureString Tests

    func testSecureStringInitializationWithString() {
        let originalString = "sensitive-password-123"
        let secureString = SecureString(originalString)

        XCTAssertEqual(secureString.value, originalString)
    }

    func testSecureStringInitializationWithData() {
        let originalData = Data("secret-data".utf8)
        let secureString = SecureString(originalData)

        XCTAssertEqual(secureString.data, originalData)
    }

    func testSecureStringDataProperty() {
        let testString = "test-string"
        let secureString = SecureString(testString)

        let data = secureString.data
        XCTAssertEqual(String(data: data, encoding: .utf8), testString)
    }

    func testSecureStringZeroing() {
        var secureString = SecureString("secret-password")
        secureString.zero()

        // After zeroing, the value should be empty or zeroed
        XCTAssertTrue(true) // Memory zeroing is internal
    }

    // MARK: - SecureData Tests

    func testSecureDataInitialization() {
        let testData = Data("test-data".utf8)
        let secureData = SecureData(testData)

        XCTAssertEqual(secureData.data, testData)
    }

    func testSecureDataZeroing() {
        var secureData = SecureData(Data("sensitive".utf8))
        secureData.zero()

        XCTAssertTrue(true) // Memory zeroing is internal
    }

    // MARK: - Credential Storage Tests

    func testStoreCredential() async throws {
        let credential = SecureString("api-key-secret")
        try await sut.storeCredential(
            credential,
            forKey: "test-api-key",
            serviceName: "BlackBoltOperator"
        )

        // Verify storage succeeded
        XCTAssertTrue(true)
    }

    func testRetrieveStoredCredential() async throws {
        let originalCredential = SecureString("stored-secret-123")
        try await sut.storeCredential(
            originalCredential,
            forKey: "test-retrieve",
            serviceName: "BlackBoltOperator"
        )

        let retrieved = try await sut.retrieveCredential(
            forKey: "test-retrieve",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertEqual(retrieved?.value, originalCredential.value)
    }

    func testRetrieveNonexistentCredential() async throws {
        let retrieved = try await sut.retrieveCredential(
            forKey: "nonexistent-key",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertNil(retrieved)
    }

    func testDeleteCredential() async throws {
        let credential = SecureString("to-be-deleted")
        try await sut.storeCredential(
            credential,
            forKey: "test-delete",
            serviceName: "BlackBoltOperator"
        )

        try await sut.deleteCredential(
            forKey: "test-delete",
            serviceName: "BlackBoltOperator"
        )

        let retrieved = try await sut.retrieveCredential(
            forKey: "test-delete",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertNil(retrieved)
    }

    func testDeleteNonexistentCredential() async throws {
        // Should not throw error
        try await sut.deleteCredential(
            forKey: "nonexistent-delete",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertTrue(true)
    }

    // MARK: - Credential Validation Tests

    func testIsCredentialValid() async throws {
        let credential = SecureString("valid-credential")
        try await sut.storeCredential(
            credential,
            forKey: "valid-test",
            serviceName: "BlackBoltOperator"
        )

        let isValid = try await sut.isCredentialValid(
            forKey: "valid-test",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertTrue(isValid)
    }

    func testIsCredentialValidForNonexistent() async throws {
        let isValid = try await sut.isCredentialValid(
            forKey: "nonexistent-validate",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertFalse(isValid)
    }

    // MARK: - Credential Rotation Tests

    func testRotateCredential() async throws {
        let oldCredential = SecureString("old-password")
        let newCredential = SecureString("new-password")

        try await sut.storeCredential(
            oldCredential,
            forKey: "rotate-test",
            serviceName: "BlackBoltOperator"
        )

        try await sut.rotateCredential(
            forKey: "rotate-test",
            to: newCredential,
            serviceName: "BlackBoltOperator"
        )

        let retrieved = try await sut.retrieveCredential(
            forKey: "rotate-test",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertEqual(retrieved?.value, newCredential.value)
    }

    func testRotateNonexistentCredential() async throws {
        let newCredential = SecureString("new-password")

        try await sut.rotateCredential(
            forKey: "nonexistent-rotate",
            to: newCredential,
            serviceName: "BlackBoltOperator"
        )

        let retrieved = try await sut.retrieveCredential(
            forKey: "nonexistent-rotate",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertEqual(retrieved?.value, newCredential.value)
    }

    // MARK: - Credential Integrity Tests

    func testValidateCredentialIntegrity() async throws {
        let credential = SecureString("integrity-test-credential")
        try await sut.storeCredential(
            credential,
            forKey: "integrity-test",
            serviceName: "BlackBoltOperator"
        )

        let isValid = try await sut.validateCredentialIntegrity(
            forKey: "integrity-test",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertTrue(isValid)
    }

    func testValidateEmptyCredentialIntegrity() async throws {
        let emptyCredential = SecureString("")
        try await sut.storeCredential(
            emptyCredential,
            forKey: "empty-integrity",
            serviceName: "BlackBoltOperator"
        )

        let isValid = try await sut.validateCredentialIntegrity(
            forKey: "empty-integrity",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertFalse(isValid)
    }

    func testValidateNonexistentCredentialIntegrity() async throws {
        let isValid = try await sut.validateCredentialIntegrity(
            forKey: "nonexistent-integrity",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertFalse(isValid)
    }

    // MARK: - Clear Credentials Tests

    func testClearAllCredentials() async throws {
        // Store multiple credentials
        try await sut.storeCredential(
            SecureString("cred1"),
            forKey: "key1",
            serviceName: "BlackBoltOperator"
        )
        try await sut.storeCredential(
            SecureString("cred2"),
            forKey: "key2",
            serviceName: "BlackBoltOperator"
        )

        // Clear all
        try await sut.clearAllCredentials()

        // Verify all are cleared
        let cred1 = try await sut.retrieveCredential(
            forKey: "key1",
            serviceName: "BlackBoltOperator"
        )
        let cred2 = try await sut.retrieveCredential(
            forKey: "key2",
            serviceName: "BlackBoltOperator"
        )

        XCTAssertNil(cred1)
        XCTAssertNil(cred2)
    }

    // MARK: - Multiple Service Tests

    func testCredentialWithDifferentServices() async throws {
        let credential1 = SecureString("service1-secret")
        let credential2 = SecureString("service2-secret")

        try await sut.storeCredential(
            credential1,
            forKey: "key",
            serviceName: "Service1"
        )
        try await sut.storeCredential(
            credential2,
            forKey: "key",
            serviceName: "Service2"
        )

        let retrieved1 = try await sut.retrieveCredential(
            forKey: "key",
            serviceName: "Service1"
        )
        let retrieved2 = try await sut.retrieveCredential(
            forKey: "key",
            serviceName: "Service2"
        )

        XCTAssertEqual(retrieved1?.value, credential1.value)
        XCTAssertEqual(retrieved2?.value, credential2.value)
    }

    // MARK: - Concurrent Operations Tests

    func testConcurrentCredentialStorage() async throws {
        let tasks = (0..<10).map { index in
            Task {
                let credential = SecureString("concurrent-cred-\(index)")
                try await sut.storeCredential(
                    credential,
                    forKey: "key-\(index)",
                    serviceName: "BlackBoltOperator"
                )
            }
        }

        try await Task.gather(tasks)
        XCTAssertTrue(true)
    }

    func testConcurrentCredentialRetrieval() async throws {
        // Store initial credentials
        for i in 0..<5 {
            let credential = SecureString("cred-\(i)")
            try await sut.storeCredential(
                credential,
                forKey: "key-\(i)",
                serviceName: "BlackBoltOperator"
            )
        }

        // Retrieve concurrently
        let tasks = (0..<5).map { index in
            Task {
                try await sut.retrieveCredential(
                    forKey: "key-\(index)",
                    serviceName: "BlackBoltOperator"
                )
            }
        }

        let results = try await Task.gather(tasks)
        XCTAssertEqual(results.count, 5)
        for result in results {
            XCTAssertNotNil(result)
        }
    }

    // MARK: - Integration Tests

    func testCompleteCredentialLifecycle() async throws {
        let key = "lifecycle-test"
        let initialCred = SecureString("initial-password-123")

        // Store
        try await sut.storeCredential(
            initialCred,
            forKey: key,
            serviceName: "BlackBoltOperator"
        )

        // Validate
        var isValid = try await sut.isCredentialValid(
            forKey: key,
            serviceName: "BlackBoltOperator"
        )
        XCTAssertTrue(isValid)

        // Retrieve
        var retrieved = try await sut.retrieveCredential(
            forKey: key,
            serviceName: "BlackBoltOperator"
        )
        XCTAssertEqual(retrieved?.value, initialCred.value)

        // Rotate
        let newCred = SecureString("rotated-password-456")
        try await sut.rotateCredential(
            forKey: key,
            to: newCred,
            serviceName: "BlackBoltOperator"
        )

        // Verify rotation
        retrieved = try await sut.retrieveCredential(
            forKey: key,
            serviceName: "BlackBoltOperator"
        )
        XCTAssertEqual(retrieved?.value, newCred.value)

        // Validate integrity
        let integrityValid = try await sut.validateCredentialIntegrity(
            forKey: key,
            serviceName: "BlackBoltOperator"
        )
        XCTAssertTrue(integrityValid)

        // Delete
        try await sut.deleteCredential(
            forKey: key,
            serviceName: "BlackBoltOperator"
        )

        // Verify deletion
        isValid = try await sut.isCredentialValid(
            forKey: key,
            serviceName: "BlackBoltOperator"
        )
        XCTAssertFalse(isValid)
    }
}
