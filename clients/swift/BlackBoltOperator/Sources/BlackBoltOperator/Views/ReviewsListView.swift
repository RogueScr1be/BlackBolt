import BlackBoltAPI
import SwiftUI

private struct ReviewRow: Decodable, Identifiable {
    let id: String
    let sourceReviewId: String
    let rating: Int?
    let body: String?
    let reviewerName: String?
    let reviewedAt: String?
}

private struct ReviewPage: Decodable {
    let items: [ReviewRow]
    let nextCursor: String?
}

private extension ReviewRow {
    init(api: Components.Schemas.Review) {
        self.id = api.id
        self.sourceReviewId = api.sourceReviewId
        self.rating = api.rating
        self.body = api.body
        self.reviewerName = api.reviewerName
        self.reviewedAt = api.reviewedAt.map { ISO8601DateFormatter().string(from: $0) }
    }
}

struct ReviewsListView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @State private var reviews: [ReviewRow] = []
    @State private var summary: GbpOperatorSummary?
    @State private var pollStatus: String = "Idle"
    @State private var errorMessage: String?

    private let apiService: any OperatorAPIServicing

    init(apiService: any OperatorAPIServicing = GeneratedOperatorAPIService()) {
        self.apiService = apiService
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button("Poll GBP") {
                    Task { await poll() }
                }
                Button("Refresh Reviews") {
                    Task { await loadReviews() }
                }
                Button("Refresh Status") {
                    Task { await loadSummary() }
                }
            }
            Text("Tenant: \(runtime.tenantId)")
                .font(.caption)
                .foregroundColor(.secondary)

            Text("Ingestion status: \(pollStatus)")
                .font(.caption)

            if let summary {
                GroupBox("GBP Integration") {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Status: \(summary.gbpIntegrationStatus)")
                        Text("Cooldown Until: \(summary.cooldownUntil ?? "-")")
                        Text("Last Success: \(summary.lastSuccessAt ?? "-")")
                        if let run = summary.latestJobRun {
                            Text("Latest Run: \(run.state) (\(run.id))")
                            if let telemetry = run.metadataJson {
                                Text("Telemetry pages=\(telemetry.pagesFetched ?? 0) fetched=\(telemetry.reviewsFetched ?? 0) upserted=\(telemetry.upserted ?? 0) skipped=\(telemetry.skipped ?? 0)")
                                    .font(.caption)
                            }
                        }
                    }
                }
            }

            if let errorMessage {
                Text(errorMessage).foregroundColor(.red)
            }

            if let summary {
                GroupBox("Integration Alerts") {
                    List(summary.alerts) { alert in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("[\(alert.severity)] \(alert.code)").font(.headline)
                            Text(alert.message).font(.caption)
                        }
                    }
                    .frame(minHeight: 120, maxHeight: 180)
                }
            }

            List(reviews) { row in
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.body ?? "(no body)").font(.body)
                    Text("rating: \(row.rating.map(String.init) ?? "-") reviewer: \(row.reviewerName ?? "-")")
                        .font(.caption)
                }
            }
        }
        .padding()
    }

    private func poll() async {
        do {
            let context = try runtime.apiContext()
            let result = try await apiService.pollReviews(context: context, tenantId: context.tenantId)
            pollStatus = "Queued \(result.jobId ?? "none") on \(result.queue)"
            errorMessage = nil
            await loadSummary()
        } catch {
            pollStatus = "Error"
            errorMessage = error.localizedDescription
        }
    }

    private func loadReviews() async {
        do {
            let context = try runtime.apiContext()
            let response = try await apiService.reviews(context: context, tenantId: context.tenantId)
            let page = ReviewPage(items: response.items.map(ReviewRow.init(api:)), nextCursor: response.nextCursor)
            reviews = page.items
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadSummary() async {
        do {
            let context = try runtime.apiContext()
            summary = try await apiService.gbpSummary(context: context, tenantId: context.tenantId)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
