import type { AxiosInstance } from "axios";
import type { NextAuthHandler } from "../auth/nextauth.js";
import type { TRPCClient } from "../trpc-client.js";

export interface ApiContext {
  httpClient: AxiosInstance;
  nextAuth: NextAuthHandler;
  trpcClient: TRPCClient;
  getCookieStatus(): string;
}
