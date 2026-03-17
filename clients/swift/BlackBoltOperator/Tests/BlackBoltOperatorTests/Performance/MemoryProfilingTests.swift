/**
 * BlackBolt Operator - Memory Profiling Tests
 *
 * Detects memory leaks and monitors memory efficiency
 * Tests baseline memory, growth under load, and cleanup
 */

import XCTest
@testable import BlackBoltOperator

final class MemoryProfilingTests: XCTestCase {
  var operatorClient: OperatorClient?

  override func setUp() {
    super.setUp()
    operatorClient = OperatorClient(
      baseURL: URL(string: "http://localhost:3000")!,
      operatorKey: "test-key",
      tenantId: "test-tenant"
    )
  }

  override func tearDown() {
    operatorClient = nil
    super.tearDown()
  }

  // MARK: - Baseline Memory Tests

  /**
   * Measure: Baseline memory usage at startup
   */
  func testBaselineMemoryUsage() {
    let before = getMemoryUsage()
    let _ = OperatorClient(
      baseURL: URL(string: "http://localhost:3000")!,
      operatorKey: "test-key",
      tenantId: "test-tenant"
    )
    let after = getMemoryUsage()

    let baselineMemory = after - before
    print("Baseline memory: \(baselineMemory) bytes")

    // Baseline should be reasonable (< 10MB for initialization)
    XCTAssertLessThan(baselineMemory, 10_000_000)
  }

  // MARK: - Memory Growth Under Load

  /**
   * Test: Memory growth with 100 request cycles
   * Verifies memory is not leaking
   */
  func testMemoryGrowth100Cycles() {
    let memoryBefore = getMemoryUsage()

    for i in 0..<100 {
      autoreleasepool {
        _ = createMockRequest(id: i)
      }
    }

    let memoryAfter = getMemoryUsage()
    let growth = memoryAfter - memoryBefore

    print("Memory growth (100 cycles): \(growth) bytes")
    print("Per cycle: \(growth / 100) bytes")

    // Should not grow significantly (< 1MB for 100 cycles)
    XCTAssertLessThan(growth, 1_000_000)
  }

  /**
   * Test: Memory growth with 1000 request cycles
   * Extended test for leak detection
   */
  func testMemoryGrowth1000Cycles() {
    let memoryBefore = getMemoryUsage()

    for i in 0..<1000 {
      autoreleasepool {
        _ = createMockRequest(id: i)
      }
    }

    let memoryAfter = getMemoryUsage()
    let growth = memoryAfter - memoryBefore

    print("Memory growth (1000 cycles): \(growth) bytes")
    print("Per cycle: \(growth / 1000) bytes")

    // Average per cycle should be small (< 5MB per 1000 cycles = 5KB per cycle)
    XCTAssertLessThan(growth, 5_000_000)
  }

  // MARK: - Request Cycle Memory Cleanup

  /**
   * Test: Memory is released after request cycle
   * Verifies autoreleasepool is working
   */
  func testRequestCycleMemoryCleanup() {
    let memoryBefore = getMemoryUsage()

    for _ in 0..<100 {
      autoreleasepool {
        let largeData = Data(repeating: 0xFF, count: 100_000) // 100KB
        var requests: [URLRequest] = []
        for i in 0..<10 {
          var request = URLRequest(url: URL(string: "http://localhost:3000/api/\(i)")!)
          request.httpBody = largeData
          requests.append(request)
        }
        // Requests should be cleaned up here
      }
    }

    let memoryAfter = getMemoryUsage()
    let growth = memoryAfter - memoryBefore

    print("Memory after cleanup: \(growth) bytes")

    // Memory should be mostly cleaned up (< 5MB residual)
    XCTAssertLessThan(growth, 5_000_000)
  }

  // MARK: - Credential Cleanup Verification

  /**
   * Test: Memory after credential storage and cleanup
   */
  func testCredentialMemoryCleanup() {
    let memoryBefore = getMemoryUsage()

    for i in 0..<100 {
      autoreleasepool {
        // Simulate credential storage
        let credential = "password-" + String(repeating: "x", count: 1000)
        var credentialData = credential.data(using: .utf8) ?? Data()
        credentialData.append(Data(repeating: 0, count: 10000))

        // Simulate credential retrieval
        let _ = credentialData.withUnsafeBytes { _ in
          "retrieved"
        }
      }
    }

    let memoryAfter = getMemoryUsage()
    let growth = memoryAfter - memoryBefore

    print("Credential memory cleanup: \(growth) bytes")

    // Should clean up credential memory (< 1MB)
    XCTAssertLessThan(growth, 1_000_000)
  }

  // MARK: - State Management Memory Efficiency

  /**
   * Test: Memory efficiency of state management
   * Tracks memory with increasing state size
   */
  func testStateManagementMemoryEfficiency() {
    let memoryBefore = getMemoryUsage()

    var state: [String: Any] = [:]

    for i in 0..<1000 {
      state["key_\(i)"] = "value_\(i)"
    }

    let memoryAfter = getMemoryUsage()
    let usage = memoryAfter - memoryBefore

    print("State memory (1000 entries): \(usage) bytes")
    print("Per entry: \(usage / 1000) bytes")

    // Should be efficient (< 100KB for 1000 entries = 100 bytes per entry)
    XCTAssertLessThan(usage, 100_000)
  }

