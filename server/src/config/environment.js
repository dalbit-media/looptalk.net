const REQUIRED_VARIABLES = ["DATABASE_URL", "JWT_SECRET"];

const parseUrl = (value, variableName) => {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid URL`);
  }
};

const validateEnvironment = (environment = process.env) => {
  const missingVariables = REQUIRED_VARIABLES.filter(
    (name) => !environment[name]?.trim()
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(", ")}`
    );
  }

  if (!environment.DATABASE_URL.startsWith("mysql://")) {
    throw new Error("DATABASE_URL must be a MySQL connection string");
  }

  if (
    environment.JWT_SECRET.length < 32 ||
    environment.JWT_SECRET.includes("replace-with")
  ) {
    throw new Error("JWT_SECRET must be a strong secret");
  }

  if (environment.PUBLIC_URL?.trim()) {
    const publicUrl = parseUrl(environment.PUBLIC_URL, "PUBLIC_URL");
    if (!["http:", "https:"].includes(publicUrl.protocol)) {
      throw new Error("PUBLIC_URL must use HTTP or HTTPS");
    }
  }

  const corsOrigins = environment.CORS_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) || [];
  corsOrigins.forEach((origin) => {
    const url = parseUrl(origin, "CORS_ORIGIN");
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("CORS_ORIGIN entries must use HTTP or HTTPS");
    }
  });

  const instanceCount = Number.parseInt(environment.INSTANCE_COUNT || "1", 10);
  if (instanceCount > 1 && !environment.REDIS_URL?.trim()) {
    throw new Error("REDIS_URL is required when INSTANCE_COUNT is greater than 1");
  }

  if (Boolean(environment.TURN_URLS?.trim()) !== Boolean(environment.TURN_SECRET?.trim())) {
    throw new Error("TURN_URLS and TURN_SECRET must be configured together");
  }
};

module.exports = { validateEnvironment };