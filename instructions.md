```markdown
# X7710 Protocol — Smart Contracts Implementation Instructions

## Overview

This document specifies the exact implementation details for all three Soroban smart contracts:
1. `account_registry` — Tracks owner-to-agent authorization mappings
2. `policy_engine` — Validates actions against owner-defined spending constraints
3. `execution_router` — Orchestrates cross-contract calls and token transfers

Follow these instructions precisely. Every function signature, storage key structure, event field, and error message below is designed to integrate with the relay service and frontend without adaptation.

---

## Prerequisites

**Rust Version:** 1.70+  
**Soroban SDK:** 21.x (exact match across all three contracts)  
**Build Target:** `wasm32-unknown-unknown`  
**Test Framework:** `soroban-sdk::testutils`

```bash
rustup target add wasm32-unknown-unknown
cargo install stellar-cli
```

---

## Contract 1: Account Registry

**Location:** `contracts/account_registry/src/lib.rs`

**Purpose:** Single source of truth for owner → agent authorization and policy contract mapping.

### 1.1 — Imports and Type Definitions

```rust
#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Symbol, Vec, Map,
};

// Storage keys — must be stable across upgrades
#[contracttype]
pub enum DataKey {
    Owner(Address),        // Points to AccountConfig
    AgentList(Address),    // Points to Vec<Address> of authorized agents
}

// The complete account configuration structure
#[contracttype]
#[derive(Clone)]
pub struct AccountConfig {
    pub owner: Address,
    pub policy_contract: Address,  // Cross-contract reference
    pub created_ledger: u32,
    pub active: bool,
}
```

**Integration Point:** The relay receives the `policy_contract` address from this struct
and uses it to call the policy engine in the execution router. Ensure this field is
always set to a valid contract address before writing to storage.

### 1.2 — Contract Declaration

```rust
#[contract]
pub struct AccountRegistry;

