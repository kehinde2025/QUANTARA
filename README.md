# Quantara

Deriv-connected automated trading platform. **Early development. Demo accounts only.**
No guaranteed profits, no guaranteed win rates.

## Status

| Area | State |
| --- | --- |
| Frontend (Next.js 16, Tailwind v3) | Placeholder page only |
| Backend (Express, TypeScript) | `/health` endpoint only |
| Database, auth, Deriv integration, bots | Not started |

## Layout

- `frontend/` Next.js app (App Router, no `src/` folder)
- `backend/` Express API (`backend/src/`)
- `spike/` Stage 0 throwaway scripts used to test the Deriv API. Not production code.

## Run locally

Backend (port 4000):

```bash
cd backend
npm run dev
```

Check http://localhost:4000/health

Frontend (port 3000):

```bash
cd frontend
npm run dev
```

## Checks

```bash
cd backend
npm test
npm run typecheck
```

## Environment variables

Copy `.env.example` to `.env`. Never commit `.env` or any token.

## What the Stage 0 spike verified (demo account only)

- Public market feed works without login.
- Contract types ACCU, CALL/PUT and the DIGIT types exist on R_100.
- A Personal Access Token connection can list accounts and stay connected
  for over an hour. Drops happened and the script reconnected on its own.
- One 1 USD, 5-tick CALL was quoted, bought and settled; balance matched.
- A finished contract shows `is_expired` before `is_sold`. A result is only
  final when `is_sold` is 1.

## Known unknowns

- OAuth refresh tokens: unconfirmed. The OAuth page shows a 1-hour access token and no refresh token.
- Markup per market (e.g. forex vs synthetics): unconfirmed.
- Accumulator and Digit trade flows: not yet tested.
- Real-account trading: never tested. Not enabled.











the real master prompt 
QUANTARA

MASTER PROJECT SPECIFICATION, PRODUCT REQUIREMENTS, DERIV API INTEGRATION, AND DEVELOPMENT PLAN

Product name: Quantara
Tagline: Intelligence in Every Trade.
Product category: Deriv-connected automated trading platform
Development approach: Build from scratch, stage by stage, with complete code supplied file by file.
Primary objective: Build a professional, responsive trading automation platform that allows users to connect their Deriv accounts, configure automated trading strategies, monitor market data, receive trading signals, manage risk, and review their trading performance.

You are the primary coding assistant responsible for helping me implement this application.

Your responsibility is not simply to create an attractive dashboard. You must help me build a working application with a properly structured frontend, backend, database, secure account connections, trading logic, automated execution, monitoring, risk controls, administrative functions, and transparent revenue reporting.

Read and understand the entire specification before writing any code.

Do not attempt to build everything at once.

We will implement the project in stages, testing each stage before proceeding to the next.

⸻

1. PRODUCT VISION

Quantara will be a trading automation platform connected to Deriv.

Customers will register for Quantara, connect their Deriv accounts using an officially supported authorization process, configure trading bots, and allow the bots to execute supported contracts automatically when the users enable them.

Users must be able to monitor their bots and trading activity from a mobile phone, tablet, or desktop computer.

The application should continue running its authorized automated trading processes when a user closes their browser or turns off their phone. This requires a properly deployed backend service that maintains the necessary connections, manages bot state, and handles trading operations independently of the user’s browser.

The platform must distinguish between:

1. Quantara user accounts.
2. Connected Deriv accounts.
3. Individual trading bots.
4. Trading strategies and their configurations.
5. Trading signals.
6. Orders and contract purchases.
7. Open contracts and settled contracts.
8. User trading performance.
9. Platform subscription revenue.
10. Any supported trading-related fees or markup revenue.

These concepts must not be mixed into one database table or one large application function.

The frontend is responsible for displaying information and collecting user settings.

The backend is responsible for authentication, account authorization, strategy execution, risk validation, trading operations, data persistence, and administrative permissions.

No trading operation should be allowed to bypass the backend risk controls.

Product goals

Build a platform that is:

* Professional and easy to use.
* Fully responsive on mobile, tablet, and desktop.
* Secure by design.
* Connected to real Deriv market data.
* Capable of automated trading through supported Deriv API operations.
* Designed for multiple customers with separate accounts and data.
* Able to run enabled bots continuously on a deployed backend.
* Equipped with three distinct automated trading bots.
* Equipped with live trading signals.
* Equipped with comprehensive trading history and performance reporting.
* Monetizable through subscriptions and only those trading-related fees that are actually supported and permitted.
* Extensible so that new strategies and features can be introduced later.

Do not promise users guaranteed profits, guaranteed win rates, or risk-free trading.

⸻

2. BRAND IDENTITY AND DESIGN SYSTEM

Quantara must have a premium fintech appearance.

Brand colors

Use these colors consistently:

* Deep Black: #0A0A0A
* Charcoal: #171717
* Gold: #D4AF37
* Champagne: #F5E6B3
* White: #FFFFFF
* Gray: #A3A3A3
* Emerald Green: #10B981 for positive financial results.
* Red: #EF4444 for negative financial results and critical risk warnings.

Visual direction

The application should feel like a premium automated trading product.

Use:

* Clean layouts.
* Consistent spacing.
* Professional typography.
* Clear data hierarchy.
* Elegant cards.
* High-quality charts.
* Subtle gold highlights.
* Clear status indicators.
* Well-designed forms.
* Consistent buttons and input components.
* Accessible text contrast.
* Loading states and error states.
* Empty states that explain what users should do next.

Avoid excessive gradients, excessive animations, unnecessary decoration, and cluttered dashboards.

The application should not look like a generic template.

Create reusable UI components so that the same design language is maintained throughout the product.

⸻

3. RESPONSIVE DESIGN IS MANDATORY

Quantara must be mobile-first and fully responsive from the first implementation.

Mobile support must not be postponed until the desktop application is complete.

Mobile requirements

On mobile phones:

* Use a compact dashboard layout.
* Use bottom navigation for the main application sections.
* Provide touch-friendly buttons and controls.
* Ensure forms fit smaller screens.
* Prevent horizontal page overflow.
* Make charts readable and usable.
* Display account balances and bot status clearly.
* Use mobile-friendly trading panels.
* Use bottom sheets or appropriately sized panels for trading configuration when suitable.
* Allow users to start, pause, resume, and stop their bots.
* Make risk settings easy to review.
* Make trading history readable without requiring desktop-sized tables.
* Ensure the interface works on common iPhone and Android screen sizes.

Suggested mobile bottom navigation:

1. Dashboard
2. Markets
3. Bots
4. Activity
5. Account

Use a collapsible sidebar on desktop.

On tablets, adapt the sidebar and dashboard layout to the available screen space.

