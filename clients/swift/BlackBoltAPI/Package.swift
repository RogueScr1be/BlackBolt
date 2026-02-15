// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "BlackBoltAPI",
    platforms: [
        .macOS(.v13),
        .iOS(.v16)
    ],
    products: [
        .library(name: "BlackBoltAPI", targets: ["BlackBoltAPI"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-runtime.git", exact: "1.9.0"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession.git", exact: "1.2.0"),
        .package(url: "https://github.com/apple/swift-openapi-generator.git", exact: "1.10.4")
    ],
    targets: [
        .target(
            name: "BlackBoltAPI",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession")
            ]
        )
    ]
)