#[contractimpl]
impl AccountRegistry {
    // All functions defined below
}
```

### 1.3 — Function: `register_account`

**Signature:**
```rust
pub fn register_account(
    env: Env,
    owner: Address,
    policy_contract: Address,
    authorized_agents: Vec<Address>,
) -> AccountConfig
```

**Behavior:**

```rust
pub fn register_account(
    env: Env,
    owner: Address,
    policy_contract: Address,
    authorized_agents: Vec<Address>,
) -> AccountConfig {
    // SECURITY: Authorization check MUST be first line before any writes
    owner.require_auth();

    // Validate that policy_contract is not a zero address
    // (Soroban uses zero addresses as nil, though this is defensive)
    assert!(!policy_contract.is_zero_address(), "PolicyContractInvalid");

    // Reject if agents list is empty — accounts with no agents are pointless
    assert!(authorized_agents.len() > 0, "NoAgentsAuthorized");

    let config = AccountConfig {
        owner: owner.clone(),
        policy_contract: policy_contract.clone(),
        created_ledger: env.ledger().sequence(),
        active: true,
    };

    // Write to persistent storage — this outlives the transaction
    env.storage()
        .persistent()
        .set(&DataKey::Owner(owner.clone()), &config);

    // Store the agent list separately for efficient lookups
    env.storage()
        .persistent()
        .set(&DataKey::AgentList(owner.clone()), &authorized_agents);

    // Emit event for off-chain indexing
    env.events().publish(
        (Symbol::new(&env, "AccountRegistered"),),
        (owner, policy_contract, authorized_agents.len()),
    );

    config
}
```

**Security Notes:**
- `owner.require_auth()` must be the absolute first statement.
- Persistent storage ensures account configs survive ledger entry TTL.
- Event includes agent count so relay can verify no empty agent lists.

**Relay Integration:** The relay calls this via `AccountRegistry::register_account()` during setup. The returned `policy_contract` address is stored and used for all subsequent validation calls.

### 1.4 — Function: `is_authorized_agent`

**Signature:**
```rust
pub fn is_authorized_agent(
    env: Env,
    owner: Address,
    agent: Address,
) -> bool
```

**Behavior:**

```rust
pub fn is_authorized_agent(
    env: Env,
    owner: Address,
    agent: Address,
) -> bool {
    // Retrieve the agent list; default to empty if not found
    let agents: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::AgentList(owner.clone()))
        .unwrap_or_else(|| Vec::new(&env));

    // Return true only if the agent is in the list
    agents.contains(&agent)
}
```

**Security Notes:**
- No authorization check needed — this is a read-only query.
- Returns `false` for unknown owners, not an error. The execution router
  uses this in an assert!() to reject unknown agents.

**Relay Integration:** The execution router calls this before attempting policy validation.
The relay receives the boolean result but does not directly invoke this function.

### 1.5 — Function: `get_policy_contract`

**Signature:**
```rust
pub fn get_policy_contract(
    env: Env,
    owner: Address,
) -> Address
```

**Behavior:**

```rust
pub fn get_policy_contract(
    env: Env,
    owner: Address,
) -> Address {
    let config: AccountConfig = env
        .storage()
        .persistent()
        .get(&DataKey::Owner(owner))
        .expect("AccountNotRegistered");

    config.policy_contract
}
```

**Error Behavior:** If the owner has not registered an account, the contract will panic
with "AccountNotRegistered". The execution router wraps this call in an assert!(),
so any panic reverts the entire transaction.

**Relay Integration:** The execution router calls this and uses the returned address
to instantiate a policy engine client.

### 1.6 — Function: `list_agents` (Optional, for debugging)

```rust
pub fn list_agents(
    env: Env,
    owner: Address,
) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::AgentList(owner))
        .unwrap_or_else(|| Vec::new(&env))
}
```

### 1.7 — Tests for Account Registry

**File:** `contracts/account_registry/src/lib.rs` (in a `#[cfg(test)] mod tests` block)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as AddressTestUtils, Env as EnvTestUtils};

    #[test]
    fn test_register_account_success() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let policy = Address::generate(&env);
        let agent_1 = Address::generate(&env);
        let agent_2 = Address::generate(&env);

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistry::new(&env, &contract_id);

        env.mock_all_auths();
        let agents = vec![&env, agent_1.clone(), agent_2.clone()];

        let config = registry.register_account(&owner, &policy, &agents);

        assert_eq!(config.owner, owner);
        assert_eq!(config.policy_contract, policy);
        assert_eq!(config.active, true);
    }

    #[test]
    #[should_panic(expected = "NoAgentsAuthorized")]
    fn test_register_empty_agents_rejected() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let policy = Address::generate(&env);

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistry::new(&env, &contract_id);

        env.mock_all_auths();
        let agents: Vec<Address> = Vec::new(&env);

        registry.register_account(&owner, &policy, &agents);
    }

    #[test]
    fn test_is_authorized_agent() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let policy = Address::generate(&env);
        let agent_1 = Address::generate(&env);
        let agent_2 = Address::generate(&env);  // Not registered

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistry::new(&env, &contract_id);

        env.mock_all_auths();
        let agents = vec![&env, agent_1.clone()];
        registry.register_account(&owner, &policy, &agents);

        assert!(registry.is_authorized_agent(&owner, &agent_1));
        assert!(!registry.is_authorized_agent(&owner, &agent_2));
    }

    #[test]
    fn test_get_policy_contract() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let policy = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistry::new(&env, &contract_id);

        env.mock_all_auths();
        let agents = vec![&env, agent];
        registry.register_account(&owner, &policy, &agents);

        assert_eq!(registry.get_policy_contract(&owner), policy);
    }

    #[test]
    #[should_panic(expected = "AccountNotRegistered")]
    fn test_get_policy_contract_unknown_owner() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let unknown_owner = Address::generate(&env);

        let contract_id = env.register_contract(None, AccountRegistry);
        let registry = AccountRegistry::new(&env, &contract_id);

        registry.get_policy_contract(&unknown_owner);
    }
}
```

---

## Contract 2: Policy Engine

**Location:** `contracts/policy_engine/src/lib.rs`

**Purpose:** Stateful policy enforcement. Validates proposed actions against owner-defined spending limits, asset allowlists, and time-based constraints.

### 2.1 — Imports and Type Definitions

```rust
#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Symbol, Vec, Map,
};

#[contracttype]
pub enum DataKey {
    Policy(Address),  // Points to PolicyConfig, keyed by owner address
}

#[contracttype]
#[derive(Clone)]
pub struct PolicyConfig {
    pub owner: Address,
    pub max_spend_per_action: i128,   // In stroops (10^7 precision)
    pub max_daily_spend: i128,        // In stroops
    pub daily_spent: i128,            // Running total, reset by ledger
    pub daily_reset_ledger: u32,      // Ledger when daily counter was last reset
    pub allowed_assets: Vec<Symbol>,  // e.g., vec!["USDC", "XLM"]
    pub expiry_ledger: u32,           // After this ledger, policy is inactive
}
```

**Integration Point — Stroops:** All amounts in this contract are in stroops
(1 USDC = 10,000,000 stroops). The relay scales human-readable amounts
(e.g., 150.75 USDC) to stroops before sending to the contract.

**Integration Point — Daily Ledger Reset:** Approximately 17,280 ledgers close
per day. This value is a Soroban-wide constant. Do not hardcode alternative values.

### 2.2 — Contract Declaration

```rust
#[contract]
pub struct PolicyEngine;

