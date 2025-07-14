import puppeteer, { Browser, Page } from 'puppeteer';
import { CONFIG } from './config.js';
import { logger } from './logger.js';

export interface ExtractedCookies {
	sessionToken?: string;
	csrfToken?: string;
	callbackUrl?: string;
	allCookies: string;
}

export class BrowserAuth {
	private browser: Browser | null = null;
	private page: Page | null = null;

	async initializeBrowser(): Promise<void> {
		try {
			logger.info('Initializing browser for authentication...');

			// Check if browser is already running and clean up
			if (this.browser) {
				try {
					await this.browser.close();
				} catch (e) {
					logger.warn('Error closing existing browser:', e);
				}
				this.browser = null;
				this.page = null;
			}

			this.browser = await puppeteer.launch({
				headless: false, // Show browser for user interaction if needed
				defaultViewport: {
					width: 1280,
					height: 800,
				},
				// Chrome stability improvements
				ignoreDefaultArgs: ['--disable-extensions', '--disable-default-apps'],
				args: [
					// Essential stability args
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--disable-gpu',
					'--no-first-run',
					'--no-default-browser-check',
					'--no-pings',
					'--password-store=basic',
					'--use-mock-keychain',

					// Memory management
					'--memory-pressure-off',
					'--max_old_space_size=4096',
					'--js-flags="--max-old-space-size=4096"',

					// Process management (remove single-process which can cause crashes)
					'--disable-background-timer-throttling',
					'--disable-renderer-backgrounding',
					'--disable-backgrounding-occluded-windows',

					// Security and privacy (minimal set)
					'--disable-background-mode',
					'--disable-default-apps',
					'--disable-sync',
					'--disable-translate',
					'--disable-infobars',
					'--disable-notifications',
					'--disable-popup-blocking',

					// Performance optimizations
					'--enable-async-dns',
					'--enable-simple-cache-backend',
					'--enable-tcp-fast-open',
					'--prerender-from-omnibox=disabled',

					// OAuth compatibility
					'--disable-features=VizDisplayCompositor,TranslateUI',
					'--disable-search-engine-choice-screen',
					'--disable-component-update',
					'--allow-running-insecure-content',

					// Crash prevention
					'--disable-hang-monitor',
					'--disable-prompt-on-repost',
					'--disable-client-side-phishing-detection',
					'--disable-domain-reliability',
					'--disable-logging',
					'--disable-login-animations',
					'--disable-modal-animations',
					'--disable-motion-blur',
					'--disable-smooth-scrolling',
					'--disable-threaded-animation',
					'--disable-threaded-scrolling',
					'--disable-checker-imaging',
					'--disable-new-profile-management',
					'--disable-new-avatar-menu',
					'--disable-new-bookmark-apps',
				],
				// Additional stability options
				timeout: 60000,
				protocolTimeout: 60000,
				slowMo: 250, // Add slight delay to prevent overwhelming the browser
			});

			this.page = await this.browser.newPage();

			// Set user agent to match typical browser
			await this.page.setUserAgent(
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
			);

			// Configure page to handle navigation robustly
			await this.page.setDefaultNavigationTimeout(60000);
			await this.page.setDefaultTimeout(30000);

			// Handle page errors gracefully
			this.page.on('error', (error) => {
				logger.error('Page error:', error);
			});

			this.page.on('pageerror', (error) => {
				logger.error('Page JavaScript error:', error);
			});

			this.page.on('console', (message) => {
				if (message.type() === 'error') {
					logger.error('Browser console error:', message.text());
				}
			});

			// Handle frame detached events
			this.page.on('framedetached', (frame) => {
				logger.warn('Frame detached:', frame.url());
			});

			// Handle browser disconnect and crashes
			this.browser.on('disconnected', () => {
				logger.error('Browser disconnected unexpectedly');
				this.browser = null;
				this.page = null;
			});

			this.browser.on('targetcreated', (target) => {
				logger.info('New browser target created:', target.url());
			});

			this.browser.on('targetdestroyed', (target) => {
				logger.info('Browser target destroyed:', target.url());
			});

			// Set resource limits to prevent memory issues
			await this.page.setJavaScriptEnabled(true);
			await this.page.setCacheEnabled(false);

			// Set request interception to block unnecessary resources
			await this.page.setRequestInterception(true);
			this.page.on('request', (request) => {
				const resourceType = request.resourceType();

				// Block heavy resources that might cause crashes
				if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
					// Allow some images for login captcha/2FA
					if (
						resourceType === 'image' &&
						(request.url().includes('accounts.google.com') ||
							request.url().includes('gstatic.com') ||
							request.url().includes('googleapis.com'))
					) {
						request.continue();
					} else {
						request.abort();
					}
				} else {
					request.continue();
				}
			});

			logger.info('Browser initialized successfully');
		} catch (error) {
			logger.error('Failed to initialize browser:', error);

			// Clean up if initialization failed
			if (this.browser) {
				try {
					await this.browser.close();
				} catch (e) {
					logger.warn('Error closing browser after initialization failure:', e);
				}
				this.browser = null;
				this.page = null;
			}

			throw new Error('Failed to initialize browser for authentication');
		}
	}

	private async setupPageConfiguration(): Promise<void> {
		if (!this.page) throw new Error('Page not initialized');

		// Set user agent to match typical browser
		await this.page.setUserAgent(
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
		);

		// Configure page to handle navigation robustly
		await this.page.setDefaultNavigationTimeout(60000);
		await this.page.setDefaultTimeout(30000);

		// Handle page errors gracefully
		this.page.on('error', (error) => {
			logger.error('Page error:', error);
		});

		this.page.on('pageerror', (error) => {
			logger.error('Page JavaScript error:', error);
		});

		this.page.on('console', (message) => {
			if (message.type() === 'error') {
				logger.error('Browser console error:', message.text());
			}
		});

		// Set resource limits to prevent memory issues
		await this.page.setJavaScriptEnabled(true);
		await this.page.setCacheEnabled(false);

		// Set request interception to block unnecessary resources
		await this.page.setRequestInterception(true);
		this.page.on('request', (request) => {
			const resourceType = request.resourceType();

			// Block heavy resources that might cause crashes
			if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
				// Allow some images for login captcha/2FA
				if (
					resourceType === 'image' &&
					(request.url().includes('accounts.google.com') ||
						request.url().includes('gstatic.com') ||
						request.url().includes('googleapis.com'))
				) {
					request.continue();
				} else {
					request.abort();
				}
			} else {
				request.continue();
			}
		});
	}

	private async checkBrowserHealth(): Promise<boolean> {
		try {
			if (!this.browser || !this.browser.isConnected()) {
				logger.warn('Browser is not connected');
				return false;
			}

			if (!this.page || this.page.isClosed()) {
				logger.warn('Page is closed');
				return false;
			}

			// Try to evaluate a simple expression
			await this.page.evaluate(() => document.readyState);
			return true;
		} catch (error) {
			logger.warn('Browser health check failed:', error);
			return false;
		}
	}

	private async extractCookies(): Promise<ExtractedCookies> {
		if (!this.page) throw new Error('Page not initialized');

		try {
			logger.info('Extracting cookies from N Lobby session...');

			const cookies = await this.page.cookies();

			let sessionToken: string | undefined;
			let csrfToken: string | undefined;
			let callbackUrl: string | undefined;

			const cookieStrings: string[] = [];

			for (const cookie of cookies) {
				const cookieString = `${cookie.name}=${cookie.value}`;
				cookieStrings.push(cookieString);

				// Extract specific NextAuth.js cookies
				if (cookie.name === '__Secure-next-auth.session-token') {
					sessionToken = cookie.value;
				} else if (cookie.name === '__Host-next-auth.csrf-token') {
					csrfToken = cookie.value;
				} else if (cookie.name === '__Secure-next-auth.callback-url') {
					callbackUrl = decodeURIComponent(cookie.value);
				}
			}

			const allCookies = cookieStrings.join('; ');

			logger.info(`Extracted ${cookies.length} cookies from N Lobby session`);
			logger.info(`Session token: ${sessionToken ? 'present' : 'missing'}`);
			logger.info(`CSRF token: ${csrfToken ? 'present' : 'missing'}`);

			return {
				sessionToken,
				csrfToken,
				callbackUrl,
				allCookies,
			};
		} catch (error) {
			logger.error('Failed to extract cookies:', error);
			throw new Error('Failed to extract authentication cookies');
		}
	}

	async takeScreenshot(filename: string = 'nlobby-auth-screenshot.png'): Promise<string> {
		if (!this.page) throw new Error('Page not initialized');

		const screenshotPath = `/tmp/${filename}`;
		await this.page.screenshot({ path: screenshotPath as `${string}.png`, fullPage: true });
		logger.info(`Screenshot saved to ${screenshotPath}`);
		return screenshotPath;
	}

	async getCurrentUrl(): Promise<string> {
		if (!this.page) throw new Error('Page not initialized');
		return this.page.url();
	}

	async getPageTitle(): Promise<string> {
		if (!this.page) throw new Error('Page not initialized');
		return this.page.title();
	}

	private async waitForRedirectWithRetry(baseUrl: string, timeout: number): Promise<void> {
		const maxRetries = 3;
		const retryDelay = 2000;
		const baseUrlDomain = baseUrl.replace('https://', '').replace('http://', '');

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				// Check if browser crashed
				if (!this.browser || !this.browser.isConnected()) {
					logger.error('Browser crashed or disconnected, reinitializing...');
					await this.initializeBrowser();
				}

				logger.info(`Waiting for redirect back to N Lobby (attempt ${attempt}/${maxRetries})...`);

				await this.page!.waitForFunction(
					(domain) => window.location.href.includes(domain),
					{ timeout: timeout / maxRetries },
					baseUrlDomain
				);

				logger.info('Successfully redirected back to N Lobby');
				return;
			} catch (error) {
				if (attempt === maxRetries) {
					logger.error('All redirect attempts failed:', error);
					throw new Error(
						`Failed to detect redirect after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}

				logger.warn(`Redirect attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
				await new Promise((resolve) => setTimeout(resolve, retryDelay));

				// Check if page is still accessible or if browser crashed
				try {
					if (!this.browser || !this.browser.isConnected()) {
						logger.error('Browser crashed, reinitializing...');
						await this.initializeBrowser();
						// Navigate back to the expected page
						await this.page!.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
					} else {
						await this.page!.evaluate(() => document.readyState);
					}
				} catch {
					logger.warn('Page became inaccessible, creating new page...');
					if (this.browser && this.browser.isConnected()) {
						this.page = await this.browser.newPage();
						await this.setupPageConfiguration();
					}
				}
			}
		}
	}

	private async waitForLoginCompletionWithRetry(timeout: number): Promise<void> {
		const maxRetries = 3;
		const retryDelay = 2000;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				// Check if browser crashed
				if (!this.browser || !this.browser.isConnected()) {
					logger.error('Browser crashed during login detection, reinitializing...');
					await this.initializeBrowser();
					await this.page!.goto(CONFIG.nlobby.baseUrl, {
						waitUntil: 'networkidle2',
						timeout: 30000,
					});
				}

				logger.info(`Waiting for login completion (attempt ${attempt}/${maxRetries})...`);

				await this.page!.waitForFunction(
					() => {
						// Check for signs of successful login
						return (
							document.querySelector('[data-testid="user-menu"], .user-profile, .logout-btn') !==
								null ||
							document.cookie.includes('next-auth.session-token') ||
							window.location.pathname.includes('/home') ||
							window.location.pathname.includes('/dashboard')
						);
					},
					{ timeout: timeout / maxRetries }
				);

				logger.info('Login completion detected');
				return;
			} catch (error) {
				if (attempt === maxRetries) {
					logger.error('All login detection attempts failed:', error);
					throw new Error(
						`Failed to detect login completion after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}

				logger.warn(`Login detection attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
				await new Promise((resolve) => setTimeout(resolve, retryDelay));

				// Check if page is still accessible or if browser crashed
				try {
					if (!this.browser || !this.browser.isConnected()) {
						logger.error('Browser crashed during login detection, reinitializing...');
						await this.initializeBrowser();
						await this.page!.goto(CONFIG.nlobby.baseUrl, {
							waitUntil: 'networkidle2',
							timeout: 30000,
						});
					} else {
						await this.page!.evaluate(() => document.readyState);
					}
				} catch {
					logger.warn('Page became inaccessible during login detection, creating new page...');
					if (this.browser && this.browser.isConnected()) {
						this.page = await this.browser.newPage();
						await this.setupPageConfiguration();
						await this.page.goto(CONFIG.nlobby.baseUrl, {
							waitUntil: 'networkidle2',
							timeout: 30000,
						});
					}
				}
			}
		}
	}

	async close(): Promise<void> {
		try {
			if (this.page) {
				await this.page.close();
				this.page = null;
			}

			if (this.browser) {
				await this.browser.close();
				this.browser = null;
			}

			logger.info('Browser closed successfully');
		} catch (error) {
			logger.error('Error closing browser:', error);
		}
	}

	async interactiveLogin(): Promise<ExtractedCookies> {
		// Check browser health before starting
		const isHealthy = await this.checkBrowserHealth();
		if (!isHealthy) {
			logger.warn('Browser unhealthy, reinitializing...');
			await this.initializeBrowser();
		}

		if (!this.browser || !this.page) {
			throw new Error('Browser not initialized. Call initializeBrowser() first.');
		}

		try {
			logger.info('Starting interactive login process...');

			// Navigate to N Lobby
			await this.page.goto(CONFIG.nlobby.baseUrl, {
				waitUntil: 'networkidle2',
				timeout: 30000,
			});

			logger.info('N Lobby page loaded. Please complete the login process in the browser window.');
			logger.info('The browser will remain open for you to login manually.');

			// Wait for user to complete login (detect when we're on the authenticated page)
			await this.waitForLoginCompletionWithRetry(300000);

			logger.info('Login detected! Extracting cookies...');

			// Extract cookies after successful login
			const cookies = await this.extractCookies();

			return cookies;
		} catch (error) {
			logger.error('Interactive login failed:', error);

			// Enhanced error logging for interactive login
			if (this.page) {
				try {
					const currentUrl = await this.page.url();
					const title = await this.page.title();
					logger.error(`Current URL: ${currentUrl}`);
					logger.error(`Page title: ${title}`);

					// Take screenshot for debugging
					await this.takeScreenshot('interactive-login-failure-debug.png');
				} catch (debugError) {
					logger.error('Failed to capture debug information:', debugError);
				}
			}

			throw new Error(
				`Interactive login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}
}
