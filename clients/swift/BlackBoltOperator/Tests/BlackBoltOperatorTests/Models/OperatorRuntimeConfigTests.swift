import XCTest

@testable import BlackBoltOperator

final class OperatorRuntimeConfigTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUpWithError() throws {
        try super.setUpWithError()
        suiteName = "OperatorRuntimeConfigTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
    }

    override func tearDownWithError() throws {
        try super.tearDownWithError()
        if let suiteName {
            UserDefaults().removePersistentDomain(forName: suiteName)
        }
        suiteName = nil
        defaults = nil
    }

    @MainActor
    func testAPIContextIncludesTrimmedTenantAndOperatorHeaders() throws {
        let sut = OperatorRuntimeConfig(defaults: defaults)
        sut.apiBaseURL = "https://api.example.com"
        sut.tenantId = " tenant-1 "
        sut.operatorKey = " operator-key "
        sut.authHeader = "Bearer token"

        let context = try sut.apiContext()

        XCTAssertEqual(context.serverURL.absoluteString, "https://api.example.com")
        XCTAssertEqual(context.tenantId, "tenant-1")
        XCTAssertEqual(context.operatorKey, "operator-key")
        XCTAssertEqual(context.authorizationHeader, "Bearer token")
    }

    @MainActor
    func testAPIContextBuildsBasicAuthorizationFromRawCredential() throws {
        let sut = OperatorRuntimeConfig(defaults: defaults)
        sut.apiBaseURL = "https://api.example.com"
        sut.authHeader = "username:password"

        let context = try sut.apiContext()

        XCTAssertEqual(context.authorizationHeader, "Basic dXNlcm5hbWU6cGFzc3dvcmQ=")
    }

    @MainActor
    func testAPIContextOmitsDashAuthorizationSentinel() throws {
        let sut = OperatorRuntimeConfig(defaults: defaults)
        sut.apiBaseURL = "https://api.example.com"
        sut.authHeader = "-"

        let context = try sut.apiContext()

        XCTAssertNil(context.authorizationHeader)
    }

    @MainActor
    func testAPIContextRejectsInvalidBaseURL() {
        let sut = OperatorRuntimeConfig(defaults: defaults)
        sut.apiBaseURL = ""

        XCTAssertThrowsError(try sut.apiContext()) { error in
            guard let appError = error as? OperatorAppError else {
                XCTFail("Expected OperatorAppError")
                return
            }
            XCTAssertEqual(appError.code, "invalid_config")
        }
    }
}
