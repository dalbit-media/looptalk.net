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

  if (!environment.DATABASE_URL.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a SQLite file URL");
  }

  if (
    environment.JWT_SECRET.length < 32 ||
    environment.JWT_SECRET.includes("replace-with")
  ) {
    throw new Error("JWT_SECRET must be a strong secret");
  }

  const instanceCount = Number.parseInt(environment.INSTANCE_COUNT || "1", 10);
  if (instanceCount > 1 && !environment.REDIS_URL?.trim()) {
    throw new Error("REDIS_URL is required when INSTANCE_COUNT is greater than 1");
  }

  if (Boolean(environment.TURN_URLS?.trim()) !== Boolean(environment.TURN_SECRET?.trim())) {
    throw new Error("TURN_URLS and TURN_SECRET must be configured together");
  }
};

module.exports = { validateEnvironment };