On desktop, use wider dashboards, more detailed charts, and expanded data tables where useful.

Responsive testing

Test representative viewports, including:

* 320px wide.
* 375px wide.
* 390px wide.
* 768px wide.
* 1024px wide.
* 1440px wide.

The exact supported dimensions may expand during development.

Do not claim the application is fully responsive without actually testing the layouts.

⸻

4. WHAT WE ARE NOT BUILDING IN THE INITIAL VERSION

Do not build the AI Market Assistant or an AI chatbot in the initial version.

The AI Market Assistant was considered, but we have deliberately excluded it from the current scope to avoid unnecessary complexity and potential external AI API costs.

Do not create:

* An AI chat interface.
* An AI trading adviser chatbot.
* An AI conversational market-analysis service.
* An external LLM integration.
* A dependency on paid AI inference APIs.

We may add an AI assistant in the future.

Keep the architecture extensible, but do not spend time implementing the assistant now.

Important distinction:

The Digit AI Bot described below is an automated trading strategy module. It does not automatically require an external AI model or paid AI API. Its initial implementation should use documented market data, statistical analysis, and programmed strategy rules.

Do not use the name Digit AI as an excuse to claim that random digit outcomes can be reliably predicted.

⸻

5. USER ACCOUNTS AND AUTHENTICATION

Quantara must support multiple independent customers.

Implement:

* User registration.
* Login.
* Logout.
* Secure session management.
* Password hashing using a suitable password-hashing algorithm.
* Account recovery or password-reset flow.
* Email verification if the chosen deployment setup supports it.
* Account settings.
* Authorization middleware.
* Appropriate rate limiting.
* Validation of all user input.
* Protection against unauthorized access to other users’ data.

Users must only be able to access their own:

* Connected Deriv accounts.
* Bot configurations.
* Trading signals associated with their accounts.
* Trading activity.
* Trading history.
* Personal performance reports.
* Subscription records.
* Notifications.
* Settings.

Never trust a user ID supplied by the frontend without validating it against the authenticated session.

Every sensitive backend operation must verify the user’s identity and authorization.

⸻

6. OWNER ADMINISTRATOR

There will be one platform owner administrator: me.

I am the only administrator in the initial version.

Customers are ordinary users and must not receive administrative permissions.

The owner admin panel must be protected by backend authorization, not just by hiding a menu item in the frontend.

Admin capabilities

The owner should be able to:

* View registered users.
* View user account status.
* Suspend or reactivate platform accounts where appropriate.
* View platform-wide trading activity.
* View active and inactive bots.
* Monitor bot health.
* Review strategy performance.
* View platform-wide subscription revenue.
* View supported trading-fee revenue.
* Review revenue by strategy or bot.
* Review user trading volume.
* Review trading errors.
* Review API connection health.
* Review risk alerts.
* Review subscription status.
* Configure permitted platform settings.
* Configure permitted strategy defaults.
* Review security and audit logs.
* Stop new automated trading through an emergency platform control.

The emergency control must stop the opening of new trades as quickly as reasonably possible.

It must also show the state of existing open contracts. Do not assume that every open contract can be immediately closed or cancelled.

The admin dashboard must never expose users’ passwords, permanent credentials, raw private tokens, or unnecessary sensitive account data.

Admin access must be checked on the backend for every administrative endpoint.

⸻

7. DERIV API: REQUIRED RESEARCH AND INTEGRATION

Deriv is the external trading platform that Quantara will integrate with.

You must consult Deriv’s current official developer documentation before implementing any API operation.

Use the official Deriv developer documentation and API schemas as the source of truth.

Do not invent endpoints, authorization scopes, contract types, parameters, response fields, account permissions, or fee capabilities.

The API changes over time. Verify the current documentation before writing the integration.

7.1 Understand the API architecture

Deriv provides REST APIs and WebSocket APIs.

Broadly:

* REST APIs are used for supported account-management operations, authorization-related operations, and other documented HTTP operations.
* WebSocket APIs are used for real-time market data, contract pricing, trading operations, and account or contract updates.
* Authenticated WebSocket connections must be established using the currently documented authentication process for the selected API.
* Public market-data operations may be available without account authorization.
* Trading and private account operations require appropriate authorization.

Do not mix legacy API examples with the current API without explicitly checking compatibility.

Choose the appropriate API version and use it consistently.

Where current documentation provides both newer REST trading interfaces and WebSocket interfaces, evaluate which operations are required for this application and use the documented interface appropriate to each operation.

Do not assume an old endpoint or SDK example remains valid merely because it appears in an older tutorial.

7.2 Official documentation to consult

Review the official documentation sections covering:

* API overview and architecture.
* Authentication.
* OAuth 2.0 and PKCE.
* Account access and account identification.
* WebSocket authentication.
* Active symbols.
* Available contract types.
* Real-time tick streams.
* Historical ticks.
* Historical candles where supported.
* Price proposals.
* Contract purchases.
* Open contract monitoring.
* Selling or closing contracts where supported.
* Portfolio information.
* Account balance.
* Trading statements and transaction history where available.
* Contract availability and trading restrictions.
* Error handling.
* API schemas and rate limits where documented.
* Partner and markup capabilities, if relevant to the commercial model.

Search the official documentation for the current request and response schemas for every endpoint used.

7.3 Deriv account connection

Users must connect their Deriv accounts through an officially supported authorization flow.

Prefer the current official OAuth 2.0 Authorization Code flow with PKCE where supported and appropriate for the selected Deriv integration.

The connection process should:

1. Allow the user to select Connect Deriv.
2. Redirect the user to the official Deriv authorization process.
3. Let Deriv handle the user’s login and consent screens.
4. Receive the authorization response.
5. Validate the OAuth state parameter.
6. Complete the required token exchange on the backend.
7. Obtain the appropriate authenticated API connection.
8. Retrieve the accounts the user is authorized to access.
9. Allow the user to select an appropriate account.
10. Display connection status.
11. Retrieve permitted account information.
12. Allow the user to disconnect the account.

Implement the exact current flow documented by Deriv.

Do not invent an OAuth callback format or token-exchange procedure.

Do not request a user’s Deriv password inside Quantara.

Do not ask users to paste passwords into the application.

Do not build an ordinary text field that asks users to provide permanent private credentials as a substitute for proper authorization.

If a Personal Access Token integration is considered necessary, implement it only after reviewing Deriv’s official documentation and security implications. It is not the default approach when an appropriate OAuth flow is available.

7.4 Token and credential security

Authentication credentials must never be:

