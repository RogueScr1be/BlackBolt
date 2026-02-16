import SwiftUI

struct AnalyticsView: View {
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Portfolio Analytics")
                .font(.title3)
                .fontWeight(.semibold)

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
            } else {
                Text("No analytics available")
                    .foregroundColor(.secondary)
            }

            if let metrics = store.tenantMetrics {
                GroupBox("Metrics Range: \(metrics.range)") {
                    Text("Revenue points: \(metrics.revenueSeries.count)")
                    Text("Booking points: \(metrics.bookingSeries.count)")
                    Text("Review points: \(metrics.reviewSeries.count)")
                }
            }
            Spacer()
        }
        .padding(16)
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
