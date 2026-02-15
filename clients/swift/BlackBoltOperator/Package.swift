// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BlackBoltOperator",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "BlackBoltOperator", targets: ["BlackBoltOperator"])
    ],
    dependencies: [
        .package(path: "../BlackBoltAPI")
    ],
    targets: [
        .executableTarget(
            name: "BlackBoltOperator",
            dependencies: ["BlackBoltAPI"]
        )
    ]
)
