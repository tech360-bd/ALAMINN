declare module "express" {
  export interface Request {
    userId?: string;
    role?: string;
    permissions?: string[];
    headers: { [key: string]: string | undefined };
    query?: { [key: string]: any };
    body: any;
    params?: { [key: string]: any };
    path?: string;
    url?: string;
    method?: string;
    ip?: string;
    socket?: { remoteAddress?: string };
  }

  export interface Response {
    statusCode: number;
    status(code: number): Response;
    json(body: any): Response;
    send(body: any): Response;
    setHeader(name: string, value: string | number): this;
    getHeader(name: string): string | null;
    on(event: string, listener: (...args: any[]) => void): this;
    readonly headersOut: { [key: string]: string };
  }

  export type NextFunction = (err?: any) => void;
  export type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;
  export type ErrorRequestHandler = (err: any, req: Request, res: Response, next: NextFunction) => void;

  function express(): any;
  namespace express {
    export function json(options?: { limit?: string }): any;
    export function urlencoded(options?: { extended: boolean; limit?: string }): any;
    export function Router(): any;
  }
  export default express;
}
