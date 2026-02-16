import Foundation

struct ImportStatusRow: Decodable, Identifiable {
    let importId: String
    let status: String
    let totalRows: Int
    let processedRows: Int
    let succeededRows: Int
    let failedRows: Int
    let duplicateRows: Int

    var id: String { importId }
}

struct CustomerRow: Decodable, Identifiable {
    let id: String
    let email: String
    let displayName: String?
    let segment: String
}

struct CustomersPage: Decodable {
    let items: [CustomerRow]
    let nextCursor: String?
}

struct GbpTelemetry: Decodable {
    let pagesFetched: Int?
    let reviewsFetched: Int?
    let upserted: Int?
    let skipped: Int?
    let cooldownApplied: Bool?
    let errorClass: String?
}

struct LatestGbpJobRun: Decodable {
    let id: String
    let state: String
    let errorCode: String?
    let errorMessage: String?
    let metadataJson: GbpTelemetry?
    let createdAt: String
    let finishedAt: String?
}

struct IntegrationAlertRow: Decodable, Identifiable {
    let id: String
    let code: String
    let severity: String
    let message: String
    let createdAt: String
    let resolvedAt: String?
}

struct GbpOperatorSummary: Decodable {
    let tenantId: String
    let gbpIntegrationStatus: String
    let cooldownUntil: String?
    let lastSuccessAt: String?
    let latestJobRun: LatestGbpJobRun?
    let alerts: [IntegrationAlertRow]
}

struct RevenueWindowRollup: Decodable {
    let totalCents: Int
    let attributedCents: Int
    let unattributedCents: Int
}

struct RevenueProofRollups: Decodable {
    let last1h: RevenueWindowRollup
    let last24h: RevenueWindowRollup
}

struct MoneyBreakdown: Decodable {
    let amountCents: Int
    let currency: String
}

struct RevenueTopCampaign: Decodable, Identifiable {
    let campaignId: String
    let campaignKey: String
    let attributed: MoneyBreakdown
    let direct: MoneyBreakdown
    let assisted: MoneyBreakdown

    var id: String { campaignId }
}

struct RevenueDiagnostics: Decodable {
    let durationMs: Int
    let prismaCalls: Int
}

struct RevenueSummaryResponse: Decodable {
    let tenantId: String
    let rollup: RevenueSummaryRollup
    let proof: RevenueProofRollups
    let topCampaigns: [RevenueTopCampaign]
    let diagnostics: RevenueDiagnostics?
}

struct RevenueSummaryRollup: Decodable {
    let total: MoneyBreakdown
    let direct: MoneyBreakdown
    let assisted: MoneyBreakdown
    let unattributed: MoneyBreakdown
}

struct HealthResponse: Decodable {
    let ok: Bool
}

struct PostmarkRollupWindow: Decodable {
    let sent: Int
    let simulated: Int
    let failed: Int
}

struct PostmarkRollups: Decodable {
    let last1h: PostmarkRollupWindow
    let last24h: PostmarkRollupWindow
}

struct PostmarkInvariantBreach: Decodable {
    let active: Bool
    let code: String?
    let severity: String?
    let message: String?
    let detectedAt: String?
}

struct PostmarkInvariantSet: Decodable {
    let sendStateBreach: PostmarkInvariantBreach
}

struct PostmarkOperatorSummary: Decodable {
    let tenantId: String
    let paused: Bool
    let pausedUntil: String?
    let pauseReason: String?
    let resumeChecklistAck: Bool
    let rollups: PostmarkRollups
    let invariants: PostmarkInvariantSet
}

struct PollResponse: Decodable {
    let jobId: String?
    let queue: String
}

struct OperatorActionResponse: Decodable {
    let resumed: Bool?
    let reason: String?
}

struct OperatorKPI: Decodable {
    let revenueMonth: Int
    let attributedBookingsMonth: Int
    let new5starReviewsMonth: Int
    let emailConversionRate: Double
    let portfolioHealthScore: Int
    let actionRequiredCount: Int
}

