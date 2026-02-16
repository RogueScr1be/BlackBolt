export type OperatorKPI = {
  revenue_month: number;
  attributed_bookings_month: number;
  new_5star_reviews_month: number;
  email_conversion_rate: number;
  portfolio_health_score: number;
  action_required_count: number;
};

export type OperatorHealth = {
  deliverability: 'healthy' | 'warning' | 'critical';
  review_velocity: 'healthy' | 'warning' | 'critical';
  engagement_trend: 'healthy' | 'warning' | 'critical';
  worker_liveness: 'healthy' | 'warning' | 'critical';
  last_pipeline_run: string | null;
};

export type OperatorAlert = {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  tenant_id: string;
  title: string;
  suggested_action: string;
  execute_capability: 'retry-gbp-ingestion' | 'resume-postmark' | 'ack-alert' | 'none';
  created_at: string;
  resolved_at: string | null;
};

export type OperatorActivityEvent = {
  event_type: string;
  tenant_id: string;
  summary: string;
  amount_cents?: number;
  created_at: string;
};

export type CommandCenterPayload = {
  tenant_id: string;
  kpis: OperatorKPI;
  health: OperatorHealth;
  alerts: OperatorAlert[];
  activity_feed: OperatorActivityEvent[];
};

export type MonthlyReportPayload = {
  tenant_id: string;
  month: string;
  generated_at: string;
  totals: {
    revenue_cents: number;
    attributed_cents: number;
    bookings_count: number;
    sent_count: number;
    click_count: number;
  };
  estimates: {
    conservative_bookings: number;
    base_bookings: number;
    aggressive_bookings: number;
  };
  praised_benefits: Array<{
    benefit: string;
    mentions: number;
  }>;
  narrative: string;
};
