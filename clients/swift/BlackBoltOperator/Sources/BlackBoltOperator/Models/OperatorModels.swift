import Foundation

enum OperatorConnectionState: Equatable {
    case ready
    case invalidConfig
    case networkError
    case authError
    case serverError
}

enum SectionLoadState: Equatable {
    case idle
    case loading
    case ready
    case failed(OperatorAppError)
}

enum OperatorContentState: Equatable {
    case loading
    case empty
    case ready
    case degraded(OperatorAppError)
    case failed(OperatorAppError)
}

struct OperatorAppError: Error, Equatable, Identifiable {
    let code: String
    let message: String
    let httpStatus: Int?
    let path: String?

    var id: String { "\(code)-\(httpStatus ?? 0)-\(path ?? "")" }
}

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

struct CustomerSegmentItem: Decodable, Identifiable {
    let segment: String
    let count: Int

    var id: String { segment }
}

struct CustomerSegmentSummaryResponse: Decodable {
    let tenantId: String
    let total: Int
    let items: [CustomerSegmentItem]
}

struct RevenueImportError: Decodable, Identifiable {
    let rowNum: Int
    let code: String
    let message: String

    var id: String { "\(rowNum)-\(code)" }
}

struct CreateRevenueImportResponse: Decodable {
    let revenueImportId: String
    let status: String
}

struct RevenueImportListItem: Decodable, Identifiable {
    let revenueImportId: String
    let tenantId: String
    let status: String
    let totalRows: Int
    let processedRows: Int
    let succeededRows: Int
    let failedRows: Int
    let duplicateRows: Int
    let createdAt: String
    let finishedAt: String?

    var id: String { revenueImportId }
}

struct RevenueImportListResponse: Decodable {
    let items: [RevenueImportListItem]
}

struct RevenueImportStatusResponse: Decodable {
    let revenueImportId: String
    let tenantId: String
    let status: String
    let totalRows: Int
    let processedRows: Int
    let succeededRows: Int
    let failedRows: Int
    let duplicateRows: Int
    let errors: [RevenueImportError]
    let createdAt: String
    let finishedAt: String?
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

struct RevenueSummaryRange: Decodable {
    let from: String
    let to: String
}

struct RevenueSummaryResponse: Decodable {
    let tenantId: String
    let model: String
    let windowDaysDirect: Int
    let windowDaysAssisted: Int
    let range: RevenueSummaryRange
    let rollup: RevenueSummaryRollup
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

struct BootstrapStatusCheck: Decodable {
    let required: Bool
    let ready: Bool
    let mode: String?
    let message: String
}

struct BootstrapStatusChecks: Decodable {
    let operatorAuth: BootstrapStatusCheck
    let gbpIntegration: BootstrapStatusCheck
    let postmarkWebhook: BootstrapStatusCheck
    let reviewScheduler: BootstrapStatusCheck
    let sendMode: BootstrapStatusCheck
}

struct BootstrapStatusResponse: Decodable {
    let tenantId: String
    let overallReady: Bool
    let checks: BootstrapStatusChecks
    let missing: [String]
}

struct MonthlyReportTotals: Decodable {
    let revenueCents: Int
    let attributedCents: Int
    let bookingsCount: Int
    let sentCount: Int
    let clickCount: Int
    let runCount: Int
    let runMessagesSent: Int
    let runMessagesFailed: Int
    let runMessagesQueued: Int
}

struct MonthlyReportEstimates: Decodable {
    let conservativeBookings: Int
    let baseBookings: Int
    let aggressiveBookings: Int
}

struct MonthlyReportMetrics: Decodable {
    let new5starReviews: Int
    let reactivationEmailsSent: Int
    let openCount: Int
    let clickCount: Int
    let openRate: Double
    let clickRate: Double
    let estimatedBookingsDriven: Int
    let estimatedRevenueImpactCents: Int
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
    let metrics: MonthlyReportMetrics
    let totals: MonthlyReportTotals
    let estimates: MonthlyReportEstimates
    let praisedBenefits: [MonthlyReportBenefit]
    let narrative: String
}

struct CampaignRunSummary: Decodable, Identifiable {
    let id: String
    let status: String
    let segmentMode: String
    let sendWindowAt: String
    let recipientsTotal: Int
    let messagesQueued: Int
    let messagesSent: Int
    let messagesFailed: Int
    let lastErrorCode: String?
    let lastErrorMessage: String?
    let createdAt: String
    let updatedAt: String
}

struct CampaignRunsResponse: Decodable {
    let items: [CampaignRunSummary]
}

struct OperatorReviewQueueItem: Decodable, Identifiable {
    let id: String
    let tenantId: String
    let reviewId: String
    let triggerReviewId: String
    let campaignRunId: String?
    let approvalId: String?
    let state: String
    let rating: Int?
    let serviceMentioned: String?
    let keyBenefit: String?
    let confidence: Double
    let createdAt: String
    let updatedAt: String
}

struct OperatorReviewQueueResponse: Decodable {
    let items: [OperatorReviewQueueItem]
}

struct OperatorApprovalSummary: Decodable, Identifiable {
    let id: String
    let tenantId: String
    let campaignRunId: String?
    let triggerReviewId: String?
    let state: String
    let subject: String
    let body: String
    let segment: String
    let sendWindowAt: String?
    let createdAt: String
    let updatedAt: String
}

struct OperatorApprovalListResponse: Decodable {
    let items: [OperatorApprovalSummary]
}

struct OperatorApprovalDraft: Decodable {
    let subject: String
    let body: String
    let segment: String
    let sendWindowAt: String?
}

struct OperatorApprovalCounts: Decodable {
    let queued: Int
    let paused: Int
    let sent: Int
    let failed: Int
    let total: Int
}

struct OperatorApprovalDetail: Decodable {
    let id: String
    let tenantId: String
    let campaignRunId: String?
    let triggerReviewId: String?
    let state: String
    let requiredRole: String
    let draft: OperatorApprovalDraft
    let counts: OperatorApprovalCounts
    let createdAt: String
    let updatedAt: String
    let approvedAt: String?
    let rejectedAt: String?
}

struct OperatorApprovalMutationResponse: Decodable {
    let ok: Bool
    let approvalId: String?
    let campaignRunId: String?
    let queuedCount: Int?
    let rejectedAt: String?
}

struct OperatorSmokeCheck: Decodable, Identifiable {
    let name: String
    let path: String
    let passed: Bool
    let status: Int
    let reason: String?
    let failingHeader: String?

    var id: String { "\(name)-\(path)" }
}

struct OperatorSmokeResponse: Decodable {
    let tenantId: String
    let overallPassed: Bool
    let checks: [OperatorSmokeCheck]
}

struct EndpointDiagnostic: Identifiable, Equatable {
    let path: String
    let statusCode: Int?
    let success: Bool
    let timestamp: Date

    var id: String { "\(path)-\(timestamp.timeIntervalSince1970)" }
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
