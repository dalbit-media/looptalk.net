const { loadEnvironment } = require("../src/config/load-environment");
const { ensureWelcomeSender } = require("../src/utils/welcomeConversation");

const seedDatabase = (prisma) => ensureWelcomeSender(prisma);

if (require.main === module) {
  loadEnvironment();
  const prisma = require("../src/db/client");
  seedDatabase(prisma)
    .then(() => console.log("Seeded the non-login LoopTalk system account; no demo users or credentials created."))
    .catch((error) => {
      console.error("Database seeding failed:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedDatabase };
