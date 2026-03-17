import XCTest
import Foundation
import CryptoKit

@testable import BlackBoltOperator

// MARK: - Test Assertions for Async Functions

func XCTAssertThrowsError<T>(
    _ expression: @autoclosure () async throws -> T,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line,
    _ errorHandler: (Error) -> Void = { _ in }
) async {
    do {
        _ = try await expression()
        XCTFail(message(), file: file, line: line)
    } catch {
        errorHandler(error)
    }
}

func XCTAssertNoThrowError<T>(
    _ expression: @autoclosure () async throws -> T,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) async throws -> T {
    do {
        return try await expression()
    } catch {
        XCTFail(message() + " - Error thrown: \(error)", file: file, line: line)
        throw error
    }
}

func XCTAssertEqualAsync<T: Equatable>(
    _ expression1: @autoclosure () async throws -> T,
    _ expression2: @autoclosure () async throws -> T,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) async throws {
    let value1 = try await expression1()
    let value2 = try await expression2()
    XCTAssertEqual(value1, value2, message(), file: file, line: line)
}

func XCTAssertTrueAsync(
    _ expression: @autoclosure () async throws -> Bool,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) async throws {
    let result = try await expression()
    XCTAssertTrue(result, message(), file: file, line: line)
}

func XCTAssertFalseAsync(
    _ expression: @autoclosure () async throws -> Bool,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) async throws {
    let result = try await expression()
    XCTAssertFalse(result, message(), file: file, line: line)
}

// MARK: - Test Data Generators

@MainActor
enum TestDataGenerator {
    // MARK: Configuration
    
    static func validOperatorRuntimeConfig(
        apiBaseURL: String = "https://api.example.com",
        tenantId: String = "test-tenant",
        authHeader: String = "Bearer test-token",
        operatorKey: String = "test-operator-key"
    ) -> OperatorRuntimeConfig {
        let defaults = UserDefaults(suiteName: "TestConfig-\(UUID().uuidString)")!
        let config = OperatorRuntimeConfig(defaults: defaults)
        config.apiBaseURL = apiBaseURL
        config.tenantId = tenantId
        config.authHeader = authHeader
        config.operatorKey = operatorKey
        return config
    }

    static func invalidOperatorRuntimeConfig() -> OperatorRuntimeConfig {
        let defaults = UserDefaults(suiteName: "TestConfig-Invalid-\(UUID().uuidString)")!
        let config = OperatorRuntimeConfig(defaults: defaults)
        config.apiBaseURL = ""
        config.tenantId = ""
        config.operatorKey = ""
        return config
    }

    static func minimalOperatorRuntimeConfig() -> OperatorRuntimeConfig {
        let defaults = UserDefaults(suiteName: "TestConfig-Minimal-\(UUID().uuidString)")!
        return OperatorRuntimeConfig(defaults: defaults)
    }

    // MARK: Error Types
    
    static func sampleOperatorAppError(
        code: String = "test_error",
        message: String = "Test error message",
        httpStatus: Int? = 400,
        path: String? = "/test"
    ) -> OperatorAppError {
        OperatorAppError(
            code: code,
            message: message,
            httpStatus: httpStatus,
            path: path
        )
    }

    static func networkError() -> OperatorAppError {
        OperatorAppError(
            code: "network_error",
            message: "Network request failed",
            httpStatus: nil,
            path: nil
        )
    }

    static func authenticationError() -> OperatorAppError {
        OperatorAppError(
            code: "auth_failed",
            message: "Authentication failed",
            httpStatus: 401,
            path: "/auth"
        )
    }

    static func authorizationError() -> OperatorAppError {
        OperatorAppError(
            code: "access_denied",
            message: "Access denied",
            httpStatus: 403,
            path: nil
        )
    }

    static func serverError(
        status: Int = 500,
        message: String = "Internal server error"
    ) -> OperatorAppError {
        OperatorAppError(
            code: "server_error",
            message: message,
            httpStatus: status,
            path: nil
        )
    }

