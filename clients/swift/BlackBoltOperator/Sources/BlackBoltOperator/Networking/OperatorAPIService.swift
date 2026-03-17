import BlackBoltAPI
import Foundation
import HTTPTypes
import OpenAPIRuntime

struct OperatorAPIContext: Sendable, Equatable {
    let serverURL: URL
    let tenantId: String
    let operatorKey: String
    let authorizationHeader: String?
}

protocol OperatorAPIServicing: Sendable {
    func dashboardSummary(context: OperatorAPIContext) async throws -> DashboardSummaryResponse
    func alerts(context: OperatorAPIContext, state: String) async throws -> OperatorAlertsResponse
    func events(context: OperatorAPIContext) async throws -> OperatorEventsResponse
    func tenants(context: OperatorAPIContext) async throws -> OperatorTenantListResponse
    func tenantDetail(context: OperatorAPIContext, tenantId: String) async throws -> OperatorTenantDetail
    func tenantMetrics(context: OperatorAPIContext, tenantId: String, range: String) async throws -> OperatorTenantMetricsResponse
    func campaignRuns(context: OperatorAPIContext, tenantId: String, limit: Int) async throws -> CampaignRunsResponse
    func reviewQueue(context: OperatorAPIContext, state: String, tenantId: String?) async throws -> OperatorReviewQueueResponse
    func approvals(context: OperatorAPIContext, state: String, tenantId: String?) async throws -> OperatorApprovalListResponse
    func approvalDetail(context: OperatorAPIContext, approvalId: String) async throws -> OperatorApprovalDetail
    func patchApprovalDraft(
        context: OperatorAPIContext,
        approvalId: String,
        subject: String,
        body: String,
        segment: String,
        sendWindowAt: String
    ) async throws -> OperatorApprovalDetail
    func approveApproval(context: OperatorAPIContext, approvalId: String) async throws
    func rejectApproval(context: OperatorAPIContext, approvalId: String, reason: String) async throws
    func customerSegments(context: OperatorAPIContext, tenantId: String) async throws -> CustomerSegmentSummaryResponse
    func revenueImports(context: OperatorAPIContext, tenantId: String, limit: Int) async throws -> RevenueImportListResponse
    func revenueImportStatus(context: OperatorAPIContext, revenueImportId: String) async throws -> RevenueImportStatusResponse
    func createRevenueImport(
        context: OperatorAPIContext,
        tenantId: String,
        fileURL: URL
    ) async throws -> CreateRevenueImportResponse
    func setCampaignRunPaused(context: OperatorAPIContext, tenantId: String, runId: String, paused: Bool) async throws
    func bootstrapStatus(context: OperatorAPIContext) async throws -> BootstrapStatusResponse
    func monthlyReport(context: OperatorAPIContext, tenantId: String, month: String) async throws -> MonthlyReportPayload
    func monthlyReportPDF(context: OperatorAPIContext, tenantId: String, month: String) async throws -> Data
    func operatorSmoke(context: OperatorAPIContext, tenantId: String) async throws -> OperatorSmokeResponse
    func retryGbpIngestion(context: OperatorAPIContext, tenantId: String) async throws
    func resumePostmarkIntervention(context: OperatorAPIContext, tenantId: String) async throws
    func ackAlert(context: OperatorAPIContext, tenantId: String, alertId: String) async throws

    func commandCenter(context: OperatorAPIContext, tenantId: String) async throws -> CommandCenterPayload
    func gbpSummary(context: OperatorAPIContext, tenantId: String) async throws -> GbpOperatorSummary
    func postmarkSummary(context: OperatorAPIContext, tenantId: String) async throws -> PostmarkOperatorSummary
    func pollReviews(context: OperatorAPIContext, tenantId: String) async throws -> PollResponse
    func reviews(context: OperatorAPIContext, tenantId: String) async throws -> Components.Schemas.ListReviewsResponse
    func customers(context: OperatorAPIContext, tenantId: String, segment: String?) async throws -> CustomersPage
    func revenueSummary(context: OperatorAPIContext, tenantId: String) async throws -> RevenueSummaryResponse
    func resumePostmarkSends(
        context: OperatorAPIContext,
        tenantId: String,
        checklistAck: Bool
    ) async throws -> OperatorActionResponse
}

