import SwiftUI

@main
struct BlackBoltOperatorApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var lock = OperatorLock()

    var body: some Scene {
        WindowGroup {
            Group {
                if lock.isLocked {
                    OperatorLockView(lock: lock)
                } else {
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
                }
            }
            .frame(minWidth: 960, minHeight: 640)
            .onChange(of: scenePhase) { _, newPhase in
                lock.onScenePhaseChange(newPhase)
            }
        }
    }
}
