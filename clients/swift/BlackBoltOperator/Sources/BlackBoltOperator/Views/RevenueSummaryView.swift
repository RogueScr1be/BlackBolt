import SwiftUI

struct RevenueSummaryView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @State private var summary: RevenueSummaryResponse?
    @State private var errorMessage: String?
    @State private var isLoading = false

    private let apiService: any OperatorAPIServicing

    init(apiService: any OperatorAPIServicing = GeneratedOperatorAPIService()) {
        self.apiService = apiService
    }

    var body: some View {
        List {
            Section {
                HStack {
                    Button("Refresh") {
                        Task { await loadSummary() }
                    }
                    .disabled(isLoading)
                }
                Text("Tenant: \(runtime.tenantId)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if let summary {
                Section("Revenue Rollup") {
                    RevenueMoneyCard(title: "Total", money: summary.rollup.total)
                    RevenueMoneyCard(title: "Direct", money: summary.rollup.direct)
                    RevenueMoneyCard(title: "Assisted", money: summary.rollup.assisted)
                    RevenueMoneyCard(title: "Unattributed", money: summary.rollup.unattributed)
                    Text("Model: \(summary.model)  windows: \(summary.windowDaysDirect)d/\(summary.windowDaysAssisted)d")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("Range: \(summary.range.from) to \(summary.range.to)")
                        .font(.caption)
                        .foregroundColor(.secondary)
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
            let context = try runtime.apiContext()
            summary = try await apiService.revenueSummary(context: context, tenantId: context.tenantId)
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

private struct RevenueMoneyCard: View {
    let title: String
    let money: MoneyBreakdown

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            Text("\(money.currency) \(String(format: "%.2f", Double(money.amountCents) / 100.0))")
                .font(.body.monospacedDigit())
        }
        .padding(.vertical, 4)
    }
}