* Committed to source control.
* Printed in application logs.
* Included in error messages.
* Exposed through frontend JavaScript.
* Stored in localStorage as a permanent secret.
* Returned in ordinary API responses.
* Exposed in analytics events.
* Included in screenshots or debugging output.

Use environment variables for application-level configuration.

Store user authorization credentials only through a properly designed secure backend mechanism appropriate to the authorization method.

Encrypt sensitive stored credentials where storage is necessary.

Use secure session cookies or another appropriately protected session mechanism for Quantara users.

Implement token expiry handling, reauthorization, disconnect behavior, and revocation handling as supported by the selected authorization flow.

Keep each user’s Deriv authorization separate.

Never accidentally use one customer’s authorization to execute another customer’s trades.

⸻

8. DERIV API PERMISSIONS AND SCOPES

Do not assume that all API operations are permitted by every token.

Review the current Deriv documentation to determine the permissions required for each operation.

The documented OAuth scopes have included:

* trade: trading operations.
* account_manage: account creation and management operations.
* application_read: read access to registered applications.
* payment: payment-agent deposit and withdrawal operations.

Verify the current scope names and meanings before implementation.

Least-privilege principle

Request only the permissions Quantara genuinely needs.

For the initial product, the primary requirement is authorized access to supported trading operations and the associated account and contract information.

Do not request payment or withdrawal-related permissions simply because they exist.

Quantara’s initial scope does not include implementing user deposits or withdrawals through Deriv.

Do not implement account creation or account-management features that are unnecessary for the product.

Determine whether account discovery, balance retrieval, account information, contract purchases, contract monitoring, and trading history require additional permissions under the chosen API version.

Document the required permission for each protected operation.

If an operation is unavailable under the selected authorization flow, do not pretend it works.

Explain the limitation and implement a documented alternative only when one exists.

Permission matrix

Create a developer-facing permission matrix showing:

* Feature.
* API operation.
* Authentication requirement.
* Required scope or permission.
* Data accessed.
* Whether the operation can execute a trade.
* Whether the operation is available in demo accounts.
* Whether the operation is available in real accounts.
* Relevant restrictions.

The matrix must reflect the current official documentation.

Do not request more access than necessary.

⸻

9. DERIV MARKET DATA

Quantara must use actual market data returned by Deriv rather than fabricated prices.

Implement the supported operations needed to:

* Retrieve available market symbols.
* Identify supported underlying markets.
* Retrieve the available contract types for a selected symbol.
* Subscribe to real-time ticks.
* Retrieve historical tick data.
* Retrieve historical candles where available and useful.
* Track tick timestamps.
* Update charts.
* Calculate strategy indicators.
* Track market-data connection status.
* Reconnect after temporary disconnections.
* Mark data as stale when it is no longer sufficiently recent.

The exact available symbols, contract types, durations, barriers, and other options must come from the API.

Do not hardcode assumptions that every contract is available on every market.

Do not show a trading button for a contract that the selected symbol does not support.

Volume analysis

Quantara may use market-volume analysis where genuine volume data is available from a documented source.

Do not confuse:

* Actual traded volume.
* Tick frequency.
* Number of price updates.
* Number of contracts purchased by Quantara users.
* Quantara’s aggregate user trading volume.

Tick frequency is not automatically equivalent to traded market volume.

If actual market-volume data is unavailable for a selected Deriv market, explain that limitation and use only the available data.

Do not invent volume figures.

⸻

10. THE THREE CORE TRADING BOTS

Quantara will initially contain exactly three core bot modules.

Each bot must be implemented as a distinct strategy module using a shared, carefully designed trading engine.

Do not duplicate the entire trading engine three times.

Each bot should have:

* Configuration settings.
* A strategy validation process.
* A risk-validation process.
* Start, pause, resume, and stop controls.
* Current status.
* Trade history.
* Performance statistics.
* Error reporting.
* Risk-limit enforcement.
* Connection-health monitoring.
* Persistent state.
* Clear logs of its decisions.
* Protection against duplicate orders.
* A way to determine whether a signal is still valid.

Use a common strategy interface so future strategies can be added without rebuilding the application.

BOT 1: TIME DURATION BOT

Purpose:

Automate supported time-based contracts, particularly Rise/Fall contracts where available.

The user should be able to configure:

* Market or symbol.
* Contract type.
* Stake amount.
* Currency as supported by the account.
* Duration.
* Duration unit.
* Strategy.
* Entry conditions.
* Maximum trades per day.
* Maximum consecutive losses.
* Daily loss limit.
* Maximum permitted stake.
* Trading schedule where appropriate.
* Demo or real account selection where authorized.

Duration selection

Support a fixed duration chosen by the user.

Also design an optional adaptive-duration mode, but only allow it to select durations that are actually supported by the selected market and contract.

The adaptive mode must not invent unsupported durations.

The selected duration should be validated against current API availability and contract rules before a purchase is attempted.

Strategy framework

The bot may support configurable strategies using:

* Exponential moving averages.
* Relative Strength Index.
* Moving Average Convergence Divergence.
* Price-action conditions.
* Higher-timeframe confirmation where suitable data is available.
* Other explicitly implemented and tested rules.

Do not imply that using technical indicators guarantees profitability.

Every strategy must have clear entry conditions and must not place trades merely because the bot is running.

Execution

The bot should:

1. Confirm that the user has enabled it.
2. Confirm the selected account is connected.
3. Verify the current market and contract availability.
4. Receive sufficiently fresh market data.
5. Evaluate the strategy.
6. Generate a signal if the conditions are met.
7. Validate the signal’s freshness.
8. Check all risk limits.
9. Request a valid price proposal.
10. Validate the quote and maximum acceptable purchase price.
11. Submit a purchase through the documented API.
12. Record the result.
13. Monitor the contract.
14. Update performance and history after settlement.

All API request parameters must follow the current official schema.

⸻

BOT 2: ACCUMULATOR BOT

Purpose:

Automate supported Deriv Accumulator contracts.

Users should be able to configure the options that Deriv actually supports, including where available:

* Market or symbol.
* Stake.
* Available growth rate.
* Entry conditions.
* Risk limits.
* Maximum number of concurrent contracts if supported by the application.
* Maximum daily loss.
* Maximum trades per day.
* Maximum consecutive losses.
* Strategy selection.
* Demo or real account.

The growth rate options must be obtained from actual contract availability or validated against the documented supported values.

Do not hardcode growth-rate options that are unavailable for the selected market.

The bot must understand the actual contract mechanics.

Do not assume every Accumulator contract supports the same exit, sell, stop, or update operations.

Implement only controls that Deriv actually supports for the selected contract.

Where an exit operation is available, clearly document how it works.

Where early exit is unavailable, the UI must not falsely promise that the bot can close the contract on demand.

