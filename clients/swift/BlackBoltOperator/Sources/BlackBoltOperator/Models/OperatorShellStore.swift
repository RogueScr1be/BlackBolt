import Foundation

@MainActor
final class OperatorShellStore: ObservableObject {
    @Published var dashboard: DashboardSummaryResponse?
    @Published var events: [OperatorActivityEvent] = []
    @Published var alerts: [OperatorAlertListItem] = []
    @Published var tenants: [OperatorTenantSummary] = []
    @Published var tenantDetail: OperatorTenantDetail?
    @Published var tenantMetrics: OperatorTenantMetricsResponse?
    @Published var report: MonthlyReportPayload?
    @Published var campaignRuns: [CampaignRunSummary] = []
    @Published var reviewQueue: [OperatorReviewQueueItem] = []
    @Published var approvalQueue: [OperatorApprovalSummary] = []
    @Published var selectedApproval: OperatorApprovalDetail?
    @Published var customerSegments: CustomerSegmentSummaryResponse?
    @Published var revenueImports: [RevenueImportListItem] = []
    @Published var revenueImportStatus: RevenueImportStatusResponse?
    @Published var smoke: OperatorSmokeResponse?
    @Published var bootstrapStatus: BootstrapStatusResponse?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var connectionState: OperatorConnectionState = .ready
    @Published var lastError: OperatorAppError?
    @Published var preflightIssues: [String] = []
    @Published var interventionStatusMessage: String?
    @Published var dashboardState: SectionLoadState = .idle
    @Published var alertsState: SectionLoadState = .idle
    @Published var eventsState: SectionLoadState = .idle
    @Published var tenantsState: SectionLoadState = .idle
    @Published var campaignRunsState: SectionLoadState = .idle
    @Published var reviewQueueState: SectionLoadState = .idle
    @Published var approvalsState: SectionLoadState = .idle
    @Published var reportsState: SectionLoadState = .idle
    @Published var revenueImportsState: SectionLoadState = .idle
    @Published var revenueImportStatusState: SectionLoadState = .idle
    @Published var requestDiagnostics: [EndpointDiagnostic] = []

    private let apiService: any OperatorAPIServicing

    init(apiService: any OperatorAPIServicing = GeneratedOperatorAPIService()) {
        self.apiService = apiService
    }