struct GeneratedOperatorAPIService: OperatorAPIServicing {
    func dashboardSummary(context: OperatorAPIContext) async throws -> DashboardSummaryResponse {
        let tenantId = context.tenantId
        let path = "/v1/tenants/\(tenantId)/dashboard/summary"
        let output = try await client(for: context).getDashboardSummary(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.DashboardSummaryResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetDashboardSummary.Output.Ok) in
            try response.body.json
        }
        return DashboardSummaryResponse(api: body)
    }

    func alerts(context: OperatorAPIContext, state: String) async throws -> OperatorAlertsResponse {
        let tenantId = context.tenantId
        let path = "/v1/tenants/\(tenantId)/alerts"
        let query = Operations.ListOperatorAlerts.Input.Query(
            state: operatorAlertState(from: state)
        )
        let output = try await client(for: context).listOperatorAlerts(
            .init(
                path: .init(tenantId: tenantId),
                query: query,
                headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
            )
        )
        let body: Components.Schemas.OperatorAlertsResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListOperatorAlerts.Output.Ok) in
            try response.body.json
        }
        return OperatorAlertsResponse(api: body)
    }

    func events(context: OperatorAPIContext) async throws -> OperatorEventsResponse {
        let tenantId = context.tenantId
        let path = "/v1/tenants/\(tenantId)/events"
        let output = try await client(for: context).listOperatorEvents(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.OperatorEventsResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListOperatorEvents.Output.Ok) in
            try response.body.json
        }
        return OperatorEventsResponse(api: body)
    }

    func tenants(context: OperatorAPIContext) async throws -> OperatorTenantListResponse {
        let path = "/v1/tenants"
        let output = try await client(for: context).listOperatorTenants(
            headers: .init(xTenantId: context.tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.OperatorTenantListResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListOperatorTenants.Output.Ok) in
            try response.body.json
        }
        return OperatorTenantListResponse(api: body)
    }

    func tenantDetail(context: OperatorAPIContext, tenantId: String) async throws -> OperatorTenantDetail {
        let path = "/v1/tenants/\(tenantId)"
        let output = try await client(for: context).getOperatorTenant(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.OperatorTenantDetail = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetOperatorTenant.Output.Ok) in
            try response.body.json
        }
        return OperatorTenantDetail(api: body)
    }

    func tenantMetrics(context: OperatorAPIContext, tenantId: String, range: String) async throws -> OperatorTenantMetricsResponse {
        let path = "/v1/tenants/\(tenantId)/metrics"
        let output = try await client(for: context).getOperatorTenantMetrics(
            .init(
                path: .init(tenantId: tenantId),
                query: .init(range: tenantMetricsRange(from: range)),
                headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
            )
        )
        let body: Components.Schemas.OperatorTenantMetricsResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetOperatorTenantMetrics.Output.Ok) in
            try response.body.json
        }
        return OperatorTenantMetricsResponse(api: body)
    }

    func campaignRuns(context: OperatorAPIContext, tenantId: String, limit: Int) async throws -> CampaignRunsResponse {
        let path = "/v1/tenants/\(tenantId)/campaign-runs"
        let output = try await client(for: context).listCampaignRuns(
            .init(
                path: .init(tenantId: tenantId),
                query: .init(limit: limit),
                headers: .init(xTenantId: tenantId)
            )
        )
        let body: Operations.ListCampaignRuns.Output.Ok.Body.JsonPayload = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListCampaignRuns.Output.Ok) in
            try response.body.json
        }
        return CampaignRunsResponse(api: body)
    }

    func reviewQueue(context: OperatorAPIContext, state: String, tenantId: String?) async throws -> OperatorReviewQueueResponse {
        let path = "/v1/operator/reviews/queue"
        let output = try await client(for: context).listOperatorReviewQueue(
            .init(
                query: .init(
                    state: reviewQueueState(from: state),
                    tenantId: tenantId?.nilIfBlank
                ),
                headers: .init(xOperatorKey: context.operatorKey)
            )
        )
        let body: Components.Schemas.OperatorReviewQueueResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListOperatorReviewQueue.Output.Ok) in
            try response.body.json
        }
        return OperatorReviewQueueResponse(api: body)
    }

    func approvals(context: OperatorAPIContext, state: String, tenantId: String?) async throws -> OperatorApprovalListResponse {
        let path = "/v1/operator/approvals"
        let output = try await client(for: context).listOperatorApprovals(
            .init(
                query: .init(
                    state: approvalState(from: state),
                    tenantId: tenantId?.nilIfBlank
                ),
                headers: .init(xOperatorKey: context.operatorKey)
            )
        )
        let body: Components.Schemas.OperatorApprovalListResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListOperatorApprovals.Output.Ok) in
            try response.body.json
        }
        return OperatorApprovalListResponse(api: body)
    }

    func approvalDetail(context: OperatorAPIContext, approvalId: String) async throws -> OperatorApprovalDetail {
        let path = "/v1/operator/approvals/\(approvalId)"
        let output = try await client(for: context).getOperatorApproval(
            path: .init(approvalId: approvalId),
            headers: .init(xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.OperatorApprovalDetail = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetOperatorApproval.Output.Ok) in
            try response.body.json
        }
        return OperatorApprovalDetail(api: body)
    }

    func patchApprovalDraft(
        context: OperatorAPIContext,
        approvalId: String,
        subject: String,
        body: String,
        segment: String,
        sendWindowAt: String
    ) async throws -> OperatorApprovalDetail {
        let path = "/v1/operator/approvals/\(approvalId)/draft"
        let payload = Components.Schemas.OperatorApprovalDraftPatchRequest(
            subject: subject,
            body: body,
            segment: approvalSegment(from: segment),
            sendWindowAt: parseISO8601(sendWindowAt)
        )
        let output = try await client(for: context).patchOperatorApprovalDraft(
            .init(
                path: .init(approvalId: approvalId),
                headers: .init(xOperatorKey: context.operatorKey),
                body: .json(payload)
            )
        )
        let response: Components.Schemas.OperatorApprovalDetail = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.PatchOperatorApprovalDraft.Output.Ok) in
            try response.body.json
        }
        return OperatorApprovalDetail(api: response)
    }

    func approveApproval(context: OperatorAPIContext, approvalId: String) async throws {
        let path = "/v1/operator/approvals/\(approvalId)/approve"
        let output = try await client(for: context).approveOperatorApproval(
            path: .init(approvalId: approvalId),
            headers: .init(xOperatorKey: context.operatorKey)
        )
        let _: Components.Schemas.OperatorApprovalMutationResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ApproveOperatorApproval.Output.Ok) in
            try response.body.json
        }
    }

    func rejectApproval(context: OperatorAPIContext, approvalId: String, reason: String) async throws {
        let path = "/v1/operator/approvals/\(approvalId)/reject"
        let output = try await client(for: context).rejectOperatorApproval(
            .init(
                path: .init(approvalId: approvalId),
                headers: .init(xOperatorKey: context.operatorKey),
                body: .json(.init(reason: reason))
            )
        )
        let _: Components.Schemas.OperatorApprovalMutationResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.RejectOperatorApproval.Output.Ok) in
            try response.body.json
        }
    }

    func customerSegments(context: OperatorAPIContext, tenantId: String) async throws -> CustomerSegmentSummaryResponse {
        let path = "/v1/tenants/\(tenantId)/customers/segments"
        let output = try await client(for: context).listCustomerSegments(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.CustomerSegmentsResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListCustomerSegments.Output.Ok) in
            try response.body.json
        }
        return CustomerSegmentSummaryResponse(api: body)
    }

    func revenueImports(context: OperatorAPIContext, tenantId: String, limit: Int) async throws -> RevenueImportListResponse {
        let path = "/v1/tenants/\(tenantId)/revenue/imports"
        let output = try await client(for: context).listRevenueImports(
            .init(
                path: .init(tenantId: tenantId),
                query: .init(limit: limit),
                headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
            )
        )
        let body: Components.Schemas.RevenueImportListResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListRevenueImports.Output.Ok) in
            try response.body.json
        }
        return RevenueImportListResponse(api: body)
    }

    func revenueImportStatus(context: OperatorAPIContext, revenueImportId: String) async throws -> RevenueImportStatusResponse {
        let path = "/v1/revenue-imports/\(revenueImportId)"
        let output = try await client(for: context).getRevenueImportStatus(
            path: .init(revenueImportId: revenueImportId),
            headers: .init(xTenantId: context.tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.RevenueImportStatusResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetRevenueImportStatus.Output.Ok) in
            try response.body.json
        }
        return RevenueImportStatusResponse(api: body)
    }

    func createRevenueImport(
        context: OperatorAPIContext,
        tenantId: String,
        fileURL: URL
    ) async throws -> CreateRevenueImportResponse {
        let path = "/v1/tenants/\(tenantId)/revenue/imports"
        let data = try Data(contentsOf: fileURL)
        let filePart = MultipartPart(
            payload: Operations.CreateRevenueImport.Input.Body.MultipartFormPayload.FilePayload(
                body: HTTPBody(data)
            ),
            filename: fileURL.lastPathComponent
        )
        let body: MultipartBody<Operations.CreateRevenueImport.Input.Body.MultipartFormPayload> = [
            .file(filePart)
        ]
        let output = try await client(for: context).createRevenueImport(
            .init(
                path: .init(tenantId: tenantId),
                headers: .init(
                    xTenantId: tenantId,
                    xOperatorKey: context.operatorKey,
                    idempotencyKey: UUID().uuidString
                ),
                body: .multipartForm(body)
            )
        )
        let response: Components.Schemas.CreateRevenueImportResponse = try extractSuccess(
            from: output,
            successCase: "accepted",
            path: path
        ) { (response: Operations.CreateRevenueImport.Output.Accepted) in
            try response.body.json
        }
        return CreateRevenueImportResponse(api: response)
    }

    func setCampaignRunPaused(context: OperatorAPIContext, tenantId: String, runId: String, paused: Bool) async throws {
        let path = "/v1/tenants/\(tenantId)/campaign-runs/\(runId)/\(paused ? "pause" : "resume")"
        if paused {
            let output = try await client(for: context).pauseCampaignRun(
                path: .init(tenantId: tenantId, runId: runId),
                headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
            )
            let _: Components.Schemas.OperatorInterventionResponse = try extractSuccess(
                from: output,
                successCase: "ok",
                path: path
            ) { (response: Operations.PauseCampaignRun.Output.Ok) in
                try response.body.json
            }
        } else {
            let output = try await client(for: context).resumeCampaignRun(
                path: .init(tenantId: tenantId, runId: runId),
                headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
            )
            let _: Components.Schemas.OperatorInterventionResponse = try extractSuccess(
                from: output,
                successCase: "ok",
                path: path
            ) { (response: Operations.ResumeCampaignRun.Output.Ok) in
                try response.body.json
            }
        }
    }

    func bootstrapStatus(context: OperatorAPIContext) async throws -> BootstrapStatusResponse {
        let path = "/v1/bootstrap/status"
        let output = try await client(for: context).getBootstrapStatus(
            headers: .init(xTenantId: context.tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.BootstrapStatusResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetBootstrapStatus.Output.Ok) in
            try response.body.json
        }
        return BootstrapStatusResponse(api: body)
    }

    func monthlyReport(context: OperatorAPIContext, tenantId: String, month: String) async throws -> MonthlyReportPayload {
        let path = "/v1/tenants/\(tenantId)/reports/monthly"
        let output = try await client(for: context).getMonthlyReport(
            .init(
                path: .init(tenantId: tenantId),
                query: .init(month: month),
                headers: .init(xTenantId: tenantId)
            )
        )
        let body: Components.Schemas.MonthlyReportPayload = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetMonthlyReport.Output.Ok) in
            try response.body.json
        }
        return MonthlyReportPayload(api: body)
    }

    func monthlyReportPDF(context: OperatorAPIContext, tenantId: String, month: String) async throws -> Data {
        let path = "/v1/tenants/\(tenantId)/reports/monthly/pdf"
        let output = try await client(for: context).getMonthlyReportPdf(
            .init(
                path: .init(tenantId: tenantId),
                query: .init(month: month),
                headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
            )
        )
        let body: HTTPBody = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetMonthlyReportPdf.Output.Ok) in
            try response.body.pdf
        }
        return try await Data(collecting: body, upTo: 64 * 1024 * 1024)
    }

    func operatorSmoke(context: OperatorAPIContext, tenantId: String) async throws -> OperatorSmokeResponse {
        let path = "/v1/tenants/\(tenantId)/operator/smoke"
        let output = try await client(for: context).runOperatorSmoke(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.OperatorSmokeResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.RunOperatorSmoke.Output.Ok) in
            try response.body.json
        }
        return OperatorSmokeResponse(api: body)
    }

    func retryGbpIngestion(context: OperatorAPIContext, tenantId: String) async throws {
        let path = "/v1/tenants/\(tenantId)/interventions/retry-gbp-ingestion"
        let output = try await client(for: context).retryGbpIngestionIntervention(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId)
        )
        let _: Components.Schemas.OperatorInterventionResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.RetryGbpIngestionIntervention.Output.Ok) in
            try response.body.json
        }
    }

    func resumePostmarkIntervention(context: OperatorAPIContext, tenantId: String) async throws {
        let path = "/v1/tenants/\(tenantId)/interventions/resume-postmark"
        let output = try await client(for: context).resumePostmarkIntervention(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId)
        )
        let _: Components.Schemas.OperatorInterventionResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ResumePostmarkIntervention.Output.Ok) in
            try response.body.json
        }
    }

    func ackAlert(context: OperatorAPIContext, tenantId: String, alertId: String) async throws {
        let path = "/v1/tenants/\(tenantId)/interventions/ack-alert"
        let output = try await client(for: context).ackAlertIntervention(
            .init(
                path: .init(tenantId: tenantId),
                headers: .init(xTenantId: tenantId),
                body: .json(.init(alertId: alertId))
            )
        )
        let _: Components.Schemas.OperatorInterventionResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.AckAlertIntervention.Output.Ok) in
            try response.body.json
        }
    }

    func commandCenter(context: OperatorAPIContext, tenantId: String) async throws -> CommandCenterPayload {
        let path = "/v1/tenants/\(tenantId)/operator/command-center"
        let output = try await client(for: context).getOperatorCommandCenter(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId)
        )
        let body: Components.Schemas.CommandCenterPayload = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetOperatorCommandCenter.Output.Ok) in
            try response.body.json
        }
        return CommandCenterPayload(api: body)
    }

    func gbpSummary(context: OperatorAPIContext, tenantId: String) async throws -> GbpOperatorSummary {
        let path = "/v1/tenants/\(tenantId)/integrations/gbp/operator-summary"
        let output = try await client(for: context).getGbpOperatorSummary(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.GbpOperatorSummaryResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetGbpOperatorSummary.Output.Ok) in
            try response.body.json
        }
        return GbpOperatorSummary(api: body)
    }

    func postmarkSummary(context: OperatorAPIContext, tenantId: String) async throws -> PostmarkOperatorSummary {
        let path = "/v1/tenants/\(tenantId)/integrations/postmark/operator-summary"
        let output = try await client(for: context).getPostmarkOperatorSummary(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId)
        )
        let body: Components.Schemas.PostmarkOperatorSummaryResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetPostmarkOperatorSummary.Output.Ok) in
            try response.body.json
        }
        return PostmarkOperatorSummary(api: body)
    }

    func pollReviews(context: OperatorAPIContext, tenantId: String) async throws -> PollResponse {
        let path = "/v1/tenants/\(tenantId)/reviews/poll"
        let output = try await client(for: context).pollGbpReviews(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
        )
        let body: Components.Schemas.PollReviewsResponse = try extractSuccess(
            from: output,
            successCase: "accepted",
            path: path
        ) { (response: Operations.PollGbpReviews.Output.Accepted) in
            try response.body.json
        }
        return PollResponse(api: body)
    }

    func reviews(context: OperatorAPIContext, tenantId: String) async throws -> Components.Schemas.ListReviewsResponse {
        let path = "/v1/tenants/\(tenantId)/reviews"
        let output = try await client(for: context).listReviews(
            path: .init(tenantId: tenantId),
            headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
        )
        return try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListReviews.Output.Ok) in
            try response.body.json
        }
    }

    func customers(context: OperatorAPIContext, tenantId: String, segment: String?) async throws -> CustomersPage {
        let path = "/v1/tenants/\(tenantId)/customers"
        let output = try await client(for: context).listCustomers(
            .init(
                path: .init(tenantId: tenantId),
                query: .init(segment: customerSegment(from: segment)),
                headers: .init(xTenantId: tenantId, xOperatorKey: context.operatorKey)
            )
        )
        let body: Components.Schemas.ListCustomersResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ListCustomers.Output.Ok) in
            try response.body.json
        }
        return CustomersPage(api: body)
    }

    func revenueSummary(context: OperatorAPIContext, tenantId: String) async throws -> RevenueSummaryResponse {
        let path = "/v1/tenants/\(tenantId)/revenue/summary"
        let output = try await client(for: context).getRevenueSummary(
            path: .init(tenantId: tenantId)
        )
        let body: Components.Schemas.RevenueSummaryResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.GetRevenueSummary.Output.Ok) in
            try response.body.json
        }
        return RevenueSummaryResponse(api: body)
    }

    func resumePostmarkSends(
        context: OperatorAPIContext,
        tenantId: String,
        checklistAck: Bool
    ) async throws -> OperatorActionResponse {
        let path = "/v1/tenants/\(tenantId)/integrations/postmark/resume"
        let output = try await client(for: context).resumePostmarkSends(
            .init(
                path: .init(tenantId: tenantId),
                headers: .init(xTenantId: tenantId),
                body: .json(.init(checklistAck: checklistAck))
            )
        )
        let body: Components.Schemas.PostmarkResumeResponse = try extractSuccess(
            from: output,
            successCase: "ok",
            path: path
        ) { (response: Operations.ResumePostmarkSends.Output.Ok) in
            try response.body.json
        }
        return OperatorActionResponse(api: body)
    }

    private func client(for context: OperatorAPIContext) -> Client {
        Client(
            serverURL: context.serverURL,
            transport: BlackBoltAPI.makeTransport(),
            middlewares: [OperatorRequestHeadersMiddleware(context: context)]
        )
    }

    private func extractSuccess<Output, Success, Value>(
        from output: Output,
        successCase: String,
        path: String,
        value: (Success) throws -> Value
    ) throws -> Value {
        let mirror = Mirror(reflecting: output)
        guard let child = mirror.children.first else {
            throw OperatorAppError(code: "http_error", message: "Unexpected empty API response.", httpStatus: nil, path: path)
        }
        if child.label == successCase {
            guard let success = child.value as? Success else {
                throw OperatorAppError(code: "http_error", message: "Unexpected API success payload.", httpStatus: nil, path: path)
            }
            return try value(success)
        }
        throw appError(forCase: child.label ?? "unknown", payload: child.value, path: path)
    }

    private func appError(forCase caseName: String, payload: Any, path: String) -> OperatorAppError {
        switch caseName {
        case "unauthorized":
            return OperatorAppError(
                code: "invalid_operator_key",
                message: "Invalid operator key (X-Operator-Key). Update Settings and retry.",
                httpStatus: 401,
                path: path
            )
        case "notFound":
            return OperatorAppError(
                code: "endpoint_not_found",
                message: "Endpoint not available on selected API base URL.",
                httpStatus: 404,
                path: path
            )
        case "forbidden":
            return OperatorAppError(
                code: "forbidden",
                message: "Operator is not authorized for this resource.",
                httpStatus: 403,
                path: path
            )
        case "badRequest":
            return OperatorAppError(
                code: "bad_request",
                message: "Request rejected by API.",
                httpStatus: 400,
                path: path
            )
        case "internalServerError":
            return OperatorAppError(
                code: "server_error",
                message: "API returned an internal server error.",
                httpStatus: 500,
                path: path
            )
        case "accepted", "ok":
            return OperatorAppError(
                code: "http_error",
                message: "Unexpected response handling state.",
                httpStatus: nil,
                path: path
            )
        case "undocumented":
            let status = extractUndocumentedStatus(from: payload)
            return OperatorAppError(
                code: "http_error",
                message: "Unexpected HTTP \(status ?? 0) returned by API.",
                httpStatus: status,
                path: path
            )
        default:
            return OperatorAppError(
                code: "http_error",
                message: "Unexpected API response case: \(caseName).",
                httpStatus: nil,
                path: path
            )
        }
    }

    private func extractUndocumentedStatus(from payload: Any) -> Int? {
        let mirror = Mirror(reflecting: payload)
        for child in mirror.children {
            if child.label == "statusCode" || child.label == ".0", let value = child.value as? Int {
                return value
            }
        }
        return nil
    }

    private func approvalSegment(from value: String) -> Components.Schemas.OperatorApprovalDraftPatchRequest.SegmentPayload? {
        switch value {
        case "volume":
            return .volume
        case "gentle":
            return .gentle
        case "last_seen_90_365", "":
            return .lastSeen90365
        default:
            return nil
        }
    }

    private func approvalState(from value: String) -> Operations.ListOperatorApprovals.Input.Query.StatePayload? {
        switch value {
        case "approved":
            return .approved
        case "rejected":
            return .rejected
        case "all":
            return .all
        case "awaiting_approval", "":
            return .awaitingApproval
        default:
            return nil
        }
    }

    private func reviewQueueState(from value: String) -> Operations.ListOperatorReviewQueue.Input.Query.StatePayload? {
        switch value {
        case "new":
            return .new
        case "classified":
            return .classified
        case "awaiting_approval":
            return .awaitingApproval
        case "scheduled":
            return .scheduled
        case "sent":
            return .sent
        case "all", "":
            return .all
        default:
            return nil
        }
    }

    private func operatorAlertState(from value: String) -> Operations.ListOperatorAlerts.Input.Query.StatePayload? {
        switch value {
        case "all", "resolved":
            return .all
        case "open", "":
            return .open
        default:
            return nil
        }
    }

    private func tenantMetricsRange(from value: String) -> Operations.GetOperatorTenantMetrics.Input.Query.RangePayload {
        switch value {
        case "90d":
            return ._90d
        case "ytd":
            return .ytd
        default:
            return ._30d
        }
    }

    private func customerSegment(from value: String?) -> Components.Schemas.CustomerSegment? {
        switch value?.trimmingCharacters(in: .whitespacesAndNewlines) {
        case "0_90":
            return ._090
        case "90_365":
            return ._90365
        case "365_plus":
            return ._365Plus
        default:
            return nil
        }
    }
}

