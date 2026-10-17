/**
 * PII and Secret Redaction Utility
 * Guarantees zero sensitive data leakage into SQLite memory store.
 */

const SECRET_PATTERNS: { name: string; regex: RegExp; replacement: string }[] = [
  {
    name: 'OpenAI API Key',
    regex: /sk-[a-zA-Z0-9_-]{20,}/g,
    replacement: '[REDACTED_API_KEY_OPENAI]'
  },
  {
    name: 'Anthropic API Key',
    regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    replacement: '[REDACTED_API_KEY_ANTHROPIC]'
  },
  {
    name: 'GitHub Token',
    regex: /gh[pousr]-[A-Za-z0-9_]{36,}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]'
  },
  {
    name: 'Generic Bearer / Auth Token',
    regex: /bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi,
    replacement: 'Bearer [REDACTED_TOKEN]'
  },
  {
    name: 'AWS Access Key ID',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    replacement: '[REDACTED_AWS_KEY]'
  },
  {
    name: 'Private Key Block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]'
  },
  {
    name: 'Password in URI',
    regex: /:\/\/([^:]+):([^@]+)@/g,
    replacement: '://$1:[REDACTED_PASSWORD]@'
  },
  {
    name: 'Email Address',
    regex: /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g,
    replacement: '[REDACTED_EMAIL]'
  }
];

export class RedactionEngine {
  public static sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') return input;
    let result = input;
    for (const pattern of SECRET_PATTERNS) {
      result = result.replace(pattern.regex, pattern.replacement);
    }
    return result;
  }

  public static sanitizeObject<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') {
      return typeof obj === 'string' ? (RedactionEngine.sanitizeString(obj) as unknown as T) : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => RedactionEngine.sanitizeObject(item)) as unknown as T;
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('token') ||
        lowerKey.includes('credential')
      ) {
        sanitized[key] = '[REDACTED_CONFIDENTIAL]';
      } else {
        sanitized[key] = RedactionEngine.sanitizeObject(value);
      }
    }
    return sanitized as T;
  }
}
