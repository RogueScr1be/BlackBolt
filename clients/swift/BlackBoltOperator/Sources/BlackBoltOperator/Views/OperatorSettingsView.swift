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
                TextField("Operator Key (X-Operator-Key)", text: $runtime.operatorKey)
                TextField("Auth Header or user:pass", text: $runtime.authHeader)
            }
            .formStyle(.grouped)

            GroupBox("Build Info") {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Build SHA: \(buildSHA)")
                        .font(.caption)
                    Text("Current API Base URL: \(runtime.apiBaseURL)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(20)
        .frame(minWidth: 580, minHeight: 300)
    }

    private var buildSHA: String {
        if let value = Bundle.main.object(forInfoDictionaryKey: "BlackBoltBuildSHA") as? String, !value.isEmpty {
            return value
        }
        return ProcessInfo.processInfo.environment["BUILD_SHA"] ?? "unknown"
    }
}
