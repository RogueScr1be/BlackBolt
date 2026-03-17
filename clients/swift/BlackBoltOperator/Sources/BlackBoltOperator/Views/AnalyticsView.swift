import SwiftUI

struct AnalyticsView: View {
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Portfolio Analytics")
                .font(.title3)
                .fontWeight(.semibold)

            if showsAnalyticsLoading {
                ProgressView("Loading analytics...")
            } else if let degradedMessage {
                Text(degradedMessage)
                    .font(.caption)
                    .foregroundColor(.orange)
                analyticsContent
            } else if hasAnalyticsContent {
                analyticsContent
            } else if let failureMessage {
                Text(failureMessage)
                    .font(.caption)
                    .foregroundColor(.red)
            } else {
                Text("No analytics available yet.")
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding(16)
    }

    private var hasAnalyticsContent: Bool {
        store.dashboard != nil || store.tenantMetrics != nil
    }

    private var showsAnalyticsLoading: Bool {
        !hasAnalyticsContent && (store.dashboardState == .loading || store.tenantsState == .loading)
    }

    private var degradedMessage: String? {
        switch (dashboardContentState, metricsContentState) {
        case (.degraded(let error), _):
            return "Dashboard analytics are partially degraded: \(error.message)"
        case (_, .degraded(let error)):
            return "Tenant metrics are partially degraded: \(error.message)"
        default:
            return nil
        }
    }

    private var failureMessage: String? {
        switch (dashboardContentState, metricsContentState) {
        case (.failed(let error), _):
            return error.message
        case (_, .failed(let error)):
            return error.message
        default:
            return nil
        }
    }

    private var dashboardContentState: OperatorContentState {
        store.contentState(for: store.dashboardState, hasContent: store.dashboard != nil)
    }

    private var metricsContentState: OperatorContentState {
        store.contentState(for: store.tenantsState, hasContent: store.tenantMetrics != nil)
    }

    @ViewBuilder
    private var analyticsContent: some View {
        if let dashboard = store.dashboard {
            GroupBox("Comparative Table") {
                HStack {
                    metric("Revenue", "\(dashboard.kpis.revenueMonth)")
                    Spacer()
                    metric("Bookings", "\(dashboard.kpis.attributedBookingsMonth)")
                    Spacer()
                    metric("Conversion", String(format: "%.2f%%", dashboard.kpis.emailConversionRate * 100))
                }
            }
        }

        if let metrics = store.tenantMetrics {
            GroupBox("Metrics Range: \(metrics.range)") {
                Text("Revenue points: \(metrics.revenueSeries.count)")
                Text("Booking points: \(metrics.bookingSeries.count)")
                Text("Review points: \(metrics.reviewSeries.count)")
            }
        }
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(value)
                .font(.title3.monospacedDigit())
        }
    }
}