    func refresh(runtime: OperatorRuntimeConfig) async {
        guard let context = resolveContext(runtime: runtime) else { return }

        isLoading = true
        dashboardState = .loading
        alertsState = .loading
        eventsState = .loading
        tenantsState = .loading
        campaignRunsState = .loading
        reviewQueueState = .loading
        approvalsState = .loading
        revenueImportsState = .loading
        defer { isLoading = false }

        let tenantId = context.tenantId
        async let dashboardResult = fetchResult(path: "/v1/tenants/\(tenantId)/dashboard/summary") {
            try await apiService.dashboardSummary(context: context)
        }
        async let alertsResult = fetchResult(path: "/v1/tenants/\(tenantId)/alerts") {
            try await apiService.alerts(context: context, state: "open")
        }
        async let eventsResult = fetchResult(path: "/v1/tenants/\(tenantId)/events") {
            try await apiService.events(context: context)
        }
        async let tenantsListResult = fetchResult(path: "/v1/tenants") {
            try await apiService.tenants(context: context)
        }
        async let tenantDetailResult = fetchResult(path: "/v1/tenants/\(tenantId)") {
            try await apiService.tenantDetail(context: context, tenantId: tenantId)
        }
        async let tenantMetricsResult = fetchResult(path: "/v1/tenants/\(tenantId)/metrics") {
            try await apiService.tenantMetrics(context: context, tenantId: tenantId, range: "30d")
        }
        async let campaignRunsResult = fetchResult(path: "/v1/tenants/\(tenantId)/campaign-runs") {
            try await apiService.campaignRuns(context: context, tenantId: tenantId, limit: 25)
        }
        async let reviewQueueResult = fetchResult(path: "/v1/operator/reviews/queue") {
            try await apiService.reviewQueue(context: context, state: "all", tenantId: nil)
        }
        async let approvalsResult = fetchResult(path: "/v1/operator/approvals") {
            try await apiService.approvals(context: context, state: "awaiting_approval", tenantId: nil)
        }
        async let customerSegmentsResult = fetchResult(path: "/v1/tenants/\(tenantId)/customers/segments") {
            try await apiService.customerSegments(context: context, tenantId: tenantId)
        }
        async let revenueImportsResult = fetchResult(path: "/v1/tenants/\(tenantId)/revenue/imports") {
            try await apiService.revenueImports(context: context, tenantId: tenantId, limit: 10)
        }

        let (
            dashboardResolved,
            alertsResolved,
            eventsResolved,
            tenantsListResolved,
            tenantDetailResolved,
            tenantMetricsResolved,
            campaignRunsResolved,
            reviewQueueResolved,
            approvalsResolved,
            customerSegmentsResolved,
            revenueImportsResolved
        ) = await (
            dashboardResult,
            alertsResult,
            eventsResult,
            tenantsListResult,
            tenantDetailResult,
            tenantMetricsResult,
            campaignRunsResult,
            reviewQueueResult,
            approvalsResult,
            customerSegmentsResult,
            revenueImportsResult
        )

        applySectionResult(dashboardResolved, state: &dashboardState) { dashboard = $0 }
        applySectionResult(alertsResolved, state: &alertsState) { alerts = $0.items }
        applySectionResult(eventsResolved, state: &eventsState) { events = $0.items }
        applySectionResult(campaignRunsResolved, state: &campaignRunsState) { campaignRuns = $0.items }
        applySectionResult(reviewQueueResolved, state: &reviewQueueState) { reviewQueue = $0.items }
        applySectionResult(approvalsResolved, state: &approvalsState) { approvalQueue = $0.items }
        if case .success(let segments) = customerSegmentsResolved {
            customerSegments = segments
        }
        applySectionResult(revenueImportsResolved, state: &revenueImportsState) { revenueImports = $0.items }

        let tenantFailures = [
            tenantsListResolved.failureValue,
            tenantDetailResolved.failureValue,
            tenantMetricsResolved.failureValue
        ].compactMap { $0 }
        if tenantFailures.isEmpty {
            tenantsState = .ready
        } else if let first = tenantFailures.first {
            tenantsState = .failed(first)
        }
        if case .success(let list) = tenantsListResolved {
            tenants = list.items
        }
        if case .success(let detail) = tenantDetailResolved {
            tenantDetail = detail
        }
        if case .success(let metrics) = tenantMetricsResolved {
            tenantMetrics = metrics
        }

        var failures = [
            dashboardResolved.failureValue,
            alertsResolved.failureValue,
            eventsResolved.failureValue,
            campaignRunsResolved.failureValue,
            reviewQueueResolved.failureValue,
            approvalsResolved.failureValue,
            customerSegmentsResolved.failureValue,
            revenueImportsResolved.failureValue
        ].compactMap { $0 }
        failures.append(contentsOf: tenantFailures)

        if failures.isEmpty {
            connectionState = .ready
            lastError = nil
            errorMessage = nil
            return
        }

        if failures.count < 11 {
            let failure = failures[0]
            lastError = failure
            errorMessage = "Some sections failed to refresh. Check tab-level errors and retry."
            connectionState = .ready
        } else if let first = failures.first {
            lastError = first
            errorMessage = first.message
            connectionState = stateFor(appError: first)
        }
    }

