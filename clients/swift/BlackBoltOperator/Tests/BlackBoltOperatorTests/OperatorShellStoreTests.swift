import BlackBoltAPI
import XCTest

@testable import BlackBoltOperator

@MainActor
final class OperatorShellStoreTests: XCTestCase {
    func testHasRequiredSettingsReflectsRuntimeFields() {
        let defaults = UserDefaults(suiteName: "BlackBoltOperatorTests-\(UUID().uuidString)")!
        let runtime = OperatorRuntimeConfig(defaults: defaults)
        let store = OperatorShellStore(apiService: MockOperatorAPIService())

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
        let store = OperatorShellStore(apiService: MockOperatorAPIService())

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

    func testRefreshUsesFacadeAndPreservesSuccessfulSectionsDuringPartialFailure() async {
        let runtime = ModelFactory.makeOperatorRuntimeConfig(
            apiBaseURL: "https://api.example.com",
            tenantId: "tenant-1",
            authHeader: "Bearer token",
            operatorKey: "operator-key"
        )
        let alertsError = OperatorAppError(
            code: "server_error",
            message: "alerts failed",
            httpStatus: 500,
            path: "/v1/tenants/tenant-1/alerts"
        )
        let apiService = MockOperatorAPIService(
            dashboardSummaryHandler: { _ in
                DashboardSummaryResponse(
                    tenantId: "tenant-1",
                    kpis: OperatorKPI(
                        revenueMonth: 250000,
                        attributedBookingsMonth: 12,
                        new5starReviewsMonth: 7,
                        emailConversionRate: 0.24,
                        portfolioHealthScore: 91,
                        actionRequiredCount: 2
                    ),
                    widgets: DashboardWidgets(
                        openAlerts: 2,
                        eventsLast24h: 6,
                        lastUpdatedAt: "2026-03-15T12:00:00Z"
                    )
                )
            },
            alertsHandler: { _, _ in throw alertsError },
            eventsHandler: { _ in
                OperatorEventsResponse(items: [
                    OperatorActivityEvent(
                        eventType: "booking_attributed",
                        tenantId: "tenant-1",
                        summary: "Attributed booking",
                        amountCents: 5000,
                        createdAt: "2026-03-15T12:05:00Z"
                    )
                ], nextCursor: nil)
            }
        )
        let store = OperatorShellStore(apiService: apiService)

        await store.refresh(runtime: runtime)

        XCTAssertTrue(apiService.dashboardSummaryCalled)
        XCTAssertTrue(apiService.alertsCalled)
        XCTAssertTrue(apiService.eventsCalled)
        XCTAssertEqual(store.dashboardState, .ready)
        XCTAssertEqual(store.eventsState, .ready)
        XCTAssertEqual(store.alertsState, .failed(alertsError))
        XCTAssertEqual(store.dashboard?.tenantId, "tenant-1")
        XCTAssertEqual(store.events.count, 1)
        XCTAssertEqual(store.errorMessage, "Some sections failed to refresh. Check tab-level errors and retry.")
        XCTAssertEqual(store.connectionState, .ready)
    }

    func testLoadMonthlyReportUpdatesSuccessState() async {
        let runtime = ModelFactory.makeOperatorRuntimeConfig(
            apiBaseURL: "https://api.example.com",
            tenantId: "tenant-1",
            authHeader: "Bearer token",
            operatorKey: "operator-key"
        )
        let report = MonthlyReportPayload(
            tenantId: "tenant-1",
            month: "2026-03",
            generatedAt: "2026-03-15T12:00:00Z",
            metrics: MonthlyReportMetrics(
                new5starReviews: 4,
                reactivationEmailsSent: 11,
                openCount: 30,
                clickCount: 9,
                openRate: 0.5,
                clickRate: 0.15,
                estimatedBookingsDriven: 3,
                estimatedRevenueImpactCents: 120000
            ),
            totals: MonthlyReportTotals(
                revenueCents: 450000,
                attributedCents: 180000,
                bookingsCount: 9,
                sentCount: 45,
                clickCount: 9,
                runCount: 2,
                runMessagesSent: 30,
                runMessagesFailed: 1,
                runMessagesQueued: 14
            ),
            estimates: MonthlyReportEstimates(
                conservativeBookings: 2,
                baseBookings: 3,
                aggressiveBookings: 5
            ),
            praisedBenefits: [MonthlyReportBenefit(benefit: "friendly staff", mentions: 4)],
            narrative: "Momentum is healthy."
        )
        let apiService = MockOperatorAPIService(
            monthlyReportHandler: { _, _, _ in report }
        )
        let store = OperatorShellStore(apiService: apiService)

        await store.loadMonthlyReport(runtime: runtime, month: "2026-03")

        XCTAssertTrue(apiService.monthlyReportCalled)
        XCTAssertEqual(store.reportsState, .ready)
        XCTAssertEqual(store.report?.month, "2026-03")
        XCTAssertNil(store.lastError)
    }

    func testContentStateMapsEmptyLoadingReadyDegradedAndFailed() {
        let store = OperatorShellStore(apiService: MockOperatorAPIService())
        let error = OperatorAppError(
            code: "server_error",
            message: "section failed",
            httpStatus: 500,
            path: "/v1/tenants/tenant-1/dashboard/summary"
        )

        XCTAssertEqual(store.contentState(for: .idle, hasContent: false), .empty)
        XCTAssertEqual(store.contentState(for: .loading, hasContent: false), .loading)
        XCTAssertEqual(store.contentState(for: .ready, hasContent: true), .ready)
        XCTAssertEqual(store.contentState(for: .failed(error), hasContent: true), .degraded(error))
        XCTAssertEqual(store.contentState(for: .failed(error), hasContent: false), .failed(error))
    }

    func testRefreshMarksTenantSectionDegradedWhenMetricsFailButRosterRemains() async {
        let runtime = ModelFactory.makeOperatorRuntimeConfig(
            apiBaseURL: "https://api.example.com",
            tenantId: "tenant-1",
            authHeader: "Bearer token",
            operatorKey: "operator-key"
        )
        let metricsError = OperatorAppError(
            code: "server_error",
            message: "metrics unavailable",
            httpStatus: 503,
            path: "/v1/tenants/tenant-1/metrics"
        )
        let apiService = MockOperatorAPIService(
            tenantMetricsHandler: { _, _, _ in throw metricsError }
        )
        let store = OperatorShellStore(apiService: apiService)

        await store.refresh(runtime: runtime)

        XCTAssertFalse(store.tenants.isEmpty)
        XCTAssertNotNil(store.tenantDetail)
        XCTAssertEqual(store.tenantsState, .failed(metricsError))
        XCTAssertEqual(store.contentState(for: store.tenantsState, hasContent: !store.tenants.isEmpty), .degraded(metricsError))
        XCTAssertEqual(store.contentState(for: store.tenantsState, hasContent: store.tenantMetrics != nil), .failed(metricsError))
    }

    func testReloadReviewQueueReturnsEmptyReadyState() async {
        let runtime = ModelFactory.makeOperatorRuntimeConfig(
            apiBaseURL: "https://api.example.com",
            tenantId: "tenant-1",
            authHeader: "Bearer token",
            operatorKey: "operator-key"
        )
        let store = OperatorShellStore(apiService: MockOperatorAPIService())

        await store.reloadReviewQueue(runtime: runtime)

        XCTAssertEqual(store.reviewQueueState, .ready)
        XCTAssertEqual(store.contentState(for: store.reviewQueueState, hasContent: !store.reviewQueue.isEmpty), .empty)
    }

    func testLoadApprovalDetailFailureProducesHardFailureWithoutSelection() async {
        let runtime = ModelFactory.makeOperatorRuntimeConfig(
            apiBaseURL: "https://api.example.com",
            tenantId: "tenant-1",
            authHeader: "Bearer token",
            operatorKey: "operator-key"
        )
        let approvalError = OperatorAppError(
            code: "not_found",
            message: "approval missing",
            httpStatus: 404,
            path: "/v1/operator/approvals/approval-1"
        )
        let apiService = MockOperatorAPIService(
            approvalDetailHandler: { _, _ in throw approvalError }
        )
        let store = OperatorShellStore(apiService: apiService)

        await store.loadApprovalDetail(runtime: runtime, approvalId: "approval-1")

        XCTAssertNil(store.selectedApproval)
        XCTAssertEqual(store.approvalsState, .failed(approvalError))
        XCTAssertEqual(store.contentState(for: store.approvalsState, hasContent: store.selectedApproval != nil), .failed(approvalError))
    }

    func testExecuteInterventionUsesFacadeAndSetsSuccessMessage() async {
        let runtime = ModelFactory.makeOperatorRuntimeConfig(
            apiBaseURL: "https://api.example.com",
            tenantId: "tenant-1",
            authHeader: "Bearer token",
            operatorKey: "operator-key"
        )
        let apiService = MockOperatorAPIService()
        let store = OperatorShellStore(apiService: apiService)

        await store.executeIntervention(runtime: runtime, capability: "ack-alert", alertID: "alert-1")

        XCTAssertTrue(apiService.ackAlertCalled)
        XCTAssertEqual(apiService.lastAckAlertID, "alert-1")
        XCTAssertEqual(store.interventionStatusMessage, "Intervention succeeded (ack-alert).")
    }

    func testSetCampaignRunPausedDelegatesToFacade() async {
        let runtime = ModelFactory.makeOperatorRuntimeConfig(
            apiBaseURL: "https://api.example.com",
            tenantId: "tenant-1",
            authHeader: "Bearer token",
            operatorKey: "operator-key"
        )
        let apiService = MockOperatorAPIService()
        let store = OperatorShellStore(apiService: apiService)

        await store.setCampaignRunPaused(runtime: runtime, runId: "run-1", paused: true)

        XCTAssertTrue(apiService.setCampaignRunPausedCalled)
        XCTAssertEqual(apiService.lastPausedRunID, "run-1")
        XCTAssertEqual(apiService.lastPausedValue, true)
    }

    func testLoadMonthlyReportFailureProducesHardFailureWithoutExistingPayload() async {
        let runtime = ModelFactory.makeOperatorRuntimeConfig(
            apiBaseURL: "https://api.example.com",
            tenantId: "tenant-1",
            authHeader: "Bearer token",
            operatorKey: "operator-key"
        )
        let reportError = OperatorAppError(
            code: "server_error",
            message: "report unavailable",
            httpStatus: 500,
            path: "/v1/tenants/tenant-1/reports/monthly"
        )
        let apiService = MockOperatorAPIService(
            monthlyReportHandler: { _, _, _ in throw reportError }
        )
        let store = OperatorShellStore(apiService: apiService)

        await store.loadMonthlyReport(runtime: runtime, month: "2026-03")

        XCTAssertNil(store.report)
        XCTAssertEqual(store.reportsState, .failed(reportError))
        XCTAssertEqual(store.contentState(for: store.reportsState, hasContent: store.report != nil), .failed(reportError))
    }
}

private final class MockOperatorAPIService: OperatorAPIServicing, @unchecked Sendable {
    var dashboardSummaryCalled = false
    var alertsCalled = false
    var eventsCalled = false
    var monthlyReportCalled = false
    var ackAlertCalled = false
    var lastAckAlertID: String?
    var setCampaignRunPausedCalled = false
    var lastPausedRunID: String?
    var lastPausedValue: Bool?

