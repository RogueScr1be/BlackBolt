import BlackBoltAPI
import Foundation

private func makeOperatorISO8601Formatter() -> ISO8601DateFormatter {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
}

private func isoString(_ date: Date?) -> String? {
    guard let date else { return nil }
    return makeOperatorISO8601Formatter().string(from: date)
}

private func isoStringOrDash(_ date: Date?) -> String {
    isoString(date) ?? "-"
}

private func stringValue<T: RawRepresentable>(_ value: T?) -> String where T.RawValue == String {
    value?.rawValue ?? ""
}

extension CustomerSegmentItem {
    init(api: Components.Schemas.CustomerSegmentCount) {
        self.segment = api.segment.rawValue
        self.count = api.count
    }
}

extension CustomerSegmentSummaryResponse {
    init(api: Components.Schemas.CustomerSegmentsResponse) {
        self.tenantId = api.tenantId
        self.total = api.total
        self.items = api.items.map(CustomerSegmentItem.init(api:))
    }
}

extension RevenueImportError {
    init(api: Components.Schemas.RevenueImportError) {
        self.rowNum = api.rowNum ?? 0
        self.code = api.code
        self.message = api.message
    }
}

extension CreateRevenueImportResponse {
    init(api: Components.Schemas.CreateRevenueImportResponse) {
        self.revenueImportId = api.revenueImportId
        self.status = api.status.rawValue
    }
}

extension RevenueImportListItem {
    init(api: Components.Schemas.RevenueImportListItem) {
        self.revenueImportId = api.revenueImportId
        self.tenantId = api.tenantId
        self.status = api.status.rawValue
        self.totalRows = api.totalRows
        self.processedRows = api.processedRows
        self.succeededRows = api.succeededRows
        self.failedRows = api.failedRows
        self.duplicateRows = api.duplicateRows
        self.createdAt = isoString(api.createdAt) ?? ""
        self.finishedAt = isoString(api.finishedAt)
    }
}

extension RevenueImportListResponse {
    init(api: Components.Schemas.RevenueImportListResponse) {
        self.items = api.items.map(RevenueImportListItem.init(api:))
    }
}

extension RevenueImportStatusResponse {
    init(api: Components.Schemas.RevenueImportStatusResponse) {
        self.revenueImportId = api.revenueImportId
        self.tenantId = api.tenantId
        self.status = api.status.rawValue
        self.totalRows = api.totalRows
        self.processedRows = api.processedRows
        self.succeededRows = api.succeededRows
        self.failedRows = api.failedRows
        self.duplicateRows = api.duplicateRows
        self.errors = (api.errors ?? []).map(RevenueImportError.init(api:))
        self.createdAt = isoString(api.createdAt) ?? ""
        self.finishedAt = isoString(api.finishedAt)
    }
}

extension CustomerRow {
    init(api: Components.Schemas.Customer) {
        self.id = api.id
        self.email = api.email
        self.displayName = api.displayName
        self.segment = api.segment.rawValue
    }
}

extension CustomersPage {
    init(api: Components.Schemas.ListCustomersResponse) {
        self.items = api.items.map(CustomerRow.init(api:))
        self.nextCursor = api.nextCursor
    }
}

extension GbpTelemetry {
    init(api: Components.Schemas.JobRunTelemetry) {
        self.pagesFetched = api.pagesFetched
        self.reviewsFetched = api.reviewsFetched
        self.upserted = api.upserted
        self.skipped = api.skipped
        self.cooldownApplied = api.cooldownApplied
        self.errorClass = api.errorClass
    }
}

extension LatestGbpJobRun {
    init(api: Components.Schemas.GbpOperatorSummaryResponse.LatestJobRunPayload) {
        self.id = api.value1.id
        self.state = api.value1.state.rawValue
        self.errorCode = api.value1.errorCode
        self.errorMessage = api.value1.errorMessage
        self.metadataJson = api.value1.metadataJson.map { GbpTelemetry(api: $0.value1) }
        self.createdAt = isoString(api.value1.createdAt) ?? ""
        self.finishedAt = isoString(api.value1.finishedAt)
    }
}

extension IntegrationAlertRow {
    init(api: Components.Schemas.IntegrationAlert) {
        self.id = api.id
        self.code = api.code
        self.severity = api.severity
        self.message = api.message
        self.createdAt = isoString(api.createdAt) ?? ""
        self.resolvedAt = isoString(api.resolvedAt)
    }
}

