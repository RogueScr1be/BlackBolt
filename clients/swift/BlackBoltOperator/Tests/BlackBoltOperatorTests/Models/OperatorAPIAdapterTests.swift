import BlackBoltAPI
import XCTest

@testable import BlackBoltOperator

final class OperatorAPIAdapterTests: XCTestCase {
    func testDashboardAlertsTenantsAndEventsAdaptersMapCanonicalPayloads() {
        let timestamp = Date(timeIntervalSince1970: 1_710_000_000)

        let dashboard = DashboardSummaryResponse(
            api: Components.Schemas.DashboardSummaryResponse(
                tenantId: "tenant-1",
                kpis: .init(
                    revenueMonth: 125_000,
                    attributedBookingsMonth: 8,
                    new5starReviewsMonth: 3,
                    emailConversionRate: 0.12,
                    portfolioHealthScore: 93,
                    actionRequiredCount: 1
                ),
                widgets: .init(
                    openAlerts: 1,
                    eventsLast24h: 4,
                    lastUpdatedAt: timestamp
                )
            )
        )
        let alerts = OperatorAlertsResponse(
            api: Components.Schemas.OperatorAlertsResponse(items: [
                .init(
                    value1: .init(
                        id: "alert-1",
                        _type: "delivery",
                        severity: .critical,
                        tenantId: "tenant-1",
                        title: "Delivery paused",
                        suggestedAction: "Resume Postmark",
                        executeCapability: .resumePostmark,
                        createdAt: timestamp,
                        resolvedAt: nil
                    ),
                    value2: .init(state: .open)
                )
            ])
        )
        let tenants = OperatorTenantListResponse(
            api: Components.Schemas.OperatorTenantListResponse(items: [
                .init(id: "tenant-1", slug: "tenant-1", name: "Tenant One", healthScore: 88, actionRequiredCount: 2)
            ])
        )
        let events = OperatorEventsResponse(
            api: Components.Schemas.OperatorEventsResponse(items: [
                .init(
                    id: "event-1",
                    eventType: "booking_attributed",
                    tenantId: "tenant-1",
                    summary: "Attributed booking",
                    amountCents: 5_000,
                    createdAt: timestamp
                )
            ])
        )

        XCTAssertEqual(dashboard.tenantId, "tenant-1")
        XCTAssertEqual(dashboard.widgets.openAlerts, 1)
        XCTAssertEqual(alerts.items.first?.severity, "critical")
        XCTAssertEqual(alerts.items.first?.executeCapability, "resume-postmark")
        XCTAssertEqual(tenants.items.first?.name, "Tenant One")
        XCTAssertEqual(events.items.first?.eventType, "booking_attributed")
    }

    func testApprovalAndReportAdaptersMapCanonicalPayloads() {
        let timestamp = Date(timeIntervalSince1970: 1_710_000_000)

        let approval = OperatorApprovalDetail(
            api: Components.Schemas.OperatorApprovalDetail(
                id: "approval-1",
                tenantId: "tenant-1",
                state: .awaitingApproval,
                requiredRole: "operator",
                draft: .init(
                    subject: "Come back soon",
                    body: "We saved your spot.",
                    segment: .lastSeen90365,
                    sendWindowAt: timestamp
                ),
                counts: .init(queued: 10, paused: 2, sent: 3, failed: 1, total: 16),
                createdAt: timestamp,
                updatedAt: timestamp
            )
        )
        let report = MonthlyReportPayload(
            api: Components.Schemas.MonthlyReportPayload(
                tenantId: "tenant-1",
                month: "2026-03",
                generatedAt: timestamp,
                metrics: .init(
                    new5starReviews: 4,
                    reactivationEmailsSent: 12,
                    openCount: 24,
                    clickCount: 6,
                    openRate: 0.4,
                    clickRate: 0.1,
                    estimatedBookingsDriven: 3,
                    estimatedRevenueImpactCents: 25_000
                ),
                totals: .init(
                    revenueCents: 100_000,
                    attributedCents: 40_000,
                    bookingsCount: 5,
                    sentCount: 20,
                    clickCount: 6,
                    runCount: 2,
                    runMessagesSent: 12,
                    runMessagesFailed: 1,
                    runMessagesQueued: 7
                ),
                estimates: .init(conservativeBookings: 2, baseBookings: 3, aggressiveBookings: 5),
                praisedBenefits: [.init(benefit: "friendly staff", mentions: 3)],
                narrative: "Healthy month."
            )
        )

        XCTAssertEqual(approval.id, "approval-1")
        XCTAssertEqual(approval.draft.segment, "last_seen_90_365")
        XCTAssertEqual(approval.counts.total, 16)
        XCTAssertEqual(report.month, "2026-03")
        XCTAssertEqual(report.totals.attributedCents, 40_000)
        XCTAssertEqual(report.praisedBenefits.first?.benefit, "friendly staff")
    }

    func testRevenueAdapterMapsCanonicalProofShapeWithoutLegacyWindows() {
        let timestamp = Date(timeIntervalSince1970: 1_710_000_000)

        let revenue = RevenueSummaryResponse(
            api: Components.Schemas.RevenueSummaryResponse(
                tenantId: "tenant-1",
                model: .lastTouch,
                windowDaysDirect: ._7,
                windowDaysAssisted: ._30,
                range: .init(from: timestamp.addingTimeInterval(-86_400), to: timestamp),
                rollup: .init(
                    total: .init(amountCents: 150_000, currency: "USD"),
                    direct: .init(amountCents: 90_000, currency: "USD"),
                    assisted: .init(amountCents: 40_000, currency: "USD"),
                    unattributed: .init(amountCents: 20_000, currency: "USD")
                ),
                topCampaigns: [
                    .init(
                        campaignId: "run-1",
                        campaignKey: "march-winback",
                        attributed: .init(amountCents: 90_000, currency: "USD"),
                        direct: .init(amountCents: 70_000, currency: "USD"),
                        assisted: .init(amountCents: 20_000, currency: "USD")
                    )
                ],
                diagnostics: .init(value1: .init(durationMs: 12, prismaCalls: 4))
            )
        )

        XCTAssertEqual(revenue.model, "LAST_TOUCH")
        XCTAssertEqual(revenue.windowDaysDirect, 7)
        XCTAssertEqual(revenue.rollup.direct.amountCents, 90_000)
        XCTAssertEqual(revenue.topCampaigns.first?.campaignKey, "march-winback")
        XCTAssertEqual(revenue.diagnostics?.prismaCalls, 4)
    }
}
