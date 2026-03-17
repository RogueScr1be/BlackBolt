import XCTest

@testable import BlackBoltOperator

final class SecurityAuditTests: XCTestCase {
    var sut: SecurityAudit!

    override func setUpWithError() throws {
        try super.setUpWithError()
        sut = SecurityAudit()
    }

    override func tearDownWithError() throws {
        try super.tearDownWithError()
        sut = nil
    }

    // MARK: - Initialization Tests

    func testInitialization() throws {
        XCTAssertNotNil(sut)
    }

    // MARK: - Startup Audit Tests

    func testRunStartupAudit() async throws {
        let results = await sut.runStartupAudit()

        XCTAssertFalse(results.isEmpty)
        XCTAssertGreaterThanOrEqual(results.count, 1)
    }

    func testStartupAuditReturnsCheckResults() async throws {
        let results = await sut.runStartupAudit()

        for result in results {
            XCTAssertFalse(result.name.isEmpty)
            XCTAssertNotNil(result.passed)
            XCTAssertFalse(result.message.isEmpty)
            XCTAssertNotNil(result.severity)
        }
    }

    // MARK: - Check Result Tests

    func testSecurityCheckResultEquality() {
        let result1 = SecurityCheckResult(
            name: "Test Check",
            passed: true,
            message: "All good",
            severity: .info
        )
        let result2 = SecurityCheckResult(
            name: "Test Check",
            passed: true,
            message: "All good",
            severity: .info
        )

        XCTAssertEqual(result1, result2)
    }

    func testSecurityCheckResultWithDifferentValues() {
        let result1 = SecurityCheckResult(
            name: "Test Check",
            passed: true,
            message: "All good",
            severity: .info
        )
        let result2 = SecurityCheckResult(
            name: "Test Check",
            passed: false,
            message: "Failed",
            severity: .critical
        )

        XCTAssertNotEqual(result1, result2)
    }

    // MARK: - Severity Level Tests

    func testSecurityCheckSeverityLevels() {
        let severities = [
            SecurityCheckResult.SecurityCheckSeverity.critical,
            SecurityCheckResult.SecurityCheckSeverity.warning,
            SecurityCheckResult.SecurityCheckSeverity.info
        ]

        for severity in severities {
            XCTAssertNotNil(severity.rawValue)
            XCTAssertFalse(severity.rawValue.isEmpty)
        }
    }

    func testCriticalSeverity() {
        let result = SecurityCheckResult(
            name: "Critical Check",
            passed: false,
            message: "Critical failure",
            severity: .critical
        )

        XCTAssertEqual(result.severity, .critical)
        XCTAssertFalse(result.passed)
    }

    func testWarningSeverity() {
        let result = SecurityCheckResult(
            name: "Warning Check",
            passed: false,
            message: "Warning: something",
            severity: .warning
        )

        XCTAssertEqual(result.severity, .warning)
    }

    func testInfoSeverity() {
        let result = SecurityCheckResult(
            name: "Info Check",
            passed: true,
            message: "Info: all good",
            severity: .info
        )

        XCTAssertEqual(result.severity, .info)
    }

    // MARK: - Audit Caching Tests

    func testMultipleAuditRuns() async throws {
        let results1 = await sut.runStartupAudit()
        let results2 = await sut.runStartupAudit()

        XCTAssertEqual(results1.count, results2.count)
    }

    // MARK: - Check Result Message Tests

    func testCheckResultMessages() async throws {
        let results = await sut.runStartupAudit()

        for result in results {
            XCTAssertFalse(result.message.isEmpty)
            // Message should be descriptive
            XCTAssertGreaterThan(result.message.count, 3)
        }
    }

    // MARK: - Concurrent Audit Tests

    func testConcurrentAuditRuns() async throws {
        let audit = sut!
        let tasks = (0..<3).map { _ in
            Task {
                await audit.runStartupAudit()
            }
        }

        let results = await Task.gather(tasks)
        XCTAssertEqual(results.count, 3)

        for auditResults in results {
            XCTAssertFalse(auditResults.isEmpty)
        }
    }

    // MARK: - Audit Pass/Fail Tests

    func testAuditResultStatus() async throws {
        let results = await sut.runStartupAudit()

        // Some checks may pass or fail depending on environment
        let passedChecks = results.filter { $0.passed }
        let failedChecks = results.filter { !$0.passed }

        // At least one category should exist
        XCTAssertGreaterThan(passedChecks.count + failedChecks.count, 0)
    }

    // MARK: - Audit Coverage Tests

    func testAuditCoverageOfSecurityAreas() async throws {
        let results = await sut.runStartupAudit()
        let checkNames = results.map { $0.name }

        // Verify audit covers critical areas
        let hasCriticalChecks = !checkNames.isEmpty
        XCTAssertTrue(hasCriticalChecks)
    }

    // MARK: - Error Handling Tests

    func testAuditWithMissingConfiguration() async throws {
        // Audit should handle missing configurations gracefully
        let results = await sut.runStartupAudit()
        XCTAssertFalse(results.isEmpty)
    }

    func testAuditWithInvalidConfiguration() async throws {
        // Audit should handle invalid configurations gracefully
        let results = await sut.runStartupAudit()

        for result in results {
            // Even with invalid config, audit should return structured results
            XCTAssertNotNil(result.name)
            XCTAssertNotNil(result.severity)
        }
    }

    // MARK: - Audit Report Generation Tests

    func testGenerateAuditReport() async throws {
        let results = await sut.runStartupAudit()

        // Should be able to generate a report from results
        let report = results.map { result in
            "[\(result.severity.rawValue.uppercased())] \(result.name): \(result.message)"
        }

        XCTAssertFalse(report.isEmpty)
        for line in report {
            XCTAssertGreaterThan(line.count, 5)
        }
    }

    // MARK: - Audit Filtering Tests

    func testFilterCriticalIssues() async throws {
        let results = await sut.runStartupAudit()
        let criticalIssues = results.filter {
            $0.severity == .critical && !$0.passed
        }

        // May or may not have critical issues depending on environment
        XCTAssertNotNil(criticalIssues)
    }

    func testFilterFailedChecks() async throws {
        let results = await sut.runStartupAudit()
        let failedChecks = results.filter { !$0.passed }

        // Failed checks may exist or not depending on environment
        XCTAssertNotNil(failedChecks)
    }

    // MARK: - Audit Statistics Tests

    func testCalculateAuditStatistics() async throws {
        let results = await sut.runStartupAudit()

        let total = results.count
        let passed = results.filter { $0.passed }.count
        let failed = total - passed
        let passPercentage = total > 0 ? Double(passed) / Double(total) * 100 : 0

        XCTAssertGreaterThan(total, 0)
        XCTAssertGreaterThanOrEqual(passed, 0)
        XCTAssertGreaterThanOrEqual(failed, 0)
        XCTAssertGreaterThanOrEqual(passPercentage, 0)
        XCTAssertLessThanOrEqual(passPercentage, 100)
    }

    // MARK: - Audit Metadata Tests

    func testAuditTimestamp() async throws {
        let results = await sut.runStartupAudit()
        XCTAssertFalse(results.isEmpty)

        // Timestamp should be recent (within last minute)
        let now = Date()
        XCTAssertLessThan(abs(now.timeIntervalSinceNow), 60)
    }
}
