import XCTest
@testable import BlackBoltOperator

@MainActor
final class OperatorShellStoreTests: XCTestCase {
    func testHasRequiredSettingsReflectsRuntimeFields() {
        let defaults = UserDefaults(suiteName: "BlackBoltOperatorTests-\(UUID().uuidString)")!
        let runtime = OperatorRuntimeConfig(defaults: defaults)
        let store = OperatorShellStore()

        runtime.apiBaseURL = "https://blackbolt-api-production.up.railway.app"
        runtime.tenantId = "tenant-1"
        runtime.operatorKey = "operator-key-1"
        XCTAssertTrue(store.hasRequiredSettings(runtime: runtime))

        runtime.operatorKey = ""
        XCTAssertFalse(store.hasRequiredSettings(runtime: runtime))
    }

    func testReconcileConfigClearsInvalidConfigLockWhenFieldsBecomeValid() {
        let defaults = UserDefaults(suiteName: "BlackBoltOperatorTests-\(UUID().uuidString)")!
        let runtime = OperatorRuntimeConfig(defaults: defaults)
        let store = OperatorShellStore()

        runtime.apiBaseURL = ""
        runtime.tenantId = ""
        runtime.operatorKey = ""
        store.reconcileConfig(runtime: runtime)
        XCTAssertEqual(store.connectionState, .invalidConfig)
        XCTAssertNotNil(store.lastError)

        runtime.apiBaseURL = "https://blackbolt-api-production.up.railway.app"
        runtime.tenantId = "tenant-1"
        runtime.operatorKey = "operator-key-1"
        store.reconcileConfig(runtime: runtime)

        XCTAssertEqual(store.connectionState, .ready)
        XCTAssertNil(store.lastError)
    }
}
