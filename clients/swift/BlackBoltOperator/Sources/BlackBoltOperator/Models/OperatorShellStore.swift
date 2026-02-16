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

    func refresh(runtime: OperatorRuntimeConfig) async {
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
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func executeIntervention(runtime: OperatorRuntimeConfig, capability: String, alertID: String?) async {
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
            await refresh(runtime: runtime)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadMonthlyReport(runtime: OperatorRuntimeConfig, month: String) async {
        do {
            let request = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/reports/monthly?month=\(month)")
            report = try await OperatorHTTP.fetchJSON(request, as: MonthlyReportPayload.self)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
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
}
