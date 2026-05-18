module.exports = new Proxy(
    {},
    {
      get: (_target, prop) => (typeof prop === 'string' ? prop : ''),
    }
  );