    var dashboardSummaryHandler: ((OperatorAPIContext) async throws -> DashboardSummaryResponse)?
    var alertsHandler: ((OperatorAPIContext, String) async throws -> OperatorAlertsResponse)?
    var eventsHandler: ((OperatorAPIContext) async throws -> OperatorEventsResponse)?
    var monthlyReportHandler: ((OperatorAPIContext, String, String) async throws -> MonthlyReportPayload)?
    var tenantDetailHandler: ((OperatorAPIContext, String) async throws -> OperatorTenantDetail)?
    var tenantMetricsHandler: ((OperatorAPIContext, String, String) async throws -> OperatorTenantMetricsResponse)?
    var approvalDetailHandler: ((OperatorAPIContext, String) async throws -> OperatorApprovalDetail)?

    init(
        dashboardSummaryHandler: ((OperatorAPIContext) async throws -> DashboardSummaryResponse)? = nil,
        alertsHandler: ((OperatorAPIContext, String) async throws -> OperatorAlertsResponse)? = nil,
        eventsHandler: ((OperatorAPIContext) async throws -> OperatorEventsResponse)? = nil,
        monthlyReportHandler: ((OperatorAPIContext, String, String) async throws -> MonthlyReportPayload)? = nil,
        tenantDetailHandler: ((OperatorAPIContext, String) async throws -> OperatorTenantDetail)? = nil,
        tenantMetricsHandler: ((OperatorAPIContext, String, String) async throws -> OperatorTenantMetricsResponse)? = nil,
        approvalDetailHandler: ((OperatorAPIContext, String) async throws -> OperatorApprovalDetail)? = nil
    ) {
        self.dashboardSummaryHandler = dashboardSummaryHandler
        self.alertsHandler = alertsHandler
        self.eventsHandler = eventsHandler
        self.monthlyReportHandler = monthlyReportHandler
        self.tenantDetailHandler = tenantDetailHandler
        self.tenantMetricsHandler = tenantMetricsHandler
        self.approvalDetailHandler = approvalDetailHandler
    }

