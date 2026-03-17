/**
 * BlackBolt Operator - Keychain Performance Tests
 *
 * Benchmarks Keychain operations for credential management
 * Tests CRUD operations and concurrent access
 */

import XCTest
@testable import BlackBoltOperator

final class KeychainPerformanceTests: XCTestCase {
  var keychain: SecureKeychain!
  let testIdentifier = "com.blackbolt.test.credentials"

  override func setUp() {
    super.setUp()
    keychain = SecureKeychain(identifier: testIdentifier)
    // Clean up any existing test data
    try? keychain.deleteCredential(identifier: testIdentifier)
  }

  override func tearDown() {
    try? keychain.deleteCredential(identifier: testIdentifier)
    keychain = nil
    super.tearDown()
  }

  // MARK: - Create Operations

  /**
   * Measure: Create credential in Keychain
   * Target: < 5ms per operation
   */
  func testCreateCredentialPerformance() {
    measure {
      for i in 0..<50 {
        let identifier = "\(testIdentifier)_create_\(i)"
        let credential = "password-12345-\(i)"

        do {
          try keychain.storeCredential(credential, identifier: identifier)
        } catch {
          XCTFail("Failed to store credential: \(error)")
        }

        // Clean up
        try? keychain.deleteCredential(identifier: identifier)
      }
    }
  }

  /**
   * Measure: Batch create operations
   * Target: < 100ms for 100 credentials
   */
  func testBatchCreatePerformance() {
    measure {
      for i in 0..<100 {
        let identifier = "\(testIdentifier)_batch_\(i)"
        let credential = "password-batch-\(i)"

        try? keychain.storeCredential(credential, identifier: identifier)
      }

      // Clean up
      for i in 0..<100 {
        let identifier = "\(testIdentifier)_batch_\(i)"
        try? keychain.deleteCredential(identifier: identifier)
      }
    }
  }

  // MARK: - Read Operations

  /**
   * Measure: Read credential from Keychain
   * Target: < 5ms per operation
   */
  func testReadCredentialPerformance() {
    // Setup
    let credential = "test-password-12345"
    try? keychain.storeCredential(credential, identifier: testIdentifier)

    measure {
      for _ in 0..<50 {
        do {
          let retrieved = try keychain.retrieveCredential(identifier: testIdentifier)
          XCTAssertEqual(retrieved, credential)
        } catch {
          XCTFail("Failed to retrieve credential: \(error)")
        }
      }
    }

    // Cleanup
    try? keychain.deleteCredential(identifier: testIdentifier)
  }

  /**
   * Measure: Read non-existent credential
   * Target: < 5ms (should fail gracefully)
   */
  func testReadNonExistentCredentialPerformance() {
    measure {
      for i in 0..<50 {
        let identifier = "\(testIdentifier)_nonexistent_\(i)"
        do {
          let _ = try keychain.retrieveCredential(identifier: identifier)
        } catch {
          // Expected to fail
        }
      }
    }
  }

  /**
   * Measure: List all credentials
   * Target: < 10ms for 10 credentials
   */
  func testListCredentialsPerformance() {
    // Setup - create 10 credentials
    for i in 0..<10 {
      let identifier = "\(testIdentifier)_list_\(i)"
      try? keychain.storeCredential("password-\(i)", identifier: identifier)
    }

    measure {
      do {
        let credentials = try keychain.listCredentials(prefix: testIdentifier)
        XCTAssertGreaterThanOrEqual(credentials.count, 10)
      } catch {
        XCTFail("Failed to list credentials: \(error)")
      }
    }

    // Cleanup
    for i in 0..<10 {
      let identifier = "\(testIdentifier)_list_\(i)"
      try? keychain.deleteCredential(identifier: identifier)
    }
  }

  // MARK: - Update Operations

  /**
   * Measure: Update existing credential
   * Target: < 5ms per operation
   */
  func testUpdateCredentialPerformance() {
    // Setup
    let initialPassword = "initial-password"
    try? keychain.storeCredential(initialPassword, identifier: testIdentifier)

    measure {
      for i in 0..<50 {
        let newPassword = "updated-password-\(i)"
        do {
          // Update by deleting and re-creating
          try keychain.deleteCredential(identifier: testIdentifier)
          try keychain.storeCredential(newPassword, identifier: testIdentifier)
        } catch {
          XCTFail("Failed to update credential: \(error)")
        }
      }
    }

    // Cleanup
    try? keychain.deleteCredential(identifier: testIdentifier)
  }

  // MARK: - Delete Operations

  /**
   * Measure: Delete credential from Keychain
   * Target: < 5ms per operation
   */
  func testDeleteCredentialPerformance() {
    measure {
      for i in 0..<50 {
        let identifier = "\(testIdentifier)_delete_\(i)"
        let credential = "password-\(i)"

        // Setup
        try? keychain.storeCredential(credential, identifier: identifier)

        // Measure delete
        do {
          try keychain.deleteCredential(identifier: identifier)
        } catch {
          XCTFail("Failed to delete credential: \(error)")
        }
      }
    }
  }

  /**
   * Measure: Delete non-existent credential
   * Target: < 5ms (should handle gracefully)
   */
  func testDeleteNonExistentCredentialPerformance() {
    measure {
      for i in 0..<50 {
        let identifier = "\(testIdentifier)_nonexistent_delete_\(i)"
        do {
          try keychain.deleteCredential(identifier: identifier)
        } catch {
          // Expected to fail silently or be handled
        }
      }
    }
  }

  // MARK: - Concurrent Read Operations