The bot should:

1. Validate the selected market.
2. Validate contract availability.
3. Validate the growth rate.
4. Validate the stake.
5. Evaluate entry conditions.
6. Check risk limits.
7. Obtain a valid proposal.
8. Purchase the contract through the documented API.
9. Monitor the contract using supported operations.
10. Record settlement and financial outcomes.
11. Update performance statistics.
12. Stop new entries when the relevant risk limits are reached.

Do not present an Accumulator strategy as guaranteed to generate profits.

⸻

BOT 3: DIGIT AI BOT

Purpose:

Automate supported Deriv digit contracts using programmed rules and statistical analysis.

The bot does not require an external AI API for its initial implementation.

Supported contract types must be discovered and validated using the official API.

Potential digit contract types include:

* Digit Differs.
* Digit Matches.
* Digit Over.
* Digit Under.
* Digit Even.
* Digit Odd.

Only offer a contract type when it is available for the selected symbol and account.

User configuration

Allow users to configure:

* Market or symbol.
* Digit contract type.
* Stake.
* Prediction digit or barrier when required.
* Duration in ticks where supported.
* Strategy rules.
* Historical observation window.
* Maximum trades per day.
* Maximum consecutive losses.
* Maximum daily loss.
* Maximum stake.
* Demo or real account.

Validate all inputs against the actual contract requirements.

Digit analysis

The bot may calculate:

* Recent last-digit distribution.
* Frequency of each digit in a selected observation window.
* Even/odd distribution.
* Over/under distribution.
* Recent repeated digits.
* Rolling statistical summaries.
* The observed historical frequency of selected outcomes.
* The number of observations supporting a calculation.

However, do not assume that a digit is more likely to appear or not appear merely because it has appeared repeatedly or has been absent recently.

Repeated digits do not prove that the next digit will differ.

Under an idealized independent uniform-digit model, a particular digit has a 10% chance of appearing next, and the probability that the next digit differs from a specified digit is 90%. These are theoretical probabilities, not guarantees of the behavior of every market or of a profitable strategy.

Actual profitability depends on the contract price, payout, settlement rules, market behavior, and other factors.

Do not advertise a 90% guaranteed win rate.

Do not use a short historical window as proof of a predictive edge.

Fixed-stake policy

The initial Digit AI Bot must use fixed-stake trading by default.

Do not enable Martingale, automatic stake doubling, or loss-recovery escalation in the initial version.

Do not claim that D’Alembert or another progression system eliminates risk.

Any future staking progression must be treated as a separate, explicitly configured and thoroughly tested feature.

The bot must stop opening new trades when a risk limit is reached.

Execution

The Digit AI Bot must use the same shared trading engine and risk controls as the other bots.

Before buying a contract, it must verify:

* The account is authorized.
* The market is supported.
* The contract type is available.
* The digit parameters are valid.
* The duration is supported.
* The price proposal is valid.
* The signal is fresh.
* The risk limits permit another trade.
* There is no conflicting or duplicate pending purchase.

Record the strategy decision, observation window, relevant statistical summary, proposal, purchase response, and final outcome.

⸻

11. SHARED AUTOMATED TRADING ENGINE

The three bots must use a common trading engine.

Do not allow each bot to implement its own unprotected purchasing logic.

The shared engine should handle:

* Account selection.
* Authorization validation.
* Market and contract validation.
* Price proposal requests.
* Stake validation.
* Purchase requests.
* Open contract tracking.
* Settlement updates.
* API errors.
* Timeouts.
* Reconnection.
* Duplicate-order protection.
* Trade history persistence.
* Risk validation.
* Audit logs.
* Notifications.
* Strategy-to-execution handoff.

Use a clear separation between strategy logic and order execution.

A strategy should produce a candidate signal.

The risk engine must validate the signal.

The execution engine may submit the purchase only after validation succeeds.

A signal alone must never cause an unchecked trade.

Idempotency and duplicate prevention

Prevent repeated purchases caused by:

* WebSocket reconnection.
* Duplicate messages.
* Browser refreshes.
* Repeated strategy evaluations.
* Request timeouts.
* Retry logic.
* Concurrent worker execution.

Use unique execution identifiers, database constraints, state transitions, or other appropriate mechanisms.

Do not automatically repeat a purchase if the previous purchase may have succeeded but its response was lost.

Reconcile the account and contract state before deciding whether a retry is safe.

⸻

12. RISK MANAGEMENT

Risk management is a core product requirement.

It must not be a cosmetic dashboard feature.

The backend must enforce risk limits regardless of what the frontend displays.

Required controls

Implement:

* Maximum stake per trade.
* Maximum daily loss.
* Maximum trades per day.
* Maximum consecutive losses.
* Maximum concurrent open contracts where appropriate.
* Bot-level enable/disable.
* Pause and resume.
* Stop new entries after risk-limit breaches.
* Platform-level emergency stop.
* Stale-signal rejection.
* Market-data health checks.
* Connection-health checks.
* Duplicate-order prevention.
* Clear warnings before live trading.
* Persistent risk state across server restarts.

Risk settings must be validated on the backend.

Do not allow a frontend request to bypass the user’s configured limits.

Daily loss calculation

Define precisely how daily loss is calculated.

The implementation should account for relevant realized losses and any additional exposure measures required by the chosen risk model.

Do not treat an arbitrary trade count as a complete measure of risk.

Document the timezone and daily reset rule.

Do not silently reset risk counters when a server restarts.

When a limit is reached:

1. Stop opening new trades.
2. Mark the bot as paused or risk-stopped.
3. Record the reason.
4. Notify the user.
5. Update the dashboard.
6. Preserve the state until the defined recovery or reset procedure is followed.

Stopping new trades does not automatically close existing contracts.

Implement closing or selling only when the selected contract and documented API support it.

⸻

13. LIVE TRADING SIGNALS

Quantara must include a Live Signals section.

This is separate from the optional AI Market Assistant, which is excluded from the initial version.

The signals feed should display useful information such as:

* Market.
* Contract type.
* Direction or prediction.
* Strategy that generated the signal.
* Timestamp.
* Signal expiry.
* Signal status.
* Relevant entry conditions.
* Relevant market observations.
* Whether the signal was executed.
* The associated bot where applicable.

Possible statuses include:

* New.
* Valid.
* Executed.
* Expired.
* Cancelled.
* Rejected by risk controls.
* Failed.

Use clear status transitions.

Signals must expire when their conditions are no longer valid or the defined validity period ends.

Do not execute expired signals.

A signal should not be presented as a guaranteed prediction.

Signals that are only informational must be distinguished from signals that have been accepted by the execution engine.

A signal that failed a risk check must not be silently marked as executed.

