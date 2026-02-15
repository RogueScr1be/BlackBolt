import SwiftUI

struct RevenueSummaryView: View {
    @State private var tenantId = "tenant-demo"
    @State private var summary: RevenueSummaryResponse?
    @State private var errorMessage: String?
    @State private var isLoading = false

    var body: some View {
        List {
            Section {
                HStack {
                    TextField("Tenant ID", text: $tenantId)
                    Button("Refresh") {
                        Task { await loadSummary() }
                    }
                    .disabled(isLoading)
                }
            }

            if let summary {
                Section("Revenue Rollup") {
                    RevenueWindowCard(title: "Last 24h", window: summary.proof.last24h)
                    RevenueWindowCard(title: "Last 1h", window: summary.proof.last1h)
                }

                Section("Top Attributed") {
                    if summary.topCampaigns.isEmpty {
                        Text("No attributed revenue yet")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(summary.topCampaigns.prefix(5)) { campaign in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(campaign.campaignKey)
                                        .font(.headline)
                                    Text(campaign.campaignId)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                Text(formatMoney(campaign.attributed.amountCents, currency: campaign.attributed.currency))
                                    .font(.body.monospacedDigit())
                            }
                        }
                    }
                }

                if let diagnostics = summary.diagnostics {
                    Section("Diagnostics") {
                        Text("durationMs: \(diagnostics.durationMs)  prismaCalls: \(diagnostics.prismaCalls)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            } else if !isLoading {
                Section {
                    Text("No revenue summary loaded")
                        .foregroundColor(.secondary)
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundColor(.red)
                }
            }
        }
        .refreshable {
            await loadSummary()
        }
        .task {
            await loadSummary()
        }
    }

    private func loadSummary() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let url = URL(string: "http://localhost:3000/v1/tenants/\(tenantId)/revenue/summary")!
            var req = URLRequest(url: url)
            req.addValue(tenantId, forHTTPHeaderField: "x-tenant-id")
            req.addValue("operator", forHTTPHeaderField: "x-user-id")
            let (data, _) = try await URLSession.shared.data(for: req)
            summary = try JSONDecoder().decode(RevenueSummaryResponse.self, from: data)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func formatMoney(_ cents: Int, currency: String) -> String {
        let amount = Double(cents) / 100.0
        return String(format: "%@ %.2f", currency, amount)
    }
}

private struct RevenueWindowCard: View {
    let title: String
    let window: RevenueWindowRollup

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            HStack {
                metric(label: "Total", value: window.totalCents)
                Spacer()
                metric(label: "Attributed", value: window.attributedCents)
                Spacer()
                metric(label: "Unattributed", value: window.unattributedCents)
            }
        }
        .padding(.vertical, 4)
    }

    private func metric(label: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            Text("\(value)")
                .font(.body.monospacedDigit())
        }
    }
}
