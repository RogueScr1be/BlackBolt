import SwiftUI
import AppKit

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

        let lines = [
            "BlackBolt Monthly Report",
            "Tenant: \(report.tenantId)",
            "Month: \(report.month)",
            "Generated: \(report.generatedAt)",
            "",
            "Revenue (cents): \(report.totals.revenueCents)",
            "Attributed (cents): \(report.totals.attributedCents)",
            "Bookings: \(report.totals.bookingsCount)",
            "Sent: \(report.totals.sentCount)",
            "Clicks: \(report.totals.clickCount)",
            "",
            "Estimated bookings range (cons/base/aggr): \(report.estimates.conservativeBookings)/\(report.estimates.baseBookings)/\(report.estimates.aggressiveBookings)",
            "",
            "Praised benefits:",
            report.praisedBenefits.map { "- \($0.benefit): \($0.mentions)" }.joined(separator: "\n"),
            "",
            report.narrative
        ].joined(separator: "\n")

        let data = makePDF(from: lines)
        let fileName = "blackbolt-report-\(report.tenantId)-\(report.month).pdf"
        let path = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Downloads")
            .appendingPathComponent(fileName)

        do {
            try data.write(to: path)
            exportMessage = "Exported: \(path.path)"
        } catch {
            exportMessage = "Export failed: \(error.localizedDescription)"
        }
    }

    private func makePDF(from text: String) -> Data {
        let mutableData = NSMutableData()
        guard let consumer = CGDataConsumer(data: mutableData as CFMutableData) else {
            return Data()
        }

        var mediaBox = CGRect(x: 0, y: 0, width: 612, height: 792)
        guard let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            return Data()
        }

        context.beginPDFPage(nil)
        let graphicsContext = NSGraphicsContext(cgContext: context, flipped: false)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = graphicsContext

        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 12),
            .foregroundColor: NSColor.white
        ]
        text.draw(in: CGRect(x: 36, y: 36, width: 540, height: 720), withAttributes: attributes)

        NSGraphicsContext.restoreGraphicsState()
        context.endPDFPage()
        context.closePDF()

        return mutableData as Data
    }
}
