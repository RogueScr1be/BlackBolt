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
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @State private var reviews: [ReviewRow] = []
    @State private var summary: GbpOperatorSummary?
    @State private var pollStatus: String = "Idle"
    @State private var errorMessage: String?

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
            let req = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/reviews/poll", method: "POST")
            let (data, response) = try await URLSession.shared.data(for: req)
            try ensureSuccess(response: response, data: data)
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
            let req = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/reviews")
            let (data, response) = try await URLSession.shared.data(for: req)
            try ensureSuccess(response: response, data: data)
            let page = try JSONDecoder().decode(ReviewPage.self, from: data)
            reviews = page.items
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadSummary() async {
        do {
            let req = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/integrations/gbp/operator-summary")
            let (data, response) = try await URLSession.shared.data(for: req)
            try ensureSuccess(response: response, data: data)
            summary = try JSONDecoder().decode(GbpOperatorSummary.self, from: data)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func ensureSuccess(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200 ... 299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw NSError(
                domain: "OperatorHTTPError",
                code: http.statusCode,
                userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode): \(body)"]
            )
        }
    }
}
