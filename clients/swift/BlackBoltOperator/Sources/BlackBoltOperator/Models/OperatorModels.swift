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
    let pages_fetched: Int?
    let reviews_fetched: Int?
    let upserted: Int?
    let skipped: Int?
    let cooldown_applied: Bool?
    let error_class: String?
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
