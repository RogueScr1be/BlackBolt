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

    func refresh(runtime: OperatorRuntimeConfig) async {
        guard preflight(runtime: runtime) else { return }
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

        async let dashboardResult: Result<DashboardSummaryResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/dashboard/summary",
            as: DashboardSummaryResponse.self
        )
        async let alertsResult: Result<OperatorAlertsResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/alerts?state=open",
            as: OperatorAlertsResponse.self
        )
        async let eventsResult: Result<OperatorEventsResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/events",
            as: OperatorEventsResponse.self
        )
        async let tenantsListResult: Result<OperatorTenantListResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/tenants",
            as: OperatorTenantListResponse.self
        )
        async let tenantDetailResult: Result<OperatorTenantDetail, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/tenants/\(runtime.tenantId)",
            as: OperatorTenantDetail.self
        )
        async let tenantMetricsResult: Result<OperatorTenantMetricsResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/tenants/\(runtime.tenantId)/metrics?range=30d",
            as: OperatorTenantMetricsResponse.self
        )
        async let campaignRunsResult: Result<CampaignRunsResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/v1/tenants/\(runtime.tenantId)/campaign-runs?limit=25",
            as: CampaignRunsResponse.self
        )
        async let reviewQueueResult: Result<OperatorReviewQueueResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/v1/operator/reviews/queue?state=all",
            as: OperatorReviewQueueResponse.self
        )
        async let approvalsResult: Result<OperatorApprovalListResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/v1/operator/approvals?state=awaiting_approval",
            as: OperatorApprovalListResponse.self
        )
        async let customerSegmentsResult: Result<CustomerSegmentSummaryResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/v1/tenants/\(runtime.tenantId)/customers/segments",
            as: CustomerSegmentSummaryResponse.self
        )
        async let revenueImportsResult: Result<RevenueImportListResponse, OperatorAppError> = fetchJSON(
            runtime: runtime,
            path: "/v1/tenants/\(runtime.tenantId)/revenue/imports?limit=10",
            as: RevenueImportListResponse.self
        )

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
            // Partial failures should not lock the whole app; preserve successful section data.
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
        guard preflight(runtime: runtime) else { return }
        dashboardState = .loading
        let result: Result<DashboardSummaryResponse, OperatorAppError> = await fetchJSON(
            runtime: runtime,
            path: "/dashboard/summary",
            as: DashboardSummaryResponse.self
        )
        applySectionResult(result, state: &dashboardState) { dashboard = $0 }
    }

    func reloadAlerts(runtime: OperatorRuntimeConfig) async {
        guard preflight(runtime: runtime) else { return }
        alertsState = .loading
        let result: Result<OperatorAlertsResponse, OperatorAppError> = await fetchJSON(
            runtime: runtime,
            path: "/alerts?state=open",
            as: OperatorAlertsResponse.self
        )
        applySectionResult(result, state: &alertsState) { alerts = $0.items }
    }

    func reloadCampaignRuns(runtime: OperatorRuntimeConfig) async {
        guard preflight(runtime: runtime) else { return }
        campaignRunsState = .loading
        let result: Result<CampaignRunsResponse, OperatorAppError> = await fetchJSON(
            runtime: runtime,
            path: "/v1/tenants/\(runtime.tenantId)/campaign-runs?limit=25",
            as: CampaignRunsResponse.self
        )
        applySectionResult(result, state: &campaignRunsState) { campaignRuns = $0.items }
    }

    func reloadReviewQueue(runtime: OperatorRuntimeConfig, state: String = "all", tenantId: String? = nil) async {
        guard preflight(runtime: runtime) else { return }
        reviewQueueState = .loading
        var path = "/v1/operator/reviews/queue?state=\(state)"
        if let tenantId, !tenantId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            path += "&tenant_id=\(tenantId)"
        }
        let result: Result<OperatorReviewQueueResponse, OperatorAppError> = await fetchJSON(
            runtime: runtime,
            path: path,
            as: OperatorReviewQueueResponse.self
        )
        applySectionResult(result, state: &reviewQueueState) { reviewQueue = $0.items }
    }

    func reloadApprovals(runtime: OperatorRuntimeConfig, state: String = "awaiting_approval", tenantId: String? = nil) async {
        guard preflight(runtime: runtime) else { return }
        approvalsState = .loading
        var path = "/v1/operator/approvals?state=\(state)"
        if let tenantId, !tenantId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            path += "&tenant_id=\(tenantId)"
        }
        let result: Result<OperatorApprovalListResponse, OperatorAppError> = await fetchJSON(
            runtime: runtime,
            path: path,
            as: OperatorApprovalListResponse.self
        )
        applySectionResult(result, state: &approvalsState) { approvalQueue = $0.items }
    }

    func loadApprovalDetail(runtime: OperatorRuntimeConfig, approvalId: String) async {
        guard preflight(runtime: runtime) else { return }
        guard !approvalId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let result: Result<OperatorApprovalDetail, OperatorAppError> = await fetchJSON(
            runtime: runtime,
            path: "/v1/operator/approvals/\(approvalId)",
            as: OperatorApprovalDetail.self
        )
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
        guard preflight(runtime: runtime) else { return }
        let payload =
            "{"
            + "\"subject\":\"\(escapeJSONString(subject))\","
            + "\"body\":\"\(escapeJSONString(body))\","
            + "\"segment\":\"\(escapeJSONString(segment))\","
            + "\"send_window_at\":\"\(escapeJSONString(sendWindowAt))\""
            + "}"
        do {
            let data = try await patch(
                runtime: runtime,
                path: "/v1/operator/approvals/\(approvalId)/draft",
                body: payload
            )
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            selectedApproval = try decoder.decode(OperatorApprovalDetail.self, from: data)
            await reloadApprovals(runtime: runtime)
            await reloadReviewQueue(runtime: runtime)
        } catch {
            apply(error: error)
        }
    }

    func approveSelectedApproval(runtime: OperatorRuntimeConfig, approvalId: String) async {
        guard preflight(runtime: runtime) else { return }
        do {
            _ = try await post(runtime: runtime, path: "/v1/operator/approvals/\(approvalId)/approve", body: nil)
            selectedApproval = nil
            await reloadApprovals(runtime: runtime)
            await reloadReviewQueue(runtime: runtime)
            await reloadCampaignRuns(runtime: runtime)
        } catch {
            apply(error: error)
        }
    }

    func rejectSelectedApproval(runtime: OperatorRuntimeConfig, approvalId: String, reason: String) async {
        guard preflight(runtime: runtime) else { return }
        let payload = "{ \"reason\": \"\(escapeJSONString(reason))\" }"
        do {
            _ = try await post(
                runtime: runtime,
                path: "/v1/operator/approvals/\(approvalId)/reject",
                body: payload
            )
            selectedApproval = nil
            await reloadApprovals(runtime: runtime)
            await reloadReviewQueue(runtime: runtime)
            await reloadCampaignRuns(runtime: runtime)
        } catch {
            apply(error: error)
        }
    }

    func executeIntervention(runtime: OperatorRuntimeConfig, capability: String, alertID: String?) async {
        guard preflight(runtime: runtime) else { return }
        do {
            switch capability {
            case "retry-gbp-ingestion":
                _ = try await post(runtime: runtime, path: "/v1/tenants/\(runtime.tenantId)/interventions/retry-gbp-ingestion", body: nil)
            case "resume-postmark":
                _ = try await post(runtime: runtime, path: "/v1/tenants/\(runtime.tenantId)/interventions/resume-postmark", body: nil)
            case "ack-alert":
                guard let alertID else { return }
                let json = "{\"alert_id\":\"\(alertID)\"}"
                _ = try await post(runtime: runtime, path: "/v1/tenants/\(runtime.tenantId)/interventions/ack-alert", body: json)
            default:
                break
            }
            interventionStatusMessage = "Intervention succeeded (\(capability))."
            await refresh(runtime: runtime)
        } catch {
            interventionStatusMessage = "Intervention failed (\(capability))."
            apply(error: error)
        }
    }

    func loadMonthlyReport(runtime: OperatorRuntimeConfig, month: String) async {
        guard preflight(runtime: runtime) else { return }
        reportsState = .loading
        do {
            let request = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/reports/monthly?month=\(month)")
            let (data, status) = try await OperatorHTTP.performWithStatus(request)
            recordDiagnostic(path: "/v1/tenants/\(runtime.tenantId)/reports/monthly", statusCode: status, success: true)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            report = try decoder.decode(MonthlyReportPayload.self, from: data)
            reportsState = .ready
            connectionState = .ready
            lastError = nil
            errorMessage = nil
        } catch {
            apply(error: error)
            if let appError = error as? OperatorAppError {
                reportsState = .failed(appError)
                recordDiagnostic(path: appError.path ?? "/v1/tenants/\(runtime.tenantId)/reports/monthly", statusCode: appError.httpStatus, success: false)
            } else {
                reportsState = .failed(
                    OperatorAppError(
                        code: "unknown_error",
                        message: error.localizedDescription,
                        httpStatus: nil,
                        path: "/v1/tenants/\(runtime.tenantId)/reports/monthly"
                    )
                )
            }
        }
    }

    func runSmokeTest(runtime: OperatorRuntimeConfig) async {
        guard preflight(runtime: runtime) else { return }
        do {
            var request = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/operator/smoke", method: "POST")
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data("{}".utf8)
            let (data, status) = try await OperatorHTTP.performWithStatus(request)
            recordDiagnostic(path: "/v1/tenants/\(runtime.tenantId)/operator/smoke", statusCode: status, success: true)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            smoke = try decoder.decode(OperatorSmokeResponse.self, from: data)
            connectionState = .ready
            lastError = nil
            errorMessage = nil
            if smoke?.overallPassed == true {
                await loadBootstrapStatus(runtime: runtime)
                await refresh(runtime: runtime)
            }
        } catch {
            apply(error: error)
            if let appError = error as? OperatorAppError {
                recordDiagnostic(path: appError.path ?? "/v1/tenants/\(runtime.tenantId)/operator/smoke", statusCode: appError.httpStatus, success: false)
            }
        }
    }

    func loadBootstrapStatus(runtime: OperatorRuntimeConfig) async {
        guard preflight(runtime: runtime) else { return }
        let result: Result<BootstrapStatusResponse, OperatorAppError> = await fetchJSON(
            runtime: runtime,
            path: "/v1/bootstrap/status",
            as: BootstrapStatusResponse.self
        )
        switch result {
        case .success(let status):
            bootstrapStatus = status
        case .failure(let appError):
            lastError = appError
            errorMessage = appError.message
        }
    }

    func listRevenueImports(runtime: OperatorRuntimeConfig) async {
        guard preflight(runtime: runtime) else { return }
        revenueImportsState = .loading
        let result: Result<RevenueImportListResponse, OperatorAppError> = await fetchJSON(
            runtime: runtime,
            path: "/v1/tenants/\(runtime.tenantId)/revenue/imports?limit=20",
            as: RevenueImportListResponse.self
        )
        applySectionResult(result, state: &revenueImportsState) { revenueImports = $0.items }
    }

    func getRevenueImportStatus(runtime: OperatorRuntimeConfig, importId: String) async {
        guard preflight(runtime: runtime) else { return }
        guard !importId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        revenueImportStatusState = .loading
        let path = "/v1/revenue-imports/\(importId)"
        let result: Result<RevenueImportStatusResponse, OperatorAppError> = await fetchJSON(
            runtime: runtime,
            path: path,
            as: RevenueImportStatusResponse.self
        )
        applySectionResult(result, state: &revenueImportStatusState) { revenueImportStatus = $0 }
    }

    func createRevenueImport(runtime: OperatorRuntimeConfig, fileURL: URL) async {
        guard preflight(runtime: runtime) else { return }
        isLoading = true
        revenueImportStatusState = .loading
        defer { isLoading = false }

        do {
            let fileData = try Data(contentsOf: fileURL)
            let boundary = "BlackBoltBoundary-\(UUID().uuidString)"
            let body = buildMultipartBody(
                boundary: boundary,
                fileData: fileData,
                filename: fileURL.lastPathComponent
            )

            var request = try runtime.request(
                path: "/v1/tenants/\(runtime.tenantId)/revenue/imports",
                method: "POST"
            )
            request.addValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            request.httpBody = body

            let (data, status) = try await OperatorHTTP.performWithStatus(request)
            recordDiagnostic(path: "/v1/tenants/\(runtime.tenantId)/revenue/imports", statusCode: status, success: true)

            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let created = try decoder.decode(CreateRevenueImportResponse.self, from: data)
            connectionState = .ready
            lastError = nil
            errorMessage = nil

            await listRevenueImports(runtime: runtime)
            await pollRevenueImportUntilTerminal(runtime: runtime, importId: created.revenueImportId)
            await refresh(runtime: runtime)
        } catch {
            apply(error: error)
            if let appError = error as? OperatorAppError {
                recordDiagnostic(path: appError.path ?? "/v1/tenants/\(runtime.tenantId)/revenue/imports", statusCode: appError.httpStatus, success: false)
            }
        }
    }

    func setCampaignRunPaused(runtime: OperatorRuntimeConfig, runId: String, paused: Bool) async {
        guard preflight(runtime: runtime) else { return }
        let action = paused ? "pause" : "resume"
        do {
            _ = try await post(runtime: runtime, path: "/v1/tenants/\(runtime.tenantId)/campaign-runs/\(runId)/\(action)", body: nil)
            await refresh(runtime: runtime)
        } catch {
            apply(error: error)
        }
    }

    var criticalAlerts: [OperatorAlertListItem] {
        alerts.filter { $0.state == "open" && $0.severity == "critical" }
    }

    var unresolvedAlerts: [OperatorAlertListItem] {
        alerts.filter { $0.state == "open" }
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

    private func post(runtime: OperatorRuntimeConfig, path: String, body: String?) async throws -> Data {
        var request = try runtime.request(path: path, method: "POST")
        if let body {
            request.httpBody = Data(body.utf8)
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await OperatorHTTP.perform(request)
    }

    private func patch(runtime: OperatorRuntimeConfig, path: String, body: String?) async throws -> Data {
        var request = try runtime.request(path: path, method: "PATCH")
        if let body {
            request.httpBody = Data(body.utf8)
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await OperatorHTTP.perform(request)
    }

    private func escapeJSONString(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
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

    private func buildMultipartBody(boundary: String, fileData: Data, filename: String) -> Data {
        var body = Data()
        let prefix = "--\(boundary)\r\n"
        body.append(Data(prefix.utf8))
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".utf8))
        body.append(Data("Content-Type: text/csv\r\n\r\n".utf8))
        body.append(fileData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return body
    }

    private func preflight(runtime: OperatorRuntimeConfig) -> Bool {
        let issues = requiredIssues(for: runtime)

        preflightIssues = issues
        if issues.isEmpty {
            return true
        }

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

    private func apply(error: Error) {
        if let appError = error as? OperatorAppError {
            lastError = appError
            errorMessage = appError.message
            connectionState = stateFor(appError: appError)
            return
        }

        let fallback = OperatorAppError(
            code: "unknown_error",
            message: error.localizedDescription,
            httpStatus: nil,
            path: nil
        )
        lastError = fallback
        errorMessage = fallback.message
        connectionState = .serverError
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

    private func fetchJSON<T: Decodable>(
        runtime: OperatorRuntimeConfig,
        path: String,
        as type: T.Type
    ) async -> Result<T, OperatorAppError> {
        do {
            let request = try runtime.request(path: path)
            let (data, status) = try await OperatorHTTP.performWithStatus(request)
            recordDiagnostic(path: path, statusCode: status, success: true)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return .success(try decoder.decode(type, from: data))
        } catch {
            let appError = mapToAppError(error: error, fallbackPath: path)
            recordDiagnostic(path: appError.path ?? path, statusCode: appError.httpStatus, success: false)
            return .failure(appError)
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
