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
