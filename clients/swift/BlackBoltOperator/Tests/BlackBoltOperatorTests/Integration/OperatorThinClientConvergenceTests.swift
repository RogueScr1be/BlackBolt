import XCTest

final class OperatorThinClientConvergenceTests: XCTestCase {
    func testOperatorSourceDoesNotUseLegacyRoutes() throws {
        let sourceFiles = try loadOperatorSourceFiles()
        let forbiddenSnippets = [
            "\"/dashboard/summary\"",
            "\"/alerts?state=open\"",
            "\"/events\"",
            "\"/tenants\"",
            "\"/tenants/\\(",
            "\"/metrics?range=30d\""
        ]

        for file in sourceFiles {
            let contents = try String(contentsOf: file)
            for snippet in forbiddenSnippets {
                XCTAssertFalse(contents.contains(snippet), "\(file.lastPathComponent) still references legacy route snippet \(snippet)")
            }
        }
    }

    func testOperatorSourceDoesNotUseCustomBusinessTransport() throws {
        let sourceFiles = try loadOperatorSourceFiles()
        let forbiddenSnippets = [
            "URLSession.shared",
            "runtime.request(",
            "OperatorHTTP"
        ]

        for file in sourceFiles {
            let contents = try String(contentsOf: file)
            for snippet in forbiddenSnippets {
                XCTAssertFalse(contents.contains(snippet), "\(file.lastPathComponent) still contains transport snippet \(snippet)")
            }
        }
    }

    private func loadOperatorSourceFiles() throws -> [URL] {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let sourcesRoot = packageRoot.appendingPathComponent("Sources/BlackBoltOperator")
        let enumerator = FileManager.default.enumerator(
            at: sourcesRoot,
            includingPropertiesForKeys: nil
        )

        var files: [URL] = []
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            files.append(url)
        }
        return files
    }
}
