import Foundation
import XCTest

@testable import BlackBoltOperator

final class CertificatePinningTests: XCTestCase {
    func testDelegateFallsBackForNonServerTrustChallenges() async {
        let delegate = CertificatePinningDelegate(
            certificatePinning: CertificatePinning(pinnedHashes: [])
        )
        let challenge = URLAuthenticationChallenge(
            protectionSpace: URLProtectionSpace(
                host: "api.example.com",
                port: 443,
                protocol: "https",
                realm: nil,
                authenticationMethod: NSURLAuthenticationMethodHTTPBasic
            ),
            proposedCredential: nil,
            previousFailureCount: 0,
            failureResponse: nil,
            error: nil,
            sender: ChallengeSender()
        )

        let disposition = await challengeDisposition(from: delegate, challenge: challenge)
        XCTAssertEqual(disposition, URLSession.AuthChallengeDisposition.performDefaultHandling)
    }

    func testDelegateRejectsServerTrustChallengesWithoutTrustObject() async {
        let delegate = CertificatePinningDelegate(
            certificatePinning: CertificatePinning(
                pinnedHashes: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa="]
            )
        )
        let challenge = URLAuthenticationChallenge(
            protectionSpace: URLProtectionSpace(
                host: "api.example.com",
                port: 443,
                protocol: "https",
                realm: nil,
                authenticationMethod: NSURLAuthenticationMethodServerTrust
            ),
            proposedCredential: nil,
            previousFailureCount: 0,
            failureResponse: nil,
            error: nil,
            sender: ChallengeSender()
        )

        let disposition = await challengeDisposition(from: delegate, challenge: challenge)
        XCTAssertEqual(disposition, URLSession.AuthChallengeDisposition.cancelAuthenticationChallenge)
    }

    private func challengeDisposition(
        from delegate: CertificatePinningDelegate,
        challenge: URLAuthenticationChallenge
    ) async -> URLSession.AuthChallengeDisposition {
        await withCheckedContinuation { continuation in
            delegate.urlSession(URLSession.shared, didReceive: challenge) { disposition, _ in
                continuation.resume(returning: disposition)
            }
        }
    }
}

private final class ChallengeSender: NSObject, URLAuthenticationChallengeSender {
    func use(_ credential: URLCredential, for challenge: URLAuthenticationChallenge) {}
    func continueWithoutCredential(for challenge: URLAuthenticationChallenge) {}
    func cancel(_ challenge: URLAuthenticationChallenge) {}
    func performDefaultHandling(for challenge: URLAuthenticationChallenge) {}
    func rejectProtectionSpaceAndContinue(with challenge: URLAuthenticationChallenge) {}
}