    func dashboardSummary(context: OperatorAPIContext) async throws -> DashboardSummaryResponse {
        dashboardSummaryCalled = true
        if let dashboardSummaryHandler {
            return try await dashboardSummaryHandler(context)
        }
        return DashboardSummaryResponse(
            tenantId: context.tenantId,
            kpis: OperatorKPI(
                revenueMonth: 0,
                attributedBookingsMonth: 0,
                new5starReviewsMonth: 0,
                emailConversionRate: 0,
                portfolioHealthScore: 0,
                actionRequiredCount: 0
            ),
            widgets: DashboardWidgets(openAlerts: 0, eventsLast24h: 0, lastUpdatedAt: "2026-03-15T00:00:00Z")
        )
    }

    func alerts(context: OperatorAPIContext, state: String) async throws -> OperatorAlertsResponse {
        alertsCalled = true
        if let alertsHandler {
            return try await alertsHandler(context, state)
        }
        return OperatorAlertsResponse(items: [])
    }

    func events(context: OperatorAPIContext) async throws -> OperatorEventsResponse {
        eventsCalled = true
        if let eventsHandler {
            return try await eventsHandler(context)
        }
        return OperatorEventsResponse(items: [], nextCursor: nil)
    }

    func tenants(context: OperatorAPIContext) async throws -> OperatorTenantListResponse {
        OperatorTenantListResponse(items: [
            OperatorTenantSummary(id: context.tenantId, slug: "tenant", name: "Tenant", healthScore: 88, actionRequiredCount: 1)
        ])
    }

