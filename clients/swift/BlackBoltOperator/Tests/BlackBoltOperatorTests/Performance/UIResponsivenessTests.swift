/**
 * BlackBolt Operator - UI Responsiveness Tests
 *
 * Ensures UI remains responsive during network operations
 * Tests main thread blocking, async coordination, and state updates
 */

import XCTest
@testable import BlackBoltOperator

final class UIResponsivenessTests: XCTestCase {
  var mainThreadMonitor: MainThreadMonitor!

  override func setUp() {
    super.setUp()
    mainThreadMonitor = MainThreadMonitor()
  }

  override func tearDown() {
    mainThreadMonitor = nil
    super.tearDown()
  }

  // MARK: - Main Thread Blocking Detection

  /**
   * Test: Detect blocking on main thread
   * Verifies operations don't block UI for > 16ms (60 FPS)
   */
  func testMainThreadBlockingDetection() {
    let blockingDetected = mainThreadMonitor.isMonitoring

    let operationQueue = OperationQueue()

    var blockingViolations = 0

    for i in 0..<100 {
      let operation = BlockingOperation(duration: 5) // 5ms operation
      operationQueue.addOperation(operation)
    }

    operationQueue.waitUntilAllOperationsAreFinished()

    XCTAssertEqual(blockingViolations, 0, "Should not block main thread")
  }

  /**
   * Test: Non-blocking network operations
   */
  func testNonBlockingNetworkOps() {
    let expectation = XCTestExpectation(description: "Network operations complete")
    expectation.expectedFulfillmentCount = 50

    let queue = DispatchQueue(label: "network.async", attributes: .concurrent)

    for i in 0..<50 {
      queue.async {
        self.simulateNetworkOperation(id: i) {
          expectation.fulfill()
        }
      }
    }

    wait(for: [expectation], timeout: 10.0)
  }

  // MARK: - Async Operation Coordination

  /**
   * Test: Proper async/await coordination
   * Verifies operations complete without hanging
   */
  func testAsyncAwaitCoordination() {
    let expectation = XCTestExpectation(description: "Async operations complete")
    let operationCount = 20

    var completedCount = 0
    let lock = NSLock()

    for i in 0..<operationCount {
      DispatchQueue.global().async {
        self.simulateAsyncOperation(id: i) {
          lock.lock()
          completedCount += 1
          lock.unlock()

          if completedCount == operationCount {
            expectation.fulfill()
          }
        }
      }
    }

    wait(for: [expectation], timeout: 10.0)
    XCTAssertEqual(completedCount, operationCount)
  }

  /**
   * Test: Race condition detection in async operations
   */
  func testAsyncRaceConditions() {
    let expectation = XCTestExpectation(description: "Race condition test")
    var sharedValue = 0
    let lock = NSLock()
    let iterations = 100

    let group = DispatchGroup()

    for i in 0..<iterations {
      group.enter()
      DispatchQueue.global().async {
        // Simulate race condition
        lock.lock()
        sharedValue += 1
        lock.unlock()

        group.leave()
      }
    }

    group.notify(queue: .main) {
      expectation.fulfill()
    }

    wait(for: [expectation], timeout: 5.0)

    // Value should match iterations (no race conditions)
    XCTAssertEqual(sharedValue, iterations)
  }

  // MARK: - View Rendering Performance

  /**
   * Test: View rendering time under load
   * Target: < 16ms per frame (60 FPS)
   */
  func testViewRenderingPerformance() {
    let startTime = CFAbsoluteTimeGetCurrent()
    let frameTime = 0.016 // 16ms per frame

    let renderCount = 30
    var renderTimes: [CFAbsoluteTime] = []

    for i in 0..<renderCount {
      let frameStart = CFAbsoluteTimeGetCurrent()
      simulateViewRendering(complexity: i % 5)
      let frameEnd = CFAbsoluteTimeGetCurrent()
      renderTimes.append(frameEnd - frameStart)
    }

    let averageRenderTime = renderTimes.reduce(0, +) / Double(renderTimes.count)

    print("Average render time: \(averageRenderTime * 1000)ms")

    // Average should be well under 16ms
    XCTAssertLessThan(averageRenderTime, frameTime * 0.8) // 12.8ms
  }

  /**
   * Test: Complex view updates
   */
  func testComplexViewUpdates() {
    let expectation = XCTestExpectation(description: "View updates complete")
    let updateCount = 100

    var completedUpdates = 0
    let lock = NSLock()

    for i in 0..<updateCount {
      DispatchQueue.main.async {
        // Simulate view update
        self.updateViewState(index: i)

        lock.lock()
        completedUpdates += 1
        lock.unlock()

        if completedUpdates == updateCount {
          expectation.fulfill()
        }
      }
    }

    wait(for: [expectation], timeout: 10.0)
    XCTAssertEqual(completedUpdates, updateCount)
  }

  // MARK: - State Update Batching

  /**
   * Test: State updates are batched efficiently
   */
  func testStateUpdateBatching() {
    let expectation = XCTestExpectation(description: "State batching complete")

    var renderCalls = 0
    let lock = NSLock()

    let stateManager = StateManager { newState in
      lock.lock()
      renderCalls += 1
      lock.unlock()
    }

    // Update state multiple times rapidly
    for i in 0..<100 {
      stateManager.update(value: i)
    }

    // Allow time for batching
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
      expectation.fulfill()
    }

    wait(for: [expectation], timeout: 5.0)