extension GbpOperatorSummary {
    init(api: Components.Schemas.GbpOperatorSummaryResponse) {
        self.tenantId = api.tenantId
        self.gbpIntegrationStatus = api.gbpIntegrationStatus.rawValue
        self.cooldownUntil = isoString(api.cooldownUntil)
        self.lastSuccessAt = isoString(api.lastSuccessAt)
        self.latestJobRun = api.latestJobRun.map(LatestGbpJobRun.init(api:))
        self.alerts = api.alerts.map(IntegrationAlertRow.init(api:))
    }
}

extension MoneyBreakdown {
    init(api: Components.Schemas.MoneyBreakdown) {
        self.amountCents = api.amountCents
        self.currency = api.currency
    }
}

extension RevenueTopCampaign {
    init(api: Components.Schemas.RevenueTopCampaign) {
        self.campaignId = api.campaignId
        self.campaignKey = api.campaignKey
        self.attributed = MoneyBreakdown(api: api.attributed)
        self.direct = MoneyBreakdown(api: api.direct ?? api.attributed)
        self.assisted = MoneyBreakdown(api: api.assisted ?? api.attributed)
    }
}

extension RevenueDiagnostics {
    init(api: Components.Schemas.RevenueSummaryDiagnostics) {
        self.durationMs = api.durationMs
        self.prismaCalls = api.prismaCalls
    }
}

extension RevenueSummaryRange {
    init(api: Components.Schemas.RevenueSummaryResponse.RangePayload) {
        self.from = isoString(api.from) ?? ""
        self.to = isoString(api.to) ?? ""
    }
}

extension RevenueSummaryRollup {
    init(api: Components.Schemas.RevenueRollup) {
        self.total = MoneyBreakdown(api: api.total)
        self.direct = MoneyBreakdown(api: api.direct)
        self.assisted = MoneyBreakdown(api: api.assisted)
        self.unattributed = MoneyBreakdown(api: api.unattributed)
    }
}

extension RevenueSummaryResponse {
    init(api: Components.Schemas.RevenueSummaryResponse) {
        self.tenantId = api.tenantId
        self.model = api.model.rawValue
        self.windowDaysDirect = api.windowDaysDirect.rawValue
        self.windowDaysAssisted = api.windowDaysAssisted.rawValue
        self.range = RevenueSummaryRange(api: api.range)
        self.rollup = RevenueSummaryRollup(api: api.rollup)
        self.topCampaigns = api.topCampaigns.map(RevenueTopCampaign.init(api:))
        self.diagnostics = api.diagnostics.map { RevenueDiagnostics(api: $0.value1) }
    }
}

extension PostmarkRollupWindow {
    init(api: Components.Schemas.PostmarkRollup) {
        self.sent = api.sent
        self.simulated = api.simulated
        self.failed = api.failed
    }
}

extension PostmarkRollups {
    init(api: Components.Schemas.PostmarkOperatorSummaryResponse.RollupsPayload) {
        self.last1h = PostmarkRollupWindow(api: api.last1h)
        self.last24h = PostmarkRollupWindow(api: api.last24h)
    }
}

extension PostmarkInvariantBreach {
    init(api: Components.Schemas.PostmarkOperatorSummaryResponse.InvariantsPayload.SendStateBreachPayload?) {
        self.active = api != nil
        self.code = api?.value1.code?.rawValue
        self.severity = api?.value1.severity?.rawValue
        self.message = api?.value1.message
        self.detectedAt = isoString(api?.value1.detectedAt)
    }
}

extension PostmarkInvariantSet {
    init(api: Components.Schemas.PostmarkOperatorSummaryResponse.InvariantsPayload) {
        let breach = api.sendStateBreach ?? api.breaches.first.map { .init(value1: $0) }
        self.sendStateBreach = PostmarkInvariantBreach(api: breach)
    }
}

extension PostmarkOperatorSummary {
    init(api: Components.Schemas.PostmarkOperatorSummaryResponse) {
        self.tenantId = api.tenantId
        self.paused = api.paused
        self.pausedUntil = isoString(api.pausedUntil)
        self.pauseReason = api.pauseReason
        self.resumeChecklistAck = api.resumeChecklistAck
        self.rollups = PostmarkRollups(api: api.rollups)
        self.invariants = PostmarkInvariantSet(api: api.invariants)
    }
}

extension PollResponse {
    init(api: Components.Schemas.PollReviewsResponse) {
        self.jobId = api.jobId
        self.queue = api.queue
    }
}