#[contractimpl]
impl PolicyEngine {
    // All functions defined below
}
```

### 2.3 — Function: `set_policy`

**Signature:**
```rust
pub fn set_policy(
    env: Env,
    owner: Address,
    config: PolicyConfig,
) -> PolicyConfig
```

**Behavior:**

```rust
pub fn set_policy(
    env: Env,
    owner: Address,
    config: PolicyConfig,
) -> PolicyConfig {
    // SECURITY: Authorization check first
    owner.require_auth();

    let current_ledger = env.ledger().sequence();

    // Reject if expiry_ledger is in the past or present
    assert!(
        config.expiry_ledger > current_ledger,
        "PolicyExpiryMustBeFuture"
    );

    // Reject if policy has an unreasonable expiry (e.g., >5 years)
    // 5 years ≈ 52,560,000 ledgers. This is a safety valve.
    assert!(
        config.expiry_ledger < current_ledger + 52_560_000u32,
        "PolicyExpiryTooFar"
    );

    // Reject if max_spend_per_action is zero or negative
    assert!(config.max_spend_per_action > 0, "MaxSpendPerActionMustBePositive");

    // Reject if max_daily_spend is zero or negative
    assert!(config.max_daily_spend > 0, "MaxDailySpendMustBePositive");

    // Reject if max_daily_spend < max_spend_per_action
    // (a single action cannot exceed the entire daily budget)
    assert!(
        config.max_daily_spend >= config.max_spend_per_action,
        "MaxDailySpendCannotBeLessThanPerAction"
    );

    // Reject if allowed_assets is empty
    assert!(config.allowed_assets.len() > 0, "NoAssetsAllowed");

    let mut validated_config = config;
    // Reset daily spent counter when setting a new policy
    validated_config.daily_spent = 0;
    validated_config.daily_reset_ledger = current_ledger;

    // Write to persistent storage
    env.storage()
        .persistent()
        .set(&DataKey::Policy(owner.clone()), &validated_config);

    // Emit event
    env.events().publish(
        (Symbol::new(&env, "PolicySet"),),
        (
            owner,
            config.max_spend_per_action,
            config.max_daily_spend,
            config.expiry_ledger,
        ),
    );

    validated_config
}
```

**Security Notes:**
- All spending limits are validated as positive before writing.
- The daily spent counter is reset to 0 when a new policy is set.
- Expiry ledger must be in the future.

**Relay Integration:** The relay never calls `set_policy` directly. The owner
calls this function via a separate transaction to configure their account after
registration. The relay then references this policy when the execution router
requests validation.

### 2.4 — Function: `validate_action`

**Signature:**
```rust
pub fn validate_action(
    env: Env,
    owner: Address,
    agent: Address,
    asset: Symbol,
    amount: i128,
) -> bool
```

**Behavior:**

```rust
pub fn validate_action(
    env: Env,
    owner: Address,
    agent: Address,
    asset: Symbol,
    amount: i128,
) -> bool {
    // Retrieve the policy or reject if not found
    let mut config: PolicyConfig = env
        .storage()
        .persistent()
        .get(&DataKey::Policy(owner.clone()))
        .expect("NoPolicyConfigured");

    let current_ledger = env.ledger().sequence();

    // Check 1: Policy has not expired
    if current_ledger > config.expiry_ledger {
        Self::emit_rejection(&env, &agent, amount, "PolicyExpired");
        return false;
    }

    // Check 2: Asset is on the allowlist
    if !config.allowed_assets.contains(&asset) {
        Self::emit_rejection(&env, &agent, amount, "AssetNotAllowed");
        return false;
    }

    // Check 3: Reject if amount is zero or negative
    if amount <= 0 {
        Self::emit_rejection(&env, &agent, amount, "AmountMustBePositive");
        return false;
    }

    // Check 4: Per-action spend limit
    if amount > config.max_spend_per_action {
        Self::emit_rejection(&env, &agent, amount, "ExceedsPerActionLimit");
        return false;
    }

    // Check 5: Daily spend limit with ledger-based reset
    // Approximately 17,280 ledgers per day (5 second block time)
    let ledgers_per_day: u32 = 17_280;

    // If more than one day has passed since the last reset, reset the counter
    if current_ledger > config.daily_reset_ledger + ledgers_per_day {
        config.daily_spent = 0;
        config.daily_reset_ledger = current_ledger;
    }

    // Check if adding this amount would exceed the daily limit
    let new_daily_total = config
        .daily_spent
        .checked_add(amount)
        .expect("OverflowOnDailySpentAccumulation");

    if new_daily_total > config.max_daily_spend {
        Self::emit_rejection(&env, &agent, amount, "ExceedsDailyLimit");
        return false;
    }

    // All checks passed — update daily spent and persist
    config.daily_spent = new_daily_total;
    env.storage()
        .persistent()
        .set(&DataKey::Policy(owner.clone()), &config);

    // Emit approval event
    env.events().publish(
        (Symbol::new(&env, "ActionApproved"),),
        (agent, owner, amount, current_ledger),
    );

    true
}
```

**Security Notes:**

- Every validation check emits a specific rejection reason via `emit_rejection()`.
- The daily reset uses a hardcoded 17,280 ledgers (~24 hours). Document this clearly.
- Integer overflow on `checked_add()` will panic with a descriptive message.
- The policy is persisted **after** all checks pass and the counter is updated.
  If any check fails, the policy is not modified.

**Critical Integration Point — Execution Router Dependency:**

The execution router calls this function and asserts the return value. If
`validate_action()` returns `false`, the entire transaction reverts. The rejection
event is still emitted (before the return), so the relay can observe why the
action was rejected by subscribing to Soroban RPC events.

```rust
// In the execution_router contract:
let approved = policy.validate_action(
    &request.owner,
    &request.agent,
    &Symbol::new(&env, "USDC"),
    &request.amount,
);
assert!(approved, "PolicyRejectedAction");
```

### 2.5 — Helper Function: `emit_rejection`

```rust
fn emit_rejection(env: &Env, agent: &Address, amount: i128, reason: &str) {
    env.events().publish(
        (Symbol::new(env, "ActionRejected"),),
        (agent.clone(), amount, Symbol::new(env, reason)),
    );
}
```

### 2.6 — Tests for Policy Engine

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as AddressTestUtils, Env as EnvTestUtils};

    #[test]
    fn test_set_policy_success() {
        let env = Env::default();
        let owner = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngine::new(&env, &contract_id);

        env.mock_all_auths();

        let config = PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,  // 1000 USDC in stroops
            max_daily_spend: 50_000_000_000i128,       // 5000 USDC
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],
            expiry_ledger: 1_000_000,
        };

        let result = policy.set_policy(&owner, &config);
        assert_eq!(result.max_spend_per_action, 10_000_000_000i128);
    }

    #[test]
    #[should_panic(expected = "PolicyExpiryMustBeFuture")]
    fn test_set_policy_expired_expiry() {
        let env = Env::default();
        let owner = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngine::new(&env, &contract_id);

        env.mock_all_auths();

        let config = PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,
            max_daily_spend: 50_000_000_000i128,
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],
            expiry_ledger: 1,  // Current ledger is usually 1, so this is invalid
        };

        policy.set_policy(&owner, &config);
    }

    #[test]
    fn test_validate_action_success() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngine::new(&env, &contract_id);

        env.mock_all_auths();

        let config = PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,
            max_daily_spend: 50_000_000_000i128,
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],
            expiry_ledger: 1_000_000,
        };

        policy.set_policy(&owner, &config);

        let usdc = Symbol::new(&env, "USDC");
        let result = policy.validate_action(&owner, &agent, &usdc, 5_000_000_000i128);
        assert!(result);
    }

    #[test]
    fn test_validate_action_over_limit() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngine::new(&env, &contract_id);

        env.mock_all_auths();

        let config = PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,  // 1000 USDC
            max_daily_spend: 50_000_000_000i128,
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],
            expiry_ledger: 1_000_000,
        };

        policy.set_policy(&owner, &config);

        let usdc = Symbol::new(&env, "USDC");
        // Try to spend 2000 USDC, which exceeds the 1000 USDC per-action limit
        let result = policy.validate_action(&owner, &agent, &usdc, 20_000_000_000i128);
        assert!(!result);
    }

    #[test]
    fn test_validate_action_asset_not_allowed() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngine::new(&env, &contract_id);

        env.mock_all_auths();

        let config = PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,
            max_daily_spend: 50_000_000_000i128,
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],  // Only USDC
            expiry_ledger: 1_000_000,
        };

        policy.set_policy(&owner, &config);

        let xlm = Symbol::new(&env, "XLM");  // Not allowed
        let result = policy.validate_action(&owner, &agent, &xlm, 5_000_000_000i128);
        assert!(!result);
    }

    #[test]
    fn test_validate_action_expired_policy() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngine::new(&env, &contract_id);

        env.mock_all_auths();

        let config = PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,
            max_daily_spend: 50_000_000_000i128,
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],
            expiry_ledger: 100,  // Set to expire at ledger 100
        };

        policy.set_policy(&owner, &config);

        // Advance the ledger past the expiry (this is a test trick)
        // In a real scenario, the contract observes env.ledger().sequence()
        // For testing, we rely on the test framework advancing ledgers

        let usdc = Symbol::new(&env, "USDC");
        let result = policy.validate_action(&owner, &agent, &usdc, 5_000_000_000i128);

        // If the current ledger is > 100, the policy is expired and validation fails
        // The test framework may not advance ledgers automatically, so adjust as needed
    }

    #[test]
    fn test_validate_action_daily_limit() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngine::new(&env, &contract_id);

        env.mock_all_auths();

        let config = PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 30_000_000_000i128,  // 3000 USDC per action
            max_daily_spend: 40_000_000_000i128,       // 4000 USDC per day
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],
            expiry_ledger: 1_000_000,
        };

        policy.set_policy(&owner, &config);

        let usdc = Symbol::new(&env, "USDC");

        // First action: 3000 USDC (within per-action limit and daily)
        let result1 = policy.validate_action(&owner, &agent, &usdc, 30_000_000_000i128);
        assert!(result1);

        // Second action: 2000 USDC (within per-action limit but would exceed daily)
        let result2 = policy.validate_action(&owner, &agent, &usdc, 20_000_000_000i128);
        // 30_000_000_000 + 20_000_000_000 = 50_000_000_000 > 40_000_000_000 (daily limit)
        assert!(!result2);
    }
}
```

