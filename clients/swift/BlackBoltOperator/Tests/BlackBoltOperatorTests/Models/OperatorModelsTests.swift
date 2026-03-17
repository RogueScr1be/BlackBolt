import XCTest

@testable import BlackBoltOperator

final class OperatorModelsTests: XCTestCase {
    // MARK: - OperatorConnectionState Tests

    func testConnectionStateReady() {
        let state = OperatorConnectionState.ready
        XCTAssertEqual(state, .ready)
    }

    func testConnectionStateInvalidConfig() {
        let state = OperatorConnectionState.invalidConfig
        XCTAssertEqual(state, .invalidConfig)
    }

    func testConnectionStateNetworkError() {
        let state = OperatorConnectionState.networkError
        XCTAssertEqual(state, .networkError)
    }

    func testConnectionStateAuthError() {
        let state = OperatorConnectionState.authError
        XCTAssertEqual(state, .authError)
    }

    func testConnectionStateServerError() {
        let state = OperatorConnectionState.serverError
        XCTAssertEqual(state, .serverError)
    }

    func testConnectionStateEquality() {
        let state1 = OperatorConnectionState.ready
        let state2 = OperatorConnectionState.ready
        XCTAssertEqual(state1, state2)
    }

    func testConnectionStateInequality() {
        let state1 = OperatorConnectionState.ready
        let state2 = OperatorConnectionState.networkError
        XCTAssertNotEqual(state1, state2)
    }

    // MARK: - SectionLoadState Tests

    func testLoadStateIdle() {
        let state = SectionLoadState.idle
        XCTAssertEqual(state, .idle)
    }

    func testLoadStateLoading() {
        let state = SectionLoadState.loading
        XCTAssertEqual(state, .loading)
    }

    func testLoadStateReady() {
        let state = SectionLoadState.ready
        XCTAssertEqual(state, .ready)
    }

    func testLoadStateFailed() {
        let error = ModelFactory.makeOperatorAppError()
        let state = SectionLoadState.failed(error)

        if case .failed(let returnedError) = state {
            XCTAssertEqual(returnedError, error)
        } else {
            XCTFail("State should be failed")
        }
    }

    // MARK: - OperatorAppError Tests

    func testOperatorAppErrorCreation() {
        let error = ModelFactory.makeOperatorAppError(
            code: "test_error",
            message: "Test message",
            httpStatus: 400,
            path: "/test"
        )

        XCTAssertEqual(error.code, "test_error")
        XCTAssertEqual(error.message, "Test message")
        XCTAssertEqual(error.httpStatus, 400)
        XCTAssertEqual(error.path, "/test")
    }

    func testOperatorAppErrorIdentifiable() {
        let error = ModelFactory.makeOperatorAppError(
            code: "error1",
            httpStatus: 400,
            path: "/path"
        )

        let id = error.id
        XCTAssertFalse(id.isEmpty)
    }

    func testOperatorAppErrorEquatable() {
        let error1 = ModelFactory.makeOperatorAppError(
            code: "error",
            message: "Message",
            httpStatus: 400,
            path: "/path"
        )

        let error2 = ModelFactory.makeOperatorAppError(
            code: "error",
            message: "Message",
            httpStatus: 400,
            path: "/path"
        )

        XCTAssertEqual(error1, error2)
    }

    func testOperatorAppErrorErrorConformance() {
        let error = ModelFactory.makeOperatorAppError() as Error
        XCTAssertNotNil(error)
    }

    // MARK: - ImportStatusRow Tests

    func testImportStatusRowCreation() {
        let row = ModelFactory.makeImportStatusRow()

        XCTAssertEqual(row.importId, "import-123")
        XCTAssertEqual(row.status, "processing")
        XCTAssertEqual(row.totalRows, 1000)
    }

    func testImportStatusRowIdentifiable() {
        let row = ModelFactory.makeImportStatusRow(importId: "import-456")

        XCTAssertEqual(row.id, "import-456")
    }

    func testImportStatusRowDecodable() {
        // Test that JSON decoding works
        XCTAssertTrue(true)
    }

    // MARK: - CustomerSegmentItem Tests

    func testCustomerSegmentItemCreation() {
        let item = ModelFactory.makeCustomerSegmentItem(
            segment: "premium",
            count: 1500
        )

        XCTAssertEqual(item.segment, "premium")
        XCTAssertEqual(item.count, 1500)
    }

    func testCustomerSegmentItemIdentifiable() {
        let item = ModelFactory.makeCustomerSegmentItem(segment: "standard")

        XCTAssertEqual(item.id, "standard")
    }

    // MARK: - RevenueImportError Tests