    func tenantDetail(context: OperatorAPIContext, tenantId: String) async throws -> OperatorTenantDetail {
        if let tenantDetailHandler {
            return try await tenantDetailHandler(context, tenantId)
        }
        return OperatorTenantDetail(
            id: tenantId,
            slug: "tenant",
            name: "Tenant",
            healthScore: 88,
            actionRequiredCount: 1,
            createdAt: "2026-03-15T00:00:00Z"
        )
    }

    func tenantMetrics(context: OperatorAPIContext, tenantId: String, range: String) async throws -> OperatorTenantMetricsResponse {
        if let tenantMetricsHandler {
            return try await tenantMetricsHandler(context, tenantId, range)
        }
        return OperatorTenantMetricsResponse(
            tenantId: tenantId,
            range: range,
            revenueSeries: [],
            bookingSeries: [],
            reviewSeries: []
        )
    }

    func campaignRuns(context: OperatorAPIContext, tenantId: String, limit: Int) async throws -> CampaignRunsResponse {
        CampaignRunsResponse(items: [])
    }

    func reviewQueue(context: OperatorAPIContext, state: String, tenantId: String?) async throws -> OperatorReviewQueueResponse {
        OperatorReviewQueueResponse(items: [])
    }

    func approvals(context: OperatorAPIContext, state: String, tenantId: String?) async throws -> OperatorApprovalListResponse {
        OperatorApprovalListResponse(items: [])
    }

