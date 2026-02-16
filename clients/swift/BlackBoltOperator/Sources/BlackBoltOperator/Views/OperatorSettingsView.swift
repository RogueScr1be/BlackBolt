import SwiftUI

struct OperatorSettingsView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Operator Settings")
                .font(.title3)
                .fontWeight(.semibold)

            Form {
                TextField("API Base URL", text: $runtime.apiBaseURL)
                TextField("Tenant ID", text: $runtime.tenantId)
                TextField("Auth Header or user:pass", text: $runtime.authHeader)
            }
            .formStyle(.grouped)
        }
        .padding(20)
        .frame(minWidth: 580, minHeight: 300)
    }
}
