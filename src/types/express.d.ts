declare module "express" {
  export class Request {
    userId?: string;
    role?: string;
    permissions?: string[];
    headers: { [key: string]: string };
    query: { [key: string]: any };
    body: any;
    params: { [key: string]: any };
    ip?: string;
    socket: { remoteAddress?: string };
  }

  export class Response {
    status(code: number): Response;
    json(body: any): Response;
    send(body: any): any;
    setHeader(name: string, value: string): this;
    getHeader(name: string): string | null;
    readonly headersOut: { [key: string]: string };
  }

  export function json(): any;
  export function urlencoded(options?: { extended: boolean; limit?: string }): any;
  export namespace Router {
    export function Router(): any;
  }
}

export type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;
export type ErrorRequestHandler = (err: any, req: Request, res: Response, next: NextFunction) => void;

export interface ErrorRequestHandler {
  (err: any, req: Request, res: Response, next: NextFunction): void;
}