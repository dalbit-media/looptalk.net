const createNextHandler = (createApp) => {
  let preparation;
  const prepare = () => {
    if (!preparation) {
      preparation = Promise.resolve().then(async () => {
        const app = createApp();
        await app.prepare();
        return app.getRequestHandler();
      });
    }
    return preparation;
  };

  return {
    prepare,
    handleRequest: async (req, res) => {
      const handler = await prepare();
      return handler(req, res);
    },
  };
};

module.exports = { createNextHandler };
