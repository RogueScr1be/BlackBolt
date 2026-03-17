import Foundation
import AppKit

/// Errors related to sandbox configuration
enum SandboxError: Error, Equatable {
    case entitlementMissing(String)
    case sandboxViolation(String)
    case configurationInvalid(String)
}

/// Application sandbox configuration and entitlements management
actor AppSandboxManager {
    /// Known required entitlements for BlackBolt Operator
    private let requiredEntitlements = [
        "com.apple.security.app-sandbox",
        "com.apple.security.network.client"
    ]

    /// Optional entitlements that enhance security
    private let optionalEntitlements = [
        "com.apple.security.files.user-selected.read-only",
        "com.apple.security.files.downloads.read-write"
    ]

    /// Check if app is running in sandbox
    /// - Returns: true if app is sandboxed
    func isSandboxed() -> Bool {
        let processInfo = ProcessInfo.processInfo
        let environment = processInfo.environment

        // Check for sandbox indicator in environment
        return environment["APP_SANDBOX_READ_ONLY_PATHS"] != nil
            || environment["APP_SANDBOX_READ_WRITE_PATHS"] != nil
    }

    /// Get list of granted entitlements
    /// - Returns: Array of entitlements granted to application
    func getGrantedEntitlements() -> [String] {
        guard let bundlePath = Bundle.main.bundlePath as NSString? else {
            return []
        }

        let codePath = bundlePath.strings(byAppendingPaths: ["/Contents/MacOS"])
        guard let execPath = codePath.first else {
            return []
        }

        return getEntitlementsForProcess(execPath)
    }

    /// Check if specific entitlement is granted
    /// - Parameter entitlement: Entitlement string to check
    /// - Returns: true if entitlement is granted
    func hasEntitlement(_ entitlement: String) -> Bool {
        return getGrantedEntitlements().contains(entitlement)
    }

    /// Validate all required entitlements are present
    /// - Throws: SandboxError if required entitlements are missing
    func validateRequiredEntitlements() throws {
        let granted = getGrantedEntitlements()

        for entitlement in requiredEntitlements {
            guard granted.contains(entitlement) else {
                throw SandboxError.entitlementMissing(entitlement)
            }
        }
    }

    /// Check file system access capability
    /// - Parameter path: File path to check
    /// - Returns: true if file is accessible
    func canAccessFile(_ path: String) -> Bool {
        let fileManager = FileManager.default
        return fileManager.fileExists(atPath: path) && fileManager.isReadableFile(atPath: path)
    }

    /// Check network access capability
    /// - Returns: true if network access is available
    func hasNetworkAccess() -> Bool {
        return hasEntitlement("com.apple.security.network.client")
    }

    /// Check camera access capability
    /// - Returns: true if camera access is available
    func hasCameraAccess() -> Bool {
        return hasEntitlement("com.apple.security.device.camera")
    }

    /// Check microphone access capability
    /// - Returns: true if microphone access is available
    func hasMicrophoneAccess() -> Bool {
        return hasEntitlement("com.apple.security.device.microphone")
    }

    /// Get sandboxed temporary directory
    /// - Returns: URL for temporary directory within sandbox
    func getSandboxedTemporaryDirectory() -> URL {
        return FileManager.default.temporaryDirectory
    }

    /// Get sandboxed cache directory
    /// - Returns: URL for cache directory within sandbox
    func getSandboxedCacheDirectory() -> URL? {
        return FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    }

    /// Get sandboxed application support directory
    /// - Returns: URL for application support directory within sandbox
    func getSandboxedApplicationSupportDirectory() -> URL? {
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
    }

    /// Verify app has proper code signing
    /// - Returns: true if code signature is valid
    func verifyCodeSignature() -> Bool {
        let bundlePath = Bundle.main.bundlePath

        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        task.arguments = ["-v", "-v", bundlePath]

        let pipe = Pipe()
        task.standardError = pipe
        task.standardOutput = pipe

        do {
            try task.run()
            task.waitUntilExit()
            return task.terminationStatus == 0
        } catch {
            return false
        }
    }

    /// Get code signing identity
    /// - Returns: Code signing identity string if available
    func getCodeSigningIdentity() -> String? {
        let bundlePath = Bundle.main.bundlePath

        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        task.arguments = ["-d", "--format=xml", bundlePath]

        let pipe = Pipe()
        task.standardOutput = pipe

        do {
            try task.run()
            task.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let output = String(data: data, encoding: .utf8) else {
                return nil
            }

            // Parse XML to extract identity
            // For now, return raw output as identifier
            return output.trimmingCharacters(in: .whitespacesAndNewlines).prefix(50).description
        } catch {
            return nil
        }
    }

    /// Validate sandbox configuration matches app requirements
    /// - Throws: SandboxError if configuration is invalid
    func validateSandboxConfiguration() throws {
        guard isSandboxed() else {
            // Not running in sandbox - acceptable for development
            return
        }

        // Verify required entitlements
        try validateRequiredEntitlements()

        // Verify code signature
        guard verifyCodeSignature() else {
            throw SandboxError.configurationInvalid("Code signature verification failed")
        }
    }

    /// Get sandbox violation details
    /// - Returns: Dictionary of potential sandbox issues
    func getSandboxViolationDetails() -> [String: Any] {
        var details: [String: Any] = [:]

        details["isSandboxed"] = isSandboxed()
        details["hasNetworkAccess"] = hasNetworkAccess()
        details["codeSignatureValid"] = verifyCodeSignature()
        details["grantedEntitlements"] = getGrantedEntitlements()
        details["temporaryDirectory"] = getSandboxedTemporaryDirectory().path
        details["cacheDirectory"] = getSandboxedCacheDirectory()?.path ?? "N/A"
        details["applicationSupportDirectory"] = getSandboxedApplicationSupportDirectory()?.path ?? "N/A"

        return details
    }

    /// Private helper to extract entitlements from executable
    /// - Parameter path: Executable path
    /// - Returns: Array of entitlements
    private func getEntitlementsForProcess(_ path: String) -> [String] {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        task.arguments = ["-d", "--entitlements", "-", path]

        let pipe = Pipe()
        task.standardOutput = pipe

        do {
            try task.run()
            task.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let output = String(data: data, encoding: .utf8) else {
                return []
            }

            // Parse entitlements from output
            var entitlements: [String] = []
            for line in output.components(separatedBy: "\n") {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.starts(with: "com.apple.security") {
                    entitlements.append(trimmed)
                }
            }

            return entitlements
        } catch {
            return []
        }
    }
}
