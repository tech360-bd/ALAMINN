declare module "express" {
  export interface Request {
    userId?: string;
    role?: string;
    permissions?: string[];
    headers: { [key: string]: string | undefined };
    query?: { [key: string]: unknown };
    body: unknown;
    params?: { [key: string]: unknown };
    path?: string;
    url?: string;
    method?: string;
    ip?: string;
    socket?: { remoteAddress?: string };
  }

  export interface Response {
    statusCode: number;
    status(code: number): Response;
    json(body: unknown): Response;
    send(body: unknown): Response;
    setHeader(name: string, value: string | number): this;
    getHeader(name: string): string | null;
    on(event: string, listener: (...args: unknown[]) => void): this;
    readonly headersOut: { [key: string]: string };
  }

  export type NextFunction = (err?: unknown) => void;
  export type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;
  export type ErrorRequestHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => void;

  function express(): unknown;
  namespace express {
    export function json(options?: { limit?: string }): unknown;
    export function urlencoded(options?: { extended: boolean; limit?: string }): unknown;
    export function Router(): unknown;
  }
  export default express;
}