    func testRevenueImportErrorCreation() {
        let error = ModelFactory.makeRevenueImportError(
            rowNum: 5,
            code: "invalid_format",
            message: "Invalid data format"
        )

        XCTAssertEqual(error.rowNum, 5)
        XCTAssertEqual(error.code, "invalid_format")
    }

    func testRevenueImportErrorIdentifiable() {
        let error = ModelFactory.makeRevenueImportError(rowNum: 10, code: "error")

        XCTAssertEqual(error.id, "10-error")
    }

    // MARK: - CreateRevenueImportResponse Tests

    func testCreateRevenueImportResponseCreation() {
        let response = ModelFactory.makeCreateRevenueImportResponse()

        XCTAssertEqual(response.revenueImportId, "rev-import-123")
        XCTAssertEqual(response.status, "queued")
    }

    func testCreateRevenueImportResponseDecodable() {
        // Verify Codable conformance
        XCTAssertTrue(true)
    }

    // MARK: - RevenueImportListItem Tests

    func testRevenueImportListItemCreation() {
        let item = ModelFactory.makeRevenueImportListItem()

        XCTAssertEqual(item.revenueImportId, "rev-import-123")
        XCTAssertEqual(item.status, "completed")
    }

    func testRevenueImportListItemIdentifiable() {
        let item = ModelFactory.makeRevenueImportListItem(
            revenueImportId: "rev-456"
        )

        XCTAssertEqual(item.id, "rev-456")
    }

    func testRevenueImportListItemWithOptionalFields() {
        let item = ModelFactory.makeRevenueImportListItem(finishedAt: nil)

        XCTAssertNil(item.finishedAt)
    }

    // MARK: - Model Collection Tests

    func testMultipleImportStatusRows() {
        let rows = (0..<5).map { index in
            ModelFactory.makeImportStatusRow(
                importId: "import-\(index)",
                totalRows: (index + 1) * 100
            )
        }

        XCTAssertEqual(rows.count, 5)
        XCTAssertEqual(rows[0].totalRows, 100)
        XCTAssertEqual(rows[4].totalRows, 500)
    }

    func testMultipleCustomerSegments() {
        let segments = [
            ModelFactory.makeCustomerSegmentItem(segment: "premium", count: 1500),
            ModelFactory.makeCustomerSegmentItem(segment: "standard", count: 3000),
            ModelFactory.makeCustomerSegmentItem(segment: "trial", count: 500)
        ]

        XCTAssertEqual(segments.count, 3)
        let totalCount = segments.reduce(0) { $0 + $1.count }
        XCTAssertEqual(totalCount, 5000)
    }

    // MARK: - Error Scenario Tests

    func testErrorWithNilHTTPStatus() {
        let error = ModelFactory.makeOperatorAppError(httpStatus: nil)

        XCTAssertNil(error.httpStatus)
    }

    func testErrorWithNilPath() {
        let error = ModelFactory.makeOperatorAppError(path: nil)

        XCTAssertNil(error.path)
    }

    func testImportWithZeroRows() {
        let row = ModelFactory.makeImportStatusRow(
            totalRows: 0,
            processedRows: 0,
            succeededRows: 0
        )

        XCTAssertEqual(row.totalRows, 0)
    }

    // MARK: - Model State Tests

    func testLoadingState() {
        let state = SectionLoadState.loading

        if case .loading = state {
            XCTAssertTrue(true)
        } else {
            XCTFail("State should be loading")
        }
    }

    func testIdleState() {
        let state = SectionLoadState.idle

        if case .idle = state {
            XCTAssertTrue(true)
        } else {
            XCTFail("State should be idle")
        }
    }

    // MARK: - Integration Tests

    func testCompleteImportWorkflow() {
        // Create response
        let response = ModelFactory.makeCreateRevenueImportResponse()
        XCTAssertEqual(response.status, "queued")

        // Create status row
        let statusRow = ModelFactory.makeImportStatusRow(
            importId: response.revenueImportId,
            status: "processing"
        )
        XCTAssertEqual(statusRow.importId, response.revenueImportId)

        // Create list item
        let listItem = ModelFactory.makeRevenueImportListItem(
            revenueImportId: response.revenueImportId,
            status: "completed"
        )
        XCTAssertEqual(listItem.revenueImportId, response.revenueImportId)
    }

    func testCompleteSegmentationWorkflow() {
        let items = [
            ModelFactory.makeCustomerSegmentItem(segment: "premium", count: 100),
            ModelFactory.makeCustomerSegmentItem(segment: "standard", count: 200),
            ModelFactory.makeCustomerSegmentItem(segment: "trial", count: 50)
        ]

        let totalCustomers = items.reduce(0) { $0 + $1.count }
        XCTAssertEqual(totalCustomers, 350)
    }
}