Use real data and actual strategy outputs. Do not fabricate live signals or prices.

⸻

14. DASHBOARD AND MAIN APPLICATION PAGES

Build the following customer-facing sections.

14.1 Dashboard

Display:

* Account connection status.
* Selected account information where authorized.
* Available balance where supported.
* Active bots.
* Paused bots.
* Today’s trading activity.
* Recent contract results.
* Profit and loss.
* Risk alerts.
* Recent signals.
* Recent activity.
* Shortcuts to manage bots.

Clearly distinguish account balance, stake, contract purchase cost, payout, profit, and loss.

Do not calculate or label contract purchase costs as profit.

14.2 Markets

Display:

* Available symbols.
* Current market prices.
* Price changes where supported.
* Available contract types.
* Real-time updates.
* Market-data connection status.
* Historical charts where supported.

14.3 Bots

Display all three core bots:

1. Time Duration Bot.
2. Accumulator Bot.
3. Digit AI Bot.

Each bot should have a details page with:

* Current status.
* Configuration.
* Start button.
* Pause button.
* Resume button.
* Stop button.
* Risk settings.
* Recent trades.
* Performance metrics.
* Error messages.
* Activity logs.

A bot must not start successfully unless the backend has verified that the required configuration and account connection are valid.

14.4 Trading activity

Provide:

* Open contracts.
* Completed contracts.
* Contract type.
* Market.
* Stake.
* Purchase price.
* Payout where applicable.
* Profit or loss.
* Entry time.
* Settlement time.
* Bot responsible for the trade.
* Strategy responsible for the signal.
* Contract identifier where available.
* Error or rejection information where relevant.

14.5 Trade history

Allow users to filter by:

* Date.
* Market.
* Bot.
* Contract type.
* Result.
* Demo or real account where supported.

Provide pagination or another scalable approach.

Do not retrieve an unlimited amount of history in a single request.

14.6 Performance

Display metrics supported by actual stored results, including:

* Total contracts.
* Wins.
* Losses.
* Net profit or loss.
* Win rate.
* Average result per contract.
* Performance by bot.
* Performance by strategy.
* Performance by market.
* Daily and monthly summaries.

Define the calculation of every metric.

A high historical win rate does not necessarily mean a profitable strategy.

Do not calculate performance from fabricated data.

Clearly distinguish historical results from projections.

14.7 Connected accounts

Provide:

* Connect Deriv.
* Connected account list.
* Account identifier.
* Account currency where available.
* Demo or real account designation where available.
* Connection status.
* Selected account.
* Last successful synchronization.
* Disconnect account.

Do not display private tokens.

14.8 Settings

Include:

* User profile.
* Security settings.
* Notification preferences.
* Trading defaults.
* Risk defaults.
* Subscription information.
* Connected-account management.

14.9 Notifications

Provide notifications for:

* Bot started.
* Bot paused.
* Bot stopped.
* Trade executed.
* Contract settled.
* Daily loss limit reached.
* Consecutive-loss limit reached.
* Account disconnected.
* Market-data connection lost.
* API errors.
* Subscription status changes.

Notifications should be generated from actual events.

⸻

15. DATABASE DESIGN

Use PostgreSQL for persistent data.

Design a normalized and maintainable schema.

Potential entities include:

* users
* user_sessions
* user_settings
* connected_accounts
* authorization_credentials or secure credential references
* bots
* bot_configurations
* strategies
* strategy_versions
* trading_signals
* trade_executions
* contracts
* contract_events
* trade_history
* risk_settings
* risk_events
* daily_risk_summaries
* notifications
* subscriptions
* subscription_events
* fee_rules
* fee_ledger
* revenue_adjustments
* audit_logs
* application_settings

These are proposed logical entities, not a requirement to create every table without evaluating the data model.

Choose appropriate foreign keys, indexes, constraints, and transaction boundaries.

Use migrations.

Do not store financial history only in frontend state.

Do not store every market tick permanently unless there is a clear reason and an appropriate retention policy.

Keep user data isolated.

Persist enough information to reconcile trading activity after a backend restart.

Use decimal-safe numeric types for financial values rather than ordinary floating-point arithmetic for financial calculations.

Store currency explicitly.

Use UTC timestamps internally where appropriate and convert them for display.

Define retention rules for operational logs and market data.

⸻

16. RECOMMENDED TECHNOLOGY STACK

Unless a concrete technical constraint requires a change, use the following stack.

Frontend

* Next.js.
* React.
* TypeScript.
* Tailwind CSS.
* A reusable component architecture.
* A suitable charting library.
* Proper client-side form validation.
* Accessible responsive navigation.

Backend

* Node.js.
* Express.
* TypeScript.
* A clearly organized module structure.
* Proper validation and error handling.
* Background workers or persistent worker processes for bot execution.

Database

* PostgreSQL.
* A suitable TypeScript-compatible ORM or database layer.
* Versioned database migrations.

Realtime communication

Use Deriv’s documented WebSocket APIs for supported live market data and trading operations.

Use an appropriate mechanism to send updates from the backend to the frontend.

Choose WebSockets or Server-Sent Events for the Quantara frontend based on the actual requirements.

Do not expose private Deriv credentials to the browser just to make realtime updates easier.

Testing

Use suitable testing tools for:

* Unit tests.
* API tests.
* Database tests.
* Strategy tests.
* Risk-control tests.
* Integration tests.
* Responsive UI tests.

Deployment

Design for a persistent backend deployment.

Do not assume a short-lived serverless request can run an automated trading loop indefinitely.

Use a hosting setup that supports long-running workers and persistent outbound connections as required.

Plan for:

* Secure environment variables.
* HTTPS.
* Database backups.
* Health checks.
* Application logs.
* Error monitoring.
* Database migrations.
* Reconnection.
* Graceful shutdown.
* Worker recovery.
* Production configuration.

⸻

17. PROJECT STRUCTURE

Create a clean project structure from scratch.

Use a monorepo or another clearly organized structure that allows the frontend, backend, and shared types to be developed together.

A possible starting structure is:

quantara/
frontend/
src/
app/
(auth)/
login/
register/
forgot-password/
(dashboard)/
dashboard/
markets/
bots/
signals/
positions/
trade-history/
connected-accounts/
notifications/
settings/
admin/
components/
layout/
dashboard/
bots/
trading/
charts/
signals/
forms/
ui/
hooks/
services/
types/
lib/
stores/
backend/
src/
server.ts
app.ts
config/
modules/
auth/
users/
deriv/
accounts/
markets/
trading/
strategies/
automation/
risk/
signals/
trades/
subscriptions/
revenue/
notifications/
admin/
middleware/
database/
schema/
migrations/
jobs/
workers/
utils/
tests/
shared/
types/
docs/
.env.example
.gitignore
README.md