    func approvalDetail(context: OperatorAPIContext, approvalId: String) async throws -> OperatorApprovalDetail {
        if let approvalDetailHandler {
            return try await approvalDetailHandler(context, approvalId)
        }
        return OperatorApprovalDetail(
            id: approvalId,
            tenantId: context.tenantId,
            campaignRunId: nil,
            triggerReviewId: nil,
            state: "awaiting_approval",
            requiredRole: "operator",
            draft: OperatorApprovalDraft(subject: "Subject", body: "Body", segment: "last_seen_90_365", sendWindowAt: nil),
            counts: OperatorApprovalCounts(queued: 1, paused: 0, sent: 0, failed: 0, total: 1),
            createdAt: "2026-03-15T00:00:00Z",
            updatedAt: "2026-03-15T00:00:00Z",
            approvedAt: nil,
            rejectedAt: nil
        )
    }

    func patchApprovalDraft(
        context: OperatorAPIContext,
        approvalId: String,
        subject: String,
        body: String,
        segment: String,
        sendWindowAt: String
    ) async throws -> OperatorApprovalDetail {
        try await approvalDetail(context: context, approvalId: approvalId)
    }

    func approveApproval(context: OperatorAPIContext, approvalId: String) async throws {}
    func rejectApproval(context: OperatorAPIContext, approvalId: String, reason: String) async throws {}

    func customerSegments(context: OperatorAPIContext, tenantId: String) async throws -> CustomerSegmentSummaryResponse {
        CustomerSegmentSummaryResponse(tenantId: tenantId, total: 0, items: [])
    }

    func revenueImports(context: OperatorAPIContext, tenantId: String, limit: Int) async throws -> RevenueImportListResponse {
        RevenueImportListResponse(items: [])
    }

    func revenueImportStatus(context: OperatorAPIContext, revenueImportId: String) async throws -> RevenueImportStatusResponse {
        RevenueImportStatusResponse(
            revenueImportId: revenueImportId,
            tenantId: "tenant-1",
            status: "succeeded",
            totalRows: 0,
            processedRows: 0,
            succeededRows: 0,
            failedRows: 0,
            duplicateRows: 0,
            errors: [],
            createdAt: "2026-03-15T00:00:00Z",
            finishedAt: nil
        )
    }

    func createRevenueImport(context: OperatorAPIContext, tenantId: String, fileURL: URL) async throws -> CreateRevenueImportResponse {
        CreateRevenueImportResponse(revenueImportId: "import-1", status: "queued")
    }

    func setCampaignRunPaused(context: OperatorAPIContext, tenantId: String, runId: String, paused: Bool) async throws {
        setCampaignRunPausedCalled = true
        lastPausedRunID = runId
        lastPausedValue = paused
    }

    func bootstrapStatus(context: OperatorAPIContext) async throws -> BootstrapStatusResponse {
        BootstrapStatusResponse(
            tenantId: context.tenantId,
            overallReady: true,
            checks: BootstrapStatusChecks(
                operatorAuth: BootstrapStatusCheck(required: true, ready: true, mode: nil, message: "ok"),
                gbpIntegration: BootstrapStatusCheck(required: true, ready: true, mode: nil, message: "ok"),
                postmarkWebhook: BootstrapStatusCheck(required: true, ready: true, mode: nil, message: "ok"),
                reviewScheduler: BootstrapStatusCheck(required: true, ready: true, mode: nil, message: "ok"),
                sendMode: BootstrapStatusCheck(required: true, ready: true, mode: nil, message: "ok")
            ),
            missing: []
        )
    }

    func monthlyReport(context: OperatorAPIContext, tenantId: String, month: String) async throws -> MonthlyReportPayload {
        monthlyReportCalled = true
        if let monthlyReportHandler {
            return try await monthlyReportHandler(context, tenantId, month)
        }
        return MonthlyReportPayload(
            tenantId: tenantId,
            month: month,
            generatedAt: "2026-03-15T00:00:00Z",
            metrics: MonthlyReportMetrics(
                new5starReviews: 0,
                reactivationEmailsSent: 0,
                openCount: 0,
                clickCount: 0,
                openRate: 0,
                clickRate: 0,
                estimatedBookingsDriven: 0,
                estimatedRevenueImpactCents: 0
            ),
            totals: MonthlyReportTotals(
                revenueCents: 0,
                attributedCents: 0,
                bookingsCount: 0,
                sentCount: 0,
                clickCount: 0,
                runCount: 0,
                runMessagesSent: 0,
                runMessagesFailed: 0,
                runMessagesQueued: 0
            ),
            estimates: MonthlyReportEstimates(conservativeBookings: 0, baseBookings: 0, aggressiveBookings: 0),
            praisedBenefits: [],
            narrative: ""
        )
    }