private func parseISO8601(_ value: String) -> Date? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: trimmed) ?? ISO8601DateFormatter().date(from: trimmed)
}

private struct OperatorRequestHeadersMiddleware: ClientMiddleware {
    let context: OperatorAPIContext

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if !context.operatorKey.isEmpty {
            request.headerFields[HTTPField.Name("X-Operator-Key")!] = context.operatorKey
        }
        if !context.tenantId.isEmpty {
            request.headerFields[HTTPField.Name("x-tenant-id")!] = context.tenantId
        }
        request.headerFields[HTTPField.Name("x-user-id")!] = "operator"
        if let authorizationHeader = context.authorizationHeader {
            request.headerFields[.authorization] = authorizationHeader
        }

        do {
            return try await next(request, body, baseURL)
        } catch {
            throw Self.map(error: error, requestPath: request.path ?? "/")
        }
    }

    private static func map(error: Error, requestPath: String) -> OperatorAppError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorNotConnectedToInternet,
                 NSURLErrorCannotFindHost,
                 NSURLErrorCannotConnectToHost,
                 NSURLErrorNetworkConnectionLost,
                 NSURLErrorTimedOut:
                return OperatorAppError(
                    code: "network_unreachable",
                    message: "Cannot reach API base URL. Check API URL and network connectivity.",
                    httpStatus: nil,
                    path: requestPath
                )
            default:
                break
            }
        }

        return OperatorAppError(
            code: "network_error",
            message: nsError.localizedDescription,
            httpStatus: nil,
            path: requestPath
        )
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