    // MARK: Random Data Generators
    
    static func randomNonce(length: Int = 32) -> String {
        let characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return String((0..<length).map { _ in characters.randomElement()! })
    }

    static func randomString(length: Int = 16) -> String {
        let characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return String((0..<length).map { _ in characters.randomElement()! })
    }

    static func randomHexString(length: Int = 32) -> String {
        let characters = "0123456789abcdef"
        return String((0..<length).map { _ in characters.randomElement()! })
    }

    static func randomUUID() -> String {
        UUID().uuidString
    }

    static func randomEmail() -> String {
        "test-\(randomString(length: 8))@example.com"
    }

    static func randomBearerToken() -> String {
        "Bearer \(randomHexString(length: 64))"
    }

    static func randomJSONData(size: Int = 1024) -> Data {
        let json: [String: Any] = [
            "id": randomUUID(),
            "timestamp": Date().timeIntervalSince1970,
            "data": randomString(length: size)
        ]
        return try! JSONSerialization.data(withJSONObject: json)
    }

    // MARK: Crypto Data
    
    static func sha256Hash(of data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02hhx", $0) }.joined()
    }

    static func hmacSHA256(data: Data, key: Data) -> String {
        let signature = HMAC<SHA256>.authenticationCode(for: data, using: SymmetricKey(data: key))
        return Data(signature).map { String(format: "%02hhx", $0) }.joined()
    }
}

// MARK: - Async Test Case Extensions

extension XCTestCase {
    // MARK: Expectation Helpers

    @MainActor
    func waitForExpectation(
        _ expectation: XCTestExpectation,
        timeout: TimeInterval = 5.0
    ) {
        waitForExpectations(timeout: timeout)
    }

    func fulfilledExpectation(
        description: String = "Async operation completed"
    ) -> XCTestExpectation {
        expectation(description: description)
    }

    // MARK: Async Utility Methods
    
    func waitForCondition(
        timeout: TimeInterval = 5.0,
        pollInterval: TimeInterval = 0.1,
        _ condition: @escaping () -> Bool
    ) async throws {
        let startTime = Date()
        while Date().timeIntervalSince(startTime) < timeout {
            if condition() {
                return
            }
            try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
        }
        throw TestError.conditionNotMet
    }

    func executeWithTimeout<T: Sendable>(
        timeout: TimeInterval = 5.0,
        _ closure: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await closure()
            }
            
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw TestError.timeoutExceeded
            }
            
            if let result = try await group.next() {
                group.cancelAll()
                return result
            }
            throw TestError.timeoutExceeded
        }
    }

    // MARK: File System Helpers
    
    func createTemporaryFile(
        named: String = "test.tmp",
        content: String? = nil
    ) throws -> URL {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent(named)
        if let content = content {
            try content.write(to: fileURL, atomically: true, encoding: .utf8)
        } else {
            FileManager.default.createFile(atPath: fileURL.path, contents: nil, attributes: nil)
        }
        return fileURL
    }

    func cleanupTemporaryFile(_ url: URL) {
        try? FileManager.default.removeItem(at: url)
    }
}

// MARK: - Mock Request Builder

struct MockRequestBuilder {
    var url: URL = URL(string: "https://api.example.com/test")!
    var method: String = "GET"
    var headers: [String: String] = [:]
    var body: Data? = nil