extension OperatorActionResponse {
    init(api: Components.Schemas.PostmarkResumeResponse) {
        self.resumed = api.resumed
        self.reason = api.reason
    }
}

extension OperatorKPI {
    init(api: Components.Schemas.OperatorKPI) {
        self.revenueMonth = api.revenueMonth
        self.attributedBookingsMonth = api.attributedBookingsMonth
        self.new5starReviewsMonth = api.new5starReviewsMonth
        self.emailConversionRate = api.emailConversionRate
        self.portfolioHealthScore = api.portfolioHealthScore
        self.actionRequiredCount = api.actionRequiredCount
    }
}

extension DashboardWidgets {
    init(api: Components.Schemas.DashboardSummaryWidget) {
        self.openAlerts = api.openAlerts
        self.eventsLast24h = api.eventsLast24h
        self.lastUpdatedAt = isoString(api.lastUpdatedAt) ?? ""
    }
}

extension DashboardSummaryResponse {
    init(api: Components.Schemas.DashboardSummaryResponse) {
        self.tenantId = api.tenantId
        self.kpis = OperatorKPI(api: api.kpis)
        self.widgets = DashboardWidgets(api: api.widgets)
    }
}

extension OperatorHealth {
    init(api: Components.Schemas.OperatorHealth) {
        self.deliverability = api.deliverability.rawValue
        self.reviewVelocity = api.reviewVelocity.rawValue
        self.engagementTrend = api.engagementTrend.rawValue
        self.workerLiveness = api.workerLiveness.rawValue
        self.lastPipelineRun = isoString(api.lastPipelineRun)
    }
}

extension CommandCenterAlert {
    init(api: Components.Schemas.OperatorAlert) {
        self.id = api.id
        self.type = api._type
        self.severity = api.severity.rawValue
        self.tenantId = api.tenantId
        self.title = api.title
        self.suggestedAction = api.suggestedAction
        self.executeCapability = api.executeCapability.rawValue
        self.createdAt = isoString(api.createdAt) ?? ""
        self.resolvedAt = isoString(api.resolvedAt)
    }
}

extension OperatorActivityEvent {
    init(api: Components.Schemas.OperatorEvent) {
        self.eventType = api.eventType
        self.tenantId = api.tenantId
        self.summary = api.summary
        self.amountCents = api.amountCents
        self.createdAt = isoString(api.createdAt) ?? ""
    }

    init(api: Components.Schemas.OperatorActivityEvent) {
        self.eventType = api.eventType
        self.tenantId = api.tenantId
        self.summary = api.summary
        self.amountCents = api.amountCents
        self.createdAt = isoString(api.createdAt) ?? ""
    }
}

extension OperatorEventsResponse {
    init(api: Components.Schemas.OperatorEventsResponse) {
        self.items = api.items.map(OperatorActivityEvent.init(api:))
        self.nextCursor = api.nextCursor
    }
}

extension CommandCenterPayload {
    init(api: Components.Schemas.CommandCenterPayload) {
        self.tenantId = api.tenantId
        self.kpis = OperatorKPI(api: api.kpis)
        self.health = OperatorHealth(api: api.health)
        self.alerts = api.alerts.map(CommandCenterAlert.init(api:))
        self.activityFeed = api.activityFeed.map(OperatorActivityEvent.init(api:))
    }
}

extension OperatorAlertListItem {
    init(api: Components.Schemas.OperatorAlertListItem) {
        self.id = api.value1.id
        self.type = api.value1._type
        self.severity = api.value1.severity.rawValue
        self.state = api.value2.state.rawValue
        self.tenantId = api.value1.tenantId
        self.title = api.value1.title
        self.suggestedAction = api.value1.suggestedAction
        self.executeCapability = api.value1.executeCapability.rawValue
        self.createdAt = isoString(api.value1.createdAt) ?? ""
        self.resolvedAt = isoString(api.value1.resolvedAt)
    }
}

extension OperatorAlertsResponse {
    init(api: Components.Schemas.OperatorAlertsResponse) {
        self.items = api.items.map(OperatorAlertListItem.init(api:))
    }
}

extension OperatorTenantSummary {
    init(api: Components.Schemas.OperatorTenantSummary) {
        self.id = api.id
        self.slug = api.slug
        self.name = api.name
        self.healthScore = api.healthScore
        self.actionRequiredCount = api.actionRequiredCount
    }
}

