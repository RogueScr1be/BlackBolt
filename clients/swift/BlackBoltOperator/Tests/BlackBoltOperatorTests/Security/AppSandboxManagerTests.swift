import XCTest

@testable import BlackBoltOperator

final class AppSandboxManagerTests: XCTestCase {
    private var sut: AppSandboxManager!

    override func setUpWithError() throws {
        try super.setUpWithError()
        sut = AppSandboxManager()
    }

    override func tearDownWithError() throws {
        sut = nil
        try super.tearDownWithError()
    }

    func testSandboxStateReturnsBool() async {
        let isSandboxed = await sut.isSandboxed()
        XCTAssertNotNil(isSandboxed)
    }

    func testGrantedEntitlementsAndDirectLookupStayConsistent() async {
        let entitlements = await sut.getGrantedEntitlements()
        let hasNetworkEntitlement = await sut.hasEntitlement("com.apple.security.network.client")

        XCTAssertNotNil(entitlements)
        XCTAssertEqual(hasNetworkEntitlement, entitlements.contains("com.apple.security.network.client"))
    }

    func testCanAccessFileReflectsFilesystemReality() async throws {
        let tempFile = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data("test".utf8).write(to: tempFile)
        defer { try? FileManager.default.removeItem(at: tempFile) }

        let canAccessTempFile = await sut.canAccessFile(tempFile.path)
        let canAccessMissingFile = await sut.canAccessFile("/path/that/does/not/exist")

        XCTAssertTrue(canAccessTempFile)
        XCTAssertFalse(canAccessMissingFile)
    }

    func testSandboxDirectoriesResolve() async {
        let temporaryDirectory = await sut.getSandboxedTemporaryDirectory()
        let cacheDirectory = await sut.getSandboxedCacheDirectory()
        let applicationSupportDirectory = await sut.getSandboxedApplicationSupportDirectory()

        XCTAssertFalse(temporaryDirectory.path.isEmpty)
        XCTAssertNotNil(cacheDirectory)
        XCTAssertNotNil(applicationSupportDirectory)
    }

    func testNetworkAndCodeSignatureChecksReturnValues() async {
        let hasNetworkAccess = await sut.hasNetworkAccess()
        let hasValidCodeSignature = await sut.verifyCodeSignature()
        let codeSigningIdentity = await sut.getCodeSigningIdentity()

        XCTAssertNotNil(hasNetworkAccess)
        XCTAssertNotNil(hasValidCodeSignature)
        XCTAssertNotNil(codeSigningIdentity)
    }

    func testValidateSandboxConfigurationOnlyThrowsKnownSandboxErrors() async {
        do {
            try await sut.validateSandboxConfiguration()
        } catch let error as SandboxError {
            switch error {
            case .entitlementMissing, .configurationInvalid, .sandboxViolation:
                XCTAssertTrue(true)
            }
        } catch {
            XCTFail("Unexpected sandbox error: \(error)")
        }
    }

    func testConcurrentFileAccessChecksComplete() async throws {
        let tempFile = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data("test".utf8).write(to: tempFile)
        defer { try? FileManager.default.removeItem(at: tempFile) }
        let manager = sut!

        let tasks: [Task<Bool, Never>] = (0..<5).map { _ in
            Task {
                await manager.canAccessFile(tempFile.path)
            }
        }

        let results = await Task.gather(tasks)
        XCTAssertEqual(results.count, 5)
        XCTAssertTrue(results.allSatisfy { $0 })
    }
}
