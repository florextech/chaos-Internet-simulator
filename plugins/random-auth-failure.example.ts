export default {
  name: 'random-auth-failure',
  onRequest(ctx: {
    url: string;
    forceError: (statusCode?: number) => void;
    addDelay: (ms: number) => void;
  }) {
    if (ctx.url.includes('/auth') || ctx.url.includes('/login')) {
      if (Math.random() < 0.25) {
        ctx.forceError(401);
        return;
      }
      ctx.addDelay(700);
    }
  },
  onResponse(ctx: { setHeader: (name: string, value: string) => void }) {
    ctx.setHeader('x-chaos-plugin', 'random-auth-failure');
  },
};