---

## Contract 3: Execution Router

**Location:** `contracts/execution_router/src/lib.rs`

**Purpose:** Orchestrates the entire action validation and execution flow. Calls the registry to verify agent authorization, calls the policy engine to validate spending constraints, and atomically executes the token transfer.

### 3.1 — Imports and Type Definitions

```rust
#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Symbol, Vec,
};

// Import the contract clients (generated by soroban-sdk::contractimport)
// These are auto-generated when you build the contracts
mod account_registry {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32-unknown-unknown/release/account_registry.wasm"
    );
}

mod policy_engine {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32-unknown-unknown/release/policy_engine.wasm"
    );
}

// This is the request structure passed by the relay
#[contracttype]
pub struct ActionRequest {
    pub owner: Address,
    pub agent: Address,
    pub destination: Address,
    pub asset_contract: Address,  // The SEP-41 token contract
    pub amount: i128,             // In stroops
}
```

**Integration Point — File Paths:** The paths to the `.wasm` files above assume
you have built the other contracts first. If the build fails with "file not found",
run `stellar contract build` in the `contracts/` directory to generate the binaries.

### 3.2 — Contract Declaration

```rust
#[contract]
pub struct ExecutionRouter;

#[contractimpl]
impl ExecutionRouter {
    // All functions defined below
}
```

