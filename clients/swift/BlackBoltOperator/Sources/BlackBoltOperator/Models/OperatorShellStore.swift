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
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var connectionState: OperatorConnectionState = .ready
    @Published var lastError: OperatorAppError?
    @Published var preflightIssues: [String] = []
    @Published var interventionStatusMessage: String?

    func refresh(runtime: OperatorRuntimeConfig) async {
        guard preflight(runtime: runtime) else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let dashboardReq = try runtime.request(path: "/dashboard/summary")
            let alertsReq = try runtime.request(path: "/alerts?state=open")
            let eventsReq = try runtime.request(path: "/events")
            let tenantsReq = try runtime.request(path: "/tenants")
            let tenantReq = try runtime.request(path: "/tenants/\(runtime.tenantId)")
            let metricsReq = try runtime.request(path: "/tenants/\(runtime.tenantId)/metrics?range=30d")

            async let dashboardTask = OperatorHTTP.fetchJSON(dashboardReq, as: DashboardSummaryResponse.self)
            async let alertsTask = OperatorHTTP.fetchJSON(alertsReq, as: OperatorAlertsResponse.self)
            async let eventsTask = OperatorHTTP.fetchJSON(eventsReq, as: OperatorEventsResponse.self)
            async let tenantsTask = OperatorHTTP.fetchJSON(tenantsReq, as: OperatorTenantListResponse.self)
            async let tenantTask = OperatorHTTP.fetchJSON(tenantReq, as: OperatorTenantDetail.self)
            async let metricsTask = OperatorHTTP.fetchJSON(metricsReq, as: OperatorTenantMetricsResponse.self)

            let (dashboardResp, alertsResp, eventsResp, tenantsResp, tenantResp, metricsResp) = try await (
                dashboardTask,
                alertsTask,
                eventsTask,
                tenantsTask,
                tenantTask,
                metricsTask
            )

            dashboard = dashboardResp
            alerts = alertsResp.items
            events = eventsResp.items
            tenants = tenantsResp.items
            tenantDetail = tenantResp
            tenantMetrics = metricsResp
            connectionState = .ready
            lastError = nil
            errorMessage = nil
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
        do {
            let request = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/reports/monthly?month=\(month)")
            report = try await OperatorHTTP.fetchJSON(request, as: MonthlyReportPayload.self)
            connectionState = .ready
            lastError = nil
            errorMessage = nil
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

    private func post(runtime: OperatorRuntimeConfig, path: String, body: String?) async throws -> Data {
        var request = try runtime.request(path: path, method: "POST")
        if let body {
            request.httpBody = Data(body.utf8)
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await OperatorHTTP.perform(request)
    }

    private func preflight(runtime: OperatorRuntimeConfig) -> Bool {
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

        preflightIssues = issues
        if issues.isEmpty {
            return true
        }

        let details = issues
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

        let appError = OperatorAppError(
            code: "invalid_config",
            message: "Missing required settings: \(details). Open Settings to continue.",
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
}