  // MARK: - Concurrent Request Memory

  /**
   * Test: Memory with concurrent requests
   */
  func testConcurrentRequestMemory() {
    let memoryBefore = getMemoryUsage()

    let group = DispatchGroup()
    let queue = DispatchQueue(label: "memory.concurrent", attributes: .concurrent)

    for i in 0..<100 {
      group.enter()
      queue.async {
        defer { group.leave() }
        _ = self.createMockRequest(id: i)
      }
    }

    group.wait()

    let memoryAfter = getMemoryUsage()
    let growth = memoryAfter - memoryBefore

    print("Concurrent request memory: \(growth) bytes")

    // Concurrent requests should not cause excessive memory use
    XCTAssertLessThan(growth, 10_000_000) // < 10MB
  }

  // MARK: - Collection Memory Tests

  /**
   * Test: Array memory growth
   */
  func testArrayMemoryGrowth() {
    let memoryBefore = getMemoryUsage()

    var array: [Data] = []
    for i in 0..<1000 {
      let data = Data(repeating: UInt8(i % 256), count: 1000)
      array.append(data)
    }

    let memoryAfter = getMemoryUsage()
    let usage = memoryAfter - memoryBefore

    print("Array memory (1000 x 1KB): \(usage) bytes")

    // ~1MB expected, should not be significantly more
    XCTAssertLessThan(usage, 2_000_000) // < 2MB
  }

  /**
   * Test: Dictionary memory growth
   */
  func testDictionaryMemoryGrowth() {
    let memoryBefore = getMemoryUsage()

    var dict: [String: Data] = [:]
    for i in 0..<1000 {
      let key = "key_\(i)"
      let data = Data(repeating: UInt8(i % 256), count: 1000)
      dict[key] = data
    }

    let memoryAfter = getMemoryUsage()
    let usage = memoryAfter - memoryBefore

    print("Dictionary memory (1000 x 1KB): \(usage) bytes")

    // Dictionary has more overhead than array, but should still be reasonable
    XCTAssertLessThan(usage, 5_000_000) // < 5MB
  }

  // MARK: - Cache Memory Tests

  /**
   * Test: Cache memory doesn't grow indefinitely
   */
  func testCacheMemoryBounds() {
    let memoryBefore = getMemoryUsage()

    // Simulate cache with max size
    var cache: [String: Data] = [:]
    let maxCacheSize = 100

    for i in 0..<1000 {
      let key = "cache_\(i % maxCacheSize)"
      let data = Data(repeating: UInt8(i % 256), count: 10000)

      // Simulate cache eviction
      if cache.count >= maxCacheSize {
        cache.removeValue(forKey: "cache_\((i - maxCacheSize) % maxCacheSize)")
      }

      cache[key] = data
    }

    let memoryAfter = getMemoryUsage()
    let usage = memoryAfter - memoryBefore

    print("Cache memory (max 100 x 10KB): \(usage) bytes")

    // Cache should stay bounded
    XCTAssertLessThan(usage, 2_000_000) // < 2MB
  }

  // MARK: - String Memory Tests

  /**
   * Test: String memory efficiency
   */
  func testStringMemoryEfficiency() {
    let memoryBefore = getMemoryUsage()

    var strings: [String] = []
    for i in 0..<1000 {
      let str = "String \(i) with some content and data"
      strings.append(str)
    }

    let memoryAfter = getMemoryUsage()
    let usage = memoryAfter - memoryBefore

    print("String memory (1000 strings): \(usage) bytes")
    print("Per string: \(usage / 1000) bytes")

    // Strings should be memory efficient
    XCTAssertLessThan(usage, 500_000) // < 500KB
  }

  // MARK: - Stress Tests

  /**
   * Stress test: Many allocations and deallocations
   */
  func testStressMemoryAllocDealloc() {
    let memoryBefore = getMemoryUsage()

    for cycle in 0..<100 {
      autoreleasepool {
        for i in 0..<100 {
          let data = Data(repeating: UInt8((cycle * 100 + i) % 256), count: 10000)
          _ = data.withUnsafeBytes { _ in "processed" }
        }
      }
    }

    let memoryAfter = getMemoryUsage()
    let growth = memoryAfter - memoryBefore

    print("Stress test memory growth: \(growth) bytes")

    // After many cycles, memory should stabilize
    XCTAssertLessThan(growth, 5_000_000) // < 5MB
  }

  // MARK: - Helper Methods

  private func getMemoryUsage() -> Int64 {
    var info = task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<task_basic_info>.size) / 4

    let kerr = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
        task_info(
          mach_task_self_,
          task_flavor_t(TASK_BASIC_INFO),
          $0,
          &count
        )
      }
    }

    guard kerr == KERN_SUCCESS else { return 0 }
    return Int64(info.resident_size)
  }

  private func createMockRequest(id: Int) -> URLRequest {
    var request = URLRequest(url: URL(string: "http://localhost:3000/api/\(id)")!)
    request.httpMethod = "GET"
    request.addValue("application/json", forHTTPHeaderField: "Content-Type")
    return request
  }
}

// MARK: - Mock Types

class OperatorClient {
  let baseURL: URL
  let operatorKey: String
  let tenantId: String

  init(baseURL: URL, operatorKey: String, tenantId: String) {
    self.baseURL = baseURL
    self.operatorKey = operatorKey
    self.tenantId = tenantId
  }
}
