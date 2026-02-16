import SwiftUI

struct OperatorRootView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @State private var showSettings = false

    var body: some View {
        TabView {
            ImportsListView()
                .tabItem { Text("Imports") }
            CustomersListView()
                .tabItem { Text("Customers") }
            ReviewsListView()
                .tabItem { Text("Reviews") }
            RevenueSummaryView()
                .tabItem { Text("Revenue") }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Settings") {
                    showSettings = true
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            OperatorSettingsView()
                .environmentObject(runtime)
        }
    }
}