    func reloadDashboard(runtime: OperatorRuntimeConfig) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        dashboardState = .loading
        let path = "/v1/tenants/\(context.tenantId)/dashboard/summary"
        let result = await fetchResult(path: path) {
            try await apiService.dashboardSummary(context: context)
        }
        applySectionResult(result, state: &dashboardState) { dashboard = $0 }
    }

    func reloadAlerts(runtime: OperatorRuntimeConfig) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        alertsState = .loading
        let path = "/v1/tenants/\(context.tenantId)/alerts"
        let result = await fetchResult(path: path) {
            try await apiService.alerts(context: context, state: "open")
        }
        applySectionResult(result, state: &alertsState) { alerts = $0.items }
    }

    func reloadCampaignRuns(runtime: OperatorRuntimeConfig) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        campaignRunsState = .loading
        let path = "/v1/tenants/\(context.tenantId)/campaign-runs"
        let result = await fetchResult(path: path) {
            try await apiService.campaignRuns(context: context, tenantId: context.tenantId, limit: 25)
        }
        applySectionResult(result, state: &campaignRunsState) { campaignRuns = $0.items }
    }

    func reloadReviewQueue(runtime: OperatorRuntimeConfig, state: String = "all", tenantId: String? = nil) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        reviewQueueState = .loading
        let path = "/v1/operator/reviews/queue"
        let result = await fetchResult(path: path) {
            try await apiService.reviewQueue(context: context, state: state, tenantId: tenantId)
        }
        applySectionResult(result, state: &reviewQueueState) { reviewQueue = $0.items }
    }

    func reloadApprovals(runtime: OperatorRuntimeConfig, state: String = "awaiting_approval", tenantId: String? = nil) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        approvalsState = .loading
        let path = "/v1/operator/approvals"
        let result = await fetchResult(path: path) {
            try await apiService.approvals(context: context, state: state, tenantId: tenantId)
        }
        applySectionResult(result, state: &approvalsState) { approvalQueue = $0.items }
    }

    func loadApprovalDetail(runtime: OperatorRuntimeConfig, approvalId: String) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        guard !approvalId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let path = "/v1/operator/approvals/\(approvalId)"
        let result = await fetchResult(path: path) {
            try await apiService.approvalDetail(context: context, approvalId: approvalId)
        }
        switch result {
        case .success(let detail):
            selectedApproval = detail
            approvalsState = .ready
        case .failure(let appError):
            approvalsState = .failed(appError)
            lastError = appError
            errorMessage = appError.message
        }
    }

    func patchApprovalDraft(
        runtime: OperatorRuntimeConfig,
        approvalId: String,
        subject: String,
        body: String,
        segment: String,
        sendWindowAt: String
    ) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        let path = "/v1/operator/approvals/\(approvalId)/draft"

        do {
            selectedApproval = try await apiService.patchApprovalDraft(
                context: context,
                approvalId: approvalId,
                subject: subject,
                body: body,
                segment: segment,
                sendWindowAt: sendWindowAt
            )
            recordDiagnostic(path: path, statusCode: 200, success: true)
            await reloadApprovals(runtime: runtime)
            await reloadReviewQueue(runtime: runtime)
        } catch {
            let appError = mapToAppError(error: error, fallbackPath: path)
            recordDiagnostic(path: appError.path ?? path, statusCode: appError.httpStatus, success: false)
            apply(error: appError)
        }
    }

    func approveSelectedApproval(runtime: OperatorRuntimeConfig, approvalId: String) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        let path = "/v1/operator/approvals/\(approvalId)/approve"

        do {
            try await apiService.approveApproval(context: context, approvalId: approvalId)
            recordDiagnostic(path: path, statusCode: 200, success: true)
            selectedApproval = nil
            await reloadApprovals(runtime: runtime)
            await reloadReviewQueue(runtime: runtime)
            await reloadCampaignRuns(runtime: runtime)
        } catch {
            let appError = mapToAppError(error: error, fallbackPath: path)
            recordDiagnostic(path: appError.path ?? path, statusCode: appError.httpStatus, success: false)
            apply(error: appError)
        }
    }

    func rejectSelectedApproval(runtime: OperatorRuntimeConfig, approvalId: String, reason: String) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        let path = "/v1/operator/approvals/\(approvalId)/reject"

        do {
            try await apiService.rejectApproval(context: context, approvalId: approvalId, reason: reason)
            recordDiagnostic(path: path, statusCode: 200, success: true)
            selectedApproval = nil
            await reloadApprovals(runtime: runtime)
            await reloadReviewQueue(runtime: runtime)
            await reloadCampaignRuns(runtime: runtime)
        } catch {
            let appError = mapToAppError(error: error, fallbackPath: path)
            recordDiagnostic(path: appError.path ?? path, statusCode: appError.httpStatus, success: false)
            apply(error: appError)
        }
    }

    func executeIntervention(runtime: OperatorRuntimeConfig, capability: String, alertID: String?) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        let path: String

        do {
            switch capability {
            case "retry-gbp-ingestion":
                path = "/v1/tenants/\(context.tenantId)/interventions/retry-gbp-ingestion"
                try await apiService.retryGbpIngestion(context: context, tenantId: context.tenantId)
            case "resume-postmark":
                path = "/v1/tenants/\(context.tenantId)/interventions/resume-postmark"
                try await apiService.resumePostmarkIntervention(context: context, tenantId: context.tenantId)
            case "ack-alert":
                guard let alertID else { return }
                path = "/v1/tenants/\(context.tenantId)/interventions/ack-alert"
                try await apiService.ackAlert(context: context, tenantId: context.tenantId, alertId: alertID)
            default:
                return
            }

            recordDiagnostic(path: path, statusCode: 200, success: true)
            interventionStatusMessage = "Intervention succeeded (\(capability))."
            await refresh(runtime: runtime)
        } catch {
            let appError = mapToAppError(error: error, fallbackPath: "/v1/tenants/\(context.tenantId)/interventions")
            recordDiagnostic(path: appError.path ?? "/v1/tenants/\(context.tenantId)/interventions", statusCode: appError.httpStatus, success: false)
            interventionStatusMessage = "Intervention failed (\(capability))."
            apply(error: appError)
        }
    }

    func loadMonthlyReport(runtime: OperatorRuntimeConfig, month: String) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        reportsState = .loading
        let path = "/v1/tenants/\(context.tenantId)/reports/monthly"
        let result = await fetchResult(path: path) {
            try await apiService.monthlyReport(context: context, tenantId: context.tenantId, month: month)
        }

        switch result {
        case .success(let report):
            self.report = report
            reportsState = .ready
            connectionState = .ready
            lastError = nil
            errorMessage = nil
        case .failure(let appError):
            apply(error: appError)
            reportsState = .failed(appError)
        }
    }

    func runSmokeTest(runtime: OperatorRuntimeConfig) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        let path = "/v1/tenants/\(context.tenantId)/operator/smoke"

        do {
            smoke = try await apiService.operatorSmoke(context: context, tenantId: context.tenantId)
            recordDiagnostic(path: path, statusCode: 200, success: true)
            connectionState = .ready
            lastError = nil
            errorMessage = nil
            if smoke?.overallPassed == true {
                await loadBootstrapStatus(runtime: runtime)
                await refresh(runtime: runtime)
            }
        } catch {
            let appError = mapToAppError(error: error, fallbackPath: path)
            recordDiagnostic(path: appError.path ?? path, statusCode: appError.httpStatus, success: false)
            apply(error: appError)
        }
    }

    func loadBootstrapStatus(runtime: OperatorRuntimeConfig) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        let result = await fetchResult(path: "/v1/bootstrap/status") {
            try await apiService.bootstrapStatus(context: context)
        }

        switch result {
        case .success(let status):
            bootstrapStatus = status
        case .failure(let appError):
            lastError = appError
            errorMessage = appError.message
        }
    }

    func listRevenueImports(runtime: OperatorRuntimeConfig) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        revenueImportsState = .loading
        let path = "/v1/tenants/\(context.tenantId)/revenue/imports"
        let result = await fetchResult(path: path) {
            try await apiService.revenueImports(context: context, tenantId: context.tenantId, limit: 20)
        }
        applySectionResult(result, state: &revenueImportsState) { revenueImports = $0.items }
    }

    func getRevenueImportStatus(runtime: OperatorRuntimeConfig, importId: String) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        guard !importId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        revenueImportStatusState = .loading
        let path = "/v1/revenue-imports/\(importId)"
        let result = await fetchResult(path: path) {
            try await apiService.revenueImportStatus(context: context, revenueImportId: importId)
        }
        applySectionResult(result, state: &revenueImportStatusState) { revenueImportStatus = $0 }
    }

    func createRevenueImport(runtime: OperatorRuntimeConfig, fileURL: URL) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        isLoading = true
        revenueImportStatusState = .loading
        defer { isLoading = false }

        let path = "/v1/tenants/\(context.tenantId)/revenue/imports"
        do {
            let created = try await apiService.createRevenueImport(
                context: context,
                tenantId: context.tenantId,
                fileURL: fileURL
            )
            recordDiagnostic(path: path, statusCode: 202, success: true)
            connectionState = .ready
            lastError = nil
            errorMessage = nil

            await listRevenueImports(runtime: runtime)
            await pollRevenueImportUntilTerminal(runtime: runtime, importId: created.revenueImportId)
            await refresh(runtime: runtime)
        } catch {
            let appError = mapToAppError(error: error, fallbackPath: path)
            recordDiagnostic(path: appError.path ?? path, statusCode: appError.httpStatus, success: false)
            apply(error: appError)
        }
    }

    func setCampaignRunPaused(runtime: OperatorRuntimeConfig, runId: String, paused: Bool) async {
        guard let context = resolveContext(runtime: runtime) else { return }
        let path = "/v1/tenants/\(context.tenantId)/campaign-runs/\(runId)/\(paused ? "pause" : "resume")"

        do {
            try await apiService.setCampaignRunPaused(
                context: context,
                tenantId: context.tenantId,
                runId: runId,
                paused: paused
            )
            recordDiagnostic(path: path, statusCode: 200, success: true)
            await refresh(runtime: runtime)
        } catch {
            let appError = mapToAppError(error: error, fallbackPath: path)
            recordDiagnostic(path: appError.path ?? path, statusCode: appError.httpStatus, success: false)
            apply(error: appError)
        }
    }

    var criticalAlerts: [OperatorAlertListItem] {
        alerts.filter { $0.state == "open" && $0.severity == "critical" }
    }

    var unresolvedAlerts: [OperatorAlertListItem] {
        alerts.filter { $0.state == "open" }
    }

    func contentState(for state: SectionLoadState, hasContent: Bool) -> OperatorContentState {
        switch state {
        case .idle:
            return hasContent ? .ready : .empty
        case .loading:
            return hasContent ? .ready : .loading
        case .ready:
            return hasContent ? .ready : .empty
        case .failed(let appError):
            return hasContent ? .degraded(appError) : .failed(appError)
        }
    }

    func hasRequiredSettings(runtime: OperatorRuntimeConfig) -> Bool {
        requiredIssues(for: runtime).isEmpty
    }

    func reconcileConfig(runtime: OperatorRuntimeConfig) {
        let issues = requiredIssues(for: runtime)
        preflightIssues = issues
        guard !issues.isEmpty else {
            if connectionState == .invalidConfig {
                connectionState = .ready
            }
            if lastError?.code == "invalid_config" {
                lastError = nil
                errorMessage = nil
            }
            return
        }

        let appError = OperatorAppError(
            code: "invalid_config",
            message: "Missing required settings: \(describeIssues(issues)). Open Settings to continue.",
            httpStatus: nil,
            path: nil
        )
        lastError = appError
        errorMessage = appError.message
        connectionState = .invalidConfig
    }

    var latestFailedDiagnostic: EndpointDiagnostic? {
        requestDiagnostics.last(where: { !$0.success })
    }

    private func pollRevenueImportUntilTerminal(runtime: OperatorRuntimeConfig, importId: String) async {
        let maxAttempts = 25
        for _ in 0..<maxAttempts {
            await getRevenueImportStatus(runtime: runtime, importId: importId)
            guard let status = revenueImportStatus?.status.lowercased() else {
                return
            }
            if status == "succeeded" || status == "failed" {
                return
            }
            try? await Task.sleep(nanoseconds: 2_000_000_000)
        }
    }

    private func resolveContext(runtime: OperatorRuntimeConfig) -> OperatorAPIContext? {
        guard preflight(runtime: runtime) else { return nil }
        do {
            return try runtime.apiContext()
        } catch {
            apply(error: error)
            return nil
        }
    }

    private func preflight(runtime: OperatorRuntimeConfig) -> Bool {
        let issues = requiredIssues(for: runtime)
        preflightIssues = issues

        guard issues.isEmpty else {
            let appError = OperatorAppError(
                code: "invalid_config",
                message: "Missing required settings: \(describeIssues(issues)). Open Settings to continue.",
                httpStatus: nil,
                path: nil
            )
            lastError = appError
            connectionState = .invalidConfig
            errorMessage = appError.message
            return false
        }

        return true
    }

    private func fetchResult<T>(
        path: String,
        operation: () async throws -> T
    ) async -> Result<T, OperatorAppError> {
        do {
            let value = try await operation()
            recordDiagnostic(path: path, statusCode: 200, success: true)
            return .success(value)
        } catch {
            let appError = mapToAppError(error: error, fallbackPath: path)
            recordDiagnostic(path: appError.path ?? path, statusCode: appError.httpStatus, success: false)
            return .failure(appError)
        }
    }

    private func apply(error: Error) {
        let appError = error as? OperatorAppError ?? OperatorAppError(
            code: "unknown_error",
            message: error.localizedDescription,
            httpStatus: nil,
            path: nil
        )
        lastError = appError
        errorMessage = appError.message
        connectionState = stateFor(appError: appError)
    }

    private func stateFor(appError: OperatorAppError) -> OperatorConnectionState {
        if appError.code == "invalid_config" {
            return .invalidConfig
        }
        if appError.code == "network_unreachable" || appError.code == "network_error" {
            return .networkError
        }
        if appError.code == "invalid_operator_key" {
            return .authError
        }
        return .serverError
    }

    private func requiredIssues(for runtime: OperatorRuntimeConfig) -> [String] {
        var issues: [String] = []
        if runtime.apiBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append("missing_api_base_url")
        }
        if runtime.tenantId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append("missing_tenant_id")
        }
        if runtime.operatorKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append("missing_operator_key")
        }
        return issues
    }

    private func describeIssues(_ issues: [String]) -> String {
        issues
            .map { issue in
                switch issue {
                case "missing_api_base_url":
                    return "API base URL"
                case "missing_tenant_id":
                    return "Tenant ID"
                case "missing_operator_key":
                    return "Operator Key"
                default:
                    return issue
                }
            }
            .joined(separator: ", ")
    }

    private func applySectionResult<T>(
        _ result: Result<T, OperatorAppError>,
        state: inout SectionLoadState,
        onSuccess: (T) -> Void
    ) {
        switch result {
        case .success(let value):
            onSuccess(value)
            state = .ready
        case .failure(let appError):
            state = .failed(appError)
        }
    }

    private func mapToAppError(error: Error, fallbackPath: String) -> OperatorAppError {
        if let appError = error as? OperatorAppError {
            return appError
        }
        return OperatorAppError(
            code: "unknown_error",
            message: error.localizedDescription,
            httpStatus: nil,
            path: fallbackPath
        )
    }

    private func recordDiagnostic(path: String, statusCode: Int?, success: Bool) {
        requestDiagnostics.append(
            EndpointDiagnostic(
                path: path,
                statusCode: statusCode,
                success: success,
                timestamp: Date()
            )
        )
        if requestDiagnostics.count > 50 {
            requestDiagnostics.removeFirst(requestDiagnostics.count - 50)
        }
    }
}

private extension Result {
    var failureValue: Failure? {
        if case .failure(let value) = self {
            return value
        }
        return nil
    }
}
