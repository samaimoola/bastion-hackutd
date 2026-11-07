import { createMiddleware } from "@tanstack/react-start";

/**
 * Server function middleware: maps failures thrown by the generated
 * requireSupabaseAuth (plain Errors whose message starts with "Unauthorized")
 * to a plain 401 response. The response body is a constant, so no token, claim
 * or error detail is exposed. Any other error is rethrown unchanged.
 *
 * Not registered globally. Attach it only to the functions that need it, listed
 * before requireSupabaseAuth so it wraps it.
 */
export const unauthorizedToResponse = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unauthorized")) {
        throw new Response("Unauthorized", {
          status: 401,
          headers: {
            "content-type": "text/plain;charset=UTF-8",
            "www-authenticate": "Bearer",
          },
        });
      }
      throw error;
    }
  },
);