extension OperatorTenantListResponse {
    init(api: Components.Schemas.OperatorTenantListResponse) {
        self.items = api.items.map(OperatorTenantSummary.init(api:))
    }
}

extension OperatorTenantDetail {
    init(api: Components.Schemas.OperatorTenantDetail) {
        self.id = api.value1.id
        self.slug = api.value1.slug
        self.name = api.value1.name
        self.healthScore = api.value1.healthScore
        self.actionRequiredCount = api.value1.actionRequiredCount
        self.createdAt = isoString(api.value2.createdAt) ?? ""
    }
}

extension MoneyMetricPoint {
    init(api: Components.Schemas.MetricPointMoney) {
        self.date = api.date
        self.amountCents = api.amountCents
    }
}

extension CountMetricPoint {
    init(api: Components.Schemas.MetricPointCount) {
        self.date = api.date
        self.count = api.count
    }
}

extension OperatorTenantMetricsResponse {
    init(api: Components.Schemas.OperatorTenantMetricsResponse) {
        self.tenantId = api.tenantId
        self.range = api.range.rawValue
        self.revenueSeries = api.revenueSeries.map(MoneyMetricPoint.init(api:))
        self.bookingSeries = api.bookingSeries.map(CountMetricPoint.init(api:))
        self.reviewSeries = api.reviewSeries.map(CountMetricPoint.init(api:))
    }
}

extension BootstrapStatusCheck {
    init(api: Components.Schemas.BootstrapStatusCheck) {
        self.required = api.required
        self.ready = api.ready
        self.mode = api.mode?.rawValue
        self.message = api.message
    }
}

extension BootstrapStatusChecks {
    init(api: Components.Schemas.BootstrapStatusChecks) {
        self.operatorAuth = BootstrapStatusCheck(api: api.operatorAuth)
        self.gbpIntegration = BootstrapStatusCheck(api: api.gbpIntegration)
        self.postmarkWebhook = BootstrapStatusCheck(api: api.postmarkWebhook)
        self.reviewScheduler = BootstrapStatusCheck(api: api.reviewScheduler)
        self.sendMode = BootstrapStatusCheck(api: api.sendMode)
    }
}

extension BootstrapStatusResponse {
    init(api: Components.Schemas.BootstrapStatusResponse) {
        self.tenantId = api.tenantId
        self.overallReady = api.overallReady
        self.checks = BootstrapStatusChecks(api: api.checks)
        self.missing = api.missing
    }
}

extension MonthlyReportTotals {
    init(api: Components.Schemas.MonthlyReportTotals) {
        self.revenueCents = api.revenueCents
        self.attributedCents = api.attributedCents
        self.bookingsCount = api.bookingsCount
        self.sentCount = api.sentCount
        self.clickCount = api.clickCount
        self.runCount = api.runCount
        self.runMessagesSent = api.runMessagesSent
        self.runMessagesFailed = api.runMessagesFailed
        self.runMessagesQueued = api.runMessagesQueued
    }
}

extension MonthlyReportEstimates {
    init(api: Components.Schemas.MonthlyReportEstimate) {
        self.conservativeBookings = api.conservativeBookings
        self.baseBookings = api.baseBookings
        self.aggressiveBookings = api.aggressiveBookings
    }
}

extension MonthlyReportMetrics {
    init(api: Components.Schemas.MonthlyReportMetrics) {
        self.new5starReviews = api.new5starReviews
        self.reactivationEmailsSent = api.reactivationEmailsSent
        self.openCount = api.openCount
        self.clickCount = api.clickCount
        self.openRate = api.openRate
        self.clickRate = api.clickRate
        self.estimatedBookingsDriven = api.estimatedBookingsDriven
        self.estimatedRevenueImpactCents = api.estimatedRevenueImpactCents
    }
}

extension MonthlyReportBenefit {
    init(api: Components.Schemas.MonthlyReportBenefit) {
        self.benefit = api.benefit
        self.mentions = api.mentions
    }
}

extension MonthlyReportPayload {
    init(api: Components.Schemas.MonthlyReportPayload) {
        self.tenantId = api.tenantId
        self.month = api.month
        self.generatedAt = isoString(api.generatedAt) ?? ""
        self.metrics = MonthlyReportMetrics(api: api.metrics)
        self.totals = MonthlyReportTotals(api: api.totals)
        self.estimates = MonthlyReportEstimates(api: api.estimates)
        self.praisedBenefits = api.praisedBenefits.map(MonthlyReportBenefit.init(api:))
        self.narrative = api.narrative
    }
}