    func monthlyReportPDF(context: OperatorAPIContext, tenantId: String, month: String) async throws -> Data { Data() }

    func operatorSmoke(context: OperatorAPIContext, tenantId: String) async throws -> OperatorSmokeResponse {
        OperatorSmokeResponse(tenantId: tenantId, overallPassed: true, checks: [])
    }

    func retryGbpIngestion(context: OperatorAPIContext, tenantId: String) async throws {}
    func resumePostmarkIntervention(context: OperatorAPIContext, tenantId: String) async throws {}
    func ackAlert(context: OperatorAPIContext, tenantId: String, alertId: String) async throws {
        ackAlertCalled = true
        lastAckAlertID = alertId
    }

    func commandCenter(context: OperatorAPIContext, tenantId: String) async throws -> CommandCenterPayload {
        CommandCenterPayload(
            tenantId: tenantId,
            kpis: OperatorKPI(
                revenueMonth: 0,
                attributedBookingsMonth: 0,
                new5starReviewsMonth: 0,
                emailConversionRate: 0,
                portfolioHealthScore: 0,
                actionRequiredCount: 0
            ),
            health: OperatorHealth(
                deliverability: "healthy",
                reviewVelocity: "steady",
                engagementTrend: "up",
                workerLiveness: "healthy",
                lastPipelineRun: nil
            ),
            alerts: [],
            activityFeed: []
        )
    }

    func gbpSummary(context: OperatorAPIContext, tenantId: String) async throws -> GbpOperatorSummary {
        GbpOperatorSummary(
            tenantId: tenantId,
            gbpIntegrationStatus: "connected",
            cooldownUntil: nil,
            lastSuccessAt: nil,
            latestJobRun: nil,
            alerts: []
        )
    }

    func postmarkSummary(context: OperatorAPIContext, tenantId: String) async throws -> PostmarkOperatorSummary {
        PostmarkOperatorSummary(
            tenantId: tenantId,
            paused: false,
            pausedUntil: nil,
            pauseReason: nil,
            resumeChecklistAck: true,
            rollups: PostmarkRollups(
                last1h: PostmarkRollupWindow(sent: 0, simulated: 0, failed: 0),
                last24h: PostmarkRollupWindow(sent: 0, simulated: 0, failed: 0)
            ),
            invariants: PostmarkInvariantSet(
                sendStateBreach: PostmarkInvariantBreach(
                    active: false,
                    code: nil,
                    severity: nil,
                    message: nil,
                    detectedAt: nil
                )
            )
        )
    }

    func pollReviews(context: OperatorAPIContext, tenantId: String) async throws -> PollResponse {
        PollResponse(jobId: "job-1", queue: "gbp")
    }

    func reviews(context: OperatorAPIContext, tenantId: String) async throws -> Components.Schemas.ListReviewsResponse {
        Components.Schemas.ListReviewsResponse(items: [], nextCursor: nil)
    }

    func customers(context: OperatorAPIContext, tenantId: String, segment: String?) async throws -> CustomersPage {
        CustomersPage(items: [], nextCursor: nil)
    }

    func revenueSummary(context: OperatorAPIContext, tenantId: String) async throws -> RevenueSummaryResponse {
        RevenueSummaryResponse(
            tenantId: tenantId,
            model: "LAST_TOUCH",
            windowDaysDirect: 7,
            windowDaysAssisted: 30,
            range: RevenueSummaryRange(from: "2026-03-01T00:00:00Z", to: "2026-03-15T00:00:00Z"),
            rollup: RevenueSummaryRollup(
                total: MoneyBreakdown(amountCents: 1000, currency: "USD"),
                direct: MoneyBreakdown(amountCents: 600, currency: "USD"),
                assisted: MoneyBreakdown(amountCents: 300, currency: "USD"),
                unattributed: MoneyBreakdown(amountCents: 100, currency: "USD")
            ),
            topCampaigns: [],
            diagnostics: nil
        )
    }

    func resumePostmarkSends(context: OperatorAPIContext, tenantId: String, checklistAck: Bool) async throws -> OperatorActionResponse {
        OperatorActionResponse(resumed: checklistAck, reason: nil)
    }
}
