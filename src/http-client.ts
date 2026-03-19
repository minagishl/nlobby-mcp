import fetch from "node-fetch";
import type { RequestInit, Response } from "node-fetch";

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface HttpRequestConfig {
  url: string;
  method: string;
  headers: Record<string, string | undefined>;
  timeout: number;
}

type RequestInterceptorFn = (
  config: HttpRequestConfig,
) => HttpRequestConfig | Promise<HttpRequestConfig>;

type ResponseInterceptorSuccessFn<T = unknown> = (
  response: HttpResponse<T>,
) => HttpResponse<T> | Promise<HttpResponse<T>>;

type ResponseInterceptorErrorFn = (error: unknown) => never | Promise<never>;

export class HttpClientError extends Error {
  response?: {
    status: number;
    statusText: string;
    data: unknown;
    headers: Record<string, string>;
  };
  config?: {
    url?: string;
    method?: string;
    headers?: Record<string, string | undefined>;
    timeout?: number;
  };
  code?: string;

  constructor(message: string) {
    super(message);
    this.name = "HttpClientError";
  }
}

export class HttpClient {
  defaults: {
    headers: Record<string, string | undefined>;
    timeout: number;
    baseURL: string;
  };

  private baseURL: string;
  private requestInterceptors: RequestInterceptorFn[] = [];
  private responseSuccessInterceptors: ResponseInterceptorSuccessFn[] = [];
  private responseErrorInterceptors: ResponseInterceptorErrorFn[] = [];

  readonly interceptors = {
    request: {
      use: (fn: RequestInterceptorFn): void => {
        this.requestInterceptors.push(fn);
      },
    },
    response: {
      use: (
        successFn: ResponseInterceptorSuccessFn,
        errorFn?: ResponseInterceptorErrorFn,
      ): void => {
        this.responseSuccessInterceptors.push(successFn);
        if (errorFn) {
          this.responseErrorInterceptors.push(errorFn);
        }
      },
    },
  };

  constructor(options: {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
    withCredentials?: boolean;
  }) {
    this.baseURL = options.baseURL ?? "";
    this.defaults = {
      headers: { ...(options.headers ?? {}) },
      timeout: options.timeout ?? 30000,
      baseURL: this.baseURL,
    };
  }

  async get<T = unknown>(
    url: string,
    config?: {
      headers?: Record<string, string | undefined>;
      withCredentials?: boolean;
      timeout?: number;
      params?: Record<string, string | undefined>;
    },
  ): Promise<HttpResponse<T>> {
    return this.request<T>("GET", url, undefined, config);
  }

  async post<T = unknown>(
    url: string,
    body?: unknown,
    config?: {
      headers?: Record<string, string | undefined>;
      withCredentials?: boolean;
      timeout?: number;
      params?: Record<string, string | undefined>;
    },
  ): Promise<HttpResponse<T>> {
    return this.request<T>("POST", url, body, config);
  }

  private async parseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        return await response.text();
      }
    }
    return await response.text();
  }

  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  private async runErrorInterceptors(error: HttpClientError): Promise<void> {
    for (const interceptor of this.responseErrorInterceptors) {
      await interceptor(error);
    }
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    config?: {
      headers?: Record<string, string | undefined>;
      withCredentials?: boolean;
      timeout?: number;
      params?: Record<string, string | undefined>;
    },
  ): Promise<HttpResponse<T>> {
    let fullUrl = url.startsWith("http") ? url : `${this.baseURL}${url}`;
    if (config?.params && Object.keys(config.params).length > 0) {
      const filteredParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(config.params)) {
        if (v !== undefined) filteredParams[k] = v;
      }
      const qs = new URLSearchParams(filteredParams).toString();
      fullUrl += (fullUrl.includes("?") ? "&" : "?") + qs;
    }

    const mergedHeaders: Record<string, string | undefined> = {
      ...this.defaults.headers,
      ...(config?.headers ?? {}),
    };

    let reqConfig: HttpRequestConfig = {
      url: fullUrl,
      method,
      headers: mergedHeaders,
      timeout: config?.timeout ?? this.defaults.timeout,
    };

    for (const interceptor of this.requestInterceptors) {
      reqConfig = await interceptor(reqConfig);
    }

    const fetchHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(reqConfig.headers)) {
      if (val !== undefined) {
        fetchHeaders[key] = val;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), reqConfig.timeout);

    let fetchResponse: Response;
    try {
      const init: RequestInit = {
        method: reqConfig.method,
        headers: fetchHeaders,
        signal: controller.signal as RequestInit["signal"],
      };

      if (body !== undefined) {
        init.body = typeof body === "string" ? body : JSON.stringify(body);
      }

      fetchResponse = await fetch(reqConfig.url, init);
      clearTimeout(timer);
    } catch (error) {
      clearTimeout(timer);

      const networkErr = new HttpClientError(
        error instanceof Error ? error.message : "Network error",
      );
      networkErr.config = {
        url: reqConfig.url,
        method: reqConfig.method,
        headers: reqConfig.headers,
        timeout: reqConfig.timeout,
      };

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          networkErr.code = "ETIMEDOUT";
          networkErr.message = `timeout of ${reqConfig.timeout}ms exceeded`;
        } else if (error.message.includes("ECONNREFUSED")) {
          networkErr.code = "ECONNREFUSED";
        } else if (error.message.includes("ENOTFOUND")) {
          networkErr.code = "ENOTFOUND";
        }
      }

      await this.runErrorInterceptors(networkErr);
      throw networkErr;
    }

    const data = await this.parseBody(fetchResponse);
    const responseHeaders = this.extractHeaders(fetchResponse);

    if (!fetchResponse.ok) {
      const err = new HttpClientError(
        `Request failed with status code ${fetchResponse.status}`,
      );
      err.response = {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        data,
        headers: responseHeaders,
      };
      err.config = {
        url: reqConfig.url,
        method: reqConfig.method,
        headers: reqConfig.headers,
        timeout: reqConfig.timeout,
      };

      await this.runErrorInterceptors(err);
      throw err;
    }

    const httpResponse: HttpResponse<T> = {
      data: data as T,
      status: fetchResponse.status,
      statusText: fetchResponse.statusText,
      headers: responseHeaders,
    };

    let result: HttpResponse<unknown> = httpResponse;
    for (const interceptor of this.responseSuccessInterceptors) {
      result = await interceptor(result);
    }

    return result as HttpResponse<T>;
  }
}
