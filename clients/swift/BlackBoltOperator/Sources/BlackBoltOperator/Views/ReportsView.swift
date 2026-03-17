import SwiftUI

struct ReportsView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore
    @State private var month = Self.defaultMonth()
    @State private var exportMessage: String?
    @State private var isExporting = false

    private let apiService: any OperatorAPIServicing

    init(store: OperatorShellStore, apiService: any OperatorAPIServicing = GeneratedOperatorAPIService()) {
        self._store = ObservedObject(wrappedValue: store)
        self.apiService = apiService
    }

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
                .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                Button(isExporting ? "Exporting..." : "Export PDF") {
                    exportCurrentReport()
                }
                .disabled(store.report == nil || isExporting || !store.hasRequiredSettings(runtime: runtime))
            }

            switch reportContentState {
            case .loading:
                ProgressView("Loading monthly report...")
            case .failed(let sectionError):
                HStack {
                    Text(sectionError.message)
                        .font(.caption)
                        .foregroundColor(.red)
                    Spacer()
                    Button("Retry Report") {
                        Task { await store.loadMonthlyReport(runtime: runtime, month: month) }
                    }
                    .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                }
            case .empty:
                Text("Generate a month report to view details.")
                    .foregroundColor(.secondary)
            case .degraded(let sectionError):
                Text("Monthly report is showing the last successful payload. Latest refresh failed: \(sectionError.message)")
                    .font(.caption)
                    .foregroundColor(.orange)
                reportContent
            case .ready:
                reportContent
            }

            if let exportMessage {
                Text(exportMessage)
                    .font(.caption)
                    .foregroundColor(exportMessage.hasPrefix("Export failed") ? .red : .secondary)
            }
            Spacer()
        }
        .padding(16)
    }

    private var reportContentState: OperatorContentState {
        store.contentState(for: store.reportsState, hasContent: store.report != nil)
    }

    @ViewBuilder
    private var reportContent: some View {
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
        }
    }

    private static func defaultMonth() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM"
        return formatter.string(from: Date())
    }

    private func exportCurrentReport() {
        guard let report = store.report else { return }
        isExporting = true
        exportMessage = nil
        Task {
            defer { isExporting = false }
            do {
                let context = try runtime.apiContext()
                let data = try await apiService.monthlyReportPDF(
                    context: context,
                    tenantId: report.tenantId,
                    month: report.month
                )
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