    func build() -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        request.httpBody = body
        return request
    }

    mutating func withURL(_ url: URL) -> Self {
        self.url = url
        return self
    }

    mutating func withURL(_ urlString: String) -> Self {
        if let url = URL(string: urlString) {
            self.url = url
        }
        return self
    }

    mutating func withMethod(_ method: String) -> Self {
        self.method = method
        return self
    }

    mutating func withHeaders(_ headers: [String: String]) -> Self {
        self.headers = headers
        return self
    }

    mutating func withHeader(_ key: String, _ value: String) -> Self {
        self.headers[key] = value
        return self
    }

    mutating func withBody(_ body: Data) -> Self {
        self.body = body
        return self
    }

    mutating func withJSONBody(_ json: [String: Any]) throws -> Self {
        self.body = try JSONSerialization.data(withJSONObject: json)
        return self
    }

    mutating func withStringBody(_ string: String) -> Self {
        self.body = string.data(using: .utf8)
        return self
    }

    mutating func withContentType(_ type: String) -> Self {
        self.headers["Content-Type"] = type
        return self
    }

    mutating func withAuthorization(_ token: String) -> Self {
        self.headers["Authorization"] = token
        return self
    }
}

// MARK: - Mock Response Builder

struct MockResponseBuilder {
    var statusCode: Int = 200
    var headers: [String: String] = [:]
    var body: Data = Data()

    func build() -> HTTPURLResponse? {
        HTTPURLResponse(
            url: URL(string: "https://api.example.com")!,
            statusCode: statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        )
    }

    mutating func withStatusCode(_ code: Int) -> Self {
        self.statusCode = code
        return self
    }

    mutating func withHeaders(_ headers: [String: String]) -> Self {
        self.headers = headers
        return self
    }

    mutating func withHeader(_ key: String, _ value: String) -> Self {
        self.headers[key] = value
        return self
    }

    mutating func withBody(_ body: Data) -> Self {
        self.body = body
        return self
    }

    mutating func withJSONBody(_ json: [String: Any]) throws -> Self {
        self.body = try JSONSerialization.data(withJSONObject: json)
        return self
    }

    mutating func withStringBody(_ string: String) -> Self {
        self.body = string.data(using: .utf8) ?? Data()
        return self
    }

    mutating func withContentType(_ type: String) -> Self {
        self.headers["Content-Type"] = type
        return self
    }

    mutating func success(with json: [String: Any]) throws -> Self {
        self.statusCode = 200
        self.headers["Content-Type"] = "application/json"
        self.body = try JSONSerialization.data(withJSONObject: json)
        return self
    }

    mutating func created(with json: [String: Any]) throws -> Self {
        self.statusCode = 201
        self.headers["Content-Type"] = "application/json"
        self.body = try JSONSerialization.data(withJSONObject: json)
        return self
    }

    mutating func badRequest(with message: String) -> Self {
        self.statusCode = 400
        _ = try? self.withJSONBody(["error": message])
        return self
    }

    mutating func unauthorized() -> Self {
        self.statusCode = 401
        return self
    }

    mutating func forbidden() -> Self {
        self.statusCode = 403
        return self
    }

    mutating func notFound() -> Self {
        self.statusCode = 404
        return self
    }

    mutating func serverError() -> Self {
        self.statusCode = 500
        return self
    }
}

// MARK: - Test Lifecycle Management

struct TestCleanupTracker {
    private var cleanupBlocks: [() -> Void] = []

    mutating func addCleanup(_ block: @escaping () -> Void) {
        cleanupBlocks.append(block)
    }

    mutating func addAsyncCleanup(_ block: @escaping @Sendable () async -> Void) {
        cleanupBlocks.append {
            let semaphore = DispatchSemaphore(value: 0)
            Task.detached {
                await block()
                semaphore.signal()
            }
            semaphore.wait()
        }
    }

    func cleanup() {
        cleanupBlocks.forEach { $0() }
    }
}

// MARK: - Performance Measurement

struct PerformanceMeasurer {
    private let name: String
    private let startTime: Date
    private let expectedMaxDuration: TimeInterval?

    init(name: String, expectedMaxDuration: TimeInterval? = nil) {
        self.name = name
        self.startTime = Date()
        self.expectedMaxDuration = expectedMaxDuration
    }

    func measure() -> TimeInterval {
        return Date().timeIntervalSince(startTime)
    }

