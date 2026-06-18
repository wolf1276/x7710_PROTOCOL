#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Symbol, Vec,
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

#[contract]
pub struct PolicyEngine;

#[contractimpl]
impl PolicyEngine {
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
                validated_config.max_spend_per_action,
                validated_config.max_daily_spend,
                validated_config.expiry_ledger,
            ),
        );

        validated_config
    }

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

    fn emit_rejection(env: &Env, agent: &Address, amount: i128, reason: &str) {
        env.events().publish(
            (Symbol::new(env, "ActionRejected"),),
            (agent.clone(), amount, Symbol::new(env, reason)),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{vec, testutils::{Address as AddressTestUtils, Ledger as LedgerTestUtils}};

    #[test]
    fn test_set_policy_success() {
        let env = Env::default();
        let owner = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngineClient::new(&env, &contract_id);

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
        let policy = PolicyEngineClient::new(&env, &contract_id);

        env.mock_all_auths();

        let config = PolicyConfig {
            owner: owner.clone(),
            max_spend_per_action: 10_000_000_000i128,
            max_daily_spend: 50_000_000_000i128,
            daily_spent: 0,
            daily_reset_ledger: 0,
            allowed_assets: vec![&env, Symbol::new(&env, "USDC")],
            expiry_ledger: 0,  // Ledger sequence starts at 1 usually, so 0 is in the past/present
        };

        policy.set_policy(&owner, &config);
    }

    #[test]
    fn test_validate_action_success() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngineClient::new(&env, &contract_id);

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
        let result = policy.validate_action(&owner, &agent, &usdc, &5_000_000_000i128);
        assert!(result);
    }

    #[test]
    fn test_validate_action_over_limit() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngineClient::new(&env, &contract_id);

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
        let result = policy.validate_action(&owner, &agent, &usdc, &20_000_000_000i128);
        assert!(!result);
    }

    #[test]
    fn test_validate_action_asset_not_allowed() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngineClient::new(&env, &contract_id);

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
        let result = policy.validate_action(&owner, &agent, &xlm, &5_000_000_000i128);
        assert!(!result);
    }

    #[test]
    fn test_validate_action_expired_policy() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngineClient::new(&env, &contract_id);

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

        // Advance the ledger sequence past the expiry (to 101)
        env.ledger().set_sequence_number(101);

        let usdc = Symbol::new(&env, "USDC");
        let result = policy.validate_action(&owner, &agent, &usdc, &5_000_000_000i128);
        assert!(!result);
    }

    #[test]
    fn test_validate_action_daily_limit() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);

        let contract_id = env.register_contract(None, PolicyEngine);
        let policy = PolicyEngineClient::new(&env, &contract_id);

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
        let result1 = policy.validate_action(&owner, &agent, &usdc, &30_000_000_000i128);
        assert!(result1);

        // Second action: 2000 USDC (within per-action limit but would exceed daily)
        let result2 = policy.validate_action(&owner, &agent, &usdc, &20_000_000_000i128);
        // 30_000_000_000 + 20_000_000_000 = 50_000_000_000 > 40_000_000_000 (daily limit)
        assert!(!result2);
    }
}
