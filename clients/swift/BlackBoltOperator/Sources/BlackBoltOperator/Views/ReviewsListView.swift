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

private struct PollResponse: Decodable {
    let jobId: String?
    let queue: String
}

struct ReviewsListView: View {
    @State private var tenantId = "tenant-demo"
    @State private var reviews: [ReviewRow] = []
    @State private var summary: GbpOperatorSummary?
    @State private var pollStatus: String = "Idle"
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                TextField("Tenant ID", text: $tenantId)
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
                                Text("Telemetry pages=\(telemetry.pages_fetched ?? 0) fetched=\(telemetry.reviews_fetched ?? 0) upserted=\(telemetry.upserted ?? 0) skipped=\(telemetry.skipped ?? 0)")
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
            let url = URL(string: "http://localhost:3000/v1/tenants/\(tenantId)/reviews/poll")!
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.addValue(tenantId, forHTTPHeaderField: "x-tenant-id")
            req.addValue("operator", forHTTPHeaderField: "x-user-id")
            let (data, _) = try await URLSession.shared.data(for: req)
            let result = try JSONDecoder().decode(PollResponse.self, from: data)
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
            let url = URL(string: "http://localhost:3000/v1/tenants/\(tenantId)/reviews")!
            var req = URLRequest(url: url)
            req.addValue(tenantId, forHTTPHeaderField: "x-tenant-id")
            req.addValue("operator", forHTTPHeaderField: "x-user-id")
            let (data, _) = try await URLSession.shared.data(for: req)
            let page = try JSONDecoder().decode(ReviewPage.self, from: data)
            reviews = page.items
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadSummary() async {
        do {
            let url = URL(string: "http://localhost:3000/v1/tenants/\(tenantId)/integrations/gbp/operator-summary")!
            var req = URLRequest(url: url)
            req.addValue(tenantId, forHTTPHeaderField: "x-tenant-id")
            req.addValue("operator", forHTTPHeaderField: "x-user-id")
            let (data, _) = try await URLSession.shared.data(for: req)
            summary = try JSONDecoder().decode(GbpOperatorSummary.self, from: data)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