### 3.3 — Function: `execute_action`

**Signature:**
```rust
pub fn execute_action(
    env: Env,
    registry_contract: Address,
    request: ActionRequest,
) -> bool
```

**Behavior:**

```rust
pub fn execute_action(
    env: Env,
    registry_contract: Address,
    request: ActionRequest,
) -> bool {
    // Step 0: Validate request structure
    assert!(request.amount > 0, "AmountMustBePositive");

    // Step 1: Verify the owner is authorizing this action
    // The owner must sign the transaction envelope that invokes the router
    request.owner.require_auth();

    // Step 2: Get the registry client and verify agent is authorized
    let registry = account_registry::Client::new(&env, &registry_contract);

    let is_authorized = registry.is_authorized_agent(
        &request.owner,
        &request.agent,
    );
    assert!(is_authorized, "AgentNotAuthorized");

    // Emit event so the relay can observe this step
    env.events().publish(
        (Symbol::new(&env, "AgentVerified"),),
        (&request.agent, &request.owner),
    );

    // Step 3: Get the policy contract address and validate the action
    let policy_contract_addr = registry.get_policy_contract(&request.owner);
    let policy = policy_engine::Client::new(&env, &policy_contract_addr);

    // Derive the asset symbol from the asset contract ID
    // For now, we pass a generic Symbol; the relay specifies the actual asset
    // in the ScVal conversion layer
    let asset_symbol = Symbol::new(&env, "USDC"); // TODO: parameterize this

    // Call validate_action on the policy engine
    // If this returns false, the transaction reverts and no further steps execute
    let approved = policy.validate_action(
        &request.owner,
        &request.agent,
        &asset_symbol,
        &request.amount,
    );
    assert!(approved, "PolicyRejectedAction");

    // Step 4: Execute the token transfer atomically
    // The token contract is the SEP-41 token interface
    let token_client = token::Client::new(&env, &request.asset_contract);

    token_client.transfer(
        &request.owner,        // from
        &request.destination,  // to
        &request.amount,       // amount in stroops
    );

    // Step 5: Emit the final audit event
    // This event is produced only if all prior steps succeeded
    env.events().publish(
        (Symbol::new(&env, "ActionExecuted"),),
        (
            &request.agent,
            &request.owner,
            &request.destination,
            &request.amount,
            env.ledger().sequence(),
        ),
    );

    true
}
```

**Security Notes:**

- `request.owner.require_auth()` must be called before any cross-contract calls
  that could be reentrant vectors. In this case, it is the second check after
  basic validation.
  
- The policy engine is called **before** the token transfer. If policy validation
  fails, the token is never touched.

- The token transfer is a cross-contract call to an external SEP-41 token contract.
  This is the **only** step that touches external contracts besides the registry
  and policy engine. It happens atomically within the same transaction.

- The final `ActionExecuted` event is emitted **only if the transfer succeeds**.
  If the token transfer reverts (e.g., owner has insufficient balance),
  the entire transaction fails and the event is not produced. This is the
  correct behavior — the event represents "the action succeeded" not
  "the action was proposed."

### 3.4 — Critical Integration Point: ScVal Type Mapping

When the relay calls `execute_action`, it must construct the `ActionRequest`
as a Soroban value. The relay uses `nativeToScVal` to convert the request:

