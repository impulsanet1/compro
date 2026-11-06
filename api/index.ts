import { createApiMiddleware } from '../apiApp.ts';

const app = createApiMiddleware();

// Vercel Serverless Function entry point
export default function handler(req: any, res: any) {
  return app(req, res);
}
