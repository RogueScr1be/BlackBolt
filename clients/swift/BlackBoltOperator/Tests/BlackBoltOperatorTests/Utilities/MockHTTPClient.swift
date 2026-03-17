import Foundation
import XCTest

@testable import BlackBoltOperator

// MARK: - Mock HTTP Response

struct MockHTTPResponse {
    let data: Data
    let statusCode: Int
    let headers: [String: String]
    let delay: TimeInterval

    init(
        data: Data = Data(),
        statusCode: Int = 200,
        headers: [String: String] = [:],
        delay: TimeInterval = 0.0
    ) {
        self.data = data
        self.statusCode = statusCode
        self.headers = headers
        self.delay = delay
    }

    static func success(
        _ data: Data = Data(),
        headers: [String: String] = [:]
    ) -> MockHTTPResponse {
        MockHTTPResponse(data: data, statusCode: 200, headers: headers)
    }

    static func success<T: Encodable>(
        json: T,
        headers: [String: String] = [:]
    ) throws -> MockHTTPResponse {
        let encoder = JSONEncoder()
        let data = try encoder.encode(json)
        return MockHTTPResponse(data: data, statusCode: 200, headers: headers)
    }

    static func created<T: Encodable>(
        json: T,
        headers: [String: String] = [:]
    ) throws -> MockHTTPResponse {
        let encoder = JSONEncoder()
        let data = try encoder.encode(json)
        return MockHTTPResponse(data: data, statusCode: 201, headers: headers)
    }

    static func accepted() -> MockHTTPResponse {
        MockHTTPResponse(statusCode: 202)
    }

    static func noContent() -> MockHTTPResponse {
        MockHTTPResponse(statusCode: 204)
    }

    static func badRequest(
        _ data: Data = Data()
    ) -> MockHTTPResponse {
        MockHTTPResponse(data: data, statusCode: 400)
    }

    static func unauthorized() -> MockHTTPResponse {
        MockHTTPResponse(statusCode: 401)
    }

    static func forbidden() -> MockHTTPResponse {
        MockHTTPResponse(statusCode: 403)
    }

    static func notFound(
        _ data: Data = Data()
    ) -> MockHTTPResponse {
        MockHTTPResponse(data: data, statusCode: 404)
    }

    static func conflict() -> MockHTTPResponse {
        MockHTTPResponse(statusCode: 409)
    }

    static func tooManyRequests() -> MockHTTPResponse {
        MockHTTPResponse(statusCode: 429)
    }

    static func serverError(
        _ data: Data = Data()
    ) -> MockHTTPResponse {
        MockHTTPResponse(data: data, statusCode: 500)
    }

    static func serviceUnavailable() -> MockHTTPResponse {
        MockHTTPResponse(statusCode: 503)
    }

    func withDelay(_ delay: TimeInterval) -> MockHTTPResponse {
        MockHTTPResponse(data: data, statusCode: statusCode, headers: headers, delay: delay)
    }
}

// MARK: - Mock HTTP Request Record

struct MockHTTPRequestRecord {
    let request: URLRequest
    let timestamp: Date
    let sequenceNumber: Int

    var method: String {
        request.httpMethod ?? "GET"
    }

    var path: String {
        request.url?.path ?? ""
    }

    var query: String {
        request.url?.query ?? ""
    }

    var headers: [String: String] {
        request.allHTTPHeaderFields ?? [:]
    }

    var body: Data {
        request.httpBody ?? Data()
    }

    func hasHeader(_ key: String) -> Bool {
        headers[key] != nil
    }

    func headerValue(_ key: String) -> String? {
        headers[key]
    }
}

// MARK: - Mock HTTP Client

actor MockHTTPClient {
    private var responseQueue: [URL: [MockHTTPResponse]] = [:]
    private var defaultResponses: [URL: MockHTTPResponse] = [:]
    private var requestRecords: [MockHTTPRequestRecord] = []
    private var networkErrors: [URL: Error] = [:]
    private var sequenceCounter: Int = 0
    private var requestValidator: ((URLRequest) throws -> Void)?
    private var shouldThrottleRequests: Bool = false
    private var throttleDelay: TimeInterval = 0.1

    // MARK: - Response Management

    /// Queue a response for a specific URL (FIFO)
    func queueResponse(_ response: MockHTTPResponse, for url: URL) {
        if responseQueue[url] == nil {
            responseQueue[url] = []
        }
        responseQueue[url]?.append(response)
    }

    /// Queue multiple responses for a URL
    func queueResponses(_ responses: [MockHTTPResponse], for url: URL) {
        for response in responses {
            queueResponse(response, for: url)
        }
    }

    /// Set a default response to be returned if queue is empty
    func setDefaultResponse(_ response: MockHTTPResponse, for url: URL) {
        defaultResponses[url] = response
    }

    /// Clear all queued responses for a URL
    func clearResponses(for url: URL) {
        responseQueue[url] = nil
    }

    /// Clear all queued and default responses
    func clearAllResponses() {
        responseQueue.removeAll()
        defaultResponses.removeAll()
    }

    // MARK: - Error Injection

    /// Inject a network error for a specific URL
    func injectError(_ error: Error, for url: URL) {
        networkErrors[url] = error
    }

    /// Clear injected errors for a URL
    func clearError(for url: URL) {
        networkErrors[url] = nil
    }

    /// Clear all injected errors
    func clearAllErrors() {
        networkErrors.removeAll()
    }

    // MARK: - Request Validation

    /// Set a custom request validator
    func setRequestValidator(_ validator: @escaping (URLRequest) throws -> Void) {
        self.requestValidator = validator
    }

    /// Clear the request validator
    func clearRequestValidator() {
        self.requestValidator = nil
    }

    // MARK: - Throttling

    /// Enable request throttling with specified delay
    func enableThrottling(_ delay: TimeInterval = 0.1) {
        shouldThrottleRequests = true
        throttleDelay = delay
    }

    /// Disable request throttling
    func disableThrottling() {
        shouldThrottleRequests = false
    }

    // MARK: - Request Execution

    /// Execute a request and return response
    func executeRequest(_ request: URLRequest) async throws -> (data: Data, response: URLResponse) {
        // Validate request if validator is set
        if let validator = requestValidator {
            try validator(request)
        }

        // Record request
        sequenceCounter += 1
        let record = MockHTTPRequestRecord(
            request: request,
            timestamp: Date(),
            sequenceNumber: sequenceCounter
        )
        requestRecords.append(record)

        // Apply throttling if enabled
        if shouldThrottleRequests {
            try await Task.sleep(nanoseconds: UInt64(throttleDelay * 1_000_000_000))
        }

        // Check for injected errors
        if let error = networkErrors[request.url ?? URL(string: "http://invalid")!] {
            throw error
        }

        // Get response
        guard let url = request.url else {
            throw MockHTTPClientError.invalidURL
        }

        let response = getNextResponse(for: url)
        
        // Apply response delay
        if response.delay > 0 {
            try await Task.sleep(nanoseconds: UInt64(response.delay * 1_000_000_000))
        }

        // Create HTTPURLResponse
        guard let httpResponse = HTTPURLResponse(
            url: url,
            statusCode: response.statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: response.headers
        ) else {
            throw MockHTTPClientError.responseCreationFailed
        }

        return (data: response.data, response: httpResponse)
    }

    // MARK: - Request History

    /// Get all recorded requests
    func allRequests() -> [MockHTTPRequestRecord] {
        requestRecords
    }

    /// Get requests matching a predicate
    func requests(matching predicate: (MockHTTPRequestRecord) -> Bool) -> [MockHTTPRequestRecord] {
        requestRecords.filter(predicate)
    }

    /// Get requests for a specific URL
    func requests(for url: URL) -> [MockHTTPRequestRecord] {
        requestRecords.filter { $0.request.url == url }
    }

    /// Get requests with specific method
    func requests(method: String) -> [MockHTTPRequestRecord] {
        requestRecords.filter { $0.method == method }
    }

    /// Get the last recorded request
    func lastRequest() -> MockHTTPRequestRecord? {
        requestRecords.last
    }

    /// Get request at specific sequence number
    func request(sequence: Int) -> MockHTTPRequestRecord? {
        requestRecords.first { $0.sequenceNumber == sequence }
    }

    /// Clear all request records
    func clearRequestHistory() {
        requestRecords.removeAll()
        sequenceCounter = 0
    }

    /// Assert request count
    func assertRequestCount(_ count: Int, file: StaticString = #filePath, line: UInt = #line) {
        let actualCount = requestRecords.count
        if actualCount != count {
            XCTFail("Expected \(count) requests, got \(actualCount)", file: file, line: line)
        }
    }

    /// Assert last request method
    func assertLastRequestMethod(_ method: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let last = lastRequest() else {
            XCTFail("No requests recorded", file: file, line: line)
            return
        }
        if last.method != method {
            XCTFail("Expected last request method \(method), got \(last.method)", file: file, line: line)
        }
    }

    /// Assert last request contains header
    func assertLastRequestHasHeader(_ key: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let last = lastRequest() else {
            XCTFail("No requests recorded", file: file, line: line)
            return
        }
        if !last.hasHeader(key) {
            XCTFail("Expected header \(key) not found in last request", file: file, line: line)
        }
    }

    // MARK: - Private Helpers

    private func getNextResponse(for url: URL) -> MockHTTPResponse {
        if let queued = responseQueue[url], !queued.isEmpty {
            responseQueue[url]?.removeFirst()
            return queued[0]
        }

        if let defaultResponse = defaultResponses[url] {
            return defaultResponse
        }

        // Return empty 200 response as fallback
        return MockHTTPResponse()
    }
}

// MARK: - Mock HTTP Client Error

enum MockHTTPClientError: Error, LocalizedError {
    case invalidURL
    case responseCreationFailed
    case noMockClient
    case customError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL provided"
        case .responseCreationFailed:
            return "Failed to create HTTP response"
        case .noMockClient:
            return "Mock client not configured"
        case .customError(let message):
            return message
        }
    }
}

// MARK: - Request/Response Builders for Common Patterns

extension MockHTTPClient {
    /// Queue a typical API success response
    func queueAPISuccess<T: Encodable>(
        for url: URL,
        data: T,
        statusCode: Int = 200
    ) async throws {
        let encoded = try JSONEncoder().encode(data)
        let response = MockHTTPResponse(
            data: encoded,
            statusCode: statusCode,
            headers: ["Content-Type": "application/json"]
        )
        queueResponse(response, for: url)
    }

    /// Queue a typical API error response
    func queueAPIError(
        for url: URL,
        message: String,
        statusCode: Int = 400
    ) async throws {
        let errorDict: [String: Any] = ["error": message]
        let encoded = try JSONSerialization.data(withJSONObject: errorDict)
        let response = MockHTTPResponse(
            data: encoded,
            statusCode: statusCode,
            headers: ["Content-Type": "application/json"]
        )
        queueResponse(response, for: url)
    }
}
