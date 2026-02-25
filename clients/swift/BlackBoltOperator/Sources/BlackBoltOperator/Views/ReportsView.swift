import SwiftUI

struct ReportsView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore
    @State private var month = Self.defaultMonth()
    @State private var exportMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Month (YYYY-MM)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                TextField("YYYY-MM", text: $month)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 120)
                Button("Generate") {
                    Task {
                        await store.loadMonthlyReport(runtime: runtime, month: month)
                    }
                }
                .disabled(store.connectionState == .invalidConfig || store.isLoading)
                Button("Export PDF") {
                    exportCurrentReport()
                }
                .disabled(store.report == nil)
            }

            if let report = store.report {
                GroupBox("Report Summary") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Tenant: \(report.tenantId)")
                        Text("Month: \(report.month)")
                        Text("Revenue: \(report.totals.revenueCents) cents")
                        Text("Attributed: \(report.totals.attributedCents) cents")
                        Text("Bookings (cons/base/aggr): \(report.estimates.conservativeBookings)/\(report.estimates.baseBookings)/\(report.estimates.aggressiveBookings)")
                        Text("Runs: \(report.totals.runCount) sent/failed/queued: \(report.totals.runMessagesSent)/\(report.totals.runMessagesFailed)/\(report.totals.runMessagesQueued)")
                        Text(report.narrative)
                    }
                }

                GroupBox("What Patients Praised Most") {
                    if report.praisedBenefits.isEmpty {
                        Text("No benefit tags available for this period")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(report.praisedBenefits) { benefit in
                            Text("\(benefit.benefit): \(benefit.mentions)")
                                .font(.caption)
                        }
                    }
                }
            } else {
                Text("Generate a month report to view details.")
                    .foregroundColor(.secondary)
            }

            if let exportMessage {
                Text(exportMessage)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            if let error = store.lastError {
                HStack {
                    Text(error.message)
                        .font(.caption)
                        .foregroundColor(.red)
                    Spacer()
                    Button("Retry") {
                        Task { await store.loadMonthlyReport(runtime: runtime, month: month) }
                    }
                    .disabled(store.connectionState == .invalidConfig || store.isLoading)
                }
            }
            Spacer()
        }
        .padding(16)
    }

    private static func defaultMonth() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM"
        return formatter.string(from: Date())
    }

    private func exportCurrentReport() {
        guard let report = store.report else { return }
        Task {
            do {
                let request = try runtime.request(path: "/v1/tenants/\(report.tenantId)/reports/monthly/pdf?month=\(report.month)")
                let data = try await OperatorHTTP.perform(request)
                let fileName = "blackbolt-report-\(report.tenantId)-\(report.month).pdf"
                let path = FileManager.default.homeDirectoryForCurrentUser
                    .appendingPathComponent("Downloads")
                    .appendingPathComponent(fileName)
                try data.write(to: path)
                exportMessage = "Exported: \(path.path)"
            } catch {
                exportMessage = "Export failed: \(error.localizedDescription)"
            }
        }
    }
}
