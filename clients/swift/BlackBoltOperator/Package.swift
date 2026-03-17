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
            dependencies: ["BlackBoltAPI"],
            exclude: [
                "Info.plist"
            ],
            swiftSettings: [
                .unsafeFlags(["-parse-as-library"], .when(configuration: .debug))
            ]
        ),
        .testTarget(
            name: "BlackBoltOperatorTests",
            dependencies: ["BlackBoltOperator", "BlackBoltAPI"],
            exclude: [
                "Performance/UIResponsivenessTests.swift",
                "Security/KeychainTests.swift",
                "Security/MemorySafetyTests.swift",
                "Security/SecureConfigurationStoreTests.swift"
            ],
            resources: [
                .copy("Fixtures/MockResponses.json"),
                .copy("Fixtures/SampleData.json"),
                .copy("Fixtures/ConfigurationSamples.json"),
                .copy("Fixtures/TestCertificates")
            ],
            swiftSettings: [
                .unsafeFlags(["-enable-testing"], .when(configuration: .debug))
            ]
        )
    ]
)