    func measureAndPrint() {
        let elapsed = measure()
        let formattedTime = String(format: "%.3f", elapsed)
        print("\(name) completed in \(formattedTime)s")
        
        if let maxDuration = expectedMaxDuration, elapsed > maxDuration {
            print("WARNING: \(name) exceeded expected max duration of \(maxDuration)s")
        }
    }

    func assertPerformance(maxDuration: TimeInterval, testCase: XCTestCase, file: StaticString = #filePath, line: UInt = #line) {
        let elapsed = measure()
        XCTAssertLessThanOrEqual(
            elapsed,
            maxDuration,
            "\(name) took \(elapsed)s, expected max \(maxDuration)s",
            file: file,
            line: line
        )
    }
}

extension XCTestCase {
    func measurePerformance<T>(
        name: String = "Operation",
        maxDuration: TimeInterval? = nil,
        _ closure: () throws -> T
    ) rethrows -> T {
        let measurer = PerformanceMeasurer(name: name, expectedMaxDuration: maxDuration)
        let result = try closure()
        if let max = maxDuration {
            measurer.assertPerformance(maxDuration: max, testCase: self)
        } else {
            measurer.measureAndPrint()
        }
        return result
    }

    func measureAsyncPerformance<T>(
        name: String = "Async Operation",
        maxDuration: TimeInterval? = nil,
        _ closure: () async throws -> T
    ) async rethrows -> T {
        let measurer = PerformanceMeasurer(name: name, expectedMaxDuration: maxDuration)
        let result = try await closure()
        if let max = maxDuration {
            measurer.assertPerformance(maxDuration: max, testCase: self)
        } else {
            measurer.measureAndPrint()
        }
        return result
    }
}

// MARK: - XCTestExpectation Extensions

extension XCTestExpectation {
    func fulfill(times: Int = 1) {
        for _ in 0..<times {
            self.fulfill()
        }
    }
}

extension Task where Failure == Error {
    static func gather(_ tasks: [Task<Success, Failure>]) async throws -> [Success] {
        var results: [Success] = []
        results.reserveCapacity(tasks.count)
        for task in tasks {
            results.append(try await task.value)
        }
        return results
    }
}

extension Task where Failure == Never {
    static func gather(_ tasks: [Task<Success, Failure>]) async -> [Success] {
        var results: [Success] = []
        results.reserveCapacity(tasks.count)
        for task in tasks {
            results.append(await task.value)
        }
        return results
    }
}

// MARK: - Test Case Base Class

class BaseOperatorTestCase: XCTestCase {
    var cleanupTracker = TestCleanupTracker()

    override func tearDown() {
        cleanupTracker.cleanup()
        super.tearDown()
    }
}

// MARK: - Test Error Types

enum TestError: Error, LocalizedError {
    case conditionNotMet
    case timeoutExceeded
    case invalidTestData
    case mockSetupFailed(String)

    var errorDescription: String? {
        switch self {
        case .conditionNotMet:
            return "Test condition was not met within timeout"
        case .timeoutExceeded:
            return "Operation exceeded maximum timeout"
        case .invalidTestData:
            return "Test data is invalid or incomplete"
        case .mockSetupFailed(let reason):
            return "Mock setup failed: \(reason)"
        }
    }
}

// MARK: - Data Assertion Helpers

struct DataAssertions {
    static func assertJSONDecodable<T: Decodable>(
        data: Data,
        as type: T.Type,
        testCase: XCTestCase,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> T {
        do {
            let decoder = JSONDecoder()
            return try decoder.decode(type, from: data)
        } catch {
            XCTFail("Failed to decode JSON data: \(error)", file: file, line: line)
            throw error
        }
    }

    static func assertJSONValid(
        data: Data,
        testCase: XCTestCase,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        do {
            _ = try JSONSerialization.jsonObject(with: data, options: [])
        } catch {
            XCTFail("Invalid JSON data: \(error)", file: file, line: line)
        }
    }
}