You may adjust the structure when necessary, but preserve clear separation of responsibilities.

Do not create hundreds of empty files merely to imitate a large architecture.

Start with the minimum structure needed for the first stage, then expand it as features are implemented.

Keep secrets out of the repository.

The .env.example file should contain placeholder variable names, never real credentials.

⸻

18. SUBSCRIPTION AND REVENUE MODEL

Quantara is a commercial product.

The intended revenue model includes:

1. Subscription revenue.
2. Supported trading-related markup revenue where permitted.
3. Per-trade fees where explicitly supported, permitted, and properly configured.

These revenue streams must be implemented as separate components.

Do not assume that every Deriv contract supports markup or that a fee can automatically be deducted from every purchase.

Verify the actual capabilities of the current Deriv API, the relevant commercial arrangements, and the applicable rules before implementing any fee mechanism.

If a proposed fee mechanism is not supported, do not simulate it as though it were real revenue.

Explain the limitation and record the feature as unavailable until a legitimate implementation exists.

18.1 Subscriptions

Implement subscription records and entitlement checks.

The system should be able to determine:

* Whether a user has an active subscription.
* The subscription plan.
* The subscription start date.
* The subscription end date.
* The subscription status.
* The permitted product features.
* Renewal or cancellation status where supported by the selected billing system.

Do not assume that a payment has succeeded because the frontend says it succeeded.

Use verified payment-provider events and backend validation when a billing provider is integrated.

The payment provider has not yet been selected. Do not invent a payment gateway integration.

Design the subscription module so that a legitimate provider can be integrated later.

18.2 Trading-related fees

If the supported commercial model allows markup or per-trade fees, implement a configurable fee module.

A fee rule may need to include:

* Fee type.
* Rate or amount.
* Eligible accounts or products.
* Applicable contract types.
* Effective date.
* Currency.
* Fee status.
* Calculation method.
* Applicable restrictions.

Do not charge hidden fees.

Make customer-facing pricing and fee rules transparent.

Do not invent a fee merely because the application needs a revenue feature.

18.3 Revenue ledger

Record revenue using an auditable ledger.

Distinguish:

* Subscription revenue.
* Gross trading-related fees.
* Actual collected fees.
* Refunds.
* Reversals.
* Adjustments.
* Other expenses where included in reporting.
* Net revenue under a clearly defined accounting formula.

Every fee record must have an identifiable source event.

Avoid recording the same fee twice when an API response or webhook is repeated.

Use idempotent processing and appropriate database constraints.

18.4 Volume reporting

The admin dashboard should distinguish:

* User trading volume.
* Total platform contract count.
* Contract count by bot.
* Contract count by market.
* Trading volume by user.
* Trading volume by bot.
* Trading volume by period.
* Market volume, but only if actual market-volume data is available.
* Subscription revenue.
* Trading-related fee revenue.
* Total platform revenue.

Do not label Quantara’s own customer trading volume as total Deriv market volume.

Do not confuse stake turnover with profit.

Example:

If eligible trading volume is $100,000 and a legally permitted, correctly configured fee is 0.10%, the illustrative gross fee calculation is $100.

This is only a mathematical example. It does not establish that Deriv supports this fee, that the fee is permitted, or that the volume is eligible.

Do not encourage unnecessary trades simply to generate platform revenue.

The trading engine’s risk controls and strategy logic must remain independent of revenue targets.

⸻

19. ADMIN REPORTING

The owner admin dashboard should provide useful operational and commercial reports.

User reporting

* Registered users.
* Active users.
* Suspended users.
* Users with connected Deriv accounts.
* Users with active subscriptions.
* Users running bots.

Bot reporting

* Bots by type.
* Active bots.
* Paused bots.
* Stopped bots.
* Failed bots.
* Trades by bot.
* Historical strategy performance.
* Risk-limit events.
* Execution errors.

Trading reporting

* Total contracts.
* Total stake turnover where calculable.
* Total settled profit and loss where supported.
* Trades by market.
* Trades by strategy.
* Trades by user.
* Demo and real-account activity where available.
* Failed and rejected trade attempts.

Revenue reporting

* Subscription revenue.
* Trading-related fee revenue.
* Refunds and adjustments.
* Gross revenue.
* Net revenue under the defined formula.
* Revenue by period.
* Revenue by bot or strategy where attribution is reliable.

Use real persisted data.

Do not generate fabricated charts or random revenue numbers for the live application.

Seed data may be used in clearly identified development environments, but production must not display it as real activity.

⸻

20. RELIABILITY AND ERROR HANDLING

Trading systems must account for failures.

Implement appropriate handling for:

* WebSocket disconnections.
* Expired credentials.
* Authorization failures.
* API errors.
* Market closures.
* Unsupported contracts.
* Invalid proposals.
* Rejected purchases.
* Timeouts.
* Database failures.
* Duplicate messages.
* Delayed responses.
* Backend restarts.
* Worker crashes.
* Stale market data.

Do not silently swallow exceptions.

Provide meaningful logs without including secrets.

When a purchase outcome is uncertain, reconcile the account and contract state before attempting another purchase.

Do not assume a failed network response means the trade failed.

When a bot reconnects, it must restore its configuration, check its risk state, reconcile relevant open contracts, and only then resume according to its configured operating policy.

If the system cannot verify a critical condition, it should fail safely and stop opening new trades.

⸻

21. DEMO-FIRST TESTING

The first trading implementation must be tested with a Deriv demo account.

Do not enable real-money automated trading by default.

The application should clearly distinguish demo and real accounts.

Never mislabel a real account as demo or a demo account as real.

Before live trading is enabled, verify:

* Account authorization.
* Contract availability.
* Proposal generation.
* Purchase execution.
* Contract monitoring.
* Settlement processing.
* Balance updates.
* Trading history.
* Risk-limit enforcement.
* Duplicate-order prevention.
* Reconnection behavior.
* Backend restart recovery.
* User-data isolation.
* Admin authorization.
* Fee calculations where implemented.
* Mobile usability.

Test edge cases, not just successful purchases.

The system must not claim that a strategy is profitable because it passed a few test trades.

Where useful, implement historical backtesting, but clearly document the limitations of historical results and avoid treating backtests as a guarantee of future performance.

⸻

22. SECURITY REQUIREMENTS

Implement security throughout the application.

Required practices include:

