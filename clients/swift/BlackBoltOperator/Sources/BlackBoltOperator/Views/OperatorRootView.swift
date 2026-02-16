import SwiftUI

struct OperatorRootView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig

    var body: some View {
        TabView {
            CommandCenterView()
                .tabItem { Text("Command") }
            InterventionsView()
                .tabItem { Text("Interventions") }
            EvidenceView()
                .tabItem { Text("Evidence") }
            OperatorSettingsView()
                .tabItem { Text("Settings") }
                .environmentObject(runtime)
        }
    }
}
