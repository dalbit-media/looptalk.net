// Run in the same transaction as membership removal: revoked recipients must
// neither fetch old ciphertext nor keep otherwise fully acknowledged data alive.
async function pruneSecureRecipient(transaction, conversationId, userId) {
  await transaction.secureEnvelope.deleteMany({
    where: { device: { userId }, dispatch: { conversationId } },
  });
  await transaction.securePayload.deleteMany({
    where: { dispatch: { conversationId, envelopes: { none: {} } } },
  });
}

const transactionQueues = new WeakMap();

// SQLite has one writer. Serialize relay transactions in this worker and retry
// lock conflicts with other workers; ACK deletion and final cleanup stay atomic.
function secureTransaction(prisma, work, options = {}) {
  const previous = transactionQueues.get(prisma) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await prisma.$transaction(work, { maxWait: 10000, timeout: 30000, ...options });
      } catch (error) {
        if (!["P1008", "P2028", "P2034", "P2002"].includes(error.code) || attempt >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  });
  transactionQueues.set(prisma, operation.then(() => {}, () => {}));
  return operation;
}

module.exports = { pruneSecureRecipient, secureTransaction };
