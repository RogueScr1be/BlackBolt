import CryptoKit
import XCTest

@testable import BlackBoltOperator

final class APIIntegrationTests: XCTestCase {
    private var mockClient: MockHTTPClient!

    override func setUpWithError() throws {
        try super.setUpWithError()
        mockClient = MockHTTPClient()
    }

    override func tearDownWithError() throws {
        mockClient = nil
        try super.tearDownWithError()
    }

    func testAPIRequestSigningAddsSignatureHeaders() async throws {
        let validator = APIRequestValidator(secretKey: SymmetricKey(size: .bits256))
        var request = URLRequest(url: URL(string: "https://api.example.com/test")!)
        request.httpMethod = "POST"
        request.httpBody = Data("payload".utf8)

        let signedRequest = try await validator.signRequest(request)

        XCTAssertNotNil(signedRequest.value(forHTTPHeaderField: "X-Signature"))
        XCTAssertNotNil(signedRequest.value(forHTTPHeaderField: "X-Timestamp"))
        XCTAssertNotNil(signedRequest.value(forHTTPHeaderField: "X-Nonce"))
    }

    func testMockHTTPClientReturnsQueuedSuccessResponse() async throws {
        let url = URL(string: "https://api.example.com/test")!
        let payload = try JSONSerialization.data(withJSONObject: ["status": "success"])
        await mockClient.queueResponse(.success(payload), for: url)

        let (data, response) = try await mockClient.executeRequest(URLRequest(url: url))

        XCTAssertFalse(data.isEmpty)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    }

    func testMockHTTPClientReturnsQueuedErrorResponse() async throws {
        let url = URL(string: "https://api.example.com/not-found")!
        await mockClient.queueResponse(.notFound(), for: url)

        let (_, response) = try await mockClient.executeRequest(URLRequest(url: url))

        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 404)
    }

    func testSequentialRequestsConsumeQueuedResponsesInOrder() async throws {
        let url = URL(string: "https://api.example.com/data")!
        await mockClient.queueResponse(.serverError(), for: url)
        await mockClient.queueResponse(.success(), for: url)

        let request = URLRequest(url: url)
        let (_, firstResponse) = try await mockClient.executeRequest(request)
        let (_, secondResponse) = try await mockClient.executeRequest(request)

        XCTAssertEqual((firstResponse as? HTTPURLResponse)?.statusCode, 500)
        XCTAssertEqual((secondResponse as? HTTPURLResponse)?.statusCode, 200)
    }

    func testConcurrentRequestsRecordEachCall() async throws {
        let url = URL(string: "https://api.example.com/concurrent")!
        let client = mockClient!
        for _ in 0..<3 {
            await client.queueResponse(.success(), for: url)
        }

        let tasks: [Task<(Data, URLResponse), Error>] = (0..<3).map { _ in
            Task {
                try await client.executeRequest(URLRequest(url: url))
            }
        }

        let responses = try await Task.gather(tasks)
        let recordedRequests = await client.allRequests()

        XCTAssertEqual(responses.count, 3)
        XCTAssertEqual(recordedRequests.count, 3)
    }

    func testRecordedRequestCapturesMethodHeadersAndBody() async throws {
        let url = URL(string: "https://api.example.com/headers")!
        await mockClient.queueResponse(.success(), for: url)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("tenant-1", forHTTPHeaderField: "x-tenant-id")
        let body = try JSONSerialization.data(withJSONObject: ["key": "value"])
        request.httpBody = body

        _ = try await mockClient.executeRequest(request)
        let recorded = await mockClient.allRequests()

        XCTAssertEqual(recorded.count, 1)
        XCTAssertEqual(recorded[0].method, "POST")
        XCTAssertEqual(recorded[0].headers["x-tenant-id"], "tenant-1")
        XCTAssertEqual(recorded[0].body, body)
        XCTAssertEqual(recorded[0].path, "/headers")
    }

    @MainActor
    func testAPIConfigurationFlowBuildsContextFromRuntimeConfig() throws {
        let config = TestDataGenerator.validOperatorRuntimeConfig(
            apiBaseURL: "https://api.example.com",
            tenantId: "tenant-1",
            authHeader: "Bearer token",
            operatorKey: "operator-key"
        )

        let context = try config.apiContext()

        XCTAssertEqual(context.serverURL.absoluteString, "https://api.example.com")
        XCTAssertEqual(context.tenantId, "tenant-1")
        XCTAssertEqual(context.authorizationHeader, "Bearer token")
        XCTAssertEqual(context.operatorKey, "operator-key")
    }
}