* Server-side authorization.
* Secure session management.
* Password hashing.
* Input validation.
* Parameterized database queries or safe ORM operations.
* Rate limiting.
* CSRF protection where applicable.
* Appropriate CORS configuration.
* Secure cookies.
* HTTPS in production.
* Secret management.
* Protection against cross-user data access.
* Admin access control.
* Audit logging for sensitive actions.
* Safe error responses.
* Dependency management.
* Database backups.
* Token revocation and disconnect handling.
* Protection against duplicate financial operations.

Never put private credentials in frontend environment variables that are exposed to the browser.

Do not commit .env files containing secrets.

Do not create a hidden backdoor administrator account.

Do not allow ordinary users to change their role to admin through a request.

The only admin account must be established through a secure, documented setup process.

⸻

23. DEVELOPMENT WORKFLOW: READ THIS CAREFULLY

This section is mandatory.

I am not asking you to generate the entire Quantara application in one response.

I will create the project on my computer and copy and paste your code into individual files.

You must make this workflow easy and reliable.

Rule 1: Work in stages

Build one stage at a time.

Do not jump ahead to later features.

Do not create the trading engine before the project foundation and required supporting components exist.

Do not build every page with fake data merely to make the application look complete.

Rule 2: Provide exact file paths

Whenever you provide code, identify the exact file path.

For example:

File: frontend/src/app/page.tsx

Then provide the complete contents of that file when a full-file replacement is appropriate.

Use paths relative to the project root unless otherwise specified.

Rule 3: State whether to replace or modify

For every file, explicitly state whether I should:

* Create a new file.
* Replace the entire existing file.
* Modify a specified section of an existing file.

Do not leave this ambiguous.

Rule 4: One file at a time where practical

Keep the workflow manageable.

If several files are necessary for one feature, list them in the correct order and explain their dependencies.

Do not send a huge collection of unrelated files in one response.

Rule 5: Include commands

When a stage requires installation, setup, migration, or testing commands, provide the exact commands and explain where to run them.

Assume I am using Windows unless I tell you otherwise.

Commands should work in the stated terminal environment.

If a command differs between PowerShell and Git Bash, identify the appropriate version.

Rule 6: Test before continuing

After each meaningful stage, give me the exact tests to run.

Wait for me to provide the result when that result is needed to verify the next step.

Do not say that code compiles unless it has actually been compiled.

Do not say tests passed unless they have actually been run.

Do not claim an API integration works until it has been tested against the actual API or a clearly identified test environment.

Rule 7: Preserve working code

Before replacing an existing implementation, inspect the current file and determine what must be preserved.

Avoid unnecessary rewrites.

Do not overwrite working features merely to introduce a new feature.

If the change requires modifying several dependent files, explain the changes and their order.

Rule 8: No invented integrations

If an endpoint, permission, contract type, parameter, or commercial capability is unclear, consult the official documentation.

If the documentation does not establish that a capability exists, do not pretend it does.

Rule 9: Keep me informed

At the beginning of each stage, state:

* The stage name.
* The objective.
* The files expected to be created or changed.
* Any prerequisites.

At the end, state:

* What was implemented.
* What was actually tested.
* What remains incomplete.
* The exact next step.

Rule 10: Keep architecture consistent

Maintain a record of:

* Folder structure.
* Technology choices.
* Database schema.
* API contracts.
* Environment variables.
* Authentication design.
* Shared types.
* Implemented features.
* Outstanding tasks.
* Test results.
* Known limitations.

Update the project README or development notes as the project evolves.

Do not make contradictory architectural decisions across different stages.

⸻

24. IMPLEMENTATION ROADMAP

Use this roadmap in order.

The roadmap defines the intended sequence. Do not implement every stage immediately.

STAGE 1: PROJECT FOUNDATION

Objectives:

* Inspect the development environment.
* Confirm the installed Node.js, npm, and Git versions.
* Create the project directory.
* Initialize the frontend.
* Initialize the backend.
* Establish the TypeScript configuration.
* Configure the shared project structure.
* Set up environment-variable examples.
* Configure linting and basic tests.
* Establish the initial README.
* Confirm that the frontend and backend can start.

Do not implement live trading in this stage.

Acceptance criteria:

* The project structure exists.
* Dependencies install successfully.
* The frontend starts.
* The backend starts.
* Basic tests run.
* No secrets are committed.

STAGE 2: DATABASE AND AUTHENTICATION

Objectives:

* Configure PostgreSQL.
* Implement database migrations.
* Create user registration and login.
* Implement secure sessions.
* Add validation and authorization middleware.
* Establish user-data isolation.

Acceptance criteria:

* A user can register and log in.
* Invalid credentials are rejected.
* Protected routes require authentication.
* One user cannot access another user’s data.
* Database migrations run successfully.

STAGE 3: RESPONSIVE QUANTARA DASHBOARD

Objectives:

* Implement the brand design system.
* Create reusable UI components.
* Build the dashboard.
* Build responsive navigation.
* Build mobile bottom navigation.
* Build the desktop collapsible sidebar.
* Create the Markets, Bots, Signals, Activity, Accounts, and Settings pages.
* Use clearly identified development placeholders only where the backend is not yet implemented.

Acceptance criteria:

* The interface works on mobile, tablet, and desktop.
* No critical horizontal overflow occurs.
* Navigation works.
* Loading, error, and empty states exist.
* The design is consistent.

STAGE 4: OWNER ADMIN PANEL

Objectives:

* Establish the secure owner-admin setup.
* Implement backend role authorization.
* Build admin user management.
* Build system monitoring views.
* Build initial reporting interfaces.
* Add audit logging for sensitive administrative actions.

Acceptance criteria:

* Ordinary users cannot access admin APIs.
* Only the authorized owner administrator can access the admin panel.
* Administrative actions are validated and logged.

STAGE 5: DERIV AUTHORIZATION AND ACCOUNT CONNECTION

Objectives:

* Register and configure the required Deriv application.
* Implement the supported authorization flow.
* Implement the callback and token exchange.
* Establish the authenticated API connection.
* Retrieve available authorized accounts.
* Display connection status.
* Implement disconnect and reconnection handling.
* Secure the authorization credentials.

Acceptance criteria:

* The user can connect an authorized Deriv account.
* The backend can establish the required API connection.
* Account data is retrieved only through permitted operations.
* Private credentials are not exposed to the browser.
* Disconnect and error states work.

STAGE 6: MARKET DATA

Objectives:

* Retrieve available symbols.
* Retrieve supported contract types.
* Subscribe to real-time ticks.
* Retrieve historical tick data.
* Implement charts.
* Track market-data connection status.
* Implement stale-data detection.
* Implement reconnection behavior.

Acceptance criteria:

* The displayed prices come from real API responses.
* Supported markets and contracts are identified correctly.
* Stale data is not presented as live.
* Reconnection behavior is tested.

STAGE 7: LIVE SIGNALS

