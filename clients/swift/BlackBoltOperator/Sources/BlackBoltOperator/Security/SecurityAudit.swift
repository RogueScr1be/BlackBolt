import Foundation

/// Result of a security audit check
struct SecurityCheckResult: Equatable {
    let name: String
    let passed: Bool
    let message: String
    let severity: SecurityCheckSeverity

    enum SecurityCheckSeverity: String, Equatable {
        case critical
        case warning
        case info
    }
}

/// Comprehensive security audit system for app startup
actor SecurityAudit {
    /// Results from last audit run
    private var lastAuditResults: [SecurityCheckResult] = []

    /// Timestamp of last audit
    private var lastAuditTime: Date?

    /// Initialize security audit manager
    init() {}

    /// Run complete security audit on startup
    /// - Returns: Array of security check results
    func runStartupAudit() async -> [SecurityCheckResult] {
        var results: [SecurityCheckResult] = []

        // Run all security checks
        results.append(await checkCodeSignature())
        results.append(await checkKeychain())
        results.append(checkBundleIntegrity())
        results.append(checkDebuggerStatus())
        results.append(checkEnvironmentVariables())
        results.append(checkMinimumOSVersion())

        // Store results
        lastAuditResults = results
        lastAuditTime = Date()

        return results
    }

    /// Check if code signature is valid
    private func checkCodeSignature() async -> SecurityCheckResult {
        let sandboxManager = AppSandboxManager()
        let isValid = await sandboxManager.verifyCodeSignature()

        return SecurityCheckResult(
            name: "Code Signature Verification",
            passed: isValid,
            message: isValid
                ? "Code signature is valid"
                : "Code signature verification failed",
            severity: isValid ? .info : .critical
        )
    }

    /// Check Keychain availability and access
    private func checkKeychain() async -> SecurityCheckResult {
        let memorySafety = MemorySafety()

        do {
            // Try to store and retrieve a test value
            let testKey = "security_audit_test_\(UUID().uuidString)"
            let testValue = SecureString("test")

            try await memorySafety.storeCredential(testValue, forKey: testKey)
            let retrieved = try await memorySafety.retrieveCredential(forKey: testKey)

            // Clean up
            try await memorySafety.deleteCredential(forKey: testKey)

            let passed = retrieved != nil && retrieved?.value == testValue.value
            return SecurityCheckResult(
                name: "Keychain Access",
                passed: passed,
                message: passed
                    ? "Keychain is accessible and functioning"
                    : "Keychain test failed",
                severity: passed ? .info : .critical
            )
        } catch {
            return SecurityCheckResult(
                name: "Keychain Access",
                passed: false,
                message: "Keychain error: \(error.localizedDescription)",
                severity: .critical
            )
        }
    }

    /// Check bundle integrity
    private func checkBundleIntegrity() -> SecurityCheckResult {
        guard let bundleID = Bundle.main.bundleIdentifier else {
            return SecurityCheckResult(
                name: "Bundle Integrity",
                passed: false,
                message: "Bundle identifier not found",
                severity: .critical
            )
        }

        let bundlePath = Bundle.main.bundlePath

        let fileManager = FileManager.default
        let bundleExists = fileManager.fileExists(atPath: bundlePath)

        return SecurityCheckResult(
            name: "Bundle Integrity",
            passed: bundleExists,
            message: bundleExists
                ? "Bundle ID: \(bundleID)"
                : "Bundle path not accessible",
            severity: bundleExists ? .info : .critical
        )
    }

    /// Check if debugger is attached
    private func checkDebuggerStatus() -> SecurityCheckResult {
        let isDebuggerAttached = isDebuggerPresent()

        return SecurityCheckResult(
            name: "Debugger Status",
            passed: !isDebuggerAttached,
            message: isDebuggerAttached
                ? "Debugger is attached"
                : "No debugger detected",
            severity: isDebuggerAttached ? .warning : .info
        )
    }

    /// Check environment variables for security issues
    private func checkEnvironmentVariables() -> SecurityCheckResult {
        let env = ProcessInfo.processInfo.environment

        // Check for suspicious environment variables
        let suspiciousVars = [
            "DYLD_INSERT_LIBRARIES",
            "DYLD_LIBRARY_PATH",
            "LLDB_DEBUGSERVER_PATH"
        ]

        var foundSuspicious: [String] = []
        for varName in suspiciousVars {
            if env[varName] != nil {
                foundSuspicious.append(varName)
            }
        }

        let passed = foundSuspicious.isEmpty
        return SecurityCheckResult(
            name: "Environment Variables",
            passed: passed,
            message: passed
                ? "Environment is clean"
                : "Suspicious variables detected: \(foundSuspicious.joined(separator: ", "))",
            severity: passed ? .info : .warning
        )
    }

    /// Check minimum OS version
    private func checkMinimumOSVersion() -> SecurityCheckResult {
        let currentVersion = ProcessInfo.processInfo.operatingSystemVersionString

        let versionCheck = ProcessInfo.processInfo.operatingSystemVersion
        let isValid = versionCheck.majorVersion >= 14

        return SecurityCheckResult(
            name: "Minimum OS Version",
            passed: isValid,
            message: isValid
                ? "OS version \(currentVersion) meets requirements (macOS 14+)"
                : "OS version \(currentVersion) is below minimum required version",
            severity: isValid ? .info : .critical
        )
    }

    /// Get audit summary
    /// - Returns: Dictionary with audit statistics
    func getAuditSummary() -> [String: Any] {
        let passed = lastAuditResults.filter { $0.passed }.count
        let failed = lastAuditResults.filter { !$0.passed }.count
        let critical = lastAuditResults.filter { $0.severity == .critical && !$0.passed }.count

        return [
            "totalChecks": lastAuditResults.count,
            "passed": passed,
            "failed": failed,
            "criticalFailures": critical,
            "lastAuditTime": lastAuditTime as Any,
            "overallStatus": critical == 0 ? "PASS" : "FAIL"
        ]
    }

    /// Get detailed audit report
    /// - Returns: Array of check results
    func getAuditReport() -> [SecurityCheckResult] {
        return lastAuditResults
    }

    /// Check if critical security checks passed
    /// - Returns: true if no critical checks failed
    func hasCriticalFailures() -> Bool {
        return lastAuditResults.contains { $0.severity == .critical && !$0.passed }
    }

    /// Log audit results
    /// - Returns: Formatted audit log string
    func logAuditResults() -> String {
        var log = "=== Security Audit Report ===\n"
        log += "Time: \(lastAuditTime?.description ?? "Not run")\n"
        log += "\n"

        for result in lastAuditResults {
            let status = result.passed ? "PASS" : "FAIL"
            log += "[\(status)] \(result.name) (\(result.severity.rawValue))\n"
            log += "  \(result.message)\n"
        }

        log += "\n"
        let summary = getAuditSummary()
        log += "Summary: \(summary["passed"] ?? 0)/\(summary["totalChecks"] ?? 0) checks passed\n"

        if let critical = summary["criticalFailures"] as? Int, critical > 0 {
            log += "WARNING: \(critical) critical check(s) failed\n"
        }

        return log
    }

    /// Private helper to check debugger presence
    private func isDebuggerPresent() -> Bool {
        var info = kinfo_proc()
        var mib: [Int32] = [
            Int32(CTL_KERN),
            Int32(KERN_PROC),
            Int32(KERN_PROC_PID),
            getpid()
        ]

        var size = MemoryLayout<kinfo_proc>.stride
        let junk = sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)

        return junk == 0 && (info.kp_proc.p_flag & P_TRACED) != 0
    }
}

// Debugger detection helper types
import Darwin

let KERN_PROC_PID = 1
let P_TRACED: Int32 = 0x00000800