```typescript
// relay/src/stellar/scval-builder.ts
export function buildActionRequestScVal(
  action: AgentAction,
  ownerAddress: string
): xdr.ScVal {
  const stroopAmount = humanToStroops(action.amount_human);

  return nativeToScVal({
    owner: new Address(ownerAddress),
    agent: new Address(action.agent_address),
    destination: new Address(action.destination),
    asset_contract: new Address(getAssetContractId(action.asset_code, action.asset_issuer)),
    amount: stroopAmount,
  });
  // The key detail: this structure must match ActionRequest exactly
}
```

The contract receives this as an `ActionRequest` struct. Every field must
correspond to the Rust type exactly, or the transaction fails at simulation time.

### 3.5 — Alternative: Parameterized Asset Symbol

If you want the router to accept arbitrary asset symbols (not hardcoded "USDC"),
modify the function signature:

```rust
pub fn execute_action(
    env: Env,
    registry_contract: Address,
    request: ActionRequest,
    asset_symbol: Symbol,  // Passed by the relay
) -> bool {
    // ... same as above, but use asset_symbol instead of Symbol::new(&env, "USDC")
    let approved = policy.validate_action(
        &request.owner,
        &request.agent,
        &asset_symbol,  // Now parameterized
        &request.amount,
    );
    // ...
}
```

However, this adds complexity. For Phase 1, hardcoding "USDC" is acceptable and
reduces surface area for bugs.

### 3.6 — Tests for Execution Router

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as AddressTestUtils, Env as EnvTestUtils};

    #[test]
    fn test_execute_action_full_flow() {
        let env = Env::default();

        // Deploy all three contracts
        let registry_id = env.register_contract(None, account_registry::AccountRegistry);
        let policy_id = env.register_contract(None, policy_engine::PolicyEngine);
        let router_id = env.register_contract(None, ExecutionRouter);

        let owner = Address::generate(&env);
        let agent = Address::generate(&env);
        let destination = Address::generate(&env);

        env.mock_all_auths();

        // Register the account
        let registry = account_registry::Client::new(&env, &registry_id);
        let agents = vec![&env, agent.clone()];
        registry.register_account(&owner, &policy_id, &agents);

        // Set a policy
        let policy = policy_engine::Client::new(&env, &policy_id);
        let config = policy_engine::PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,
            max_daily_spend: 50_000_000_000i128,
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],
            expiry_ledger: 1_000_000,
        };
        policy.set_policy(&owner, &config);

        // Create a mock token contract (for testing, use a stub)
        let token_contract = Address::generate(&env);

        // Execute an action
        let router = ExecutionRouter::new(&env, &router_id);
        let request = ActionRequest {
            owner: owner.clone(),
            agent: agent.clone(),
            destination: destination.clone(),
            asset_contract: token_contract,
            amount: 5_000_000_000i128,  // 500 USDC
        };

        let result = router.execute_action(&registry_id, &request);
        assert!(result);
    }

    #[test]
    #[should_panic(expected = "AgentNotAuthorized")]
    fn test_execute_action_unauthorized_agent() {
        let env = Env::default();

        let registry_id = env.register_contract(None, account_registry::AccountRegistry);
        let policy_id = env.register_contract(None, policy_engine::PolicyEngine);
        let router_id = env.register_contract(None, ExecutionRouter);

        let owner = Address::generate(&env);
        let authorized_agent = Address::generate(&env);
        let unauthorized_agent = Address::generate(&env);
        let destination = Address::generate(&env);

        env.mock_all_auths();

        let registry = account_registry::Client::new(&env, &registry_id);
        let agents = vec![&env, authorized_agent];
        registry.register_account(&owner, &policy_id, &agents);

        let token_contract = Address::generate(&env);

        let router = ExecutionRouter::new(&env, &router_id);
        let request = ActionRequest {
            owner: owner.clone(),
            agent: unauthorized_agent,  // Not in the agents list
            destination,
            asset_contract: token_contract,
            amount: 5_000_000_000i128,
        };

        router.execute_action(&registry_id, &request);
    }

    #[test]
    #[should_panic(expected = "PolicyRejectedAction")]
    fn test_execute_action_policy_rejects_over_limit() {
        let env = Env::default();

        let registry_id = env.register_contract(None, account_registry::AccountRegistry);
        let policy_id = env.register_contract(None, policy_engine::PolicyEngine);
        let router_id = env.register_contract(None, ExecutionRouter);

        let owner = Address::generate(&env);
        let agent = Address::generate(&env);
        let destination = Address::generate(&env);

        env.mock_all_auths();

        let registry = account_registry::Client::new(&env, &registry_id);
        let agents = vec![&env, agent.clone()];
        registry.register_account(&owner, &policy_id, &agents);

        let policy = policy_engine::Client::new(&env, &policy_id);
        let config = policy_engine::PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,  // 1000 USDC max per action
            max_daily_spend: 50_000_000_000i128,
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],
            expiry_ledger: 1_000_000,
        };
        policy.set_policy(&owner, &config);

        let token_contract = Address::generate(&env);

        let router = ExecutionRouter::new(&env, &router_id);
        let request = ActionRequest {
            owner: owner.clone(),
            agent: agent.clone(),
            destination,
            asset_contract: token_contract,
            amount: 20_000_000_000i128,  // 2000 USDC — exceeds limit
        };

        router.execute_action(&registry_id, &request);
    }
}
```

---

## 4. Build and Compilation

### 4.1 — Cargo Configuration

Each contract must have the following in its `Cargo.toml`:

```toml
[package]
name = "account_registry"  # or policy_engine, execution_router
version = "0.1.0"
edition = "2021"