Objectives:

* Create the signal data model.
* Implement strategy-generated signals.
* Implement signal expiry.
* Implement signal statuses.
* Display signals on the dashboard.
* Distinguish informational signals from execution-ready signals.

Acceptance criteria:

* Signals are generated by actual strategy logic.
* Expired signals cannot be executed.
* Risk rejection is visible.
* No fabricated live signals are shown.

STAGE 8: SHARED TRADING ENGINE

Objectives:

* Implement proposal requests.
* Validate contract parameters.
* Implement purchase execution.
* Track open contracts.
* Record settlement.
* Implement error handling.
* Implement duplicate-order protection.
* Implement trade persistence.
* Implement reconciliation after failures.

Acceptance criteria:

* A valid demo-account purchase can be executed when the relevant contract is supported.
* Contract results are recorded correctly.
* Uncertain outcomes do not trigger blind duplicate purchases.
* API errors are handled safely.

STAGE 9: RISK MANAGEMENT

Objectives:

* Implement stake limits.
* Implement daily loss limits.
* Implement maximum trades per day.
* Implement consecutive-loss limits.
* Implement bot-level stop controls.
* Implement platform emergency stop.
* Persist risk state.
* Test all risk controls.

Acceptance criteria:

* Risk checks occur on the backend.
* Rejected trades are not executed.
* Risk limits persist across restarts.
* Existing contracts are distinguished from new trade entries.

STAGE 10: THE THREE BOTS

Implement these individually.

First:

Time Duration Bot.

Test it fully before proceeding.

Second:

Accumulator Bot.

Verify actual contract mechanics and supported controls before implementation.

Test it fully before proceeding.

Third:

Digit AI Bot.

Implement statistical analysis and fixed-stake rules.

Test it fully before proceeding.

Each bot must use the shared trading engine and risk controls.

Do not create three unrelated execution systems.

STAGE 11: TRADE HISTORY AND PERFORMANCE

Objectives:

* Implement contract history.
* Implement filtering and pagination.
* Calculate profit and loss.
* Calculate win rate.
* Display bot performance.
* Display strategy performance.
* Reconcile stored history with actual contract results where supported.

Acceptance criteria:

* Results are based on real stored data.
* Calculations are documented.
* Historical results are not presented as guaranteed future performance.

STAGE 12: SUBSCRIPTIONS AND REVENUE

Objectives:

* Implement subscription records.
* Integrate a legitimate payment provider after it is selected.
* Implement entitlement checks.
* Verify payment events.
* Implement supported fee calculations.
* Implement the revenue ledger.
* Implement admin revenue reports.
* Prevent duplicate fee records.

Acceptance criteria:

* Subscription status is validated on the backend.
* Revenue entries are traceable.
* Refunds and adjustments are handled.
* Unsupported Deriv fee mechanisms are not falsely represented as operational.

STAGE 13: SECURITY AND FULL TESTING

Objectives:

* Review authentication and authorization.
* Review secret storage.
* Test user-data isolation.
* Test admin permissions.
* Test trading failure scenarios.
* Test risk controls.
* Test database recovery.
* Test reconnection.
* Test mobile and desktop layouts.
* Test all supported demo-account flows.

Fix critical issues before deployment.

STAGE 14: DEPLOYMENT

Objectives:

* Configure production environment variables.
* Deploy the frontend.
* Deploy the persistent backend.
* Configure PostgreSQL.
* Configure HTTPS.
* Configure monitoring and logs.
* Configure backups.
* Configure health checks.
* Verify long-running workers.
* Verify recovery after restarts.
* Perform final demo-account tests.

Do not enable real-money trading by default.

⸻

25. FUTURE EXPANSION

Do not build these features in the initial version, but keep the architecture open to them:

* AI Market Assistant.
* Additional strategy modules.
* Strategy marketplace.
* Referral-based rewards.
* Additional analytics.
* Additional account integrations if supported and desired.
* More notification channels.
* Additional subscription tiers.

The AI Market Assistant is explicitly excluded from the initial build.

Do not spend time implementing it before the core trading platform is working.

⸻

26. ACCEPTANCE CRITERIA FOR THE FINISHED PRODUCT

Quantara should not be considered complete simply because the dashboard looks attractive.

The product must ultimately demonstrate the following:

1. Users can register and authenticate securely.
2. The owner administrator has protected administrative access.
3. Users can connect their authorized Deriv accounts.
4. Market data comes from documented Deriv API operations.
5. The platform identifies supported markets and contracts correctly.
6. The three bots have distinct strategy logic.
7. The bots use a common execution engine.
8. Risk limits are enforced on the backend.
9. Trade results are persisted and reconciled appropriately.
10. Live signals have accurate statuses and expiry behavior.
11. Trading history reflects actual results.
12. Financial calculations are accurate and clearly defined.
13. Revenue is recorded only when the corresponding fee or subscription event is real and valid.
14. The backend can continue authorized bot operation independently of the user’s browser.
15. Reconnection and restart behavior are tested.
16. User data is isolated.
17. Admin permissions are enforced on the backend.
18. The application is responsive on mobile, tablet, and desktop.
19. The interface does not depend on a paid AI API.
20. Demo-account testing is completed before any real-money deployment.
21. Documentation describes setup, configuration, testing, deployment, and known limitations.
22. No feature is claimed to work unless it has actually been implemented and tested.

⸻

27. YOUR FIRST RESPONSE TO THIS SPECIFICATION

Do not generate the application code yet.

First, acknowledge that you understand the complete Quantara vision.

Then provide a concise technical assessment covering:

1. The product architecture you recommend.
2. The recommended frontend, backend, database, and deployment arrangement.
3. The current Deriv API capabilities that are relevant to this product.
4. The authorization method and minimum necessary permissions that need to be verified.
5. Any important API restrictions that could affect the three bots.
6. Any assumptions that must be verified before implementation.
7. The exact scope of Stage 1.
8. The initial project structure.
9. The first files and commands needed to establish the foundation.

Consult the current official Deriv documentation before making claims about API capabilities.

Do not claim that Accumulator contracts, digit contracts, particular durations, contract exits, or fee mechanisms are supported without verifying the relevant documentation.

If a capability is unclear, explicitly identify it as unverified.

After the assessment, begin only Stage 1 when instructed.

Do not generate the entire application in one response.

Do not repeatedly ask the user to reconfirm requirements already stated in this specification.

Ask questions only when a genuinely necessary decision cannot be resolved from the available requirements or official documentation.

Keep the instructions practical because the user will create and edit files manually by copying and pasting the code you provide.

The objective is to build a real, maintainable, secure, responsive automated trading platform—not merely a visual prototype.