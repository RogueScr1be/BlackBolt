const REQUIRED_BASE_ENV = ['DATABASE_URL', 'REDIS_URL'] as const;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function validateRequiredRuntimeEnv(): void {
  const missing = REQUIRED_BASE_ENV.filter((name) => {
    const value = process.env[name];
    return !value || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

export function buildBootBanner(input: {
  role: 'api' | 'worker';
  port?: string | undefined;
  postmarkSendDisabled?: string | undefined;
}): string {
  const parts = [
    `[boot] role=${input.role}`,
    `node=${process.version}`,
    `node_env=${process.env.NODE_ENV ?? 'undefined'}`,
    `build_sha=${process.env.BUILD_SHA ?? 'unknown'}`
  ];

  if (input.role === 'api') {
    parts.push(`port=${input.port && input.port.trim().length > 0 ? input.port : 'unset'}`);
  } else {
    const disabled = input.postmarkSendDisabled === '1' ? '1' : '0';
    parts.push(`postmark_send_disabled=${disabled}`);
  }

  return parts.join(' ');
}