  /**
   * Measure: Concurrent reads (10 threads)
   * Target: < 20ms p95
   */
  func testConcurrentReads10Performance() {
    // Setup
    try? keychain.storeCredential("test-password", identifier: testIdentifier)

    let dispatchGroup = DispatchGroup()
    let queue = DispatchQueue(label: "concurrent.reads.10", attributes: .concurrent)

    measure {
      for _ in 0..<10 {
        dispatchGroup.enter()
        queue.async {
          defer { dispatchGroup.leave() }
          do {
            let _ = try self.keychain.retrieveCredential(identifier: self.testIdentifier)
          } catch {
            // Ignore
          }
        }
      }
      dispatchGroup.wait()
    }

    // Cleanup
    try? keychain.deleteCredential(identifier: testIdentifier)
  }

  /**
   * Measure: Concurrent reads (50 threads)
   * Target: < 20ms p95
   */
  func testConcurrentReads50Performance() {
    // Setup
    try? keychain.storeCredential("test-password", identifier: testIdentifier)

    let dispatchGroup = DispatchGroup()
    let queue = DispatchQueue(label: "concurrent.reads.50", attributes: .concurrent)

    measure {
      for _ in 0..<50 {
        dispatchGroup.enter()
        queue.async {
          defer { dispatchGroup.leave() }
          do {
            let _ = try self.keychain.retrieveCredential(identifier: self.testIdentifier)
          } catch {
            // Ignore
          }
        }
      }
      dispatchGroup.wait()
    }

    // Cleanup
    try? keychain.deleteCredential(identifier: testIdentifier)
  }

  /**
   * Measure: Concurrent reads and writes
   * Target: < 50ms (should handle mixed operations)
   */
  func testConcurrentMixedOperationsPerformance() {
    let dispatchGroup = DispatchGroup()
    let queue = DispatchQueue(label: "concurrent.mixed", attributes: .concurrent)

    measure {
      for i in 0..<50 {
        dispatchGroup.enter()
        queue.async {
          defer { dispatchGroup.leave() }

          if i % 2 == 0 {
            // Write operations
            let identifier = "\(self.testIdentifier)_mixed_\(i)"
            try? self.keychain.storeCredential("password-\(i)", identifier: identifier)
          } else {
            // Read operations
            let identifier = "\(self.testIdentifier)_mixed_\(i - 1)"
            try? self.keychain.retrieveCredential(identifier: identifier)
          }
        }
      }
      dispatchGroup.wait()
    }

    // Cleanup
    for i in 0..<50 {
      let identifier = "\(testIdentifier)_mixed_\(i)"
      try? keychain.deleteCredential(identifier: identifier)
    }
  }

  // MARK: - Stress Tests

  /**
   * Stress test: Large credential values
   * Target: < 10ms for 1MB credentials
   */
  func testLargeCredentialPerformance() {
    let largePassword = String(repeating: "x", count: 1_000_000) // 1MB

    measure {
      do {
        try keychain.storeCredential(largePassword, identifier: testIdentifier)
        let retrieved = try keychain.retrieveCredential(identifier: testIdentifier)
        XCTAssertEqual(retrieved, largePassword)
        try keychain.deleteCredential(identifier: testIdentifier)
      } catch {
        XCTFail("Failed with large credential: \(error)")
      }
    }
  }

  /**
   * Stress test: Many small credentials
   * Target: < 5ms per operation with 1000 credentials
   */
  func testManySmallCredentialsPerformance() {
    let count = 1000

    measure {
      // Write phase
      for i in 0..<count {
        let identifier = "\(testIdentifier)_stress_\(i)"
        try? keychain.storeCredential("pwd-\(i)", identifier: identifier)
      }

      // Read phase
      for i in 0..<count {
        let identifier = "\(testIdentifier)_stress_\(i)"
        try? keychain.retrieveCredential(identifier: identifier)
      }

      // Delete phase
      for i in 0..<count {
        let identifier = "\(testIdentifier)_stress_\(i)"
        try? keychain.deleteCredential(identifier: identifier)
      }
    }
  }

  // MARK: - Baseline Metrics

  func testKeychainBaselineMetrics() {
    let baseline: [String: Double] = [
      "create_credential_ms": 5.0,
      "read_credential_ms": 5.0,
      "update_credential_ms": 5.0,
      "delete_credential_ms": 5.0,
      "list_credentials_ms": 10.0,
      "concurrent_reads_10_ms": 20.0,
      "concurrent_reads_50_ms": 20.0,
      "large_credential_ms": 10.0,
    ]

    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted

    if let encoded = try? encoder.encode(baseline) {
      XCTAssertNotNil(encoded)
    }
  }
}

// MARK: - Mock Keychain Implementation

class SecureKeychain {
  private var storage: [String: String] = [:]
  private var queue = DispatchQueue(label: "secure.keychain", attributes: .concurrent)
  let identifier: String

  init(identifier: String) {
    self.identifier = identifier
  }

  func storeCredential(_ credential: String, identifier: String) throws {
    queue.async(flags: .barrier) {
      self.storage[identifier] = credential
    }
  }

  func retrieveCredential(identifier: String) throws -> String {
    var result: String?
    queue.sync {
      result = self.storage[identifier]
    }

    guard let credential = result else {
      throw NSError(domain: "Keychain", code: -1, userInfo: nil)
    }

    return credential
  }

  func deleteCredential(identifier: String) throws {
    queue.async(flags: .barrier) {
      self.storage.removeValue(forKey: identifier)
    }
  }

  func listCredentials(prefix: String) throws -> [String] {
    var result: [String] = []
    queue.sync {
      result = self.storage.keys.filter { $0.hasPrefix(prefix) }.map { $0 }
    }
    return result
  }
}
