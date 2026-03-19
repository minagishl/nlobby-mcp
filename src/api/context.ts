import type { HttpClient } from "../http-client.js";
import type { NextAuthHandler } from "../auth/nextauth.js";
import type { TRPCClient } from "../trpc-client.js";

export interface ApiContext {
  httpClient: HttpClient;
  nextAuth: NextAuthHandler;
  trpcClient: TRPCClient;
  getCookieStatus(): string;
}
