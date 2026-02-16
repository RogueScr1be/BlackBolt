import SwiftUI

struct AnalyticsView: View {
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Portfolio Analytics")
                .font(.title3)
                .fontWeight(.semibold)

            if let payload = store.payload {
                GroupBox("Comparative Table") {
                    HStack {
                        metric("Revenue", "\(payload.kpis.revenueMonth)")
                        Spacer()
                        metric("Bookings", "\(payload.kpis.attributedBookingsMonth)")
                        Spacer()
                        metric("Conversion", String(format: "%.2f%%", payload.kpis.emailConversionRate * 100))
                    }
                }

                GroupBox("Health Trends") {
                    Text("Deliverability: \(payload.health.deliverability)")
                    Text("Review velocity: \(payload.health.reviewVelocity)")
                    Text("Engagement trend: \(payload.health.engagementTrend)")
                    Text("Worker liveness: \(payload.health.workerLiveness)")
                }
            } else {
                Text("No analytics available")
                    .foregroundColor(.secondary)
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
