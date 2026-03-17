import SwiftUI

struct CustomersListView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @State private var rows: [CustomerRow] = []
    @State private var segment = ""
    @State private var errorMessage: String?

    private let apiService: any OperatorAPIServicing

    init(apiService: any OperatorAPIServicing = GeneratedOperatorAPIService()) {
        self.apiService = apiService
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                TextField("Segment (0_90,90_365,365_plus)", text: $segment)
                Button("Fetch") {
                    Task { await fetchCustomers() }
                }
            }
            Text("Tenant: \(runtime.tenantId)")
                .font(.caption)
                .foregroundColor(.secondary)
            if let errorMessage {
                Text(errorMessage).foregroundColor(.red)
            }
            List(rows) { row in
                VStack(alignment: .leading) {
                    Text(row.email).font(.headline)
                    Text("segment: \(row.segment)  name: \(row.displayName ?? "-")")
                        .font(.caption)
                }
            }
        }
        .padding()
    }

    private func fetchCustomers() async {
        do {
            let context = try runtime.apiContext()
            let page = try await apiService.customers(
                context: context,
                tenantId: context.tenantId,
                segment: segment
            )
            rows = page.items
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