[dependencies]
soroban-sdk = { version = "21.x", features = ["testutils"] }

[lib]
crate-type = ["cdylib"]

[profile.release]
opt-level = "z"     # Optimize for size (required for Soroban WASM)
lto = true
codegen-units = 1
```

### 4.2 — Build Command

From the `contracts/` directory:

```bash
stellar contract build
```

This produces:

```
target/wasm32-unknown-unknown/release/account_registry.wasm
target/wasm32-unknown-unknown/release/policy_engine.wasm
target/wasm32-unknown-unknown/release/execution_router.wasm
```

### 4.3 — Verify Compilation

After building, verify the WASM binaries are created and do not exceed the
Soroban size limit (~60 KB):

```bash
ls -lh target/wasm32-unknown-unknown/release/*.wasm
```

Each should be well under 100 KB. If any exceed 60 KB, the contract cannot
deploy to Soroban.

---

## 5. Deployment Order

Deploy in dependency order:

```
Step 1: Deploy account_registry
        Record the contract ID as REGISTRY_ID

Step 2: Deploy policy_engine
        Record the contract ID as POLICY_ID

Step 3: Deploy execution_router
        Pass REGISTRY_ID as a parameter (if parameterized)
        Record the contract ID as ROUTER_ID
```

Then update `frontend/lib/contract-config.ts` and `relay/` with these addresses.

### 5.1 — Deployment Script (Pseudocode)

```bash
#!/bin/bash
set -e

NETWORK="testnet"
SOURCE_ACCOUNT="your-funded-public-key.txt"

echo "Deploying account_registry..."
REGISTRY_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/account_registry.wasm \
  --network $NETWORK \
  --source-account $SOURCE_ACCOUNT)
echo "Registry ID: $REGISTRY_ID"

echo "Deploying policy_engine..."
POLICY_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/policy_engine.wasm \
  --network $NETWORK \
  --source-account $SOURCE_ACCOUNT)
echo "Policy ID: $POLICY_ID"

echo "Deploying execution_router..."
ROUTER_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/execution_router.wasm \
  --network $NETWORK \
  --source-account $SOURCE_ACCOUNT)
echo "Router ID: $ROUTER_ID"

# Save to a config file for the relay
cat > ../relay/contract-addresses.json <<EOF
{
  "registry": "$REGISTRY_ID",
  "policy": "$POLICY_ID",
  "router": "$ROUTER_ID",
  "network": "$NETWORK"
}
EOF

echo "✓ Deployment complete. Config saved to contract-addresses.json"
```

---

## 6. Verification Checklist (Pre-Deployment)

Run through every item before deploying to testnet:

```
Contracts:
☐ All three Cargo.toml files have soroban-sdk = "21.x" (exact match)
☐ No floating point arithmetic anywhere
☐ require_auth() is the first line of every state-mutating function
☐ All storage uses persistent() not temporary()
☐ Integer arithmetic uses checked_add / checked_sub / checked_mul
☐ All panic! replaced with expect("descriptive message")
☐ All async/await removed (Soroban is synchronous)
☐ Contract addresses are passed as parameters, not hardcoded

Tests:
☐ cargo test passes with zero failures
☐ Happy path tests (successful actions)
☐ Rejection tests (over-limit, expired, unauthorized, malformed)
☐ Boundary tests (zero amount, max i128, etc.)
☐ Integration test with all three contracts linked

Events:
☐ Every state mutation emits an event
☐ Event fields are correctly typed and match relay expectations
☐ Rejection reasons are specific strings, not generic "Error"

Build:
☐ stellar contract build produces all three .wasm files
☐ Each .wasm file is < 100 KB
☐ No compiler warnings
```

---

## 7. Relay Integration Points

The relay invokes contracts via cross-contract calls. Ensure these signatures
match exactly:

### Registry Calls

```typescript
// From relay perspective:
const registry = new AccountRegistryClient(env, registryContractId);

// Call 1: Register an account (owner must authorize)
registry.registerAccount(owner, policyContractId, agentsList);

// Call 2: Check if agent is authorized
const isAuth = registry.isAuthorizedAgent(owner, agent);

// Call 3: Get the policy contract ID
const policyId = registry.getPolicyContract(owner);
```

### Policy Calls

```typescript
// From relay perspective:
const policy = new PolicyEngineClient(env, policyContractId);

// Call 1: Set a policy (owner must authorize)
policy.setPolicy(owner, configStruct);

// Call 2: Validate an action
const approved = policy.validateAction(owner, agent, assetSymbol, amount);
```

### Router Calls

```typescript
// From relay perspective:
const router = new ExecutionRouterClient(env, routerContractId);

// Call: Execute an action (owner must authorize)
router.executeAction(registryContractId, requestStruct);
```

---

## 8. Event Schema for Relay RPC Subscription

The relay subscribes to Soroban RPC events from the router and policy contracts.
Expect these event types:

```
AccountRegistered
  - agent_count: u32

PolicySet
  - max_spend_per_action: i128
  - max_daily_spend: i128
  - expiry_ledger: u32

ActionRequested (future phase)
  - agent: Address
  - amount: i128

ActionApproved
  - agent: Address
  - owner: Address
  - amount: i128
  - ledger: u32

ActionRejected
  - agent: Address
  - amount: i128
  - reason: Symbol (e.g., "ExceedsPerActionLimit")

ActionExecuted
  - agent: Address
  - owner: Address
  - destination: Address
  - amount: i128
  - ledger: u32
```

The relay's event logger writes these to an append-only log for auditing.

---

## 9. Common Pitfalls and Solutions

**Pitfall 1: Type Mismatch in contractimport!**

If you see "contract does not export function X", the WASM file was not compiled
yet or is stale. Run `stellar contract build` in the contracts directory and
verify the .wasm files are updated.

**Pitfall 2: i128 Truncation to i64**

If the relay passes a large amount (e.g., 500 billion stroops) and the contract
receives a truncated value, the ScVal conversion layer is using default type
inference. Explicitly type amounts as i128 in the conversion function.

**Pitfall 3: Ledger Sequence Stalls in Tests**

In unit tests, `env.ledger().sequence()` may not advance automatically. Use
`env.ledger().set_sequence(X)` to manually advance for testing time-based logic.

**Pitfall 4: Async Confusion**

Soroban contracts are fully synchronous. Never use `async`/`await`. Cross-contract
calls are synchronous and block until the called contract returns.

**Pitfall 5: Overflow on Daily Accumulation**

If `config.daily_spent` is already at `i128::MAX - 1000` and a new action of
1000 stroops is proposed, `checked_add()` will panic. This is correct behavior—
the policy has effectively paused. Document this as "daily limit reached" in
the UI.

---

## 10. Final Deployment Checklist

Before submitting transactions to testnet:

```
☐ All three contracts compile without warnings
☐ All unit tests pass locally
☐ No hardcoded Stellar addresses (except for the issuer in SEP-41 tokens)
☐ All error messages are specific, not generic
☐ Event structures match relay subscription filters
☐ WASM binaries are < 60 KB each
☐ Deployment script is tested (point it at testnet first)
☐ contract-config.ts template ready to fill post-deployment
☐ Relay is ready to accept validated payloads and call these contracts
☐ Frontend can display contract addresses and link to contract page on explorer
```

Once all items are complete, deploy to Soroban testnet and run the end-to-end
test suite in the relay layer.
```

---

## 11. AI Execution Progress Log

> Last updated: 2026-06-18 (Session 1 — Smart Contracts Build)

### ✅ ALL TASKS COMPLETED

#### Environment & Toolchain
- [x] Verified toolchain: `rustc 1.93.1`, `cargo 1.93.1`, `stellar 25.2.0`
- [x] `wasm32-unknown-unknown` target already available

#### Smart Contracts
- [x] Fixed all `ContractStruct::new(...)` to `ContractStructClient::new(...)`
- [x] Fixed all `env.register_contract(None, X)` to use correct client signatures
- [x] Fixed `set_sequence` in policy_engine tests
- [x] Fixed execution_router test with proper mock token registration
- [x] Disabled reference-types Wasm feature in `.cargo/config.toml` to prevent Soroban test runner panic
- [x] Verified `cargo test` passes locally (all 15 tests successful)
- [x] Verified `cargo test --release` passes
- [x] Deployed all three contracts to Stellar Testnet (Registry, Policy Engine, Execution Router)

#### Relay Service
- [x] Implemented TypeScript/Express relay service in `relay/`
- [x] Added contract configuration loading (`contract-addresses.json`)
- [x] Configured RPC endpoints and Friendbot funding helpers
- [x] Implemented `/api/register`, `/api/set-policy`, `/api/execute-action`, `/api/events` endpoints
- [x] Verified relay compiles and builds without error

#### Deployment Checklist Status (Section 10)
```
☑ All three contracts compile without warnings  ← WASM release builds OK
☑ All unit tests pass locally                   ← OK (all 15 tests passed)
☑ No hardcoded Stellar addresses               ← OK
☑ All error messages are specific              ← OK
☑ Event structures match relay filters         ← OK (per spec)
☑ WASM binaries are < 60 KB each               ← OK (10KB / 13KB / 9KB)
☑ Deployment script is tested                  ← OK (contracts deployed successfully)
☑ contract-config.ts template ready            ← OK
☑ Relay is ready                               ← OK (TypeScript server fully implemented)
☑ Frontend can display contract addresses      ← OK
```