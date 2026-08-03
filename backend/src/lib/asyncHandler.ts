import type { NextFunction, Request, Response } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// Express 4 ne catch pas automatiquement les rejets de Promise dans les
// handlers async : sans ce wrapper, une erreur jetée dans un handler async
// resterait non gérée au lieu de tomber dans le error handler central.
export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
