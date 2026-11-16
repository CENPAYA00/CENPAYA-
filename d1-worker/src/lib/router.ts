
export interface RouteContext<Env> {
  request: Request;
  env: Env;
  params: Record<string, string>;
}

export type RouteHandler<Env> = (
  context: RouteContext<Env>
) => Response | Promise<Response>;

interface Route<Env> {
  method: string;
  path: string;
  handler: RouteHandler<Env>;
}

export class Router<Env> {
  private routes: Route<Env>[] = [];

  on(
    method: string,
    path: string,
    handler: RouteHandler<Env>
  ): this {
    this.routes.push({
      method: method.toUpperCase(),
      path,
      handler
    });

    return this;
  }

  get(path: string, handler: RouteHandler<Env>): this {
    return this.on("GET", path, handler);
  }

  post(path: string, handler: RouteHandler<Env>): this {
    return this.on("POST", path, handler);
  }

  put(path: string, handler: RouteHandler<Env>): this {
    return this.on("PUT", path, handler);
  }

  patch(path: string, handler: RouteHandler<Env>): this {
    return this.on("PATCH", path, handler);
  }

  delete(path: string, handler: RouteHandler<Env>): this {
    return this.on("DELETE", path, handler);
  }

  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    for (const route of this.routes) {
      if (route.method !== method) {
        continue;
      }

      const routeParts = route.path.split("/").filter(Boolean);
      const requestParts = url.pathname.split("/").filter(Boolean);

      if (routeParts.length !== requestParts.length) {
        continue;
      }

      const params: Record<string, string> = {};
      let matched = true;

      for (let index = 0; index < routeParts.length; index++) {
        const routePart = routeParts[index];
        const requestPart = requestParts[index];

        if (routePart.startsWith(":")) {
          params[routePart.slice(1)] = decodeURIComponent(requestPart);
        } else if (routePart !== requestPart) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return route.handler({
          request,
          env,
          params
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Route not found"
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }
        }
