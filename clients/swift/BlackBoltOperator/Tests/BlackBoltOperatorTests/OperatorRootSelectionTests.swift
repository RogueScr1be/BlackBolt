import XCTest
@testable import BlackBoltOperator

@MainActor
final class OperatorRootSelectionTests: XCTestCase {
    func testOperatorSectionRawValuesRemainStableForSidebarBinding() {
        XCTAssertEqual(OperatorSection.dashboard.rawValue, "Dashboard")
        XCTAssertEqual(OperatorSection.tenants.rawValue, "Tenants")
        XCTAssertEqual(OperatorSection.campaignEngine.rawValue, "Campaign Engine")
        XCTAssertEqual(OperatorSection.reviewQueue.rawValue, "Review Queue")
        XCTAssertEqual(OperatorSection.approvals.rawValue, "Approvals")
        XCTAssertEqual(OperatorSection.alerts.rawValue, "Alerts")
        XCTAssertEqual(OperatorSection.analytics.rawValue, "Analytics")
        XCTAssertEqual(OperatorSection.reports.rawValue, "Reports")
        XCTAssertEqual(OperatorSection.settings.rawValue, "Settings")
    }
}