extension CampaignRunSummary {
    init(api: Components.Schemas.CampaignRunSummary) {
        self.id = api.id
        self.status = api.status.rawValue
        self.segmentMode = api.segmentMode.rawValue
        self.sendWindowAt = isoString(api.sendWindowAt) ?? ""
        self.recipientsTotal = api.recipientsTotal
        self.messagesQueued = api.messagesQueued
        self.messagesSent = api.messagesSent
        self.messagesFailed = api.messagesFailed
        self.lastErrorCode = api.lastErrorCode
        self.lastErrorMessage = api.lastErrorMessage
        self.createdAt = isoString(api.createdAt) ?? ""
        self.updatedAt = isoString(api.updatedAt) ?? ""
    }
}

extension CampaignRunsResponse {
    init(api: Operations.ListCampaignRuns.Output.Ok.Body.JsonPayload) {
        self.items = api.items.map(CampaignRunSummary.init(api:))
    }
}

extension OperatorReviewQueueItem {
    init(api: Components.Schemas.OperatorReviewQueueItem) {
        self.id = api.id
        self.tenantId = api.tenantId
        self.reviewId = api.reviewId
        self.triggerReviewId = api.triggerReviewId
        self.campaignRunId = api.campaignRunId
        self.approvalId = api.approvalId
        self.state = api.state.rawValue
        self.rating = api.rating
        self.serviceMentioned = api.serviceMentioned
        self.keyBenefit = api.keyBenefit
        self.confidence = api.confidence
        self.createdAt = isoString(api.createdAt) ?? ""
        self.updatedAt = isoString(api.updatedAt) ?? ""
    }
}

extension OperatorReviewQueueResponse {
    init(api: Components.Schemas.OperatorReviewQueueResponse) {
        self.items = api.items.map(OperatorReviewQueueItem.init(api:))
    }
}

extension OperatorApprovalSummary {
    init(api: Components.Schemas.OperatorApprovalSummary) {
        self.id = api.id
        self.tenantId = api.tenantId
        self.campaignRunId = api.campaignRunId
        self.triggerReviewId = api.triggerReviewId
        self.state = api.state.rawValue
        self.subject = api.subject
        self.body = api.body
        self.segment = api.segment.rawValue
        self.sendWindowAt = isoString(api.sendWindowAt)
        self.createdAt = isoString(api.createdAt) ?? ""
        self.updatedAt = isoString(api.updatedAt) ?? ""
    }
}

extension OperatorApprovalListResponse {
    init(api: Components.Schemas.OperatorApprovalListResponse) {
        self.items = api.items.map(OperatorApprovalSummary.init(api:))
    }
}

extension OperatorApprovalDraft {
    init(api: Components.Schemas.OperatorApprovalDraft) {
        self.subject = api.subject
        self.body = api.body
        self.segment = api.segment.rawValue
        self.sendWindowAt = isoString(api.sendWindowAt)
    }
}

extension OperatorApprovalCounts {
    init(api: Components.Schemas.OperatorApprovalCounts) {
        self.queued = api.queued
        self.paused = api.paused
        self.sent = api.sent
        self.failed = api.failed
        self.total = api.total
    }
}

extension OperatorApprovalDetail {
    init(api: Components.Schemas.OperatorApprovalDetail) {
        self.id = api.id
        self.tenantId = api.tenantId
        self.campaignRunId = api.campaignRunId
        self.triggerReviewId = api.triggerReviewId
        self.state = api.state.rawValue
        self.requiredRole = api.requiredRole
        self.draft = OperatorApprovalDraft(api: api.draft)
        self.counts = OperatorApprovalCounts(api: api.counts)
        self.createdAt = isoString(api.createdAt) ?? ""
        self.updatedAt = isoString(api.updatedAt) ?? ""
        self.approvedAt = isoString(api.approvedAt)
        self.rejectedAt = isoString(api.rejectedAt)
    }
}

extension OperatorSmokeCheck {
    init(api: Components.Schemas.OperatorSmokeCheck) {
        self.name = api.name
        self.path = api.path
        self.passed = api.passed
        self.status = api.status
        self.reason = api.reason
        self.failingHeader = api.failingHeader
    }
}

extension OperatorSmokeResponse {
    init(api: Components.Schemas.OperatorSmokeResponse) {
        self.tenantId = api.tenantId
        self.overallPassed = api.overallPassed
        self.checks = api.checks.map(OperatorSmokeCheck.init(api:))
    }
}
