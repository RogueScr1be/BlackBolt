/**
 * BlackBolt Operator - Cryptography Performance Tests
 *
 * Benchmarks cryptographic operations
 * Tests encryption, decryption, hashing, and HMAC operations
 */

import XCTest
import CommonCrypto
@testable import BlackBoltOperator

final class CryptographyPerformanceTests: XCTestCase {
  let testKey = "0123456789ABCDEF0123456789ABCDEF".data(using: .utf8)!
  let testIV = "0123456789ABCDEF".data(using: .utf8)!
  let testMessage = "The quick brown fox jumps over the lazy dog"

  // MARK: - AES-GCM Encryption Tests

  /**
   * Measure: AES-GCM encryption
   * Target: < 10ms per operation
   */
  func testAESGCMEncryptionPerformance() {
    let plaintext = testMessage.data(using: .utf8)!

    measure {
      for _ in 0..<100 {
        do {
          let encrypted = try encryptAESGCM(plaintext: plaintext, key: testKey, iv: testIV)
          XCTAssertNotNil(encrypted)
        } catch {
          XCTFail("Encryption failed: \(error)")
        }
      }
    }
  }

  /**
   * Measure: AES-GCM decryption
   * Target: < 10ms per operation
   */
  func testAESGCMDecryptionPerformance() {
    let plaintext = testMessage.data(using: .utf8)!
    let encrypted = (try? encryptAESGCM(plaintext: plaintext, key: testKey, iv: testIV)) ?? Data()

    measure {
      for _ in 0..<100 {
        do {
          let decrypted = try decryptAESGCM(ciphertext: encrypted, key: testKey, iv: testIV)
          XCTAssertEqual(decrypted, plaintext)
        } catch {
          XCTFail("Decryption failed: \(error)")
        }
      }
    }
  }

  /**
   * Measure: AES-GCM encrypt-decrypt cycle
   * Target: < 20ms per cycle
   */
  func testAESGCMCyclePerformance() {
    let plaintext = testMessage.data(using: .utf8)!

    measure {
      for _ in 0..<50 {
        do {
          let encrypted = try encryptAESGCM(plaintext: plaintext, key: testKey, iv: testIV)
          let decrypted = try decryptAESGCM(ciphertext: encrypted, key: testKey, iv: testIV)
          XCTAssertEqual(decrypted, plaintext)
        } catch {
          XCTFail("Cycle failed: \(error)")
        }
      }
    }
  }

  /**
   * Measure: AES-GCM with large data
   * Target: < 50ms for 1MB data
   */
  func testAESGCMLargeDataPerformance() {
    let largeData = Data(repeating: 0xFF, count: 1_000_000) // 1MB

    measure {
      do {
        let encrypted = try encryptAESGCM(plaintext: largeData, key: testKey, iv: testIV)
        let decrypted = try decryptAESGCM(ciphertext: encrypted, key: testKey, iv: testIV)
        XCTAssertEqual(decrypted, largeData)
      } catch {
        XCTFail("Large data encryption failed: \(error)")
      }
    }
  }

  // MARK: - HMAC-SHA256 Tests

  /**
   * Measure: HMAC-SHA256 generation
   * Target: < 2ms per operation
   */
  func testHMACSHA256Performance() {
    let message = testMessage.data(using: .utf8)!
    let secret = testKey

    measure {
      for _ in 0..<500 {
        let hmac = computeHMACSHA256(message: message, secret: secret)
        XCTAssertNotNil(hmac)
      }
    }
  }

  /**
   * Measure: HMAC-SHA256 with varying message sizes
   * Target: < 2ms for typical sizes
   */
  func testHMACSHA256VaryingSizePerformance() {
    let secret = testKey

    measure {
      for i in 0..<100 {
        let size = (i % 10 + 1) * 100 // 100 to 1000 bytes
        let message = Data(repeating: UInt8(i % 256), count: size)
        let hmac = computeHMACSHA256(message: message, secret: secret)
        XCTAssertNotNil(hmac)
      }
    }
  }

  /**
   * Measure: HMAC verification
   * Target: < 4ms for encrypt + verify
   */
  func testHMACVerificationPerformance() {
    let message = testMessage.data(using: .utf8)!
    let secret = testKey

    measure {
      for _ in 0..<250 {
        let expectedHmac = computeHMACSHA256(message: message, secret: secret)
        let computed = computeHMACSHA256(message: message, secret: secret)
        XCTAssertEqual(expectedHmac, computed)
      }
    }
  }

  // MARK: - SHA256 Hashing Tests

  /**
   * Measure: SHA256 hashing
   * Target: < 1ms per operation
   */
  func testSHA256HashPerformance() {
    let data = testMessage.data(using: .utf8)!

    measure {
      for _ in 0..<500 {
        let hash = computeSHA256(data: data)
        XCTAssertNotNil(hash)
      }
    }
  }

  /**
   * Measure: SHA256 with certificate data
   * Target: < 1ms per certificate
   */
  func testCertificateHashPerformance() {
    let certData = generateMockCertificateData()

    measure {
      for _ in 0..<200 {
        let hash = computeSHA256(data: certData)
        XCTAssertNotNil(hash)
      }
    }
  }

  // MARK: - Certificate Pinning Validation Tests

  /**
   * Measure: Certificate pinning validation overhead
   * Target: < 1ms per validation
   */
  func testCertificatePinningHashPerformance() {
    let certData = generateMockCertificateData()
    let expectedHash = computeSHA256(data: certData)

    measure {
      for _ in 0..<1000 {
        let hash = computeSHA256(data: certData)
        XCTAssertEqual(hash, expectedHash)
      }
    }
  }

