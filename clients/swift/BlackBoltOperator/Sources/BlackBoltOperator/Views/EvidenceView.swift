import SwiftUI

private enum EvidencePanel: String, CaseIterable, Identifiable {
    case revenue = "Revenue"
    case reviews = "Reviews"
    case customers = "Customers"
    case imports = "Imports"

    var id: String { rawValue }
}

struct EvidenceView: View {
    @State private var selected: EvidencePanel = .revenue

    var body: some View {
        NavigationSplitView {
            List(EvidencePanel.allCases, selection: $selected) { item in
                Text(item.rawValue)
            }
            .navigationTitle("Evidence")
        } detail: {
            Group {
                switch selected {
                case .revenue:
                    RevenueSummaryView()
                case .reviews:
                    ReviewsListView()
                case .customers:
                    CustomersListView()
                case .imports:
                    ImportsListView()
                }
            }
            .navigationTitle(selected.rawValue)
        }
    }
}