struct DashboardWidgets: Decodable {
    let openAlerts: Int
    let eventsLast24h: Int
    let lastUpdatedAt: String
}

struct DashboardSummaryResponse: Decodable {
    let tenantId: String
    let kpis: OperatorKPI
    let widgets: DashboardWidgets
}

struct OperatorHealth: Decodable {
    let deliverability: String
    let reviewVelocity: String
    let engagementTrend: String
    let workerLiveness: String
    let lastPipelineRun: String?
}

struct CommandCenterAlert: Decodable, Identifiable, Hashable {
    let id: String
    let type: String
    let severity: String
    let tenantId: String
    let title: String
    let suggestedAction: String
    let executeCapability: String
    let createdAt: String
    let resolvedAt: String?
}

struct OperatorActivityEvent: Decodable, Identifiable {
    let eventType: String
    let tenantId: String
    let summary: String
    let amountCents: Int?
    let createdAt: String

    var id: String { "\(eventType)-\(createdAt)-\(summary)" }
}

struct OperatorEventsResponse: Decodable {
    let items: [OperatorActivityEvent]
    let nextCursor: String?
}

struct CommandCenterPayload: Decodable {
    let tenantId: String
    let kpis: OperatorKPI
    let health: OperatorHealth
    let alerts: [CommandCenterAlert]
    let activityFeed: [OperatorActivityEvent]
}

struct InterventionResponse: Decodable {
    let ok: Bool
    let intervention: String
    let alertId: String?
    let resolvedAt: String?
}

struct OperatorAlertListItem: Decodable, Identifiable, Hashable {
    let id: String
    let type: String
    let severity: String
    let state: String
    let tenantId: String
    let title: String
    let suggestedAction: String
    let executeCapability: String
    let createdAt: String
    let resolvedAt: String?
}

struct OperatorAlertsResponse: Decodable {
    let items: [OperatorAlertListItem]
}

struct OperatorTenantSummary: Decodable, Identifiable {
    let id: String
    let slug: String
    let name: String
    let healthScore: Int
    let actionRequiredCount: Int
}

struct OperatorTenantListResponse: Decodable {
    let items: [OperatorTenantSummary]
}

struct OperatorTenantDetail: Decodable {
    let id: String
    let slug: String
    let name: String
    let healthScore: Int
    let actionRequiredCount: Int
    let createdAt: String
}

struct MoneyMetricPoint: Decodable, Identifiable {
    let date: String
    let amountCents: Int

    var id: String { date }
}

struct CountMetricPoint: Decodable, Identifiable {
    let date: String
    let count: Int

    var id: String { date }
}

struct OperatorTenantMetricsResponse: Decodable {
    let tenantId: String
    let range: String
    let revenueSeries: [MoneyMetricPoint]
    let bookingSeries: [CountMetricPoint]
    let reviewSeries: [CountMetricPoint]
}

struct MonthlyReportTotals: Decodable {
    let revenueCents: Int
    let attributedCents: Int
    let bookingsCount: Int
    let sentCount: Int
    let clickCount: Int
}

struct MonthlyReportEstimates: Decodable {
    let conservativeBookings: Int
    let baseBookings: Int
    let aggressiveBookings: Int
}

struct MonthlyReportBenefit: Decodable, Identifiable {
    let benefit: String
    let mentions: Int

    var id: String { benefit }
}

struct MonthlyReportPayload: Decodable {
    let tenantId: String
    let month: String
    let generatedAt: String
    let totals: MonthlyReportTotals
    let estimates: MonthlyReportEstimates
    let praisedBenefits: [MonthlyReportBenefit]
    let narrative: String
}

struct OperatorAlert: Identifiable, Hashable {
    enum Severity: String {
        case critical
        case warning
        case info
    }

    let id: String
    let severity: Severity
    let title: String
    let message: String
    let source: String
}