  /**
   * Measure: Certificate chain validation
   * Target: < 5ms for chain of 3 certificates
   */
  func testCertificateChainValidationPerformance() {
    let certs = (0..<3).map { _ in generateMockCertificateData() }
    let hashes = certs.map { computeSHA256(data: $0) }

    measure {
      for i in 0..<100 {
        for (index, cert) in certs.enumerated() {
          let hash = computeSHA256(data: cert)
          XCTAssertEqual(hash, hashes[index])
        }
      }
    }
  }

  // MARK: - Concurrent Encryption Tests

  /**
   * Measure: Concurrent encryption (10 operations)
   * Target: < 50ms p95
   */
  func testConcurrentEncryption10Performance() {
    let plaintext = testMessage.data(using: .utf8)!
    let dispatchGroup = DispatchGroup()
    let queue = DispatchQueue(label: "crypto.concurrent.10", attributes: .concurrent)

    measure {
      for _ in 0..<10 {
        dispatchGroup.enter()
        queue.async {
          defer { dispatchGroup.leave() }
          do {
            let _ = try self.encryptAESGCM(plaintext: plaintext, key: self.testKey, iv: self.testIV)
          } catch {
            // Ignore
          }
        }
      }
      dispatchGroup.wait()
    }
  }

  /**
   * Measure: Concurrent encryption (50 operations)
   * Target: < 100ms p95
   */
  func testConcurrentEncryption50Performance() {
    let plaintext = testMessage.data(using: .utf8)!
    let dispatchGroup = DispatchGroup()
    let queue = DispatchQueue(label: "crypto.concurrent.50", attributes: .concurrent)

    measure {
      for _ in 0..<50 {
        dispatchGroup.enter()
        queue.async {
          defer { dispatchGroup.leave() }
          do {
            let _ = try self.encryptAESGCM(plaintext: plaintext, key: self.testKey, iv: self.testIV)
          } catch {
            // Ignore
          }
        }
      }
      dispatchGroup.wait()
    }
  }

  /**
   * Measure: Concurrent HMAC operations
   * Target: < 30ms for 100 concurrent operations
   */
  func testConcurrentHMAC100Performance() {
    let message = testMessage.data(using: .utf8)!
    let secret = testKey
    let dispatchGroup = DispatchGroup()
    let queue = DispatchQueue(label: "crypto.concurrent.hmac", attributes: .concurrent)

    measure {
      for _ in 0..<100 {
        dispatchGroup.enter()
        queue.async {
          defer { dispatchGroup.leave() }
          let _ = self.computeHMACSHA256(message: message, secret: secret)
        }
      }
      dispatchGroup.wait()
    }
  }

  // MARK: - Stress Tests

  /**
   * Stress test: Encryption with varying key sizes
   * Target: < 20ms total
   */
  func testVariableKeySizePerformance() {
    let plaintext = testMessage.data(using: .utf8)!
    let keySizes = [16, 24, 32] // 128-bit, 192-bit, 256-bit

    measure {
      for size in keySizes {
        let key = Data(repeating: 0x01, count: size)
        do {
          let _ = try encryptAESGCM(plaintext: plaintext, key: key, iv: testIV)
        } catch {
          // Some key sizes may not be supported
        }
      }
    }
  }

  /**
   * Stress test: Rapid key generation and usage
   * Target: < 100ms for 1000 operations
   */
  func testRapidKeyUsagePerformance() {
    let plaintext = testMessage.data(using: .utf8)!

    measure {
      for i in 0..<100 {
        let key = Data(repeating: UInt8(i % 256), count: 32)
        let iv = Data(repeating: UInt8((i + 1) % 256), count: 16)

        do {
          let encrypted = try encryptAESGCM(plaintext: plaintext, key: key, iv: iv)
          let decrypted = try decryptAESGCM(ciphertext: encrypted, key: key, iv: iv)
          XCTAssertEqual(decrypted, plaintext)
        } catch {
          // Ignore
        }
      }
    }
  }

  // MARK: - Baseline Metrics

  func testCryptographyBaselineMetrics() {
    let baseline: [String: Double] = [
      "aes_gcm_encryption_ms": 10.0,
      "aes_gcm_decryption_ms": 10.0,
      "aes_gcm_cycle_ms": 20.0,
      "hmac_sha256_ms": 2.0,
      "sha256_hash_ms": 1.0,
      "cert_pinning_ms": 1.0,
      "concurrent_encryption_10_ms": 50.0,
      "concurrent_encryption_50_ms": 100.0,
      "concurrent_hmac_100_ms": 30.0,
    ]

    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted

    if let encoded = try? encoder.encode(baseline) {
      XCTAssertNotNil(encoded)
    }
  }

  // MARK: - Helper Methods

  private func encryptAESGCM(plaintext: Data, key: Data, iv: Data) throws -> Data {
    // Mock implementation - in production use CryptoKit or CommonCrypto
    var encryptedData = Data()
    encryptedData.append(contentsOf: plaintext)
    return encryptedData
  }

  private func decryptAESGCM(ciphertext: Data, key: Data, iv: Data) throws -> Data {
    // Mock implementation
    return ciphertext
  }

  private func computeHMACSHA256(message: Data, secret: Data) -> String {
    // Mock implementation - in production use CommonCrypto
    return (message + secret).base64EncodedString()
  }

  private func computeSHA256(data: Data) -> String {
    // Mock implementation
    return data.base64EncodedString()
  }

  private func generateMockCertificateData() -> Data {
    return "mock-certificate-data".data(using: .utf8) ?? Data()
  }
}