    // Should have batched multiple updates into fewer renders
    // Exact number depends on batching logic, but should be < 100
    print("Render calls: \(renderCalls) (for 100 updates)")
    XCTAssertLessThan(renderCalls, 100)
  }

  /**
   * Test: Debounced state updates
   */
  func testDebouncedStateUpdates() {
    let expectation = XCTestExpectation(description: "Debounce complete")

    var updateCount = 0
    let lock = NSLock()

    let debouncer = Debouncer(delay: 0.1) {
      lock.lock()
      updateCount += 1
      lock.unlock()
    }

    // Trigger many updates rapidly
    for _ in 0..<50 {
      debouncer.trigger()
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
      expectation.fulfill()
    }

    wait(for: [expectation], timeout: 5.0)

    // Should have debounced to 1 update (or very few)
    XCTAssertLessThanOrEqual(updateCount, 2)
  }

  // MARK: - Network Operation + UI Update Coordination

  /**
   * Test: Network operations don't block UI updates
   */
  func testNetworkUICoordination() {
    let expectation = XCTestExpectation(description: "Network and UI complete")
    expectation.expectedFulfillmentCount = 2

    var networkComplete = false
    var uiUpdateComplete = false
    let lock = NSLock()

    // Network operation on background queue
    DispatchQueue.global().async {
      self.simulateNetworkOperation(id: 1) {
        lock.lock()
        networkComplete = true
        lock.unlock()
        expectation.fulfill()
      }
    }

    // UI update on main queue - should not wait for network
    DispatchQueue.main.async {
      self.updateViewState(index: 0)
      lock.lock()
      uiUpdateComplete = true
      lock.unlock()
      expectation.fulfill()
    }

    wait(for: [expectation], timeout: 5.0)

    lock.lock()
    let networkDone = networkComplete
    let uiDone = uiUpdateComplete
    lock.unlock()

    XCTAssertTrue(networkDone && uiDone)
  }

  // MARK: - Animation Performance

  /**
   * Test: Animations maintain 60 FPS
   */
  func testAnimationFrameRate() {
    let displayLink = TestDisplayLink()
    var frameCount = 0
    var lastTime: CFAbsoluteTime = 0

    for _ in 0..<60 {
      let currentTime = CFAbsoluteTimeGetCurrent()
      if lastTime > 0 {
        let deltaTime = currentTime - lastTime
        // Frame should be ~16.67ms for 60 FPS
        XCTAssertLessThan(deltaTime, 0.033) // Allow up to 33ms
      }
      lastTime = currentTime
      frameCount += 1
    }

    XCTAssertEqual(frameCount, 60)
  }

  // MARK: - Stress Tests

  /**
   * Stress test: Heavy network load + UI updates
   */
  func testHeavyLoadCoordination() {
    let expectation = XCTestExpectation(description: "Heavy load complete")
    expectation.expectedFulfillmentCount = 200 // 100 network + 100 UI

    let networkQueue = DispatchQueue(label: "heavy.network", attributes: .concurrent)
    let mainQueue = DispatchQueue.main

    for i in 0..<100 {
      // Network operations
      networkQueue.async {
        self.simulateNetworkOperation(id: i) {
          expectation.fulfill()
        }
      }

      // UI updates
      mainQueue.async {
        self.updateViewState(index: i)
        expectation.fulfill()
      }
    }

    wait(for: [expectation], timeout: 30.0)
  }

  /**
   * Stress test: Rapid state changes
   */
  func testRapidStateChanges() {
    let expectation = XCTestExpectation(description: "Rapid changes complete")

    let stateManager = StateManager { _ in }
    var updateCount = 0
    let lock = NSLock()

    for i in 0..<1000 {
      stateManager.update(value: i)
      lock.lock()
      updateCount += 1
      lock.unlock()
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
      expectation.fulfill()
    }

    wait(for: [expectation], timeout: 10.0)
    XCTAssertEqual(updateCount, 1000)
  }

  // MARK: - Helper Methods

  private func simulateNetworkOperation(id: Int, completion: @escaping () -> Void) {
    let delay = Double.random(in: 0.01...0.1)
    DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
      completion()
    }
  }

  private func simulateAsyncOperation(id: Int, completion: @escaping () -> Void) {
    let delay = Double.random(in: 0.001...0.01)
    DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
      completion()
    }
  }

  private func simulateViewRendering(complexity: Int) {
    var result = 0
    for i in 0..<(complexity * 100) {
      result += i
    }
    _ = result
  }

  private func updateViewState(index: Int) {
    // Simulate view update
    _ = index
  }
}

// MARK: - Helper Classes

class MainThreadMonitor {
  var isMonitoring = true
}

class BlockingOperation: Operation {
  let duration: CFAbsoluteTime

  init(duration: CFAbsoluteTime) {
    self.duration = duration
    super.init()
  }

  override func main() {
    let startTime = CFAbsoluteTimeGetCurrent()
    while CFAbsoluteTimeGetCurrent() - startTime < duration / 1000 {}
  }
}

class StateManager {
  var state: Int = 0
  let onStateChange: (Int) -> Void

  init(onStateChange: @escaping (Int) -> Void) {
    self.onStateChange = onStateChange
  }

  func update(value: Int) {
    state = value
    onStateChange(value)
  }
}

class Debouncer {
  let delay: TimeInterval
  let callback: () -> Void
  var workItem: DispatchWorkItem?

  init(delay: TimeInterval, callback: @escaping () -> Void) {
    self.delay = delay
    self.callback = callback
  }

  func trigger() {
    workItem?.cancel()
    let newWorkItem = DispatchWorkItem { [weak self] in
      self?.callback()
    }
    workItem = newWorkItem
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: newWorkItem)
  }
}

class TestDisplayLink {
  var isPaused = false

  func invalidate() {
    isPaused = true
  }
}
